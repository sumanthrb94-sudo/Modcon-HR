import { test, expect, type Page } from '@playwright/test';
import { TEST_EMAIL, TEST_PASSWORD } from './config';

/**
 * End-to-end interaction flows: auth guard, an interactive modal, the 404
 * page, and sign-out. Complements smoke.spec.ts (which walks every module).
 */

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(TEST_EMAIL);
  await page.locator('#password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

test('unauthenticated visit redirects to /login', async ({ page }) => {
  await page.goto('/employees');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
});

/**
 * The careers link is one organisation's, and the login page cannot ask which.
 *
 * Nobody is signed in there, and `firestore.rules` lets a tenant's record be
 * read only by that tenant — so the link follows the organisation this browser
 * last signed into, which sign-out deliberately leaves behind. It used to be
 * `/careers` for everyone, which is the default organisation: every tenant's
 * sign-in page advertised ModCon Builders' vacancies.
 */
test.describe('the careers link on the login page', () => {
  const CAREERS_LINK = { name: 'See our open roles' };

  test('points at the organisation this browser last signed into', async ({ page }) => {
    await page.goto('/login');
    // What a sign-in leaves behind, written directly: provisioning a second
    // organisation needs a super admin and would prove nothing extra here.
    await page.evaluate(() => window.localStorage.setItem('modcon.hr.activeOrgKey', 'e2e-other-org'));
    await page.reload();

    await expect(page.getByRole('link', CAREERS_LINK)).toHaveAttribute('href', '/careers/e2e-other-org');
  });

  test('falls back to the default organisation on a browser that has never signed in', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', CAREERS_LINK)).toHaveAttribute('href', '/careers/default');
  });
});

test.describe.serial('authenticated interactions', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('open and close the Apply Leave modal', async () => {
    await page.getByRole('link', { name: 'Leave', exact: true }).first().click();
    await expect(page).toHaveURL(/\/leave$/);
    await page.getByRole('button', { name: 'Apply Leave' }).click();
    // Modal renders its own "Apply Leave" heading.
    await expect(page.getByRole('heading', { name: 'Apply Leave' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Apply Leave' })).toBeHidden();
  });

  test('unknown route renders the 404 page', async () => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByText(/not found|404/i).first()).toBeVisible();
  });

  test('sign out returns to the login screen', async () => {
    // Navigate back into the app shell first (404 above is inside the layout).
    await page.getByRole('link', { name: 'Dashboard', exact: true }).first().click();
    await page.locator('button[title="Sign out"]').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });
});
