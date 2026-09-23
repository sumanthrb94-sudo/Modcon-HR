import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';
import { listOrgRecords } from './firestore';

/**
 * A change the server refused does not stay on screen (G7, R4-M1).
 *
 * Writes to `org_records` are optimistic by design: `save()` writes the cache,
 * fires its change event and returns, and the commit follows without being
 * awaited. What was not by design is what used to happen when that commit
 * FAILED: a warning to a console nobody has open, while the cache went on
 * showing the change — a refused write that looked exactly like one that had
 * landed, and survived a reload.
 *
 * ## How the refusal is produced
 *
 * It has to be DEFINITIVE. Aborting the write channel never reaches the
 * rollback: an aborted request is UNAVAILABLE, which the SDK retries forever.
 * Revoking the persona's role through the emulator's owner bypass does not
 * work either — the app's live profile watch sees the change and withdraws
 * the button before anything can be clicked, which is the role-propagation
 * feature working, not a refusal.
 *
 * What does: `validOrgRecord` in firestore.rules refuses any record whose
 * JSON is over 200,000 characters, and nothing in the app checks that first.
 * A ticket subject that long is an unremarkable form fill — pasted text, a
 * stray log — and the server's permission-denied is real and final. So this
 * raises one and asserts it does not stay.
 *
 * In the org-settings project: it writes the organisation's shared records.
 */

const ADMIN = PERSONAS.admin;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

test('a refused write is undone on screen and said out loud', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Helpdesk', exact: true }).first().click();
  await page.getByRole('button', { name: 'Raise Ticket' }).first().click();

  const raiseDialog = page.getByRole('dialog', { name: /Raise a Ticket/ });
  await raiseDialog.locator('select').nth(0).selectOption({ index: 1 });
  const marker = `E2E rollback ${Date.now().toString(36)}`;
  await raiseDialog.getByPlaceholder('Briefly describe your issue…').fill(`${marker} ${'x'.repeat(210_000)}`);
  await raiseDialog.getByRole('button', { name: 'Submit Ticket' }).click();
  await expect(raiseDialog).toBeHidden();

  // The banner is the half a silent rollback cannot supply: without it the
  // ticket simply vanishes, which reads as the app losing it rather than the
  // server refusing it.
  await expect(page.getByTestId('save-failure-banner')).toBeVisible({ timeout: 15_000 });

  // And it is gone from what this browser shows, because the server holds none.
  await page.keyboard.press('Escape');
  await expect(page.getByText(marker)).toHaveCount(0, { timeout: 15_000 });
  const stored = await listOrgRecords<{ subject?: string }>('tickets');
  expect(stored.some((t) => (t.subject ?? '').startsWith(marker))).toBe(false);
});
