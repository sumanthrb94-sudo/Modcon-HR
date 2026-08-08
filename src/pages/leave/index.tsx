import { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  CheckCircle2,
  Users,
  CalendarDays,
  Plus,
} from 'lucide-react';
import {
  PageHeader,
  StatCard,
  Card,
  Badge,
  statusTone,
  Button,
  Avatar,
  Table,
  type Column,
  SearchInput,
  Select,
  Modal,
  Tabs,
  ProgressBar,
  EmptyState,
} from '@/components/ui';
import {
  getLeaveRequests,
  saveLeaveRequests,
  updateLeaveRequestStatus,
  LEAVE_REQUESTS_CHANGED_EVENT,
} from '@/data/leave';
import { getLeavePolicies, hasEmployeeLeavePolicy, normalizeLeaveTypeValue } from '@/data/leavePolicies';
import { getHolidayDirectory } from '@/data/holidays';
import { employees, getEmployee, getEmployeeDirectory, getEmployeeName } from '@/data/employees';
import { useAuth } from '@/lib/auth';
import { getApplicableEntitlements, getEntitlements, type Entitlement } from '@/data/leaveEntitlements';
import { checkLeaveApplication, policySummary } from '@/data/leaveApplication';
import { financialYearLabel } from '@/lib/financialYear';
import { getApprovableEmployeeIds, getVisibleEmployeeIds } from '@/lib/dataScope';
import { resolveAppRole } from '@/lib/accessControl';
import { getCurrentEmployee } from '@/lib/currentEmployee';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { useLeavePoliciesRevision } from '@/lib/useLeavePoliciesRevision';
import { useHolidayDirectoryRevision } from '@/lib/useHolidayDirectoryRevision';
import type { LeaveRequest, LeaveType, LeaveStatus } from '@/types';
import { dayOfMonth, formatDate, formatDateShort, formatMonthShort, formatWeekdayLong, pct } from '@/lib/utils';
import { currentMonthIso, todayIso } from '@/lib/today';



const leaveTypeTone = (type: LeaveType) => {
  if (type === 'Sick') return 'red' as const;
  if (type === 'Earned') return 'green' as const;
  if (type === 'Casual') return 'blue' as const;
  if (type === 'Unpaid') return 'gray' as const;
  if (type === 'Maternity' || type === 'Paternity') return 'violet' as const;
  if (type === 'Comp Off') return 'cyan' as const;
  return 'gray' as const;
};

const holidayTypeTone = (type: string) => {
  if (type === 'National') return 'green' as const;
  if (type === 'Regional') return 'blue' as const;
  return 'amber' as const;
};

export function LeavePage() {
  const { profile } = useAuth();
  const role = resolveAppRole(profile);
  const isEmployee = role === 'Employee';
  const currentEmployee = getCurrentEmployee(profile);
  const directoryRevision = useEmployeeDirectoryRevision();
  const leavePoliciesRevision = useLeavePoliciesRevision();
  const holidayRevision = useHolidayDirectoryRevision();
  const [activeTab, setActiveTab] = useState('requests');
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(() => getLeaveRequests());
  const holidays = useMemo(() => getHolidayDirectory(), [holidayRevision]);
  // The organisation's own list — empty for one that has not set a policy, which
  // the balances tab reports rather than rendering nameplates with no days.
  const leavePolicies = useMemo(() => getLeavePolicies(), [leavePoliciesRevision]);

  // Why the last decision was refused, if it was. Cleared by the next one.
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);

  // Request filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Balances filter — its own, see the Balances tab.
  const [balanceSearch, setBalanceSearch] = useState('');

  // Apply Leave Modal
  const [applyOpen, setApplyOpen] = useState(false);
  const [formEmpId, setFormEmpId] = useState('');
  const [formType, setFormType] = useState<LeaveType>(() => getLeavePolicies().length > 0
    ? normalizeLeaveTypeValue(getLeavePolicies()[0].type)
    : 'Casual');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formHalfDay, setFormHalfDay] = useState(false);
  const [formReason, setFormReason] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (isEmployee && currentEmployee) {
      setFormEmpId(currentEmployee.id);
    }
  }, [isEmployee, currentEmployee]);

  // ---- The policy, live, for whoever this request is being made for --------
  // Type list, balance, chargeable days and every blocking rule are derived
  // from the applicant rather than from the policy list alone: a man is not
  // offered Maternity Leave, and a four-month joiner is told Earned Leave is
  // withheld rather than finding out at approval time. See
  // data/leaveApplication.ts.
  const formEmployee = useMemo(
    () => (isEmployee ? currentEmployee : getEmployee(formEmpId)),
    [isEmployee, currentEmployee, formEmpId, directoryRevision],
  );

  const applicableEntitlements = useMemo(
    () => (formEmployee ? getApplicableEntitlements(formEmployee, leaveRequests) : []),
    [formEmployee, leaveRequests, leavePoliciesRevision],
  );

  const leaveTypeOptions = useMemo(() => {
    // Before an employee is picked there is nobody to be applicable to, so the
    // organisation's full list stands in — narrowed the moment one is chosen.
    const types = formEmployee
      ? applicableEntitlements.map((e) => e.type)
      : getLeavePolicies().map((policy) => normalizeLeaveTypeValue(policy.type));
    return Array.from(new Set(types));
  }, [formEmployee, applicableEntitlements, leavePoliciesRevision]);

  const policyCheck = useMemo(
    () =>
      checkLeaveApplication({
        employee: formEmployee,
        type: formType,
        startDate: formStart,
        endDate: formEnd,
        requests: leaveRequests,
        halfDay: formHalfDay,
      }),
    [formEmployee, formType, formStart, formEnd, formHalfDay, leaveRequests, leavePoliciesRevision, holidayRevision],
  );

  // Half a day is only offered where the policy allows it on a single-day
  // request; changing type or dates away from that must not leave it set.
  useEffect(() => {
    if (!policyCheck.halfDayAllowed && formHalfDay) setFormHalfDay(false);
  }, [policyCheck.halfDayAllowed, formHalfDay]);

  // Every stat and table on this page reads from here. Previously anyone who
  // wasn't a plain Employee saw the whole company's leave; now HR and Admin do,
  // a Manager sees their own reporting line plus HR, and an Employee sees only
  // themselves. See lib/dataScope.ts.
  const visibleEmployeeIds = useMemo(() => getVisibleEmployeeIds(profile), [profile]);
  const scopedRequests = useMemo(
    () => leaveRequests.filter((request) => visibleEmployeeIds.has(request.employeeId)),
    [leaveRequests, visibleEmployeeIds],
  );

  // Seeing a request and deciding it are different permissions. A manager's
  // view includes themselves and the HR Manager — neither is below them — so
  // the Approve/Reject buttons follow this narrower set, and the row shows why
  // it has none rather than an unexplained gap. See lib/dataScope.ts.
  const approvableEmployeeIds = useMemo(
    () => getApprovableEmployeeIds(profile),
    [profile, directoryRevision],
  );

  // Stats
  const pending = useMemo(() => scopedRequests.filter((r) => r.status === 'Pending').length, [scopedRequests]);
  const approvedThisMonth = useMemo(
    () => scopedRequests.filter((r) => r.status === 'Approved' && r.appliedOn.startsWith(currentMonthIso())).length,
    [scopedRequests],
  );
  const onLeaveToday = useMemo(
    () =>
      scopedRequests.filter(
        (r) => r.status === 'Approved' && r.startDate <= todayIso() && r.endDate >= todayIso(),
      ).length,
    [scopedRequests],
  );
  const upcomingHolidays = useMemo(
    () => holidays.filter((h) => h.date >= todayIso()).length,
    [holidays],
  );

  useEffect(() => {
    function handleLeaveRequestsChanged() {
      setLeaveRequests(getLeaveRequests());
    }

    window.addEventListener(LEAVE_REQUESTS_CHANGED_EVENT, handleLeaveRequestsChanged);
    return () => window.removeEventListener(LEAVE_REQUESTS_CHANGED_EVENT, handleLeaveRequestsChanged);
  }, []);

  useEffect(() => {
    if (!leaveTypeOptions.includes(formType)) {
      setFormType(leaveTypeOptions[0] ?? 'Casual');
    }
  }, [leaveTypeOptions, formType]);

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return scopedRequests.filter((r) => {
      const empName = getEmployeeName(r.employeeId).toLowerCase();
      const matchSearch = !search || empName.includes(search.toLowerCase());
      const matchStatus = !statusFilter || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [scopedRequests, search, statusFilter, directoryRevision]);

  // Approve / Reject handlers
  function decide(id: string, nextStatus: 'Approved' | 'Rejected') {
    // Record whoever is actually signed in. This used to stamp a fixed
    // 'emp-004 / Ananya Reddy' on every approval, so the audit trail named
    // one person regardless of who clicked Approve.
    const result = updateLeaveRequestStatus(id, nextStatus, {
      profile,
      approverId: currentEmployee?.id ?? null,
      approverName: currentEmployee?.fullName ?? profile?.displayName ?? profile?.email ?? 'Unknown approver',
    });
    // A refusal is reported, not swallowed: the buttons are hidden where the
    // viewer has no authority, so reaching this means the two disagree and
    // silence would look exactly like a decision that landed.
    setDecisionNotice(result.ok ? null : result.reason);
    setLeaveRequests(result.requests);
  }
  const approveLeave = (id: string) => decide(id, 'Approved');
  const rejectLeave = (id: string) => decide(id, 'Rejected');

  // Submit apply leave
  function handleApplySubmit() {
    if (!formEmpId || !formStart || !formEnd || !formReason.trim()) {
      setFormError('Please fill all required fields.');
      return;
    }
    // The same check the dialog renders decides whether this may be submitted,
    // so what the applicant was shown and what is enforced cannot drift apart.
    if (policyCheck.errors.length > 0) {
      setFormError(policyCheck.errors[0]);
      return;
    }

    const newRequest: LeaveRequest = {
      id: `lr-${String(leaveRequests.length + 1).padStart(3, '0')}`,
      employeeId: formEmpId,
      type: formType,
      startDate: formStart,
      endDate: formEnd,
      // What the leave actually costs the balance: working days only, with
      // holidays and this employee's week-offs left out, half-day applied.
      days: policyCheck.chargeableDays,
      reason: formReason.trim(),
      status: 'Pending',
      appliedOn: todayIso(),
      approverId: null,
    };
    const updatedRequests = [newRequest, ...leaveRequests];
    saveLeaveRequests(updatedRequests);
    setLeaveRequests(updatedRequests);
    setApplyOpen(false);
    setFormEmpId('');
    setFormType(leaveTypeOptions[0] ?? 'Casual');
    setFormStart('');
    setFormEnd('');
    setFormHalfDay(false);
    setFormReason('');
    setFormError('');
    setActiveTab('requests');
  }

  // ---- Requests Table Columns ----
  const requestColumns: Column<LeaveRequest>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row) => {
        const emp = getEmployee(row.employeeId);
        return emp ? (
          <div className="flex items-center gap-3">
            <Avatar name={emp.fullName} size="sm" />
            <div>
              <p className="font-medium text-ink-900">{emp.fullName}</p>
              <p className="text-xs text-ink-400">{emp.designation}</p>
            </div>
          </div>
        ) : null;
      },
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <Badge tone={leaveTypeTone(row.type)}>{row.type}</Badge>,
    },
    {
      key: 'dates',
      header: 'Dates',
      render: (row) => (
        <div>
          <p className="text-ink-700 text-sm">
            {formatDateShort(row.startDate)}
            {row.startDate !== row.endDate ? ` – ${formatDateShort(row.endDate)}` : ''}
          </p>
          <p className="text-xs text-ink-400">{row.days} day{row.days !== 1 ? 's' : ''}</p>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      className: 'max-w-xs',
      render: (row) => (
        <span className="text-ink-600 text-sm line-clamp-2">{row.reason}</span>
      ),
    },
    {
      key: 'appliedOn',
      header: 'Applied',
      render: (row) => <span className="text-ink-500 text-sm">{formatDateShort(row.appliedOn)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={statusTone(row.status)} dot>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) =>
        row.status === 'Pending' && approvableEmployeeIds.has(row.employeeId) ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={(e) => {
                e.stopPropagation();
                approveLeave(row.id);
              }}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                rejectLeave(row.id);
              }}
            >
              Reject
            </Button>
          </div>
        ) : row.status === 'Pending' && !isEmployee ? (
          // Visible but not theirs to decide — their own request, or the HR
          // Manager's. Saying so beats an empty cell that reads as a bug.
          <span className="text-xs text-ink-400">Not yours to decide</span>
        ) : row.approverName ? (
          <span className="text-xs text-ink-400">{row.approverName}</span>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
  ];

  // ---- Balances Tab ----
  // Entitlements are derived from the policy and the date rather than read
  // from the stored balance seeds, so monthly accrual, carry-forward within the
  // financial year, the April reset and the one-year Earned Leave gate all fall
  // out of one calculation. See data/leaveEntitlements.ts.
  type BalanceViewItem = { emp: NonNullable<ReturnType<typeof getEmployee>>; balances: Entitlement[] };
  const balancesView = useMemo((): BalanceViewItem[] => {
    if (isEmployee) {
      if (!currentEmployee) return [];
      return [{ emp: currentEmployee, balances: getEntitlements(currentEmployee, scopedRequests) }];
    }

    // Every employee this viewer oversees, not the fourteen that happened to
    // carry a seeded balance row: entitlement is derived from the policy and
    // the joining date, so it exists for everyone in the directory and the
    // people missing from `balanceEmployeeIds` were missing for no reason
    // anyone could act on.
    return getEmployeeDirectory()
      .filter((emp) => visibleEmployeeIds.has(emp.id))
      .map((emp) => ({ emp, balances: getEntitlements(emp, scopedRequests) }));
  }, [scopedRequests, isEmployee, currentEmployee, visibleEmployeeIds, directoryRevision]);

  const filteredBalances = useMemo(() => {
    const q = balanceSearch.trim().toLowerCase();
    if (!q) return balancesView;
    return balancesView.filter(({ emp }) =>
      [emp.fullName, emp.employeeCode, emp.department].some((field) =>
        field.toLowerCase().includes(q),
      ),
    );
  }, [balancesView, balanceSearch]);

  // ---- Who's Off Tab ----
  const whosOff = useMemo(() => {
    return scopedRequests
      .filter((r) => r.status === 'Approved' && r.endDate >= todayIso())
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [scopedRequests]);

  // ---- Holidays sorted by upcoming first ----
  const sortedHolidays = useMemo(
    () => [...holidays].sort((a, b) => a.date.localeCompare(b.date)),
    [holidays],
  );

  const statusOptions = [
    { label: 'All Statuses', value: '' },
    { label: 'Pending', value: 'Pending' },
    { label: 'Approved', value: 'Approved' },
    { label: 'Rejected', value: 'Rejected' },
    { label: 'Cancelled', value: 'Cancelled' },
  ];

  const tabs = [
    { id: 'requests', label: 'Requests', count: pending },
    { id: 'balances', label: isEmployee ? 'My Leave Balance' : 'Leave Balances' },
    { id: 'whos-off', label: isEmployee ? 'My Time Off' : "Who's Off" },
    { id: 'holidays', label: 'Holidays' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Management"
        subtitle="Manage leave requests, balances, and upcoming holidays"
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setApplyOpen(true)}>Apply Leave</Button>}
      />

      {decisionNotice && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          {decisionNotice}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pending Requests"
          value={pending}
          icon={<Clock size={20} />}
          iconClass="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Approved This Month"
          value={approvedThisMonth}
          icon={<CheckCircle2 size={20} />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="On Leave Today"
          value={onLeaveToday}
          icon={<Users size={20} />}
          iconClass="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Upcoming Holidays"
          value={upcomingHolidays}
          icon={<CalendarDays size={20} />}
          iconClass="bg-blue-50 text-blue-600"
        />
      </div>

      {/* Tabs */}
      <Card padding={false}>
        <div className="px-5 pt-5">
          <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        </div>

        {/* REQUESTS TAB */}
        {activeTab === 'requests' && (
          <>
            <div className="p-5 border-b border-ink-100 flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-sm text-ink-500 flex-1">
                Showing <span className="font-medium text-ink-800">{filteredRequests.length}</span> requests
              </p>
              <div className="flex items-center gap-2">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search employee…"
                  className="w-48"
                />
                <Select
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={statusOptions}
                  className="w-40"
                />
              </div>
            </div>
            <Table
              columns={requestColumns}
              data={filteredRequests}
              keyExtractor={(r) => r.id}
              emptyMessage="No leave requests match your filters."
            />
          </>
        )}

        {/* BALANCES TAB */}
        {activeTab === 'balances' && (
          <div className="p-5">
            {/* Balances are per financial year (April-March): monthly days
                accumulate within it and reset when it turns over, so the year
                being shown is not incidental. */}
            {/* How the year works, not what this organisation grants. "Casual
                and Sick accrue 1 day per month" was ModCon Builders' own policy
                printed on every tenant's screen as though it were theirs. */}
            <p className="mb-4 text-xs text-ink-400">
              {financialYearLabel()} · Every employee's entitlement for the whole financial year,
              beside what has accrued so far. A type that accrues monthly carries forward within
              the year; unused days do not survive 1 April.
            </p>
            {/* The tab covers the whole directory now, so it needs a way
                through it. Its own search state: sharing the Requests one
                would filter two lists from a box visible on one of them. */}
            {balancesView.length > 1 && (
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <p className="text-sm text-ink-500 flex-1">
                  Showing <span className="font-medium text-ink-800">{filteredBalances.length}</span>{' '}
                  of {balancesView.length} employees
                </p>
                <SearchInput
                  value={balanceSearch}
                  onChange={setBalanceSearch}
                  placeholder="Search name, code or department…"
                  className="w-64"
                />
              </div>
            )}
            {/* No policy is a different emptiness from no match, and only one of
                them is about the search box. Without this, every employee gets a
                card with a name on it and no balances underneath. */}
            {leavePolicies.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={26} />}
                title="No leave policy set"
                description="Your organisation has not set one yet, so nobody accrues leave. An administrator can add the leave types in Settings → Leave Policies."
              />
            ) : filteredBalances.length === 0 ? (
              <EmptyState
                icon={<Users size={26} />}
                title="No employees match"
                description="No one in view matches that search."
              />
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredBalances.map(({ emp, balances }) => (
                <div
                  key={emp.id}
                  className="border border-ink-100 rounded-xl p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar name={emp.fullName} size="sm" />
                    <div>
                      <p className="font-semibold text-ink-900 text-sm">{emp.fullName}</p>
                      <p className="text-xs text-ink-400">{emp.designation}</p>
                    </div>
                    {/* Said out loud, because these figures are meant to differ
                        from the policy in Settings and an unexplained
                        difference reads as a defect in the accrual. */}
                    {hasEmployeeLeavePolicy(emp.id) && (
                      <span className="ml-auto" data-testid="custom-entitlement">
                        <Badge tone="violet" className="text-[10px]">Custom entitlement</Badge>
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    {balances.map((b) => (
                      <div
                        key={b.type}
                        data-testid="leave-balance-row"
                        data-leave-type={b.type}
                        // See the same pair on the Dashboard card: the two
                        // surfaces are compared on these attributes.
                        data-leave-reading={b.withheldReason ?? `${b.available}/${b.granted}`}
                        data-leave-pending={b.pending}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Badge tone={leaveTypeTone(b.type)} className="text-[10px]">
                              {b.type}
                            </Badge>
                            {/* The rate, never an annual quota, for accrued
                                types — what the employee has *now* is what has
                                accrued so far, not a yearly allowance. */}
                            {b.monthly && (
                              <span className="text-[10px] text-ink-400">
                                {b.policy.monthlyAccrual}/month
                              </span>
                            )}
                          </div>
                          {b.withheldReason ? (
                            <span className="text-[10px] text-ink-400">{b.withheldReason}</span>
                          ) : (
                            <span className="text-xs text-ink-500">
                              <span className="font-semibold text-ink-800">{b.available}</span>/{b.granted} available
                              {b.pending > 0 && (
                                <span className="text-ink-400"> · {b.remaining} left to apply</span>
                              )}
                            </span>
                          )}
                        </div>
                        {/* The year as a whole, beside the part of it that has
                            happened: a monthly type reads 5 accrued now out of
                            the 12 the year will bring, and the bar measures
                            what is used against the full year rather than
                            against a figure that grows every month.

                            Pending days are named here because they are the
                            difference between what this card says and what the
                            Apply Leave dialog will let the employee take. */}
                        <div className="flex items-center justify-between mb-1 text-[10px] text-ink-400">
                          <span>
                            {b.fullYear} day{b.fullYear === 1 ? '' : 's'} for {financialYearLabel()}
                          </span>
                          <span>
                            {b.used} used
                            {b.pending > 0 && (
                              <span className="text-amber-600"> · {b.pending} pending</span>
                            )}
                          </span>
                        </div>
                        <ProgressBar
                          value={pct(b.used, b.fullYear)}
                          tone={pct(b.used, b.fullYear) > 75 ? 'amber' : 'brand'}
                          size="sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {/* WHO'S OFF TAB */}
        {activeTab === 'whos-off' && (
          <div className="p-5">
            {whosOff.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={26} />}
                title="No upcoming leaves"
                description="No approved leave requests from today onwards."
              />
            ) : (
              <div className="space-y-3">
                {whosOff.map((r) => {
                  const emp = getEmployee(r.employeeId);
                  if (!emp) return null;
                  const isOnLeaveNow = r.startDate <= todayIso() && r.endDate >= todayIso();
                  return (
                    <div
                      key={r.id}
                      className="flex items-center gap-4 p-4 rounded-xl border border-ink-100 hover:bg-ink-50 transition-colors"
                    >
                      <Avatar name={emp.fullName} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-ink-900">{emp.fullName}</p>
                          {isOnLeaveNow && (
                            <Badge tone="violet" dot>
                              Currently Away
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-ink-500 mt-0.5">{emp.designation} · {emp.department}</p>
                        <p className="text-xs text-ink-400 mt-1 line-clamp-1">{r.reason}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge tone={leaveTypeTone(r.type)} className="mb-1">
                          {r.type}
                        </Badge>
                        <p className="text-xs text-ink-600 font-medium">
                          {formatDateShort(r.startDate)}
                          {r.startDate !== r.endDate ? ` – ${formatDateShort(r.endDate)}` : ''}
                        </p>
                        <p className="text-xs text-ink-400">{r.days} day{r.days !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* HOLIDAYS TAB */}
        {activeTab === 'holidays' && (
          <div className="p-5">
            <div className="space-y-2">
              {sortedHolidays.map((h) => {
                const isPast = h.date < todayIso();
                return (
                  <div
                    key={h.id}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${isPast
                        ? 'border-ink-100 bg-ink-50 opacity-60'
                        : 'border-ink-100 hover:bg-ink-50'
                      }`}
                  >
                    <div className="flex h-11 w-11 flex-col items-center justify-center rounded-xl bg-brand-50 shrink-0">
                      <span className="text-xs font-bold text-brand-700 leading-none">
                        {formatMonthShort(h.date)}
                      </span>
                      <span className="text-lg font-bold text-brand-900 leading-none">
                        {dayOfMonth(h.date)}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-ink-900">{h.name}</p>
                        {isPast && (
                          <span className="text-xs text-ink-400">(Passed)</span>
                        )}
                      </div>
                      <p className="text-sm text-ink-500 mt-0.5">
                        {formatDate(h.date)} ·{' '}
                        {formatWeekdayLong(h.date)}
                      </p>
                    </div>
                    <Badge tone={holidayTypeTone(h.type)}>{h.type}</Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Apply Leave Modal */}
      <Modal
        open={applyOpen}
        onClose={() => {
          setApplyOpen(false);
          setFormError('');
        }}
        title="Apply Leave"
        subtitle="Submit a new leave request"
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setApplyOpen(false);
                setFormError('');
              }}
            >
              Cancel
            </Button>
            {/* Blocked by the policy, not by taste: the reasons are listed in
                the dialog above this button. */}
            <Button variant="primary" onClick={handleApplySubmit} disabled={policyCheck.errors.length > 0}>
              Submit Request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && !policyCheck.errors.includes(formError) && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-2.5">
              {formError}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">
              Employee <span className="text-rose-500">*</span>
            </label>
            {isEmployee && currentEmployee ? (
              <input className="input w-full" value={`${currentEmployee.fullName} (${currentEmployee.employeeCode})`} readOnly />
            ) : (
              <select
                className="input w-full"
                value={formEmpId}
                onChange={(e) => setFormEmpId(e.target.value)}
              >
                <option value="">Select employee…</option>
                {/* Applying on behalf of someone is limited to the people this
                    viewer oversees. */}
                {employees.filter((e) => visibleEmployeeIds.has(e.id)).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName} ({e.employeeCode})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">
              Leave Type <span className="text-rose-500">*</span>
            </label>
            <select
              className="input w-full"
              value={formType}
              onChange={(e) => setFormType(e.target.value as LeaveType)}
            >
              {leaveTypeOptions.map((t) => {
                const ent = applicableEntitlements.find((e) => e.type === t);
                // What may actually be applied for, not what has accrued: a
                // type reading "5 of 5 available" that the submit button then
                // refuses because 4 are pending is the disagreement this whole
                // change is about.
                const suffix = !ent
                  ? ''
                  : ent.withheldReason
                    ? ` — ${ent.withheldReason.toLowerCase()}`
                    : ent.granted > 0
                      ? ent.pending > 0
                        ? ` — ${ent.remaining} of ${ent.granted} left (${ent.pending} pending)`
                        : ` — ${ent.available} of ${ent.granted} available`
                      : ' — no accrued balance';
                return (
                  <option key={t} value={t}>
                    {t}{suffix}
                  </option>
                );
              })}
            </select>
            {/* The policy behind the selected type, as the organisation has it
                configured — not a description written into this page. */}
            {policyCheck.entitlement && (
              <div className="mt-2 rounded-lg border border-ink-100 bg-ink-50 px-3 py-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-xs text-ink-500">{policySummary(policyCheck.entitlement)}</span>
                  {policyCheck.entitlement.withheldReason ? (
                    <Badge tone="amber">{policyCheck.entitlement.withheldReason}</Badge>
                  ) : policyCheck.entitlement.granted > 0 ? (
                    <span className="text-xs text-ink-600">
                      <span className="font-semibold text-ink-900">
                        {policyCheck.entitlement.available}
                      </span>{' '}
                      of {policyCheck.entitlement.granted} available · {policyCheck.entitlement.used} used
                      {policyCheck.entitlement.pending > 0 &&
                        ` · ${policyCheck.entitlement.pending} pending`}
                      {' '}({financialYearLabel()})
                    </span>
                  ) : (
                    <span className="text-xs text-ink-500">No accrued balance</span>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">
                Start Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                className="input w-full"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
                min={todayIso()}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">
                End Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                className="input w-full"
                value={formEnd}
                onChange={(e) => setFormEnd(e.target.value)}
                min={formStart || todayIso()}
              />
            </div>
          </div>
          {/* Half a day exists only where the policy grants it, and only on a
              one-day request — the flag was configurable in Settings and had
              nowhere to take effect until now. */}
          {policyCheck.halfDayAllowed && (
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
                checked={formHalfDay}
                onChange={(e) => setFormHalfDay(e.target.checked)}
              />
              Half day (0.5 day charged)
            </label>
          )}

          {formStart && formEnd && formEnd >= formStart && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-sm px-4 py-2 space-y-1">
              <div>
                Charged:{' '}
                <strong>{policyCheck.chargeableDays} day(s)</strong>
                {policyCheck.chargeableDays !== policyCheck.calendarDays && (
                  <span className="text-blue-600"> of {policyCheck.calendarDays} calendar day(s)</span>
                )}
                {policyCheck.balanceAfter !== null && policyCheck.errors.length === 0 && (
                  <span className="text-blue-600">
                    {' '}· {policyCheck.balanceAfter} day(s) would remain
                  </span>
                )}
              </div>
              {policyCheck.excludedHolidays.map((h) => (
                <div key={h.date} className="text-xs text-blue-600">
                  {formatDateShort(h.date)} — {h.name} (holiday, not charged)
                </div>
              ))}
              {policyCheck.excludedWeekOffs.map((d) => (
                <div key={d} className="text-xs text-blue-600">
                  {formatDateShort(d)} — {formatWeekdayLong(d)} week-off (not charged)
                </div>
              ))}
            </div>
          )}

          {/* Everything the policy refuses, live, while the form is edited. */}
          {policyCheck.errors.length > 0 && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-2.5 space-y-1">
              {policyCheck.errors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </div>
          )}
          {policyCheck.notes.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 text-amber-800 text-xs px-4 py-2.5 space-y-1">
              {policyCheck.notes.map((n) => (
                <div key={n}>{n}</div>
              ))}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">
              Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              className="input w-full h-24 resize-none"
              placeholder="Briefly describe the reason for leave…"
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
