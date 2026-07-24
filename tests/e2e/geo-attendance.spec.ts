import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { PERSONAS, OFFICE_GEO, REMOTE_GEO } from './config';

/**
 * Location-based attendance check-in.
 *
 * Exercises the geofence logic by mocking the browser geolocation to the office
 * (on-site), a far-away location (off-site), and denying permission.
 */

const p = PERSONAS.employee;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(p.email);
  await page.locator('#password').fill(p.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Attendance' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('link', { name: 'Attendance', exact: true }).first().click();
  await expect(page.getByTestId('geo-checkin')).toBeVisible();
}

test.describe.serial('geolocation attendance', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: OFFICE_GEO,
    });
    page = await context.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('check-in at the office is marked On-site / Present', async () => {
    await context.setGeolocation(OFFICE_GEO);
    await page.getByTestId('geo-checkin').click();
    const result = page.getByTestId('geo-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('On-site');
    await expect(result).toContainText('Present');
    await expect(page.getByTestId('geo-coords')).toBeVisible();
  });

  test('check-out records the time and worked hours', async () => {
    // After checking in, the check-out button becomes enabled.
    const checkout = page.getByTestId('geo-checkout');
    await expect(checkout).toBeEnabled();
    await checkout.click();
    const result = page.getByTestId('geo-checkout-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText(/Checked out at/);
    await expect(result).toContainText(/h worked/);
    // Once checked out, check-in is available again.
    await expect(page.getByTestId('geo-checkin')).toBeEnabled();
  });

  test('check-in far away is marked Off-site / Work From Home', async () => {
    await context.setGeolocation(REMOTE_GEO);
    await page.getByTestId('geo-checkin').click();
    const result = page.getByTestId('geo-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('Off-site');
    await expect(result).toContainText('Work From Home');
  });

  test('denied location permission surfaces an error', async () => {
    // The previous test left us checked in (off-site); check out so the
    // check-in button is enabled again.
    const checkout = page.getByTestId('geo-checkout');
    if (await checkout.isEnabled()) await checkout.click();
    // Deterministically drive the error path: force getCurrentPosition to
    // invoke its error callback with PERMISSION_DENIED (code 1).
    await page.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (_success, error) => {
        error?.({ code: 1, message: 'denied' } as GeolocationPositionError);
      };
    });
    await page.getByTestId('geo-checkin').click();
    await expect(page.getByTestId('geo-error')).toBeVisible();
    await expect(page.getByTestId('geo-error')).toContainText(/permission|denied/i);
  });
});
