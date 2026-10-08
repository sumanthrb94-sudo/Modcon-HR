/**
 * The arithmetic of pay that changes during a month: somebody joins, leaves,
 * or is given a raise.
 *
 * Payroll paid every month in full at CTC ÷ 12. That is right for somebody who
 * worked the whole month on one salary and wrong for everybody else — a joiner
 * on the 15th was paid for the fortnight before they arrived, a leaver for the
 * days after they left, and a raise could only be typed over the old figure,
 * which repriced every month already paid without paying anybody the
 * difference. Pure, imports types only, and unit-tested.
 *
 * Days are calendar days throughout, the same basis loss of pay already uses
 * (`daysInMonth`), so a month's pay and its deductions are priced per day on
 * one definition.
 */

import type { SalaryRevision } from '@/types';

export type { SalaryRevision };

function daysIn(month: string): number {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

function dateOf(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, '0')}`;
}

/**
 * How many days of `month` somebody was employed: from their joining date (or
 * the 1st) to their last working day (or the month's end), inclusive.
 * Zero when the month is wholly before they joined or after they left.
 */
export function employedDaysInMonth(
  month: string,
  dateOfJoining: string | undefined,
  lastWorkingDay?: string,
): { employedDays: number; payableDays: number } {
  const payableDays = daysIn(month);
  const first = dateOf(month, 1);
  const last = dateOf(month, payableDays);
  const from = dateOfJoining && dateOfJoining > first ? dateOfJoining.slice(0, 10) : first;
  const to = lastWorkingDay && lastWorkingDay < last ? lastWorkingDay.slice(0, 10) : last;
  if (from > to) return { employedDays: 0, payableDays };
  const employedDays = Number(to.slice(8, 10)) - Number(from.slice(8, 10)) + 1;
  return { employedDays, payableDays };
}

/** The annual CTC in force on a date, given the current CTC and its history. */
export function ctcOn(date: string, currentCtc: number, history: readonly SalaryRevision[] = []): number {
  if (history.length === 0) return currentCtc;
  const sorted = [...history].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let ctc = sorted[0].previousCtc;
  for (const revision of sorted) {
    if (revision.effectiveFrom <= date) ctc = revision.ctc;
  }
  return ctc;
}

/**
 * The month's CTC ÷ 12, weighted by the days each salary was in force.
 *
 * A raise from the 16th of a 30-day month pays fifteen days at each rate. With
 * no revision touching the month this is exactly `ctc / 12`, rounded the same
 * way it always was.
 */
export function monthlyCtcFor(month: string, currentCtc: number, history: readonly SalaryRevision[] = []): number {
  const days = daysIn(month);
  const first = ctcOn(dateOf(month, 1), currentCtc, history);
  const touched = history.some((r) => r.effectiveFrom.slice(0, 7) === month);
  if (!touched) return Math.round(first / 12);
  let sum = 0;
  for (let day = 1; day <= days; day += 1) sum += ctcOn(dateOf(month, day), currentCtc, history);
  return Math.round(sum / days / 12);
}

/** A month already paid, as its stored payslip recorded it. */
export interface PaidMonthBasis {
  readonly month: string;
  /** The monthly CTC the payslip was priced on. Absent on payslips older than this field. */
  readonly ctcBasis?: number;
  /** Gross actually earned that month, before deductions and arrears. */
  readonly grossEarnings: number;
  readonly employedDays?: number;
  readonly payableDays: number;
  readonly lopDays: number;
  /** Salary arrears this payslip itself paid, for earlier months. */
  readonly salaryArrears?: readonly { month: string; amount: number }[];
}

export interface SalaryArrear {
  readonly month: string;
  readonly amount: number;
}

/**
 * What is still owed for months already paid at an older salary.
 *
 * A raise recorded today with an effective date in July, when July to
 * September are already paid, owes the difference for those three months. It
 * is paid once, on the next payslip, as a row naming each month — and never
 * again, because later payslips subtract the arrears earlier ones paid.
 *
 * Only months whose payslip recorded the CTC it was priced on are considered:
 * a payslip that did not cannot say what it assumed, the same rule as loss of
 * pay arrears. Only a change in *CTC* produces an arrear — a later change to
 * the salary split or the statutory settings moves no money backwards.
 *
 * `expectedGross(month)` is what that month's gross would be today. The
 * difference is scaled by the days actually paid, so loss of pay taken that
 * month is not paid back as arrears.
 */
export function salaryArrears(
  currentMonth: string,
  paid: readonly PaidMonthBasis[],
  expected: (month: string) => { ctcBasis: number; grossEarnings: number },
): SalaryArrear[] {
  const alreadyPaid = new Map<string, number>();
  for (const payslip of paid) {
    for (const arrear of payslip.salaryArrears ?? []) {
      alreadyPaid.set(arrear.month, (alreadyPaid.get(arrear.month) ?? 0) + arrear.amount);
    }
  }
  const out: SalaryArrear[] = [];
  for (const payslip of [...paid].sort((a, b) => a.month.localeCompare(b.month))) {
    if (payslip.month >= currentMonth || typeof payslip.ctcBasis !== 'number') continue;
    const now = expected(payslip.month);
    if (now.ctcBasis === payslip.ctcBasis) continue;
    const employed = payslip.employedDays ?? payslip.payableDays;
    if (employed <= 0) continue;
    const workedShare = Math.max(0, employed - payslip.lopDays) / employed;
    const owed = Math.round((now.grossEarnings - payslip.grossEarnings) * workedShare);
    const remaining = owed - (alreadyPaid.get(payslip.month) ?? 0);
    if (remaining !== 0) out.push({ month: payslip.month, amount: remaining });
  }
  return out;
}

/**
 * Full and final settlement — what is paid or recovered beyond the last
 * month's salary, which payroll pays in the ordinary run, prorated to the last
 * working day.
 */
export interface SettlementInput {
  /** Monthly Basic at the last salary, or null when no salary split is set. */
  readonly monthlyBasic: number | null;
  /** Monthly gross at the last salary. */
  readonly monthlyGross: number;
  /** Unused days of encashable leave. */
  readonly encashableDays: number;
  /** Gratuity already assessed (data/statutoryRules.ts `gratuity`), or null when it cannot be. */
  readonly gratuity: number | null;
  /** Days of notice not served that the company recovers. */
  readonly noticeShortDays: number;
  /** Anything else agreed — a bonus owed (+) or an advance to recover (−). */
  readonly otherAmount: number;
}

export interface Settlement {
  /** Encashment is priced on Basic where there is one, on gross otherwise. */
  readonly encashmentBasis: 'basic' | 'gross';
  readonly leaveEncashment: number;
  readonly gratuity: number;
  readonly noticeRecovery: number;
  readonly otherAmount: number;
  /** Positive: the company pays it. Negative: the employee owes it. */
  readonly net: number;
}

/**
 * Encashment and notice recovery are each a month's pay ÷ 30 per day — the
 * convention most Indian employers' policies state. Encashment uses Basic,
 * which is what nearly every policy and the Shops and Establishments Acts
 * mean by "wages" for it; with no salary split there is no Basic, so gross is
 * used and the statement says so.
 */
export function finalSettlement(input: SettlementInput): Settlement {
  const encashmentBasis = input.monthlyBasic === null ? 'gross' : 'basic';
  const perDayEncash = (input.monthlyBasic ?? input.monthlyGross) / 30;
  const leaveEncashment = Math.round(perDayEncash * Math.max(0, input.encashableDays));
  const gratuity = Math.max(0, input.gratuity ?? 0);
  const noticeRecovery = Math.round((input.monthlyGross / 30) * Math.max(0, input.noticeShortDays));
  const otherAmount = Math.round(input.otherAmount || 0);
  return {
    encashmentBasis,
    leaveEncashment,
    gratuity,
    noticeRecovery,
    otherAmount,
    net: leaveEncashment + gratuity - noticeRecovery + otherAmount,
  };
}
