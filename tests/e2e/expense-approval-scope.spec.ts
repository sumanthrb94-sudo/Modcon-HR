import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { type Persona } from './config';
import { seedOrgRecords } from './firestore';

/**
 * A manager decides expense claims for the people below them, and for nobody
 * else.
 *
 * Leave had been scoped this way for a while; expenses had not. The Expenses
 * page narrowed its list for `isEmployee` and nothing else, so every other
 * role was shown every claim in the organisation with a working Approve
 * button on each — other departments', their own manager's, and their own.
 * QA found it in the five-user pass (R4-H2, and Round-3-Part-4 before that):
 * "Priya's Expenses page lists Rahul's and Meera's claims with live Approve
 * buttons".
 *
 * The two sets are deliberately different, which is the subtlety worth
 * pinning. A manager's *visible* set is their subtree plus the HR Managers;
 * their *approvable* set is the subtree minus themselves. So a manager sees
 * rows they cannot act on, and the assertions below check both halves — a
 * rule that hid the row and a rule that kept the button are each wrong in one
 * direction, and only asserting both catches it.
 *
 * Mirrors tests/e2e/leave-approval-scope.spec.ts, including why the reporting
 * line is seeded server-side rather than driven through the UI: the personas
 * are Auth accounts with no employee record, a Manager has `view` on Employee
 * Directory, and the directory is `org_records` hydrated from Firestore at
 * sign-in, so a locally-seeded line is erased by the first snapshot.
 */

function persona(): Persona {
  const p = test.info().project.metadata?.persona as Persona | undefined;
  if (!p) throw new Error('No persona configured for this project');
  return p;
}

const MANAGER_ID = 'emp-e2e-exp-lead';
const MANAGER_NAME = 'E2E Expense Lead';
const REPORT_NAME = 'E2E Expense Report';
const OUTSIDER_NAME = 'E2E Expense Outsider';

async function login(page: Page, p: { email: string; password: string }) {
  await page.goto('/login');
  await page.locator('#username').fill(p.email);
  await page.locator('#password').fill(p.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

function person(id: string, fullName: string, email: string, reportsTo: string | null) {
  const [firstName, ...rest] = fullName.split(' ');
  return {
    id,
    employeeCode: id.toUpperCase(),
    firstName,
    lastName: rest.join(' '),
    fullName,
    email,
    phone: '+91 90000 00000',
    avatar: 'brand',
    dateOfBirth: '1990-01-01',
    designation: 'Engineer',
    department: 'Engineering',
    location: 'Bengaluru',
    employmentType: 'Full-time',
    status: 'Active',
    dateOfJoining: '2024-01-01',
    reportingManagerId: reportsTo,
    ctc: 1200000,
  };
}

function claim(id: string, employeeId: string, title: string) {
  return {
    id,
    employeeId,
    title,
    category: 'Travel',
    amount: 850,
    date: '2026-09-01',
    // Submitted is the only state that draws decision buttons.
    status: 'Submitted',
    submittedOn: '2026-09-01',
    description: 'E2E expense approval scope.',
  };
}

/**
 * Three people, three submitted claims.
 *
 * The outsider carries `reportingManagerId: null` for the same reason the
 * leave spec's does: that one record is both "outside this manager's line"
 * and "has no line at all", so it proves the manager is scoped out and the
 * administrator is not, from a single row.
 *
 * The manager files a claim of their own, which is the case no role may
 * decide for itself.
 */
async function seedReportingLine(page: Page, managerEmail: string) {
  await seedOrgRecords('employees', [
    person(MANAGER_ID, MANAGER_NAME, managerEmail, null),
    person('emp-e2e-exp-report', REPORT_NAME, 'e2e-exp-report@modcon-hr.test', MANAGER_ID),
    person('emp-e2e-exp-outsider', OUTSIDER_NAME, 'e2e-exp-outsider@modcon-hr.test', null),
  ]);

  await seedOrgRecords(
    'expenseClaims',
    [
      claim('exp-e2e-report', 'emp-e2e-exp-report', 'E2E claim from a direct report'),
      claim('exp-e2e-outsider', 'emp-e2e-exp-outsider', 'E2E claim from outside the line'),
      claim('exp-e2e-self', MANAGER_ID, 'E2E claim raised by the manager themselves'),
    ],
    {
      employeeId: (record) => record.employeeId,
      // The reporting line this spec seeded. Without it a manager cannot read
      // their report's claim at all — which is the narrowing working, not a
      // scoping bug, and would make the assertions below meaningless.
      readableBy: (record) =>
        record.employeeId === MANAGER_ID ? [MANAGER_ID] : [record.employeeId, MANAGER_ID],
    },
  );

  await page.reload();
}

/** The claims table row naming one employee. */
function rowFor(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name });
}

test.describe.serial('expense approval follows the reporting line or the administrator role', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await login(page, persona());
    await seedReportingLine(
      page,
      persona().role === 'manager' ? persona().email : 'e2e-exp-unclaimed@modcon-hr.test',
    );
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('the claims list holds only what this account may see', async () => {
    await page.goto('/expenses');
    await expect(page.getByRole('heading', { name: 'Expenses', exact: true })).toBeVisible({ timeout: 20_000 });

    if (persona().role === 'employee') {
      // Self-service at this permission level. The persona matches no employee
      // record, so it resolves to nobody and sees nobody's claims — the
      // direction a missing answer has to fail.
      await expect(rowFor(page, REPORT_NAME)).toHaveCount(0);
      await expect(rowFor(page, OUTSIDER_NAME)).toHaveCount(0);
      return;
    }

    if (persona().role === 'manager') {
      await expect(rowFor(page, REPORT_NAME)).toHaveCount(1);
      // The regression. This row was here, with a live Approve button on it.
      await expect(rowFor(page, OUTSIDER_NAME)).toHaveCount(0);
      // Visible, because a manager's own record is inside their own subtree.
      await expect(rowFor(page, MANAGER_NAME)).toHaveCount(1);
      return;
    }

    // Admin and HR decide organisation-wide, so all three rows are theirs.
    await expect(rowFor(page, REPORT_NAME)).toHaveCount(1);
    await expect(rowFor(page, OUTSIDER_NAME)).toHaveCount(1);
  });

  test('the Approve button follows the narrower set', async () => {
    if (persona().role === 'employee') return;

    await page.goto('/expenses');
    await expect(page.getByRole('heading', { name: 'Expenses', exact: true })).toBeVisible({ timeout: 20_000 });

    // Whoever they are, a decision on their own claim is never offered.
    // `!isEmployee` gated these buttons before, so a manager was offered
    // Approve on the claim they had raised themselves.
    if (persona().role === 'manager') {
      await expect(rowFor(page, REPORT_NAME).getByRole('button', { name: 'Approve' })).toHaveCount(1);
      await expect(rowFor(page, MANAGER_NAME).getByRole('button', { name: 'Approve' })).toHaveCount(0);
    } else {
      // An administrator sits nowhere in the org chart, so every row is
      // somebody else's and every row keeps its button.
      await expect(rowFor(page, REPORT_NAME).getByRole('button', { name: 'Approve' })).toHaveCount(1);
      await expect(rowFor(page, OUTSIDER_NAME).getByRole('button', { name: 'Approve' })).toHaveCount(1);
    }
  });
});
