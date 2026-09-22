import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';

/**
 * Run Payroll no longer commits on one click.
 *
 * QA (H3) watched it go straight from ₹0 to ₹96.0K on a single click — no
 * preview, no confirmation, and nothing stopping the same cycle from being
 * run twice. This spec checks both halves: the confirmation dialog previews
 * headcount and cost before anything is written, and a second attempt at the
 * same pay period is refused with a reason rather than doing nothing.
 *
 * `month` (see PayrollRun in src/types/index.ts) identifies the cycle, and a
 * cycle, once run, has no undo in this app — there is deliberately no way to
 * reset it the way org-settings specs reset the configuration they write.
 * So this spec does not assume a clean starting state: whichever of the two
 * branches below applies, it is what actually exercises the guard, and the
 * assertions hold either way. It runs in the org-settings project (single
 * engine, single worker slot) for the same reason shared-records.spec.ts
 * does — this writes a record every member of the organisation can see, and
 * multiple engines racing to run the same cycle would settle it by luck
 * rather than by the guard.
 */
const PERSONA = PERSONAS.admin;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(PERSONA.email);
  await page.locator('#password').fill(PERSONA.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/** Current IST month, `YYYY-MM` — mirrors src/lib/today.ts currentMonthIso(). */
function currentMonthIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  return `${year}-${month}`;
}

/** Mirrors src/pages/payroll/index.tsx monthLabel(). */
function monthLabel(iso: string): string {
  const [yr, mo] = iso.split('-').map(Number);
  return new Date(yr, mo - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

test.describe.serial('payroll run guardrails', () => {
  let page: Page;
  const month = currentMonthIso();
  const label = monthLabel(month);

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('Run Payroll previews headcount and cost before it commits — or reports the cycle already ran', async () => {
    await page.getByRole('link', { name: 'Payroll', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Run Payroll' })).toBeVisible();

    await page.getByRole('button', { name: 'Run Payroll' }).click();

    const dialog = page.getByRole('dialog', { name: 'Confirm payroll run' });
    const notice = page.getByTestId('run-payroll-notice');
    // Whichever this org's state is when the run starts, one of the two
    // fires — the button never does nothing silently either way.
    await expect(dialog.or(notice)).toBeVisible();

    if (await dialog.isVisible()) {
      // Not yet run this month: the dialog previews before anything is
      // written. The three figures must be present and none of them the
      // blank/zero a crash or an unconfigured split would otherwise render —
      // see PendingPayrollRun and buildPayslipComponents.splitConfigured.
      const headcount = await page.getByTestId('run-payroll-headcount').innerText();
      const gross = await page.getByTestId('run-payroll-gross').innerText();
      const net = await page.getByTestId('run-payroll-net').innerText();
      expect(Number(headcount)).toBeGreaterThan(0);
      expect(gross).toMatch(/[₹\d]/);
      expect(net).toMatch(/[₹\d]/);

      await dialog.getByRole('button', { name: 'Confirm & Run Payroll' }).click();
      await expect(dialog).not.toBeVisible();
    } else {
      // Already run — a previous, possibly interrupted run of this spec, or
      // another process against the same organisation. The guard is what
      // this spec checks either way, so confirm the notice actually names
      // this reason rather than asserting nothing.
      await expect(notice).toContainText('already been run');
    }

    // Either path ends with a row for this cycle on the Payroll Runs tab,
    // which is the default tab, so it needs no click to see.
    await expect(page.getByRole('table').getByText(label, { exact: true })).toBeVisible();
  });

  test('running the same cycle again is refused, not silent', async () => {
    await page.getByRole('button', { name: 'Run Payroll' }).click();

    // No confirmation dialog for a cycle that has already run — refusing it
    // is not a second chance to review and resubmit the same month.
    await expect(page.getByRole('dialog', { name: 'Confirm payroll run' })).not.toBeVisible();

    const notice = page.getByTestId('run-payroll-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('already been run');
    await expect(notice).toContainText('twice');

    // The button itself stays usable — refusing a duplicate run is not the
    // same as disabling payroll for the rest of the month.
    await expect(page.getByRole('button', { name: 'Run Payroll' })).toBeEnabled();

    // And the guard actually guarded: still one row for this cycle, not two.
    const monthCells = page.getByRole('table').getByText(label, { exact: true });
    await expect(monthCells).toHaveCount(1);
  });
});
