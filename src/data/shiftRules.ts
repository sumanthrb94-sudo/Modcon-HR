// ===========================================================================
// The arithmetic of a shift: what it is called, when it starts, and whether a
// given arrival counts as late against it.
//
// This module imports nothing, and must go on importing nothing. It is the
// half of the shift feature that can be unit tested (`npm run test:unit`)
// under node's strip-types runner, which resolves neither the `@/*` alias nor
// firebase. Everything that reaches for storage — the org_settings registry,
// the localStorage cache, the change event — lives in data/shifts.ts and is
// covered end to end instead.
//
// See docs/superpowers/specs/2026-08-24-shift-timings-design.md.
// ===========================================================================

/** A set of working hours the organisation has declared. */
export interface Shift {
  /** Stable slug. Assignment is by id, so renaming a shift moves its people. */
  readonly id: string;
  readonly name: string;
  /** `HH:mm`. */
  readonly start: string;
  /** `HH:mm`. Earlier than `start` means the shift runs past midnight. */
  readonly end: string;
  /** Minutes after `start` that are still on time. */
  readonly graceMinutes: number;
}

/**
 * The organisation's shifts and which one people fall on by default.
 *
 * `defaultShiftId` is a field rather than a flag on each shift so that two
 * defaults are not representable.
 */
export interface ShiftConfig {
  readonly shifts: Shift[];
  readonly defaultShiftId: string | null;
}

/** employee id → shift id. Sparse: absent means "the organisation's default". */
export type ShiftAssignments = Record<string, string>;

const MINUTES_PER_DAY = 1440;

/**
 * `HH:mm` as minutes past midnight, or null if it is not a clock time.
 *
 * Moved here from data/attendance.ts, which held the only copy and the only
 * caller. Comparison is done on these numbers and never on the strings:
 * `'9:05' > '09:15'` is true lexicographically, which would have marked an
 * early arrival late, silently, and only for times before 10:00.
 */
export function clockMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** True when this shift runs past midnight into the next day. */
export function crossesMidnight(shift: Shift): boolean {
  const start = clockMinutes(shift.start);
  const end = clockMinutes(shift.end);
  if (start === null || end === null) return false;
  return end < start;
}

/**
 * True when this arrival counts as late against this shift.
 *
 * Not late when the shift is null: an organisation that has declared no hours
 * has nothing to judge anybody against, and inventing a 09:00 would tell a
 * company its people are late by a rule nobody there set.
 *
 * Not late when the time is unreadable: flagging someone on the strength of a
 * value we could not parse is an assertion about a day we know nothing about.
 *
 * The grace period is inclusive — arriving exactly on it is on time.
 *
 * A shift that crosses midnight needs the arrival carried into the next day
 * before it can be compared, and getting this wrong is silent. A Night shift
 * starting 22:00 with a 15-minute grace is late after 1335 minutes past
 * midnight; an 00:30 arrival reads as 30, sails under the threshold, and
 * reports on time for somebody two and a half hours into their shift. So an
 * arrival falling before such a shift's `end` belongs to the shift that began
 * the previous evening, and is measured from there.
 *
 * An arrival outside the shift's hours altogether — 14:00 against a
 * 22:00–06:00 shift — is not an arrival this shift can judge, and is not
 * called late.
 */
export function isLateForShift(shift: Shift | null | undefined, checkIn: string | null | undefined): boolean {
  if (!shift) return false;
  const raw = clockMinutes(checkIn);
  const start = clockMinutes(shift.start);
  const end = clockMinutes(shift.end);
  if (raw === null || start === null) return false;

  const overnight = end !== null && end < start;
  const at = overnight && raw < end ? raw + MINUTES_PER_DAY : raw;

  const threshold = start + Math.max(0, shift.graceMinutes);
  return at > threshold;
}

/**
 * The label an attendance record carries, e.g. `General (09:00 – 18:00)`.
 *
 * Reproduces the old `DEFAULT_SHIFT` constant byte for byte for a 09:00–18:00
 * General shift, en dash included, so no seed record changes its caption.
 *
 * An organisation with no shift captions nothing rather than "Not set": the
 * record's `shift` field stays a non-nullable string and the attendance tables
 * render an empty one as "—".
 */
export function shiftCaption(shift: Shift | null | undefined): string {
  if (!shift) return '';
  return `${shift.name} (${shift.start} – ${shift.end})`;
}

/**
 * The shift this person is on: theirs where one is assigned, the
 * organisation's default otherwise, null when it has declared none.
 *
 * The `getSalaryStructureFor` / `getLeavePoliciesFor` shape. Called without an
 * employee it means "the organisation's own", which is what Settings edits and
 * what everyone without an assignment is judged on.
 *
 * An assignment naming a shift that no longer exists falls back to the default
 * rather than to nothing. Withdrawing a shift requires it to be empty, so a
 * stale id should not arise — but resolving one to null would silently stop
 * judging that person's arrivals, which is the failure that hides.
 */
export function resolveShift(
  config: ShiftConfig,
  assignments: ShiftAssignments,
  employeeId?: string | null,
): Shift | null {
  const byId = (id: string | null): Shift | null =>
    (id ? config.shifts.find((shift) => shift.id === id) ?? null : null);

  const assigned = employeeId ? byId(assignments[employeeId] ?? null) : null;
  return assigned ?? byId(config.defaultShiftId);
}
