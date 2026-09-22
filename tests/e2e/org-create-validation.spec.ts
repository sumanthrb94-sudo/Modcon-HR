import { test, expect, type Page } from '@playwright/test';
import { SUPER_ADMIN } from './config';

/**
 * Create Organization must name the field a blank or malformed submit is
 * about, rather than one generic message.
 *
 * Before this fix, `handleCreate` ran straight into `createOrganization()` —
 * client-side validation did not exist at all. A blank organisation name or
 * admin email tripped that function's own guard, which throws a plain
 * `Error` with no Firebase `.code`, so `friendlyOrgError` fell through to its
 * default: "Something went wrong creating the organization. Please try
 * again." That is indistinguishable from a real server failure and does not
 * say which of the three fields is the problem — the same generic-message
 * failure QA reported as H5.
 *
 * This is a single-submit-attempt check: clicking Create once with both
 * required fields blank must show both messages, on their own fields, before
 * any network call is made. Emulator-only, like org-isolation.spec.ts, which
 * this shares a project with — neither test creates a live account.
 */

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(SUPER_ADMIN.email);
  await page.locator('#password').fill(SUPER_ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

test.describe('Create Organization names the specific field on the first submit', () => {
  test('a blank name and email are both named, not one generic message', async ({ page }) => {
    await login(page);
    await page.goto('/organizations');
    await page.getByRole('button', { name: 'Create Organization' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Create Organization' })).toBeVisible();

    // Every field left blank. One click.
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(dialog.getByText('Organization name is required.')).toBeVisible();
    await expect(dialog.getByText('HR administrator email is required.')).toBeVisible();
    // The old catch-all never appears, because nothing reached the network.
    await expect(dialog.getByText('Something went wrong creating the organization.')).toBeHidden();
    // Still the create form, not "Organization created" — nothing was sent.
    await expect(dialog.getByRole('heading', { name: 'Create Organization' })).toBeVisible();

    await page.keyboard.press('Escape');
  });

  test('an invalid email format is named on the email field specifically', async ({ page }) => {
    await login(page);
    await page.goto('/organizations');
    await page.getByRole('button', { name: 'Create Organization' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Acme Builders').fill(`Form Capture Validation Org ${Date.now().toString(36)}`);
    await dialog.getByPlaceholder('hr@acme.com').fill('not-an-email');

    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(dialog.getByText('Enter a valid email address.')).toBeVisible();
    await expect(dialog.getByText('Organization name is required.')).toBeHidden();
    await expect(dialog.getByRole('heading', { name: 'Create Organization' })).toBeVisible();

    await page.keyboard.press('Escape');
  });
});
