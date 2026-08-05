import { test, expect, type Page } from '@playwright/test';
import { HR_PERSONA, PERSONAS } from './config';

/**
 * Who is offered which document upload.
 *
 * Primary documents are the employee's own identity and bank records, so they
 * are submitted by the person they belong to or by HR — an administrator does
 * not upload somebody else's Aadhaar. Secondary documents are the
 * organisation's paperwork about the employee, so they are the other way
 * round: an administrator or HR files them and the employee does not.
 *
 * Three viewers, because a rule of the form "only A or B" is only checked by
 * looking at what C is offered:
 *
 *   admin     → Optional only
 *   employee  → Compulsory only, on their own record
 *   HR        → both
 *
 * The absence assertions are `toHaveCount(0)` rather than `not.toBeVisible`: a
 * hidden control and a control that was renamed both satisfy the latter, and
 * only one of them is the guard working.
 *
 * This is the UI half. There is no server half to test: the document library
 * lives in localStorage (src/data/documents.ts), so nothing refuses the write
 * once the control is on screen. When it moves to Firestore this rule has to be
 * restated in firestore.rules and tested there — see the note on
 * `canUploadDocuments` in src/pages/employees/index.tsx.
 */
const ADMIN = PERSONAS.admin;
const EMPLOYEE = PERSONAS.employee;

const COMPULSORY = 'Upload Compulsory';
const OPTIONAL = 'Upload Optional';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

async function signOut(page: Page) {
  await page.locator('button[title="Sign out"]').click();
  await expect(page.locator('#username')).toBeVisible({ timeout: 20_000 });
}

/** Open an employee's Documents tab from the directory. */
async function openDocumentsFor(page: Page, name: string) {
  await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
  await page.getByPlaceholder('Search name, role, email, code…').fill(name);
  await page.getByText(name).first().click();
  await page.getByRole('button', { name: 'Documents' }).click();
  await expect(page.getByRole('heading', { name: 'Primary Documents' })).toBeVisible();
}

test.describe.serial('document uploads are offered by section and role', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('an administrator may file optional documents, not the employee\'s own records', async () => {
    await login(page, ADMIN.email, ADMIN.password);

    // The employee record the signed-in employee account will resolve to, so
    // the "own record" case below is a real one.
    await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
    await page.getByRole('button', { name: 'Add Employee' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Employee first name').fill('Document');
    await dialog.getByLabel('Employee last name').fill('Owner');
    await dialog.getByLabel('Employee email').fill(EMPLOYEE.email);
    await dialog.getByLabel('Employee designation').fill('Software Engineer');
    await dialog.getByLabel('Employee date of birth').fill('1995-04-12');
    await dialog.getByLabel('Employee date of joining').fill('2021-04-01');
    await dialog.getByLabel('Employee ctc').fill('1800000');
    await dialog.getByRole('button', { name: 'Save Employee' }).click();
    await expect(dialog).toBeHidden();

    await openDocumentsFor(page, 'Document Owner');
    await expect(page.getByRole('button', { name: OPTIONAL })).toBeVisible();
    await expect(page.getByRole('button', { name: COMPULSORY })).toHaveCount(0);
    await expect(page.getByText('Uploaded by the employee themselves or by HR.')).toBeVisible();
  });

  test('an employee may submit their own primary documents, and no optional ones', async () => {
    await signOut(page);
    await login(page, EMPLOYEE.email, EMPLOYEE.password);

    // An employee's Employees page is their own record, so this is the
    // own-record case rather than a directory lookup.
    await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
    await page.getByRole('button', { name: 'Documents' }).click();
    await expect(page.getByRole('heading', { name: 'Primary Documents' })).toBeVisible();

    await expect(page.getByRole('button', { name: COMPULSORY })).toBeVisible();
    await expect(page.getByRole('button', { name: OPTIONAL })).toHaveCount(0);
    await expect(page.getByText('Uploaded by an administrator or by HR.')).toBeVisible();
  });

  test('an employee actually can upload a primary document', async () => {
    // The control being offered is not the same as the upload working, and the
    // handler re-checks the same rule the button was drawn from.
    await page.getByRole('button', { name: COMPULSORY }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'aadhaar.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
    });
    await dialog.getByRole('button', { name: 'Upload', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('row', { name: /Aadhaar Card/ }).first()).toBeVisible();
  });

  test('HR may file both, on anyone', async () => {
    await signOut(page);
    await login(page, HR_PERSONA.email, HR_PERSONA.password);

    await openDocumentsFor(page, 'Document Owner');
    await expect(page.getByRole('button', { name: COMPULSORY })).toBeVisible();
    await expect(page.getByRole('button', { name: OPTIONAL })).toBeVisible();
  });
});
