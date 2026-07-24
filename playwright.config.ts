import { defineConfig, devices } from '@playwright/test';
import { PERSONAS, OFFICE_GEO } from './tests/e2e/config';

/**
 * Playwright E2E configuration.
 *
 * Runs the production build via `vite preview` and drives it in real Chromium.
 * The three role personas (employee / manager / admin) run as separate projects
 * so they execute in parallel. A global setup provisions their Firebase Auth
 * accounts, and the preview build enables the E2E role allow-list.
 */
const PORT = Number(process.env.E2E_PORT ?? 4173);

// Route the browser's outbound HTTPS (Firebase) through the sandbox proxy while
// the local preview server bypasses it. No-op when HTTPS_PROXY is unset.
const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
const proxy = proxyServer
  ? { server: proxyServer, bypass: 'localhost,127.0.0.1,::1' }
  : undefined;

const proxyArgs = proxy
  ? ['--ssl-version-max=tls1.2', '--disable-quic', '--disable-features=EncryptedClientHello']
  : [];

const commonUse = {
  baseURL: `http://localhost:${PORT}`,
  proxy,
  ignoreHTTPSErrors: Boolean(proxy),
  trace: 'retain-on-failure' as const,
  screenshot: 'only-on-failure' as const,
  // Location-based attendance needs geolocation; default to the office.
  permissions: ['geolocation'],
  geolocation: OFFICE_GEO,
  ...devices['Desktop Chrome'],
  launchOptions: {
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    args: proxyArgs,
  },
};

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
    {
      name: 'app',
      testMatch: /(smoke|interactions|geo-attendance)\.spec\.ts$/,
      use: commonUse,
    },
    {
      name: 'role-employee',
      testMatch: /roles\.spec\.ts$/,
      metadata: { persona: PERSONAS.employee },
      use: commonUse,
    },
    {
      name: 'role-manager',
      testMatch: /roles\.spec\.ts$/,
      metadata: { persona: PERSONAS.manager },
      use: commonUse,
    },
    {
      name: 'role-admin',
      testMatch: /roles\.spec\.ts$/,
      metadata: { persona: PERSONAS.admin },
      use: commonUse,
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
