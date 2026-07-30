import { defineConfig, devices } from '@playwright/test';
import { PERSONAS } from './tests/e2e/config';

/**
 * Playwright E2E configuration.
 *
 * Runs the production build via `vite preview` and drives it in real browsers.
 * The three role personas (employee / manager / admin) run as separate projects
 * so they execute in parallel. A global setup provisions their Firebase Auth
 * accounts, and the preview build enables the E2E role allow-list.
 *
 * The app specs run across every engine in E2E_BROWSERS (default: all three).
 * The role specs stay on Chromium — see ROLE_ENGINE below.
 */
const PORT = Number(process.env.E2E_PORT ?? 4173);

// Route the browser's outbound HTTPS (Firebase) through the sandbox proxy while
// the local preview server bypasses it. No-op when HTTPS_PROXY is unset.
const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
const proxy = proxyServer
  ? { server: proxyServer, bypass: 'localhost,127.0.0.1,::1' }
  : undefined;

// Chrome command-line switches. Firefox and WebKit reject unknown argv and fail
// to launch, so these must only ever reach Chromium.
const chromiumProxyArgs = proxy
  ? ['--ssl-version-max=tls1.2', '--disable-quic', '--disable-features=EncryptedClientHello']
  : [];

type Engine = 'chromium' | 'firefox' | 'webkit';

const DEVICE: Record<Engine, (typeof devices)[string]> = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
};

/** Engines the app specs run on. Override with E2E_BROWSERS=chromium,webkit. */
const ENGINES: Engine[] = (process.env.E2E_BROWSERS ?? 'chromium,firefox,webkit')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    if (!(s in DEVICE)) throw new Error(`Unknown browser in E2E_BROWSERS: ${s}`);
    return s as Engine;
  });

/**
 * The role specs sign in through real Firebase Auth and are the only specs that
 * provision accounts, so running them once per engine triples live auth traffic
 * for no extra coverage — access control is app logic, not engine behaviour.
 */
const ROLE_ENGINE: Engine = 'chromium';

const baseUse = {
  baseURL: `http://localhost:${PORT}`,
  proxy,
  ignoreHTTPSErrors: Boolean(proxy),
  trace: 'retain-on-failure' as const,
  screenshot: 'only-on-failure' as const,
};

function useFor(engine: Engine) {
  return {
    ...baseUse,
    ...DEVICE[engine],
    // PW_CHROMIUM_PATH points at a prebuilt sandbox Chromium; it is meaningless
    // for the other engines, which use their own downloaded builds.
    launchOptions:
      engine === 'chromium'
        ? { executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: chromiumProxyArgs }
        : {},
  };
}

const APP_SPECS = /(smoke|interactions|persistence|attendance|regularizations|check-in-out)\.spec\.ts$/;
// Specs that assert per-persona access control, run once per role project.
// documents.spec.ts belongs here rather than with the app specs: what it checks
// is which controls a given role is offered, which is meaningless without a
// persona and identical across browser engines.
const ROLE_SPECS = /(roles|documents)\.spec\.ts$/;

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  projects: [
    // Chromium keeps the bare name `app` so existing --project=app still works.
    ...ENGINES.map((engine) => ({
      name: engine === 'chromium' ? 'app' : `app-${engine}`,
      testMatch: APP_SPECS,
      use: useFor(engine),
    })),
    {
      name: 'role-employee',
      testMatch: ROLE_SPECS,
      metadata: { persona: PERSONAS.employee },
      use: useFor(ROLE_ENGINE),
    },
    {
      name: 'role-manager',
      testMatch: ROLE_SPECS,
      metadata: { persona: PERSONAS.manager },
      use: useFor(ROLE_ENGINE),
    },
    {
      name: 'role-admin',
      testMatch: ROLE_SPECS,
      metadata: { persona: PERSONAS.admin },
      use: useFor(ROLE_ENGINE),
    },
  ],
  webServer: {
    // Build with the E2E role allow-list enabled, then serve the production
    // bundle. Never reuse a stale server so the correct build is always served.
    command: `VITE_ENABLE_E2E_ACCOUNTS=true npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
