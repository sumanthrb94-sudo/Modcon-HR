/**
 * What the leave policy says about one application, before it is submitted.
 *
 * The Apply Leave dialog used to be policy-blind: it listed every leave type to
 * everyone, counted calendar days between the two dates, and accepted the
 * request whatever the balance said. So a man could apply for Maternity Leave, a
 * three-month joiner could book Earned Leave the policy withholds until twelve
 * completed months, a two-day break across a public holiday cost two days of
 * entitlement, and nothing stopped ten days being taken out of a balance of
 * four — the request only failed later, in someone's head, at approval time.
 *
 * Ten days against a balance of four is no longer refused, though: it is four
 * days of paid leave and six of loss of pay (`overQuotaDays`), which is how
 * the organisation's quota is meant to work — the policy says how much leave
 * is paid, not how much may be taken. The applicant is told the split first.
 *
 * This module answers the whole question in one place so the dialog and the
 * submit handler cannot disagree: the same call renders the live summary the
 * applicant reads and decides whether Submit is allowed. Every rule here comes
 * from the organisation's own `leavePolicies` (Settings → Leave Policies), its
 * holiday calendar, and the employee's week-off — never a constant in this file.
 *
 * Dates in the past are allowed here, and the two floors on them are this
 * module's own: the joining date, and the start of the financial year the
 * balance is kept in. The dialog used to refuse the past with `min` on the date
 * input alone, which is a suggestion — it is absent from the value the form
 * submits — so an absence could only ever be applied for before it happened.
 */
import type { Employee, LeaveRequest, LeaveType } from '@/types';
import { getEntitlement, type Entitlement } from './leaveEntitlements';
import { getPolicyForType } from './leavePolicies';
import { getHolidayDirectory } from './holidays';
import { isWeekOffFor } from './employees';
import { overQuotaDays } from './lossOfPay';
import { todayIso } from '@/lib/today';
import { financialYearLabel, financialYearStart } from '@/lib/financialYear';

export interface LeaveApplicationInput {
  employee: Pick<Employee, 'id' | 'dateOfJoining' | 'gender' | 'weekOff'> | null | undefined;
  type: LeaveType;
  startDate: string;
  endDate: string;
  /** Every request the org holds — the check reads this employee's own out of it. */
  requests: LeaveRequest[];
  /** Charge half a day. Only honoured on a single-day request under a policy that allows it. */
  halfDay?: boolean;
  asOf?: string;
}

export interface LeaveApplicationCheck {
  /** The governing entitlement, or null when the type has no policy at all. */
  entitlement: Entitlement | null;
  /** Days between the two dates inclusive, before anything is excluded. */
  calendarDays: number;
  /** What the request actually costs: working days only, half-day applied. */
  chargeableDays: number;
  /** Public holidays inside the range, which the leave is not charged for. */
  excludedHolidays: { date: string; name: string }[];
  /** The employee's week-off days inside the range, likewise not charged. */
  excludedWeekOffs: string[];
  /** Chargeable days already committed to Pending requests of this type. */
  pendingDays: number;
  /** Days left after this request, or null when the type carries no balance. */
  balanceAfter: number | null;
  /**
   * Chargeable days beyond what the balance still holds. They are not refused:
   * leave within the quota is paid, and anything applied for past it is loss
   * of pay. 0 for Unpaid Leave, which is loss of pay whole by its type.
   */
  lossOfPayDays: number;
  /** True when the policy allows half a day and the range is a single day. */
  halfDayAllowed: boolean;
  /** Blocking reasons. Empty means the application may be submitted. */
  errors: string[];
  /** Non-blocking things the applicant should know before submitting. */
  notes: string[];
}

/** Longest range the day-by-day walk will evaluate — a year of leave, and then some. */
const MAX_RANGE_DAYS = 366;

/**
 * How many days before it was applied for the leave began — 0 when it did not.
 *
 * Measured against `appliedOn`, never against today, and that is the whole
 * point of the second argument: every past request has a start date before
 * today the week after it is decided, so a "backdated" test against the wall
 * clock would eventually flag the entire history. Whether the absence had
 * already begun when the form was submitted is a fact about the request that
 * never changes.
 *
 * One definition, called by the dialog's own note and by every surface that
 * decides a request — an approver reading a marker the applicant never saw, or
 * missing one the applicant was shown, is worse than no marker at all.
 */
export function backdatedByDays(startDate: string, appliedOn: string): number {
  if (!startDate || !appliedOn || startDate >= appliedOn) return 0;
  // Both are `YYYY-MM-DD`, which parses as UTC midnight, so this is exact.
  return Math.round((Date.parse(appliedOn) - Date.parse(startDate)) / 86_400_000);
}

/** Every ISO date from `start` to `end` inclusive, walked in UTC like the rest of the app. */
function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(start);
  const last = new Date(end);
  while (cursor.getTime() <= last.getTime() && out.length < MAX_RANGE_DAYS) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** True when the two inclusive ranges share any day. */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Unpaid Leave has no balance to overdraw: every day of it is loss of pay by
 * its type (`lossOfPayDays` in data/payroll.ts), so the over-quota split below
 * does not apply to it.
 *
 * This used to cover any type granting zero days, Comp Off before any was
 * earned included — "record it, don't deduct it" — which made a zero-day
 * paid type unlimited paid leave. Under the over-quota rule a zero grant is a
 * quota of nothing, and every day applied for is beyond it.
 */
function carriesNoBalance(entitlement: Entitlement): boolean {
  return entitlement.type === 'Unpaid';
}

export function checkLeaveApplication(input: LeaveApplicationInput): LeaveApplicationCheck {
  const { employee, type, startDate, endDate, requests, halfDay = false } = input;
  const asOf = input.asOf ?? todayIso();

  const entitlement = (employee ? getEntitlement(employee, type, requests, asOf) : null) ?? null;
  const errors: string[] = [];
  const notes: string[] = [];

  const empty: LeaveApplicationCheck = {
    entitlement,
    calendarDays: 0,
    chargeableDays: 0,
    excludedHolidays: [],
    excludedWeekOffs: [],
    pendingDays: 0,
    balanceAfter: entitlement ? entitlement.available : null,
    lossOfPayDays: 0,
    halfDayAllowed: false,
    errors,
    notes,
  };

  // An unfinished form has nothing to violate yet: "pick an employee" is the
  // dialog's own required-field message, not a policy refusal, and surfacing it
  // here would put a red box on a form the applicant has only just opened.
  if (!employee) return empty;
  if (!entitlement) {
    // Two different absences: the organisation does not grant this type at all,
    // or it grants it to someone else (the policy's `applicable` names a gender).
    errors.push(
      getPolicyForType(type, employee.id)
        ? `${type} Leave does not apply to this employee.`
        : `${type} Leave is not part of your organisation's leave policy.`,
    );
    return empty;
  }
  // Gender applicability and the tenure gate both arrive as a withheld reason on
  // the entitlement, so neither needs its own rule here.
  if (entitlement.withheldReason) {
    errors.push(`${type} Leave: ${entitlement.withheldReason.toLowerCase()}.`);
  }
  if (!startDate || !endDate) return { ...empty, errors };
  if (endDate < startDate) {
    errors.push('End date must be on or after start date.');
    return { ...empty, errors };
  }

  // Leave may be dated in the past — an absence is often applied for after it
  // has been taken — but only back to two floors, and both of them fail closed.
  //
  // Nobody was employed here before they joined, so leave dated before that is
  // not a late application but a wrong date.
  if (employee.dateOfJoining && startDate < employee.dateOfJoining) {
    errors.push(`Leave cannot start before the joining date (${employee.dateOfJoining}).`);
    return { ...empty, errors };
  }
  // And no earlier than the financial year the balance is kept in. Usage is
  // counted per financial year (`financialYearOf(r.startDate)` in
  // data/leaveEntitlements.ts), so a request dated into a closed year is
  // deducted from no balance at all — it would read as leave that cost nothing.
  const yearStart = financialYearStart(asOf);
  if (startDate < yearStart) {
    errors.push(
      `Leave cannot be dated before ${financialYearLabel(asOf)}, which begins ${yearStart} — earlier years are closed and carry no balance to deduct from.`,
    );
    return { ...empty, errors };
  }

  const dates = datesBetween(startDate, endDate);
  const calendarDays = dates.length;
  if (calendarDays >= MAX_RANGE_DAYS) {
    errors.push(`A single request cannot span more than ${MAX_RANGE_DAYS} days.`);
    return { ...empty, calendarDays, errors };
  }

  const holidayByDate = new Map(getHolidayDirectory().map((h) => [h.date, h.name]));
  const excludedHolidays: { date: string; name: string }[] = [];
  const excludedWeekOffs: string[] = [];
  let workingDays = 0;
  for (const date of dates) {
    const holiday = holidayByDate.get(date);
    if (holiday) {
      excludedHolidays.push({ date, name: holiday });
      continue;
    }
    if (isWeekOffFor(employee, date)) {
      excludedWeekOffs.push(date);
      continue;
    }
    workingDays += 1;
  }

  const halfDayAllowed = entitlement.policy.halfDay && calendarDays === 1;
  const chargeableDays = halfDayAllowed && halfDay ? workingDays * 0.5 : workingDays;

  // Pending requests of the same type are not deducted from the balance —
  // `used` counts approved leave only — so without this the same four days
  // could be applied for three times over and every request would look funded.
  //
  // Read off the entitlement rather than recounted here: this check used to own
  // the only copy of that arithmetic, so the refusal it produced ("5 available
  // less 4 already pending") contradicted every balance card in the app, which
  // knew nothing about pending days. One definition, in data/leaveEntitlements.ts.
  const pendingDays = entitlement.pending;

  const clash = requests.find(
    (r) =>
      r.employeeId === employee.id &&
      (r.status === 'Pending' || r.status === 'Approved') &&
      overlaps(startDate, endDate, r.startDate, r.endDate),
  );
  if (clash) {
    errors.push(
      `These dates overlap an existing ${clash.status.toLowerCase()} ${clash.type} Leave request.`,
    );
  }

  if (workingDays === 0) {
    errors.push(
      'The selected dates are all holidays or week-offs — no leave needs to be applied for.',
    );
  }

  const noBalance = carriesNoBalance(entitlement);
  const remaining = entitlement.remaining;
  const balanceAfter = noBalance ? null : Math.max(0, remaining - chargeableDays);
  // A tenure-gated type is refused above, so it never reaches the split.
  const lossOfPayDays =
    noBalance || entitlement.withheldReason ? 0 : overQuotaDays(chargeableDays, remaining);

  // Holidays and week-offs are not repeated as notes: the dialog lists each
  // excluded date from `excludedHolidays` / `excludedWeekOffs` already, and a
  // count saying the same thing underneath it is just something else to read.
  if (noBalance && workingDays > 0) {
    notes.push(
      `${type} Leave is not paid — these ${chargeableDays} day(s) will be deducted from pay as loss of pay once approved.`,
    );
  }
  if (lossOfPayDays > 0 && workingDays > 0) {
    const paid = chargeableDays - lossOfPayDays;
    const reserved = pendingDays > 0 ? ` (${pendingDays} day(s) are already held by pending requests)` : '';
    notes.push(
      paid > 0
        ? `Only ${remaining} day(s) of ${type} Leave remain${reserved}: ${paid} day(s) are paid leave and the other ${lossOfPayDays} day(s) will be deducted from pay as loss of pay once approved.`
        : `No ${type} Leave remains${reserved}: all ${lossOfPayDays} day(s) will be deducted from pay as loss of pay once approved.`,
    );
  }
  if (pendingDays > 0 && !noBalance) {
    notes.push(`${pendingDays} day(s) of ${type} Leave are already awaiting approval.`);
  }
  // Said out loud, because a date typed a month short is indistinguishable from
  // one meant that way, and the approver sees only the dates.
  if (backdatedByDays(startDate, asOf) > 0 && workingDays > 0) {
    notes.push(
      endDate < asOf
        ? 'These dates are in the past — this is a backdated application for leave already taken.'
        : 'This request starts in the past and is therefore backdated.',
    );
  }

  return {
    entitlement,
    calendarDays,
    chargeableDays,
    excludedHolidays,
    excludedWeekOffs,
    pendingDays,
    balanceAfter,
    lossOfPayDays,
    halfDayAllowed,
    errors,
    notes,
  };
}

/** One line summarising how the policy grants this type, for the dialog. */
export function policySummary(entitlement: Entitlement): string {
  const { policy } = entitlement;
  const grant = entitlement.monthly
    ? `${policy.monthlyAccrual} day(s) per month`
    : `${policy.annual} day(s) per year`;
  const parts = [grant];
  if (policy.carryForwardBeyondYear) parts.push('carries forward past 1 April');
  else if (policy.carryForward) parts.push('carries forward within the year');
  if (policy.halfDay) parts.push('half-day allowed');
  if (policy.minTenureMonths > 0) parts.push(`after ${policy.minTenureMonths} months of service`);
  return parts.join(' · ');
}
