/**
 * The month's salary register: one row per person paid, every head in its own
 * column, as the accountant books it.
 *
 * Built from the payslips the run stored — what was paid — not from a fresh
 * computation, so it reconciles with the bank file and the returns. Pure and
 * unit-tested (tests/unit/payrollRegister.test.ts).
 */
import type { Payslip } from '@/types';

export interface RegisterPerson {
  readonly employeeCode: string;
  readonly name: string;
  readonly department?: string;
}

function cell(value: string | number | undefined): string {
  if (value === undefined) return '';
  const text = String(value);
  // A leading = + - @ is a formula in a spreadsheet; quote it so a name cannot
  // run as one.
  const safe = /^[=+\-@]/.test(text) && typeof value === 'string' ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const HEADER = [
  'employee_code',
  'name',
  'department',
  'month',
  'employed_days',
  'gross_earnings',
  'salary_arrears',
  'provident_fund',
  'esi',
  'professional_tax',
  'tds',
  'other_deductions',
  'total_deductions',
  'net_pay',
];

export function payrollRegisterCsv(
  payslips: readonly Payslip[],
  personOf: (employeeId: string) => RegisterPerson | undefined,
): { csv: string; rows: number; totals: { gross: number; deductions: number; net: number } } {
  const sorted = [...payslips].sort((a, b) =>
    (personOf(a.employeeId)?.employeeCode ?? a.employeeId).localeCompare(personOf(b.employeeId)?.employeeCode ?? b.employeeId),
  );
  const lines = [HEADER.join(',')];
  const totals = { gross: 0, deductions: 0, net: 0 };
  for (const p of sorted) {
    const person = personOf(p.employeeId);
    const arrears = (p.salaryArrears ?? []).reduce((sum, a) => sum + a.amount, 0);
    const esi = p.statutoryPaid?.esiEmployee;
    const pt = p.statutoryPaid?.professionalTax;
    // Without recorded heads, ESI and PT are inside `otherDeductions` and are
    // left blank rather than guessed apart.
    const other = p.statutoryPaid ? p.otherDeductions - (esi ?? 0) - (pt ?? 0) : p.otherDeductions;
    lines.push([
      cell(person?.employeeCode ?? p.employeeId),
      cell(person?.name ?? ''),
      cell(person?.department ?? ''),
      cell(p.month),
      cell(p.employedDays),
      cell(p.grossEarnings),
      cell(arrears || undefined),
      cell(p.pf),
      cell(esi),
      cell(pt),
      cell(p.tax),
      cell(other),
      cell(p.totalDeductions),
      cell(p.netPay),
    ].join(','));
    totals.gross += p.grossEarnings + arrears;
    totals.deductions += p.totalDeductions;
    totals.net += p.netPay;
  }
  return { csv: `${lines.join('\n')}\n`, rows: sorted.length, totals };
}
