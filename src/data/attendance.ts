import type { AttendanceRecord, AttendanceStatus, Employee } from '@/types';
import { isWeekOffFor, getEmployee } from '@/data/employees';
import { isMockDataCleared } from '@/lib/mockDataFlag';
import { todayDate, todayIso, isoDaysAgo, currentClockTime, nowInstant } from '@/lib/today';
import { persistentCollection } from '@/data/persistence';
import { clockMinutes } from '@/data/shiftRules';
import { isLateFor, shiftCaptionFor } from '@/data/shifts';

// Work week: Mon 2026-06-08 .. Fri 2026-06-12  (today = Wed 2026-06-10)
export const WEEK_DATES = [
  '2026-06-08', // Mon
  '2026-06-09', // Tue
  '2026-06-10', // Wed (today)
  '2026-06-11', // Thu
  '2026-06-12', // Fri
];

// Employee IDs (emp-001 .. emp-035, derived from employees.ts seed order — 35 employees)
const EMP_IDS = [
  'emp-001', 'emp-002', 'emp-003', 'emp-004', 'emp-005', 'emp-006',
  'emp-007', 'emp-008', 'emp-009', 'emp-010', 'emp-011', 'emp-012',
  'emp-013', 'emp-014', 'emp-015', 'emp-016', 'emp-017', 'emp-018',
  'emp-019', 'emp-020', 'emp-021', 'emp-022', 'emp-023', 'emp-024',
  'emp-025', 'emp-026', 'emp-027', 'emp-028', 'emp-029', 'emp-030',
  'emp-031', 'emp-032', 'emp-033', 'emp-034', 'emp-035',
];

// `LATE_AFTER` and `DEFAULT_SHIFT` used to live here: a `'09:15'` grace and a
// `'General (09:00 – 18:00)'` caption, both platform constants, and unrelated
// to each other — the start time existed only inside the display string. So a
// night shift would have been judged against 09:15 and flagged late every
// night, silently. Both are now the organisation's, per employee: see
// data/shifts.ts and data/shiftRules.ts.

// Deterministic per-employee, per-date overrides
type Override = { status: AttendanceStatus; checkIn: string | null; checkOut: string | null; workedHours: number };

/**
 * Lateness is deliberately not carried here and is derived where the record is
 * built, because it depends on *who* the record is about: 09:20 is late on a
 * General shift and hours early on a Night one. As before, no seed row can
 * assert a lateness its own check-in contradicts — it simply cannot state one.
 */
function override(status: AttendanceStatus, checkIn: string | null, checkOut: string | null, workedHours: number): Override {
  return { status, checkIn, checkOut, workedHours };
}

const OVERRIDES: Record<string, Record<string, Override>> = {
  'emp-003': {
    '2026-06-09': override('Work From Home', '09:02', '18:10', 9.1),
    '2026-06-10': override('Work From Home', '09:15', '18:00', 8.75),
    '2026-06-11': override('Work From Home', '09:05', '17:55', 8.8),
  },
  'emp-007': {
    '2026-06-08': override('Absent', null, null, 0),
    '2026-06-09': override('Absent', null, null, 0),
  },
  'emp-009': {
    '2026-06-08': override('On Leave', null, null, 0),
    '2026-06-09': override('On Leave', null, null, 0),
    '2026-06-10': override('On Leave', null, null, 0),
  },
  'emp-011': {
    '2026-06-10': override('Half Day', '09:00', '13:30', 4.5),
    '2026-06-11': override('Work From Home', '09:10', '18:05', 8.9),
  },
  'emp-013': {
    '2026-06-08': override('On Leave', null, null, 0),
    '2026-06-09': override('On Leave', null, null, 0),
    '2026-06-10': override('On Leave', null, null, 0),
    '2026-06-11': override('On Leave', null, null, 0),
    '2026-06-12': override('On Leave', null, null, 0),
  },
  'emp-015': {
    '2026-06-08': override('Present', '09:18', '18:00', 8.7),
    '2026-06-09': override('Present', '09:22', '18:30', 9.1),
    '2026-06-10': override('Present', '09:05', '17:55', 8.8),
  },
  'emp-017': {
    '2026-06-08': override('Work From Home', '08:55', '17:50', 8.9),
    '2026-06-09': override('Work From Home', '09:00', '18:00', 9.0),
    '2026-06-10': override('Work From Home', '09:15', '18:10', 8.9),
    '2026-06-11': override('Work From Home', '09:00', '18:00', 9.0),
    '2026-06-12': override('Work From Home', '09:05', '17:55', 8.8),
  },
  'emp-020': {
    '2026-06-10': override('Present', '09:19', '18:30', 9.1),
    '2026-06-11': override('Half Day', '09:00', '13:00', 4.0),
  },
  'emp-022': {
    '2026-06-08': override('Work From Home', '09:00', '18:00', 9.0),
    '2026-06-09': override('Work From Home', '09:05', '18:05', 9.0),
    '2026-06-10': override('Work From Home', '09:00', '18:00', 9.0),
    '2026-06-11': override('Work From Home', '08:55', '17:55', 9.0),
    '2026-06-12': override('Work From Home', '09:10', '18:10', 9.0),
  },
  'emp-025': {
    '2026-06-08': override('Absent', null, null, 0),
    '2026-06-09': override('Present', '09:20', '18:00', 8.6),
  },
  'emp-028': {
    '2026-06-10': override('On Leave', null, null, 0),
    '2026-06-11': override('On Leave', null, null, 0),
  },
  'emp-032': {
    '2026-06-08': override('Present', '09:25', '18:00', 8.5),
    '2026-06-09': override('Present', '09:17', '18:10', 8.9),
    '2026-06-10': override('Present', '09:12', '18:00', 8.8),
  },
  'emp-034': {
    '2026-06-08': override('Work From Home', '09:00', '18:00', 9.0),
    '2026-06-09': override('Work From Home', '08:50', '17:50', 9.0),
  },
  'emp-035': {
    '2026-06-10': override('Absent', null, null, 0),
    '2026-06-11': override('Absent', null, null, 0),
  },
};

// Standard check-in/check-out patterns
const STANDARD_CHECKINS = ['08:55', '09:00', '09:02', '09:05', '09:08', '08:58', '09:01', '09:03'];
const STANDARD_CHECKOUTS = ['18:00', '18:05', '18:10', '17:55', '18:15', '18:00', '17:50', '18:20'];
const STANDARD_HOURS = [8.5, 8.7, 8.9, 9.0, 9.1, 8.6, 8.8, 9.2];

function getCheckInOut(empIdx: number, dateIdx: number): { checkIn: string; checkOut: string; workedHours: number } {
  const seed = (empIdx * 7 + dateIdx * 3) % STANDARD_CHECKINS.length;
  return {
    checkIn: STANDARD_CHECKINS[seed],
    checkOut: STANDARD_CHECKOUTS[seed],
    workedHours: STANDARD_HOURS[seed],
  };
}

let recId = 0;
export const attendanceRecords: AttendanceRecord[] = [];

if (!isMockDataCleared()) {
  EMP_IDS.forEach((empId, empIdx) => {
    WEEK_DATES.forEach((date, dateIdx) => {
      const ov = OVERRIDES[empId]?.[date];
      if (ov) {
        recId++;
        attendanceRecords.push({
          id: `att-${String(recId).padStart(4, '0')}`,
          employeeId: empId,
          date,
          status: ov.status,
          checkIn: ov.checkIn,
          checkOut: ov.checkOut,
          workedHours: ov.workedHours,
          shift: shiftCaptionFor(empId),
          // Derived against this employee's own hours, so an override cannot
          // claim a lateness their shift disagrees with.
          isLate: ov.checkIn ? isLateFor(empId, ov.checkIn) : false,
        });
      } else {
        // Default: Present
        recId++;
        const { checkIn, checkOut, workedHours } = getCheckInOut(empIdx, dateIdx);
        attendanceRecords.push({
          id: `att-${String(recId).padStart(4, '0')}`,
          employeeId: empId,
          date,
          status: 'Present',
          checkIn,
          checkOut,
          workedHours,
          shift: shiftCaptionFor(empId),
          // Derived here too, so the standard patterns cannot drift past the
          // threshold while still claiming to be on time.
          isLate: isLateFor(empId, checkIn),
        });
      }
    });
  });
}

// ---- Regularization Requests ------------------------------------------------
export interface RegularizationRequest {
  id: string;
  employeeId: string;
  date: string;
  reason: string;
  /**
   * What the employee is asking the day to become. `null` on entries derived
   * from the records: what someone *wants* a day changed to is an intention,
   * and only the person whose day it is has one. It used to be hardcoded to
   * 'Present' on every derived row, which read as twelve people having asked
   * for something when nobody had asked for anything.
   */
  requestedStatus: AttendanceStatus | null;
  status: 'Pending' | 'Approved' | 'Rejected';
}

/** Stable id for the request covering one employee's one day. */
export function regularizationId(employeeId: string, date: string): string {
  return `reg-${employeeId}-${date}`;
}

/**
 * The days that actually need regularizing, read off the attendance records.
 *
 * These five requests used to be invented — fixed employees, fixed dates and
 * hand-written reasons ("Biometric device malfunction at entry gate") that
 * described nothing in the data, on days whose real records said something
 * else entirely. A regularization is raised against a specific day that is
 * wrong, so the queue is derived from the days that *are* wrong.
 *
 * Two signals, both directly present on the record:
 *   - `Absent`   nothing was recorded, so there is a day to account for.
 *   - `isLate`   a check-in after the grace period, which is what an employee
 *                would ask to have excused.
 *
 * Deliberately *not* derived:
 *   - A missing record is not treated as an anomaly. Every employee is missing
 *     a record for most days, so it would generate hundreds of requests and
 *     drown the real ones.
 *   - `status` is always Pending. Whether something was once approved is an
 *     audit trail this app does not keep, and inventing one is exactly the
 *     fabrication this replaces. Real decisions are recorded in the store.
 *   - `requestedStatus` is null. Nobody has asked for anything on these days;
 *     the app noticed them. What the day should become is the approver's call,
 *     or the employee's if they raise it themselves.
 *   - The reason is generic and describes the record. A specific human reason
 *     only exists when a human types one — see `addRegularizationRequest`.
 *   - A day that is the employee's own week-off. Not working on the day you
 *     are rostered off is not an anomaly, and asking someone to account for it
 *     is asking them to justify their week-off. Week-offs differ per person
 *     (Sunday, Monday or Tuesday — see `weekOffOf`), so this cannot be a fixed
 *     "skip weekends" rule: the same Monday is a working day for most of the
 *     company and a day off for the sales and support teams.
 */
export function deriveRegularizationRequests(
  records: AttendanceRecord[] = getAttendanceRecords(),
): RegularizationRequest[] {
  return records
    .filter((record) => record.status === 'Absent' || record.isLate)
    .filter((record) => !isWeekOffFor(getEmployee(record.employeeId), record.date))
    .map((record) => ({
      id: regularizationId(record.employeeId, record.date),
      employeeId: record.employeeId,
      date: record.date,
      // Describes the record and nothing more. Naming the 09:15 grace period
      // here read as a falsehood on the records that carry `isLate` with an
      // earlier check-in than that — the flag and the threshold disagree in the
      // data, and the reason text is not the place to paper over it.
      reason:
        record.status === 'Absent'
          ? 'Marked absent — no check-in was recorded for this day.'
          : record.checkIn
            // The check-in is interpolated, so it has to be checked. A record
            // flagged late with no time rendered "Checked in at null and was
            // flagged as a late arrival." — user-visible text asserting a
            // check-in that never happened.
            ? `Checked in at ${record.checkIn} and was flagged as a late arrival.`
            : 'Flagged as a late arrival, but no check-in time was recorded.',
      requestedStatus: null,
      status: 'Pending' as const,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.employeeId.localeCompare(b.employeeId));
}

// No eager module-level snapshot: `deriveRegularizationRequests` now reads the
// attendance *store*, which is created further down, and a const evaluated here
// would both hit the temporal dead zone and freeze the queue at import time.
// Callers use `getRegularizationRequests()`.

// ---- Aggregate helpers ------------------------------------------------------
export function getRecordsByDate(date: string): AttendanceRecord[] {
  // Reads the store, so a day marked on the Attendance page shows up in the
  // dashboard's cards and the weekly chart rather than only on the page that
  // recorded it.
  return getAttendanceRecords().filter((r) => r.date === date);
}

/**
 * Mon–Fri of the week containing today. WEEK_DATES is the week the seed
 * records were written for, which is not the same thing once the app runs on
 * the real clock — surfaces that say "current week" must ask for the current
 * week, and get an empty result when nothing has been marked in it.
 */
/**
 * Monday to Sunday of the week today falls in.
 *
 * All seven days, because the working week is now six days long and *which*
 * day is missing differs per employee: week-offs are rostered across Sunday,
 * Monday and Tuesday (see `weekOffOf` in data/employees.ts). A fixed Mon–Fri
 * window could not show a Saturday — which everyone now works — nor a Sunday,
 * which everyone whose week-off is Monday or Tuesday works.
 *
 * So this is a calendar week, not a working week. Ask
 * `getWorkingWeekDatesFor(employee)` for one person's working days.
 */
export function getCurrentWeekDates(): string[] {
  const base = todayDate(); // UTC midnight, matching how record dates parse
  const sinceMonday = (base.getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() - sinceMonday + offset);
    return day.toISOString().slice(0, 10);
  });
}

/** This week's dates that `employee` is rostered to work — the calendar week minus their week-off. */
export function getWorkingWeekDatesFor(employee: Pick<Employee, 'weekOff'> | null | undefined): string[] {
  return getCurrentWeekDates().filter((date) => !isWeekOffFor(employee, date));
}

export function getWeekSummary(): Array<{ date: string; Present: number; 'Work From Home': number; 'On Leave': number; Absent: number; 'Half Day': number }> {
  return getCurrentWeekDates().map((date) => {
    const records = getRecordsByDate(date);
    return {
      date,
      Present: records.filter((r) => r.status === 'Present').length,
      'Work From Home': records.filter((r) => r.status === 'Work From Home').length,
      'On Leave': records.filter((r) => r.status === 'On Leave').length,
      Absent: records.filter((r) => r.status === 'Absent').length,
      'Half Day': records.filter((r) => r.status === 'Half Day').length,
    };
  });
}

// ---- Persistence ------------------------------------------------------------
// `attendanceRecords` and `regularizationRequests` above are the seed. Marking
// attendance or deciding a regularization used to change React state only, so
// the next refresh silently threw the decision away.

const attendanceStore = persistentCollection<AttendanceRecord>(
  'modcon.hr.attendanceRecords',
  'modcon-hr-attendance-changed',
  () => attendanceRecords,
);

export const ATTENDANCE_CHANGED_EVENT = attendanceStore.changedEvent;
export const getAttendanceRecords = () => attendanceStore.get();
export const saveAttendanceRecords = (records: AttendanceRecord[]) => attendanceStore.save(records);

/**
 * The store holds only what a *person* contributed — requests they raised and
 * decisions they made. Everything else is derived on read.
 *
 * It used to hold the whole queue, seeded from the derivation. Because
 * `persistentCollection.get()` returns the stored value in preference to the
 * seed, the first write of any kind froze the list: approve one request and no
 * absence marked afterwards ever appeared again. Deriving on read and layering
 * these overrides on top means a day marked Absent this afternoon shows up, and
 * a decision made this morning is still there.
 *
 * The key is deliberately new. The old one holds a frozen snapshot in the old
 * shape — including the five invented requests this all replaced — and reading
 * it back would resurrect exactly what was removed.
 */
const regularizationStore = persistentCollection<RegularizationRequest>(
  'modcon.hr.regularizationOverrides',
  'modcon-hr-regularizations-changed',
  () => [],
);

export const REGULARIZATIONS_CHANGED_EVENT = regularizationStore.changedEvent;

export function getRegularizationRequests(): RegularizationRequest[] {
  const overrides = regularizationStore.get();
  const byId = new Map(overrides.map((override) => [override.id, override]));

  const derived = deriveRegularizationRequests();
  const derivedIds = new Set(derived.map((entry) => entry.id));

  // A derived day a person has touched shows their version; the rest show the
  // record's. Overrides whose day is no longer flagged — because approving the
  // request corrected it — stay, so the decision does not vanish from history.
  return [
    ...overrides.filter((override) => !derivedIds.has(override.id)),
    ...derived.map((entry) => byId.get(entry.id) ?? entry),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.employeeId.localeCompare(b.employeeId));
}

/**
 * Raise a regularization against one day, with a reason the employee typed.
 *
 * Keyed on employee + date, so re-raising the same day replaces the request
 * rather than queueing a second one for the same approver to decide twice —
 * including replacing the derived request for a day the records already flagged.
 */
export function addRegularizationRequest(input: {
  employeeId: string;
  date: string;
  reason: string;
  requestedStatus: AttendanceStatus;
}): RegularizationRequest {
  const request: RegularizationRequest = {
    id: regularizationId(input.employeeId, input.date),
    employeeId: input.employeeId,
    date: input.date,
    reason: input.reason,
    requestedStatus: input.requestedStatus,
    status: 'Pending',
  };
  writeOverride(request);
  return request;
}

/** Replace this id's override, keeping the rest. */
function writeOverride(request: RegularizationRequest) {
  regularizationStore.save([
    request,
    ...regularizationStore.get().filter((existing) => existing.id !== request.id),
  ]);
}

/**
 * Approve or reject one request.
 *
 * Approving a request that asks for a status **moves the day to it**. Recording
 * the decision without touching the record left the approval meaning nothing:
 * the queue said Approved while the attendance it was about still said Absent.
 *
 * Times are left exactly as they were. A day corrected to Work From Home has a
 * status somebody vouched for and check-in/out times nobody ever recorded, and
 * filling those in with a plausible 09:00–18:00 would be inventing the evidence
 * for the correction. `isLate` is cleared, because that flag is the thing being
 * excused.
 *
 * Entries the app flagged carry no requested status, so approving one records
 * the decision and changes no data — there is nothing it asked to become.
 */
export function decideRegularization(id: string, status: 'Approved' | 'Rejected') {
  const current = getRegularizationRequests().find((request) => request.id === id);
  if (!current) return;

  if (status === 'Approved' && current.requestedStatus) {
    applyRequestedStatus(current.employeeId, current.date, current.requestedStatus);
  }
  writeOverride({ ...current, status });
}

function applyRequestedStatus(employeeId: string, date: string, status: AttendanceStatus) {
  const records = getAttendanceRecords();
  const existing = records.find(
    (record) => record.employeeId === employeeId && record.date === date,
  );

  const corrected: AttendanceRecord = existing
    ? { ...existing, status, isLate: false }
    : {
      id: `att-reg-${employeeId}-${date}`,
      employeeId,
      date,
      status,
      checkIn: null,
      checkOut: null,
      workedHours: 0,
      shift: shiftCaptionFor(employeeId),
      isLate: false,
    };

  saveAttendanceRecords([
    ...records.filter((record) => !(record.employeeId === employeeId && record.date === date)),
    corrected,
  ]);
}

// ---- Check-in / check-out ---------------------------------------------------

/**
 * Hours between two instants, to one decimal, never negative.
 *
 * Measured from the stored instants rather than differencing the `HH:mm`
 * strings, so a 09:00:50 → 18:00:10 day is 8.99h rather than the flat 9.0 that
 * rounding both ends would produce.
 */
function hoursBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round((ms / 3_600_000) * 100) / 100);
}

/**
 * Hours between two `HH:mm` clock times on the same day.
 *
 * The fallback for a record with no captured instants. Less precise than
 * measuring, but it describes the times the record actually carries — which is
 * the point: overwriting the check-out while keeping hours computed from a
 * check-out that no longer exists leaves the record contradicting itself.
 */
function hoursBetweenClockTimes(start: string, end: string): number {
  const from = clockMinutes(start);
  const to = clockMinutes(end);
  if (from === null || to === null) return 0;
  return Math.max(0, Math.round(((to - from) / 60) * 100) / 100);
}

/** Today's record for this employee, if they have one. */
export function getTodayRecord(employeeId: string): AttendanceRecord | undefined {
  return getAttendanceRecordFor(employeeId, todayIso());
}

/**
 * A shift this employee has started and not closed.
 *
 * Check-out used to key on `todayIso()` alone, so a shift begun at 23:50 could
 * never be closed: by 00:05 the date had rolled, there was no record for the
 * new day, and the old one stayed open forever at 0h — still flagged as a late
 * arrival nobody could resolve.
 *
 * Yesterday is as far back as this looks. A day left open a week ago is not
 * something to silently close with today's clock; it is what regularization is
 * for.
 */
export function getOpenShift(employeeId: string): AttendanceRecord | undefined {
  const eligible = new Set([todayIso(), isoDaysAgo(1)]);
  return getAttendanceRecords()
    .filter(
      (record) =>
        record.employeeId === employeeId &&
        eligible.has(record.date) &&
        record.checkIn &&
        !record.checkOut,
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/**
 * The record the check-in/check-out panel is about: today's, or a shift still
 * open from yesterday.
 */
export function getActiveRecord(employeeId: string): AttendanceRecord | undefined {
  return getTodayRecord(employeeId) ?? getOpenShift(employeeId);
}

/**
 * Stamp a check-in for today.
 *
 * The time is read from the app clock at the moment of the event, not typed by
 * anyone, which is the point: it is evidence rather than an assertion. Status
 * and lateness are derived from it, so a late arrival flows straight into the
 * regularization queue with no separate step.
 *
 * Checking in again on a day already checked in is a no-op — the first stamp is
 * the one that happened, and overwriting it would quietly erase a late arrival.
 */
export function recordCheckIn(employeeId: string): AttendanceRecord {
  const date = todayIso();
  const existing = getAttendanceRecordFor(employeeId, date);
  if (existing?.checkIn) return existing;

  const at = nowInstant();
  const time = currentClockTime();

  const record: AttendanceRecord = {
    id: existing?.id ?? `att-checkin-${employeeId}-${date}`,
    employeeId,
    date,
    status: 'Present',
    checkIn: time,
    checkInAt: at,
    checkOut: existing?.checkOut ?? null,
    checkOutAt: existing?.checkOutAt,
    workedHours: 0,
    // The caption is stamped from the shift as it stands now and then left
    // alone: retiming a shift later applies to days judged from then on, so a
    // record goes on saying what was true on the day.
    shift: existing?.shift ?? shiftCaptionFor(employeeId),
    isLate: isLateFor(employeeId, time),
  };

  writeRecord(record);
  return record;
}

/**
 * Stamp a check-out for today and settle the hours.
 *
 * Returns undefined when there is nothing to close — checking out of a day you
 * never checked into would invent a start time for the elapsed hours.
 */
export function recordCheckOut(employeeId: string): AttendanceRecord | undefined {
  // Today's record, or yesterday's shift if it ran past midnight. Deliberately
  // not `getOpenShift` alone: that excludes closed days, which would report an
  // already-finished day as "nothing to close" rather than as a no-op.
  const existing = getActiveRecord(employeeId);
  if (!existing?.checkIn) return undefined;
  // Already closed is a no-op, matching check-in. Without this, a second call
  // moved the check-out later and recomputed the hours from it — two tabs were
  // enough to rewrite a finished day.
  if (existing.checkOut) return existing;

  const at = nowInstant();
  const time = currentClockTime();
  const record: AttendanceRecord = {
    ...existing,
    checkOut: time,
    checkOutAt: at,
    // Measured from the instants when the check-in was captured. Otherwise
    // computed from the two clock times, because the check-out has just been
    // overwritten — keeping the old hours would leave the record stating a
    // duration its own times contradict.
    workedHours: existing.checkInAt
      ? hoursBetween(existing.checkInAt, at)
      : hoursBetweenClockTimes(existing.checkIn, time),
  };

  writeRecord(record);
  return record;
}

function writeRecord(record: AttendanceRecord) {
  saveAttendanceRecords([
    ...getAttendanceRecords().filter(
      (item) => !(item.employeeId === record.employeeId && item.date === record.date),
    ),
    record,
  ]);
}

/**
 * The attendance record a regularization is about, if there still is one.
 *
 * Reads the store rather than the seed, so a day re-marked on the Attendance
 * page shows its new value here instead of the one that raised the request.
 */
export function getAttendanceRecordFor(
  employeeId: string,
  date: string,
): AttendanceRecord | undefined {
  return getAttendanceRecords().find(
    (record) => record.employeeId === employeeId && record.date === date,
  );
}

/** The requests raised for one employee, newest day first. */
export function getRegularizationRequestsFor(employeeId: string): RegularizationRequest[] {
  return getRegularizationRequests()
    .filter((request) => request.employeeId === employeeId)
    .sort((a, b) => b.date.localeCompare(a.date));
}
