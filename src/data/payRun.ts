/**
 * Who a payroll run pays — pure, so `npm run test:unit` reaches it.
 *
 * A run for a month pays the people on roll for that month: joined by its
 * last day, and not resigned. The Payroll page asks this before it previews a
 * run, and refuses to confirm one that would pay nobody.
 */
import type { Employee } from '@/types';

/**
 * The months a run may be for, newest first: this one back to April (the start
 * of the financial year), or back six months, whichever reaches further — so
 * never more than twelve.
 *
 * It was always six. A company that went live in October with its people on
 * the roll since April could pay April only by hand outside the app, which left
 * the first half of the year missing from every payslip-derived figure — the
 * TDS credit included, so the rest of the year was taxed as though nothing had
 * been withheld. Reaching back to April lets the whole year be paid here, and
 * stopping there keeps a catch-up inside one financial year. A month that has
 * not happened is refused by being absent.
 */
export function runnableMonths(current: string): string[] {
  const [year, mon] = current.split('-').map(Number);
  const sinceApril = mon >= 4 ? mon - 4 : mon + 8;
  const length = Math.max(6, sinceApril + 1);
  return Array.from({ length }, (_, i) => new Date(Date.UTC(year, mon - 1 - i, 1)).toISOString().slice(0, 7));
}

/** The last calendar day of a `YYYY-MM` month, as `YYYY-MM-DD`. */
export function lastDayOf(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
}

export function payeesFor<T extends Pick<Employee, 'status' | 'dateOfJoining'>>(employees: readonly T[], month: string): T[] {
  const end = lastDayOf(month);
  return employees.filter(
    (employee) => employee.status !== 'Resigned' && (!employee.dateOfJoining || employee.dateOfJoining <= end),
  );
}

export interface CarriedOverLossOfPay {
  readonly employeeId: string;
  /** The earlier, already-paid month the days belong to. */
  readonly fromMonth: string;
  /** Positive: days deducted now. Negative: days refunded. */
  readonly days: number;
  /** Positive is deducted from this run's pay; negative is paid back. */
  readonly amount: number;
}

/**
 * Every correction to an earlier month's loss of pay that a run is about to
 * make, one row per employee per month.
 *
 * `lossOfPayArrears` computes these onto each payslip, and they change what
 * somebody is paid — a leave approved after its month was paid, or an absence
 * regularised afterwards — for a reason that is not on this month's own
 * attendance. So a run lists them before it is confirmed, rather than leaving
 * HR to find them one payslip at a time. The first month they can appear is
 * the first run after a paid month whose payslip recorded `lopDays`.
 */
export function carriedOverLossOfPay(
  payslips: readonly { employeeId: string; lopArrears?: readonly { month: string; days: number; amount: number }[] }[],
): CarriedOverLossOfPay[] {
  return payslips
    .flatMap((p) => (p.lopArrears ?? [])
      .filter((a) => a.days !== 0)
      .map((a) => ({ employeeId: p.employeeId, fromMonth: a.month, days: a.days, amount: a.amount })))
    .sort((a, b) => a.fromMonth.localeCompare(b.fromMonth) || a.employeeId.localeCompare(b.employeeId));
}
