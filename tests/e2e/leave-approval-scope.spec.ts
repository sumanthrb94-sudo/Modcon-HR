import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { HR_PERSONA, type Persona } from './config';

/**
 * Two routes to deciding leave, and the queue shows exactly the one this
 * account has.
 *
 * A manager decides for the people below them and for nobody else. HR and
 * Admin decide for the whole organisation — including somebody with no
 * reporting manager recorded, who otherwise has nobody at all and whose
 * request sits pending until the org chart is edited.
 *
 * The queue was once the whole organisation's pending requests shown
 * identically to every account that could open the page, so a team lead was
 * offered Approve on the leave of people in other departments, on their own
 * manager's leave, and on their own request — and the button worked, because
 * `updateLeaveRequestStatus` asked nothing about who was clicking it. Fixing
 * that then over-corrected: authority became a tree position and nothing else,
 * so an administrator decided nothing and a manager-less employee was
 * undecidable. The assertions below pin both halves, because either one alone
 * is satisfied by a rule that is wrong in the other direction.
 *
 * This runs once per role project, so each persona states its own part: the
 * manager gets their reporting line, the administrator gets everybody, and the
 * employee cannot reach the page at all.
 *
 * The reporting line has to be seeded rather than driven through the UI. The
 * personas are Auth accounts with no employee record — there is nobody in the
 * demo directory they *are* — and a manager has `view` on Employee Directory,
 * so a manager cannot hire their own reports to make the assertion possible.
 * The seed writes the two localStorage stores the app itself writes
 * (`modcon.hr.customEmployees`, `modcon.hr.leaveRequests`; bare keys, because
 * every persona carries `orgId: 'default'`), then reloads so the data modules
 * re-read them at module-load time the way a fresh visit would.
 */

function persona(): Persona {
  const p = test.info().project.metadata?.persona as Persona | undefined;
  if (!p) throw new Error('No persona configured for this project');
  return p;
}

const MANAGER_ID = 'emp-e2e-lead';
const REPORT_NAME = 'E2E Direct Report';
const OUTSIDER_NAME = 'E2E Other Department';

const APPROVALS_URL = '/dashboard/pending-approvals/leave-requests';

// Takes credentials rather than a Persona: HR is not one of the three role
// personas, and its `role: 'hr'` does not fit that union.
async function login(page: Page, p: { email: string; password: string }) {
  await page.goto('/login');
  await page.locator('#username').fill(p.email);
  await page.locator('#password').fill(p.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/**
 * Three people and two pending requests: somebody below the manager, and
 * somebody who is nothing to do with them. Every assertion below is the
 * difference between those two.
 *
 * The outsider is seeded with `reportingManagerId: null` on purpose, so they
 * carry both halves of the rule at once — outside the manager's line, and with
 * no line of their own. Their request is the one an administrator has to be
 * able to decide; before HR and Admin were given organisation-wide authority
 * it could not be decided by anybody.
 */
async function seedReportingLine(page: Page, managerEmail: string) {
  await page.evaluate(
    ({ managerEmail, managerId, reportName, outsiderName }) => {
      const person = (id: string, fullName: string, email: string, reportsTo: string | null) => {
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
      };

      window.localStorage.setItem(
        'modcon.hr.customEmployees',
        JSON.stringify([
          person(managerId, 'E2E Reporting Lead', managerEmail, null),
          person('emp-e2e-report', reportName, 'e2e-report@modcon-hr.test', managerId),
          person('emp-e2e-outsider', outsiderName, 'e2e-outsider@modcon-hr.test', null),
        ]),
      );

      // Writing this store replaces the demo seed outright, so the queue holds
      // exactly these two requests and "one of them is missing" cannot be an
      // accident of which seeded rows happened to be pending.
      window.localStorage.setItem(
        'modcon.hr.leaveRequests',
        JSON.stringify([
          {
            id: 'lr-e2e-report',
            employeeId: 'emp-e2e-report',
            type: 'Casual',
            startDate: '2026-09-01',
            endDate: '2026-09-02',
            days: 2,
            reason: 'E2E - request from somebody below this manager.',
            status: 'Pending',
            appliedOn: '2026-08-20',
            approverId: null,
          },
          {
            id: 'lr-e2e-outsider',
            employeeId: 'emp-e2e-outsider',
            type: 'Casual',
            startDate: '2026-09-01',
            endDate: '2026-09-02',
            days: 2,
            reason: 'E2E - request from outside this manager reporting line.',
            status: 'Pending',
            appliedOn: '2026-08-20',
            approverId: null,
          },
        ]),
      );
    },
    { managerEmail, managerId: MANAGER_ID, reportName: REPORT_NAME, outsiderName: OUTSIDER_NAME },
  );
  await page.reload();
}

/**
 * Approve the request filed for one named employee.
 *
 * The queue holds more than one row for anybody deciding organisation-wide, so
 * `getByRole('button', { name: 'Approve' }).first()` would assert that *a*
 * decision went through rather than that this one did — and the request that
 * carries the rule is specifically the employee who reports to nobody.
 */
async function approveRequestFor(p: Page, employeeId: string) {
  await p
    .locator(`[data-testid="leave-approval-request"][data-employee-id="${employeeId}"]`)
    .getByRole('button', { name: 'Approve' })
    .click();
}

test.describe.serial('leave approval follows the reporting line or the administrator role', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await login(page, persona());
    // The manager persona is the account given the reporting line; the other
    // two read the same three records from the outside.
    await seedReportingLine(
      page,
      persona().role === 'manager' ? persona().email : 'e2e-unclaimed@modcon-hr.test',
    );
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('the queue holds only what this account may decide', async () => {
    if (persona().role === 'employee') {
      // RequireManager: an employee never reaches the page to be scoped.
      await page.goto(APPROVALS_URL);
      await expect(page).not.toHaveURL(/leave-requests$/);
      return;
    }

    await page.goto(APPROVALS_URL);
    await expect(page.getByRole('heading', { name: 'Leave Requests' })).toBeVisible({ timeout: 20_000 });

    if (persona().role === 'manager') {
      await expect(page.getByText(REPORT_NAME)).toBeVisible();
      // The reporting-line half. Before the scope rule existed, this row was
      // here — a team lead offered Approve on another department's leave.
      await expect(page.getByText(OUTSIDER_NAME)).toHaveCount(0);
    } else {
      // The administrator half. An admin sits nowhere in the org chart, so a
      // rule made only of tree positions gave them an empty queue and left the
      // manager-less outsider with nobody at all. Their authority is the role,
      // so both requests are theirs to decide.
      await expect(page.getByText(REPORT_NAME)).toBeVisible();
      await expect(page.getByText(OUTSIDER_NAME)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(2);
      // The empty-queue explanation that used to fire here told an
      // administrator to go and link an account, which would not have changed
      // anything they can decide.
      await expect(page.getByText(/cannot tell who reports to you/)).toHaveCount(0);
    }
  });

  test('an administrator decides a request that has no reporting line at all', async () => {
    test.skip(persona().role !== 'admin', 'the organisation-wide route, asserted from the admin project');

    await page.goto(APPROVALS_URL);
    await expect(page.getByText(OUTSIDER_NAME)).toBeVisible({ timeout: 20_000 });

    // Named rather than "the first Approve button": the request that matters
    // is the one whose employee reports to nobody, and a queue of two makes
    // "some button worked" and "this one worked" different claims.
    await approveRequestFor(page, 'emp-e2e-outsider');

    await expect(page.getByText(OUTSIDER_NAME)).toHaveCount(0);
    // A refusal is rendered rather than swallowed, so an empty status region
    // is what proves the write landed instead of being turned away.
    await expect(page.getByRole('status')).toHaveCount(0);
    // The other request is untouched — organisation-wide is not "approve
    // whatever was on screen".
    await expect(page.getByText(REPORT_NAME)).toBeVisible();
  });

  test('HR decides organisation-wide, including somebody with no reporting manager', async ({ browser }) => {
    // Runs once rather than once per project: the claim is about the HR
    // persona, who is nobody's persona here.
    test.skip(persona().role !== 'manager', 'asserted once, from the manager project');

    // HR reads every employee's records, and now decides their leave too. In
    // this app the organisation's own administrator holds exactly this role
    // (`src/lib/organizations.ts` provisions the first account as `hr`), so
    // this is the account an organisation would actually escalate to.
    const fresh = await browser.newContext();
    const hr = await fresh.newPage();
    try {
      await login(hr, HR_PERSONA);
      await seedReportingLine(hr, 'e2e-unclaimed@modcon-hr.test');
      await hr.goto(APPROVALS_URL);
      await expect(hr.getByRole('heading', { name: 'Leave Requests' })).toBeVisible({ timeout: 20_000 });

      await expect(hr.getByText(REPORT_NAME)).toBeVisible();
      await expect(hr.getByText(OUTSIDER_NAME)).toBeVisible();

      // Its own browser context, so this decision is written to a different
      // localStorage than the manager's and cannot empty the queue the last
      // test in this file needs.
      await approveRequestFor(hr, 'emp-e2e-outsider');
      await expect(hr.getByText(OUTSIDER_NAME)).toHaveCount(0);
      await expect(hr.getByRole('status')).toHaveCount(0);
    } finally {
      await hr.close();
      await fresh.close();
    }
  });

  test('a decision down the reporting line still goes through', async () => {
    test.skip(persona().role !== 'manager', 'the reporting-line route, asserted from the manager project');

    await page.goto(APPROVALS_URL);
    await expect(page.getByText(REPORT_NAME)).toBeVisible({ timeout: 20_000 });

    await approveRequestFor(page, 'emp-e2e-report');

    // Decided, so it leaves the pending queue — and no refusal banner appears,
    // which is what a scope drawn too tightly would produce instead.
    await expect(page.getByText(REPORT_NAME)).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
  });
});
