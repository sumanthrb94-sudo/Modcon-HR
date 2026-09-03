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
import { Users, Monitor, Calendar, UserX, Clock, Info, FilePlus, LogIn, LogOut, MapPin } from 'lucide-react';
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
  Button,
  Modal,
} from '@/components/ui';
import {
  getAttendanceRecords,
  getCurrentWeekDates,
  getRegularizationRequestsFor,
  getActiveRecord,
  recordCheckIn,
  recordCheckOut,
  addRegularizationRequest,
  REGULARIZATIONS_CHANGED_EVENT,
  ATTENDANCE_CHANGED_EVENT,
  type RegularizationRequest,
} from '@/data/attendance';
import { getEmployeeDirectory, getEmployeeName, weekOffOf, isWeekOffFor } from '@/data/employees';
import { useWeekOffRevision } from '@/lib/useWeekOffRevision';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import type { AttendanceRecord, AttendanceStatus } from '@/types';
import { formatDate, formatWeekdayLong, formatWeekdayShort } from '@/lib/utils';
import { todayIso } from '@/lib/today';
import { useAuth } from '@/lib/auth';
import { getVisibleEmployees, getCurrentEmployeeRecord } from '@/lib/dataScope';
import { useCollectionRevision } from '@/lib/useCollectionRevision';
import { CHART_GRID, CHART_PRIMARY, CHART_TOOLTIP_STYLE } from '@/lib/chartTheme';
import { getGeofenceConfigFor } from '@/data/attendanceGeofence';
import { useAttendanceGeofenceRevision } from '@/lib/useAttendanceGeofenceRevision';
import { captureLocationFix, describeGeolocationFailure } from '@/lib/geolocation';
import { describeVerdict, evaluateFix } from '@/data/geofenceRules';
import {
  fileAttendanceStamp,
  lastKnownFix,
  useMyAttendanceStamps,
} from '@/lib/attendanceStamps';

function dayLabel(iso: string): string {
  return formatWeekdayLong(iso);
}

export function MyAttendancePage() {
  const { profile, isAdmin, isManager } = useAuth();
  // Both stores are read below, and the regularization list is *derived* from
  // the attendance one — so every memo that touches either has to re-run when
  // either changes. Marking a day elsewhere otherwise left this page showing
  // the records and the flagged entries as they were at mount.
  const attendanceRevision = useCollectionRevision(ATTENDANCE_CHANGED_EVENT);
  const regularizationRevision = useCollectionRevision(REGULARIZATIONS_CHANGED_EVENT);
  // The directory changes under this page — an account being linked to a
  // record, a rename, a deletion — and every identity decision below reads it.
  // Held with empty deps, `ownEmployee` stayed frozen at mount, so linking an
  // account left check-in refused until the page happened to remount.
  const directoryRevision = useEmployeeDirectoryRevision();
  // The week strip below leaves the week-off unworked, and for most people
  // that day is the organisation's rather than their own — so it moves when
  // Settings does, and this page can be open while that happens.
  useWeekOffRevision();
  const directory = useMemo(() => getEmployeeDirectory(), [directoryRevision]);
  // Mon–Sun of the current week, derived rather than pinned to the week the
  // seed records were written for. All seven days: the week-off that makes it
  // a six-day week belongs to the employee, not to the calendar, so the day
  // this person does not work is marked below rather than left out here.
  const weekDates = useMemo(() => getCurrentWeekDates(), []);
  // A manager may look up their own reporting line and HR, not the whole
  // company — the picker below offers exactly what they are entitled to see.
  const viewableEmployees = useMemo(
    () => getVisibleEmployees(profile, directory),
    [profile, directory],
  );

  // The same resolver the rest of the app identifies people with: authUid
  // first, then email, then display name. Matching on email alone — as this
  // page did — disagrees with `dataScope` the moment somebody's work address
  // changes, because the uid link survives a profile edit and the address does
  // not. The effect was an employee still recognised everywhere else silently
  // losing the ability to check in.
  const ownEmployee = useMemo(
    () => getCurrentEmployeeRecord(profile, directory),
    [directory, profile],
  );

  // Admins & managers can view any employee's attendance; a plain employee is
  // locked to their own record.
  const canPickAny = isAdmin || isManager;
  // Falls back within the viewer's own scope, and no further. The trailing
  // `directory[0]?.id` that used to close this expression reached outside that
  // scope entirely: an account this app cannot match to a record was shown the
  // first person in the directory — their name, their avatar and their whole
  // week — under a banner calling it "sample attendance". It was not a sample,
  // it was a colleague. Nobody is the honest answer, and the direction a
  // missing identity has to fail.
  const fallbackId = ownEmployee?.id ?? viewableEmployees[0]?.id ?? '';
  const [selectedId, setSelectedId] = useState(fallbackId);

  const targetId = canPickAny ? selectedId || fallbackId : ownEmployee?.id ?? fallbackId;
  const targetEmployee = directory.find((e) => e.id === targetId);

  // A non-privileged account this app cannot match to an employee record. It
  // gets an explanation and no attendance, rather than somebody else's.
  const isUnlinked = !canPickAny && !ownEmployee;

  const employeeOptions = useMemo(
    () => viewableEmployees.map((e) => ({ label: `${e.fullName} (${e.employeeCode})`, value: e.id })),
    [viewableEmployees],
  );

  const records = useMemo(
    () =>
      getAttendanceRecords()
        .filter((r) => r.employeeId === targetId)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date)),
    [targetId, attendanceRevision],
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
      weekDates.map((date) => {
        const rec = records.find((r) => r.date === date);
        // A rostered day off reads as zero hours exactly like a day that was
        // missed, so the label says which it is. Without it the six-day week
        // looks like a seven-day week with one unexplained gap.
        const off = isWeekOffFor(targetEmployee, date);
        return {
          day: formatWeekdayShort(date) + (off ? ' (off)' : ''),
          Hours: rec ? Number(rec.workedHours.toFixed(1)) : 0,
        };
      }),
    [records, weekDates, targetEmployee],
  );

  // ---- Check in / check out --------------------------------------------------
  // Today's record drives the whole panel: which action is available, and what
  // has been stamped so far. Re-read on the attendance event so checking in
  // updates the card, the stat cards and the flagged-day list together.
  // Today's record, or a shift still open from yesterday. Keyed on today alone,
  // a shift begun at 23:50 became unreachable at midnight: the panel offered to
  // check in again while the real day stayed open at 0h forever.
  const todayRecord = useMemo(
    () => (targetId ? getActiveRecord(targetId) : undefined),
    [targetId, attendanceRevision],
  );
  const openFromEarlierDay = Boolean(todayRecord && todayRecord.date !== todayIso());
  const [clockError, setClockError] = useState('');

  // ---- Geofencing ------------------------------------------------------------
  // The fence is read at call time and re-read on its own event, so a fence an
  // administrator moves in Settings reaches a panel that is already open.
  const geofenceRevision = useAttendanceGeofenceRevision();
  const { config: geofenceConfig, exempt: geofenceExempt } = useMemo(
    () => getGeofenceConfigFor(targetId),
    [targetId, geofenceRevision],
  );
  const geofenceActive = geofenceConfig.mode !== 'off' && !geofenceExempt;
  // The employee's own stamps, for the impossible-travel comparison and for the
  // "where you were" line under the panel. Scoped to them by the query, because
  // the rules require an employee's list to filter on employeeId as well as org.
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState('');

  /**
   * Checking in is something you do, not something done to you.
   *
   * An admin or manager looking at someone else's week sees the day's state but
   * cannot stamp it: a captured time is evidence that a particular person
   * arrived, and letting a third party produce it makes it an assertion again —
   * exactly what these operations exist to replace. Recording a day on
   * somebody's behalf is what Attendance → Mark Attendance is for, and that
   * writes hand-entered times without pretending they were captured.
   */
  const isOwnRecord = Boolean(ownEmployee && targetId === ownEmployee.id);

  // The employee's own stamps, for the impossible-travel comparison and for the
  // "where you were" line under the panel. Scoped to them by the query, because
  // the rules require an employee's list to filter on employeeId as well as on
  // the organisation — an unfiltered read is denied, not merely wasteful.
  const ownStamps = useMyAttendanceStamps(profile, isOwnRecord ? targetId : null);

  /**
   * Capture a position, judge it against the fence, and file the evidence.
   *
   * Runs before the attendance record moves, and the order matters: under
   * enforcement a refused fix must leave the day exactly as it was, or the
   * refusal is cosmetic. The stamp is filed either way — including when the
   * check-in is refused — because "this person tried to check in from 4 km
   * away" is precisely the thing the review queue exists to hold.
   *
   * Returns whether the caller may proceed.
   */
  async function stampLocation(kind: 'in' | 'out', date: string): Promise<boolean> {
    if (!targetId) return false;
    if (!geofenceActive) return true;

    setLocating(true);
    setLocationNote('');
    try {
      const { fix, failure } = await captureLocationFix();
      const verdict = evaluateFix({
        config: geofenceConfig,
        fix,
        exempt: geofenceExempt,
        previous: lastKnownFix(ownStamps),
      });

      const filed = await fileAttendanceStamp({
        profile,
        employeeId: targetId,
        date,
        kind,
        fix,
        verdict,
        mode: geofenceConfig.mode,
      });

      if (!verdict.accepted) {
        // The device's own reason is more actionable than ours when there is
        // one — "location is blocked for this site" tells them what to change.
        setClockError(
          failure ? describeGeolocationFailure(failure) : describeVerdict(verdict, geofenceConfig.mode),
        );
        return false;
      }

      // A stamp that could not be filed is reported rather than swallowed. The
      // attendance record still moves — refusing to record a day because its
      // evidence did not save would punish the employee for a network fault —
      // but nobody is told the location was confirmed when it was not.
      setLocationNote(
        filed
          ? describeVerdict(verdict, geofenceConfig.mode)
          : 'Recorded, but your location could not be filed. Tell HR if this keeps happening.',
      );
      return true;
    } finally {
      setLocating(false);
    }
  }

  // Both handlers re-check `isOwnRecord`. The buttons already hide for someone
  // else's record, but a guard that lives only in what is rendered is one
  // refactor away from being no guard at all.
  async function handleCheckIn() {
    setClockError('');
    setLocationNote('');
    if (!targetId || !isOwnRecord) return;
    // The stamp is keyed to the day the record will land on, so the two agree
    // even when the click happens either side of midnight.
    if (!(await stampLocation('in', todayIso()))) return;
    recordCheckIn(targetId);
  }

  async function handleCheckOut() {
    setClockError('');
    setLocationNote('');
    if (!targetId || !isOwnRecord) return;
    // A shift begun at 23:50 is closed against the day it *started*, matching
    // `recordCheckOut`, so the pair of stamps belongs to one shift rather than
    // to two days.
    const closingDate = todayRecord?.date ?? todayIso();
    if (!(await stampLocation('out', closingDate))) return;
    if (!recordCheckOut(targetId)) {
      // Only reachable if the record changed under us; the button is disabled
      // without a check-in.
      setClockError('There is no check-in to close for today.');
    }
  }

  // ---- Raising a regularization ---------------------------------------------
  const ownRequests = useMemo(
    () => getRegularizationRequestsFor(targetId),
    [targetId, regularizationRevision, attendanceRevision],
  );

  const [raiseOpen, setRaiseOpen] = useState(false);
  const [raiseDate, setRaiseDate] = useState('');
  const [raiseStatus, setRaiseStatus] = useState<AttendanceStatus>('Present');
  const [raiseReason, setRaiseReason] = useState('');

  // Only days this employee actually has a record for, plus the rest of the
  // work week. Raising against a day outside the week the page shows would
  // produce a request nothing on this page can explain.
  //
  // Their own week-off is excluded: there is nothing to correct about a day
  // they were rostered not to work, and offering it invites a request an
  // approver can only reject. Which day that is differs per person, so this
  // filters on the employee rather than on the weekday.
  const raiseDateOptions = useMemo(() => {
    const dates = new Set([...records.map((record) => record.date), ...weekDates]);
    return Array.from(dates)
      .filter((date) => !isWeekOffFor(targetEmployee, date))
      .sort((a, b) => b.localeCompare(a))
      .map((date) => ({ label: `${formatDate(date)} · ${formatWeekdayLong(date)}`, value: date }));
  }, [records, weekDates, targetEmployee]);

  function openRaise() {
    setRaiseDate(raiseDateOptions[0]?.value ?? '');
    setRaiseStatus('Present');
    setRaiseReason('');
    setRaiseOpen(true);
  }

  function submitRaise() {
    if (!raiseDate || !raiseReason.trim()) return;
    addRegularizationRequest({
      employeeId: targetId,
      date: raiseDate,
      reason: raiseReason.trim(),
      requestedStatus: raiseStatus,
    });
    setRaiseOpen(false);
  }

  const requestColumns: Column<RegularizationRequest>[] = [
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
      key: 'actualStatus',
      header: 'Recorded',
      render: (row) => {
        const record = records.find((item) => item.date === row.date);
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
      // Empty on days the app flagged rather than the employee raising them.
      render: (row) =>
        row.requestedStatus ? (
          <Badge tone={statusTone(row.requestedStatus)}>{row.requestedStatus}</Badge>
        ) : (
          <span className="text-ink-400 text-sm">—</span>
        ),
    },
    {
      key: 'reason',
      header: 'Reason',
      className: 'max-w-md',
      render: (row) => <span className="text-ink-600 text-sm">{row.reason}</span>,
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
  ];

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
            ? `Viewing the week of ${formatDate(weekDates[0])} – ${formatDate(weekDates[6])} · week off ${weekOffOf(targetEmployee)}`
            : `Your attendance · Week of ${formatDate(weekDates[0])} – ${formatDate(weekDates[6])} · week off ${weekOffOf(targetEmployee)}`
        }
        actions={
          <div className="flex items-center gap-2">
            {canPickAny && (
              <Select
                value={targetId}
                onChange={setSelectedId}
                options={employeeOptions}
                className="w-64"
              />
            )}
            {targetEmployee && (
              <Button variant="primary" icon={<FilePlus size={16} />} onClick={openRaise}>
                Request Regularization
              </Button>
            )}
          </div>
        }
      />

      {isUnlinked && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="attendance-unlinked-notice">
          <Info size={16} className="shrink-0" />
          Your account isn’t linked to an employee record yet, so there is no attendance to show. An
          administrator can link it from Settings → Database.
        </div>
      )}

      {!targetEmployee ? (
        <Card>
          <EmptyState
            title={isUnlinked ? 'No attendance to show' : 'No employee selected'}
            description={
              isUnlinked
                ? 'This app has not been told which employee record your account belongs to.'
                : 'Pick an employee to view their attendance.'
            }
          />
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
                {/* Every record held for this employee, not the current week —
                    `records` is filtered by person only. Labelling the total
                    "this week" reported months of seed data as seven days. The
                    chart below is the week view; this is the running total. */}
                <p className="text-xs text-ink-400">recorded in total</p>
              </div>
            </div>
          </Card>

          {/* Check in / check out for today */}
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-ink-900">
                  {openFromEarlierDay && todayRecord
                    ? `Open shift · ${formatDate(todayRecord.date)}`
                    : `Today · ${formatDate(todayIso())}`}
                </h3>
                {todayRecord?.checkIn ? (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge tone={statusTone(todayRecord.status)} dot>
                      {todayRecord.status}
                    </Badge>
                    {todayRecord.isLate && <Badge tone="amber">Late</Badge>}
                    <span className="text-sm text-ink-600">
                      In {todayRecord.checkIn}
                      {todayRecord.checkOut ? ` · Out ${todayRecord.checkOut}` : ' · still working'}
                    </span>
                    {todayRecord.checkOut && (
                      <span className="text-sm font-medium text-ink-900">
                        {todayRecord.workedHours.toFixed(2)}h
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-ink-500 mt-1">Not checked in yet today.</p>
                )}
                {clockError && <p className="text-sm text-rose-600 mt-2">{clockError}</p>}
                {locationNote && !clockError && (
                  <p className="text-sm text-ink-600 mt-2" data-testid="geofence-note">
                    {locationNote}
                  </p>
                )}
                {/* Said before the button is pressed, not after. A page that
                    asks for a location without warning reads as the app
                    reaching for something it was not given; and under
                    enforcement the employee needs to know a refusal is coming
                    while they can still walk twenty metres. */}
                {isOwnRecord && geofenceActive && (
                  <p className="text-xs text-ink-500 mt-2 flex items-start gap-1.5" data-testid="geofence-notice">
                    <MapPin size={13} className="mt-0.5 shrink-0" />
                    <span>
                      {geofenceConfig.mode === 'enforced'
                        ? 'Your location is checked against your organisation’s attendance areas when you check in or out.'
                        : 'Your location is recorded when you check in or out. It is not used to refuse a stamp.'}
                    </span>
                  </p>
                )}
              </div>
              {isOwnRecord ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    icon={<LogIn size={16} />}
                    onClick={handleCheckIn}
                    // The first stamp is the one that happened; re-stamping would
                    // quietly erase a late arrival.
                    disabled={Boolean(todayRecord?.checkIn) || locating}
                  >
                    {locating ? 'Locating…' : 'Check In'}
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<LogOut size={16} />}
                    onClick={handleCheckOut}
                    disabled={!todayRecord?.checkIn || Boolean(todayRecord?.checkOut) || locating}
                  >
                    Check Out
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-ink-500 max-w-xs sm:text-right">
                  Only {targetEmployee.fullName.split(' ')[0]} can check in and out. Record this day
                  from Attendance → Mark Attendance.
                </p>
              )}
            </div>
          </Card>

          {/* Weekly stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard label="Present" value={stats.present} icon={<Users size={20} />} />
            <StatCard label="Work From Home" value={stats.wfh} icon={<Monitor size={20} />} />
            <StatCard label="On Leave" value={stats.onLeave} icon={<Calendar size={20} />} />
            <StatCard label="Absent" value={stats.absent} icon={<UserX size={20} />} />
            <StatCard label="Late Arrivals" value={stats.late} icon={<Clock size={20} />} />
          </div>

          {/* Attendance records */}
          <Card padding={false}>
            <div className="p-5 border-b border-ink-100">
              <CardHeader
                title="Attendance Records"
                subtitle={`${records.length} day${records.length !== 1 ? 's' : ''} recorded`}
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

          {/* Regularization requests raised for this employee */}
          <Card padding={false}>
            <div className="p-5 border-b border-ink-100">
              <CardHeader
                title="Regularization Requests"
                subtitle={`${ownRequests.filter((r) => r.status === 'Pending').length} pending · ${ownRequests.length} total`}
                className="mb-0"
              />
            </div>
            <Table
              columns={requestColumns}
              data={ownRequests}
              keyExtractor={(r) => r.id}
              emptyMessage="No regularization requests for this employee."
            />
          </Card>

          {/* Worked hours chart */}
          {records.length > 0 && (
            <Card>
              <CardHeader title="Worked Hours" subtitle="Hours logged across the work week" />
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barSize={28} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value) => [`${value}h`, 'Worked']}
                    />
                    <Bar dataKey="Hours" fill={CHART_PRIMARY} radius={[0, 0, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </>
      )}

      <Modal
        open={raiseOpen}
        onClose={() => setRaiseOpen(false)}
        title="Request Regularization"
        subtitle={
          targetEmployee
            ? `Ask for a day to be corrected on ${targetEmployee.fullName}’s record`
            : 'Ask for a day to be corrected'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setRaiseOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={submitRaise}
              disabled={!raiseDate || !raiseReason.trim()}
            >
              Submit Request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Date</label>
            <Select value={raiseDate} onChange={setRaiseDate} options={raiseDateOptions} />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Requested Status</label>
            <Select
              value={raiseStatus}
              onChange={(value) => setRaiseStatus(value as AttendanceStatus)}
              options={(['Present', 'Work From Home', 'Half Day', 'On Leave'] as AttendanceStatus[]).map(
                (status) => ({ label: status, value: status }),
              )}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Reason</label>
            <textarea
              className="input w-full h-24 resize-none"
              placeholder="Why should this day be corrected?"
              value={raiseReason}
              onChange={(event) => setRaiseReason(event.target.value)}
            />
            {/* Required: an approver deciding a request with no stated reason is
                the fabricated-reason problem this replaced, in another form. */}
            <p className="text-xs text-ink-400 mt-1">A reason is required.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
