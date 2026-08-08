/**
 * Whether a leave application can be filed as entered.
 *
 * The form used to check two things: that the fields were non-empty, and that
 * the end date was not before the start. So the same person could file the same
 * week twice and have both approved, could apply for three weeks against a
 * balance of four days, and could file for dates last March.
 *
 * These are checks the employee wants at the point of applying rather than a
 * rejection days later, so each message says what is wrong and what to do about
 * it instead of only refusing.
 */
import type { Employee, LeaveRequest, LeaveType } from '@/types';
import { getEntitlements } from '@/data/leaveEntitlements';
import { leaveDayBreakdown } from '@/lib/leaveDays';
import { todayIso } from '@/lib/today';

/** How far back an application may be dated before it needs HR rather than a form. */
const MAX_BACKDATE_DAYS = 30;

export interface LeaveApplicationInput {
  employee: Pick<Employee, 'id' | 'dateOfJoining' | 'gender'>;
  type: LeaveType;
  startDate: string;
  endDate: string;
}

export interface LeaveApplicationCheck {
  /** Set when the application cannot be filed. */
  error?: string;
  /** Working days the application costs, once weekends and holidays are out. */
  days: number;
  /** Why that differs from the calendar span, for the form to explain itself. */
  breakdown: ReturnType<typeof leaveDayBreakdown>;
}

function overlaps(a: LeaveRequest, startDate: string, endDate: string): boolean {
  return a.startDate <= endDate && a.endDate >= startDate;
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
}

export function checkLeaveApplication(
  input: LeaveApplicationInput,
  requests: LeaveRequest[],
  asOf: string = todayIso(),
): LeaveApplicationCheck {
  const { employee, type, startDate, endDate } = input;
  const breakdown = leaveDayBreakdown(startDate, endDate);
  const result: LeaveApplicationCheck = { days: breakdown.days, breakdown };

  if (endDate < startDate) {
    return { ...result, error: 'End date must be on or after the start date.' };
  }

  // Every day in the range is a weekend or a company holiday, so there is
  // nothing to deduct and nothing to approve.
  if (breakdown.days === 0) {
    return {
      ...result,
      error: 'Those dates are all non-working days, so no leave is needed.',
    };
  }

  if (daysBetween(startDate, asOf) > MAX_BACKDATE_DAYS) {
    return {
      ...result,
      error: `Leave cannot be applied for more than ${MAX_BACKDATE_DAYS} days in the past. Ask HR to record it.`,
    };
  }

  // Any existing request for the same person covering any of the same dates.
  // Rejected ones are ignored — those dates are free again.
  const clash = requests.find(
    (request) =>
      request.employeeId === employee.id &&
      request.status !== 'Rejected' &&
      overlaps(request, startDate, endDate),
  );
  if (clash) {
    return {
      ...result,
      error: `You already have ${clash.status.toLowerCase()} leave from ${clash.startDate} to ${clash.endDate}.`,
    };
  }

  // Balance. Unpaid Leave is the type that exists precisely for when there is
  // none left, so it is never blocked on one.
  if (type !== 'Unpaid') {
    const entitlement = getEntitlements(employee, requests, asOf).find((e) => e.type === type);
    if (entitlement?.withheldReason) {
      return { ...result, error: entitlement.withheldReason };
    }
    if (entitlement && breakdown.days > entitlement.available) {
      const short = breakdown.days - entitlement.available;
      return {
        ...result,
        error:
          `That is ${breakdown.days} working days but you have ${entitlement.available} of ${type} left — ` +
          `${short} too many. Shorten the dates, or apply for Unpaid Leave.`,
      };
    }
  }

  return result;
}
