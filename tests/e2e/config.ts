/**
 * Shared E2E test configuration.
 *
 * The Firebase Web API key is a public client identifier (it ships in the
 * browser bundle), so it is safe to reference here for provisioning the test
 * account. Credentials for the dedicated test user can be overridden via env.
 */
export const FIREBASE_API_KEY =
  process.env.E2E_FIREBASE_API_KEY ?? 'AIzaSyCDTZ1Sc3ajyKE7fKnzDguzoIphn9tDRQU';

export const TEST_EMAIL = process.env.E2E_EMAIL ?? 'playwright-e2e@modcon-hr.test';
export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'Playwright!2026';
export const TEST_NAME = process.env.E2E_NAME ?? 'Playwright E2E';
