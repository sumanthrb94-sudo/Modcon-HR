import type { Payslip, PayrollRun, PayrollRunStatus } from '@/types';
import type { Employee } from '@/types';
import { employees } from '@/data/employees';
import { isMockDataCleared } from '@/lib/mockDataFlag';
import { currentMonthIso } from '@/lib/today';
import { persistentCollection } from '@/data/persistence';
import { getAttendanceRecords } from '@/data/attendance';
import { getSalaryStructureFor, splitMonthlyGross } from '@/data/salaryStructure';

// ---------------------------------------------------------------------------
// Salary component builder
// ---------------------------------------------------------------------------

export interface PayslipComponents {
  monthly: number;
  /**
   * False when the organisation has not set a salary structure.
   *
   * The pay is still known — gross is CTC ÷ 12 and net is that minus unpaid
   * absence — but how it divides into components is not, so the five figures
   * below are all zero and every surface that shows a breakdown must render
   * "not set" instead of a table of zeroes. See data/salaryStructure.ts.
   */
  splitConfigured: boolean;
  basic: number;
  hra: number;
  medicalAllowance: number;
  conveyanceAllowance: number;
  /** Whatever is left of the monthly gross after the four components above. */
  specialAllowance: number;
  bonus: number;
  pf: number;
  tax: number;
  otherDeductions: number;
  /** Loss of pay for unpaid absence — see `lossOfPayDays`. */
  lossOfPay: number;
  /** Days of unpaid absence the deduction was calculated from. */
  lopDays: number;
  /** Working days in the month, the divisor for the per-day rate. */
  payableDays: number;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
}

/** Days in a `YYYY-MM` month. */
function daysInMonth(month: string): number {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

/**
 * Unpaid absence for an employee in a month, read from attendance.
 *
 * Attendance is the single source for pay deductions: a day is deducted
 * because the attendance record says the person was absent, never because a
 * leave balance went negative or someone keyed a number into payroll. That
 * keeps one register authoritative — if a day is wrong, it is fixed on the
 * attendance sheet (or via a regularization) and payroll follows.
 *
 * Only `Absent` counts. `On Leave` is approved and paid, `Holiday` and
 * `Weekend` are not working days, and `Half Day` deducts half.
 */
export function lossOfPayDays(employeeId: string, month: string): number {
  const records = getAttendanceRecords().filter(
    (r) => r.employeeId === employeeId && r.date.startsWith(month),
  );
  return records.reduce((days, r) => {
    if (r.status === 'Absent') return days + 1;
    if (r.status === 'Half Day') return days + 0.5;
    return days;
  }, 0);
}

/**
 * New-regime slab calculation.
 *
 * Retained but **not applied**: the organisation's policy is that salary
 * deductions derive exclusively from attendance, so income tax is not withheld
 * on the payslip. Kept rather than deleted because reinstating TDS is a policy
 * decision, not a rewrite — wire it back into `buildPayslipComponents` and add
 * it to `totalDeductions`.
 */
export function computeTax(grossAnnual: number): number {
  // Simplified new-regime slab for demo
  if (grossAnnual <= 300000) return 0;
  if (grossAnnual <= 700000) return Math.round((grossAnnual - 300000) * 0.05);
  if (grossAnnual <= 1000000) return 20000 + Math.round((grossAnnual - 700000) * 0.1);
  if (grossAnnual <= 1200000) return 50000 + Math.round((grossAnnual - 1000000) * 0.15);
  if (grossAnnual <= 1500000) return 80000 + Math.round((grossAnnual - 1200000) * 0.2);
  return 140000 + Math.round((grossAnnual - 1500000) * 0.3);
}

export function buildPayslipComponents(
  employee: Employee,
  month: string = currentMonthIso(),
): PayslipComponents {
  const monthly = Math.round(employee.ctc / 12);
  // The split *this employee* is paid on — their own where HR has uploaded one,
  // the organisation's otherwise. Read at call time rather than captured at
  // module load: an administrator can change either in Settings, and every
  // surface that shows a breakdown re-renders on the change event. Null when
  // neither exists — see `splitConfigured`.
  const split = splitMonthlyGross(monthly, getSalaryStructureFor(employee.id));
  const { basic, hra, medicalAllowance, conveyanceAllowance, specialAllowance } =
    split ?? { basic: 0, hra: 0, medicalAllowance: 0, conveyanceAllowance: 0, specialAllowance: 0 };
  const bonus = 0; // no bonus in regular month
  // The month's pay, which is known whether or not the split is: the components
  // sum to `monthly` by construction when there is a structure, and an
  // unconfigured organisation still pays its people.
  const grossEarnings = monthly + bonus;

  // Deductions derive exclusively from attendance, by policy. PF, income tax
  // and the high-CTC levy are therefore not withheld, and are reported as zero
  // rather than removed from the type — those fields are part of the shared
  // Payslip shape and of documents already written to Firestore.
  //
  // The consequence is deliberate and worth being explicit about: net pay is
  // gross minus unpaid absence and nothing else, so these payslips do not model
  // statutory withholding. `computeTax` above is intact for when that changes.
  const pf = 0;
  const tax = 0;
  const otherDeductions = 0;

  const payableDays = daysInMonth(month);
  const lopDays = lossOfPayDays(employee.id, month);
  const lossOfPay = Math.round((grossEarnings / payableDays) * lopDays);

  const totalDeductions = lossOfPay;
  const netPay = grossEarnings - totalDeductions;

  return {
    monthly, splitConfigured: split !== null,
    basic, hra, medicalAllowance, conveyanceAllowance, specialAllowance, bonus,
    pf, tax, otherDeductions, lossOfPay, lopDays, payableDays,
    grossEarnings, totalDeductions, netPay,
  };
}

export function buildPayslip(employee: Employee, month = currentMonthIso(), status: PayrollRunStatus = 'Paid'): Payslip {
  const c = buildPayslipComponents(employee, month);
  return {
    id: `ps-${employee.id}-${month}`,
    employeeId: employee.id,
    month,
    basic: c.basic,
    hra: c.hra,
    medicalAllowance: c.medicalAllowance,
    conveyanceAllowance: c.conveyanceAllowance,
    specialAllowance: c.specialAllowance,
    bonus: c.bonus,
    pf: c.pf,
    tax: c.tax,
    // Loss of pay rides in otherDeductions on the stored payslip: the Payslip
    // type is the shared shape and gaining a field would ripple through
    // Firestore documents and the seed. It is the only deduction there is, so
    // otherDeductions and totalDeductions agree. The day count stays available
    // from buildPayslipComponents for the payslip view.
    otherDeductions: c.lossOfPay,
    grossEarnings: c.grossEarnings,
    totalDeductions: c.totalDeductions,
    netPay: c.netPay,
    status,
  };
}

// ---------------------------------------------------------------------------
// Current month payslips — all employees, May 2026
// ---------------------------------------------------------------------------

/**
 * The demo month's computed payslips — built on demand, never at module load.
 *
 * This was a module-level `const`, which was harmless while the components were
 * literals. It stopped being harmless when they became the organisation's own
 * split: `buildPayslip` now reads `getSalaryStructure()`, and a value captured
 * at module load is captured before `startOrgSettingsSync` has hydrated the
 * cache from Firestore and before an administrator has changed anything in
 * Settings. The Payroll page seeds its list from here, so a frozen array meant
 * its payslip modal kept showing the split that was in effect when the tab was
 * first opened — while the Compensation tab, which recomputes on every render,
 * showed the new one.
 */
export function seedPayslips(): Payslip[] {
  return isMockDataCleared() ? [] : employees.map((e) => buildPayslip(e, '2026-05', 'Paid'));
}

// ---------------------------------------------------------------------------
// Payroll runs — last 6 months
// ---------------------------------------------------------------------------

const runMonths: Array<{ month: string; status: PayrollRunStatus; processedOn: string | null }> = [
  { month: '2025-12', status: 'Paid',       processedOn: '2025-12-31' },
  { month: '2026-01', status: 'Paid',       processedOn: '2026-01-31' },
  { month: '2026-02', status: 'Paid',       processedOn: '2026-02-28' },
  { month: '2026-03', status: 'Paid',       processedOn: '2026-03-31' },
  { month: '2026-04', status: 'Completed',  processedOn: '2026-04-30' },
  { month: '2026-05', status: 'Paid',       processedOn: '2026-05-31' },
];

/** Last instant of a "YYYY-MM" month. */
function endOfMonth(month: string): Date {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m, 0, 23, 59, 59);
}

// runMonths is a fixed list independent of `employees`/`payslips`, so it
// must be explicitly gated too — otherwise a cleared/empty org would still
// see 6 hardcoded payroll run rows (just with zeroed-out totals).
//
// Each run is costed from the people actually on roll that month — those who
// had joined by its month-end — using their real CTC. The month-to-month
// variation therefore comes from real joining dates. The previous version
// applied a literal factor of [0.97, 0.98, 0.99, 1, 1, 1] to the *current*
// payslip total "for realism", and reported today's headcount for every
// historical month, so December 2025 claimed staff who had not joined yet.
export const payrollRuns: PayrollRun[] = isMockDataCleared() ? [] : runMonths.map((rm) => {
  const asOf = endOfMonth(rm.month);
  const onRoll = employees.filter((employee) => new Date(employee.dateOfJoining) <= asOf);
  // Wrapped, not passed by reference: map()'s index argument would otherwise
  // arrive as `month` and silently mis-scope the attendance lookup.
  const components = onRoll.map((employee) => buildPayslipComponents(employee, rm.month));

  return {
    id: `pr-${rm.month}`,
    month: rm.month,
    status: rm.status,
    employeeCount: onRoll.length,
    grossTotal: components.reduce((sum, c) => sum + c.grossEarnings, 0),
    netTotal: components.reduce((sum, c) => sum + c.netPay, 0),
    processedOn: rm.processedOn,
  };
});

// ---------------------------------------------------------------------------
// Chart helper — salary cost by department
// ---------------------------------------------------------------------------

export function salaryByDepartment(): Array<{ department: string; total: number }> {
  const map = new Map<string, number>();
  employees.forEach((e) => {
    const monthly = Math.round(e.ctc / 12);
    map.set(e.department, (map.get(e.department) ?? 0) + monthly);
  });
  return Array.from(map.entries())
    .map(([department, total]) => ({ department, total }))
    .sort((a, b) => b.total - a.total);
}

// ---- Persistence ------------------------------------------------------------
// Processing a payroll run changed React state only, so the run went back to
// Draft on the next refresh — the app appearing to forget that payroll had
// been run is about the worst version of this bug.
const payrollRunStore = persistentCollection<PayrollRun>(
  'modcon.hr.payrollRuns',
  'modcon-hr-payroll-runs-changed',
  () => payrollRuns,
);

export const PAYROLL_RUNS_CHANGED_EVENT = payrollRunStore.changedEvent;
export const getPayrollRuns = () => payrollRunStore.get();
export const savePayrollRuns = (next: PayrollRun[]) => payrollRunStore.save(next);

// The seed is a thunk on purpose: `get()` falls back to it whenever this
// organisation has no stored payslips, and that fallback must reflect the
// salary structure as it stands at the moment of the call, not at import time.
const payslipStore = persistentCollection<Payslip>(
  'modcon.hr.payslips',
  'modcon-hr-payslips-changed',
  seedPayslips,
);

export const PAYSLIPS_CHANGED_EVENT = payslipStore.changedEvent;
export const getPayslips = () => payslipStore.get();
export const savePayslips = (next: Payslip[]) => payslipStore.save(next);
