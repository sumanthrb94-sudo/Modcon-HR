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
import { Users, Monitor, Calendar, UserX, Clock, Info, FilePlus, LogIn, LogOut, MapPin, CalendarDays, ChevronLeft, ChevronRight, List, AlertTriangle } from 'lucide-react';
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
import { getEmployeeDirectory, getEmployeeName, weekOffOf, isWeekOffFor, employeeWeekOffs } from '@/data/employees';
import { getHolidayDirectory } from '@/data/holidays';
import { useHolidayDirectoryRevision } from '@/lib/useHolidayDirectoryRevision';
import { useWeekOffRevision } from '@/lib/useWeekOffRevision';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import type { AttendanceRecord, AttendanceStatus } from '@/types';
import { cn, formatDate, formatWeekdayLong, formatWeekdayShort } from '@/lib/utils';
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
  const { profile, isAdmin, isManager, linkedEmployeeId } = useAuth();
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
    [profile, directory, linkedEmployeeId],
  );

  // The same resolver the rest of the app identifies people with: authUid
  // first, then email, then display name. Matching on email alone — as this
  // page did — disagrees with `dataScope` the moment somebody's work address
  // changes, because the uid link survives a profile edit and the address does
  // not. The effect was an employee still recognised everywhere else silently
  // losing the ability to check in.
  // `linkedEmployeeId` is in the deps rather than merely read: it is what
  // decides the answer, it arrives after the first render on a fresh sign-in,
  // and neither `profile` nor `directory` changes when it does.
  const ownEmployee = useMemo(
    () => getCurrentEmployeeRecord(profile, directory),
    [directory, profile, linkedEmployeeId],
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Always default to ownEmployee on My Attendance. An admin/manager can optionally
  // inspect a colleague by explicitly selecting them from the dropdown.
  const targetId = (canPickAny && selectedId) ? selectedId : (ownEmployee?.id ?? fallbackId);
  const targetEmployee = directory.find((e) => e.id === targetId);

  // A non-privileged account this app cannot match to an employee record. It
  // gets an explanation and no attendance, rather than somebody else's.
  const isUnlinked = !canPickAny && !ownEmployee;

  const [viewMode, setViewMode] = useState<'calendar' | 'table'>('calendar');
  const [calendarMonth, setCalendarMonth] = useState(() => todayIso().slice(0, 7)); // 'YYYY-MM'
  const holidayRevision = useHolidayDirectoryRevision();
  const holidays = useMemo(() => getHolidayDirectory(), [holidayRevision]);

  function prevMonth() {
    const [y, m] = calendarMonth.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    setCalendarMonth(d.toISOString().slice(0, 7));
  }

  function nextMonth() {
    const [y, m] = calendarMonth.split('-').map(Number);
    const d = new Date(Date.UTC(y, m, 1));
    setCalendarMonth(d.toISOString().slice(0, 7));
  }

  function resetToCurrentMonth() {
    setCalendarMonth(todayIso().slice(0, 7));
  }

  function openRaiseForDate(date: string) {
    setRaiseDate(date);
    setRaiseStatus('Present');
    setRaiseReason('');
    setRaiseOpen(true);
  }

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

  const calendarDays = useMemo(() => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const totalDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const firstDayUtc = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sun
    const padLeft = (firstDayUtc + 6) % 7; // Monday = 0
    const today = todayIso();

    const days = [];
    for (let i = 0; i < padLeft; i++) {
      days.push({ empty: true as const, key: `pad-${i}` });
    }

    for (let d = 1; d <= totalDays; d++) {
      const isoDate = `${calendarMonth}-${String(d).padStart(2, '0')}`;
      const record = records.find((r) => r.date === isoDate);
      const holiday = holidays.find((h) => h.date === isoDate);
      const isWeekOff = isWeekOffFor(targetEmployee, isoDate);
      const isToday = isoDate === today;
      const isFuture = isoDate > today;

      let status: 'Present' | 'WFH' | 'Leave' | 'HalfDay' | 'Absent' | 'WeekOff' | 'Holiday' | 'Future' = 'Future';
      let isAttentionItem = false;

      if (record) {
        if (record.status === 'Present') status = 'Present';
        else if (record.status === 'Work From Home') status = 'WFH';
        else if (record.status === 'On Leave') status = 'Leave';
        else if (record.status === 'Half Day') status = 'HalfDay';
        else if (record.status === 'Absent') {
          status = 'Absent';
          isAttentionItem = true;
        }
        if (record.isLate) {
          isAttentionItem = true;
        }
      } else if (isFuture) {
        status = 'Future';
      } else if (holiday) {
        status = 'Holiday';
      } else if (isWeekOff) {
        status = 'WeekOff';
      } else {
        status = 'Absent';
        isAttentionItem = true;
      }

      days.push({
        empty: false as const,
        key: isoDate,
        date: isoDate,
        dayNum: d,
        record,
        holiday,
        isWeekOff,
        isToday,
        isFuture,
        status,
        isAttentionItem,
      });
    }

    return days;
  }, [calendarMonth, records, targetEmployee, holidays]);

  const monthStats = useMemo(() => {
    const realDays = calendarDays.filter((d): d is Extract<typeof calendarDays[number], { empty: false }> => !d.empty && !d.isFuture);
    const present = realDays.filter((d) => d.status === 'Present').length;
    const wfh = realDays.filter((d) => d.status === 'WFH').length;
    const leave = realDays.filter((d) => d.status === 'Leave').length;
    const halfDay = realDays.filter((d) => d.status === 'HalfDay').length;
    const absentOrMissing = realDays.filter((d) => d.status === 'Absent').length;
    const late = realDays.filter((d) => Boolean(d.record?.isLate)).length;
    const attentionCount = realDays.filter((d) => d.isAttentionItem).length;
    const weekOffs = realDays.filter((d) => d.status === 'WeekOff').length;
    const holidayCount = realDays.filter((d) => d.status === 'Holiday').length;

    return { present, wfh, leave, halfDay, absentOrMissing, late, attentionCount, weekOffs, holidayCount };
  }, [calendarDays]);

  const monthTitle = useMemo(() => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, 1));
    return dateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }, [calendarMonth]);

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
        title={isOwnRecord ? 'My Attendance' : 'Employee Attendance'}
        subtitle={
          isOwnRecord
            ? `Your attendance · Week of ${formatDate(weekDates[0])} – ${formatDate(weekDates[6])} · week off ${employeeWeekOffs(targetEmployee).join(' & ')}`
            : `Viewing ${targetEmployee?.fullName ?? 'colleague'} · Week of ${formatDate(weekDates[0])} – ${formatDate(weekDates[6])} · week off ${employeeWeekOffs(targetEmployee).join(' & ')}`
        }
        actions={
          <div className="flex items-center gap-2">
            {canPickAny && (
              <Select
                value={targetId}
                onChange={(id) => setSelectedId(id === ownEmployee?.id ? null : id)}
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

      {/* Two different states wore one message. An account with no link at all
          needs an administrator to make one; an account whose link names a
          record this browser cannot see is already linked, and telling its
          owner to go and link it sends them to fix something that is not
          broken. `linkedEmployeeId` is what tells them apart. */}
      {isUnlinked && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="attendance-unlinked-notice">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>
            {linkedEmployeeId
              ? 'Your account is linked to an employee record, but that record has not reached this browser yet. Give it a moment and reload — if it persists, ask your HR administrator to check the directory.'
              : 'Your account isn’t linked to an employee record yet, so there is no attendance to show. An administrator can link it from Settings → Database.'}
          </span>
        </div>
      )}

      {!targetEmployee ? (
        <Card>
          <EmptyState
            title={isUnlinked ? 'No attendance to show' : 'No employee selected'}
            description={
              isUnlinked
                ? (linkedEmployeeId
                    ? 'Your record has not reached this browser yet.'
                    : 'This app has not been told which employee record your account belongs to.')
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
                  <h2 className="text-lg font-semibold text-ink-900">{targetEmployee.fullName}</h2>
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
                <h2 className="text-base font-semibold text-ink-900">
                  {openFromEarlierDay && todayRecord
                    ? `Open shift · ${formatDate(todayRecord.date)}`
                    : `Today · ${formatDate(todayIso())}`}
                </h2>
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

          {/* Status Badge Legend Bar */}
          <div className="flex items-center gap-4 flex-wrap px-4 py-2.5 bg-white border border-ink-200 text-xs text-ink-600 shadow-sm">
            <span className="font-semibold text-ink-800 uppercase tracking-wider text-[10px]">Status Legend:</span>
            <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" /><span>Present</span></div>
            <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-500 shrink-0" /><span>WFH</span></div>
            <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" /><span>Regularized / Late</span></div>
            <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" /><span>Absent / LOP</span></div>
            <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink-400 shrink-0" /><span>Week Off</span></div>
          </div>

          {/* Attendance Overview: Calendar with Status Dots & Table Toggle */}
          <Card padding={false} className="overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-ink-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-ink-900">Attendance Calendar</h3>
                  <Badge tone={monthStats.attentionCount > 0 ? 'red' : 'green'}>
                    {monthStats.attentionCount > 0 ? `${monthStats.attentionCount} action required` : 'All regularized'}
                  </Badge>
                </div>
                <p className="text-xs text-ink-500 mt-1">
                  {monthTitle} · {monthStats.present} present · {monthStats.wfh} WFH · {monthStats.leave} leaves · {monthStats.weekOffs} week-offs
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                {/* Month pagination */}
                <div className="flex items-center bg-ink-50 border border-ink-200 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={prevMonth}
                    aria-label="Previous month"
                    className="p-1.5 text-ink-600 hover:text-ink-900 hover:bg-white rounded transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="px-3 text-xs font-semibold text-ink-800 min-w-[110px] text-center">
                    {monthTitle}
                  </span>
                  <button
                    type="button"
                    onClick={nextMonth}
                    aria-label="Next month"
                    className="p-1.5 text-ink-600 hover:text-ink-900 hover:bg-white rounded transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <Button variant="ghost" size="sm" onClick={resetToCurrentMonth} className="text-xs">
                  This Month
                </Button>

                {/* View switcher */}
                <div className="flex items-center bg-ink-100 p-0.5 rounded-lg border border-ink-200">
                  <button
                    type="button"
                    onClick={() => setViewMode('calendar')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                      viewMode === 'calendar'
                        ? 'bg-white text-ink-900 shadow-sm'
                        : 'text-ink-600 hover:text-ink-900',
                    )}
                  >
                    <CalendarDays size={14} />
                    <span>Calendar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                      viewMode === 'table'
                        ? 'bg-white text-ink-900 shadow-sm'
                        : 'text-ink-600 hover:text-ink-900',
                    )}
                  >
                    <List size={14} />
                    <span>Table</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Red Alert Banner: The things they should care about! */}
            {monthStats.attentionCount > 0 && viewMode === 'calendar' && (
              <div className="mx-4 sm:mx-5 mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-rose-50/90 border border-rose-300 rounded-xl text-sm">
                <div className="flex items-start sm:items-center gap-2.5">
                  <span className="h-3 w-3 rounded-full bg-rose-600 shrink-0 mt-0.5 sm:mt-0 animate-pulse" />
                  <div>
                    <span className="font-bold text-rose-900">
                      {monthStats.attentionCount} Red Flag{monthStats.attentionCount > 1 ? 's' : ''} in {monthTitle}:
                    </span>{' '}
                    <span className="text-rose-700 text-xs sm:text-sm">
                      {monthStats.absentOrMissing > 0 ? `${monthStats.absentOrMissing} missing punch / absent day${monthStats.absentOrMissing > 1 ? 's' : ''}` : ''}
                      {monthStats.absentOrMissing > 0 && monthStats.late > 0 ? ' · ' : ''}
                      {monthStats.late > 0 ? `${monthStats.late} late arrival${monthStats.late > 1 ? 's' : ''}` : ''}
                      . Unregularized absences result in Loss of Pay (LOP).
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => openRaise()}
                  className="shrink-0 bg-rose-600 hover:bg-rose-700 border-none text-white shadow-sm"
                >
                  <FilePlus size={14} /> Request Regularization
                </Button>
              </div>
            )}

            {viewMode === 'calendar' ? (
              <div className="p-3 sm:p-5">
                {/* 7-day header */}
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayName, idx) => (
                    <div
                      key={dayName}
                      className={cn(
                        'py-2 text-center text-[11px] font-semibold tracking-wider uppercase rounded-md',
                        idx >= 5 ? 'text-ink-400 bg-ink-50/60' : 'text-ink-600 bg-ink-100/50',
                      )}
                    >
                      {dayName}
                    </div>
                  ))}
                </div>

                {/* Grid cells */}
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {calendarDays.map((day) => {
                    if (day.empty) {
                      return (
                        <div
                          key={day.key}
                          className="min-h-[85px] sm:min-h-[105px] rounded-xl bg-ink-50/30 border border-transparent"
                        />
                      );
                    }

                    const isRed = day.isAttentionItem;
                    const isGreen = day.status === 'Present';
                    const isBlue = day.status === 'WFH';
                    const isPurple = day.status === 'Leave';
                    const isWeekOff = day.status === 'WeekOff';
                    const isHoliday = day.status === 'Holiday';

                    return (
                      <div
                        key={day.key}
                        className={cn(
                          'min-h-[85px] sm:min-h-[105px] rounded-xl border p-2 flex flex-col justify-between transition-all relative group',
                          day.isToday && 'ring-2 ring-brand-500 shadow-sm',
                          isRed && 'border-2 border-rose-400 bg-rose-50/80 hover:bg-rose-100/70 hover:border-rose-500 shadow-sm',
                          isGreen && 'border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50/70 hover:border-emerald-300',
                          isBlue && 'border-sky-200 bg-sky-50/30 hover:bg-sky-50/70 hover:border-sky-300',
                          isPurple && 'border-purple-200 bg-purple-50/30 hover:bg-purple-50/70 hover:border-purple-300',
                          isWeekOff && 'border-dashed border-ink-200 bg-ink-50/40 text-ink-400',
                          isHoliday && 'border-teal-200 bg-teal-50/40 text-teal-800',
                          day.isFuture && 'border-ink-100 bg-white/40 text-ink-300',
                        )}
                      >
                        {/* Day number & indicators */}
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              'text-xs font-bold font-mono',
                              day.isToday ? 'text-brand-700 underline decoration-2' : isRed ? 'text-rose-900' : 'text-ink-800',
                            )}
                          >
                            {day.dayNum}
                          </span>
                          {day.isToday && (
                            <span className="text-[9px] font-bold bg-brand-600 text-white px-1.5 py-0.5 rounded-full leading-none">
                              Today
                            </span>
                          )}
                        </div>

                        {/* Status colored dot and badge */}
                        <div className="my-1">
                          {isGreen && (
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 shadow-sm" />
                              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/70 px-1 py-0.5 rounded border border-emerald-200 leading-none">
                                Present
                              </span>
                            </div>
                          )}

                          {isBlue && (
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-sky-500 shrink-0 shadow-sm" />
                              <span className="text-[10px] font-bold text-sky-800 bg-sky-100/70 px-1 py-0.5 rounded border border-sky-200 leading-none">
                                WFH
                              </span>
                            </div>
                          )}

                          {isPurple && (
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-purple-500 shrink-0 shadow-sm" />
                              <span className="text-[10px] font-bold text-purple-800 bg-purple-100/70 px-1 py-0.5 rounded border border-purple-200 leading-none">
                                Leave
                              </span>
                            </div>
                          )}

                          {isWeekOff && (
                            <div className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-ink-400 shrink-0" />
                              <span className="text-[10px] text-ink-500 font-medium">Off</span>
                            </div>
                          )}

                          {isHoliday && (
                            <div className="flex items-center gap-1" title={day.holiday?.name}>
                              <span className="h-1.5 w-1.5 rounded-full bg-teal-500 shrink-0" />
                              <span className="text-[10px] font-semibold text-teal-800 truncate max-w-[55px] sm:max-w-[70px]">
                                {day.holiday?.name ?? 'Holiday'}
                              </span>
                            </div>
                          )}

                          {isRed && (
                            <div className="flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-full bg-rose-600 shrink-0 shadow-sm animate-pulse" />
                              <span className="text-[10px] font-black text-rose-900 bg-rose-200/80 px-1.5 py-0.5 rounded border border-rose-300 leading-none uppercase tracking-wide">
                                {day.record?.isLate ? 'Late' : 'Absent'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Bottom action / timing */}
                        <div className="mt-auto pt-1 border-t border-ink-100/60 flex items-center justify-between text-[10px]">
                          {day.record ? (
                            <>
                              <span className="text-ink-500 font-mono truncate">
                                {day.record.checkIn ? `${day.record.checkIn}` : '—'}
                              </span>
                              <span className="font-bold text-ink-700 font-mono">
                                {day.record.workedHours > 0 ? `${day.record.workedHours.toFixed(1)}h` : ''}
                              </span>
                            </>
                          ) : isRed ? (
                            <button
                              type="button"
                              onClick={() => openRaiseForDate(day.date)}
                              className="text-rose-700 hover:text-rose-900 font-bold hover:underline flex items-center gap-0.5 w-full justify-center py-0.5 bg-rose-100/60 rounded"
                            >
                              <FilePlus size={10} /> Regularize
                            </button>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <Table
                columns={columns}
                data={records}
                keyExtractor={(r) => r.id}
                stickyFirstColumn={true}
                emptyMessage="No attendance records for this employee."
              />
            )}
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
