/**
 * Salary advances and loans, recovered from pay a month at a time.
 *
 * Common in a 10–100 person company and impossible here: nothing could be lent
 * or recovered, so EMIs lived in a spreadsheet and were missed at exit. A loan
 * is a principal, a monthly recovery and the month it starts; each payroll run
 * deducts the smaller of the EMI and what is still owed, and what a payslip
 * recovered is what the next one counts as repaid.
 *
 * Pure, imports nothing, unit-tested (tests/unit/loanRules.test.ts).
 */

export interface Loan {
  id: string;
  employeeId: string;
  /** "Salary advance", "Two-wheeler loan". */
  label: string;
  principal: number;
  /** Recovered each month until repaid. */
  emi: number;
  /** First month recovered, YYYY-MM. */
  startMonth: string;
  givenOn: string;
}

/** What this month recovers for a loan, given what earlier payslips already did. */
export function loanRecovery(loan: Loan, month: string, recoveredBefore: number): number {
  if (month < loan.startMonth) return 0;
  const outstanding = Math.max(0, Math.round(loan.principal) - Math.round(recoveredBefore));
  return Math.min(Math.max(0, Math.round(loan.emi)), outstanding);
}

export function outstandingOn(loan: Loan, recovered: number): number {
  return Math.max(0, Math.round(loan.principal) - Math.round(recovered));
}
