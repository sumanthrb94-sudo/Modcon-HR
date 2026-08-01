import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';

/**
 * There must be no automatic sign-in.
 *
 * Firebase defaults to `browserLocalPersistence`, which writes the session to
 * localStorage and restores it on any later visit — so reopening the browser,
 * or opening the URL on a shared machine, put whoever was there last back
 * inside their organisation without presenting a credential. For an HR product
 * that is a company's whole directory, payroll and attendance behind a tab
 * somebody forgot to close.
 *
 * `browserSessionPersistence` (lib/firebase.ts) scopes the session to the tab.
 * The two tests below are the two halves of that and both are needed: one that
 * the session does not outlive the tab, and one that it still survives a
 * reload — because "signed out on every refresh" would also pass the first
 * test while making the app unusable.
 */
const PERSONA = PERSONAS.admin;

async function signIn(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(PERSONA.email);
  await page.locator('#password').fill(PERSONA.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

test('the session does not outlive the browser', async ({ browser }) => {
  const first = await browser.newContext();
  const page = await first.newPage();
  await signIn(page);

  // `indexedDB: true` is load-bearing, not a precaution. Firebase's
  // browserLocalPersistence keeps the session in IndexedDB, and storageState
  // omits IndexedDB unless asked — so the obvious version of this test carries
  // no session at all and passes against the very default it exists to catch.
  // Verified: without this flag it passed with browserLocalPersistence in place.
  const carried = await first.storageState({ indexedDB: true });
  await first.close();

  const second = await browser.newContext({ storageState: carried });
  const reopened = await second.newPage();
  await reopened.goto('/');

  // Signed out: the login form, not the app shell.
  await expect(reopened.locator('#password')).toBeVisible({ timeout: 20_000 });
  await expect(reopened.getByRole('link', { name: 'Employees' })).toHaveCount(0);
  await second.close();
});

test('a reload inside the same tab stays signed in', async ({ page }) => {
  await signIn(page);
  await page.reload();

  // Still in. Without this, dropping persistence entirely would look like a
  // fix while signing people out mid-form on every refresh.
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#password')).toHaveCount(0);
});
