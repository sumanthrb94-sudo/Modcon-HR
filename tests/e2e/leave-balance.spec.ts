import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';

/**
 * The Dashboard and the Leave module must report the same leave balance.
 *
 * They did not. The Leave module's Balances tab derives entitlement from the
 * policy, the joining date and today (data/leaveEntitlements.ts), so it knows
 * about monthly accrual, the April reset and the one-year Earned Leave gate.
 * The Dashboard's "My Leave Balance" card read the seeded `leaveBalances` rows
 * in data/leave.ts instead — fixed totals someone typed, which exist for
 * fourteen seed employees and for nobody else. So the same employee could open
 * two pages and be told two different numbers, and anyone added after seeding
 * was told on the Dashboard that they had no leave data at all while the Leave
 * module showed them accruing normally.
 *
 * The employee this runs as is created here rather than picked from the seeds,
 * for exactly that reason: a newly added employee is the case the old Dashboard
 * card got most visibly wrong, and it is also the only way the signed-in test
 * persona resolves to an employee record at all (getCurrentEmployee matches on
 * work email).
 */
const ADMIN = PERSONAS.admin;
const EMPLOYEE = PERSONAS.employee;

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/** Every "<available>/<granted> available" reading on the page, keyed by leave type. */
async function readBalances(page: Page, scope = page.locator('body')) {
  const rows = scope.locator('[data-testid="leave-balance-row"]');
  await expect(rows.first()).toBeVisible();
  const entries = await rows.evaluateAll((nodes) =>
    nodes.map((node) => [
      node.getAttribute('data-leave-type') ?? '',
      node.getAttribute('data-leave-reading') ?? '',
    ]),
  );
  return Object.fromEntries(entries) as Record<string, string>;
}

test.describe.serial('leave balance is the same figure everywhere', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('an administrator adds the employee record the account signs in as', async () => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
    await page.getByRole('button', { name: 'Add Employee' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Employee first name').fill('Playwright');
    await dialog.getByLabel('Employee last name').fill('Balance');
    await dialog.getByLabel('Employee email').fill(EMPLOYEE.email);
    await dialog.getByLabel('Employee designation').fill('Software Engineer');
    await dialog.getByLabel('Employee date of birth').fill('1995-04-12');
    // Joined well over a year ago, so the tenure-gated types are granted and
    // the accrued types have a full financial year's worth of months behind
    // them — a balance of zero everywhere would compare equal trivially.
    await dialog.getByLabel('Employee date of joining').fill('2021-04-01');
    await dialog.getByLabel('Employee ctc').fill('1800000');
    await dialog.getByRole('button', { name: 'Save Employee' }).click();

    await expect(dialog).toBeHidden();
    // The directory cards show the name, not the work email — search for the
    // record rather than asserting on an address that is never rendered here.
    await page.getByPlaceholder('Search name, role, email, code…').fill(EMPLOYEE.email);
    await expect(page.getByText('Playwright Balance').first()).toBeVisible();

    await page.locator('button[title="Sign out"]').click();
    await expect(page.locator('#username')).toBeVisible({ timeout: 20_000 });
  });

  test('the Dashboard card matches the Leave module, type for type', async () => {
    await login(page, EMPLOYEE.email, EMPLOYEE.password);

    await page.getByRole('link', { name: 'Leave', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Leave Management' })).toBeVisible();
    await page.getByRole('button', { name: 'My Leave Balance' }).click();
    const fromLeaveModule = await readBalances(page);

    // Not an empty comparison: the employee must actually hold entitlements,
    // or two blank pages would agree with each other and prove nothing.
    expect(Object.keys(fromLeaveModule).length).toBeGreaterThan(0);

    await page.getByRole('link', { name: 'Dashboard', exact: true }).first().click();
    // The Leave page's own balance rows are still mounted for as long as the
    // lazily-loaded Dashboard is suspending. Without waiting for something only
    // the Dashboard renders, the read below can be served the Leave module's
    // rows a second time and the comparison passes against itself.
    await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening),/ })).toBeVisible();
    const fromDashboard = await readBalances(page);

    expect(fromDashboard).toEqual(fromLeaveModule);

    // The third surface: the Time Off tab on the employee's own profile, which
    // read the same seeded rows the Dashboard did and headed them "Jan – Dec"
    // besides — a different period from the financial year the figures are
    // actually counted in.
    await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
    await page.getByRole('button', { name: 'Time Off' }).click();
    await expect(page.getByText(/Accrued so far in FY/).first()).toBeVisible();
    expect(await readBalances(page)).toEqual(fromLeaveModule);
  });
});
