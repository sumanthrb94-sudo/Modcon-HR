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
  getEmployeeBalances,
  balanceEmployeeIds,
  saveLeaveRequests,
  updateLeaveRequestStatus,
  LEAVE_REQUESTS_CHANGED_EVENT,
} from '@/data/leave';
import { getLeavePolicies, normalizeLeaveTypeValue } from '@/data/leavePolicies';
import { getHolidayDirectory } from '@/data/holidays';
import { employees, getEmployee, getEmployeeName } from '@/data/employees';
import { useAuth } from '@/lib/auth';
import { getEntitlements, type Entitlement } from '@/data/leaveEntitlements';
import { financialYearLabel } from '@/lib/financialYear';
import { getVisibleEmployeeIds } from '@/lib/dataScope';
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
  const leaveTypeOptions = useMemo(() => {
    const types = getLeavePolicies().map((policy) => normalizeLeaveTypeValue(policy.type));
    return Array.from(new Set(types));
  }, [leavePoliciesRevision]);

  // Request filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Apply Leave Modal
  const [applyOpen, setApplyOpen] = useState(false);
  const [formEmpId, setFormEmpId] = useState('');
  const [formType, setFormType] = useState<LeaveType>(() => getLeavePolicies().length > 0
    ? normalizeLeaveTypeValue(getLeavePolicies()[0].type)
    : 'Casual');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (isEmployee && currentEmployee) {
      setFormEmpId(currentEmployee.id);
    }
  }, [isEmployee, currentEmployee]);

  // Every stat and table on this page reads from here. Previously anyone who
  // wasn't a plain Employee saw the whole company's leave; now HR and Admin do,
  // a Manager sees their own reporting line plus HR, and an Employee sees only
  // themselves. See lib/dataScope.ts.
  const visibleEmployeeIds = useMemo(() => getVisibleEmployeeIds(profile), [profile]);
  const scopedRequests = useMemo(
    () => leaveRequests.filter((request) => visibleEmployeeIds.has(request.employeeId)),
    [leaveRequests, visibleEmployeeIds],
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
  function approveLeave(id: string) {
    if (isEmployee) return;
    // Record whoever is actually signed in. This used to stamp a fixed
    // 'emp-004 / Ananya Reddy' on every approval, so the audit trail named
    // one person regardless of who clicked Approve.
    const updated = updateLeaveRequestStatus(id, 'Approved', {
      approverId: currentEmployee?.id ?? null,
      approverName: currentEmployee?.fullName ?? profile?.displayName ?? profile?.email ?? 'Unknown approver',
    });
    setLeaveRequests(updated);
  }
  function rejectLeave(id: string) {
    if (isEmployee) return;
    const updated = updateLeaveRequestStatus(id, 'Rejected');
    setLeaveRequests(updated);
  }

  // Submit apply leave
  function handleApplySubmit() {
    if (!formEmpId || !formStart || !formEnd || !formReason.trim()) {
      setFormError('Please fill all required fields.');
      return;
    }
    if (formEnd < formStart) {
      setFormError('End date must be on or after start date.');
      return;
    }
    const start = new Date(formStart);
    const end = new Date(formEnd);
    const diffMs = end.getTime() - start.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

    const newRequest: LeaveRequest = {
      id: `lr-${String(leaveRequests.length + 1).padStart(3, '0')}`,
      employeeId: formEmpId,
      type: formType,
      startDate: formStart,
      endDate: formEnd,
      days,
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
        !isEmployee && row.status === 'Pending' ? (
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

    return balanceEmployeeIds
      .filter((empId) => visibleEmployeeIds.has(empId))
      .map((empId) => {
        const emp = getEmployee(empId);
        return emp ? { emp, balances: getEntitlements(emp, scopedRequests) } : undefined;
      })
      .filter((b): b is BalanceViewItem => b !== undefined);
  }, [scopedRequests, isEmployee, currentEmployee, visibleEmployeeIds]);

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
            <p className="mb-4 text-xs text-ink-400">
              {financialYearLabel()} · Casual and Sick accrue 1 day per month and carry forward
              within the year; unused days do not survive 1 April.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {balancesView.map(({ emp, balances }) => (
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
                  </div>
                  <div className="space-y-3">
                    {balances.map((b) => (
                      <div key={b.type}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Badge tone={leaveTypeTone(b.type)} className="text-[10px]">
                              {b.type}
                            </Badge>
                            {/* The rate, never an annual quota, for accrued
                                types — what the employee has is what has
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
                            </span>
                          )}
                        </div>
                        <ProgressBar
                          value={pct(b.used, b.granted)}
                          tone={pct(b.used, b.granted) > 75 ? 'amber' : 'brand'}
                          size="sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
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
            <Button variant="primary" onClick={handleApplySubmit}>
              Submit Request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
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
              {leaveTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
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
          {formStart && formEnd && formEnd >= formStart && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-sm px-4 py-2">
              Duration:{' '}
              <strong>
                {Math.ceil(
                  (new Date(formEnd).getTime() - new Date(formStart).getTime()) /
                  (1000 * 60 * 60 * 24),
                ) + 1}{' '}
                day(s)
              </strong>
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
