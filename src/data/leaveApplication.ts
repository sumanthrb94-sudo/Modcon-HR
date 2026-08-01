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
 * This module answers the whole question in one place so the dialog and the
 * submit handler cannot disagree: the same call renders the live summary the
 * applicant reads and decides whether Submit is allowed. Every rule here comes
 * from the organisation's own `leavePolicies` (Settings → Leave Policies), its
 * holiday calendar, and the employee's week-off — never a constant in this file.
 */
import type { Employee, LeaveRequest, LeaveType } from '@/types';
import { getEntitlement, type Entitlement } from './leaveEntitlements';
import { getPolicyForType } from './leavePolicies';
import { getHolidayDirectory } from './holidays';
import { isWeekOffFor } from './employees';
import { todayIso } from '@/lib/today';

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
  /** True when the policy allows half a day and the range is a single day. */
  halfDayAllowed: boolean;
  /** Blocking reasons. Empty means the application may be submitted. */
  errors: string[];
  /** Non-blocking things the applicant should know before submitting. */
  notes: string[];
}

/** Longest range the day-by-day walk will evaluate — a year of leave, and then some. */
const MAX_RANGE_DAYS = 366;

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
 * A type with no accrued days and no tenure gate — Unpaid Leave, and Comp Off
 * before any has been earned. There is no balance to overdraw, so the balance
 * rule does not apply to it; the applicant is told what it costs instead.
 */
function carriesNoBalance(entitlement: Entitlement): boolean {
  return entitlement.granted === 0 && !entitlement.withheldReason;
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
      getPolicyForType(type)
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
  const pendingDays = requests
    .filter(
      (r) =>
        r.employeeId === employee.id &&
        r.type === type &&
        r.status === 'Pending',
    )
    .reduce((sum, r) => sum + r.days, 0);

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
  const remaining = entitlement.available - pendingDays;
  const balanceAfter = noBalance ? null : remaining - chargeableDays;

  if (!noBalance && !entitlement.withheldReason && chargeableDays > remaining) {
    errors.push(
      pendingDays > 0
        ? `Only ${remaining} day(s) of ${type} Leave remain — ${entitlement.available} available less ${pendingDays} already pending.`
        : `Only ${entitlement.available} day(s) of ${type} Leave remain.`,
    );
  }

  // Holidays and week-offs are not repeated as notes: the dialog lists each
  // excluded date from `excludedHolidays` / `excludedWeekOffs` already, and a
  // count saying the same thing underneath it is just something else to read.
  if (noBalance && workingDays > 0) {
    notes.push(
      `${type} Leave carries no accrued balance — these ${chargeableDays} day(s) are recorded against the policy, not deducted.`,
    );
  }
  if (pendingDays > 0 && !noBalance) {
    notes.push(`${pendingDays} day(s) of ${type} Leave are already awaiting approval.`);
  }

  return {
    entitlement,
    calendarDays,
    chargeableDays,
    excludedHolidays,
    excludedWeekOffs,
    pendingDays,
    balanceAfter,
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
