import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { HR_PERSONA, type Persona } from './config';

/**
 * A manager decides leave for the people below them, and for nobody else.
 *
 * The approval queue was the whole organisation's pending requests, shown
 * identically to every account that could open the page. A team lead was
 * offered Approve on the leave of people in other departments, on their own
 * manager's leave, and on their own request — and the button worked, because
 * `updateLeaveRequestStatus` asked nothing about who was clicking it.
 *
 * This runs once per role project, so each persona states its own part of the
 * rule: the manager gets the queue, the administrator gets none of it — an
 * admin runs the deployment and is nobody's reporting manager — and the
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

test.describe.serial('leave approval follows the reporting line', () => {
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
      // The assertion the whole change is about. Before it, this row was here.
      await expect(page.getByText(OUTSIDER_NAME)).toHaveCount(0);
    } else {
      // An administrator runs the deployment and sits nowhere in the org
      // chart, so they decide no leave at all — not even the request seeded
      // below a manager. The page says which of the two empty-queue reasons
      // this is rather than sitting blank.
      await expect(page.getByText(REPORT_NAME)).toHaveCount(0);
      await expect(page.getByText(OUTSIDER_NAME)).toHaveCount(0);
      await expect(page.getByText(/cannot tell who reports to you/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    }
  });

  test('HR gets no organisation-wide approval either', async ({ browser }) => {
    // Runs once rather than once per project: the claim is about the HR
    // persona, who is nobody's persona here.
    test.skip(persona().role !== 'manager', 'asserted once, from the manager project');

    // HR reads every employee's records — that is what oversight needs — and
    // used to decide every employee's leave along with it. In this app the
    // organisation's own administrator holds exactly this role, so "the admin
    // must not approve" is mostly a statement about this account.
    const fresh = await browser.newContext();
    const hr = await fresh.newPage();
    try {
      await login(hr, HR_PERSONA);
      await seedReportingLine(hr, 'e2e-unclaimed@modcon-hr.test');
      await hr.goto(APPROVALS_URL);
      await expect(hr.getByRole('heading', { name: 'Leave Requests' })).toBeVisible({ timeout: 20_000 });

      await expect(hr.getByText(REPORT_NAME)).toHaveCount(0);
      await expect(hr.getByText(OUTSIDER_NAME)).toHaveCount(0);
      await expect(hr.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    } finally {
      await hr.close();
      await fresh.close();
    }
  });

  test('a decision this account may make still goes through', async () => {
    test.skip(persona().role !== 'manager', 'only the manager has anyone to decide for');

    await page.goto(APPROVALS_URL);
    await expect(page.getByText(REPORT_NAME)).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Approve' }).first().click();

    // Decided, so it leaves the pending queue — and no refusal banner appears,
    // which is what a scope drawn too tightly would produce instead.
    await expect(page.getByText(REPORT_NAME)).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
  });
});
