/**
 * The in-app notification feed, derived from live records.
 *
 * This list used to be four hardcoded objects — "7 approvals are waiting", "4
 * claims in queue", "5 onboarding tasks due" — that never moved. They stayed on
 * the same numbers after every approval, showed the same counts to a brand new
 * organisation with no data at all, and one of them was gated on whether Slack
 * happened to be connected. Nothing here is a literal now: every entry counts
 * real pending records, and an entry with nothing pending does not appear.
 *
 * Counts also respect who is looking (see lib/dataScope.ts), so a manager is
 * told about their own reporting line rather than the whole company's queue.
 */
import type { UserProfile } from '@/lib/auth';
import { getLeaveRequests } from '@/data/leave';
import { expenseClaims } from '@/data/expenses';
import { regularizationRequests } from '@/data/attendance';
import { onboardings } from '@/data/onboarding';
import { announcements } from '@/data/common';
import { getNotificationPreferences } from '@/data/notificationPreferences';
import { getIntegrationPreferences } from '@/data/integrations';
import { getVisibleEmployeeIds } from '@/lib/dataScope';
import { resolveAppRole } from '@/lib/accessControl';
import { todayDate } from '@/lib/today';

/** Which lucide icon the menu should render. Kept as a key so this module
 *  stays free of React/JSX imports. */
export type NotificationIcon = 'leave' | 'expense' | 'announcement' | 'task' | 'clock';

export interface NotificationItem {
  /** Matches a NotificationPreference id, so the Settings toggles govern it. */
  id: string;
  title: string;
  subtitle: string;
  path: string;
  icon: NotificationIcon;
  count: number;
}

/** Announcements newer than this are "new" enough to notify about. */
const ANNOUNCEMENT_WINDOW_DAYS = 14;

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.floor((todayDate().getTime() - then) / 86_400_000);
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Every candidate notification with its live count, before preferences are
 * applied. Entries with a zero count are dropped by `getNotifications`.
 */
function buildCandidates(profile: UserProfile | null): NotificationItem[] {
  const visible = getVisibleEmployeeIds(profile);
  const isEmployee = resolveAppRole(profile) === 'Employee';

  const pendingLeave = getLeaveRequests().filter(
    (request) => request.status === 'Pending' && visible.has(request.employeeId),
  ).length;

  const pendingExpenses = expenseClaims.filter(
    (claim) => claim.status === 'Submitted' && visible.has(claim.employeeId),
  ).length;

  const pendingRegularizations = regularizationRequests.filter(
    (request) => request.status === 'Pending' && visible.has(request.employeeId),
  ).length;

  const openOnboardingTasks = onboardings
    .filter((onboarding) => visible.has(onboarding.employeeId))
    .flatMap((onboarding) => onboarding.tasks)
    .filter((task) => task.status !== 'Completed').length;

  const recentAnnouncements = announcements.filter(
    (announcement) => daysSince(announcement.date) <= ANNOUNCEMENT_WINDOW_DAYS,
  ).length;

  const candidates: NotificationItem[] = [
    {
      id: 'n1',
      title: 'Leave requests pending',
      subtitle: `${plural(pendingLeave, 'request')} awaiting approval`,
      path: '/dashboard/pending-approvals/leave-requests',
      icon: 'leave',
      count: pendingLeave,
    },
    {
      id: 'n13',
      title: 'Expense claims need review',
      subtitle: `${plural(pendingExpenses, 'claim')} in the queue`,
      path: '/dashboard/pending-approvals/expense-claims',
      icon: 'expense',
      count: pendingExpenses,
    },
    {
      id: 'n5',
      title: 'Attendance regularizations',
      subtitle: `${plural(pendingRegularizations, 'request')} to review`,
      path: '/dashboard/pending-approvals/regularizations',
      icon: 'clock',
      count: pendingRegularizations,
    },
    {
      id: 'n8',
      title: 'Onboarding tasks outstanding',
      subtitle: `${plural(openOnboardingTasks, 'task')} not yet complete`,
      path: '/dashboard/pending-approvals/onboarding-tasks',
      icon: 'task',
      count: openOnboardingTasks,
    },
    {
      id: 'n14',
      title: 'New company announcement',
      subtitle:
        recentAnnouncements === 1
          ? 'Posted in the last two weeks'
          : `${recentAnnouncements} posted in the last two weeks`,
      path: '/dashboard/announcements',
      icon: 'announcement',
      count: recentAnnouncements,
    },
  ];

  // The approval queues are not an employee's to action. Announcements are the
  // one thing here that is addressed to everybody.
  return isEmployee ? candidates.filter((item) => item.id === 'n14') : candidates;
}

/**
 * The notifications to show this viewer: real pending work, filtered to what
 * they have switched on in Settings.
 */
export function getNotifications(profile: UserProfile | null): NotificationItem[] {
  const enabled = new Set(
    getNotificationPreferences().filter((preference) => preference.inApp).map((p) => p.id),
  );

  return buildCandidates(profile).filter((item) => item.count > 0 && enabled.has(item.id));
}

/** Connected-integration tally shown at the foot of the menu. */
export function getIntegrationSummary(): { connected: number; total: number } {
  const integrations = getIntegrationPreferences();
  return {
    connected: integrations.filter((integration) => integration.connected).length,
    total: integrations.length,
  };
}
