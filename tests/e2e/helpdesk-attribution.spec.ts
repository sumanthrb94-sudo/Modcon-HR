import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';

/**
 * A helpdesk ticket must not credit somebody who did nothing.
 *
 * QA (T10, gates G14/M5): raiser/assignee derivation and an auto-reply that
 * spoke as an employee. `a7929d8` ("Stop a ticket naming somebody who did not
 * raise it") fixed the raiser half — the picker now opens on a blank choice
 * rather than defaulting to `employees[0]`. This covers the rest:
 *
 *   - the "Assigned To" picker had exactly the same bug shape, one level
 *     down: `resolvedAssignee` fell back to `assigneeOptions[0]`, silently
 *     routing a new ticket to whichever support name or colleague happened to
 *     sort first in the merged list. A ticket nobody has routed yet should
 *     say `Unassigned`, not name somebody who never picked it up.
 *   - the two auto-generated conversation messages (the acknowledgement and,
 *     once resolved, the closing note) were authored as `ticket.assignedTo`
 *     — canned boilerplate attributed to a real person, or to nobody, as if
 *     they had personally typed it. They now speak as a neutral `Support`
 *     identity regardless of who — if anyone — the ticket is assigned to.
 *
 * Raised by an administrator on somebody else's behalf, the same path
 * `a7929d8`'s fix was written for: an HR/Admin account has no employee record
 * of its own, so `raisedById` still has to be chosen explicitly, and this
 * test does — the assignee is what is left on its default.
 */

const ADMIN = PERSONAS.admin;
const RAISED_FOR = 'Aarav Sharma';
const stamp = Date.now().toString(36);

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

test('an unassigned ticket says so, and its auto-reply speaks as Support, not an employee', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Helpdesk', exact: true }).first().click();
  await page.getByRole('button', { name: 'Raise Ticket' }).first().click();

  // By NAME, not by role alone. Submitting closes this dialog and opens the
  // new ticket's detail dialog, so a bare getByRole('dialog') resolves to
  // whichever one is open and "the raise dialog is hidden" is never true.
  const raiseDialog = page.getByRole('dialog', { name: /Raise a Ticket/ });
  const selects = raiseDialog.locator('select');
  // Name (who this ticket is on behalf of) — required, and deliberately
  // chosen here so the assignee default below is the only thing under test.
  await selects.nth(0).selectOption({ label: RAISED_FOR });

  const subject = `Attribution check ${stamp}`;
  await raiseDialog.getByPlaceholder('Briefly describe your issue…').fill(subject);
  // Assigned To (the 4th select: Name, Category, Priority, Assigned To) is
  // left untouched — its default is the point of this test.
  await expect(selects.nth(3)).toHaveValue('Unassigned');

  await raiseDialog.getByRole('button', { name: 'Submit Ticket' }).click();
  await expect(raiseDialog).toBeHidden();

  // Submitting opens the new ticket's own detail dialog.
  const detailDialog = page.getByRole('dialog');
  await expect(detailDialog.getByText(subject).first()).toBeVisible();

  // Routing: Unassigned, not a colleague who never picked this up.
  await expect(detailDialog.getByText('Unassigned', { exact: true })).toBeVisible();

  // The auto-generated acknowledgement speaks as Support — never the raiser,
  // never a real employee's name standing in for "nobody has replied yet".
  await expect(detailDialog.getByText(/I've received your ticket/)).toBeVisible();
  await expect(detailDialog.getByText('Support', { exact: true })).toBeVisible();
});
