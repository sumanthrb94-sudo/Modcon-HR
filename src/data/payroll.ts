import type { Payslip, PayrollRun, PayrollRunStatus } from '@/types';
import type { Employee } from '@/types';
import { employees } from '@/data/employees';
import { isMockDataCleared } from '@/lib/mockDataFlag';
import { currentMonthIso } from '@/lib/today';
import { persistentCollection } from '@/data/persistence';
import { getAttendanceRecords } from '@/data/attendance';
import { getSalaryStructureFor, splitMonthlyGross } from '@/data/salaryStructure';
import {
  getTaxElectionFor,
  professionalTaxScheduleForLocation,
  statutoryConfigOrNone,
  taxRegimeFor,
} from '@/data/statutory';
import {
  annualIncomeTax,
  epfContribution,
  esiContribution,
  monthlyTds,
  monthsLeftInFinancialYear,
  professionalTax,
  resolveMonthlyGross,
  wageFloorFinding,
  type EpfContribution,
  type EsiContribution,
  type WageFloorFinding,
} from '@/data/statutoryRules';

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
  /**
   * The employee's own EPF contribution — the same figure as
   * `statutory.epf.employee`, kept here because `pf` is part of the shared
   * `Payslip` shape and of documents already written to Firestore.
   */
  pf: number;
  /** TDS withheld this month. Mirrors `statutory.tds` for the same reason. */
  tax: number;
  otherDeductions: number;
  /**
   * Everything the statutory engine computed, or `null` for an organisation
   * that has declared no registration.
   *
   * Null rather than a block of zeroes, and every surface has to tell them
   * apart: zero PF is a contribution that came out at nothing, no PF is a
   * company that does not run the scheme. Same reasoning as `splitConfigured`
   * above and as the unset holiday calendar. See data/statutory.ts.
   */
  statutory: StatutoryBreakdown | null;
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

/** What the statutory engine withheld and what it cost the employer. */
export interface StatutoryBreakdown {
  /** One month of the CTC on the employee's record. */
  readonly monthlyCtc: number;
  /**
   * True when the employer's contributions were taken out of that CTC rather
   * than added to it — the organisation's choice, and the one that decides
   * whether switching EPF on lowers anybody's gross. See `resolveMonthlyGross`.
   */
  readonly employerShareInCtc: boolean;
  /** The rupee or two of CTC that no gross can spend. Usually zero. */
  readonly ctcVariance: number;
  /** Null when the organisation is not registered for EPF. */
  readonly epf: EpfContribution | null;
  /** Null when not registered for ESI; `covered: false` when over the threshold. */
  readonly esi: EsiContribution | null;
  /**
   * Professional tax withheld, and the state it was withheld under.
   *
   * `state` is null when the employee's work location has not been mapped to
   * one, which deducts nothing — another state's slab is simply a wrong
   * deduction, so a missing mapping fails in the direction that does not take
   * somebody's money. Settings lists the unmapped locations.
   */
  readonly professionalTax: { readonly amount: number; readonly state: string | null } | null;
  /** TDS for the month, or null when the organisation does not withhold. */
  readonly tds: number | null;
  /** The projection the month's TDS was derived from. */
  readonly taxProjection: {
    readonly regime: 'new' | 'old';
    readonly projectedAnnualSalary: number;
    readonly annualTax: number;
    readonly monthsRemaining: number;
    readonly alreadyDeducted: number;
  } | null;
  /** Every rupee withheld from the employee under a statutory head. */
  readonly employeeTotal: number;
  /** Every rupee the employer pays on top of the salary. */
  readonly employerTotal: number;
  /**
   * How the salary structure stands against the Code on Wages floor.
   *
   * A finding, never applied. `statutoryWages` is what contributions are owed
   * on where Basic falls short; recomputing everybody's PF on a figure the
   * company never agreed to is the behaviour this codebase refuses everywhere
   * else, so an administrator restructures or contributes on it deliberately.
   * Null when the organisation has switched the check off, or has no split to
   * check.
   */
  readonly wageFloor: WageFloorFinding | null;
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

// `computeTax` used to sit here: a simplified new-regime slab table, exported,
// documented as "retained but not applied", and called by nothing. It has been
// removed rather than wired up, because it was wrong in ways that only mattered
// once something did call it — stale slabs, no §87A rebate, no standard
// deduction, no cess, no surcharge — and a second, worse definition of income
// tax beside the real one is how a payslip eventually gets computed with the
// wrong one. `annualIncomeTax` in data/statutoryRules.ts is the definition now,
// and it is unit tested.

export function buildPayslipComponents(
  employee: Employee,
  month: string = currentMonthIso(),
): PayslipComponents {
  const monthlyCtc = Math.round(employee.ctc / 12);

  // What this organisation has declared it is registered for. All-off for one
  // that has declared nothing, which is every organisation until an
  // administrator visits Settings → Payroll Compliance — and an all-off config
  // produces exactly the payslip this function produced before the statutory
  // engine existed. See data/statutory.ts for why nothing is on by default.
  const config = statutoryConfigOrNone();
  const election = getTaxElectionFor(employee.id);
  const structure = getSalaryStructureFor(employee.id);

  // The split *this employee* is paid on — theirs where HR has uploaded one,
  // the organisation's otherwise. Read at call time rather than captured at
  // module load: an administrator can change either in Settings, and every
  // surface that shows a breakdown re-renders on the change event. Null when
  // neither exists — see `splitConfigured`.
  const basicOf = (gross: number) => {
    if (election.pfExempt) return 0;
    return splitMonthlyGross(gross, structure)?.basic ?? 0;
  };

  const esiOptions = {
    hasDisability: election.hasDisability === true,
  };

  // Gross is CTC ÷ 12 unless the organisation says its employer contributions
  // come out of the CTC it quoted, in which case they do. Nothing else here
  // moves anybody's gross — a settings toggle that quietly changed what people
  // are paid without saying which arrangement it had assumed would be the one
  // unforgivable thing this module could do, so that arrangement is a declared
  // choice with both options spelled out in Settings.
  const resolved = resolveMonthlyGross({ monthlyCtc, config, wagesOf: basicOf, esi: esiOptions });
  const monthly = resolved.grossEarnings;

  const split = splitMonthlyGross(monthly, structure);
  const { basic, hra, medicalAllowance, conveyanceAllowance, specialAllowance } =
    split ?? { basic: 0, hra: 0, medicalAllowance: 0, conveyanceAllowance: 0, specialAllowance: 0 };
  const bonus = 0; // no bonus in regular month
  // The month's pay, which is known whether or not the split is: the components
  // sum to `monthly` by construction when there is a structure, and an
  // unconfigured organisation still pays its people.
  const grossEarnings = monthly + bonus;

  // ---- Statutory ----------------------------------------------------------
  //
  // Each of these is null unless the organisation declared the registration,
  // and each is computed on its own base: EPF on the PF-liable wage (Basic),
  // ESI and professional tax on the month's gross, TDS on the projected year.
  // Computing them all from one figure is the mistake worth naming — PF on
  // gross would roughly double every deduction in the country.
  const epf = election.pfExempt ? null : epfContribution(basic, config);
  const esi = esiContribution(grossEarnings, config, esiOptions);

  const ptSchedule = professionalTaxScheduleForLocation(employee.location, config);
  const ptAmount = professionalTax(grossEarnings, ptSchedule, month);

  // TDS is a year's liability spread over the months that remain, so it needs a
  // projection of the year rather than this month alone. The projection is this
  // month's gross annualised: the honest estimate an employer can make in
  // month one, and it self-corrects, because `taxDeductedSoFar` credits what
  // has already been withheld against the rest of the year the moment the
  // figure moves.
  const monthsRemaining = monthsLeftInFinancialYear(month);
  const projectedAnnualSalary = grossEarnings * 12;
  const assessment = config.incomeTax.enabled
    ? annualIncomeTax({
      grossSalary: projectedAnnualSalary,
      regime: taxRegimeFor(employee.id, config),
      otherDeductions: election.declaredDeductions ?? 0,
    })
    : null;
  const alreadyDeducted = election.taxDeductedSoFar ?? 0;
  const tds = assessment
    ? monthlyTds({ annualTax: assessment.annualTax, monthsRemaining, alreadyDeducted })
    : null;

  // A finding, not a correction — see the note on `StatutoryBreakdown.wageFloor`.
  const wageFloor = config.enforceWageFloor && split
    ? wageFloorFinding({ wages: basic, totalRemuneration: grossEarnings })
    : null;

  const pf = epf?.employee ?? 0;
  const tax = tds ?? 0;
  const esiEmployee = esi?.employee ?? 0;
  const otherDeductions = esiEmployee + ptAmount;

  const statutory: StatutoryBreakdown | null =
    epf || esi || config.professionalTax.enabled || assessment || wageFloor
      ? {
        monthlyCtc,
        employerShareInCtc: resolved.carvedFromCtc,
        ctcVariance: resolved.ctcVariance,
        epf,
        esi,
        professionalTax: config.professionalTax.enabled
          ? { amount: ptAmount, state: ptSchedule?.state ?? null }
          : null,
        tds,
        taxProjection: assessment
          ? {
            regime: assessment.regime,
            projectedAnnualSalary,
            annualTax: assessment.annualTax,
            monthsRemaining,
            alreadyDeducted,
          }
          : null,
        employeeTotal: pf + esiEmployee + ptAmount + tax,
        employerTotal: resolved.employerCost,
        wageFloor,
      }
      : null;

  const payableDays = daysInMonth(month);
  const lopDays = lossOfPayDays(employee.id, month);
  const lossOfPay = Math.round((grossEarnings / payableDays) * lopDays);

  const totalDeductions = lossOfPay + pf + tax + otherDeductions;
  const netPay = grossEarnings - totalDeductions;

  return {
    monthly, splitConfigured: split !== null,
    basic, hra, medicalAllowance, conveyanceAllowance, specialAllowance, bonus,
    pf, tax, otherDeductions, lossOfPay, lopDays, payableDays,
    statutory,
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
    // Loss of pay, ESI and professional tax all ride in `otherDeductions` on the
    // stored payslip: `Payslip` is the shared shape, documents in that shape are
    // already written to Firestore, and gaining three fields would leave every
    // stored payslip missing them. PF and TDS have their own fields and keep
    // them. `buildPayslipComponents().statutory` is where a live view gets the
    // heads separately; a stored payslip is a record of what was paid, and the
    // total is what was paid.
    otherDeductions: c.lossOfPay + c.otherDeductions,
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
  'payrollRuns',
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
  'payslips',
);

export const PAYSLIPS_CHANGED_EVENT = payslipStore.changedEvent;
export const getPayslips = () => payslipStore.get();
export const savePayslips = (next: Payslip[]) => payslipStore.save(next);

/**
 * The deduction lines a payslip shows, in the order they are shown.
 *
 * One definition, because there are three surfaces that show them — the
 * Payroll modal, Finance, and the profile's Compensation tab — and three
 * hand-written lists is three chances for one of them to label ESI as loss of
 * pay. Which is exactly what happened: Finance rendered `otherDeductions` under
 * the label "Loss of Pay (unpaid absence)" while the loss of pay was in
 * `lossOfPay`, so the row read ₹0 whatever the person's absence.
 *
 * **A head that computed to zero is omitted, not shown as zero.** "PF ₹0" reads
 * as a contribution that was calculated and came to nothing, which is a
 * different statement from an organisation that does not run the scheme — and
 * the second is the common case here, since every scheme is off until an
 * administrator declares it. The exception is loss of pay, which is always
 * listed: a payslip that says nothing about absence is one nobody can check.
 */
export function deductionRows(
  components: PayslipComponents,
): Array<{ label: string; value: number; hint?: string }> {
  const rows: Array<{ label: string; value: number; hint?: string }> = [
    {
      label: 'Loss of Pay (unpaid absence)',
      value: components.lossOfPay,
      hint: components.lopDays > 0
        ? `${components.lopDays} of ${components.payableDays} days`
        : undefined,
    },
  ];

  const s = components.statutory;
  if (!s) return rows;

  if (s.epf && s.epf.employee > 0) {
    rows.push({
      label: 'Provident Fund (employee)',
      value: s.epf.employee,
      hint: `12% of ₹${s.epf.pfWages.toLocaleString('en-IN')}`,
    });
  }
  if (s.esi?.covered && s.esi.employee > 0) {
    rows.push({ label: 'ESI (employee)', value: s.esi.employee, hint: '0.75% of gross' });
  }
  if (s.professionalTax && s.professionalTax.amount > 0) {
    rows.push({
      label: 'Professional Tax',
      value: s.professionalTax.amount,
      hint: s.professionalTax.state ?? undefined,
    });
  }
  if (s.tds !== null && s.tds > 0) {
    rows.push({
      label: 'Tax Deducted at Source',
      value: s.tds,
      hint: s.taxProjection
        ? `${s.taxProjection.regime === 'old' ? 'Old' : 'New'} regime, `
          + `${s.taxProjection.monthsRemaining} month${s.taxProjection.monthsRemaining === 1 ? '' : 's'} left`
        : undefined,
    });
  }

  return rows;
}

/**
 * What the employer pays on top of the salary, for the CTC reconciliation.
 *
 * Never deducted from anybody and never part of `totalDeductions` — shown so an
 * employer can see what a person costs, and so the CTC on the record reconciles
 * against the gross on the payslip when the two differ.
 */
export function employerContributionRows(
  components: PayslipComponents,
): Array<{ label: string; value: number }> {
  const s = components.statutory;
  if (!s) return [];
  const rows: Array<{ label: string; value: number }> = [];
  if (s.epf) {
    if (s.epf.employerPension > 0) rows.push({ label: 'Pension (EPS)', value: s.epf.employerPension });
    if (s.epf.employerProvidentFund > 0) {
      rows.push({ label: 'Provident Fund (employer)', value: s.epf.employerProvidentFund });
    }
    if (s.epf.edli > 0) rows.push({ label: 'EDLI', value: s.epf.edli });
    if (s.epf.adminCharge > 0) rows.push({ label: 'EPFO admin charge', value: s.epf.adminCharge });
  }
  if (s.esi?.covered && s.esi.employer > 0) {
    rows.push({ label: 'ESI (employer)', value: s.esi.employer });
  }
  return rows;
}
