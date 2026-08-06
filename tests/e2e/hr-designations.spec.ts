import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';

/**
 * Only the HR department's job titles carry the HR function.
 *
 * The picker in Settings → Company Profile listed every distinct title in the
 * company, so "Application Developer" was offered as a designation that carries
 * the HR function — and ticking it would have made that engineer an
 * administrator of the organisation, able to read every salary in it. A title
 * is not unique to a department, and nominating one is a statement about the
 * people team, not about a string.
 *
 * Both halves are asserted here, because fixing only what the page *offers*
 * would leave anything nominated before the fix still granting the role:
 *
 *   1. A title held outside HR is not offered.
 *   2. A title held inside HR is.
 *   3. One already nominated stays listed even if nobody in HR holds it, so it
 *      can be unticked. Not asserted here: producing that state needs an
 *      employee moved out of HR, and the profile's inline department editor is
 *      too flaky to drive. The union in `designationOptions` is what keeps it
 *      listed, and `carriesHrFunction` is what stops it granting anything.
 *
 * Runs in the org-settings project: it writes the shared company profile, and
 * restores the nominated list afterwards.
 */
const ADMIN = PERSONAS.admin;

const HR_TITLE = 'HR Executive';
const NON_HR_TITLE = 'Application Developer';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

async function openCompanyProfile(page: Page) {
  await page.goto('/settings?tab=company');
  await expect(page.getByText('HR Designations')).toBeVisible({ timeout: 20_000 });
}

/** The checkbox list, by the title beside each box. */
function designationRow(page: Page, title: string) {
  return page.locator('label').filter({ hasText: title });
}

test.describe.serial('HR designations come from the HR department', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);

    // An engineer whose title is the one under test. Created rather than
    // assumed, so the spec does not depend on the seed happening to contain a
    // title that collides.
    await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Add Employee' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Employee first name').fill('Designation');
    await dialog.getByLabel('Employee last name').fill('Collision');
    await dialog.getByLabel('Employee email').fill('designation.collision@modcon.io');
    await dialog.getByLabel('Employee designation').fill(NON_HR_TITLE);
    await dialog.getByLabel('Employee department').selectOption('Engineering');
    await dialog.getByLabel('Employee date of birth').fill('1995-04-12');
    await dialog.getByLabel('Employee date of joining').fill('2021-04-01');
    await dialog.getByLabel('Employee ctc').fill('1800000');
    await dialog.getByRole('button', { name: 'Save Employee' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('a title held outside the HR department is not offered', async () => {
    await openCompanyProfile(page);
    // toHaveCount(0) rather than not.toBeVisible: a control scrolled out of the
    // list's overflow is not visible either, and only one of those is the fix.
    await expect(designationRow(page, NON_HR_TITLE)).toHaveCount(0);
  });

  test("a title held inside it is", async () => {
    await expect(designationRow(page, HR_TITLE)).toHaveCount(1);
    await expect(designationRow(page, HR_TITLE).getByRole('checkbox')).toBeChecked();
  });

  test('the section says the list is scoped to that department', async () => {
    await expect(page.getByText(/Job titles in Human Resources that carry the HR function/)).toBeVisible();
  });

});
