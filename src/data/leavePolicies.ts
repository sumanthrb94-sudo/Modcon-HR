import type { LeaveType } from '@/types';
import { orgScopedKey } from '@/lib/orgScope';

export interface LeavePolicy {
  id: string;
  type: string;
  annual: number;
  carryForward: boolean;
  encashment: boolean;
  halfDay: boolean;
  applicable: string;
}

const LEAVE_POLICIES_STORAGE_KEY = 'modcon.hr.leavePolicies';
export const LEAVE_POLICIES_CHANGED_EVENT = 'modcon-hr-leave-policies-changed';

const defaultPolicies: LeavePolicy[] = [
  { id: 'lp1', type: 'Casual Leave', annual: 12, carryForward: false, encashment: false, halfDay: true, applicable: 'All employees' },
  { id: 'lp2', type: 'Sick Leave', annual: 12, carryForward: false, encashment: false, halfDay: true, applicable: 'All employees' },
  { id: 'lp3', type: 'Earned Leave', annual: 18, carryForward: true, encashment: true, halfDay: true, applicable: 'All employees' },
  { id: 'lp4', type: 'Unpaid Leave', annual: 0, carryForward: false, encashment: false, halfDay: false, applicable: 'All employees' },
  { id: 'lp5', type: 'Maternity Leave', annual: 182, carryForward: false, encashment: false, halfDay: false, applicable: 'Female employees' },
  { id: 'lp6', type: 'Paternity Leave', annual: 5, carryForward: false, encashment: false, halfDay: false, applicable: 'Male employees' },
  { id: 'lp7', type: 'Comp Off', annual: 0, carryForward: true, encashment: false, halfDay: false, applicable: 'All employees' },
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

export function getLeavePolicies(): LeavePolicy[] {
  const stored = readStoredLeavePolicies();
  return stored ? stored : defaultPolicies;
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
