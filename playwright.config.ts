import { defineConfig, devices } from '@playwright/test';
import { PERSONAS, SUPER_ADMIN } from './tests/e2e/config';

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

const APP_SPECS = /(smoke|interactions|persistence|attendance|regularizations|check-in-out|provisioning|password-reset|no-auto-signin|leave-balance|payslip-upload|document-upload-access)\.spec\.ts$/;

/**
 * Specs that write the organisation's *shared* configuration document.
 *
 * These should not run once per engine, for two reasons.
 *
 * `org_settings/default__leavePolicies` holds the whole policy list in one
 * field, so every save is a whole-document write: three engines running this
 * spec concurrently are three writers doing read-modify-write on one array,
 * and the last one wins.
 *
 * And it triples the traffic against a live Firebase project that has a daily
 * quota. A full three-engine matrix failed this spec on all three engines with
 * "the delete never reached the organisation's Firestore copy", and a plain
 * REST GET of the document straight afterwards answered
 * `429 RESOURCE_EXHAUSTED` — so the publishes were being refused for quota,
 * not (or not only) losing a race. Either way the spec belongs on one engine.
 *
 * Running once is not a loss of coverage: what this spec asserts is server
 * behaviour — that configuration outlives the browser it was written in — which
 * is identical across engines, the same argument that keeps ROLE_SPECS on one
 * engine.
 */
const SHARED_CONFIG_SPECS = /(org-settings|salary-structure)\.spec\.ts$/;

/**
 * …and org-isolation is a third writer that has to run after, not alongside.
 *
 * `fullyParallel` parallelises across *files*, so putting this in the project
 * above only kept it off the other engines — inside the project it still ran in
 * its own worker at the same time as the other two. It asserts that the default
 * organisation's salary structure is the demo split, which is exactly the
 * document salary-structure.spec.ts spends its run changing and restores only in
 * its afterAll. The two therefore contradicted each other on timing alone, and
 * the failure looked like a tenant leak, which is the one thing this spec exists
 * to detect.
 *
 * Playwright has no per-project worker count, so the ordering is expressed as a
 * dependency: this project starts once the other has finished and put the demo
 * split back.
 */
const ORG_ISOLATION_SPECS = /org-isolation\.spec\.ts$/;

/**
 * …and they do not run against the live project by default.
 *
 * Every run of this spec adds leave policies to the organisation's real
 * configuration and deletes them again afterwards. When the afterAll cannot
 * complete — a Ctrl-C, a refused sign-in, an exhausted quota — the fakes stay,
 * and an administrator opens Settings to find "E2E Isolation Leave 1785742888407"
 * offered to every employee. That happened twice in one day.
 *
 * So the project only exists when the run is pointed at an emulator
 * (`E2E_FIRESTORE_EMULATOR`, which is what `npm run test:e2e:emulator` sets), or
 * when someone deliberately opts into the live project with
 * `E2E_ORG_SETTINGS_LIVE=true`. A plain `npm run test:e2e` cannot dirty the real
 * organisation, because the spec is not in it.
 */
/**
 * Firestore is emulated by default. Reaching the live project is opt-in.
 *
 * A live run writes to the organisation's real data, and the day this default
 * changed it had already cost a day: a full matrix run exhausted the project's
 * daily quota, which then blocked the app itself and stranded four fake leave
 * policies in the organisation's configuration where every employee could see
 * them — un-removable precisely because the quota was gone.
 *
 * So `E2E_FIRESTORE_EMULATOR` defaults to 127.0.0.1:8080 rather than being
 * absent, and `E2E_LIVE_FIRESTORE=true` is the deliberate escape hatch for the
 * one thing an emulator cannot check: that the *deployed* ruleset behaves. The
 * emulator must be running (`firebase emulators:start`, or
 * `npm run test:e2e:emulator` which starts its own).
 *
 * Auth is emulated on the same terms, so a default run reaches no live Google
 * service at all — the accounts, uids and tokens are the emulator's.
 */
const FIRESTORE_EMULATOR =
  process.env.E2E_LIVE_FIRESTORE === 'true'
    ? ''
    : process.env.E2E_FIRESTORE_EMULATOR ?? '127.0.0.1:8080';
const AUTH_EMULATOR =
  process.env.E2E_LIVE_FIRESTORE === 'true'
    ? ''
    : process.env.E2E_AUTH_EMULATOR ?? '127.0.0.1:9099';
// Re-exported so the specs' REST helpers (tests/e2e/firestore.ts) and
// global-setup resolve the same targets the bundle was built against.
process.env.E2E_FIRESTORE_EMULATOR = FIRESTORE_EMULATOR;
process.env.E2E_AUTH_EMULATOR = AUTH_EMULATOR;

// Emulated (the default) or explicitly opted into the live project — either way
// the run is allowed to write the organisation's shared configuration document.
const ORG_SETTINGS_ENABLED =
  Boolean(FIRESTORE_EMULATOR) || process.env.E2E_ORG_SETTINGS_LIVE === 'true';
// Specs that assert per-persona access control, run once per role project.
// documents.spec.ts belongs here rather than with the app specs: what it checks
// is which controls a given role is offered, which is meaningless without a
// persona and identical across browser engines.
// org-settings.spec.ts signs in as the admin persona itself rather than
// taking one from project metadata, so it does not belong here either — it
// has its own single project, see SHARED_CONFIG_SPECS above.
const ROLE_SPECS = /(roles|documents|leave-policy)\.spec\.ts$/;

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
    // One engine, one worker's worth of writers against the shared document —
    // and only when the run is allowed to touch it at all (see above).
    ...(ORG_SETTINGS_ENABLED
      ? [
          {
            name: 'org-settings',
            testMatch: SHARED_CONFIG_SPECS,
            use: useFor(ROLE_ENGINE),
          },
          {
            name: 'org-isolation',
            testMatch: ORG_ISOLATION_SPECS,
            use: useFor(ROLE_ENGINE),
            // Never concurrently with the specs that rewrite the same document
            // — see ORG_ISOLATION_SPECS.
            dependencies: ['org-settings'],
          },
        ]
      : []),
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
    // E2E_FIRESTORE_EMULATOR=<host:port> builds a bundle whose Firestore talks
    // to the emulator instead of the live project — see src/lib/firebase.ts and
    // `npm run test:e2e:emulator`. Absent, the build is unchanged.
    // The persona addresses go into the build from the same constants the specs
    // sign in with. They were literals in src/lib/auth.tsx while these were
    // env-overridable, so overriding one produced an account with none of the
    // role its spec was written to exercise — and a failure nowhere near the
    // cause.
    command: `VITE_ENABLE_E2E_ACCOUNTS=true ${
      FIRESTORE_EMULATOR ? `VITE_FIRESTORE_EMULATOR_HOST=${FIRESTORE_EMULATOR} ` : ''
    }${
      AUTH_EMULATOR ? `VITE_AUTH_EMULATOR_HOST=${AUTH_EMULATOR} ` : ''
    }VITE_E2E_ADMIN_EMAIL=${PERSONAS.admin.email} ${
      ''
    }VITE_E2E_MANAGER_EMAIL=${PERSONAS.manager.email} ${
      ''
    }VITE_E2E_SUPER_ADMIN_EMAIL=${SUPER_ADMIN.email} ${
      ''
    }npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
