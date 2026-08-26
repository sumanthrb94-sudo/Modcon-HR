import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import type { Persona } from './config';

/**
 * An employee account sees itself, and no colleague — everywhere, not just on
 * the directory page.
 *
 * `/employees` had been scoped through `lib/dataScope.ts` for some time, which
 * is exactly why the surfaces that had not were easy to miss: the page people
 * check was already right. Three were not.
 *
 *   The top bar's global search built its dropdown from the raw directory.
 *   That box is not rendered for an Employee at all, so this one was a
 *   Manager's leak: an account confined to its own reporting line everywhere
 *   else could find anybody in the company here. Clicking a result was refused
 *   by `canViewEmployee` on the profile page, but by then the name,
 *   designation and department had been shown — that guard covers the
 *   destination, not the list.
 *
 *   `/dashboard/celebrations` read the `employees` seed array directly and was
 *   scoped to nobody, so it listed every colleague's name, department and date
 *   of birth.
 *
 *   `/dashboard/recent-activity` named whoever applied for leave, claimed an
 *   expense, raised a ticket or joined a department.
 *
 * All three, plus `/dashboard/kpi-graphs`, sat on routes that alone in
 * `App.tsx` carried no guard at all — not a role check, not a module check.
 *
 * This runs once per role project so each persona states its own half of the
 * rule: the employee is confined to themselves, the administrator still reads
 * the organisation. As in `leave-approval-scope.spec.ts`, the directory is
 * seeded into `modcon.hr.customEmployees` rather than driven through the UI —
 * the personas are Auth accounts matching no employee record, and an employee
 * cannot hire anybody. Seeding by the persona's own address is what makes
 * `getCurrentEmployeeRecord` match it, since that resolver falls back to email
 * when no `authUid` link exists.
 */

function persona(): Persona {
  const p = test.info().project.metadata?.persona as Persona | undefined;
  if (!p) throw new Error('No persona configured for this project');
  return p;
}

const SELF_NAME = 'E2E Scope Self';
const COLLEAGUE_NAME = 'E2E Scope Colleague';

// Both people are born in January, so one month button on the celebrations
// page holds that whole assertion. The page opens on the current month, which
// moves with the real clock — see tests/e2e/clock.ts for why nothing here may
// assume what "today" is, and why the birthday is pinned to a month the page
// is never already showing by accident.
const BIRTH_MONTH = 'January';

async function login(page: Page, p: { email: string; password: string }) {
  await page.goto('/login');
  await page.locator('#username').fill(p.email);
  await page.locator('#password').fill(p.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/**
 * Two people: the signed-in account, and somebody who is nothing to do with
 * them. Every assertion below is the difference between those two.
 *
 * The colleague reports to nobody and is not in the HR department, so they sit
 * outside a Manager's subtree as well as an Employee's scope — the manager
 * persona asserts the same absence for its own reason.
 */
async function seedDirectory(page: Page, selfEmail: string) {
  await page.evaluate(
    ({ selfEmail, selfName, colleagueName }) => {
      const person = (id: string, fullName: string, email: string) => {
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
          dateOfBirth: '1990-01-15',
          designation: 'Engineer',
          department: 'Engineering',
          location: 'Bengaluru',
          employmentType: 'Full-time',
          status: 'Active',
          // Recent on purpose. The activity stream is sorted newest-first and
          // capped, so a joining date years back would sort below the demo
          // organisation's own history and the assertion would fail for a
          // reason that has nothing to do with scope.
          dateOfJoining: '2026-08-20',
          reportingManagerId: null,
          ctc: 1200000,
        };
      };

      window.localStorage.setItem(
        'modcon.hr.customEmployees',
        JSON.stringify([
          person('emp-e2e-scope-self', selfName, selfEmail),
          person('emp-e2e-scope-colleague', colleagueName, 'e2e-scope-colleague@modcon-hr.test'),
        ]),
      );
    },
    { selfEmail, selfName: SELF_NAME, colleagueName: COLLEAGUE_NAME },
  );
  await page.reload();
}

test.describe.serial('an employee account is scoped to itself everywhere', () => {
  let context: BrowserContext;
  let page: Page;
  // Three-way, not two. A Manager is neither confined to itself nor shown the
  // organisation: the seeded colleague reports to nobody and is not HR, so a
  // Manager must not see them either — for a different reason than an
  // Employee, and one an `isEmployee ? … : …` split would quietly get wrong.
  let isEmployee: boolean;
  let seesWholeOrg: boolean;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await login(page, persona());
    isEmployee = persona().role === 'employee';
    seesWholeOrg = persona().role === 'admin';
    await seedDirectory(page, persona().email);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('the global search offers only people this account may see', async () => {
    await page.goto('/');
    const search = page.getByPlaceholder('Search employees, requests, documents…');

    if (isEmployee) {
      // There is no global search for an Employee — the Topbar renders the box
      // behind `role !== 'Employee'`. Asserted rather than skipped, because
      // "the dropdown is scoped" and "there is no dropdown" are different
      // guarantees, and a future redesign that showed the box would need to
      // scope it before this passes again.
      await expect(search).toHaveCount(0);
      return;
    }

    // The admin case is deliberately not asserted here. Its scope is the whole
    // organisation, and the dropdown is capped at thirty rows — seeded people
    // land at the end of the directory and fall outside it, so an absence
    // would prove nothing about scope.
    if (seesWholeOrg) return;

    await search.click();
    await search.fill('E2E Scope');

    // Asserted before the absence below: an empty dropdown would satisfy that
    // one without the filter working at all, so finding one's own record is
    // what separates "scoped" from "broken".
    await expect(page.getByText(SELF_NAME)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(COLLEAGUE_NAME)).toHaveCount(0);
  });

  test('the celebrations calendar lists only people this account may see', async () => {
    await page.goto('/dashboard/celebrations');
    await expect(page.getByRole('heading', { name: 'Celebrations Calendar' })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole('button', { name: new RegExp(`^${BIRTH_MONTH}`) }).click();

    await expect(page.getByText(SELF_NAME).first()).toBeVisible();

    if (seesWholeOrg) {
      await expect(page.getByText(COLLEAGUE_NAME).first()).toBeVisible();
    } else {
      await expect(page.getByText(COLLEAGUE_NAME)).toHaveCount(0);
    }
  });

  test('the activity stream names only people this account may see', async () => {
    await page.goto('/dashboard/recent-activity');
    await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByText(SELF_NAME).first()).toBeVisible();

    if (seesWholeOrg) {
      await expect(page.getByText(COLLEAGUE_NAME).first()).toBeVisible();
    } else {
      await expect(page.getByText(COLLEAGUE_NAME)).toHaveCount(0);
    }
  });

  test('organisation-wide KPI graphs are not an employee module', async () => {
    await page.goto('/dashboard/kpi-graphs');

    if (isEmployee) {
      // RequireModuleAccess renders the refusal in place rather than
      // redirecting, so the URL is not the thing to assert on.
      await expect(page.getByRole('heading', { name: /Access Restricted/ })).toBeVisible({
        timeout: 20_000,
      });
    } else {
      // Manager holds Reports & Analytics at `view`, so the page renders for
      // both remaining personas.
      await expect(page.getByText('Total Employees').first()).toBeVisible({ timeout: 20_000 });
    }
  });
});
