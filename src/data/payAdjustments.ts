/**
 * One-off pay: what a month pays or recovers beyond the salary.
 *
 * Payroll could pay nothing outside CTC — `bonus` was a constant 0 — so a
 * Diwali bonus, a sales incentive, a referral payout, a salary advance being
 * recovered or a correction was paid outside the system, and that month's
 * payslip, TDS, ESI and bank file were all wrong. HR enters these on the
 * Payroll page for the month before running it; `buildPayslipComponents`
 * includes them and the payslip records them.
 *
 * An earning marked taxable is income for TDS and ESI. Provident fund is not
 * computed on them: bonus, incentives and one-off payments are outside PF
 * wages. A deduction comes off net pay.
 *
 * The store is HR's and Admin's alone, read and write (firestore.rules), like
 * payroll runs: it is a list of what individuals are being paid.
 */
import type { PayAdjustment } from '@/types';
import { persistentCollection } from '@/data/persistence';

export type { PayAdjustment };

const store = persistentCollection<PayAdjustment>(
  'modcon.hr.payAdjustments',
  'modcon-hr-pay-adjustments-changed',
  () => [],
  'payAdjustments',
  'orgAdmin',
);

export const PAY_ADJUSTMENTS_CHANGED_EVENT = store.changedEvent;
export const getPayAdjustments = () => store.get();
export const savePayAdjustments = (next: PayAdjustment[]) => store.save(next);

/** This person's adjustments for one month. */
export function adjustmentsFor(employeeId: string, month: string): PayAdjustment[] {
  return store.get().filter((a) => a.employeeId === employeeId && a.month === month);
}
