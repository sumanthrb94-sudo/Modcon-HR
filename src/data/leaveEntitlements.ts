/**
 * What each employee is entitled to, derived rather than stored.
 *
 * The seeded `leaveBalances` in ./leave.ts are fixed totals — a number someone
 * typed. That cannot express "one day a month, accumulating, reset each April",
 * because the answer changes with the date. So entitlement is computed from the
 * policy, the employee's joining date, and the day you ask.
 *
 * The four rules this implements, and where each lives:
 *
 *   Monthly accrual      `accrualMonthsElapsed` x monthlyAccrual.
 *   Carry forward        implicit: the accrual is cumulative across the year,
 *                        so an unused January day is still in February's total.
 *                        No separate carry-forward bookkeeping exists, because
 *                        there is nothing to move — the balance simply is
 *                        "granted so far this year, minus used so far".
 *   Financial-year reset also implicit: accrual counts from the start of the
 *                        financial year, so on 1 April the elapsed month count
 *                        returns to 1 and everything before it drops out.
 *   Tenure gate          `minTenureMonths` against completed months of service.
 *
 * Deriving it means there is no scheduled job to run at midnight on 1 April and
 * no risk of a balance that was never migrated. The trade-off is that history
 * is not retained: this answers "what is the balance today", not "what was it
 * last March".
 */
import type { Employee, Gender, LeaveBalance, LeaveRequest, LeaveType } from '@/types';
import { getLeavePolicies, isMonthlyPolicy, normalizeLeaveTypeValue, type LeavePolicy } from './leavePolicies';
import { accrualMonthsElapsed, financialYearOf, financialYearStart, monthsBetween } from '@/lib/financialYear';
import { todayIso } from '@/lib/today';

export interface Entitlement {
  type: LeaveType;
  policy: LeavePolicy;
  /** Days granted so far this financial year. */
  granted: number;
  /** Approved days taken within this financial year. */
  used: number;
  available: number;
  /** True when the days arrived month by month rather than in one annual grant. */
  monthly: boolean;
  /** Set when the employee does not yet qualify, e.g. the one-year Earned gate. */
  withheldReason?: string;
}

/**
 * Days granted to `employee` under `policy` as of `asOf`.
 *
 * Accrual starts at the later of the financial year's first day and the
 * employee's joining date, so a July joiner accrues from July rather than
 * being handed April, May and June retrospectively.
 */
export function grantedDays(
  policy: LeavePolicy,
  employee: Pick<Employee, 'dateOfJoining'>,
  asOf: string = todayIso(),
): { granted: number; withheldReason?: string } {
  const joined = employee.dateOfJoining || '';

  if (policy.minTenureMonths > 0) {
    const tenure = monthsBetween(joined, asOf);
    if (tenure < policy.minTenureMonths) {
      const years = policy.minTenureMonths / 12;
      return {
        granted: 0,
        withheldReason:
          years === 1
            ? 'Available after 1 year of service'
            : `Available after ${policy.minTenureMonths} months of service`,
      };
    }
  }

  if (!isMonthlyPolicy(policy)) {
    return { granted: policy.annual };
  }

  const yearStart = financialYearStart(asOf);
  // A mid-year joiner accrues from their joining month, not the year's start.
  const from = joined && joined > yearStart ? joined : yearStart;
  const months = accrualMonthsElapsed(asOf, from);
  return { granted: months * policy.monthlyAccrual };
}

/**
 * Whether a policy applies to this employee at all.
 *
 * `applicable` is free text on the policy ("Female employees"), so this only
 * excludes a type when the text names a gender *and* the employee's gender is
 * recorded and differs. An unrecorded gender shows everything rather than
 * guessing — `Employee.gender` is deliberately optional, and hiding maternity
 * leave from someone because nobody filled in a field would be worse than
 * showing a row they will not use.
 */
function appliesToEmployee(
  policy: LeavePolicy,
  gender: Gender | undefined,
): boolean {
  if (!gender) return true;
  const applicable = policy.applicable.toLowerCase();
  if (applicable.includes('female')) return gender === 'Female';
  // "male" matches inside "female", so this must come second.
  if (applicable.includes('male')) return gender === 'Male';
  return true;
}

/** Approved days of `type` taken by `employee` within the financial year of `asOf`. */
function usedDays(
  employeeId: string,
  type: LeaveType,
  requests: LeaveRequest[],
  asOf: string,
): number {
  const fy = financialYearOf(asOf);
  return requests
    .filter(
      (r) =>
        r.employeeId === employeeId &&
        r.type === type &&
        r.status === 'Approved' &&
        // Attributed to the year the leave starts in. A request spanning the
        // year boundary counts once, against the year it began — splitting it
        // would need day-level apportioning the model does not carry.
        financialYearOf(r.startDate) === fy,
    )
    .reduce((sum, r) => sum + r.days, 0);
}

/**
 * Every entitlement an employee currently holds.
 *
 * Types the organisation has set to zero days and does not grant (Unpaid, Comp
 * Off at 0) are omitted — a row reading "0 of 0" is noise. A type withheld by
 * a tenure gate is kept, with `withheldReason`, because "you get this after a
 * year" is information the employee wants.
 */
export function getEntitlements(
  employee: Pick<Employee, 'id' | 'dateOfJoining' | 'gender'>,
  requests: LeaveRequest[],
  asOf: string = todayIso(),
): Entitlement[] {
  return getLeavePolicies()
    .filter((policy) => appliesToEmployee(policy, employee.gender))
    .map((policy) => {
      const type = normalizeLeaveTypeValue(policy.type);
      const { granted, withheldReason } = grantedDays(policy, employee, asOf);
      const used = usedDays(employee.id, type, requests, asOf);
      return {
        type,
        policy,
        granted,
        used,
        available: Math.max(0, granted - used),
        monthly: isMonthlyPolicy(policy),
        withheldReason,
      };
    })
    .filter((e) => e.granted > 0 || e.used > 0 || e.withheldReason);
}

/** The same figures shaped as `LeaveBalance`, for surfaces that expect it. */
export function getEntitlementBalances(
  employee: Pick<Employee, 'id' | 'dateOfJoining' | 'gender'>,
  requests: LeaveRequest[],
  asOf: string = todayIso(),
): LeaveBalance[] {
  return getEntitlements(employee, requests, asOf).map((e) => ({
    employeeId: employee.id,
    type: e.type,
    total: e.granted,
    used: e.used,
    available: e.available,
  }));
}
