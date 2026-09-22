import { test, expect, type Page, type Locator } from '@playwright/test';
import { PERSONAS } from './config';

/**
 * Three places on the app claim to say how many employees are on record, and
 * they have to agree.
 *
 * The main Dashboard's "Total Employees" card (src/pages/dashboard/index.tsx)
 * has always read `getEmployeeDirectory().length` — the org_records-backed
 * directory every hire actually lands in (see "Four data sources" in
 * CLAUDE.md). The Admin dashboard's "Employees on record" card and its
 * "System Snapshot → Employees" row (src/pages/admin/index.tsx) used to read
 * `useEmployees()`, the *separate* Firestore `employees` collection nothing
 * in the ordinary hire flow ever writes — only the one-off demo seed
 * (src/lib/seed.ts) does — so it reported 0 against a real roster of 5 (T5,
 * gate G6). Both admin cards now read the same directory the Dashboard does.
 *
 * Comparing the panels to each other, rather than to a hard-coded number, is
 * deliberate: this organisation's roster is whatever every spec in this run
 * has left it at, and the bug this guards against is disagreement between the
 * panels, not any particular headcount. Hiring one more person and checking
 * all three move together is what would have caught the original bug — under
 * it the Dashboard's count would have gone up and the Admin dashboard's two
 * would not have moved at all.
 */
const ADMIN = PERSONAS.admin;

const TOTAL_EMPLOYEES_LABEL = 'Total Employees';
const EMPLOYEES_ON_RECORD_LABEL = 'Employees on record';
const SNAPSHOT_HEADING = 'System Snapshot';
const SNAPSHOT_ROW_LABEL = 'Employees';

const HIRE = {
  code: 'E2E-COUNT-HIRE',
  first: 'Countme',
  last: 'Onceonly',
  email: 'e2e-counters-hire@modcon-hr.test',
  designation: 'Site Engineer',
  dob: '1993-03-03',
  doj: '2023-03-03',
  ctc: '1200000',
};

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/** The number beside a StatCard/SnapshotRow's exact-text label, in `scope`. */
async function numberBesideLabel(scope: Page | Locator, label: string): Promise<number> {
  const value = scope.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]');
  const text = (await value.innerText()).trim();
  const parsed = Number(text);
  expect(Number.isFinite(parsed), `"${label}" showed "${text}", which is not a number`).toBe(true);
  return parsed;
}

/**
 * Total Employees on the main Dashboard — the directory every hire lands in.
 *
 * Navigated to by clicking the sidebar link rather than `page.goto`, which
 * would reload the page. A reload is not free here (see "Writes are
 * optimistic" in CLAUDE.md): it starts a fresh Firestore SDK with an empty
 * mutation queue, and a write the server has not yet acknowledged can lose
 * the race to the reload and read back as though it never happened — which
 * would make a just-added employee flicker out of the very count this test
 * exists to check.
 */
async function dashboardTotal(page: Page): Promise<number> {
  await page.getByRole('link', { name: 'Dashboard', exact: true }).first().click();
  await expect(page.getByText(TOTAL_EMPLOYEES_LABEL, { exact: true })).toBeVisible({ timeout: 20_000 });
  return numberBesideLabel(page, TOTAL_EMPLOYEES_LABEL);
}

/** The Admin dashboard's two employee counters, read from the live page. */
async function adminCounters(page: Page): Promise<{ statCard: number; snapshotRow: number }> {
  await page.getByRole('link', { name: 'Admin', exact: true }).first().click();
  await expect(page.getByText(EMPLOYEES_ON_RECORD_LABEL, { exact: true })).toBeVisible({ timeout: 20_000 });
  const statCard = await numberBesideLabel(page, EMPLOYEES_ON_RECORD_LABEL);
  const snapshotCard = page
    .locator('div.card')
    .filter({ has: page.getByRole('heading', { name: SNAPSHOT_HEADING, exact: true }) });
  const snapshotRow = await numberBesideLabel(snapshotCard, SNAPSHOT_ROW_LABEL);
  return { statCard, snapshotRow };
}

test('the Dashboard and Admin dashboard employee counts agree, before and after a hire', async ({ page }) => {
  await login(page);

  const before = await dashboardTotal(page);
  const beforeAdmin = await adminCounters(page);
  expect(beforeAdmin.statCard, '"Employees on record" disagreed with the Dashboard').toBe(before);
  expect(beforeAdmin.snapshotRow, 'System Snapshot → Employees disagreed with the Dashboard').toBe(before);

  await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
  await page.getByRole('button', { name: 'Add Employee' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Employee code').fill(HIRE.code);
  await dialog.getByLabel('Employee first name').fill(HIRE.first);
  await dialog.getByLabel('Employee last name').fill(HIRE.last);
  await dialog.getByLabel('Employee email').fill(HIRE.email);
  await dialog.getByLabel('Employee designation').fill(HIRE.designation);
  await dialog.getByLabel('Employee date of birth').fill(HIRE.dob);
  await dialog.getByLabel('Employee date of joining').fill(HIRE.doj);
  await dialog.getByLabel('Employee ctc').fill(HIRE.ctc);
  await dialog.getByRole('button', { name: 'Save Employee' }).click();
  await expect(dialog).toBeHidden();

  // Optimistic writes are not free — see "Writes are optimistic" in
  // CLAUDE.md — so the roster is polled rather than read once: a read a
  // moment after the click could see the state from just before it.
  await expect
    .poll(async () => dashboardTotal(page), {
      message: 'the new hire never reached the Dashboard\'s Total Employees count',
      timeout: 15_000,
    })
    .toBe(before + 1);

  const after = await dashboardTotal(page);
  const afterAdmin = await adminCounters(page);
  expect(afterAdmin.statCard, '"Employees on record" did not move with the new hire').toBe(after);
  expect(afterAdmin.snapshotRow, 'System Snapshot → Employees did not move with the new hire').toBe(after);
});
