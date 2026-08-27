// ===========================================================================
// ModCon HR — Dashboard module data & derived series
// Every figure surfaced on a dashboard card is derived here from the real
// org-scoped record sets (directory, leave, expenses, attendance, onboarding,
// recruitment, performance). Nothing on this page is a literal.
//
// The rule: if a stat cannot be derived from a record that actually exists,
// this module returns 0 / an empty array and the card renders an empty state.
// A fresh organisation with no data must never see an invented number.
// ===========================================================================

import { getEmployeeDirectory } from './employees';
import { getLeaveRequests } from './leave';
import { getExpenseClaims } from './expenses';
import { getTickets } from './helpdesk';
import { getRecordsByDate, getWeekSummary, getRegularizationRequests } from './attendance';
import { getOnboardings } from './onboarding';
import { getCandidates, getJobOpenings } from './recruitment';
import { getReviews } from './performance';
import { getApprovableEmployeeIds, getVisibleEmployeeIds } from '@/lib/dataScope';
import type { UserProfile } from '@/lib/auth';
import { todayDate, todayIso } from '@/lib/today';
import { formatMonthShort, formatWeekdayShort } from '@/lib/utils';

export interface MonthlyHeadcount {
  month: string;  // "Jun '26"
  count: number;
}

export interface WeeklyAttendance {
  day: string;
  Present: number;
  WFH: number;
  Leave: number;
  Absent: number;
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

export interface ApprovalItem {
  type: string;
  count: number;
  urgentCount: number;
  colorClass: string;
  bgClass: string;
}

export interface HealthMetric {
  label: string;
  value: number;   // 0-100
  detail: string;  // the record counts the percentage came from
}

const DAY_MS = 1000 * 60 * 60 * 24;

function daysUntil(iso: string): number {
  return (new Date(iso).getTime() - todayDate().getTime()) / DAY_MS;
}

function daysSince(iso: string): number {
  return (todayDate().getTime() - new Date(iso).getTime()) / DAY_MS;
}

/**
 * Start of the month `offset` months back. Built in UTC because todayDate()
 * and every stored record date are UTC midnight — reading local components off
 * them would land on the previous month's boundary for viewers west of UTC.
 */
function monthStartUtc(offset: number): Date {
  const today = todayDate();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - offset, 1));
}

/**
 * Last instant of that month — but never later than today, so the current
 * month is measured as-of now rather than as-of a month-end that has not
 * happened yet. Without this the trailing point of a trend disagrees with the
 * same stat on the dashboard.
 */
function monthEndOrToday(offset: number): Date {
  const start = monthStartUtc(offset);
  const monthEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59));
  const today = todayDate();
  return monthEnd > today ? today : monthEnd;
}

function monthLabel(offset: number): string {
  const start = monthStartUtc(offset);
  return `${formatMonthShort(start.toISOString())} '${String(start.getUTCFullYear()).slice(2)}`;
}

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function inr(amount: number): string {
  return amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// 1. Headcount growth — cumulative joins per month over the trailing 12 months
// ---------------------------------------------------------------------------
export function headcountTrend(): MonthlyHeadcount[] {
  const directory = getEmployeeDirectory();
  if (!directory.length) return [];

  const series: MonthlyHeadcount[] = [];
  for (let offset = 11; offset >= 0; offset--) {
    // An employee counts once they have joined, as of the month's cut-off.
    const asOf = monthEndOrToday(offset);
    series.push({
      month: monthLabel(offset),
      count: directory.filter((employee) => new Date(employee.dateOfJoining) <= asOf).length,
    });
  }
  return series;
}

/**
 * Mean tenure at the end of each of the trailing 12 months, over the people
 * who had joined by that point. Genuinely reconstructible from dateOfJoining,
 * so this is a real history rather than a projection backwards from a delta.
 */
export function avgTenureTrend(): { month: string; years: number }[] {
  const directory = getEmployeeDirectory();
  if (!directory.length) return [];

  const series: { month: string; years: number }[] = [];
  for (let offset = 11; offset >= 0; offset--) {
    const asOf = monthEndOrToday(offset);
    const joined = directory.filter((employee) => new Date(employee.dateOfJoining) <= asOf);
    const years = joined.length
      ? joined.reduce(
        (sum, employee) => sum + (asOf.getTime() - new Date(employee.dateOfJoining).getTime()) / (DAY_MS * 365.25),
        0,
      ) / joined.length
      : 0;
    series.push({ month: monthLabel(offset), years: Math.round(years * 10) / 10 });
  }
  return series;
}

// ---------------------------------------------------------------------------
// 2. Weekly attendance — straight from the marked attendance records
//    Half Days count towards Present; they are attendance, not absence.
// ---------------------------------------------------------------------------
export function weeklyAttendanceSeries(): WeeklyAttendance[] {
  const rows = getWeekSummary().map((day) => ({
    day: formatWeekdayShort(day.date),
    Present: day.Present + day['Half Day'],
    WFH: day['Work From Home'],
    Leave: day['On Leave'],
    Absent: day.Absent,
  }));
  const anyMarked = rows.some((row) => row.Present + row.WFH + row.Leave + row.Absent > 0);
  return anyMarked ? rows : [];
}

// ---------------------------------------------------------------------------
// 3. Today's attendance split
// ---------------------------------------------------------------------------
export function attendanceToday(): { present: number; wfh: number; onLeave: number; absent: number; marked: number } {
  const records = getRecordsByDate(todayIso());
  return {
    present: records.filter((r) => r.status === 'Present' || r.status === 'Half Day').length,
    wfh: records.filter((r) => r.status === 'Work From Home').length,
    onLeave: records.filter((r) => r.status === 'On Leave').length,
    absent: records.filter((r) => r.status === 'Absent').length,
    marked: records.length,
  };
}

/**
 * Distinct people off today: anyone flagged "On Leave" in the directory, plus
 * anyone with an approved leave request spanning today. Union, so a person
 * captured by both sources is only counted once.
 */
export function onLeaveToday(): number {
  const off = new Set<string>();
  getEmployeeDirectory()
    .filter((employee) => employee.status === 'On Leave')
    .forEach((employee) => off.add(employee.id));
  getLeaveRequests()
    .filter((request) => request.status === 'Approved'
      && request.startDate <= todayIso()
      && request.endDate >= todayIso())
    .forEach((request) => off.add(request.employeeId));
  return off.size;
}

// ---------------------------------------------------------------------------
// 4. Open positions & attrition
// ---------------------------------------------------------------------------
export function openPositionsCount(): number {
  return getJobOpenings()
    .filter((job) => job.status === 'Open')
    .reduce((sum, job) => sum + (job.openings || 1), 0);
}

/**
 * Share of the workforce currently serving notice. Reported as-is — the
 * previous version multiplied it by 4 to "annualise" a point-in-time figure,
 * which invented a number no record supports.
 */
export function noticePeriodRate(): number {
  const directory = getEmployeeDirectory();
  if (!directory.length) return 0;
  const notice = directory.filter((employee) => employee.status === 'Notice Period').length;
  return Math.round((notice / directory.length) * 1000) / 10;
}

export function avgTenureYears(): number {
  const directory = getEmployeeDirectory();
  if (!directory.length) return 0;
  const total = directory.reduce(
    (sum, employee) => sum + (todayDate().getTime() - new Date(employee.dateOfJoining).getTime()) / (DAY_MS * 365.25),
    0,
  );
  return Math.round((total / directory.length) * 10) / 10;
}

// ---------------------------------------------------------------------------
// 5. Pending approvals — counted from the actual queues
//    "Urgent" is defined per queue and stated on the card, not guessed.
// ---------------------------------------------------------------------------
/**
 * `profile` scopes the Leave Requests row to the requests that viewer may
 * actually decide, so the number on the card and the length of the queue
 * behind it agree — a manager told twelve approvals were waiting, who opened
 * the queue and found two, would reasonably conclude the app had lost ten.
 * Omitted, it counts the whole organisation, which is what every caller did
 * before the reporting-line rule existed. For HR and Admin the scoped figure
 * *is* the organisation's, minus their own request — that is not the scoping
 * being skipped, it is what deciding organisation-wide adds up to.
 *
 * The other three rows stay organisation-wide for everybody. That is the same
 * gap in a different workflow, left as it was rather than changed on the way
 * past: expenses, regularizations and onboarding each have their own approval
 * route and their own answer to who decides.
 */
export function pendingApprovalsSummary(profile?: UserProfile | null): ApprovalItem[] {
  const decidable = profile === undefined ? null : getApprovableEmployeeIds(profile);
  const leave = getLeaveRequests().filter(
    (request) => request.status === 'Pending' && (!decidable || decidable.has(request.employeeId)),
  );
  const expenses = getExpenseClaims().filter((claim) => claim.status === 'Submitted');
  const regularizations = getRegularizationRequests().filter((request) => request.status === 'Pending');
  const onboardingTasks = getOnboardings()
    .flatMap((onboarding) => onboarding.tasks)
    .filter((task) => task.status !== 'Completed');

  return [
    {
      type: 'Leave Requests',
      count: leave.length,
      // Urgent = leave that starts within 3 days and still has no decision.
      urgentCount: leave.filter((request) => daysUntil(request.startDate) <= 3).length,
      colorClass: 'text-violet-600',
      bgClass: 'bg-violet-50',
    },
    {
      type: 'Expense Claims',
      count: expenses.length,
      // Urgent = sitting in the queue for a week or more.
      urgentCount: expenses.filter((claim) => daysSince(claim.submittedOn) >= 7).length,
      colorClass: 'text-amber-600',
      bgClass: 'bg-amber-50',
    },
    {
      type: 'Regularizations',
      count: regularizations.length,
      urgentCount: regularizations.filter((request) => daysSince(request.date) >= 7).length,
      colorClass: 'text-blue-600',
      bgClass: 'bg-brand-50',
    },
    {
      type: 'Onboarding Tasks',
      count: onboardingTasks.length,
      // Urgent = past its due date.
      urgentCount: onboardingTasks.filter((task) => task.dueDate && daysUntil(task.dueDate) < 0).length,
      colorClass: 'text-emerald-600',
      bgClass: 'bg-emerald-50',
    },
  ];
}

// ---------------------------------------------------------------------------
// 6. Recent activity — a merged, time-ordered view of real records
// ---------------------------------------------------------------------------
/**
 * The activity stream, scoped to whoever is reading it.
 *
 * Every item names a person, so an unscoped feed is a roster: it told an
 * Employee who applied for leave, who claimed what expense and who joined
 * which department. The feed now carries only the people the viewer may
 * already see — themselves for an Employee, their reporting line plus HR for
 * a Manager, everyone for HR and Admin. See lib/dataScope.ts.
 *
 * `profile` is required rather than optional on purpose. Optional, every
 * existing call site would have gone on compiling and gone on showing the
 * whole company — the same reason `updateLeaveRequestStatus` demands the
 * deciding profile.
 */
export function recentActivity(profile: UserProfile | null, limit = 25): ActivityItem[] {
  const directory = getEmployeeDirectory();
  const visible = getVisibleEmployeeIds(profile, directory);
  const nameById = new Map(directory.map((employee) => [employee.id, employee.fullName]));
  const nameOf = (id: string) => nameById.get(id) ?? 'A team member';

  const items: ActivityItem[] = [];

  getLeaveRequests()
    .filter((request) => visible.has(request.employeeId))
    .forEach((request) => items.push({
      id: `leave-${request.id}`,
      actor: nameOf(request.employeeId),
      action: 'applied for',
      subject: `${request.days}-day ${request.type} leave`,
      timestamp: request.appliedOn,
    }));

  getExpenseClaims()
    .filter((claim) => visible.has(claim.employeeId))
    .forEach((claim) => items.push({
      id: `expense-${claim.id}`,
      actor: nameOf(claim.employeeId),
      action: 'submitted',
      subject: `${claim.title} ${inr(claim.amount)}`,
      timestamp: claim.submittedOn,
    }));

  getTickets()
    .filter((ticket) => visible.has(ticket.raisedById))
    .forEach((ticket) => items.push({
      id: `ticket-${ticket.id}`,
      actor: nameOf(ticket.raisedById),
      action: 'raised a ticket',
      subject: ticket.subject,
      timestamp: ticket.createdOn,
    }));

  directory
    .filter((employee) => visible.has(employee.id))
    .forEach((employee) => items.push({
      id: `joined-${employee.id}`,
      actor: employee.fullName,
      action: 'joined',
      subject: `${employee.department} (${employee.designation})`,
      timestamp: employee.dateOfJoining,
    }));

  getReviews()
    // Matched on `employeeId`, never the denormalised `employeeName` beside
    // it: a stored name is a copy of the directory at write time, and scoping
    // on a copy scopes on stale data.
    .filter((review) => review.status === 'Completed' && visible.has(review.employeeId))
    .forEach((review) => items.push({
      id: `review-${review.id}`,
      actor: review.employeeName,
      action: 'completed',
      subject: `${review.cycle} performance review`,
      timestamp: review.dueDate,
    }));

  // Timestamps are a mix of date-only and full ISO strings; both sort
  // correctly lexicographically because they share the YYYY-MM-DD prefix.
  return items
    .filter((item) => Boolean(item.timestamp))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// 7. HR health score — only metrics with records behind them are returned,
//    so the card shrinks (or empties) rather than padding with placeholders.
// ---------------------------------------------------------------------------
export function hrHealthMetrics(): HealthMetric[] {
  const candidates = getCandidates();
  const reachedOffer = candidates.filter((c) => c.stage === 'Offer' || c.stage === 'Hired');
  const hired = candidates.filter((c) => c.stage === 'Hired');

  const reviews = getReviews();
  const completedReviews = reviews.filter((review) => review.status === 'Completed');

  const tasks = getOnboardings().flatMap((onboarding) => onboarding.tasks);
  const training = tasks.filter((task) => task.category === 'Training');
  const compliance = tasks.filter((task) => task.category === 'Compliance');
  const doneIn = (list: typeof tasks) => list.filter((task) => task.status === 'Completed').length;

  const candidateMetrics: Array<HealthMetric & { basis: number }> = [
    {
      label: 'Offer Acceptance Rate',
      value: percent(hired.length, reachedOffer.length),
      detail: `${hired.length} of ${reachedOffer.length} offers accepted`,
      basis: reachedOffer.length,
    },
    {
      label: 'Review Completion',
      value: percent(completedReviews.length, reviews.length),
      detail: `${completedReviews.length} of ${reviews.length} reviews closed`,
      basis: reviews.length,
    },
    {
      label: 'Training Completion',
      value: percent(doneIn(training), training.length),
      detail: `${doneIn(training)} of ${training.length} training tasks done`,
      basis: training.length,
    },
    {
      label: 'Policy Compliance',
      value: percent(doneIn(compliance), compliance.length),
      detail: `${doneIn(compliance)} of ${compliance.length} compliance tasks done`,
      basis: compliance.length,
    },
  ];

  return candidateMetrics
    .filter((metric) => metric.basis > 0)
    .map(({ label, value, detail }) => ({ label, value, detail }));
}

// ---------------------------------------------------------------------------
// 8. Department distribution — counted off the directory itself.
//    DepartmentRecord.headcount is an admin-entered field on custom rows and
//    can drift from the real roster, so a "headcount distribution" chart
//    counts employees rather than trusting that stored number.
// ---------------------------------------------------------------------------
export function departmentDistribution(): DeptChartEntry[] {
  const counts = new Map<string, number>();
  getEmployeeDirectory().forEach((employee) => {
    counts.set(employee.department, (counts.get(employee.department) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value, fill: DEPT_COLORS[name] ?? '#94a3b8' }))
    .sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------
// 9. Chart palettes — presentation constants, not data
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

export const ATTENDANCE_COLORS = {
  Present: '#3366ff',
  WFH:     '#8b5cf6',
  Leave:   '#f59e0b',
  Absent:  '#f43f5e',
};
