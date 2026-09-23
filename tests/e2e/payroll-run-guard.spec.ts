import { test, expect, type Page } from '@playwright/test';
import { FIRESTORE_BASE, adminToken, seedOrgRecords } from './firestore';
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

    // Other specs hire into this organisation while this one runs. Anybody on
    // roll without a payslip for the month is offered as a catch-up, which is
    // correct and pays nobody twice; cancel it here, the next test covers it.
    const topUp = page.getByRole('dialog', { name: 'Pay employees missing from this run' });
    if (await topUp.isVisible().catch(() => false)) {
      await topUp.getByRole('button', { name: 'Cancel' }).click();
      await page.getByRole('button', { name: 'Run Payroll' }).click();
      test.skip(await topUp.isVisible(), 'directory still changing under a full run');
    }

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

  // Payroll could only ever be run for the current month, so a month missed
  // or run late could never be paid. The Payroll month selector beside the
  // button reaches the five before it — each still once.
  test('an earlier month can be run from the month selector, once', async () => {
    const [yr, mo] = month.split('-').map(Number);
    const previous = new Date(Date.UTC(yr, mo - 2, 1)).toISOString().slice(0, 7);
    const previousLabel = monthLabel(previous);

    await page.getByRole('combobox', { name: 'Payroll month' }).selectOption(previous);
    await page.getByRole('button', { name: 'Run Payroll' }).click();

    const dialog = page.getByRole('dialog', { name: 'Confirm payroll run' });
    const notice = page.getByTestId('run-payroll-notice');
    await expect(dialog.or(notice)).toBeVisible();
    if (await dialog.isVisible()) {
      await expect(dialog).toContainText(previousLabel);
      await dialog.getByRole('button', { name: 'Confirm & Run Payroll' }).click();
      await expect(dialog).not.toBeVisible();
    } else {
      await expect(notice).toContainText('already been run');
    }
    await expect(page.getByRole('table').getByText(previousLabel, { exact: true })).toHaveCount(1);
  });

  // HR could open a payslip but not download it; the PDF lived only on the
  // employee's Finance page. The modal now offers the same document.
  test('HR downloads an employee payslip as a PDF from Payroll', async () => {
    await page.getByRole('button', { name: /^Payslips/ }).click();
    await page.getByRole('table').locator('tbody tr').first().click();
    const dialog = page.getByRole('dialog', { name: 'Payslip' });
    await expect(dialog).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Download PDF' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^payslip-.+\.pdf$/);
  });

  // A month already run must still be able to pay somebody it missed —
  // QA Zero Org's September run paid one of its people and the month was
  // then locked against the rest. The catch-up pays only the unpaid and adds
  // them to the same run: one row, a larger headcount, nobody paid twice.
  test('someone missing from a run is paid as a catch-up, into the same run', async () => {
    const late = {
      id: 'emp-e2e-catchup', employeeCode: 'E2E-CATCHUP', firstName: 'Catch', lastName: 'Up',
      fullName: 'Catch Up E2E', email: 'e2e-catchup@modcon-hr.test', phone: '+91 90000 00000', avatar: 'brand',
      dateOfBirth: '1990-01-01', designation: 'Engineer', department: 'Engineering', location: 'Bengaluru',
      employmentType: 'Full-time', status: 'Active', dateOfJoining: '2024-01-01', reportingManagerId: null, ctc: 600000,
    };
    await seedOrgRecords('employees', [late]);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Run Payroll' })).toBeVisible({ timeout: 20_000 });
    // The demo organisation also computes a sample payslip for everyone in its
    // directory, so count what the catch-up adds rather than an absolute.
    const catchUpRows = () => page.getByRole('row').filter({ hasText: 'Catch Up E2E' });
    await page.getByRole('button', { name: /^Payslips/ }).click();
    const before = await catchUpRows().count();
    await page.getByRole('button', { name: /^Payroll Runs/ }).click();
    await page.getByRole('combobox', { name: 'Payroll month' }).selectOption(month);
    await page.getByRole('button', { name: 'Run Payroll' }).click();

    const topUp = page.getByRole('dialog', { name: 'Pay employees missing from this run' });
    await expect(topUp).toBeVisible();
    await expect(topUp.getByTestId('run-payroll-topup')).toContainText('Catch Up E2E');
    await topUp.getByRole('button', { name: 'Confirm & Run Payroll' }).click();
    await expect(topUp).not.toBeVisible();

    // Still one row for the month.
    await expect(page.getByRole('table').getByText(label, { exact: true })).toHaveCount(1);
    // And asking again finds nobody left to pay for this person.
    await page.getByRole('button', { name: /^Payslips/ }).click();
    await expect(catchUpRows()).toHaveCount(before + 1);

    const token = await adminToken();
    await fetch(`${FIRESTORE_BASE}/org_records/default__employees__${late.id}`, {
      method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  });

  // The October case. Somebody was paid for last month; an unpaid day in that
  // month was approved afterwards. This month's run has to charge it, and HR
  // has to see that before confirming — it changes a payslip for a reason
  // that is not on this month's own attendance.
  test('loss of pay found after a month was paid is listed before the next run is confirmed', async () => {
    const previous = (() => {
      const [y, m] = month.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 2, 1));
      return d.toISOString().slice(0, 7);
    })();
    // A Thursday in the previous month: never a seeded week-off (Sunday,
    // Monday or Tuesday), so the unpaid day is a working day.
    const thursday = (() => {
      const [y, m] = previous.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 1, 8));
      while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    })();
    const id = 'emp-e2e-arrears';
    const person = {
      id, employeeCode: 'E2E-ARREARS', firstName: 'Carried', lastName: 'Over',
      fullName: 'Carried Over E2E', email: 'e2e-arrears@modcon-hr.test', phone: '+91 90000 00000', avatar: 'brand',
      dateOfBirth: '1990-01-01', designation: 'Engineer', department: 'Engineering', location: 'Bengaluru',
      employmentType: 'Full-time', status: 'Active', dateOfJoining: '2024-01-01', reportingManagerId: null, ctc: 600000,
    };
    // Last month's payslip, as a run records it: paid, and no loss of pay.
    const paid = {
      id: `ps-${id}-${previous}`, employeeId: id, month: previous,
      basic: 0, hra: 0, specialAllowance: 0, bonus: 0, pf: 0, tax: 0, otherDeductions: 0,
      lopDays: 0, grossEarnings: 50000, totalDeductions: 0, netPay: 50000, status: 'Paid',
    };
    // Then an unpaid day in that month, approved after it was paid.
    const leave = {
      id: 'lr-e2e-arrears', employeeId: id, type: 'Unpaid', startDate: thursday, endDate: thursday, days: 1,
      reason: 'E2E carried-over loss of pay.', status: 'Approved', appliedOn: thursday, approverId: null,
    };
    await seedOrgRecords('employees', [person]);
    await seedOrgRecords('payslips', [paid], { employeeId: (r) => r.employeeId });
    await seedOrgRecords('leaveRequests', [leave], { employeeId: (r) => r.employeeId });

    try {
      await page.reload();
      await expect(page.getByRole('button', { name: 'Run Payroll' })).toBeVisible({ timeout: 20_000 });
      await page.getByRole('combobox', { name: 'Payroll month' }).selectOption(month);
      await page.getByRole('button', { name: 'Run Payroll' }).click();

      // A catch-up if this month already ran (the tests above ran it), a
      // first run otherwise: either way this person is in it.
      const dialog = page.getByRole('dialog');
      const arrears = dialog.getByTestId('run-payroll-arrears');
      await expect(arrears).toBeVisible({ timeout: 15_000 });
      const row = arrears.getByRole('row').filter({ hasText: 'Carried Over E2E' });
      await expect(row).toContainText(monthLabel(previous));
      // One day of a ₹50,000 month, at that month's own rate.
      const [py, pm] = previous.split('-').map(Number);
      const perDay = Math.round(50000 / new Date(Date.UTC(py, pm, 0)).getUTCDate());
      await expect(row).toContainText(`Deduct ₹${perDay.toLocaleString('en-IN')}`);

      // Not confirmed: this spec pays nobody it made up.
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).not.toBeVisible();
    } finally {
      const token = await adminToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      for (const doc of [`employees__${id}`, `payslips__${paid.id}`, `leaveRequests__${leave.id}`]) {
        await fetch(`${FIRESTORE_BASE}/org_records/default__${doc}`, { method: 'DELETE', headers });
      }
    }
  });
});
