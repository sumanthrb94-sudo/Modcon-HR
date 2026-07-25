// ===========================================================================
// ModCon HR — Dashboard (HR Command-Center)
// ===========================================================================
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import {
  Users, CalendarCheck, CalendarOff, Briefcase, TrendingUp,
  Clock, Bell, IndianRupee, CheckSquare, ChevronRight,
  Cake, Star, UserPlus, Zap, Gift, Megaphone, Mail, Phone, MapPin,
} from 'lucide-react';

import {
  Card, CardHeader, Badge, Button, Avatar,
  StatCard, ProgressBar, PageHeader, QuickAddMenu, NotificationsMenu,
} from '@/components/ui';
import { employees } from '@/data/employees';
import { getLeaveRequests, getEmployeeBalances } from '@/data/leave';
import { expenseClaims } from '@/data/expenses';
import { tickets } from '@/data/helpdesk';
import { getDepartmentDirectory } from '@/data/departments';
import { announcements } from '@/data/common';
import { getHolidayDirectory } from '@/data/holidays';
import { formatDate, formatDateShort, timeAgo, pct } from '@/lib/utils';
import { isMockDataCleared } from '@/lib/mockDataFlag';
import { useAuth } from '@/lib/auth';
import { getCurrentEmployee } from '@/lib/currentEmployee';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { useDepartmentDirectoryRevision } from '@/lib/useDepartmentDirectoryRevision';
import { useHolidayDirectoryRevision } from '@/lib/useHolidayDirectoryRevision';
import {
  headcountSeries, weeklyAttendance, pendingApprovals,
  activityFeed, DEPT_COLORS, ATTENDANCE_COLORS,
} from '@/data/dashboard';

// ---------------------------------------------------------------------------
// Fixed "today" for demo purposes
// ---------------------------------------------------------------------------
const TODAY = '2026-06-10';
const TODAY_DATE = new Date(TODAY);

// ---------------------------------------------------------------------------
// Announcement category → badge tone helper
// ---------------------------------------------------------------------------
function annTone(cat: string) {
  if (cat === 'Policy') return 'amber' as const;
  if (cat === 'Event') return 'blue' as const;
  if (cat === 'Celebration') return 'green' as const;
  return 'gray' as const;
}

// ---------------------------------------------------------------------------
// Approval icon map
// ---------------------------------------------------------------------------
const APPROVAL_ICONS: Record<string, ReactNode> = {
  'Leave Requests': <CalendarOff size={18} />,
  'Expense Claims': <IndianRupee size={18} />,
  'Regularizations': <Clock size={18} />,
  'Onboarding Tasks': <CheckSquare size={18} />,
};

const APPROVAL_ROUTES: Record<string, string> = {
  'Leave Requests': '/dashboard/pending-approvals/leave-requests',
  'Expense Claims': '/dashboard/pending-approvals/expense-claims',
  Regularizations: '/dashboard/pending-approvals/regularizations',
  'Onboarding Tasks': '/dashboard/pending-approvals/onboarding-tasks',
};

// ---------------------------------------------------------------------------
// Tooltip custom for charts
// ---------------------------------------------------------------------------
interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-ink-100 rounded-xl shadow-card-hover px-3 py-2.5 text-xs min-w-[120px]">
      {label && <p className="font-semibold text-ink-600 mb-1.5">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-ink-500">{p.name}</span>
          <span className="ml-auto font-semibold text-ink-800">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function EmployeeDashboard() {
  const { profile } = useAuth();
  const currentEmployee = getCurrentEmployee(profile);
  const holidayRevision = useHolidayDirectoryRevision();
  const displayName = currentEmployee?.fullName ?? profile?.displayName ?? profile?.email ?? 'Employee';
  const firstName = displayName.split(' ')[0].split('@')[0];

  const leaveRequests = useMemo(
    () => (currentEmployee ? getLeaveRequests().filter((request) => request.employeeId === currentEmployee.id) : []),
    [currentEmployee],
  );
  const leaveBalances = useMemo(
    () => (currentEmployee ? getEmployeeBalances(currentEmployee.id, getLeaveRequests()) : []),
    [currentEmployee],
  );
  const employeeExpenses = useMemo(
    () => (currentEmployee ? expenseClaims.filter((claim) => claim.employeeId === currentEmployee.id) : []),
    [currentEmployee],
  );
  const expenseRows = useMemo(
    () => employeeExpenses
      .slice()
      .sort((a, b) => b.submittedOn.localeCompare(a.submittedOn))
      .slice(0, 4),
    [employeeExpenses],
  );
  const employeeTickets = useMemo(
    () => (currentEmployee ? tickets.filter((ticket) => ticket.raisedById === currentEmployee.id) : []),
    [currentEmployee],
  );
  const ticketRows = useMemo(
    () => employeeTickets
      .slice()
      .sort((a, b) => b.createdOn.localeCompare(a.createdOn))
      .slice(0, 4),
    [employeeTickets],
  );
  const upcomingHolidays = useMemo(
    () => getHolidayDirectory()
      .filter((holiday) => new Date(holiday.date) >= TODAY_DATE)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3),
    [holidayRevision],
  );
  const latestAnnouncements = useMemo(
    () => announcements
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3),
    [],
  );
  const nextPlannedLeave = useMemo(
    () => leaveRequests
      .filter((request) => request.status !== 'Rejected' && request.status !== 'Cancelled' && new Date(request.startDate) >= TODAY_DATE)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0],
    [leaveRequests],
  );
  const activeExpenseAmount = useMemo(
    () => employeeExpenses
      .filter((claim) => claim.status === 'Submitted' || claim.status === 'Approved')
      .reduce((sum, claim) => sum + claim.amount, 0),
    [employeeExpenses],
  );
  const newestActiveTicket = useMemo(
    () => employeeTickets
      .filter((ticket) => ticket.status === 'Open' || ticket.status === 'In Progress')
      .sort((a, b) => b.createdOn.localeCompare(a.createdOn))[0],
    [employeeTickets],
  );
  const quickActions = [
    {
      title: 'Request Leave',
      subtitle: 'View balances and apply',
      to: '/leave',
      icon: <CalendarOff size={18} className="text-violet-600" />,
      accent: 'bg-violet-50 border-violet-100',
    },
    {
      title: 'Submit Expense',
      subtitle: 'Track reimbursements',
      to: '/expenses',
      icon: <IndianRupee size={18} className="text-amber-600" />,
      accent: 'bg-amber-50 border-amber-100',
    },
    {
      title: 'Raise Ticket',
      subtitle: 'Get HR or IT support',
      to: '/helpdesk',
      icon: <Bell size={18} className="text-brand-600" />,
      accent: 'bg-brand-50 border-brand-100',
    },
    {
      title: 'Read Updates',
      subtitle: 'Announcements and news',
      to: '/dashboard/announcements',
      icon: <Megaphone size={18} className="text-emerald-600" />,
      accent: 'bg-emerald-50 border-emerald-100',
    },
  ] as const;

  const leaveSummary = {
    pending: leaveRequests.filter((request) => request.status === 'Pending').length,
    approved: leaveRequests.filter((request) => request.status === 'Approved').length,
  };

  const openTickets = employeeTickets.filter((ticket) => ticket.status === 'Open' || ticket.status === 'In Progress').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${firstName} 👋`}
        subtitle={currentEmployee ? `${currentEmployee.designation} · ${currentEmployee.department}` : 'Employee workspace'}
        actions={<NotificationsMenu />}
      />

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <CardHeader title="My Leave Balance" subtitle="Your available leave buckets" />
          {leaveBalances.length === 0 ? (
            <p className="text-sm text-ink-500">No leave balance data available for this account yet.</p>
          ) : (
            <div className="space-y-3">
              {leaveBalances.map((balance) => (
                <div key={balance.type} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-700">{balance.type}</span>
                    <span className="text-ink-500">{balance.available}/{balance.total} available</span>
                  </div>
                  <ProgressBar value={pct(balance.used, balance.total)} tone={pct(balance.used, balance.total) > 75 ? 'amber' : 'brand'} size="sm" />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Leave Requests" value={String(leaveRequests.length)} icon={<CalendarOff size={18} />} />
        <StatCard label="Pending Leaves" value={String(leaveSummary.pending)} icon={<Clock size={18} />} />
        <StatCard label="Expense Claims" value={String(expenseRows.length)} icon={<IndianRupee size={18} />} />
        <StatCard label="Open Tickets" value={String(openTickets)} icon={<Bell size={18} />} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader title="My Workspace" subtitle="Jump into the workflows you use most" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.title}
                to={action.to}
                className={`rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-card-hover ${action.accent}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white/80 flex items-center justify-center shadow-sm">
                    {action.icon}
                  </div>
                  <ChevronRight size={16} className="text-ink-300" />
                </div>
                <p className="mt-4 text-sm font-semibold text-ink-900">{action.title}</p>
                <p className="mt-1 text-sm text-ink-500">{action.subtitle}</p>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div className="rounded-2xl border border-ink-100 bg-ink-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <CalendarCheck size={16} className="text-brand-600" />
                Next time off
              </div>
              {nextPlannedLeave ? (
                <>
                  <p className="mt-3 text-sm font-medium text-ink-900">{nextPlannedLeave.type} leave</p>
                  <p className="mt-1 text-sm text-ink-500">{formatDate(nextPlannedLeave.startDate)} to {formatDate(nextPlannedLeave.endDate)}</p>
                  <Badge tone={nextPlannedLeave.status === 'Approved' ? 'green' : 'amber'} dot className="mt-3">{nextPlannedLeave.status}</Badge>
                </>
              ) : (
                <>
                  <p className="mt-3 text-sm font-medium text-ink-900">No upcoming leave planned</p>
                  <p className="mt-1 text-sm text-ink-500">Use Leave Management when you need time away.</p>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-ink-100 bg-ink-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <IndianRupee size={16} className="text-amber-600" />
                Reimbursements in flight
              </div>
              <p className="mt-3 text-lg font-semibold text-ink-900">
                {activeExpenseAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
              </p>
              <p className="mt-1 text-sm text-ink-500">
                {employeeExpenses.filter((claim) => claim.status === 'Submitted' || claim.status === 'Approved').length} claims awaiting payout or final reimbursement.
              </p>
            </div>

            <div className="rounded-2xl border border-ink-100 bg-ink-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <Bell size={16} className="text-brand-600" />
                Support status
              </div>
              <p className="mt-3 text-sm font-medium text-ink-900">
                {newestActiveTicket ? newestActiveTicket.subject : 'No open support requests'}
              </p>
              <p className="mt-1 text-sm text-ink-500">
                {newestActiveTicket
                  ? `${newestActiveTicket.status} · ${newestActiveTicket.assignedTo}`
                  : 'Raise a helpdesk ticket if you need HR, IT, payroll, or facilities support.'}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Coming Up"
            subtitle="Important dates and company moments"
            action={
              <Link to="/dashboard/holiday-calendar" className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
                View calendar
              </Link>
            }
          />
          <div className="space-y-3">
            {upcomingHolidays.length === 0 ? (
              <p className="text-sm text-ink-500">No upcoming holidays are published yet.</p>
            ) : upcomingHolidays.map((holiday) => (
              <div key={holiday.id} className="rounded-xl border border-ink-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink-900">{holiday.name}</p>
                    <p className="text-sm text-ink-500 mt-1">{formatDate(holiday.date)}</p>
                  </div>
                  <Badge tone={holiday.type === 'National' ? 'blue' : holiday.type === 'Optional' ? 'amber' : 'green'}>
                    {holiday.type}
                  </Badge>
                </div>
              </div>
            ))}
            {latestAnnouncements[0] && (
              <div className="rounded-2xl bg-brand-50 p-4">
                <div className="flex items-center gap-2">
                  <Megaphone size={16} className="text-brand-600" />
                  <p className="text-sm font-semibold text-ink-900">Latest announcement</p>
                </div>
                <p className="mt-3 text-sm font-medium text-ink-900">{latestAnnouncements[0].title}</p>
                <p className="mt-1 text-sm text-ink-500 line-clamp-3">{latestAnnouncements[0].body}</p>
                <p className="mt-3 text-xs text-ink-400">{formatDate(latestAnnouncements[0].date)} · {latestAnnouncements[0].author}</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Recent Leave Requests" subtitle="Your latest submissions" />
          <div className="space-y-3">
            {leaveRequests.length === 0 ? (
              <p className="text-sm text-ink-500">No leave requests found.</p>
            ) : leaveRequests.slice(0, 4).map((request) => (
              <div key={request.id} className="rounded-xl border border-ink-100 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900">{request.type}</p>
                  <p className="text-xs text-ink-400">{request.startDate} to {request.endDate}</p>
                </div>
                <Badge tone={request.status === 'Approved' ? 'green' : request.status === 'Rejected' ? 'red' : 'amber'} dot>{request.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent Expense Claims" subtitle="Your latest reimbursements" />
          <div className="space-y-3">
            {expenseRows.length === 0 ? (
              <p className="text-sm text-ink-500">No expense claims found.</p>
            ) : expenseRows.map((claim) => (
              <div key={claim.id} className="rounded-xl border border-ink-100 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900">{claim.title}</p>
                  <p className="text-xs text-ink-400">{claim.category} · {claim.date}</p>
                </div>
                <Badge tone={claim.status === 'Reimbursed' ? 'green' : claim.status === 'Submitted' ? 'amber' : 'gray'} dot>{claim.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent Helpdesk Tickets" subtitle="Your latest requests" />
          <div className="space-y-3">
            {ticketRows.length === 0 ? (
              <p className="text-sm text-ink-500">No support tickets found.</p>
            ) : ticketRows.map((ticket) => (
              <div key={ticket.id} className="rounded-xl border border-ink-100 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900">{ticket.subject}</p>
                  <p className="text-xs text-ink-400">{ticket.category} · {ticket.ticketCode}</p>
                </div>
                <Badge tone={ticket.status === 'Open' ? 'blue' : ticket.status === 'In Progress' ? 'amber' : 'green'} dot>{ticket.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Company Updates"
            subtitle="Recent announcements from people ops and leadership"
            action={
              <Link to="/dashboard/announcements" className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
                View all
              </Link>
            }
          />
          <div className="space-y-3">
            {latestAnnouncements.map((announcement) => (
              <div key={announcement.id} className="rounded-xl border border-ink-100 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-ink-900">{announcement.title}</p>
                  <Badge tone={annTone(announcement.category)}>{announcement.category}</Badge>
                </div>
                <p className="mt-2 text-sm text-ink-500 line-clamp-2">{announcement.body}</p>
                <p className="mt-3 text-xs text-ink-400">{formatDate(announcement.date)} · {announcement.author}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function DashboardPage() {
  const { profile } = useAuth();

  return profile?.role === 'admin' ? <AdminDashboard /> : <EmployeeDashboard />;
}

function AdminDashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const directoryRevision = useEmployeeDirectoryRevision();
  const departmentRevision = useDepartmentDirectoryRevision();
  const holidayRevision = useHolidayDirectoryRevision();
  const holidays = useMemo(() => getHolidayDirectory(), [holidayRevision]);
  const firstName = (profile?.displayName || profile?.email || 'there').split(' ')[0].split('@')[0];
  // These period-over-period deltas are mock trend data, not derived from
  // any real record — hide them for an org with no seed data instead of
  // showing a fabricated trend against numbers that don't exist.
  const showTrends = !isMockDataCleared();
  const greetingPeriod = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  };

  // ---- derived stats -------------------------------------------------------
  const stats = useMemo(() => {
    const total = employees.length;
    const active = employees.filter((e) => e.status === 'Active').length;
    const onLeave = employees.filter((e) => e.status === 'On Leave').length;
    const notice = employees.filter((e) => e.status === 'Notice Period').length;

    // Present today: active minus on-leave (mock ~87% present)
    const presentToday = Math.round(active * 0.87);
    const wfhToday = Math.round(active * 0.13);

    // Open positions (mock)
    const openPositions = 8;

    // Attrition rate (resigned + notice period / total * 12 for annualized)
    const attritionRate = total === 0 ? 0 : parseFloat(((notice / total) * 100 * 4).toFixed(1));

    // Average tenure in years
    const avgTenure = total === 0 ? 0 : parseFloat(
      (
        employees.reduce((acc, e) => {
          const ms = TODAY_DATE.getTime() - new Date(e.dateOfJoining).getTime();
          return acc + ms / (1000 * 60 * 60 * 24 * 365);
        }, 0) / total
      ).toFixed(1),
    );

    return { total, active, onLeave, presentToday, wfhToday, openPositions, attritionRate, avgTenure };
  }, [directoryRevision]);

  // ---- dept distribution for pie chart ------------------------------------
  const deptData = useMemo(() => {
    return getDepartmentDirectory()
      .map((dept) => ({ name: dept.name, value: dept.headcount, fill: DEPT_COLORS[dept.name] ?? '#94a3b8' }))
      .sort((a, b) => b.value - a.value);
  }, [directoryRevision, departmentRevision]);

  // ---- gender diversity ---------------------------------------------------
  const genderData = useMemo(() => {
    const m = employees.filter((e) => e.gender === 'Male').length;
    const f = employees.filter((e) => e.gender === 'Female').length;
    const o = employees.filter((e) => e.gender === 'Other').length;
    return [
      { name: 'Male', value: m, fill: '#3366ff' },
      { name: 'Female', value: f, fill: '#ec4899' },
      ...(o > 0 ? [{ name: 'Other', value: o, fill: '#10b981' }] : []),
    ];
  }, [directoryRevision]);

  // ---- upcoming holidays (after today) ------------------------------------
  const upcomingHolidays = useMemo(() =>
    holidays
      .filter((h) => new Date(h.date) > TODAY_DATE)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5),
    [holidays]);

  // ---- June celebrations --------------------------------------------------
  type CelebrationItem =
    | { type: 'Birthday'; name: string; date: string; dept: string }
    | { type: 'Anniversary'; name: string; date: string; dept: string; years: number };

  const celebrations = useMemo((): CelebrationItem[] => {
    const JUNE = 5; // month index 0-based
    const birthdays: CelebrationItem[] = employees
      .filter((e) => new Date(e.dateOfBirth).getMonth() === JUNE)
      .map((e) => ({ type: 'Birthday' as const, name: e.fullName, date: e.dateOfBirth, dept: e.department }));

    const anniversaries: CelebrationItem[] = employees
      .filter((e) => new Date(e.dateOfJoining).getMonth() === JUNE)
      .map((e) => {
        const years = TODAY_DATE.getFullYear() - new Date(e.dateOfJoining).getFullYear();
        return { type: 'Anniversary' as const, name: e.fullName, date: e.dateOfJoining, dept: e.department, years };
      });

    return [...birthdays, ...anniversaries].sort((a, b) => {
      const da = new Date(a.date).getDate();
      const db = new Date(b.date).getDate();
      return da - db;
    });
  }, [directoryRevision]);

  // ---- today date display -------------------------------------------------
  const todayLabel = TODAY_DATE.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const visiblePendingApprovals = useMemo(
    () => pendingApprovals.filter((item) => item.count > 0),
    [],
  );

  const totalVisiblePendingItems = useMemo(
    () => visiblePendingApprovals.reduce((sum, item) => sum + item.count, 0),
    [visiblePendingApprovals],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ----------------------------------------------------------------- */}
      {/* Header                                                             */}
      {/* ----------------------------------------------------------------- */}
      <PageHeader
        title={`Good ${greetingPeriod()}, ${firstName} 👋`}
        subtitle={todayLabel}
        actions={
          <>
            <NotificationsMenu />
            <QuickAddMenu />
          </>
        }
      />

      {/* ----------------------------------------------------------------- */}
      {/* Stat cards row                                                     */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex justify-end -mt-2">
        <Link to="/dashboard/kpi-graphs">
          <Button variant="secondary" size="sm">View KPI Graphs</Button>
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Total Employees"
          value={stats.total}
          icon={<Users size={20} />}
          iconClass="bg-brand-50 text-brand-600"
          {...(showTrends ? { delta: 5.3, deltaLabel: 'vs last quarter' } : {})}
        />
        <StatCard
          label="Present Today"
          value={stats.presentToday}
          icon={<CalendarCheck size={20} />}
          iconClass="bg-emerald-50 text-emerald-600"
          {...(showTrends ? { delta: 2.1, deltaLabel: 'vs yesterday' } : {})}
        />
        <StatCard
          label="On Leave"
          value={stats.onLeave + 2}
          icon={<CalendarOff size={20} />}
          iconClass="bg-violet-50 text-violet-600"
          {...(showTrends ? { delta: -1, deltaLabel: 'vs last week' } : {})}
        />
        <StatCard
          label="Open Positions"
          value={stats.openPositions}
          icon={<Briefcase size={20} />}
          iconClass="bg-amber-50 text-amber-600"
          {...(showTrends ? { delta: 14.3, deltaLabel: 'vs last month' } : {})}
        />
        <StatCard
          label="Attrition Rate"
          value={`${stats.attritionRate}%`}
          icon={<TrendingUp size={20} />}
          iconClass="bg-rose-50 text-rose-600"
          {...(showTrends ? { delta: -0.8, deltaLabel: 'vs last quarter' } : {})}
        />
        <StatCard
          label="Avg. Tenure"
          value={`${stats.avgTenure} yrs`}
          icon={<Clock size={20} />}
          iconClass="bg-cyan-50 text-cyan-600"
          {...(showTrends ? { delta: 3.2, deltaLabel: 'vs last year' } : {})}
        />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Charts row: headcount (2/3) + gender pie (1/3)                     */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Headcount growth */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Headcount Growth"
            subtitle="Last 12 months"
            action={
              headcountSeries.length > 0 ? (
                <Badge tone="blue">+{headcountSeries[headcountSeries.length - 1].count - headcountSeries[0].count} new hires</Badge>
              ) : null
            }
          />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={headcountSeries} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="hcGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3366ff" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#3366ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={['dataMin - 2', 'dataMax + 2']} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="count"
                name="Headcount"
                stroke="#3366ff"
                strokeWidth={2.5}
                fill="url(#hcGrad)"
                dot={{ r: 3, fill: '#3366ff', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#3366ff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Gender diversity */}
        <Card>
          <CardHeader title="Gender Diversity" subtitle={`${employees.length} employees`} />
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={genderData}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {genderData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${value} (${pct(Number(value), employees.length)}%)`, '']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-3 mt-1">
              {genderData.map((g) => (
                <div key={g.name} className="flex items-center gap-1.5 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.fill }} />
                  <span className="text-ink-600 font-medium">{g.name}</span>
                  <span className="text-ink-400">{g.value} ({pct(g.value, employees.length)}%)</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Charts row 2: weekly attendance (2/3) + dept donut (1/3)          */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Weekly attendance */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Weekly Attendance"
            subtitle="Mon – Fri, current week"
            action={
              <div className="flex gap-3">
                {(Object.entries(ATTENDANCE_COLORS) as [string, string][]).map(([k, c]) => (
                  <div key={k} className="flex items-center gap-1.5 text-xs text-ink-500">
                    <span className="h-2 w-2 rounded-sm" style={{ background: c }} />
                    {k}
                  </div>
                ))}
              </div>
            }
          />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyAttendance} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Present" fill={ATTENDANCE_COLORS.Present} radius={[3, 3, 0, 0]} maxBarSize={32} />
              <Bar dataKey="WFH" fill={ATTENDANCE_COLORS.WFH} radius={[3, 3, 0, 0]} maxBarSize={32} />
              <Bar dataKey="Leave" fill={ATTENDANCE_COLORS.Leave} radius={[3, 3, 0, 0]} maxBarSize={32} />
              <Bar dataKey="Absent" fill={ATTENDANCE_COLORS.Absent} radius={[3, 3, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Department distribution donut */}
        <Card>
          <CardHeader title="By Department" subtitle="Headcount distribution" />
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={deptData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={68}
                paddingAngle={2}
                dataKey="value"
              >
                {deptData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${value} (${pct(Number(value), employees.length)}%)`, name]}
                contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1.5">
            {deptData.slice(0, 5).map((d) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.fill }} />
                <span className="text-ink-600 flex-1 truncate">{d.name}</span>
                <span className="font-semibold text-ink-800">{d.value}</span>
                <span className="text-ink-400 w-7 text-right">{pct(d.value, employees.length)}%</span>
              </div>
            ))}
            {deptData.length > 5 && (
              <p className="text-xs text-ink-400 pt-0.5">+{deptData.length - 5} more departments</p>
            )}
          </div>
        </Card>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Bottom grid: 3-col layout                                         */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ---- Col 1: Pending Approvals + Activity Feed ---- */}
        <div className="space-y-5">
          {/* Pending approvals */}
          <Card>
            <CardHeader
              title="Pending Approvals"
              subtitle={`${totalVisiblePendingItems} items need attention`}
              action={(
                <Link to="/dashboard/pending-approvals" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  View all
                </Link>
              )}
            />
            {visiblePendingApprovals.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-6">No pending approvals</p>
            ) : (
              <div className="space-y-3">
                {visiblePendingApprovals.map((item) => (
                  <Link
                    key={item.type}
                    to={APPROVAL_ROUTES[item.type] ?? '/dashboard/pending-approvals'}
                    className="flex items-center gap-3 p-3 rounded-xl bg-ink-50 hover:bg-ink-100 transition-colors cursor-pointer group"
                  >
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${item.bgClass} ${item.colorClass}`}>
                      {APPROVAL_ICONS[item.type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-800">{item.type}</p>
                      <p className="text-xs text-ink-400">
                        {item.count} pending{item.urgentCount > 0 ? ` · ${item.urgentCount} urgent` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.urgentCount > 0 && (
                        <span className="h-5 w-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {item.urgentCount}
                        </span>
                      )}
                      <ChevronRight size={15} className="text-ink-300 group-hover:text-ink-500 transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-ink-100">
              <Link to="/dashboard/pending-approvals" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                Open full Pending Approvals page
              </Link>
            </div>
          </Card>

          {/* Activity feed */}
          <Card>
            <CardHeader
              title="Recent Activity"
              subtitle="Across all modules"
              action={<Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/recent-activity')}>See all</Button>}
            />
            <div className="space-y-3">
              {activityFeed.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <Avatar name={item.actor} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-ink-700">
                      <span className="font-semibold">{item.actor}</span>
                      {' '}{item.action}{' '}
                      <span className="text-brand-600 font-medium">{item.subject}</span>
                    </p>
                    <p className="text-[11px] text-ink-400 mt-0.5">{timeAgo(item.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ---- Col 2: Announcements + Holidays ---- */}
        <div className="space-y-5">
          {/* Announcements */}
          <Card>
            <CardHeader
              title="Announcements"
              subtitle="Latest from the team"
              action={(
                <Link to="/dashboard/announcements" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  View all
                </Link>
              )}
            />
            <div className="space-y-4">
              {announcements.map((ann) => (
                <div key={ann.id} className="group cursor-pointer" onClick={() => navigate('/dashboard/announcements')}>
                  <div className="flex items-start gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0 mt-0.5">
                      <Megaphone size={14} className="text-brand-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="text-sm font-medium text-ink-800 group-hover:text-brand-600 transition-colors leading-snug">
                          {ann.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge tone={annTone(ann.category)}>{ann.category}</Badge>
                        <span className="text-[11px] text-ink-400">{timeAgo(ann.date)}</span>
                        <span className="text-[11px] text-ink-400">· {ann.author}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-ink-500 mt-1.5 pl-10.5 line-clamp-2 leading-relaxed">{ann.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-ink-100">
              <Link to="/dashboard/announcements" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                Open full Announcements page
              </Link>
            </div>
          </Card>

          {/* Upcoming holidays */}
          <Card>
            <CardHeader
              title="Upcoming Holidays"
              subtitle="Rest of 2026"
              action={<Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/holiday-calendar')}>Full calendar</Button>}
            />
            <div className="space-y-2.5">
              {upcomingHolidays.map((h) => (
                <div key={h.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-ink-50 transition-colors">
                  <div className="h-10 w-10 rounded-xl bg-brand-600 text-white flex flex-col items-center justify-center shrink-0 text-center leading-none">
                    <span className="text-[10px] font-semibold uppercase opacity-80">
                      {new Date(h.date).toLocaleString('en-IN', { month: 'short' })}
                    </span>
                    <span className="text-lg font-bold leading-none">
                      {new Date(h.date).getDate()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-800">{h.name}</p>
                    <p className="text-xs text-ink-400">{formatDate(h.date)}</p>
                  </div>
                  <Badge
                    tone={
                      h.type === 'National' ? 'green'
                        : h.type === 'Regional' ? 'blue'
                          : 'amber'
                    }
                  >
                    {h.type}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ---- Col 3: Celebrations + New Joiners ---- */}
        <div className="space-y-5">
          {/* Celebrations */}
          <Card>
            <CardHeader
              title="June Celebrations"
              subtitle={`${celebrations.length} birthdays & anniversaries`}
              action={(
                <Link to="/dashboard/celebrations" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  View all months
                </Link>
              )}
            />
            {celebrations.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-6">No celebrations this month</p>
            ) : (
              <div className="space-y-3">
                {celebrations.map((c, i) => {
                  const isBirthday = c.type === 'Birthday';
                  const yearsLabel = isBirthday ? '' : `${(c as { years: number }).years}yr`;
                  return (
                    <div key={i} className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/dashboard/celebrations')}>
                      <Avatar name={c.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink-800 truncate">{c.name}</p>
                        <p className="text-xs text-ink-400">
                          {c.dept} ·{' '}
                          {isBirthday
                            ? `🎂 Birthday, ${formatDateShort(c.date)}`
                            : `🎉 ${yearsLabel} Work Anniversary`}
                        </p>
                      </div>
                      <Badge tone={isBirthday ? 'pink' : 'violet'}>
                        {isBirthday ? <Cake size={11} /> : <Star size={11} />}
                        {isBirthday ? 'Birthday' : yearsLabel}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-ink-100">
              <Link to="/dashboard/celebrations" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                Open full Celebrations page
              </Link>
            </div>
          </Card>

          {/* New joiners / recent hires */}
          <Card>
            <CardHeader
              title="New Joiners"
              subtitle="Joined in last 60 days"
              action={<Button variant="ghost" size="sm" icon={<UserPlus size={13} />} onClick={() => navigate('/onboarding')}>Onboard</Button>}
            />
            {(() => {
              const cutoff = new Date(TODAY_DATE);
              cutoff.setDate(cutoff.getDate() - 60);
              const recent = employees
                .filter((e) => new Date(e.dateOfJoining) >= cutoff)
                .sort((a, b) => new Date(b.dateOfJoining).getTime() - new Date(a.dateOfJoining).getTime());
              if (recent.length === 0) {
                return <p className="text-sm text-ink-400 text-center py-6">No new joiners recently</p>;
              }
              return (
                <div className="space-y-3">
                  {recent.map((e) => (
                    <div key={e.id} className="flex items-center gap-3">
                      <Avatar name={e.fullName} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink-800 truncate">{e.fullName}</p>
                        <p className="text-xs text-ink-400 truncate">{e.designation} · {e.department}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] text-ink-400">{formatDateShort(e.dateOfJoining)}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin size={10} className="text-ink-300" />
                          <span className="text-[11px] text-ink-400">{e.location}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </Card>

          {/* HR Metrics summary card */}
          <Card>
            <CardHeader
              title="HR Health Score"
              subtitle="June 2026"
              action={<Badge tone="green" dot>On Track</Badge>}
            />
            <div className="space-y-4">
              {[
                { label: 'Offer Acceptance Rate', value: 87, tone: 'green' as const },
                { label: 'Engagement Score', value: 74, tone: 'brand' as const },
                { label: 'Training Completion', value: 62, tone: 'amber' as const },
                { label: 'Policy Compliance', value: 95, tone: 'green' as const },
              ].map((m) => (
                <div key={m.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-ink-600 font-medium">{m.label}</span>
                    <span className="font-semibold text-ink-800">{m.value}%</span>
                  </div>
                  <ProgressBar value={m.value} tone={m.tone} size="sm" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Footer spacer                                                      */}
      {/* ----------------------------------------------------------------- */}
      <div className="h-4" />
    </div>
  );
}
