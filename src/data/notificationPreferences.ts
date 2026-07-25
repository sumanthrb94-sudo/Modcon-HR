export interface NotificationPreference {
  id: string;
  category: string;
  label: string;
  description: string;
  email: boolean;
  inApp: boolean;
}

const NOTIFICATION_PREFERENCES_STORAGE_KEY = 'modcon.hr.notificationPreferences';
export const NOTIFICATION_PREFERENCES_CHANGED_EVENT = 'modcon-hr-notification-preferences-changed';

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
];

function notifyNotificationPreferencesChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NOTIFICATION_PREFERENCES_CHANGED_EVENT));
}

function readStoredNotificationPreferences(): NotificationPreference[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NotificationPreference[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getNotificationPreferences(): NotificationPreference[] {
  const stored = readStoredNotificationPreferences();
  return stored ? stored : defaultNotificationPreferences;
}

export function saveNotificationPreferences(preferences: NotificationPreference[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NOTIFICATION_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  notifyNotificationPreferencesChanged();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === NOTIFICATION_PREFERENCES_STORAGE_KEY) {
      notifyNotificationPreferencesChanged();
    }
  });
}
