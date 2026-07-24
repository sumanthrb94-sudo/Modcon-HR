import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration.
 *
 * Runs the production build via `vite preview` and drives it in a real
 * Chromium browser. A global setup provisions a dedicated test account in
 * Firebase Auth so the sign-in flow can be exercised end-to-end.
 */
const PORT = Number(process.env.E2E_PORT ?? 4173);

// When running inside a proxied sandbox (e.g. Claude Code on the web), route
// the browser's outbound HTTPS (Firebase Auth/Firestore) through the agent
// proxy while letting the local preview server bypass it. No-ops in normal CI
// or local dev where HTTPS_PROXY is unset.
const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
const proxy = proxyServer
  ? { server: proxyServer, bypass: 'localhost,127.0.0.1,::1' }
  : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    proxy,
    // The sandbox proxy re-terminates TLS; let the test browser trust it.
    ignoreHTTPSErrors: Boolean(proxy),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      // In a proxied sandbox the intercepting egress proxy resets Chromium's
      // TLS 1.3 handshakes to Google endpoints (Firebase Auth/Firestore).
      // Capping at TLS 1.2 and disabling QUIC/ECH makes them succeed. No-ops
      // when no proxy is configured (normal CI / local dev).
      args: proxy
        ? [
            '--ssl-version-max=tls1.2',
            '--disable-quic',
            '--disable-features=EncryptedClientHello',
          ]
        : [],
    },
  },
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
