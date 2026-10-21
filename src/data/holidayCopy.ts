/**
 * Next year's holiday calendar, started from this one.
 *
 * Every March HR re-typed the year, and until they did, January to March leave
 * was over-charged and absences on holidays deducted. Copying forward is the
 * start, not the answer: a fixed-date holiday (Republic Day, Christmas) keeps
 * its date, and every other one — the festivals that follow a lunar calendar —
 * is copied to the same day and **named for checking**, because putting Diwali
 * on last year's date and saying nothing is a holiday nobody declared.
 *
 * Pure, imports types only, unit-tested (tests/unit/holidayCopy.test.ts).
 */
import type { Holiday } from '@/types';

/** Holidays whose date does not move, by month-day. */
const FIXED_DATES = new Set(['01-01', '01-26', '05-01', '08-15', '10-02', '12-25']);

export interface HolidayCopy {
  readonly fromYear: number;
  readonly toYear: number;
  /** What would be added — nothing already declared for that year. */
  readonly added: Holiday[];
  /** Names whose date was copied as-is and needs checking. */
  readonly toCheck: string[];
}

function isValidDate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** Copy the latest declared year to the year after it. Null when there is nothing to copy. */
export function copyHolidaysForward(holidays: readonly Holiday[]): HolidayCopy | null {
  const years = holidays.map((h) => Number(h.date.slice(0, 4))).filter((y) => Number.isFinite(y) && y > 0);
  if (years.length === 0) return null;
  const fromYear = Math.max(...years);
  const toYear = fromYear + 1;
  const existing = new Set(holidays.filter((h) => h.date.startsWith(`${toYear}-`)).map((h) => h.name.trim().toLowerCase()));
  const added: Holiday[] = [];
  const toCheck: string[] = [];
  for (const h of holidays) {
    if (!h.date.startsWith(`${fromYear}-`)) continue;
    if (existing.has(h.name.trim().toLowerCase())) continue;
    const monthDay = h.date.slice(5, 10);
    let date = `${toYear}-${monthDay}`;
    // 29 February does not exist next year; the 28th, and it needs checking.
    if (!isValidDate(date)) date = `${toYear}-02-28`;
    if (!FIXED_DATES.has(monthDay)) toCheck.push(h.name);
    added.push({ ...h, id: `hol-${toYear}-${monthDay}-${added.length}`, date });
  }
  return { fromYear, toYear, added, toCheck };
}
