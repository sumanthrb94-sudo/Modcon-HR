import type { LeaveRequest, RegularizationRequest } from '@/types';

/**
 * A day covered by leave is not a day to regularize.
 *
 * Leave already says what the day was. Asking somebody to account for a day
 * their manager has approved them off — or is about to decide — is asking the
 * same question twice, to the same person, in two queues that can disagree.
 * The flags the app derives from attendance have always skipped those days
 * (`deriveRegularizationRequests`); what did not was a request the employee
 * raised *before* the leave existed, which sat in the manager's queue beside
 * the leave covering it.
 *
 * Approved and Pending leave both cover the day, the same set the attendance
 * calendar treats as leave. A request is only *hidden* while that holds, never
 * changed: if the leave is rejected or cancelled the request is back in the
 * queue as it was, which is the honest outcome — the day needs accounting for
 * again. Decided requests stay visible whatever happens, as history.
 *
 * Pure, so `npm run test:unit` reaches it.
 */
export function leaveCovers(
  leaves: readonly Pick<LeaveRequest, 'employeeId' | 'startDate' | 'endDate' | 'status'>[],
  employeeId: string,
  date: string,
): boolean {
  return leaves.some(
    (leave) =>
      leave.employeeId === employeeId &&
      (leave.status === 'Approved' || leave.status === 'Pending') &&
      leave.startDate <= date &&
      leave.endDate >= date,
  );
}

/** Regularizations still asking for a decision on a day leave already covers are set aside. */
export function withoutRequestsCoveredByLeave<T extends Pick<RegularizationRequest, 'employeeId' | 'date' | 'status'>>(
  requests: readonly T[],
  leaves: readonly Pick<LeaveRequest, 'employeeId' | 'startDate' | 'endDate' | 'status'>[],
): T[] {
  return requests.filter((request) => request.status !== 'Pending' || !leaveCovers(leaves, request.employeeId, request.date));
}
