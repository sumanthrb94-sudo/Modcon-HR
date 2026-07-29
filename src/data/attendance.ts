import type { AttendanceRecord, AttendanceStatus } from '@/types';
import { isMockDataCleared } from '@/lib/mockDataFlag';
import { todayDate } from '@/lib/today';
import { persistentCollection } from '@/data/persistence';

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

// Deterministic per-employee, per-date overrides
type Override = { status: AttendanceStatus; checkIn: string | null; checkOut: string | null; workedHours: number; isLate: boolean };

function override(status: AttendanceStatus, checkIn: string | null, checkOut: string | null, workedHours: number, isLate = false): Override {
  return { status, checkIn, checkOut, workedHours, isLate };
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
    '2026-06-08': override('Present', '09:18', '18:00', 8.7, true),
    '2026-06-09': override('Present', '09:22', '18:30', 9.1, true),
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
    '2026-06-10': override('Present', '09:19', '18:30', 9.1, true),
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
    '2026-06-09': override('Present', '09:20', '18:00', 8.6, true),
  },
  'emp-028': {
    '2026-06-10': override('On Leave', null, null, 0),
    '2026-06-11': override('On Leave', null, null, 0),
  },
  'emp-032': {
    '2026-06-08': override('Present', '09:25', '18:00', 8.5, true),
    '2026-06-09': override('Present', '09:17', '18:10', 8.9, true),
    '2026-06-10': override('Present', '09:12', '18:00', 8.8, true),
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
          shift: 'General (09:00 – 18:00)',
          isLate: ov.isLate,
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
          shift: 'General (09:00 – 18:00)',
          isLate: false,
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
 */
export function deriveRegularizationRequests(
  records: AttendanceRecord[] = getAttendanceRecords(),
): RegularizationRequest[] {
  return records
    .filter((record) => record.status === 'Absent' || record.isLate)
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
          : `Checked in at ${record.checkIn} and was flagged as a late arrival.`,
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
export function getCurrentWeekDates(): string[] {
  const base = todayDate(); // UTC midnight, matching how record dates parse
  const sinceMonday = (base.getUTCDay() + 6) % 7;
  return Array.from({ length: 5 }, (_, offset) => {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() - sinceMonday + offset);
    return day.toISOString().slice(0, 10);
  });
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
      shift: 'General (09:00 – 18:00)',
      isLate: false,
    };

  saveAttendanceRecords([
    ...records.filter((record) => !(record.employeeId === employeeId && record.date === date)),
    corrected,
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
