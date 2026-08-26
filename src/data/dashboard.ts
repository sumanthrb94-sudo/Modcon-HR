// ===========================================================================
// ModCon HR — Dashboard module data & mock series
// All mock/generated arrays live here; index.tsx stays presentation-only.
// ===========================================================================

import { employees } from './employees';
import { leaveRequests } from './leave';
import { expenseClaims } from './expenses';
import { regularizationRequests } from './attendance';
import { onboardings } from './onboarding';

/** The demo's fixed "today" — shared so every derived figure agrees. */
export const TODAY = '2026-06-10';
const TODAY_DATE = new Date(TODAY);

export interface MonthlyHeadcount {
  month: string;  // "Jun '25"
  count: number;
}

export interface WeeklyAttendance {
  day: string;
  Present: number;
  WFH: number;
  Leave: number;
  Absent: number;
}

export interface PendingApproval {
  type: string;
  count: number;
  icon: string; // we pass icon name; components import from lucide-react
  color: string;
}

export interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  subject: string;
  timestamp: string; // ISO
}

export interface DeptChartEntry {
  name: string;
  value: number;
  fill: string;
}

// ---------------------------------------------------------------------------
// 1. Headcount growth — last 12 months ending Jun 2026
// ---------------------------------------------------------------------------
// Seeded from the real directory size so the chart's final point matches the
// "Total Employees" stat card. Offsets describe the growth curve leading up to
// today; previously these were absolute numbers ending at 40 while the
// directory held 35, so the card and the chart disagreed.
const CURRENT_HEADCOUNT = employees.length;
const HEADCOUNT_OFFSETS: Array<[string, number]> = [
  ["Jul '25", -7],
  ["Aug '25", -6],
  ["Sep '25", -5],
  ["Oct '25", -5],
  ["Nov '25", -4],
  ["Dec '25", -4],
  ["Jan '26", -3],
  ["Feb '26", -3],
  ["Mar '26", -2],
  ["Apr '26", -2],
  ["May '26", -1],
  ["Jun '26", 0],
];

export const headcountSeries: MonthlyHeadcount[] = HEADCOUNT_OFFSETS.map(
  ([month, offset]) => ({ month, count: CURRENT_HEADCOUNT + offset }),
);

// ---------------------------------------------------------------------------
// 2. Weekly attendance (Mon – Fri, current week)
// ---------------------------------------------------------------------------
// Each day's four buckets add up to the real headcount — otherwise the stacked
// bars imply a larger company than the directory contains.
const ATTENDANCE_SPLIT: Array<[string, number, number, number]> = [
  // [day, WFH, Leave, Absent] — Present is the remainder.
  ['Mon', 5, 2, 1],
  ['Tue', 6, 3, 1],
  ['Wed', 4, 2, 1],
  ['Thu', 5, 3, 1],
  ['Fri', 7, 3, 2],
];

export const weeklyAttendance: WeeklyAttendance[] = ATTENDANCE_SPLIT.map(
  ([day, WFH, Leave, Absent]) => ({
    day,
    Present: CURRENT_HEADCOUNT - WFH - Leave - Absent,
    WFH,
    Leave,
    Absent,
  }),
);

// ---------------------------------------------------------------------------
// 3. Pending approvals
// ---------------------------------------------------------------------------
export interface ApprovalItem {
  type: string;
  count: number;
  urgentCount: number;
  colorClass: string;
  bgClass: string;
}

// Counts are derived from the same data the drill-down pages read, so a
// dashboard tile and the page it links to can never disagree. "Urgent" means
// the item has been waiting longer than URGENT_AFTER_DAYS.
const URGENT_AFTER_DAYS = 7;

function daysWaiting(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.floor((TODAY_DATE.getTime() - then) / (1000 * 60 * 60 * 24));
}

const isUrgent = (iso: string) => daysWaiting(iso) > URGENT_AFTER_DAYS;

const pendingLeave = leaveRequests.filter((r) => r.status === 'Pending');
const pendingExpenseClaims = expenseClaims.filter((c) => c.status === 'Submitted');
const pendingRegularizations = regularizationRequests.filter((r) => r.status === 'Pending');
const openOnboardingTasks = onboardings.flatMap((o) =>
  o.tasks.filter((t) => t.status !== 'Completed'),
);

export const pendingApprovals: ApprovalItem[] = [
  {
    type: 'Leave Requests',
    count: pendingLeave.length,
    urgentCount: pendingLeave.filter((r) => isUrgent(r.appliedOn)).length,
    colorClass: 'text-violet-600',
    bgClass: 'bg-violet-50',
  },
  {
    type: 'Expense Claims',
    count: pendingExpenseClaims.length,
    urgentCount: pendingExpenseClaims.filter((c) => isUrgent(c.submittedOn)).length,
    colorClass: 'text-amber-600',
    bgClass: 'bg-amber-50',
  },
  {
    type: 'Regularizations',
    count: pendingRegularizations.length,
    urgentCount: pendingRegularizations.filter((r) => isUrgent(r.date)).length,
    colorClass: 'text-blue-600',
    bgClass: 'bg-brand-50',
  },
  {
    type: 'Onboarding Tasks',
    count: openOnboardingTasks.length,
    // An onboarding task is urgent once its due date has passed.
    urgentCount: openOnboardingTasks.filter((t) => t.dueDate < TODAY).length,
    colorClass: 'text-emerald-600',
    bgClass: 'bg-emerald-50',
  },
];

// ---------------------------------------------------------------------------
// 4. Recent activity feed
// ---------------------------------------------------------------------------
export const activityFeed: ActivityItem[] = [
  { id: 'af1', actor: 'Meera Krishnan',   action: 'applied for',    subject: '5-day Earned Leave',        timestamp: '2026-06-10T08:15:00Z' },
  { id: 'af2', actor: 'Arjun Verma',      action: 'submitted',      subject: 'Travel expense ₹12,400',    timestamp: '2026-06-10T07:50:00Z' },
  { id: 'af3', actor: 'Ishaan Gupta',     action: 'joined',         subject: 'Engineering (Intern)',       timestamp: '2026-06-09T10:00:00Z' },
  { id: 'af4', actor: 'Rishi Khanna',     action: 'moved to',       subject: 'Notice Period',             timestamp: '2026-06-09T09:00:00Z' },
  { id: 'af5', actor: 'Pooja Agarwal',    action: 'completed',      subject: 'Q1 Performance Review',     timestamp: '2026-06-08T16:30:00Z' },
  { id: 'af6', actor: 'Nikhil Bose',      action: 'submitted',      subject: 'Accommodation claim ₹8,200',timestamp: '2026-06-08T15:00:00Z' },
  { id: 'af7', actor: 'Sara Khan',        action: 'onboarded',      subject: 'Ishaan Gupta (Engineering)',timestamp: '2026-06-07T11:00:00Z' },
  { id: 'af8', actor: 'Rahul Deshpande', action: 'raised a ticket', subject: 'Laptop keyboard issue',     timestamp: '2026-06-07T10:20:00Z' },
];

// ---------------------------------------------------------------------------
// 5. Department color palette for chart
// ---------------------------------------------------------------------------
export const DEPT_COLORS: Record<string, string> = {
  Engineering:      '#3366ff',
  Product:          '#8b5cf6',
  Design:           '#ec4899',
  Sales:            '#10b981',
  Marketing:        '#f59e0b',
  'Human Resources':'#06b6d4',
  Finance:          '#6366f1',
  Operations:       '#f97316',
  'Customer Success':'#14b8a6',
  Legal:            '#94a3b8',
};

// Attendance chart colors
export const ATTENDANCE_COLORS = {
  Present: '#3366ff',
  WFH:     '#8b5cf6',
  Leave:   '#f59e0b',
  Absent:  '#f43f5e',
};
