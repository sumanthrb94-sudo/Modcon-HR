import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';

/**
 * Two tabs of one browser are two sessions, and neither may see the other's.
 *
 * Auth has been per tab for a while (`browserSessionPersistence`), so one
 * browser can hold several accounts at once — which is exactly how an office
 * tests, and how QA found this: six accounts in six tabs, each shown somebody
 * else's data. Two things were still browser-wide underneath the per-tab
 * sessions:
 *
 *  - **the active organisation**, one localStorage key, so the last tab to sign
 *    in re-namespaced every other tab's data layer (a QA Zero Org tab rendered
 *    ModCon Builders' demo payroll); and
 *  - **the cache of the narrowed stores** — payslips, payroll runs, expense
 *    claims — one entry per organisation, so an administrator's tab filled it
 *    with everybody's records and an employee's tab next door read them back,
 *    records the server had refused that employee.
 *
 * Every other spec runs one page per context, where per-tab and per-browser
 * storage are indistinguishable. This one uses **two pages in one context**,
 * which share localStorage and nothing else — the only arrangement that can
 * tell them apart.
 */

async function login(page: Page, persona: { email: string; password: string }) {
  await page.goto('/login');
  await page.locator('#username').fill(persona.email);
  await page.locator('#password').fill(persona.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Dashboard' }).first()).toBeVisible({ timeout: 20_000 });
}

const NARROWED_OVERLAYS = ['modcon.hr.expenseClaims.overlay', 'modcon.hr.payslips.overlay', 'modcon.hr.payrollRuns.overlay'];

test.describe('tabs in one browser', () => {
  test('another tab signing in elsewhere does not move this tab’s organisation', async ({ context }) => {
    const mine = await context.newPage();
    await login(mine, PERSONAS.employee);
    expect(await mine.evaluate(() => sessionStorage.getItem('modcon.hr.activeOrgKey'))).toBe('default');

    // What a second tab signing into another organisation leaves in the
    // browser, written directly: provisioning a second tenant needs a super
    // admin and would prove nothing extra about this tab.
    const other = await context.newPage();
    await other.goto('/login');
    await other.evaluate(() => window.localStorage.setItem('modcon.hr.activeOrgKey', 'e2e-other-org'));

    // A reload re-reads the namespace at module load — the moment the old key
    // was read from the shared entry.
    await mine.reload();
    await expect(mine.getByRole('link', { name: 'Dashboard' }).first()).toBeVisible({ timeout: 20_000 });
    expect(await mine.evaluate(() => sessionStorage.getItem('modcon.hr.activeOrgKey'))).toBe('default');
    // And the lazily-loaded modules, which read it later still.
    await mine.goto('/expenses');
    expect(await mine.evaluate(() => sessionStorage.getItem('modcon.hr.activeOrgKey'))).toBe('default');
  });

  test('an administrator’s tab leaves nothing narrowed where an employee’s tab can read it', async ({ context }) => {
    const admin = await context.newPage();
    await login(admin, PERSONAS.admin);
    // Load the narrowed stores' modules so they register and hydrate.
    await admin.goto('/expenses');
    await admin.goto('/finance');
    await admin.waitForTimeout(1_000);

    const employee = await context.newPage();
    await login(employee, PERSONAS.employee);

    const shared = await employee.evaluate(
      (keys) => Object.keys(localStorage).filter((k) => keys.some((base) => k.startsWith(base))),
      NARROWED_OVERLAYS,
    );
    expect(shared, 'a narrowed store cached where every tab can read it').toEqual([]);

    const employeeTab = await employee.evaluate(
      (keys) => Object.keys(sessionStorage).filter((k) => keys.some((base) => k.startsWith(base))),
      NARROWED_OVERLAYS,
    );
    const adminTab = await admin.evaluate(
      (keys) => Object.fromEntries(
        Object.keys(sessionStorage)
          .filter((k) => keys.some((base) => k.startsWith(base)))
          .map((k) => [k, sessionStorage.getItem(k)]),
      ),
      NARROWED_OVERLAYS,
    );
    // Whatever the administrator's tab holds, the employee's tab does not
    // share it: each key the employee holds was fetched by the employee.
    for (const key of employeeTab) {
      const mineValue = await employee.evaluate((k) => sessionStorage.getItem(k), key);
      if (adminTab[key] && adminTab[key] !== '[]') expect(mineValue).not.toBe(adminTab[key]);
    }
  });
});
