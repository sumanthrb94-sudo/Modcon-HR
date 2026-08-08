import type { LeaveRequest, LeaveBalance, LeaveType, LeaveStatus } from '@/types';
import type { UserProfile } from '@/lib/auth';
import { isMockDataCleared } from '@/lib/mockDataFlag';
import { currentMonthIso } from '@/lib/today';
import { orgScopedKey } from '@/lib/orgScope';
import { getVisibleEmployeeIds } from '@/lib/dataScope';
import { resolveAppRole } from '@/lib/accessControl';

const LEAVE_REQUESTS_STORAGE_KEY = 'modcon.hr.leaveRequests';
export const LEAVE_REQUESTS_CHANGED_EVENT = 'modcon-hr-leave-requests-changed';

// ---- Leave Requests ---------------------------------------------------------
export const leaveRequests: LeaveRequest[] = isMockDataCleared() ? [] : [
  {
    id: 'lr-001',
    employeeId: 'emp-009',
    type: 'Casual',
    startDate: '2026-06-08',
    endDate: '2026-06-10',
    days: 3,
    reason: 'Personal family function — attending sister\'s wedding in hometown.',
    status: 'Approved',
    appliedOn: '2026-06-01',
    approverId: 'emp-010',
    approverName: 'Karthik Subramaniam',
  },
  {
    id: 'lr-002',
    employeeId: 'emp-013',
    type: 'Sick',
    startDate: '2026-06-08',
    endDate: '2026-06-12',
    days: 5,
    reason: 'Recovering from dengue fever — doctor advised complete rest.',
    status: 'Approved',
    appliedOn: '2026-06-07',
    approverId: 'emp-010',
    approverName: 'Karthik Subramaniam',
  },
  {
    id: 'lr-003',
    employeeId: 'emp-028',
    type: 'Earned',
    startDate: '2026-06-10',
    endDate: '2026-06-11',
    days: 2,
    reason: 'Planned vacation to Coorg with family.',
    status: 'Approved',
    appliedOn: '2026-06-02',
    approverId: 'emp-004',
    approverName: 'Ananya Reddy',
  },
  {
    id: 'lr-004',
    employeeId: 'emp-005',
    type: 'Casual',
    startDate: '2026-06-08',
    endDate: '2026-06-08',
    days: 1,
    reason: 'Personal errand — bank and legal documentation.',
    status: 'Approved',
    appliedOn: '2026-06-06',
    approverId: 'emp-001',
    approverName: 'Aarav Sharma',
  },
  {
    id: 'lr-005',
    employeeId: 'emp-035',
    type: 'Sick',
    startDate: '2026-06-10',
    endDate: '2026-06-11',
    days: 2,
    reason: 'Severe migraine attack — unable to attend work.',
    status: 'Pending',
    appliedOn: '2026-06-10',
    approverId: null,
  },
  {
    id: 'lr-006',
    employeeId: 'emp-016',
    type: 'Earned',
    startDate: '2026-06-15',
    endDate: '2026-06-18',
    days: 4,
    reason: 'Annual family trip to Goa.',
    status: 'Pending',
    appliedOn: '2026-06-08',
    approverId: null,
  },
  {
    id: 'lr-007',
    employeeId: 'emp-021',
    type: 'Casual',
    startDate: '2026-06-17',
    endDate: '2026-06-17',
    days: 1,
    reason: 'Child\'s school annual day event.',
    status: 'Pending',
    appliedOn: '2026-06-09',
    approverId: null,
  },
  {
    id: 'lr-008',
    employeeId: 'emp-012',
    type: 'Comp Off',
    startDate: '2026-06-19',
    endDate: '2026-06-19',
    days: 1,
    reason: 'Compensatory off for weekend release support on 31 May.',
    status: 'Pending',
    appliedOn: '2026-06-09',
    approverId: null,
  },
  {
    id: 'lr-009',
    employeeId: 'emp-025',
    type: 'Earned',
    startDate: '2026-06-22',
    endDate: '2026-06-26',
    days: 5,
    reason: 'International travel — Europe backpacking trip.',
    status: 'Pending',
    appliedOn: '2026-06-08',
    approverId: null,
  },
  {
    id: 'lr-010',
    employeeId: 'emp-006',
    type: 'Casual',
    startDate: '2026-06-12',
    endDate: '2026-06-12',
    days: 1,
    reason: 'Attending parent-teacher conference at son\'s school.',
    status: 'Approved',
    appliedOn: '2026-06-10',
    approverId: 'emp-001',
    approverName: 'Aarav Sharma',
  },
  {
    id: 'lr-011',
    employeeId: 'emp-033',
    type: 'Sick',
    startDate: '2026-06-03',
    endDate: '2026-06-04',
    days: 2,
    reason: 'Viral fever with doctor consultation.',
    status: 'Approved',
    appliedOn: '2026-06-03',
    approverId: 'emp-030',
    approverName: 'Sanjay Malhotra',
  },
  {
    id: 'lr-012',
    employeeId: 'emp-014',
    type: 'Casual',
    startDate: '2026-05-28',
    endDate: '2026-05-28',
    days: 1,
    reason: 'Property registration appointment.',
    status: 'Rejected',
    appliedOn: '2026-05-26',
    approverId: 'emp-010',
    approverName: 'Karthik Subramaniam',
  },
  {
    id: 'lr-013',
    employeeId: 'emp-029',
    type: 'Earned',
    startDate: '2026-07-01',
    endDate: '2026-07-05',
    days: 5,
    reason: 'Annual leave — visiting family in Kolkata.',
    status: 'Pending',
    appliedOn: '2026-06-10',
    approverId: null,
  },
  {
    id: 'lr-014',
    employeeId: 'emp-022',
    type: 'Casual',
    startDate: '2026-05-30',
    endDate: '2026-05-30',
    days: 1,
    reason: 'Home renovation work requiring personal presence.',
    status: 'Rejected',
    appliedOn: '2026-05-27',
    approverId: 'emp-003',
    approverName: 'Rohan Iyer',
  },
  {
    id: 'lr-015',
    employeeId: 'emp-038',
    type: 'Casual',
    startDate: '2026-06-18',
    endDate: '2026-06-18',
    days: 1,
    reason: 'Doctor consultation and follow-up tests.',
    status: 'Approved',
    appliedOn: '2026-06-12',
    approverId: 'emp-010',
    approverName: 'Karthik Subramaniam',
  },
  {
    id: 'lr-016',
    employeeId: 'emp-038',
    type: 'Earned',
    startDate: '2026-07-22',
    endDate: '2026-07-24',
    days: 3,
    reason: 'Planned family trip over long weekend.',
    status: 'Pending',
    appliedOn: '2026-07-15',
    approverId: null,
  },
  {
    id: 'lr-017',
    employeeId: 'emp-038',
    type: 'Sick',
    startDate: '2026-05-06',
    endDate: '2026-05-07',
    days: 2,
    reason: 'Seasonal flu with fever.',
    status: 'Approved',
    appliedOn: '2026-05-05',
    approverId: 'emp-010',
    approverName: 'Karthik Subramaniam',
  },
];

function readStoredLeaveRequests(): LeaveRequest[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(LEAVE_REQUESTS_STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LeaveRequest[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredLeaveRequests(requests: LeaveRequest[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(LEAVE_REQUESTS_STORAGE_KEY), JSON.stringify(requests));
}

function notifyLeaveRequestsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(LEAVE_REQUESTS_CHANGED_EVENT));
}

export function getLeaveRequests(): LeaveRequest[] {
  const stored = readStoredLeaveRequests();
  return stored ? stored : leaveRequests;
}

export function saveLeaveRequests(requests: LeaveRequest[]) {
  writeStoredLeaveRequests(requests);
  notifyLeaveRequestsChanged();
}

/**
 * A fresh request id.
 *
 * This was `lr-${requests.length + 1}`, which is unique only for a list that
 * never shrinks. Delete one request and the next application is issued an id
 * that is already in use — and `updateLeaveRequestStatus` below rewrites every
 * match, so one decision would silently change two people's leave.
 */
export function newLeaveRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `lr-${uuid}`;
  // Older Safari has crypto but not randomUUID. Random rather than sequential,
  // because sequence is exactly what could not be trusted here.
  return `lr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Raised when someone tries to decide leave that is not theirs to decide. */
export class LeaveScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeaveScopeError';
  }
}

export interface LeaveDecider {
  /** The signed-in account making the decision. */
  profile: UserProfile | null;
  /** Their employee record, for the audit trail. */
  employeeId?: string | null;
  name?: string;
}

/**
 * Approve or reject a request, on behalf of someone entitled to.
 *
 * The scope check lives here rather than in the pages because it was missing
 * from one of them: the Leave page filtered its list through
 * `getVisibleEmployeeIds`, and the dedicated approvals queue
 * (dashboard/LeaveRequestsApprovalsPage) filtered on status alone — so it
 * listed every request in the organisation and offered Approve on each. A
 * manager could decide leave for someone in a reporting line they cannot see.
 *
 * A guarantee that depends on every page remembering to filter is not a
 * guarantee, so the decision itself now refuses. Employees are refused
 * outright: their visible set is exactly themselves, so scope alone would let
 * them approve their own leave.
 */
export function updateLeaveRequestStatus(
  requestId: string,
  nextStatus: LeaveStatus,
  decider: LeaveDecider,
) {
  const requests = getLeaveRequests();
  const target = requests.find((request) => request.id === requestId);
  if (!target) throw new LeaveScopeError('That leave request no longer exists.');

  if (resolveAppRole(decider.profile) === 'Employee') {
    throw new LeaveScopeError('Leave is decided by your manager, not by you.');
  }
  if (!getVisibleEmployeeIds(decider.profile).has(target.employeeId)) {
    throw new LeaveScopeError('That request belongs to someone outside your team.');
  }

  const updated = requests.map((request) =>
    request.id === requestId
      ? {
          ...request,
          status: nextStatus,
          approverId: nextStatus === 'Approved' ? (decider.employeeId ?? request.approverId) : null,
          approverName: nextStatus === 'Approved' ? (decider.name ?? request.approverName) : undefined,
        }
      : request,
  );
  saveLeaveRequests(updated);
  return updated;
}

// ---- Leave Balances ---------------------------------------------------------
const LEAVE_TYPES: LeaveType[] = ['Casual', 'Sick', 'Earned'];

interface BalanceSeed {
  empId: string;
  casual: [number, number]; // [total, used]
  sick: [number, number];
  earned: [number, number];
}

const balanceSeeds: BalanceSeed[] = isMockDataCleared() ? [] : [
  { empId: 'emp-001', casual: [12, 2], sick: [10, 0], earned: [21, 5] },
  { empId: 'emp-002', casual: [12, 3], sick: [10, 1], earned: [21, 7] },
  { empId: 'emp-003', casual: [12, 1], sick: [10, 2], earned: [21, 4] },
  { empId: 'emp-004', casual: [12, 4], sick: [10, 1], earned: [21, 6] },
  { empId: 'emp-005', casual: [12, 5], sick: [10, 0], earned: [21, 8] },
  { empId: 'emp-006', casual: [12, 2], sick: [10, 0], earned: [21, 3] },
  { empId: 'emp-009', casual: [12, 5], sick: [10, 0], earned: [21, 2] },
  { empId: 'emp-010', casual: [12, 1], sick: [10, 0], earned: [21, 4] },
  { empId: 'emp-011', casual: [12, 3], sick: [10, 2], earned: [21, 5] },
  { empId: 'emp-012', casual: [12, 2], sick: [10, 1], earned: [21, 3] },
  { empId: 'emp-013', casual: [12, 0], sick: [10, 7], earned: [21, 0] },
  { empId: 'emp-014', casual: [12, 3], sick: [10, 1], earned: [21, 2] },
  { empId: 'emp-015', casual: [6, 1], sick: [5, 0], earned: [7, 0] },
  { empId: 'emp-038', casual: [12, 2], sick: [10, 2], earned: [21, 5] },
  { empId: 'emp-016', casual: [12, 2], sick: [10, 0], earned: [21, 6] },
  { empId: 'emp-021', casual: [12, 4], sick: [10, 1], earned: [21, 5] },
  { empId: 'emp-022', casual: [12, 2], sick: [10, 0], earned: [21, 3] },
  { empId: 'emp-025', casual: [12, 1], sick: [10, 0], earned: [21, 7] },
  { empId: 'emp-028', casual: [12, 3], sick: [10, 1], earned: [21, 4] },
  { empId: 'emp-029', casual: [12, 2], sick: [10, 0], earned: [21, 5] },
  { empId: 'emp-033', casual: [12, 3], sick: [10, 3], earned: [21, 4] },
  { empId: 'emp-035', casual: [12, 1], sick: [10, 3], earned: [21, 2] },
];

export const leaveBalances: LeaveBalance[] = balanceSeeds.flatMap((s) => [
  { employeeId: s.empId, type: 'Casual' as LeaveType, total: s.casual[0], used: s.casual[1], available: s.casual[0] - s.casual[1] },
  { employeeId: s.empId, type: 'Sick' as LeaveType, total: s.sick[0], used: s.sick[1], available: s.sick[0] - s.sick[1] },
  { employeeId: s.empId, type: 'Earned' as LeaveType, total: s.earned[0], used: s.earned[1], available: s.earned[0] - s.earned[1] },
]);

// `leaveBalances` above is the demo dataset's snapshot, and the only thing that
// still reads it is src/lib/seed.ts, which pushes it into Firestore.
//
// It used to back three surfaces as well — the Leave page's Balances tab, the
// dashboard's own-balance card, and the employee Time Off tab — through a
// `getEmployeeBalances` that replayed approvals against these rows. Because the
// rows are seeded only for the demo organisation, all three rendered nothing
// for a real company, while data/leaveEntitlements.ts held correct, policy-
// driven figures for the same people. Those surfaces read the entitlements now,
// and the replay machinery that connected them to the seed is gone rather than
// left as a second, disagreeing source of the same number.

// ---------------------------------------------------------------------------
// Aggregates
//
// Each takes the viewer, because none of them used to and every surface built
// on them reported the whole organisation's figures to whoever asked — a
// manager included, whose own leave page beside it showed only their reporting
// line. Passing `null` still means "everyone", which is what the seed scripts
// and the org-wide reports want; it is now a decision at the call site rather
// than the only available behaviour.
// ---------------------------------------------------------------------------

function scopeFilter(profile: UserProfile | null | undefined) {
  if (profile === null || profile === undefined) return () => true;
  const visible = getVisibleEmployeeIds(profile);
  return (request: LeaveRequest) => visible.has(request.employeeId);
}

/** Employees on approved leave on a given date, as far as `profile` may see. */
export function getOnLeaveToday(date: string, profile?: UserProfile | null): LeaveRequest[] {
  const inScope = scopeFilter(profile);
  return getLeaveRequests().filter(
    (r) => r.status === 'Approved' && r.startDate <= date && r.endDate >= date && inScope(r),
  );
}

/** Requests awaiting a decision from `profile`. */
export function getPendingCount(profile?: UserProfile | null): number {
  const inScope = scopeFilter(profile);
  return getLeaveRequests().filter((r) => r.status === 'Pending' && inScope(r)).length;
}

/**
 * Approved leave *taken* in `month`.
 *
 * Matched on `startDate`. It used to match `appliedOn`, so leave applied for in
 * May and taken in June was reported in May — the label says "this month", and
 * what a leave report means by that is the month the person was away.
 */
export function getApprovedThisMonth(
  month = currentMonthIso(),
  profile?: UserProfile | null,
): number {
  const inScope = scopeFilter(profile);
  return getLeaveRequests().filter(
    (r) => r.status === 'Approved' && r.startDate.startsWith(month) && inScope(r),
  ).length;
}

