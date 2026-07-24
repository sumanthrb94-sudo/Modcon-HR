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
  MapPin,
  Navigation,
  Loader2,
  LogOut,
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
  attendanceRecords,
  regularizationRequests,
  WEEK_DATES,
  type RegularizationRequest,
} from '@/data/attendance';
import { employees, departments, getEmployee } from '@/data/employees';
import type { AttendanceRecord, AttendanceStatus, Employee } from '@/types';
import { formatDate } from '@/lib/utils';
import { checkInWithLocation, formatDistance, OFFICE, type GeoCheckInResult } from '@/lib/geo';

type AttendanceRow = AttendanceRecord & { employee: Employee };

const TODAY = '2026-06-10';

// day-of-week label for selects
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-IN', { weekday: 'short' });
  const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  return `${day}, ${dateStr}`;
}

export function AttendancePage() {
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [markModalOpen, setMarkModalOpen] = useState(false);
  const [attendanceState, setAttendanceState] = useState<AttendanceRecord[]>(attendanceRecords);
  const [markEmployeeId, setMarkEmployeeId] = useState('');
  const [markStatus, setMarkStatus] = useState<AttendanceStatus>('Present');
  const [markCheckIn, setMarkCheckIn] = useState('09:00');
  const [markCheckOut, setMarkCheckOut] = useState('18:00');

  // Regularization state — mutable local copy
  const [regRequests, setRegRequests] = useState<RegularizationRequest[]>(regularizationRequests);

  // Location-based self check-in / check-out state
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [selfCheckIn, setSelfCheckIn] = useState<(GeoCheckInResult & { time: string }) | null>(null);
  const [selfCheckOut, setSelfCheckOut] = useState<{ time: string; workedHours: number } | null>(null);

  const isCheckedIn = Boolean(selfCheckIn) && !selfCheckOut;

  function fmtTime(ms: number): string {
    return new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  async function handleCheckIn() {
    setGeoError('');
    setGeoLoading(true);
    try {
      const result = await checkInWithLocation();
      setSelfCheckIn({ ...result, time: fmtTime(result.timestamp) });
      setSelfCheckOut(null);
    } catch (err) {
      setSelfCheckIn(null);
      setGeoError(err instanceof Error ? err.message : 'Could not check in.');
    } finally {
      setGeoLoading(false);
    }
  }

  function handleCheckOut() {
    if (!selfCheckIn) return;
    const now = Date.now();
    const workedHours = Math.max(0, (now - selfCheckIn.timestamp) / 3_600_000);
    setSelfCheckOut({ time: fmtTime(now), workedHours });
  }

  function recordsByDate(date: string) {
    return attendanceState.filter((record) => record.date === date);
  }

  // Stats for selected date
  const dayRecords = useMemo(() => recordsByDate(selectedDate), [attendanceState, selectedDate]);
  const todayStats = useMemo(() => {
    const todayRecs = recordsByDate(TODAY);
    return {
      present: todayRecs.filter((r) => r.status === 'Present').length,
      wfh: todayRecs.filter((r) => r.status === 'Work From Home').length,
      onLeave: todayRecs.filter((r) => r.status === 'On Leave').length,
      absent: todayRecs.filter((r) => r.status === 'Absent').length,
      late: todayRecs.filter((r) => r.isLate).length,
    };
  }, [attendanceState]);

  // Weekly trend data
  const weeklyData = useMemo(() => {
    return WEEK_DATES.map((date) => {
      const records = recordsByDate(date);
      return {
        day: new Date(date).toLocaleDateString('en-IN', { weekday: 'short' }),
        Present: records.filter((r) => r.status === 'Present').length,
        WFH: records.filter((r) => r.status === 'Work From Home').length,
        Leave: records.filter((r) => r.status === 'On Leave').length,
        Absent: records.filter((r) => r.status === 'Absent').length,
      };
    });
  }, [attendanceState]);

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
    [],
  );

  // Date options
  const dateOptions = useMemo(
    () =>
      WEEK_DATES.map((d) => ({
        label: dayLabel(d) + (d === TODAY ? ' (Today)' : ''),
        value: d,
      })),
    [],
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
  function approveReg(id: string) {
    setRegRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'Approved' as const } : r)),
    );
  }
  function rejectReg(id: string) {
    setRegRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'Rejected' as const } : r)),
    );
  }

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
    const isLate = markStatus === 'Present' && markCheckIn > '09:15';

    setAttendanceState((prev) => {
      const nextRecord: AttendanceRecord = {
        id: `att-manual-${markEmployeeId}-${TODAY}`,
        employeeId: markEmployeeId,
        date: TODAY,
        status: markStatus,
        checkIn: markStatus === 'Absent' || markStatus === 'On Leave' ? null : markCheckIn,
        checkOut: markStatus === 'Absent' || markStatus === 'On Leave' ? null : markCheckOut,
        workedHours,
        shift: 'General (09:00 – 18:00)',
        isLate,
      };

      const withoutExisting = prev.filter((record) => !(record.employeeId === markEmployeeId && record.date === TODAY));
      return [...withoutExisting, nextRecord];
    });

    setMarkModalOpen(false);
    resetMarkAttendanceForm();
    setSelectedDate(TODAY);
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
      key: 'requestedStatus',
      header: 'Requested Status',
      render: (row) => (
        <Badge tone={statusTone(row.requestedStatus)}>{row.requestedStatus}</Badge>
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
        subtitle={`Week of ${formatDate(WEEK_DATES[0])} – ${formatDate(WEEK_DATES[4])}`}
        actions={
          <Button variant="primary" icon={<CheckCircle size={16} />} onClick={() => setMarkModalOpen(true)}>
            Mark Attendance
          </Button>
        }
      />

      {/* Location-based self check-in / check-out */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <MapPin size={20} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink-900">Your attendance today</h3>
              <p className="text-sm text-ink-500">
                Check in with your location — we verify you're within {formatDistance(OFFICE.radiusMeters)} of {OFFICE.name}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              icon={geoLoading ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />}
              onClick={handleCheckIn}
              disabled={geoLoading || isCheckedIn}
              data-testid="geo-checkin"
            >
              {geoLoading ? 'Locating…' : 'Check in'}
            </Button>
            <Button
              variant="secondary"
              icon={<LogOut size={16} />}
              onClick={handleCheckOut}
              disabled={!isCheckedIn}
              data-testid="geo-checkout"
            >
              Check out
            </Button>
          </div>
        </div>

        {geoError && (
          <p
            className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
            data-testid="geo-error"
          >
            {geoError}
          </p>
        )}

        {selfCheckIn && (
          <div
            className="mt-4 flex flex-col gap-3 rounded-xl border border-ink-100 bg-ink-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"
            data-testid="geo-result"
          >
            <div className="flex items-center gap-3">
              <Badge tone={selfCheckIn.withinOffice ? 'green' : 'amber'} dot>
                {selfCheckIn.withinOffice ? 'On-site' : 'Off-site'}
              </Badge>
              <div>
                <p className="text-sm font-medium text-ink-900">
                  Checked in at {selfCheckIn.time} — {selfCheckIn.suggestedStatus}
                </p>
                <p className="text-xs text-ink-500">
                  {formatDistance(selfCheckIn.distanceMeters)} from {OFFICE.name}
                  {' · '}
                  <span data-testid="geo-coords">
                    {selfCheckIn.lat.toFixed(4)}, {selfCheckIn.lng.toFixed(4)}
                  </span>
                </p>
              </div>
            </div>
            {selfCheckOut ? (
              <div className="text-left sm:text-right" data-testid="geo-checkout-result">
                <p className="text-sm font-medium text-ink-900">Checked out at {selfCheckOut.time}</p>
                <p className="text-xs text-ink-500">{selfCheckOut.workedHours.toFixed(1)}h worked</p>
              </div>
            ) : (
              <Badge tone="blue">Currently checked in</Badge>
            )}
          </div>
        )}
      </Card>

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
          subtitle="Stacked breakdown by status across the work week"
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
              {regRequests.filter((r) => r.status === 'Pending').length} pending approval
            </p>
          </div>
          <Badge tone="amber">
            {regRequests.filter((r) => r.status === 'Pending').length} Pending
          </Badge>
        </div>
        <Table
          columns={regColumns}
          data={regRequests}
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
              {employees.map((e) => (
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
