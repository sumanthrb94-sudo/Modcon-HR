import type { Payslip, PayrollRun, PayrollRunStatus } from '@/types';
import type { Employee } from '@/types';
import { employees } from '@/data/employees';
import { isMockDataCleared } from '@/lib/mockDataFlag';
import { currentMonthIso } from '@/lib/today';
import { persistentCollection } from '@/data/persistence';

// ---------------------------------------------------------------------------
// Salary component builder
// ---------------------------------------------------------------------------

export interface PayslipComponents {
  monthly: number;
  basic: number;
  hra: number;
  specialAllowance: number;
  bonus: number;
  pf: number;
  tax: number;
  otherDeductions: number;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
}

function computeTax(grossAnnual: number): number {
  // Simplified new-regime slab for demo
  if (grossAnnual <= 300000) return 0;
  if (grossAnnual <= 700000) return Math.round((grossAnnual - 300000) * 0.05);
  if (grossAnnual <= 1000000) return 20000 + Math.round((grossAnnual - 700000) * 0.1);
  if (grossAnnual <= 1200000) return 50000 + Math.round((grossAnnual - 1000000) * 0.15);
  if (grossAnnual <= 1500000) return 80000 + Math.round((grossAnnual - 1200000) * 0.2);
  return 140000 + Math.round((grossAnnual - 1500000) * 0.3);
}

export function buildPayslipComponents(employee: Employee): PayslipComponents {
  const monthly = Math.round(employee.ctc / 12);
  const basic = Math.round(monthly * 0.4);
  const hra = Math.round(monthly * 0.2);
  const specialAllowance = monthly - basic - hra;
  const bonus = 0; // no bonus in regular month
  const grossEarnings = basic + hra + specialAllowance + bonus;

  const pf = Math.round(basic * 0.12);
  const annualGross = grossEarnings * 12;
  const annualTax = computeTax(annualGross);
  const tax = Math.round(annualTax / 12);
  const otherDeductions = employee.ctc >= 5000000 ? Math.round(monthly * 0.005) : 0;

  const totalDeductions = pf + tax + otherDeductions;
  const netPay = grossEarnings - totalDeductions;

  return { monthly, basic, hra, specialAllowance, bonus, pf, tax, otherDeductions, grossEarnings, totalDeductions, netPay };
}

export function buildPayslip(employee: Employee, month = currentMonthIso(), status: PayrollRunStatus = 'Paid'): Payslip {
  const c = buildPayslipComponents(employee);
  return {
    id: `ps-${employee.id}-${month}`,
    employeeId: employee.id,
    month,
    basic: c.basic,
    hra: c.hra,
    specialAllowance: c.specialAllowance,
    bonus: c.bonus,
    pf: c.pf,
    tax: c.tax,
    otherDeductions: c.otherDeductions,
    grossEarnings: c.grossEarnings,
    totalDeductions: c.totalDeductions,
    netPay: c.netPay,
    status,
  };
}

// ---------------------------------------------------------------------------
// Current month payslips — all employees, May 2026
// ---------------------------------------------------------------------------

export const payslips: Payslip[] = isMockDataCleared() ? [] : employees.map((e) => buildPayslip(e, '2026-05', 'Paid'));

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
  const components = onRoll.map(buildPayslipComponents);

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

const payslipStore = persistentCollection<Payslip>(
  'modcon.hr.payslips',
  'modcon-hr-payslips-changed',
  () => payslips,
);

export const PAYSLIPS_CHANGED_EVENT = payslipStore.changedEvent;
export const getPayslips = () => payslipStore.get();
export const savePayslips = (next: Payslip[]) => payslipStore.save(next);
