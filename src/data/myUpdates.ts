/**
 * The viewer's own decided requests, read from the stores. The logic is
 * buildMyUpdates in src/data/myUpdatesRules.ts (pure, unit-tested).
 */
import { getLeaveRequests } from '@/data/leave';
import { getExpenseClaims } from '@/data/expenses';
import { getRegularizationRequestsFor } from '@/data/attendance';
import { buildMyUpdates, type MyUpdate } from '@/data/myUpdatesRules';

export { UPDATE_WINDOW_DAYS, type MyUpdate, type UpdateKind } from '@/data/myUpdatesRules';

export function getMyUpdates(employeeId: string | null | undefined, now: Date = new Date()): MyUpdate[] {
  if (!employeeId) return [];
  return buildMyUpdates(employeeId, {
    leave: getLeaveRequests(),
    expenses: getExpenseClaims(),
    regularizations: getRegularizationRequestsFor(employeeId),
  }, now);
}
