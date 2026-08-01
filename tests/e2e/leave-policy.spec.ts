import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { type Persona } from './config';

/**
 * The organisation's leave policy, as each role actually sees it.
 *
 * Entitlement is derived from the policy and the date rather than stored (see
 * src/data/leaveEntitlements.ts), so these assertions are about the rules
 * holding rather than about a seeded number: Casual and Sick accrue monthly and
 * are never presented as an annual quota, and the year they reset in is the
 * financial year, not the calendar year.
 *
 * The accrued figure itself is deliberately not asserted — it changes every
 * month, and a test needing an edit each April is a test people delete. The
 * month-boundary arithmetic (1 April resets to 1, 31 March holds 12, mid-year
 * joiners accrue from their joining month) is exact logic covered away from the
 * browser; what matters here is that the page presents a monthly rate and a
 * financial year at all.
 *
 * Runs per persona because the balance cards only render for someone with
 * employees in scope — the employee persona has no directory record of its own,
 * so it sees the framing but no cards.
 */

function persona(): Persona {
  const p = test.info().project.metadata?.persona as Persona | undefined;
  if (!p) throw new Error('No persona configured for this project');
  return p;
}

test.describe.serial('leave policy', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    const p = persona();
    await page.goto('/login');
    await page.locator('#username').fill(p.email);
    await page.locator('#password').fill(p.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('balances are scoped to the financial year, not the calendar year', async () => {
    await page.goto('/leave');
    await page.getByRole('button', { name: /Leave Balance/ }).click();
    // April-March. A calendar-year label here would mean the reset is wrong.
    await expect(page.getByText(/FY \d{4}-\d{2}/).first()).toBeVisible();
    await expect(page.getByText(/do not survive 1 April/)).toBeVisible();
  });

  test('Casual and Sick carry a monthly rate, never an annual quota', async () => {
    await page.goto('/leave');
    await page.getByRole('button', { name: /Leave Balance/ }).click();

    if (persona().role === 'employee') {
      // No directory record, so no cards — the framing is all this persona
      // can assert, and the suppression below still applies.
      await expect(page.getByText(/FY \d{4}-\d{2}/).first()).toBeVisible();
    } else {
      await expect(page.getByText('1/month').first()).toBeVisible();
    }

    // The suppression the policy asks for: an annual Casual/Sick figure must
    // not appear anywhere, or an employee could believe a year's leave is
    // available in April.
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    expect(text).not.toMatch(/Casual \d+ days\/year/);
    expect(text).not.toMatch(/Sick \d+ days\/year/);
  });

  test('every employee in scope has a balance card, not only the seeded ones', async () => {
    test.skip(persona().role !== 'admin', 'needs the whole directory in scope');
    await page.goto('/leave');
    await page.getByRole('button', { name: /Leave Balance/ }).click();
    // Rohan Iyer carries no seeded balance row. Entitlement is derived from the
    // policy and his joining date, so the absence was never a reason to leave
    // him off the tab.
    await expect(page.getByText('Rohan Iyer').first()).toBeVisible();
  });

  test('the balances can be searched down to one employee', async () => {
    test.skip(persona().role !== 'admin', 'needs the whole directory in scope');
    await page.goto('/leave');
    await page.getByRole('button', { name: /Leave Balance/ }).click();
    await page.getByPlaceholder(/Search name, code or department/).fill('Rohan');
    await expect(page.getByText(/Showing 1 of \d+ employees/)).toBeVisible();
    await expect(page.getByText('Diya Mehta')).toHaveCount(0);
    await expect(page.getByText('Rohan Iyer').first()).toBeVisible();
  });

  test('each type shows the whole financial year, not only what has accrued', async () => {
    await page.goto('/leave');
    await page.getByRole('button', { name: /Leave Balance/ }).click();
    if (persona().role === 'employee') {
      // No directory record, so no cards to carry the figure.
      await expect(page.getByText(/FY \d{4}-\d{2}/).first()).toBeVisible();
      return;
    }
    await expect(page.getByText(/\d+ days for FY \d{4}-\d{2}/).first()).toBeVisible();
    // The accrued-to-date figure stays beside it — the year total must not
    // replace it, or an employee reads days they cannot yet apply for.
    await expect(page.getByText(/\d+\/\d+ available/).first()).toBeVisible();
  });

  test('the balances survive a reload', async () => {
    await page.goto('/leave');
    await page.reload();
    await page.getByRole('button', { name: /Leave Balance/ }).click();
    await expect(page.getByText(/FY \d{4}-\d{2}/).first()).toBeVisible();
  });

  // ---- Applying leave against the policy ----------------------------------
  //
  // The dialog used to be policy-blind: every type offered to everyone,
  // calendar days counted whatever the calendar held, and any number of days
  // accepted against any balance. These assert the four rules it now applies
  // while the form is being filled in, not at approval time.
  //
  // Admin only: the dialog can only be driven by someone with employees in
  // scope, and the admin persona is the one that sees the whole directory.
  // Dates are computed from today rather than written down — a spec with a
  // date literal in it starts failing on its own.

  /** `days` days from today as YYYY-MM-DD, walked in UTC like the app's dates. */
  function isoInDays(days: number): string {
    const d = new Date(new Date().toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /** The first Sunday at least `from` days out — the default week-off. */
  function nextSunday(from = 4): string {
    for (let i = from; i < from + 7; i += 1) {
      const iso = isoInDays(i);
      if (new Date(iso).getUTCDay() === 0) return iso;
    }
    throw new Error('no Sunday in the next seven days');
  }

  const dialog = () => page.getByRole('dialog');
  const employeeSelect = () => dialog().locator('select').first();
  const typeSelect = () => dialog().locator('select').nth(1);
  const startDate = () => dialog().locator('input[type="date"]').first();
  const endDate = () => dialog().locator('input[type="date"]').nth(1);

  async function openApply() {
    await page.goto('/leave');
    await page.getByRole('button', { name: 'Apply Leave' }).click();
    await expect(dialog()).toBeVisible();
  }

  test('a type the policy does not grant this employee is not offered', async () => {
    test.skip(persona().role !== 'admin', 'needs the whole directory in scope');
    await openApply();

    // Maternity Leave is "Female employees" in the policy.
    await employeeSelect().selectOption({ label: 'Rohan Iyer (MC-003)' });
    await expect(typeSelect().locator('option', { hasText: 'Maternity' })).toHaveCount(0);
    // Casual is offered, and carries the accrued balance with it.
    await expect(typeSelect().locator('option', { hasText: /^Casual/ })).toHaveCount(1);

    // The same select, same dialog, different employee — this is the
    // interactive part: nothing is reloaded, the policy just re-reads.
    await employeeSelect().selectOption({ label: 'Diya Mehta (MC-002)' });
    await expect(typeSelect().locator('option', { hasText: 'Maternity' })).toHaveCount(1);
  });

  test('a week-off inside the range is not charged', async () => {
    test.skip(persona().role !== 'admin', 'needs the whole directory in scope');
    await openApply();
    await employeeSelect().selectOption({ label: 'Rohan Iyer (MC-003)' });
    await typeSelect().selectOption('Casual');

    const sunday = nextSunday();
    const saturday = new Date(sunday);
    saturday.setUTCDate(saturday.getUTCDate() - 1);
    const monday = new Date(sunday);
    monday.setUTCDate(monday.getUTCDate() + 1);
    await startDate().fill(saturday.toISOString().slice(0, 10));
    await endDate().fill(monday.toISOString().slice(0, 10));

    await expect(dialog().getByText(/week-off \(not charged\)/)).toBeVisible();
    // Two of the three calendar days cost entitlement — one if the org's
    // holiday calendar also falls in the range, which is equally correct.
    await expect(dialog().getByText(/Charged: [12] day\(s\) of 3 calendar day\(s\)/)).toBeVisible();
  });

  test('more days than the balance holds is refused before submit', async () => {
    test.skip(persona().role !== 'admin', 'needs the whole directory in scope');
    await openApply();
    await employeeSelect().selectOption({ label: 'Rohan Iyer (MC-003)' });
    await typeSelect().selectOption('Casual');
    // Casual accrues a day a month, so a month of it cannot be funded whatever
    // month this runs in.
    await startDate().fill(isoInDays(40));
    await endDate().fill(isoInDays(70));

    await expect(dialog().getByText(/day\(s\) of Casual Leave remain/)).toBeVisible();
    await expect(dialog().getByRole('button', { name: 'Submit Request' })).toBeDisabled();
  });

  test('half a day is offered where the policy allows it, and charged as half', async () => {
    test.skip(persona().role !== 'admin', 'needs the whole directory in scope');
    await openApply();
    await employeeSelect().selectOption({ label: 'Rohan Iyer (MC-003)' });
    await typeSelect().selectOption('Casual');

    // A single working day: the next Sunday minus two is a Friday.
    const friday = new Date(nextSunday());
    friday.setUTCDate(friday.getUTCDate() - 2);
    const day = friday.toISOString().slice(0, 10);
    await startDate().fill(day);
    await endDate().fill(day);

    const halfDay = dialog().getByLabel(/Half day/);
    await expect(halfDay).toBeVisible();
    await halfDay.check();
    await expect(dialog().getByText(/Charged: 0.5 day\(s\)/)).toBeVisible();

    await dialog().getByPlaceholder(/reason for leave/).fill('Half day — policy check.');
    await dialog().getByRole('button', { name: 'Submit Request' }).click();
    await expect(dialog()).toBeHidden();
    // What is stored is what the policy charged, not the calendar span.
    await expect(page.getByText('0.5 days').first()).toBeVisible();
  });
});
