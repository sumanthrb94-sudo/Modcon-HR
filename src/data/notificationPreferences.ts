import { orgScopedKey } from '@/lib/orgScope';
import { ORG_SETTINGS, publishOrgSetting } from '@/lib/orgSettings';

export interface NotificationPreference {
  id: string;
  category: string;
  label: string;
  description: string;
  email: boolean;
  inApp: boolean;
}

const NOTIFICATION_PREFERENCES_STORAGE_KEY = ORG_SETTINGS.notificationPreferences.storageKey;
export const NOTIFICATION_PREFERENCES_CHANGED_EVENT = ORG_SETTINGS.notificationPreferences.changedEvent;

const defaultNotificationPreferences: NotificationPreference[] = [
  { id: 'n1', category: 'Leave', label: 'Leave Request Submitted', description: 'Notify manager when employee submits a leave request', email: true, inApp: true },
  { id: 'n2', category: 'Leave', label: 'Leave Approved / Rejected', description: 'Notify employee when their leave status changes', email: true, inApp: true },
  { id: 'n3', category: 'Payroll', label: 'Payroll Processed', description: 'Notify employees when salary is processed', email: true, inApp: false },
  { id: 'n4', category: 'Payroll', label: 'Payslip Generated', description: 'Send payslip download link to employees', email: true, inApp: true },
  { id: 'n5', category: 'Attendance', label: 'Late Arrival Alert', description: 'Notify manager if employee clocks in after shift start', email: false, inApp: true },
  { id: 'n6', category: 'Attendance', label: 'Absent Without Approval', description: 'Alert HR and manager for unapproved absences', email: true, inApp: true },
  { id: 'n7', category: 'Onboarding', label: 'New Employee Joined', description: 'Broadcast welcome message on new joiner start date', email: true, inApp: true },
  { id: 'n8', category: 'Onboarding', label: 'Task Deadline Reminder', description: 'Remind assignees of pending onboarding tasks', email: false, inApp: true },
  { id: 'n9', category: 'Performance', label: 'Review Cycle Started', description: 'Notify employees when a new performance cycle is initiated', email: true, inApp: true },
  { id: 'n10', category: 'Performance', label: 'Review Due Reminder', description: 'Remind managers to complete overdue reviews', email: true, inApp: true },
  { id: 'n11', category: 'Recruitment', label: 'New Application Received', description: 'Notify hiring manager on new candidate application', email: false, inApp: true },
  { id: 'n12', category: 'Recruitment', label: 'Offer Letter Accepted', description: 'Alert HR team when candidate accepts an offer', email: true, inApp: true },
  // Expenses and announcements drive real entries in the in-app feed (see
  // data/notifications.ts) but had no preference of their own, so the menu
  // borrowed unrelated ids — "Expense claims need review" was governed by the
  // Leave Approved toggle, and announcements by whether Slack was connected.
  { id: 'n13', category: 'Expenses', label: 'Expense Claim Submitted', description: 'Notify approvers when a claim is waiting for review', email: true, inApp: true },
  { id: 'n14', category: 'Announcements', label: 'New Announcement Posted', description: 'Notify everyone when a company announcement is published', email: false, inApp: true },
];

function notifyNotificationPreferencesChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NOTIFICATION_PREFERENCES_CHANGED_EVENT));
}

function readStoredNotificationPreferences(): NotificationPreference[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(NOTIFICATION_PREFERENCES_STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NotificationPreference[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The defaults, with each company's saved on/off choices applied over the top.
 *
 * Returning the stored array wholesale meant a company that had ever pressed
 * Save was frozen on the notification types that existed at that moment: any
 * added later never appeared for them, and no longer showed up in Settings to
 * be switched on. Merging by id keeps their choices and still surfaces new
 * types.
 */
export function getNotificationPreferences(): NotificationPreference[] {
  const stored = readStoredNotificationPreferences();
  if (!stored) return defaultNotificationPreferences;

  const storedById = new Map(stored.map((preference) => [preference.id, preference]));
  return defaultNotificationPreferences.map((preference) => {
    const saved = storedById.get(preference.id);
    // Only the toggles are the company's; label/description/category stay
    // with the definition so wording fixes reach everyone.
    return saved
      ? { ...preference, email: saved.email ?? preference.email, inApp: saved.inApp ?? preference.inApp }
      : preference;
  });
}

/** Resolves once the organisation's copy has caught up — see publishOrgSetting. */
export function saveNotificationPreferences(preferences: NotificationPreference[]): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  window.localStorage.setItem(orgScopedKey(NOTIFICATION_PREFERENCES_STORAGE_KEY), JSON.stringify(preferences));
  notifyNotificationPreferencesChanged();
  return publishOrgSetting(ORG_SETTINGS.notificationPreferences, preferences);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === orgScopedKey(NOTIFICATION_PREFERENCES_STORAGE_KEY)) {
      notifyNotificationPreferencesChanged();
    }
  });
}
