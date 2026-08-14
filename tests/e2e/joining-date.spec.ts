import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { type Persona } from './config';

/**
 * Correcting somebody's joining date, and who may.
 *
 * Nothing in this app stores a tenure. Leave accrual, the Earned Leave tenure
 * gate, payroll's on-roll cut-off, headcount history and every work
 * anniversary are derived from `dateOfJoining` when they are read, so the field
 * was left read-only on the profile and a joining date typed wrong at hiring
 * could only be corrected by deleting the person and hiring them again.
 *
 * It is now editable in place by HR and Admin — the same gate as the employee
 * code beside it, and deliberately **not** `canEditJobFields`, which a manager
 * also passes. A department head may correct a designation; the date the whole
 * of somebody's employment is reckoned from is the organisation's record.
 *
 * The subject is seeded rather than borrowed from the demo data: the refusal
 * being asserted needs leave on file at a known date, and a spec that moves a
 * demo employee's joining date is a spec that changes what every other figure
 * about them should be. Nothing is cleaned up because nothing survives — these
 * stores are localStorage in a context this file opens and closes.
 */

function persona(): Persona {
  const p = test.info().project.metadata?.persona as Persona | undefined;
  if (!p) throw new Error('No persona configured for this project');
  return p;
}

const SUBJECT_ID = 'emp-e2e-doj';
/** The person the subject reports to, and whoever is signed in for this run. */
const LEAD_ID = 'emp-e2e-doj-lead';

/** `days` days from today as YYYY-MM-DD — no date literals, which rot. */
function isoInDays(days: number): string {
  const d = new Date(new Date().toISOString().slice(0, 10));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ORIGINAL_DOJ = isoInDays(-730);
/** Earlier than the leave on file, so nothing is stranded. */
const CORRECTED_DOJ = isoInDays(-900);
/** Later than the leave on file, which is what must be refused. */
const TOO_LATE_DOJ = isoInDays(-10);
const LEAVE_START = isoInDays(-30);

async function login(page: Page, p: Persona) {
  await page.goto('/login');
  await page.locator('#username').fill(p.email);
  await page.locator('#password').fill(p.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/**
 * One employee with one approved absence behind them, reporting to whoever is
 * signed in.
 *
 * The reporting line is not decoration: a manager sees only their own subtree
 * (`getVisibleEmployeeIds`), and the personas match no employee record of their
 * own, so a subject reporting to nobody renders "Profile not available" for the
 * manager and the gate below cannot be asked about at all. Seeding a record
 * carrying the persona's own address is what gives them a place in the tree —
 * the same trick, for the same reason, as leave-approval-scope.spec.ts.
 *
 * Bare localStorage keys, because every persona carries `orgId: 'default'`; the
 * reload is what makes the data modules re-read them as a fresh visit would.
 */
async function seedSubject(page: Page, leadEmail: string) {
  await page.evaluate(
    ({ id, doj, leaveStart, leadEmail, leadId }) => {
      window.localStorage.setItem(
        'modcon.hr.customEmployees',
        JSON.stringify([
          {
            id: leadId,
            employeeCode: 'MC-E2E-LEAD',
            firstName: 'E2E',
            lastName: 'Profile Lead',
            fullName: 'E2E Profile Lead',
            email: leadEmail,
            phone: '+91 90000 00000',
            avatar: 'brand',
            dateOfBirth: '1985-01-01',
            designation: 'Engineering Manager',
            department: 'Engineering',
            location: 'Bengaluru',
            employmentType: 'Full-time',
            status: 'Active',
            dateOfJoining: '2020-01-01',
            reportingManagerId: null,
            ctc: 2400000,
          },
          {
            id,
            employeeCode: 'MC-E2E-DOJ',
            firstName: 'E2E',
            lastName: 'Joining Date',
            fullName: 'E2E Joining Date',
            email: 'e2e-joining-date@modcon-hr.test',
            phone: '+91 90000 00000',
            avatar: 'brand',
            dateOfBirth: '1990-01-01',
            designation: 'Engineer',
            department: 'Engineering',
            location: 'Bengaluru',
            employmentType: 'Full-time',
            status: 'Active',
            dateOfJoining: doj,
            reportingManagerId: leadId,
            ctc: 1200000,
          },
        ]),
      );
      window.localStorage.setItem(
        'modcon.hr.leaveRequests',
        JSON.stringify([
          {
            id: 'lr-e2e-doj',
            employeeId: id,
            type: 'Casual',
            startDate: leaveStart,
            endDate: leaveStart,
            days: 1,
            reason: 'E2E - an absence already on file.',
            status: 'Approved',
            appliedOn: leaveStart,
            approverId: null,
          },
        ]),
      );
    },
    { id: SUBJECT_ID, doj: ORIGINAL_DOJ, leaveStart: LEAVE_START, leadEmail, leadId: LEAD_ID },
  );
  await page.reload();
}

/** The stored joining date, read from the store the app writes. */
async function storedJoiningDate(page: Page): Promise<string | undefined> {
  return page.evaluate((id) => {
    const raw = window.localStorage.getItem('modcon.hr.customEmployees');
    const list = raw ? (JSON.parse(raw) as { id: string; dateOfJoining: string }[]) : [];
    return list.find((e) => e.id === id)?.dateOfJoining;
  }, SUBJECT_ID);
}

test.describe.serial('joining date', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await login(page, persona());
    await page.goto(`/employees/${SUBJECT_ID}`);
    await seedSubject(page, persona().email);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  // The trigger is found by its title rather than its accessible name: the
  // button's name is the date it is showing, which is the thing under test.
  const editTrigger = () => page.locator('button[title="Change date of joining"]');

  test('HR and Admin can correct it, and the correction sticks', async () => {
    test.skip(persona().role !== 'admin', 'the joining date is HR and Admin only');
    await expect(page.getByText('E2E Joining Date').first()).toBeVisible();

    await editTrigger().first().click();
    await page.getByLabel('Date of Joining').fill(CORRECTED_DOJ);
    await page.getByLabel('Date of Joining').press('Enter');

    await expect.poll(() => storedJoiningDate(page)).toBe(CORRECTED_DOJ);
    // Reloaded, because a date held only in React state looks identical to a
    // date that was saved until the page is opened again.
    await page.reload();
    await expect.poll(() => storedJoiningDate(page)).toBe(CORRECTED_DOJ);
  });

  test('it cannot be moved past leave already on file', async () => {
    test.skip(persona().role !== 'admin', 'the joining date is HR and Admin only');
    await editTrigger().first().click();
    await page.getByLabel('Date of Joining').fill(TOO_LATE_DOJ);
    await page.getByLabel('Date of Joining').press('Enter');

    // Named, not merely refused: "that date is not allowed" gives whoever is
    // correcting the record nothing to correct.
    await expect(
      page.getByText(/has Casual Leave from .* which would fall before a joining date of/),
    ).toBeVisible();
    await expect.poll(() => storedJoiningDate(page)).toBe(CORRECTED_DOJ);
  });

  test('a manager may correct a designation but not a joining date', async () => {
    test.skip(persona().role !== 'manager', 'this is the gate that is not canEditJobFields');
    // Both rows sit in the same card and both are editable in place — the
    // difference between them is the whole point of the separate gate.
    await expect(page.locator('button[title="Change designation"]').first()).toBeVisible();
    await expect(editTrigger()).toHaveCount(0);
  });
});
