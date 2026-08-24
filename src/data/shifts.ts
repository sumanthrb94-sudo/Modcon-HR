/**
 * The hours an organisation runs, and who works which of them.
 *
 * These were two constants in `data/attendance.ts` — `DEFAULT_SHIFT`, a
 * display string stamped on every record, and `LATE_AFTER`, an unrelated
 * `'09:15'` literal that decided lateness for every tenant on the deployment.
 * Nothing tied the two together, so declaring a night shift would have gone on
 * judging its people against 09:15: flagged late, every night, silently.
 *
 * The days somebody works were already personal (`weekOffOf` in
 * data/employees.ts). The hours are now too.
 *
 * The arithmetic lives in data/shiftRules.ts, which imports nothing and is
 * unit tested. This module is the storage half: the `org_settings` registry,
 * the localStorage cache read synchronously at module-load time, and the one
 * change event both settings publish on.
 *
 * See docs/superpowers/specs/2026-08-24-shift-timings-design.md.
 */
import { orgScopedKey } from '@/lib/orgScope';
import { ORG_SETTINGS, publishOrgSetting } from '@/lib/orgSettings';
import { isMockDataCleared } from '@/lib/mockDataFlag';
import {
  clockMinutes,
  isLateForShift,
  ownHoursAsShift,
  resolveShift,
  shiftCaption,
  type EmployeeShift,
  type EmployeeShiftOverrides,
  type Shift,
  type ShiftAssignments,
  type ShiftConfig,
} from '@/data/shiftRules';

export type { EmployeeShift, EmployeeShiftOverrides, Shift, ShiftAssignments, ShiftConfig };
export { clockMinutes, crossesMidnight, ownHoursAsShift, shiftCaption } from '@/data/shiftRules';

const STORAGE_KEY = ORG_SETTINGS.shifts.storageKey;
const ASSIGNMENTS_STORAGE_KEY = ORG_SETTINGS.employeeShifts.storageKey;
const OVERRIDES_STORAGE_KEY = ORG_SETTINGS.employeeShiftOverrides.storageKey;

/**
 * Both settings publish on this. The organisation's hours and one person's
 * assignment are the same fact seen from two ends, and a surface that
 * re-rendered for only one of them would show the two disagreeing.
 */
export const SHIFTS_CHANGED_EVENT = ORG_SETTINGS.shifts.changedEvent;

/**
 * ModCon Builders' own shift — part of the demo dataset, not a platform
 * default.
 *
 * Same reasoning and the same `isMockDataCleared()` gate as
 * `DEMO_SALARY_STRUCTURE` and `demoCompanyProfile`. `General (09:00 – 18:00)`
 * with a 15-minute grace is exactly what the two deleted constants said, so
 * the demo organisation behaves precisely as it did before this change; a real
 * organisation created later starts with nothing and flags nobody late.
 */
export const DEMO_SHIFT_CONFIG: ShiftConfig = {
  shifts: [{ id: 'general', name: 'General', start: '09:00', end: '18:00', graceMinutes: 15 }],
  defaultShiftId: 'general',
};

const NO_SHIFTS: ShiftConfig = { shifts: [], defaultShiftId: null };

function notifyChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SHIFTS_CHANGED_EVENT));
}

// ---- Reading ---------------------------------------------------------------

/** A `HH:mm` string, or null. Rejects anything `clockMinutes` cannot read. */
function clockTime(value: unknown): string | null {
  return typeof value === 'string' && clockMinutes(value) !== null ? value.trim() : null;
}

/**
 * A stored shift, or null if it is not usable.
 *
 * A shift missing its start or carrying an unreadable one cannot judge
 * anybody, and keeping it would put a row in Settings that silently decides
 * nothing. Grace is clamped rather than refused: a negative grace is a typo
 * with an obvious reading, where a missing start is not.
 */
export function normalizeShift(value: unknown): Shift | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const start = clockTime(raw.start);
  const end = clockTime(raw.end);
  if (!id || !name || !start || !end) return null;

  const grace = Number(raw.graceMinutes);
  return {
    id,
    name,
    start,
    end,
    graceMinutes: Number.isFinite(grace) ? Math.max(0, Math.round(grace)) : 0,
  };
}

/**
 * A stored configuration, with unusable shifts dropped.
 *
 * `defaultShiftId` is kept only if it names a shift that survived, so the
 * default cannot point at nothing — which would resolve every unassigned
 * employee to null and quietly stop judging the whole company.
 */
export function normalizeShiftConfig(value: unknown): ShiftConfig {
  if (!value || typeof value !== 'object') return NO_SHIFTS;
  const raw = value as Record<string, unknown>;

  const shifts = Array.isArray(raw.shifts)
    ? raw.shifts.map(normalizeShift).filter((shift): shift is Shift => shift !== null)
    : [];

  const claimed = typeof raw.defaultShiftId === 'string' ? raw.defaultShiftId : null;
  const defaultShiftId = shifts.some((shift) => shift.id === claimed) ? claimed : null;

  return { shifts, defaultShiftId };
}

/**
 * The organisation's shifts.
 *
 * Read at call time, never captured at module load: an administrator can
 * change this in Settings and the cache is hydrated from Firestore after
 * sign-in. Anything that stays mounted subscribes with
 * `useCollectionRevision(SHIFTS_CHANGED_EVENT)`.
 */
export function getShiftConfig(): ShiftConfig {
  if (typeof window === 'undefined') return NO_SHIFTS;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(STORAGE_KEY));
    // No stored value is the demo organisation's shift, or nothing at all once
    // the mock data has been cleared — never a platform-invented 09:00.
    if (!raw) return isMockDataCleared() ? NO_SHIFTS : DEMO_SHIFT_CONFIG;
    return normalizeShiftConfig(JSON.parse(raw));
  } catch {
    return NO_SHIFTS;
  }
}

export function getShifts(): Shift[] {
  return getShiftConfig().shifts;
}

/** True when this organisation has declared any hours at all. */
export function hasShifts(): boolean {
  return getShifts().length > 0;
}

/** Who is on which shift. Sparse — absent means the organisation's default. */
export function getShiftAssignments(): ShiftAssignments {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(orgScopedKey(ASSIGNMENTS_STORAGE_KEY));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ShiftAssignments = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([employeeId, shiftId]) => {
      if (employeeId && typeof shiftId === 'string' && shiftId) out[employeeId] = shiftId;
    });
    return out;
  } catch {
    return {};
  }
}

/**
 * The shift this person is on — theirs, the organisation's default, or null.
 *
 * The `getSalaryStructureFor` / `getLeavePoliciesFor` shape. Passing no id
 * means "the organisation's own", which is what Settings edits.
 */
export function getShiftFor(employeeId?: string | null): Shift | null {
  return resolveShift(getShiftConfig(), getShiftAssignments(), employeeId, getEmployeeShiftOverrides());
}

/**
 * Everyone given hours of their own rather than the organisation's.
 *
 * Sparse and whole: an entry carries start, end and grace together, because a
 * grace period without the start it is measured from describes a shift nobody
 * specified — the per-employee salary split rule.
 */
export function getEmployeeShiftOverrides(): EmployeeShiftOverrides {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(orgScopedKey(OVERRIDES_STORAGE_KEY));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: EmployeeShiftOverrides = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([employeeId, value]) => {
      // Stored through the same reader that resolution uses, so an entry that
      // could never be honoured is not listed in Settings as though it were.
      const shift = ownHoursAsShift(employeeId, value as EmployeeShift);
      if (employeeId && shift) {
        out[employeeId] = { start: shift.start, end: shift.end, graceMinutes: shift.graceMinutes };
      }
    });
    return out;
  } catch {
    return {};
  }
}

/** True when this person is on hours of their own rather than a company shift. */
export function hasCustomShift(employeeId: string): boolean {
  return employeeId in getEmployeeShiftOverrides();
}

/** The organisation's default shift, or null if it has declared none. */
export function getDefaultShift(): Shift | null {
  return getShiftFor();
}

/**
 * True when this person is on hours that are not the organisation's default —
 * either a company shift they were assigned, or hours of their own.
 */
export function hasOwnShift(employeeId: string): boolean {
  if (hasCustomShift(employeeId)) return true;
  const assigned = getShiftAssignments()[employeeId];
  return Boolean(assigned) && getShifts().some((shift) => shift.id === assigned);
}

/**
 * True when this arrival counts as late for this person.
 *
 * Replaces `isLateCheckIn(checkIn)`. `employeeId` is required, not optional:
 * optional, every existing call site would have kept compiling and gone on
 * judging everyone against the organisation's default — the reason
 * `updateLeaveRequestStatus` takes a required `profile`.
 */
export function isLateFor(employeeId: string | null | undefined, checkIn: string | null | undefined): boolean {
  return isLateForShift(getShiftFor(employeeId), checkIn);
}

/** The caption an attendance record carries for this person's hours. */
export function shiftCaptionFor(employeeId?: string | null): string {
  return shiftCaption(getShiftFor(employeeId));
}

/**
 * The employees assigned this shift by name.
 *
 * What the withdraw guard asks: hours people are still rostered on cannot be
 * retired out from under them.
 */
export function employeeIdsOnShift(shiftId: string): string[] {
  return Object.entries(getShiftAssignments())
    .filter(([, assigned]) => assigned === shiftId)
    .map(([employeeId]) => employeeId);
}

// ---- Writing ---------------------------------------------------------------

/**
 * Save the organisation's shifts.
 *
 * Optimistic, like every other org setting: localStorage synchronously so the
 * UI is correct either way, then Firestore so the value outlives the browser
 * and reaches the organisation's other administrators.
 */
export function saveShiftConfig(config: ShiftConfig): Promise<boolean> {
  const normalized = normalizeShiftConfig(config);
  if (typeof window === 'undefined') return Promise.resolve(false);
  window.localStorage.setItem(orgScopedKey(STORAGE_KEY), JSON.stringify(normalized));
  notifyChanged();
  return publishOrgSetting(ORG_SETTINGS.shifts, normalized);
}

/** Save the whole assignment map. */
export function saveShiftAssignments(assignments: ShiftAssignments): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  window.localStorage.setItem(orgScopedKey(ASSIGNMENTS_STORAGE_KEY), JSON.stringify(assignments));
  notifyChanged();
  return publishOrgSetting(ORG_SETTINGS.employeeShifts, assignments);
}

/**
 * Put one person on a shift, or take them off it.
 *
 * Merges rather than replaces — an assignment about one person says nothing
 * about anybody else's. Passing null removes the exception, which puts them
 * back on the organisation's default rather than on nothing.
 */
export function setEmployeeShift(employeeId: string, shiftId: string | null): Promise<boolean> {
  const next = { ...getShiftAssignments() };
  if (shiftId) next[employeeId] = shiftId;
  else delete next[employeeId];
  // Assigning a company shift withdraws any hours of their own. The two stores
  // must never hold a contradiction about one person: resolution prefers the
  // custom hours, so leaving them behind would make the assignment silently do
  // nothing.
  const writes = [saveShiftAssignments(next)];
  if (hasCustomShift(employeeId)) writes.push(saveEmployeeCustomShift(employeeId, null));
  return Promise.all(writes).then((results) => results.every(Boolean));
}

/**
 * Give one person hours of their own, or take them back onto the company's.
 *
 * Merges rather than replaces — hours for one person say nothing about anybody
 * else's. Passing null removes the exception, which puts them back on the
 * organisation's shift rather than on nothing.
 *
 * Setting custom hours clears any company-shift assignment, the mirror of
 * `setEmployeeShift` above and for the same reason.
 */
export function saveEmployeeCustomShift(
  employeeId: string,
  hours: EmployeeShift | null,
): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);

  const next = { ...getEmployeeShiftOverrides() };
  if (hours) {
    const shift = ownHoursAsShift(employeeId, hours);
    // Refused rather than half-stored: an entry missing its start would resolve
    // to the organisation's hours while Settings listed it as an exception.
    if (!shift) return Promise.resolve(false);
    next[employeeId] = { start: shift.start, end: shift.end, graceMinutes: shift.graceMinutes };
  } else {
    delete next[employeeId];
  }

  window.localStorage.setItem(orgScopedKey(OVERRIDES_STORAGE_KEY), JSON.stringify(next));
  notifyChanged();

  const writes = [publishOrgSetting(ORG_SETTINGS.employeeShiftOverrides, next)];
  if (hours && getShiftAssignments()[employeeId]) {
    const assignments = { ...getShiftAssignments() };
    delete assignments[employeeId];
    writes.push(saveShiftAssignments(assignments));
  }
  return Promise.all(writes).then((results) => results.every(Boolean));
}

/**
 * A url-safe id for a newly named shift, unique within the organisation.
 *
 * Assignment is by id, so this is written once and never again — renaming a
 * shift later changes only its `name` and everybody assigned it comes along.
 */
export function shiftIdFor(name: string, existing: Shift[] = getShifts()): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shift';
  if (!existing.some((shift) => shift.id === base)) return base;
  let suffix = 2;
  while (existing.some((shift) => shift.id === `${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (
      event.key === orgScopedKey(STORAGE_KEY) ||
      event.key === orgScopedKey(ASSIGNMENTS_STORAGE_KEY) ||
      event.key === orgScopedKey(OVERRIDES_STORAGE_KEY)
    ) {
      notifyChanged();
    }
  });
}
