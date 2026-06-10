// ===========================================================================
// ModCon HR — Dashboard module data & mock series
// All mock/generated arrays live here; index.tsx stays presentation-only.
// ===========================================================================

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
export const headcountSeries: MonthlyHeadcount[] = [
  { month: "Jul '25", count: 28 },
  { month: "Aug '25", count: 29 },
  { month: "Sep '25", count: 31 },
  { month: "Oct '25", count: 32 },
  { month: "Nov '25", count: 33 },
  { month: "Dec '25", count: 33 },
  { month: "Jan '26", count: 34 },
  { month: "Feb '26", count: 35 },
  { month: "Mar '26", count: 36 },
  { month: "Apr '26", count: 36 },
  { month: "May '26", count: 38 },
  { month: "Jun '26", count: 40 },
];

// ---------------------------------------------------------------------------
// 2. Weekly attendance (Mon – Fri, current week)
// ---------------------------------------------------------------------------
export const weeklyAttendance: WeeklyAttendance[] = [
  { day: 'Mon', Present: 32, WFH: 5, Leave: 2, Absent: 1 },
  { day: 'Tue', Present: 30, WFH: 6, Leave: 3, Absent: 1 },
  { day: 'Wed', Present: 33, WFH: 4, Leave: 2, Absent: 1 },
  { day: 'Thu', Present: 31, WFH: 5, Leave: 3, Absent: 1 },
  { day: 'Fri', Present: 28, WFH: 7, Leave: 3, Absent: 2 },
];

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

export const pendingApprovals: ApprovalItem[] = [
  { type: 'Leave Requests',     count: 7,  urgentCount: 2, colorClass: 'text-violet-600', bgClass: 'bg-violet-50' },
  { type: 'Expense Claims',     count: 4,  urgentCount: 1, colorClass: 'text-amber-600',  bgClass: 'bg-amber-50'  },
  { type: 'Regularizations',    count: 3,  urgentCount: 0, colorClass: 'text-blue-600',   bgClass: 'bg-brand-50'  },
  { type: 'Onboarding Tasks',   count: 5,  urgentCount: 1, colorClass: 'text-emerald-600',bgClass: 'bg-emerald-50'},
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
