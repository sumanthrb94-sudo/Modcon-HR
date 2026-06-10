import type { Payslip, PayrollRun, PayrollRunStatus } from '@/types';
import type { Employee } from '@/types';
import { employees } from '@/data/employees';

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

export function buildPayslip(employee: Employee, month = '2026-05', status: PayrollRunStatus = 'Paid'): Payslip {
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

export const payslips: Payslip[] = employees.map((e) => buildPayslip(e, '2026-05', 'Paid'));

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

export const payrollRuns: PayrollRun[] = runMonths.map((rm, i) => {
  const grossTotal = payslips.reduce((s, p) => s + p.grossEarnings, 0);
  const netTotal = payslips.reduce((s, p) => s + p.netPay, 0);
  // Slight variation per month for realism
  const factor = [0.97, 0.98, 0.99, 1.0, 1.0, 1.0][i];
  return {
    id: `pr-${rm.month}`,
    month: rm.month,
    status: rm.status,
    employeeCount: employees.length,
    grossTotal: Math.round(grossTotal * factor),
    netTotal: Math.round(netTotal * factor),
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
