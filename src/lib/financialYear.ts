/**
 * The Indian financial year: 1 April – 31 March.
 *
 * Leave entitlement is reckoned per financial year, not per calendar year —
 * monthly accruals carry forward within the year and are reset when it turns
 * over. `startOfYear()` in ./today.ts is 1 January and answers a different
 * question (calendar-year reporting); using it for leave would reset everyone's
 * balance three months early.
 *
 * Every date here is an IST calendar date, for the reasons in ./today.ts: a
 * viewer in another timezone must not see a different financial year than a
 * viewer in Bengaluru looking at the same balance.
 */
import { todayIso } from './today';

/** Month index (1-12) the financial year begins on. April in India. */
export const FINANCIAL_YEAR_START_MONTH = 4;

/**
 * The financial year an IST date falls in, labelled by its starting calendar
 * year — `2026` means 1 Apr 2026 to 31 Mar 2027.
 */
export function financialYearOf(iso: string = todayIso()): number {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  return month >= FINANCIAL_YEAR_START_MONTH ? year : year - 1;
}

/** First day of the financial year containing `iso`, as `YYYY-MM-DD`. */
export function financialYearStart(iso: string = todayIso()): string {
  const fy = financialYearOf(iso);
  return `${fy}-${String(FINANCIAL_YEAR_START_MONTH).padStart(2, '0')}-01`;
}

/** Last day of the financial year containing `iso`, as `YYYY-MM-DD`. */
export function financialYearEnd(iso: string = todayIso()): string {
  const fy = financialYearOf(iso) + 1;
  const endMonth = FINANCIAL_YEAR_START_MONTH - 1 || 12;
  const lastDay = new Date(Date.UTC(fy, endMonth, 0)).getUTCDate();
  return `${fy}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** Human label for the financial year containing `iso`, e.g. "FY 2026-27". */
export function financialYearLabel(iso: string = todayIso()): string {
  const fy = financialYearOf(iso);
  return `FY ${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;
}

/** True when both dates fall in the same financial year. */
export function inSameFinancialYear(a: string, b: string): boolean {
  return financialYearOf(a) === financialYearOf(b);
}

/**
 * How many months of the financial year have *started* as of `asOf`,
 * counting from `from` (defaults to the year's first day).
 *
 * Accrual is granted on the first of the month, so April alone counts as 1 —
 * an employee has their April day from 1 April, not from 30 April. Returns 0
 * when `from` is after the reference date, which is what a future joiner
 * should accrue.
 */
export function accrualMonthsElapsed(
  asOf: string = todayIso(),
  from: string = financialYearStart(asOf),
): number {
  const startYear = Number(from.slice(0, 4));
  const startMonth = Number(from.slice(5, 7));
  const asOfYear = Number(asOf.slice(0, 4));
  const asOfMonth = Number(asOf.slice(5, 7));

  const months = (asOfYear - startYear) * 12 + (asOfMonth - startMonth) + 1;
  return Math.max(0, months);
}

/**
 * Whole months between two IST dates — used for tenure, where "more than one
 * year" has to mean twelve completed months rather than a loose date compare.
 */
export function monthsBetween(fromIso: string, toIso: string = todayIso()): number {
  if (!fromIso) return 0;
  const fromYear = Number(fromIso.slice(0, 4));
  const fromMonth = Number(fromIso.slice(5, 7));
  const fromDay = Number(fromIso.slice(8, 10));
  const toYear = Number(toIso.slice(0, 4));
  const toMonth = Number(toIso.slice(5, 7));
  const toDay = Number(toIso.slice(8, 10));

  let months = (toYear - fromYear) * 12 + (toMonth - fromMonth);
  // The final month only counts once the day-of-month has come round.
  if (toDay < fromDay) months -= 1;
  return Math.max(0, months);
}
