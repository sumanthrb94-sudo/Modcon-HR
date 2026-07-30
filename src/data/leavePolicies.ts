import type { LeaveType } from '@/types';
import { orgScopedKey } from '@/lib/orgScope';

export type LeaveAccrual = 'monthly' | 'annual';

export interface LeavePolicy {
  id: string;
  type: string;
  /**
   * Days granted per financial year for an `annual` policy.
   *
   * For a `monthly` policy this is the derived yearly total (12 x
   * monthlyAccrual) and is **not** shown to employees — see
   * `isMonthlyPolicy`. Keeping the field populated means the annual figure is
   * still available for payroll and reporting without a second source of truth.
   */
  annual: number;
  /**
   * How entitlement is granted. `monthly` accrues on the first of each month
   * and accumulates across the financial year; `annual` is granted in full at
   * the start of the year.
   */
  accrual: LeaveAccrual;
  /** Days granted per month. Only meaningful when accrual is 'monthly'. */
  monthlyAccrual: number;
  /**
   * Unused days survive into the next month. Only meaningful for monthly
   * accrual, and always bounded by the financial year — see
   * `carryForwardBeyondYear` for the separate question of surviving the
   * year-end.
   */
  carryForward: boolean;
  /**
   * Unused days survive the financial year rollover. False means the balance
   * resets on 1 April however much was left.
   */
  carryForwardBeyondYear: boolean;
  encashment: boolean;
  halfDay: boolean;
  /** Completed months of service before the entitlement applies. 0 = from day one. */
  minTenureMonths: number;
  applicable: string;
}

/** True when this policy grants days month by month rather than yearly. */
export function isMonthlyPolicy(policy: LeavePolicy): boolean {
  return policy.accrual === 'monthly';
}

const LEAVE_POLICIES_STORAGE_KEY = 'modcon.hr.leavePolicies';
export const LEAVE_POLICIES_CHANGED_EVENT = 'modcon-hr-leave-policies-changed';

/**
 * The organisation's leave policy.
 *
 * Casual and Sick accrue one day per month and accumulate across the financial
 * year, so an unused January day is still there in February. They do not
 * survive 1 April: `carryForwardBeyondYear: false` is what resets the balance
 * each year.
 *
 * Earned Leave is 15 days a year and only for employees past twelve completed
 * months of service, which is what `minTenureMonths: 12` expresses. It is
 * granted annually rather than accrued, so a qualifying employee has the whole
 * entitlement from the start of the year.
 */
const defaultPolicies: LeavePolicy[] = [
  { id: 'lp1', type: 'Casual Leave', annual: 12, accrual: 'monthly', monthlyAccrual: 1, carryForward: true, carryForwardBeyondYear: false, encashment: false, halfDay: true, minTenureMonths: 0, applicable: 'All employees' },
  { id: 'lp2', type: 'Sick Leave', annual: 12, accrual: 'monthly', monthlyAccrual: 1, carryForward: true, carryForwardBeyondYear: false, encashment: false, halfDay: true, minTenureMonths: 0, applicable: 'All employees' },
  { id: 'lp3', type: 'Earned Leave', annual: 15, accrual: 'annual', monthlyAccrual: 0, carryForward: true, carryForwardBeyondYear: true, encashment: true, halfDay: true, minTenureMonths: 12, applicable: 'Employees with over 1 year of service' },
  { id: 'lp4', type: 'Unpaid Leave', annual: 0, accrual: 'annual', monthlyAccrual: 0, carryForward: false, carryForwardBeyondYear: false, encashment: false, halfDay: false, minTenureMonths: 0, applicable: 'All employees' },
  { id: 'lp5', type: 'Maternity Leave', annual: 182, accrual: 'annual', monthlyAccrual: 0, carryForward: false, carryForwardBeyondYear: false, encashment: false, halfDay: false, minTenureMonths: 0, applicable: 'Female employees' },
  { id: 'lp6', type: 'Paternity Leave', annual: 5, accrual: 'annual', monthlyAccrual: 0, carryForward: false, carryForwardBeyondYear: false, encashment: false, halfDay: false, minTenureMonths: 0, applicable: 'Male employees' },
  { id: 'lp7', type: 'Comp Off', annual: 0, accrual: 'annual', monthlyAccrual: 0, carryForward: true, carryForwardBeyondYear: false, encashment: false, halfDay: false, minTenureMonths: 0, applicable: 'All employees' },
];

function readStoredLeavePolicies(): LeavePolicy[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(LEAVE_POLICIES_STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LeavePolicy[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredLeavePolicies(policies: LeavePolicy[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(LEAVE_POLICIES_STORAGE_KEY), JSON.stringify(policies));
}

function notifyLeavePoliciesChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(LEAVE_POLICIES_CHANGED_EVENT));
}

/**
 * Policies saved before monthly accrual existed carry none of the new fields.
 * Reading them raw would render `undefined` days and silently treat every
 * policy as annual, so they are normalised against the matching default.
 */
function normalizePolicy(policy: LeavePolicy): LeavePolicy {
  const fallback = defaultPolicies.find((p) => p.type === policy.type);
  const accrual: LeaveAccrual = policy.accrual ?? fallback?.accrual ?? 'annual';
  const monthlyAccrual = policy.monthlyAccrual ?? fallback?.monthlyAccrual ?? 0;
  return {
    ...policy,
    accrual,
    monthlyAccrual,
    // A monthly policy's annual figure is derived, never stored independently:
    // two sources for the same number drift.
    annual: accrual === 'monthly' ? monthlyAccrual * 12 : policy.annual ?? fallback?.annual ?? 0,
    carryForward: policy.carryForward ?? fallback?.carryForward ?? false,
    carryForwardBeyondYear:
      policy.carryForwardBeyondYear ?? fallback?.carryForwardBeyondYear ?? false,
    minTenureMonths: policy.minTenureMonths ?? fallback?.minTenureMonths ?? 0,
  };
}

export function getLeavePolicies(): LeavePolicy[] {
  const stored = readStoredLeavePolicies();
  return (stored ?? defaultPolicies).map(normalizePolicy);
}

/** The policy governing a leave type (`'Casual'`, not `'Casual Leave'`). */
export function getPolicyForType(type: string): LeavePolicy | undefined {
  return getLeavePolicies().find((p) => normalizeLeaveTypeValue(p.type) === type);
}

export function saveLeavePolicies(policies: LeavePolicy[]) {
  writeStoredLeavePolicies(policies);
  notifyLeavePoliciesChanged();
}

export function normalizeLeaveTypeValue(type: string): LeaveType {
  const clean = type.trim();
  if (!clean) return 'Casual';
  if (clean.endsWith(' Leave')) {
    return clean.slice(0, -6).trim() as LeaveType;
  }
  return clean as LeaveType;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === orgScopedKey(LEAVE_POLICIES_STORAGE_KEY)) {
      notifyLeavePoliciesChanged();
    }
  });
}
