/**
 * The organisation's record of salary advances and loans — see data/loanRules.ts.
 * HR and Admin only, read and write, like the one-off pay it becomes.
 */
import { persistentCollection } from '@/data/persistence';
import { loanRecovery, outstandingOn, type Loan } from '@/data/loanRules';
import type { Payslip } from '@/types';

export type { Loan };

const store = persistentCollection<Loan>('modcon.hr.loans', 'modcon-hr-loans-changed', () => [], 'loans', 'orgAdmin');

export const LOANS_CHANGED_EVENT = store.changedEvent;
export const getLoans = () => store.get();
export const saveLoans = (next: Loan[]) => store.save(next);

/** What earlier payslips recovered for a loan. */
export function recoveredSoFar(loanId: string, payslips: readonly Payslip[], beforeMonth: string): number {
  return payslips
    .filter((p) => p.month < beforeMonth)
    .flatMap((p) => p.adjustments ?? [])
    .filter((a) => a.loanId === loanId)
    .reduce((sum, a) => sum + a.amount, 0);
}

/** This month's loan recoveries for one person, as payslip deductions. */
export function loanDeductionsFor(employeeId: string, month: string, payslips: readonly Payslip[]) {
  return store
    .get()
    .filter((l) => l.employeeId === employeeId)
    .map((l) => ({ loan: l, amount: loanRecovery(l, month, recoveredSoFar(l.id, payslips, month)) }))
    .filter((r) => r.amount > 0)
    .map(({ loan, amount }) => ({ label: `${loan.label} recovery`, amount, kind: 'deduction' as const, taxable: false, loanId: loan.id }));
}

/** What is still owed across someone's loans, after every payslip so far. */
export function outstandingFor(employeeId: string, payslips: readonly Payslip[]): number {
  return store
    .get()
    .filter((l) => l.employeeId === employeeId)
    .reduce((sum, l) => sum + outstandingOn(l, recoveredSoFar(l.id, payslips, '9999-12')), 0);
}
