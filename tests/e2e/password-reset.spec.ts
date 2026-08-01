import { test, expect } from '@playwright/test';

/**
 * "Forgot Password?" on the login card.
 *
 * Every test here intercepts Firebase's `accounts:sendOobCode` endpoint rather
 * than letting it through. Two reasons, both load-bearing:
 *
 *  - a real call sends a real email, and this spec runs on three engines, so an
 *    un-intercepted run would mail the same address three times per CI run and
 *    burn through Firebase's per-address reset rate limit;
 *  - the failure copy is the half most likely to regress, and the only way to
 *    exercise `auth/too-many-requests` or a network failure deterministically is
 *    to fabricate the response.
 *
 * The success path deliberately asserts the *conditional* wording ("if <email>
 * belongs to a ModCon HR account"). The project has email-enumeration
 * protection enabled, so Firebase returns 200 for an address it does not know —
 * verified against production, see the note on sendPasswordReset in
 * src/lib/auth.tsx. Copy that promises "we sent you an email" would therefore be
 * a lie for exactly the users most likely to be reading it.
 *
 * No sign-in happens below: the whole flow is reachable signed out, which is
 * the point of it.
 */

const OOB_ENDPOINT = '**/accounts:sendOobCode*';
const ADDRESS = 'forgot-password-spec@modconhr.test';

test.describe('password reset', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('the link is on the login page and opens the reset form', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Forgot Password?' })).toBeVisible();

    // The typed address carries into the reset form. Retyping it is the most
    // likely thing to be got wrong by someone who has just failed to sign in.
    await page.locator('#username').fill(ADDRESS);
    await page.getByRole('button', { name: 'Forgot Password?' }).click();

    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await expect(page.locator('#reset-email')).toHaveValue(ADDRESS);
    await expect(page.locator('#password')).toHaveCount(0);
  });

  test('a successful send reports back without claiming the address exists', async ({ page }) => {
    let sentTo = '';
    await page.route(OOB_ENDPOINT, async (route) => {
      sentTo = JSON.parse(route.request().postData() ?? '{}').email ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ email: sentTo }),
      });
    });

    await page.locator('#username').fill(ADDRESS);
    await page.getByRole('button', { name: 'Forgot Password?' }).click();
    await page.getByRole('button', { name: 'Send reset link' }).click();

    const status = page.getByRole('status');
    await expect(status).toBeVisible();
    await expect(status).toContainText(`If ${ADDRESS} belongs to a ModCon HR account`);
    // Not "we have sent you an email" — see the note at the top of this file.
    await expect(status).not.toContainText(/^We(?:'ve| have) sent/i);
    expect(sentTo).toBe(ADDRESS);

    // Offering a resend matters: the commonest reason to be back on this screen
    // is that the first mail went to spam or never arrived.
    await expect(page.getByRole('button', { name: 'Resend link' })).toBeVisible();
  });

  test('rate limiting and network failure each get their own actionable message', async ({
    page,
  }) => {
    await page.route(OOB_ENDPOINT, (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'TOO_MANY_ATTEMPTS_TRY_LATER' } }),
      }),
    );

    await page.getByRole('button', { name: 'Forgot Password?' }).click();
    await page.locator('#reset-email').fill(ADDRESS);
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.getByRole('alert')).toContainText(/wait a few minutes/i);
    await expect(page.getByRole('status')).toHaveCount(0);

    // Same form, different failure: the message must change, not persist from
    // the previous attempt.
    await page.unroute(OOB_ENDPOINT);
    await page.route(OOB_ENDPOINT, (route) => route.abort('failed'));
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.getByRole('alert')).toContainText(/could not reach the server/i);
  });

  test('leaving the reset form clears its messages and restores sign-in', async ({ page }) => {
    await page.route(OOB_ENDPOINT, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );

    await page.getByRole('button', { name: 'Forgot Password?' }).click();
    await page.locator('#reset-email').fill(ADDRESS);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toBeVisible();

    await page.getByRole('button', { name: 'Back to sign in' }).click();

    // A stale "reset link sent" banner hanging over the sign-in form would read
    // as though signing in had done something.
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });
});
