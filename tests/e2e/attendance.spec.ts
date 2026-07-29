import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';

/**
 * The Mark Attendance employee select must offer the people who are actually
 * on the books.
 *
 * It used to map the exported `employees` seed snapshot and filter only by
 * visibility scope, so anyone whose status had since been set to "Resigned"
 * was still offered as someone whose day you could record. Marking attendance
 * for a person who has left the company is not a day that exists.
 *
 * The assertion below is deliberately made *after* changing a status through
 * the UI: asserting against the untouched seed would pass whether or not the
 * filter is there, because no seed employee ships as Resigned.
 */
const PERSONA = PERSONAS.admin;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(PERSONA.email);
  await page.locator('#password').fill(PERSONA.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/** The labels the Mark Attendance select currently offers, placeholder excluded. */
async function markAttendanceOptions(page: Page): Promise<string[]> {
  await page.goto('/attendance');
  await page.getByRole('button', { name: /Mark Attendance/i }).first().click();
  const dialog = page.getByRole('dialog');
  const select = dialog.locator('select').first();
  await expect(select.locator('option').nth(1)).toBeAttached();
  const labels = await select.locator('option').allTextContents();
  await page.keyboard.press('Escape');
  // The first option is the "Select employee…" placeholder, not a person.
  return labels.slice(1);
}

/** Set one employee's status through the profile UI, as HR actually would. */
async function setStatus(page: Page, employeeName: string, status: string) {
  await page.goto('/employees');
  await page.getByText(employeeName, { exact: true }).first().click();
  await expect(page).toHaveURL(/\/employees\/emp-/);

  await page.getByRole('button', { name: /Edit Profile/i }).click();
  const dialog = page.getByRole('dialog');
  // The status field is the only select offering "Resigned"; the modal also
  // holds department, manager and employment-type selects.
  const statusSelect = dialog.locator('select', {
    has: page.locator('option[value="Resigned"]'),
  });
  await statusSelect.selectOption(status);
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).toBeHidden();
}

test.describe.serial('Mark Attendance employee list', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('offers employees on the books and drops one who resigns', async () => {
    const before = await markAttendanceOptions(page);
    expect(before.length).toBeGreaterThan(1);

    // Whoever the scope happens to offer first, rather than a pinned employee
    // id — the list is filtered by who this viewer may see. The label reads
    // "Full Name (MC-000)"; the profile page is found by the name alone.
    const label = before[0];
    const name = label.replace(/\s*\(.*\)\s*$/, '');

    await setStatus(page, name, 'Resigned');

    const after = await markAttendanceOptions(page);
    expect(after).not.toContain(label);
    expect(after.length).toBe(before.length - 1);
    // Everyone else is still offered — the filter must not empty the list.
    expect(after.length).toBeGreaterThan(0);

    // Put the directory back, so a re-run in a reused profile starts clean.
    await setStatus(page, name, 'Active');
    expect(await markAttendanceOptions(page)).toContain(label);
  });
});
