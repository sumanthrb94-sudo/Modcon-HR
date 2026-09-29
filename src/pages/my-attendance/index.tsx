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
import { Users, Monitor, Calendar, UserX, Clock, Info, FilePlus, LogIn, LogOut, MapPin, CalendarDays, ChevronLeft, ChevronRight, List, AlertTriangle, Sparkles, Layers, CheckSquare, Square, X } from 'lucide-react';
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
  addBulkRegularizationRequests,
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
import { cn, formatDate, formatDateShort, formatWeekdayLong, formatWeekdayShort } from '@/lib/utils';
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

  const ownRequests = useMemo(
    () => getRegularizationRequestsFor(targetId),
    [targetId, regularizationRevision, attendanceRevision],
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
      const pendingReq = ownRequests.find((r) => r.date === isoDate && r.status === 'Pending');

      let status: 'Present' | 'WFH' | 'Leave' | 'HalfDay' | 'Absent' | 'WeekOff' | 'Holiday' | 'Future' | 'PendingReg' = 'Future';
      let isAttentionItem = false;
      let isActionable = false;

      if (pendingReq) {
        status = 'PendingReg';
        // Already requested; awaiting approval, so not an unaddressed red alert
      } else if (record && record.status !== 'Absent') {
        if (record.status === 'Present') status = 'Present';
        else if (record.status === 'Work From Home') status = 'WFH';
        else if (record.status === 'On Leave') status = 'Leave';
        else if (record.status === 'Half Day') status = 'HalfDay';
        if (record.isLate) {
          isAttentionItem = true;
          isActionable = true;
        }
      } else if (isFuture) {
        status = 'Future';
      } else if (holiday) {
        status = 'Holiday';
        isAttentionItem = false;
        isActionable = false;
      } else if (isWeekOff) {
        status = 'WeekOff';
        isAttentionItem = false;
        isActionable = false;
      } else if (record && record.status === 'Absent') {
        status = 'Absent';
        isAttentionItem = true;
        isActionable = true;
      } else {
        status = 'Absent';
        isAttentionItem = true;
        isActionable = true;
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
        isActionable,
        isPendingReg: Boolean(pendingReq),
        pendingReq,
      });
    }

    return days;
  }, [calendarMonth, records, targetEmployee, holidays, ownRequests]);

  const actionableDays = useMemo(() => {
    return calendarDays
      .filter((d): d is Extract<typeof calendarDays[number], { empty: false }> => !d.empty && !d.isFuture && d.isActionable)
      .map((d) => d.date);
  }, [calendarDays]);

  const monthStats = useMemo(() => {
    const realDays = calendarDays.filter((d): d is Extract<typeof calendarDays[number], { empty: false }> => !d.empty && !d.isFuture);
    const present = realDays.filter((d) => d.status === 'Present').length;
    const wfh = realDays.filter((d) => d.status === 'WFH').length;
    const leave = realDays.filter((d) => d.status === 'Leave').length;
    const halfDay = realDays.filter((d) => d.status === 'HalfDay').length;
    const pendingRegs = realDays.filter((d) => d.status === 'PendingReg').length;
    const absentOrMissing = realDays.filter((d) => d.status === 'Absent').length;
    const late = realDays.filter((d) => Boolean(d.record?.isLate)).length;
    const attentionCount = actionableDays.length;
    const weekOffs = realDays.filter((d) => d.status === 'WeekOff').length;
    const holidayCount = realDays.filter((d) => d.status === 'Holiday').length;

    return { present, wfh, leave, halfDay, pendingRegs, absentOrMissing, late, attentionCount, weekOffs, holidayCount };
  }, [calendarDays, actionableDays]);

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

  // ---- Raising a regularization (single or bulk month) ----------------------
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());

  const [raiseOpen, setRaiseOpen] = useState(false);
  const [raiseDates, setRaiseDates] = useState<string[]>([]);
  const [raiseStatus, setRaiseStatus] = useState<AttendanceStatus>('Present');
  const [raiseReason, setRaiseReason] = useState('');
  const [autoApproveChecked, setAutoApproveChecked] = useState(true);

  const canAutoApprove = isAdmin || isManager || profile?.role === 'hr' || profile?.role === 'admin';

  // Date options for single-date select: working past days in currently viewed month
  const raiseDateOptions = useMemo(() => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const totalDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const today = todayIso();
    const dates: string[] = [];
    for (let d = 1; d <= totalDays; d++) {
      const iso = `${calendarMonth}-${String(d).padStart(2, '0')}`;
      if (iso <= today && !isWeekOffFor(targetEmployee, iso)) {
        dates.push(iso);
      }
    }
    return dates
      .sort((a, b) => b.localeCompare(a))
      .map((date) => ({ label: `${formatDate(date)} · ${formatWeekdayLong(date)}`, value: date }));
  }, [calendarMonth, targetEmployee]);

  function openRaise() {
    if (actionableDays.length > 0) {
      openBulkRaiseAllMonth();
    } else {
      openRaiseForDate(todayIso());
    }
  }

  function openBulkRaiseAllMonth() {
    if (actionableDays.length === 0) return;
    setRaiseDates(actionableDays);
    setRaiseStatus('Present');
    setRaiseReason('Monthly attendance reconciliation before payroll cutoff');
    setAutoApproveChecked(canAutoApprove);
    setRaiseOpen(true);
  }

  function openBulkRaiseSelected() {
    if (selectedDates.size === 0) return;
    setRaiseDates(Array.from(selectedDates).sort());
    setRaiseStatus('Present');
    setRaiseReason('Monthly attendance reconciliation before payroll cutoff');
    setAutoApproveChecked(canAutoApprove);
    setRaiseOpen(true);
  }

  function openRaiseForDate(date: string) {
    setRaiseDates([date]);
    setRaiseStatus('Present');
    setRaiseReason('');
    setAutoApproveChecked(canAutoApprove);
    setRaiseOpen(true);
  }

  function toggleDateSelection(date: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function toggleSelectAllActionable() {
    if (selectedDates.size === actionableDays.length) {
      setSelectedDates(new Set());
    } else {
      setSelectedDates(new Set(actionableDays));
    }
  }

  function submitRaise() {
    if (raiseDates.length === 0 || !raiseReason.trim()) return;
    addBulkRegularizationRequests({
      employeeId: targetId,
      dates: raiseDates,
      reason: raiseReason.trim(),
      requestedStatus: raiseStatus,
      autoApprove: canAutoApprove && autoApproveChecked,
    });
    setRaiseOpen(false);
    setIsBulkMode(false);
    setSelectedDates(new Set());
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

          {/* Status Badge Legend Bar - Responsive & Minimal */}
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap px-3 sm:px-4 py-2 bg-white border border-ink-200 text-[11px] sm:text-xs text-ink-600 shadow-2xs rounded-lg">
            <span className="font-semibold text-ink-800 uppercase tracking-wider text-[10px]">Legend:</span>
            <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" /><span>Present</span></div>
            <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500 shrink-0" /><span>WFH</span></div>
            <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" /><span>Pending / Late</span></div>
            <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" /><span>Absent / LOP</span></div>
            <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-purple-500 shrink-0" /><span>Leave</span></div>
            <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ink-400 shrink-0" /><span>Week Off</span></div>
            <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-teal-500 shrink-0" /><span>Holiday</span></div>
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
                  {monthTitle} · {monthStats.present} present · {monthStats.wfh} WFH · {monthStats.leave} leaves · {monthStats.weekOffs} week-offs{monthStats.holidayCount > 0 ? ` · ${monthStats.holidayCount} holiday${monthStats.holidayCount > 1 ? 's' : ''}` : ''}
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
            {actionableDays.length > 0 && viewMode === 'calendar' && (
              <div className="mx-3 sm:mx-5 mt-4 p-3 sm:p-4 bg-rose-50/95 border border-rose-300 rounded-xl text-sm shadow-2xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-start sm:items-center gap-2.5">
                  <span className="h-3 w-3 rounded-full bg-rose-600 shrink-0 mt-0.5 sm:mt-0 animate-pulse" />
                  <div>
                    <span className="font-bold text-rose-900">
                      {actionableDays.length} Red Flag{actionableDays.length > 1 ? 's' : ''} in {monthTitle}:
                    </span>{' '}
                    <span className="text-rose-700 text-xs sm:text-sm">
                      {monthStats.absentOrMissing > 0 ? `${monthStats.absentOrMissing} missing punch / absent day${monthStats.absentOrMissing > 1 ? 's' : ''}` : ''}
                      {monthStats.absentOrMissing > 0 && monthStats.late > 0 ? ' · ' : ''}
                      {monthStats.late > 0 ? `${monthStats.late} late arrival${monthStats.late > 1 ? 's' : ''}` : ''}
                      . Unregularized absences result in Loss of Pay (LOP) during payroll.
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={openBulkRaiseAllMonth}
                    className="bg-rose-600 hover:bg-rose-700 border-none text-white shadow-sm text-xs font-semibold"
                  >
                    <Sparkles size={14} className="mr-1" /> Bulk Regularize Month ({actionableDays.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setIsBulkMode(!isBulkMode);
                      if (!isBulkMode) {
                        setSelectedDates(new Set(actionableDays));
                      }
                    }}
                    className={cn(
                      'text-xs font-medium',
                      isBulkMode ? 'bg-brand-100 text-brand-800 border-brand-300' : '',
                    )}
                  >
                    <Layers size={14} className="mr-1" /> {isBulkMode ? 'Exit Select Mode' : 'Select Days'}
                  </Button>
                </div>
              </div>
            )}

            {/* Bulk Selection Active Action Bar */}
            {isBulkMode && viewMode === 'calendar' && (
              <div className="mx-3 sm:mx-5 mt-3 p-2.5 sm:p-3 bg-brand-50 border border-brand-200 rounded-lg flex items-center justify-between gap-2 flex-wrap text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold text-brand-900">
                    {selectedDates.size} of {actionableDays.length} days selected
                  </span>
                  <button
                    type="button"
                    onClick={toggleSelectAllActionable}
                    className="text-brand-700 hover:underline font-medium cursor-pointer"
                  >
                    {selectedDates.size === actionableDays.length ? 'Deselect All' : `Select All (${actionableDays.length})`}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={selectedDates.size === 0}
                    onClick={openBulkRaiseSelected}
                    className="text-xs py-1 px-3 bg-brand-600 hover:bg-brand-700 text-white"
                  >
                    Regularize Selected ({selectedDates.size})
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsBulkMode(false)}
                    className="text-xs py-1 px-2 text-ink-500"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {viewMode === 'calendar' ? (
              <div className="p-2.5 sm:p-5">
                {/* 7-day header */}
                <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1.5 sm:mb-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayName, idx) => (
                    <div
                      key={dayName}
                      className={cn(
                        'py-1.5 sm:py-2 text-center text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase rounded-md',
                        idx >= 5 ? 'text-ink-400 bg-ink-50/60' : 'text-ink-600 bg-ink-100/50',
                      )}
                    >
                      {dayName}
                    </div>
                  ))}
                </div>

                {/* Grid cells - Minimal & zero-overlap on mobile */}
                <div className="grid grid-cols-7 gap-1 sm:gap-2">
                  {calendarDays.map((day) => {
                    if (day.empty) {
                      return (
                        <div
                          key={day.key}
                          className="min-h-[52px] sm:min-h-[105px] rounded-lg sm:rounded-xl bg-ink-50/20 border border-transparent"
                        />
                      );
                    }

                    const isRed = day.isAttentionItem;
                    const isPending = day.isPendingReg;
                    const isGreen = day.status === 'Present';
                    const isBlue = day.status === 'WFH';
                    const isPurple = day.status === 'Leave';
                    const isWeekOff = day.status === 'WeekOff';
                    const isHoliday = day.status === 'Holiday';
                    const isSelected = selectedDates.has(day.date);

                    return (
                      <div
                        key={day.key}
                        onClick={() => {
                          if (isBulkMode && day.isActionable) {
                            toggleDateSelection(day.date);
                          } else if (!isBulkMode && (day.isActionable || isPending)) {
                            openRaiseForDate(day.date);
                          }
                        }}
                        className={cn(
                          'min-h-[56px] sm:min-h-[105px] rounded-lg sm:rounded-xl border p-1 sm:p-2.5 flex flex-col justify-between transition-all relative select-none shadow-2xs',
                          (day.isActionable || isPending) && 'cursor-pointer active:scale-[0.98]',
                          isSelected && 'ring-2 ring-brand-600 bg-brand-50/95 border-brand-500 shadow-sm',
                          !isSelected && day.isToday && 'ring-2 ring-brand-500 shadow-sm border-brand-400',
                          !isSelected && isRed && 'border-rose-300 sm:border-2 sm:border-rose-400/90 bg-rose-50/80 hover:bg-rose-100/90 text-rose-950',
                          !isSelected && isPending && 'border-amber-300 sm:border-2 sm:border-amber-400/90 bg-amber-50/75 hover:bg-amber-100/80 text-amber-950',
                          !isSelected && isGreen && 'border-emerald-200/90 bg-emerald-50/60 hover:bg-emerald-100/60 text-emerald-950',
                          !isSelected && isBlue && 'border-sky-200/90 bg-sky-50/60 hover:bg-sky-100/60 text-sky-950',
                          !isSelected && isPurple && 'border-purple-200/90 bg-purple-50/60 hover:bg-purple-100/60 text-purple-950',
                          !isSelected && isWeekOff && 'border-dashed border-ink-200/90 bg-ink-50/50 hover:bg-ink-100/40 text-ink-600',
                          !isSelected && isHoliday && 'border-teal-300/90 bg-teal-50/70 hover:bg-teal-100/70 text-teal-950',
                          !isSelected && day.isFuture && 'border-ink-100 bg-white/40 text-ink-300 pointer-events-none',
                        )}
                      >
                        {/* Day number & bulk checkbox / Today dot */}
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              'text-[11px] sm:text-xs font-bold font-mono',
                              day.isToday ? 'text-brand-700 font-extrabold' : isRed ? 'text-rose-900 font-extrabold' : isPending ? 'text-amber-900' : isHoliday ? 'text-teal-900' : 'text-ink-800',
                            )}
                          >
                            {day.dayNum}
                          </span>

                          {isBulkMode && day.isActionable ? (
                            <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex items-center justify-center">
                              {isSelected ? (
                                <span className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded bg-brand-600 text-white flex items-center justify-center text-[10px] font-bold">
                                  ✓
                                </span>
                              ) : (
                                <span className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded border border-ink-300 bg-white" />
                              )}
                            </div>
                          ) : day.isToday ? (
                            <>
                              <span className="sm:hidden h-1.5 w-1.5 rounded-full bg-brand-600" />
                              <span className="hidden sm:inline-block text-[9px] font-bold bg-brand-600 text-white px-1.5 py-0.5 rounded-full leading-none shadow-2xs">
                                Today
                              </span>
                            </>
                          ) : null}
                        </div>

                        {/* Minimal dot for mobile; clean pill badge on desktop */}
                        <div className="my-0.5 sm:my-1 flex items-center justify-center sm:justify-start">
                          {isGreen && (
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 shadow-xs" />
                              <span className="hidden sm:inline-block text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-1.5 py-0.5 rounded border border-emerald-200/90 leading-none">
                                Present
                              </span>
                            </div>
                          )}

                          {isBlue && (
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-sky-500 shrink-0 shadow-xs" />
                              <span className="hidden sm:inline-block text-[10px] font-bold text-sky-800 bg-sky-100/90 px-1.5 py-0.5 rounded border border-sky-200/90 leading-none">
                                WFH
                              </span>
                            </div>
                          )}

                          {isPending && (
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0 shadow-xs animate-pulse" />
                              <span className="hidden sm:inline-block text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 leading-none">
                                Pending
                              </span>
                            </div>
                          )}

                          {isPurple && (
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-purple-500 shrink-0 shadow-xs" />
                              <span className="hidden sm:inline-block text-[10px] font-bold text-purple-800 bg-purple-100/90 px-1.5 py-0.5 rounded border border-purple-200/90 leading-none">
                                Leave
                              </span>
                            </div>
                          )}

                          {isWeekOff && (
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-ink-400 shrink-0" />
                              <span className="hidden sm:inline-block text-[10px] font-medium text-ink-600 bg-ink-100/90 px-1.5 py-0.5 rounded border border-ink-200/90 leading-none">
                                Off
                              </span>
                            </div>
                          )}

                          {isHoliday && (
                            <div className="flex items-center gap-1.5" title={day.holiday?.name}>
                              <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0 shadow-xs" />
                              <span className="hidden sm:inline-block text-[10px] font-bold text-teal-800 bg-teal-100/90 px-1.5 py-0.5 rounded border border-teal-200/90 leading-none truncate max-w-[85px]">
                                {day.holiday?.name ?? 'Holiday'}
                              </span>
                            </div>
                          )}

                          {isRed && (
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-rose-600 shrink-0 shadow-xs animate-pulse" />
                              <span className="hidden sm:inline-block text-[10px] font-black text-rose-900 bg-rose-200/90 px-1.5 py-0.5 rounded border border-rose-300 leading-none uppercase tracking-wide">
                                {day.record?.isLate ? 'Late' : 'Absent'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Bottom: Desktop-only details (Zero overlap on mobile) */}
                        <div className="hidden sm:flex mt-auto pt-1 border-t border-ink-100/60 items-center justify-between text-[10px]">
                          {day.record ? (
                            <>
                              <span className="text-ink-500 font-mono truncate">
                                {day.record.checkIn ? `${day.record.checkIn}` : '—'}
                              </span>
                              <span className="font-bold text-ink-700 font-mono">
                                {day.record.workedHours > 0 ? `${day.record.workedHours.toFixed(1)}h` : ''}
                              </span>
                            </>
                          ) : isPending ? (
                            <span className="text-amber-700 font-medium text-[10px] truncate">In review</span>
                          ) : isRed ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openRaiseForDate(day.date);
                              }}
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

      {/* Regularization Modal - Single & Bulk */}
      <Modal
        open={raiseOpen}
        onClose={() => setRaiseOpen(false)}
        title={raiseDates.length > 1 ? `Bulk Regularize Month (${raiseDates.length} Days)` : 'Request Regularization'}
        subtitle={
          targetEmployee
            ? `${raiseDates.length > 1 ? `Regularize ${raiseDates.length} days` : 'Ask for a day to be corrected'} on ${targetEmployee.fullName}’s record`
            : 'Ask for attendance to be corrected'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setRaiseOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={submitRaise}
              disabled={raiseDates.length === 0 || !raiseReason.trim()}
              className="bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
            >
              {raiseDates.length > 1 ? `Regularize All ${raiseDates.length} Days` : 'Submit Request'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Selected Dates Display */}
          {raiseDates.length > 1 ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-ink-700">
                  Selected Dates ({raiseDates.length})
                </label>
                {actionableDays.length > raiseDates.length && (
                  <button
                    type="button"
                    onClick={() => setRaiseDates(actionableDays)}
                    className="text-xs text-brand-600 hover:underline font-medium cursor-pointer"
                  >
                    Select All ({actionableDays.length})
                  </button>
                )}
              </div>
              <div className="max-h-32 overflow-y-auto p-2 bg-ink-50/80 border border-ink-200 rounded-lg flex flex-wrap gap-1.5">
                {raiseDates.map((date) => (
                  <span
                    key={date}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono bg-white border border-ink-200 text-ink-800 shadow-2xs"
                  >
                    <span>{formatDateShort(date)} ({formatWeekdayShort(date)})</span>
                    <button
                      type="button"
                      onClick={() => setRaiseDates((prev) => prev.filter((d) => d !== date))}
                      className="text-ink-400 hover:text-rose-600 ml-0.5 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Date</label>
              <Select
                value={raiseDates[0] ?? ''}
                onChange={(val) => setRaiseDates([val])}
                options={raiseDateOptions}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Requested Status</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['Present', 'Work From Home', 'Half Day', 'On Leave'] as AttendanceStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setRaiseStatus(st)}
                  className={cn(
                    'py-2 px-2.5 rounded-lg text-xs font-semibold border transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer',
                    raiseStatus === st
                      ? 'border-brand-600 bg-brand-50 text-brand-900 shadow-2xs ring-1 ring-brand-500'
                      : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
                  )}
                >
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      st === 'Present' && 'bg-emerald-500',
                      st === 'Work From Home' && 'bg-sky-500',
                      st === 'Half Day' && 'bg-amber-500',
                      st === 'On Leave' && 'bg-purple-500',
                    )}
                  />
                  <span>{st === 'Work From Home' ? 'WFH' : st}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-ink-700">Reason</label>
              <span className="text-[11px] text-ink-400">Quick presets:</span>
            </div>
            {/* Quick preset chips */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[
                'Attendance reconciliation before payroll cutoff',
                'Missed biometric punch / system sync issue',
                'On-site client meeting / field work',
                'Approved work-from-home arrangement',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setRaiseReason(preset)}
                  className="text-[11px] px-2 py-0.5 rounded bg-ink-100/80 hover:bg-ink-200 text-ink-700 transition-colors cursor-pointer"
                >
                  + {preset.split(' / ')[0]}
                </button>
              ))}
            </div>
            <textarea
              className="input w-full h-20 resize-none text-xs sm:text-sm"
              placeholder="Why should this day be regularized?"
              value={raiseReason}
              onChange={(event) => setRaiseReason(event.target.value)}
            />
            <p className="text-xs text-ink-400 mt-1">A valid reason is required for audit logs.</p>
          </div>

          {/* Admin / HR auto-approve toggle */}
          {canAutoApprove && (
            <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-lg flex items-start gap-2.5">
              <input
                type="checkbox"
                id="auto-approve-toggle"
                checked={autoApproveChecked}
                onChange={(e) => setAutoApproveChecked(e.target.checked)}
                className="h-4 w-4 mt-0.5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <label htmlFor="auto-approve-toggle" className="text-xs text-emerald-950 cursor-pointer">
                <span className="font-bold block text-emerald-900">
                  Directly apply & approve for payroll (Zero LOP)
                </span>
                <span className="text-emerald-700">
                  Instantly updates attendance records so payroll calculation does not deduct loss-of-pay.
                </span>
              </label>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
