/**
 * How many days of pay a month's unpaid absence costs, as pure arithmetic.
 *
 * Imports nothing, so `npm run test:unit` can reach it; the storage wiring —
 * which attendance, which leave requests, which days are holidays or this
 * person's week-off — is `lossOfPayDays` in data/payroll.ts.
 *
 * Two registers can say a day was unpaid, and they are combined **per date**:
 *
 *  - the attendance sheet — `Absent` is a whole day, `Half Day` half; and
 *  - an **approved Unpaid leave request** — every working day it covers.
 *
 * The second is new. Attendance used to be the only source, and approved
 * leave of any type is stamped `On Leave` there, which payroll reads as paid —
 * so a month of approved Unpaid leave cost nobody anything, and the request's
 * type was a label with no consequence. That is a leave policy that says
 * "unpaid" and a payslip that pays.
 *
 * Per date, and the larger of the two, never the sum: the ordinary case is a
 * day that is both on approved Unpaid leave and marked `Absent` on the sheet,
 * and adding them would deduct that day twice. A half-day request on a day the
 * sheet also marks `Half Day` is the same half day, not a whole one.
 *
 * Holidays and week-offs are never charged, the same rule `evaluateLeaveRequest`
 * uses to decide what a request costs: a day nobody was due to work cannot be
 * a day of pay lost. Pending, rejected and cancelled requests charge nothing —
 * only a decision someone made moves pay.
 */

export interface AttendanceDay {
  readonly date: string;
  readonly status: string;
}

export interface UnpaidLeaveRequest {
  readonly startDate: string;
  readonly endDate: string;
  /** What the request was charged at when approved; 0.5 marks a half day. */
  readonly days: number;
}

/** Every ISO date from `start` to `end` inclusive, in UTC so no DST edge moves a day. */
function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return out;
  // Bounded: a malformed range must not spin. A year is far past any request.
  for (let i = 0; cursor <= last && i < 400; i += 1) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * The working days in `month` (`YYYY-MM`) that approved Unpaid leave covers,
 * each with the fraction of pay it costs.
 */
export function unpaidLeaveByDate(
  requests: readonly UnpaidLeaveRequest[],
  month: string,
  isNonWorking: (date: string) => boolean,
): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const request of requests) {
    const dates = datesBetween(request.startDate, request.endDate);
    // A half day exists only as a single-day request charged at half — the
    // same condition the application form enforces before it offers one.
    const weight = dates.length === 1 && request.days > 0 && request.days < 1 ? 0.5 : 1;
    for (const date of dates) {
      if (!date.startsWith(month) || isNonWorking(date)) continue;
      byDate.set(date, Math.max(byDate.get(date) ?? 0, weight));
    }
  }
  return byDate;
}

function attendanceWeight(status: string): number {
  if (status === 'Absent') return 1;
  if (status === 'Half Day') return 0.5;
  return 0;
}

/** Days of pay lost in `month`: attendance and unpaid leave, the larger per date. */
export function combineLossOfPay(
  attendance: readonly AttendanceDay[],
  unpaidLeave: ReadonlyMap<string, number>,
  month: string,
): number {
  const byDate = new Map(unpaidLeave);
  for (const record of attendance) {
    if (!record.date.startsWith(month)) continue;
    const weight = attendanceWeight(record.status);
    if (weight > 0) byDate.set(record.date, Math.max(byDate.get(record.date) ?? 0, weight));
  }
  let total = 0;
  for (const weight of byDate.values()) total += weight;
  return total;
}
