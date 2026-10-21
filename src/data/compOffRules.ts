/**
 * Comp-off: a day off earned by working a day off.
 *
 * Comp Off was a leave type nobody could earn — granted zero days, so a
 * request for one was simply loss of pay — while retail, clinics and
 * construction (three of the industry presets) work holidays and week-offs as
 * a matter of course. Staff lost the day, or took it unpaid.
 *
 * A day worked (Present, Work From Home or Half Day) on the person's own
 * week-off or an organisation holiday is a credit to be decided — a whole day,
 * or half for a half day. Approved, it adds to their Comp Off balance until it
 * expires; nobody is credited automatically, because whether working a Sunday
 * earns a day off or overtime is the company's call each time.
 *
 * Pure, imports types only, unit-tested (tests/unit/compOffRules.test.ts).
 */
import type { AttendanceRecord } from '@/types';

/** How long an approved credit may be taken, from the day worked. */
export const COMP_OFF_VALID_DAYS = 90;

export interface CompOffCredit {
  /** `co-<employeeId>-<date>` — one per day worked. */
  id: string;
  employeeId: string;
  /** The day worked, YYYY-MM-DD. */
  date: string;
  days: number;
  status: 'Approved' | 'Rejected';
  decidedBy?: string;
  decidedOn?: string;
  /** Last day it may be taken, YYYY-MM-DD. */
  expiresOn: string;
}

export interface CompOffCandidate {
  id: string;
  employeeId: string;
  date: string;
  days: number;
  why: 'week-off' | 'holiday';
}

const WORKED = new Set(['Present', 'Work From Home', 'Half Day']);

export function compOffId(employeeId: string, date: string): string {
  return `co-${employeeId}-${date}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Days worked on a day off that nobody has decided yet. */
export function compOffCandidates(
  records: readonly Pick<AttendanceRecord, 'employeeId' | 'date' | 'status'>[],
  isWeekOff: (employeeId: string, date: string) => boolean,
  isHoliday: (date: string) => boolean,
  decided: ReadonlySet<string>,
): CompOffCandidate[] {
  const out: CompOffCandidate[] = [];
  for (const r of records) {
    if (!WORKED.has(r.status)) continue;
    const id = compOffId(r.employeeId, r.date);
    if (decided.has(id)) continue;
    const holiday = isHoliday(r.date);
    if (!holiday && !isWeekOff(r.employeeId, r.date)) continue;
    out.push({ id, employeeId: r.employeeId, date: r.date, days: r.status === 'Half Day' ? 0.5 : 1, why: holiday ? 'holiday' : 'week-off' });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Approved, unexpired days credited to someone as of `asOf`, within [from, asOf]. */
export function compOffDaysGranted(
  credits: readonly CompOffCredit[],
  employeeId: string,
  asOf: string,
  from = '0000-00-00',
): number {
  return credits
    .filter((c) => c.employeeId === employeeId && c.status === 'Approved' && c.date >= from && c.date <= asOf && c.expiresOn >= asOf)
    .reduce((sum, c) => sum + c.days, 0);
}
