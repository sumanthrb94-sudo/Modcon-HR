import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Users, Monitor, Calendar, UserX, Clock, Info } from 'lucide-react';
import {
  PageHeader,
  StatCard,
  Card,
  CardHeader,
  Badge,
  statusTone,
  Avatar,
  Table,
  type Column,
  Select,
  EmptyState,
} from '@/components/ui';
import { attendanceRecords, WEEK_DATES } from '@/data/attendance';
import { getEmployeeDirectory, getEmployeeName } from '@/data/employees';
import type { AttendanceRecord } from '@/types';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { weekday: 'long' });
}

export function MyAttendancePage() {
  const { profile, isAdmin, isManager } = useAuth();
  const directory = useMemo(() => getEmployeeDirectory(), []);

  // Match the signed-in user to an employee record by email.
  const ownEmployee = useMemo(() => {
    const email = (profile?.email ?? '').toLowerCase();
    return email ? directory.find((e) => e.email.toLowerCase() === email) : undefined;
  }, [directory, profile?.email]);

  // Admins & managers can view any employee's attendance; a plain employee is
  // locked to their own record.
  const canPickAny = isAdmin || isManager;
  const fallbackId = ownEmployee?.id ?? directory[0]?.id ?? '';
  const [selectedId, setSelectedId] = useState(fallbackId);

  const targetId = canPickAny ? selectedId || fallbackId : ownEmployee?.id ?? fallbackId;
  const targetEmployee = directory.find((e) => e.id === targetId);

  // When a non-privileged user isn't linked to an employee record we still show
  // a representative record so the page is never empty — but say so.
  const showingSample = !canPickAny && !ownEmployee;

  const employeeOptions = useMemo(
    () => directory.map((e) => ({ label: `${e.fullName} (${e.employeeCode})`, value: e.id })),
    [directory],
  );

  const records = useMemo(
    () =>
      attendanceRecords
        .filter((r) => r.employeeId === targetId)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date)),
    [targetId],
  );

  const stats = useMemo(() => {
    return {
      present: records.filter((r) => r.status === 'Present').length,
      wfh: records.filter((r) => r.status === 'Work From Home').length,
      onLeave: records.filter((r) => r.status === 'On Leave').length,
      absent: records.filter((r) => r.status === 'Absent').length,
      late: records.filter((r) => r.isLate).length,
      totalHours: records.reduce((sum, r) => sum + r.workedHours, 0),
    };
  }, [records]);

  const chartData = useMemo(
    () =>
      WEEK_DATES.map((date) => {
        const rec = records.find((r) => r.date === date);
        return {
          day: new Date(date).toLocaleDateString('en-IN', { weekday: 'short' }),
          Hours: rec ? Number(rec.workedHours.toFixed(1)) : 0,
        };
      }),
    [records],
  );

  const columns: Column<AttendanceRecord>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (row) => (
        <div>
          <p className="font-medium text-ink-900">{formatDate(row.date)}</p>
          <p className="text-xs text-ink-400">{dayLabel(row.date)}</p>
        </div>
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
        <span className={row.workedHours > 0 && row.workedHours < 4 ? 'text-rose-600 font-medium' : 'text-ink-700'}>
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={canPickAny ? 'Employee Attendance' : 'My Attendance'}
        subtitle={
          canPickAny
            ? 'View any employee’s attendance for the week'
            : `Your attendance · Week of ${formatDate(WEEK_DATES[0])} – ${formatDate(WEEK_DATES[4])}`
        }
        actions={
          canPickAny ? (
            <Select
              value={targetId}
              onChange={setSelectedId}
              options={employeeOptions}
              className="w-64"
            />
          ) : undefined
        }
      />

      {showingSample && (
        <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
          <Info size={16} className="shrink-0" />
          Your account isn’t linked to an employee record yet — showing sample attendance.
        </div>
      )}

      {!targetEmployee ? (
        <Card>
          <EmptyState title="No employee selected" description="Pick an employee to view their attendance." />
        </Card>
      ) : (
        <>
          {/* Employee summary */}
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar name={targetEmployee.fullName} size="lg" />
                <div>
                  <h3 className="text-lg font-semibold text-ink-900">{targetEmployee.fullName}</h3>
                  <p className="text-sm text-ink-500">
                    {targetEmployee.designation} · {targetEmployee.department}
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    {targetEmployee.employeeCode} · {targetEmployee.location}
                    {targetEmployee.reportingManagerId
                      ? ` · Reports to ${targetEmployee.reportingManagerName ?? getEmployeeName(targetEmployee.reportingManagerId)}`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-2xl font-bold text-ink-900">{stats.totalHours.toFixed(1)}h</p>
                <p className="text-xs text-ink-400">worked this week</p>
              </div>
            </div>
          </Card>

          {/* Weekly stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard label="Present" value={stats.present} icon={<Users size={20} />} iconClass="bg-emerald-50 text-emerald-600" />
            <StatCard label="Work From Home" value={stats.wfh} icon={<Monitor size={20} />} iconClass="bg-blue-50 text-blue-600" />
            <StatCard label="On Leave" value={stats.onLeave} icon={<Calendar size={20} />} iconClass="bg-violet-50 text-violet-600" />
            <StatCard label="Absent" value={stats.absent} icon={<UserX size={20} />} iconClass="bg-rose-50 text-rose-600" />
            <StatCard label="Late Arrivals" value={stats.late} icon={<Clock size={20} />} iconClass="bg-amber-50 text-amber-600" />
          </div>

          {/* Attendance records */}
          <Card padding={false}>
            <div className="p-5 border-b border-ink-100">
              <CardHeader
                title="Attendance Records"
                subtitle={`${records.length} day${records.length !== 1 ? 's' : ''} this week`}
                className="mb-0"
              />
            </div>
            <Table
              columns={columns}
              data={records}
              keyExtractor={(r) => r.id}
              emptyMessage="No attendance records for this employee."
            />
          </Card>

          {/* Worked hours chart */}
          {records.length > 0 && (
            <Card>
              <CardHeader title="Worked Hours" subtitle="Hours logged across the work week" />
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barSize={28} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb' }}
                      formatter={(value) => [`${value}h`, 'Worked']}
                    />
                    <Bar dataKey="Hours" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
