/**
 * The surface the leave simulation drives.
 *
 * A re-export list rather than a wrapper: the simulation calls the application's
 * own functions, so what it observes is what the app does. Anything it had to
 * reimplement would be testing itself.
 *
 * Bundled by build.mjs — `src/` needs the `@/` alias, JSX, and a definition for
 * `import.meta.env` before Node can load it.
 */
export {
  DEFAULT_ORG_KEY,
  getActiveOrgKey,
  setActiveOrgKey,
  orgScopedKey,
  resolveOrgKeyForProfile,
} from '@/lib/orgScope';

export { isMockDataCleared, setMockDataCleared } from '@/lib/mockDataFlag';

export {
  addEmployeeToDirectory,
  deleteEmployeeFromDirectory,
  getEmployeeDirectory,
  getEmployee,
  getEmployeeName,
  getNextEmployeeSequence,
} from '@/data/employees';

export {
  getCompanyProfile,
  saveCompanyProfile,
  isHrDesignation,
} from '@/data/companyProfile';

export {
  getLeavePolicies,
  saveLeavePolicies,
  isMonthlyPolicy,
} from '@/data/leavePolicies';

export {
  getLeaveRequests,
  saveLeaveRequests,
  updateLeaveRequestStatus,
  newLeaveRequestId,
  LeaveScopeError,
  getOnLeaveToday,
  getPendingCount,
  getApprovedThisMonth,
} from '@/data/leave';

export { countLeaveDays, leaveDayBreakdown } from '@/lib/leaveDays';
export { checkLeaveApplication } from '@/lib/leaveApplication';
export { getHolidayDirectory, saveHolidayDirectory } from '@/data/holidays';

export { getEntitlements, getEntitlementBalances } from '@/data/leaveEntitlements';

export {
  getVisibleEmployeeIds,
  getVisibleEmployees,
  getHrManagers,
  getCurrentEmployeeRecord,
} from '@/lib/dataScope';

export { getNotifications } from '@/data/notifications';
export { resolveAppRole } from '@/lib/accessControl';

export {
  PLAN,
  PLAN_PRICE_PAISE,
  GST_RATE,
  GRACE_PERIOD_DAYS,
  priceFor,
  formatPaise,
  accessState,
  trialSubscription,
  readCachedSubscription,
  cacheSubscription,
} from '@/data/subscription';
