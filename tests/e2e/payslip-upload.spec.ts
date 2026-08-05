import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';
import { EMULATOR_HOST, FIRESTORE_BASE, signInPersona } from './firestore';

/**
 * An administrator uploads a month's payslips; each employee gets their own.
 *
 * The two things worth driving a browser for, because neither is visible in the
 * rules tests: that the review step matches files to the right people before
 * anything is written, and that what the administrator uploaded is what the
 * employee is then offered on their Finance page. The rules tests
 * (tests/rules/payslip-documents.rules.test.mjs) cover the half this cannot —
 * that a colleague reading someone else's payslip is refused by the server.
 *
 * May 2026 rather than the current month: the Finance page lists a row per
 * payroll run, and the seeded runs stop at 2026-05, so an upload for August
 * would have no row to appear on and the last assertion would be checking the
 * wrong thing.
 */
const ADMIN = PERSONAS.admin;
const EMPLOYEE = PERSONAS.employee;
const MONTH = '2026-05';

/** A file Playwright can hand to an <input type="file">. Content is irrelevant — nothing parses it. */
function pdf(name: string) {
  return {
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'),
  };
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

test.describe.serial('an administrator uploads payslips', () => {
  let page: Page;
  let employeeId = '';
  let employeeCode = '';

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('the signed-in employee account is given an employee record', async () => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
    await page.getByRole('button', { name: 'Add Employee' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Employee first name').fill('Payslip');
    await dialog.getByLabel('Employee last name').fill('Recipient');
    await dialog.getByLabel('Employee email').fill(EMPLOYEE.email);
    await dialog.getByLabel('Employee designation').fill('Software Engineer');
    await dialog.getByLabel('Employee date of birth').fill('1995-04-12');
    await dialog.getByLabel('Employee date of joining').fill('2021-04-01');
    await dialog.getByLabel('Employee ctc').fill('1800000');
    await dialog.getByRole('button', { name: 'Save Employee' }).click();
    await expect(dialog).toBeHidden();

    await page.getByPlaceholder('Search name, role, email, code…').fill(EMPLOYEE.email);
    const card = page.getByText('Payslip Recipient').first();
    await expect(card).toBeVisible();

    // The code is what the filenames are matched on, and the id is what the
    // payslip document is keyed by — both are generated, so both are read back
    // from the app rather than assumed.
    employeeCode = (await page.getByText(/^MC-\d+$/).first().textContent())?.trim() ?? '';
    expect(employeeCode).toMatch(/^MC-\d+$/);

    await card.click();
    await expect(page).toHaveURL(/\/employees\/emp-/);
    employeeId = page.url().split('/employees/')[1].split(/[?#]/)[0];
    expect(employeeId).toMatch(/^emp-/);
  });

  test('files are matched to people before anything is uploaded', async () => {
    await page.getByRole('link', { name: 'Payroll', exact: true }).first().click();
    await page.getByRole('button', { name: 'Upload payslips' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Payslip month').fill(MONTH);
    await dialog.getByLabel('Payslip PDFs').setInputFiles([
      pdf(`${employeeCode}-may.pdf`),
      pdf('MC-001_may_2026.pdf'),
      // Named after nobody: this is the file that must be reported rather than
      // quietly dropped.
      pdf('payslip-final-v2.pdf'),
    ]);

    await expect(dialog.getByTestId('payslip-matched-count')).toHaveText('2');
    await expect(dialog.getByTestId('payslip-unmatched-count')).toHaveText('1');
    await expect(dialog.getByTestId('payslip-match')).toHaveCount(2);
    await expect(dialog.locator(`[data-employee-code="${employeeCode}"]`)).toBeVisible();
    await expect(dialog.getByText('No employee code in the filename')).toBeVisible();

    await dialog.getByRole('button', { name: /Upload 2 payslips/ }).click();
    await expect(dialog.getByText(/2 payslips uploaded for May 2026/)).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Done' }).click();
  });

  test('the payroll list says which payslips have a PDF and which do not', async () => {
    // Coverage, from the administrator's side: the seeded payslips are all
    // May 2026, so Aarav Sharma (MC-001) is the row the upload above landed on
    // and Diya Mehta is a row it did not.
    // Anchored: "Upload payslips" also contains the word.
    await page.getByRole('button', { name: /^Payslips/ }).click();
    const search = page.getByPlaceholder('Search employee…');

    await search.fill('Aarav Sharma');
    await expect(
      page.getByRole('row', { name: /Aarav Sharma/ }).getByRole('button', { name: 'PDF' }),
    ).toBeVisible();

    await search.fill('Diya Mehta');
    await expect(
      page.getByRole('row', { name: /Diya Mehta/ }).getByRole('button', { name: 'PDF' }),
    ).toHaveCount(0);
    await search.fill('');
  });

  test('re-uploading the same month is flagged as a replacement', async () => {
    // Which proves the upload reached Firestore and is read back: the flag is
    // computed from the stored document's deterministic id, not from anything
    // left in the page from the previous test.
    await page.getByRole('button', { name: 'Upload payslips' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Payslip month').fill(MONTH);
    await dialog.getByLabel('Payslip PDFs').setInputFiles([pdf(`${employeeCode}-may-corrected.pdf`)]);

    await expect(dialog.getByTestId('payslip-match')).toHaveCount(1);
    await expect(dialog.getByText('replaces existing')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('the employee is offered their own payslip on Finance', async () => {
    // The link is what the rules read to decide "your own" (src/data/employeeLinks.ts);
    // it is written by an administrator, which against the emulator means the
    // owner bypass. Nothing here can run against the live project.
    test.skip(!EMULATOR_HOST, 'needs the Firestore emulator to write employee_links');

    const { uid } = await signInPersona(EMPLOYEE.email, EMPLOYEE.password);
    expect(uid).toBeTruthy();
    const res = await fetch(`${FIRESTORE_BASE}/employee_links/${uid}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          uid: { stringValue: uid },
          employeeId: { stringValue: employeeId },
          orgId: { stringValue: 'default' },
          linkedBy: { stringValue: 'e2e' },
        },
      }),
    });
    expect(res.ok, `seeding employee_links/${uid} failed: ${res.status}`).toBe(true);

    await page.locator('button[title="Sign out"]').click();
    await expect(page.locator('#username')).toBeVisible({ timeout: 20_000 });
    await login(page, EMPLOYEE.email, EMPLOYEE.password);

    await page.getByRole('link', { name: 'Finance', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Finance' })).toBeVisible();

    const issued = page.locator(`[data-testid="issued-payslip-download"][data-month="${MONTH}"]`);
    await expect(issued).toBeVisible({ timeout: 20_000 });

    // And only their own month: nothing was uploaded for April, so that row
    // still offers the computed statement alone.
    await expect(
      page.locator('[data-testid="issued-payslip-download"][data-month="2026-04"]'),
    ).toHaveCount(0);
  });
});
