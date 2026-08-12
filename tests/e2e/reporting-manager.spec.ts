import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';

// Hiring is not self-service: the Employee role gets its own record and no
// Add Employee button, and the job fields on a profile are read-only to it.
const ADMIN = PERSONAS.admin;

/**
 * A reporting manager can be somebody who does not work here yet.
 *
 * Both places that name one — Add Employee on the directory, and the
 * Reporting Manager row on a profile — offer "add new", and both create that
 * person in full rather than as a stub: a manager recorded as a name alone
 * shows "—" across their own profile and ₹0 in payroll, and would have to be
 * gone back over.
 *
 * The assertions are made against `modcon.hr.customEmployees`, the store the
 * app itself writes, because that is where "was anybody actually created, and
 * how many" is answerable. The page can only show what it chose to show — and
 * the failure worth catching here is a dialog for adding one person quietly
 * adding two, or adding none at all.
 *
 * Codes are E2E-prefixed rather than MC-numbered: the demo directory already
 * holds the MC sequence, and an employee code is what payslip, salary-split
 * and leave-entitlement uploads match a person by, so a collision is refused
 * rather than merged.
 */

interface StoredEmployee {
  id: string;
  fullName: string;
  email: string;
  employeeCode: string;
  designation: string;
  ctc: number;
  dateOfJoining: string;
  reportingManagerId: string | null;
}

interface Details {
  code: string;
  first: string;
  last: string;
  email: string;
  designation: string;
  dob: string;
  doj: string;
  ctc: string;
}

const HIRE: Details = {
  code: 'E2E-RM-HIRE',
  first: 'Reportsto',
  last: 'Newmanager',
  email: 'e2e-reportsto@modcon-hr.test',
  designation: 'Site Engineer',
  dob: '1994-04-04',
  doj: '2026-01-05',
  ctc: '900000',
};

const MANAGER: Details = {
  code: 'E2E-RM-MGR',
  first: 'Brandnew',
  last: 'Manager',
  email: 'e2e-brandnew-manager@modcon-hr.test',
  designation: 'Project Lead',
  dob: '1985-05-05',
  doj: '2020-02-10',
  ctc: '2400000',
};

const SECOND_MANAGER: Details = {
  code: 'E2E-RM-MGR2',
  first: 'Second',
  last: 'Manager',
  email: 'e2e-second-manager@modcon-hr.test',
  designation: 'Operations Head',
  dob: '1982-06-06',
  doj: '2019-03-11',
  ctc: '3000000',
};

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/** Everyone this browser has added — the seed directory is not in here. */
async function addedEmployees(page: Page): Promise<StoredEmployee[]> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('modcon.hr.customEmployees');
    return raw ? (JSON.parse(raw) as StoredEmployee[]) : [];
  });
}

async function findAdded(page: Page, email: string): Promise<StoredEmployee | undefined> {
  return (await addedEmployees(page)).find((employee) => employee.email === email);
}

/** The fields the form refuses to save without, plus the code. */
async function fillDetails(page: Page, prefix: 'Employee' | 'Manager', person: Details) {
  await page.getByLabel(`${prefix} code`).fill(person.code);
  await page.getByLabel(`${prefix} first name`).fill(person.first);
  await page.getByLabel(`${prefix} last name`).fill(person.last);
  await page.getByLabel(`${prefix} email`).fill(person.email);
  await page.getByLabel(`${prefix} designation`).fill(person.designation);
  await page.getByLabel(`${prefix} date of birth`).fill(person.dob);
  await page.getByLabel(`${prefix} date of joining`).fill(person.doj);
  await page.getByLabel(`${prefix} ctc`).fill(person.ctc);
  // Department and location are left at what the form pre-filled: the
  // organisation's own first values for the hire, the hire's own for the
  // manager. Both are valid, and typing new ones is location-directory's
  // subject rather than this one's.
}

test.describe.serial('adding a reporting manager who does not exist yet', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("the dialog refuses a manager sharing the hire's employee code", async () => {
    await page.goto('/employees');
    await page.getByRole('button', { name: 'Add Employee' }).click();
    await fillDetails(page, 'Employee', HIRE);

    await page.getByLabel('Reporting Manager').selectOption({ label: '+ Add new reporting manager…' });
    await expect(page.getByRole('heading', { name: 'New Reporting Manager' })).toBeVisible();

    // Neither person exists yet, so neither code is "taken" — this is the one
    // collision the directory cannot answer, and everything that matches a
    // person by their code would then name two people and refuse.
    await fillDetails(page, 'Manager', { ...MANAGER, code: HIRE.code });
    await page.getByRole('button', { name: 'Add manager' }).click();

    await expect(page.getByText('The manager cannot share an employee code with the new hire.')).toBeVisible();
    // Still on the manager form, and nobody has been written.
    await expect(page.getByRole('heading', { name: 'New Reporting Manager' })).toBeVisible();
    expect(await addedEmployees(page)).toHaveLength(0);
  });

  test('saving the hire creates the manager too, and links them', async () => {
    await page.getByLabel('Manager code').fill(MANAGER.code);
    await page.getByRole('button', { name: 'Add manager' }).click();

    // Back on the hire, with the manager named but still not created.
    await expect(page.getByRole('heading', { name: 'Add New Employee' })).toBeVisible();
    await expect(page.getByLabel('Reporting Manager')).toHaveValue('__new_manager__');
    expect(await addedEmployees(page)).toHaveLength(0);

    await page.getByRole('button', { name: 'Save Employee' }).click();
    await expect(page.getByRole('heading', { name: 'Add New Employee' })).toBeHidden();

    await expect.poll(async () => (await addedEmployees(page)).length).toBe(2);
    const manager = await findAdded(page, MANAGER.email);
    const hire = await findAdded(page, HIRE.email);

    expect(hire?.reportingManagerId).toBe(manager?.id);
    // Created in full, not as a stub: the details asked for are the details
    // stored, so the manager's own profile and payroll are complete.
    expect(manager?.employeeCode).toBe(MANAGER.code);
    expect(manager?.designation).toBe(MANAGER.designation);
    expect(manager?.dateOfJoining).toBe(MANAGER.doj);
    expect(manager?.ctc).toBe(Number(MANAGER.ctc));
    expect(manager?.reportingManagerId).toBeNull();
  });

  test('the profile names the manager it was given', async () => {
    const hire = await findAdded(page, HIRE.email);
    await page.goto(`/employees/${hire?.id}`);
    await expect(page.getByText(`${HIRE.first} ${HIRE.last}`).first()).toBeVisible();
    await expect(page.getByRole('link', { name: `${MANAGER.first} ${MANAGER.last}` }).first()).toBeVisible();
  });

  test('a profile can add a manager of its own, and reports to them after', async () => {
    const hire = await findAdded(page, HIRE.email);
    await page.goto(`/employees/${hire?.id}`);

    await page.getByRole('button', { name: 'Change manager' }).click();
    await page.getByLabel('Reporting Manager').selectOption({ label: '+ Add new manager…' });

    await expect(page.getByRole('heading', { name: `Add ${HIRE.first}'s Reporting Manager` })).toBeVisible();
    await fillDetails(page, 'Employee', SECOND_MANAGER);
    await page.getByRole('button', { name: 'Add manager' }).click();

    await expect.poll(async () => (await addedEmployees(page)).length).toBe(3);
    const second = await findAdded(page, SECOND_MANAGER.email);
    await expect.poll(async () => (await findAdded(page, HIRE.email))?.reportingManagerId).toBe(second?.id);
    await expect(page.getByText(`${SECOND_MANAGER.first} ${SECOND_MANAGER.last}`).first()).toBeVisible();
  });
});
