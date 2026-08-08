/**
 * How many days of leave a date range actually costs.
 *
 * This used to be `Math.ceil((end - start) / 86400000) + 1` written inline in
 * the leave form — the number of calendar days between two dates. So a block
 * from Monday the 8th to Friday the 19th was recorded as twelve days when the
 * employee was absent for ten, and a week containing Diwali cost the employee a
 * day of leave for a day the company was closed anyway.
 *
 * The figure propagates: it is the `days` stored on the request, what the
 * entitlement engine deducts, and what any payroll deduction is computed from.
 * So it is worth getting right in one place rather than at each call site.
 *
 * The organisation's own holiday calendar is the authority — `getHolidayDirectory()`
 * is org-scoped, and a newly provisioned organisation has an empty one until it
 * enters its own, which correctly means weekends only.
 *
 * **Optional holidays still count as working days.** A restricted holiday is one
 * an employee may choose to take, not one the company is closed for; treating it
 * as non-working would silently hand everybody a day back whether they took it
 * or not.
 */
import type { Holiday } from '@/types';
import { getHolidayDirectory } from '@/data/holidays';

/** Holidays the company is closed for, as a set of `YYYY-MM-DD`. */
export function closedDates(holidays: Holiday[] = getHolidayDirectory()): Set<string> {
  return new Set(
    holidays.filter((holiday) => holiday.type !== 'Optional').map((holiday) => holiday.date),
  );
}

/**
 * Steps `YYYY-MM-DD` to `YYYY-MM-DD`, in UTC.
 *
 * Date-only strings parse as UTC midnight, and every stored date in this app is
 * date-only, so the whole calculation stays in UTC and never shifts a day for a
 * viewer in another zone — the same reasoning as lib/today.ts.
 */
function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(start);
  const last = new Date(end);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return out;
  while (cursor <= last) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function isWeekend(iso: string): boolean {
  const day = new Date(iso).getUTCDay();
  return day === 0 || day === 6;
}

export interface LeaveDayBreakdown {
  /** Working days in the range — what the request costs. */
  days: number;
  /** Calendar days the employee is away, for display. */
  calendarDays: number;
  weekendDays: number;
  /** Company holidays falling inside the range. */
  holidayDays: number;
}

/**
 * The working days in an inclusive date range, and what was excluded.
 *
 * Returns the breakdown as well as the total because the form should be able to
 * say *why* a twelve-day absence costs ten days of leave — a bare number that
 * disagrees with the calendar reads like a bug to whoever applied.
 */
export function leaveDayBreakdown(
  start: string,
  end: string,
  holidays: Holiday[] = getHolidayDirectory(),
): LeaveDayBreakdown {
  const closed = closedDates(holidays);
  const dates = eachDate(start, end);

  let weekendDays = 0;
  let holidayDays = 0;
  let days = 0;

  dates.forEach((date) => {
    if (isWeekend(date)) weekendDays += 1;
    // A holiday landing on a weekend is already excluded; counting it again
    // would misreport the breakdown even though the total stayed right.
    else if (closed.has(date)) holidayDays += 1;
    else days += 1;
  });

  return { days, calendarDays: dates.length, weekendDays, holidayDays };
}

/** Working days in an inclusive range — the figure stored on a leave request. */
export function countLeaveDays(
  start: string,
  end: string,
  holidays: Holiday[] = getHolidayDirectory(),
): number {
  return leaveDayBreakdown(start, end, holidays).days;
}
