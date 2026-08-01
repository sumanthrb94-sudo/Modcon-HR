import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Users,
  Monitor,
  Calendar,
  UserX,
  Clock,
  CheckCircle,
} from 'lucide-react';
import {
  PageHeader,
  StatCard,
  Card,
  CardHeader,
  Badge,
  statusTone,
  Button,
  Avatar,
  Table,
  type Column,
  SearchInput,
  Select,
  Modal,
} from '@/components/ui';
import {
  getAttendanceRecords,
  saveAttendanceRecords,
  getRegularizationRequests,
  decideRegularization,
  ATTENDANCE_CHANGED_EVENT,
  REGULARIZATIONS_CHANGED_EVENT,
  getCurrentWeekDates,
  getAttendanceRecordFor,
  isLateCheckIn,
  type RegularizationRequest,
} from '@/data/attendance';
import { getEmployeeDirectory, getEmployee, isWeekOffFor } from '@/data/employees';
import { departments } from '@/data/departments';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { useDepartmentDirectoryRevision } from '@/lib/useDepartmentDirectoryRevision';
import { useAuth } from '@/lib/auth';
import { getVisibleEmployeeIds } from '@/lib/dataScope';
import { useCollectionRevision } from '@/lib/useCollectionRevision';
import type { AttendanceRecord, AttendanceStatus, Employee } from '@/types';
import { formatDate, formatDateShort, formatWeekdayShort } from '@/lib/utils';
import { todayIso } from '@/lib/today';

type AttendanceRow = AttendanceRecord & { employee: Employee };



// day-of-week label for selects
function dayLabel(iso: string): string {
  return `${formatWeekdayShort(iso)}, ${formatDateShort(iso)}`;
}

export function AttendancePage() {
  const directoryRevision = useEmployeeDirectoryRevision();
  const departmentRevision = useDepartmentDirectoryRevision();
  const { profile } = useAuth();
  // Monday–Sunday of whichever week today falls in, not the week the seed
  // records happen to cover. A date literal here would have gone stale the
  // following Monday and stayed wrong forever. All seven days: the working
  // week is six of them and which day is dropped is the employee's own
  // week-off, so it cannot be decided at page level.
  const weekDates = useMemo(() => getCurrentWeekDates(), []);
  // Whose rows this viewer is entitled to. HR and Admin get the whole company;
  // a Manager gets their own reporting line plus HR. See lib/dataScope.ts.
  const visibleEmployeeIds = useMemo(
    () => getVisibleEmployeeIds(profile),
    [profile, directoryRevision],
  );
  // Today is always one of weekDates, so this needs no clamping into the
  // week — and must not clamp, or a day marked on a date the old Mon–Fri
  // window excluded opened on Friday and read as though the record had never
  // been written.
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [markModalOpen, setMarkModalOpen] = useState(false);
  // Read from the store rather than the seed, so a marked day is still there
  // after a refresh — and re-read when another tab changes it.
  const attendanceRevision = useCollectionRevision(ATTENDANCE_CHANGED_EVENT);
  const regularizationRevision = useCollectionRevision(REGULARIZATIONS_CHANGED_EVENT);
  const attendanceState = useMemo(() => getAttendanceRecords(), [attendanceRevision]);
  const [markEmployeeId, setMarkEmployeeId] = useState('');
  const [markStatus, setMarkStatus] = useState<AttendanceStatus>('Present');
  const [markCheckIn, setMarkCheckIn] = useState('09:00');
  const [markCheckOut, setMarkCheckOut] = useState('18:00');

  // Derived from the attendance records, so it has to re-read when *those*
  // change too. Depending on the regularization event alone left a day marked
  // Absent invisible in this queue until the page was reloaded.
  const regRequests = useMemo<RegularizationRequest[]>(
    () => getRegularizationRequests(),
    [regularizationRevision, attendanceRevision],
  );

  // Requests raised by people outside this viewer's scope aren't theirs to see
  // or approve.
  const visibleRegRequests = useMemo(
    () => regRequests.filter((request) => visibleEmployeeIds.has(request.employeeId)),
    [regRequests, visibleEmployeeIds],
  );

  // Every figure on this page — the stat cards, the weekly chart and the table
  // — reads through here, so the visibility scope is applied once at the source
  // rather than being re-remembered at each call site.
  function recordsByDate(date: string) {
    return attendanceState.filter(
      (record) => record.date === date && visibleEmployeeIds.has(record.employeeId),
    );
  }

  // Stats for selected date
  const dayRecords = useMemo(
    () => recordsByDate(selectedDate),
    [attendanceState, selectedDate, visibleEmployeeIds],
  );
  const todayStats = useMemo(() => {
    const todayRecs = recordsByDate(todayIso());
    return {
      present: todayRecs.filter((r) => r.status === 'Present').length,
      wfh: todayRecs.filter((r) => r.status === 'Work From Home').length,
      onLeave: todayRecs.filter((r) => r.status === 'On Leave').length,
      absent: todayRecs.filter((r) => r.status === 'Absent').length,
      late: todayRecs.filter((r) => r.isLate).length,
    };
  }, [attendanceState, visibleEmployeeIds]);

  // Weekly trend data
  const weeklyData = useMemo(() => {
    return weekDates.map((date) => {
      const records = recordsByDate(date);
      return {
        day: formatWeekdayShort(date),
        Present: records.filter((r) => r.status === 'Present').length,
        WFH: records.filter((r) => r.status === 'Work From Home').length,
        Leave: records.filter((r) => r.status === 'On Leave').length,
        Absent: records.filter((r) => r.status === 'Absent').length,
      };
    });
  }, [attendanceState, weekDates, visibleEmployeeIds]);

  // Table rows: join attendance with employee info
  const tableRows = useMemo((): AttendanceRow[] => {
    return dayRecords
      .map((r) => ({ ...r, employee: getEmployee(r.employeeId) }))
      .filter((r): r is AttendanceRow => r.employee !== undefined)
      .filter((r) => {
        const emp = r.employee;
        const matchSearch =
          !search ||
          emp.fullName.toLowerCase().includes(search.toLowerCase()) ||
          emp.employeeCode.toLowerCase().includes(search.toLowerCase());
        const matchDept = !deptFilter || emp.department === deptFilter;
        return matchSearch && matchDept;
      });
  }, [dayRecords, search, deptFilter]);

  // Dept options
  const deptOptions = useMemo(
    () => [
      { label: 'All Departments', value: '' },
      ...departments.map((d) => ({ label: d, value: d })),
    ],
    [departmentRevision],
  );

  // Who can be marked today. Two filters, for two different reasons:
  // only people this viewer oversees — marking attendance for someone whose
  // record you cannot see would be writing blind — and only people still on
  // the books, since a resigned employee has no day to record.
  const markEmployeeOptions = useMemo(
    () =>
      getEmployeeDirectory()
        .filter((employee) => visibleEmployeeIds.has(employee.id))
        .filter((employee) => employee.status !== 'Resigned')
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [visibleEmployeeIds, directoryRevision],
  );

  // Every day of the week today falls in, so today is always among them —
  // Mark Attendance writes for today and then selects that day, and an option
  // list that could not name it left the Select holding a date it did not
  // offer. weekDates is the full Mon–Sun calendar week because the working
  // week is six days and which day is missing is per-employee, not per-page.
  const dateOptions = useMemo(
    () =>
      weekDates.map((d) => ({
        label: dayLabel(d) + (d === todayIso() ? ' (Today)' : ''),
        value: d,
      })),
    [weekDates],
  );

  // Who is rostered off on the day being viewed. They have no record and never
  // will, so without this the day reads as "attendance not marked" for them —
  // the same as someone genuinely unaccounted for.
  const weekOffOnDay = useMemo(
    () =>
      getEmployeeDirectory()
        .filter((employee) => visibleEmployeeIds.has(employee.id))
        .filter((employee) => employee.status !== 'Resigned')
        .filter((employee) => isWeekOffFor(employee, selectedDate)),
    [visibleEmployeeIds, directoryRevision, selectedDate],
  );

  // Columns for attendance table
  const columns: Column<AttendanceRow>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.employee.fullName} size="sm" />
          <div>
            <p className="font-medium text-ink-900">{row.employee.fullName}</p>
            <p className="text-xs text-ink-400">{row.employee.employeeCode}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      render: (row) => (
        <span className="text-ink-600 text-sm">{row.employee.department}</span>
      ),
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
      key: 'checkIn',
      header: 'Check-In',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <span className="text-ink-700">{row.checkIn ?? '—'}</span>
          {row.isLate && (
            <Badge tone="amber" className="text-[10px] px-1.5 py-0">
              Late
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'checkOut',
      header: 'Check-Out',
      render: (row) => <span className="text-ink-700">{row.checkOut ?? '—'}</span>,
    },
    {
      key: 'hours',
      header: 'Hours',
      align: 'right',
      render: (row) => (
        <span className={row.workedHours < 4 ? 'text-rose-600 font-medium' : 'text-ink-700'}>
          {row.workedHours > 0 ? `${row.workedHours.toFixed(1)}h` : '—'}
        </span>
      ),
    },
    {
      key: 'shift',
      header: 'Shift',
      render: (row) => <span className="text-ink-500 text-xs">{row.shift}</span>,
    },
  ];

  // Regularization handlers
  // Approving applies the requested status to the day itself, so this must go
  // through the data layer rather than rewriting the list in place.
  function decideReg(id: string, status: 'Approved' | 'Rejected') {
    decideRegularization(id, status);
  }
  const approveReg = (id: string) => decideReg(id, 'Approved');
  const rejectReg = (id: string) => decideReg(id, 'Rejected');

  function resetMarkAttendanceForm() {
    setMarkEmployeeId('');
    setMarkStatus('Present');
    setMarkCheckIn('09:00');
    setMarkCheckOut('18:00');
  }

  function saveAttendance() {
    if (!markEmployeeId) return;

    const workedHours = markStatus === 'Absent' || markStatus === 'On Leave'
      ? 0
      : Math.max(
        0,
        (new Date(`1970-01-01T${markCheckOut}:00`).getTime() - new Date(`1970-01-01T${markCheckIn}:00`).getTime())
        / (1000 * 60 * 60),
      );
    const checkIn = markStatus === 'Absent' || markStatus === 'On Leave' ? null : markCheckIn;
    // Lateness is about when the day started, not where it was worked. This
    // form used to require `status === 'Present'`, so a 09:40 Work From Home
    // was on time here while the same day in seed data — which derives from the
    // check-in alone — was late. One rule now: a recorded arrival after
    // LATE_AFTER is late, whatever the status; a day with no arrival cannot be.
    const isLate = checkIn ? isLateCheckIn(checkIn) : false;

    const nextRecord: AttendanceRecord = {
      id: `att-manual-${markEmployeeId}-${todayIso()}`,
      employeeId: markEmployeeId,
      date: todayIso(),
      status: markStatus,
      checkIn,
      checkOut: markStatus === 'Absent' || markStatus === 'On Leave' ? null : markCheckOut,
      workedHours,
      shift: 'General (09:00 – 18:00)',
      isLate,
    };

    const withoutExisting = getAttendanceRecords().filter(
      (record) => !(record.employeeId === markEmployeeId && record.date === todayIso()),
    );
    saveAttendanceRecords([...withoutExisting, nextRecord]);

    setMarkModalOpen(false);
    resetMarkAttendanceForm();
    setSelectedDate(todayIso());
  }

  const regColumns: Column<RegularizationRequest>[] = [
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
      key: 'date',
      header: 'Date',
      render: (row) => <span className="text-ink-700">{formatDate(row.date)}</span>,
    },
    {
      key: 'actualStatus',
      header: 'Recorded',
      // What the day actually says right now. An approver deciding a
      // regularization needs to see what they are changing *from*, and this is
      // the one value on the row that is not somebody's assertion.
      render: (row) => {
        const record = getAttendanceRecordFor(row.employeeId, row.date);
        if (!record) return <span className="text-ink-400 text-sm">No record</span>;
        return (
          <div className="flex items-center gap-1.5">
            <Badge tone={statusTone(record.status)} dot>
              {record.status}
            </Badge>
            {record.isLate && (
              <Badge tone="amber" className="text-[10px] px-1.5 py-0">
                Late
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'requestedStatus',
      header: 'Requested',
      // Blank on rows the app flagged from the records — nobody asked for
      // anything on those, and printing a status here implied somebody had.
      render: (row) =>
        row.requestedStatus ? (
          <Badge tone={statusTone(row.requestedStatus)}>{row.requestedStatus}</Badge>
        ) : (
          <span className="text-ink-400 text-sm" title="Flagged from the attendance record; no status requested">
            —
          </span>
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
        row.status === 'Pending' ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={(e) => {
                e.stopPropagation();
                approveReg(row.id);
              }}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                rejectReg(row.id);
              }}
            >
              Reject
            </Button>
          </div>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        subtitle={`Week of ${formatDate(weekDates[0])} – ${formatDate(weekDates[6])}`}
        actions={
          <Button variant="primary" icon={<CheckCircle size={16} />} onClick={() => setMarkModalOpen(true)}>
            Mark Attendance
          </Button>
        }
      />

      {/* Stat Cards — today's numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="Present Today"
          value={todayStats.present}
          icon={<Users size={20} />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Work From Home"
          value={todayStats.wfh}
          icon={<Monitor size={20} />}
          iconClass="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="On Leave"
          value={todayStats.onLeave}
          icon={<Calendar size={20} />}
          iconClass="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Absent"
          value={todayStats.absent}
          icon={<UserX size={20} />}
          iconClass="bg-rose-50 text-rose-600"
        />
        <StatCard
          label="Late Arrivals"
          value={todayStats.late}
          icon={<Clock size={20} />}
          iconClass="bg-amber-50 text-amber-600"
        />
      </div>

      {/* Daily Attendance Table */}
      <Card padding={false}>
        <div className="p-5 border-b border-ink-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardHeader
              title="Daily Attendance"
              subtitle={`${tableRows.length} employee${tableRows.length !== 1 ? 's' : ''} shown`}
              className="mb-0"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={selectedDate}
                onChange={setSelectedDate}
                options={dateOptions}
                className="w-48"
              />
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search employee…"
                className="w-48"
              />
              <Select
                value={deptFilter}
                onChange={setDeptFilter}
                options={deptOptions}
                className="w-44"
              />
            </div>
          </div>
          {/* Rostered off on this day. Stated rather than left to the absence
              of a row: a week-off and an unmarked day both show as nothing in
              the table below, and only one of them needs chasing. */}
          {weekOffOnDay.length > 0 ? (
            <p className="mt-3 text-sm text-ink-500">
              <span className="font-medium text-ink-700">
                {weekOffOnDay.length} on week off
              </span>{' '}
              — {weekOffOnDay.map((employee) => employee.fullName).join(', ')}
            </p>
          ) : null}
        </div>
        <Table
          columns={columns}
          data={tableRows}
          keyExtractor={(r) => r.id}
          emptyMessage="No attendance records for the selected filters."
        />
      </Card>

      {/* Weekly Trend Chart */}
      <Card>
        <CardHeader
          title="Weekly Attendance Trend"
          subtitle="Stacked breakdown by status, Monday to Sunday"
        />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData} barSize={18} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb' }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="Present" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="WFH" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Leave" stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Absent" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Regularization Requests */}
      <Card padding={false}>
        <div className="p-5 border-b border-ink-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-ink-900">Regularization Requests</h3>
            <p className="text-sm text-ink-500 mt-0.5">
              {visibleRegRequests.filter((r) => r.status === 'Pending').length} pending approval
            </p>
          </div>
          <Badge tone="amber">
            {visibleRegRequests.filter((r) => r.status === 'Pending').length} Pending
          </Badge>
        </div>
        <Table
          columns={regColumns}
          data={visibleRegRequests}
          keyExtractor={(r) => r.id}
          emptyMessage="No regularization requests."
        />
      </Card>

      {/* Mark Attendance Modal */}
      <Modal
        open={markModalOpen}
        onClose={() => setMarkModalOpen(false)}
        title="Mark Attendance"
        subtitle="Record attendance for an employee for today"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMarkModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveAttendance} disabled={!markEmployeeId}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Employee</label>
            <select className="input w-full" value={markEmployeeId} onChange={(e) => setMarkEmployeeId(e.target.value)}>
              <option value="">Select employee…</option>
              {markEmployeeOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.employeeCode})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Status</label>
            <select className="input w-full" value={markStatus} onChange={(e) => setMarkStatus(e.target.value as AttendanceStatus)}>
              <option value="Present">Present</option>
              <option value="Work From Home">Work From Home</option>
              <option value="Half Day">Half Day</option>
              <option value="On Leave">On Leave</option>
              <option value="Absent">Absent</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Check-In</label>
              <input type="time" className="input w-full" value={markCheckIn} onChange={(e) => setMarkCheckIn(e.target.value)} disabled={markStatus === 'Absent' || markStatus === 'On Leave'} />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Check-Out</label>
              <input type="time" className="input w-full" value={markCheckOut} onChange={(e) => setMarkCheckOut(e.target.value)} disabled={markStatus === 'Absent' || markStatus === 'On Leave'} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Note (optional)</label>
            <textarea className="input w-full h-20 resize-none" placeholder="Any remarks…" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
