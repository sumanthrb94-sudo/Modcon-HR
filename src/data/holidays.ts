/**
 * The organisation's holiday calendar.
 *
 * **There is no platform default, and an unset calendar is empty.** This
 * module shipped a fixed ten-day India 2026 calendar — Republic Day, Holi,
 * Diwali and the rest — returned to any organisation that had not saved one of
 * its own. Three things were wrong with that, and only the first is cosmetic:
 *
 *   1. It is one country's calendar. An organisation anywhere else was told
 *      its office was shut on days it was open.
 *   2. It was pinned to a single year, so it decays into a list of dates in
 *      the past and quietly stops meaning anything.
 *   3. **Holidays are paid for.** The attendance calendar treats them as
 *      non-working, `chargeableLeaveDays` excludes them from what a leave
 *      request costs, and payroll deducts unpaid absence from what is left.
 *      A holiday nobody at the company declared is a day of somebody's leave
 *      balance, or of their salary, decided by a literal in this file.
 *
 * Same reasoning as the salary structure (src/data/salaryStructure.ts): a
 * plausible default is worse than none, because it is indistinguishable from a
 * decision the organisation made. An empty calendar reads as "nobody has set
 * this up yet", which is true, and fixable in Settings → Holidays.
 */
import type { Holiday } from '@/types';
import { orgScopedKey } from '@/lib/orgScope';
import { ORG_SETTINGS, publishOrgSetting } from '@/lib/orgSettings';

const HOLIDAYS_STORAGE_KEY = ORG_SETTINGS.holidays.storageKey;
export const HOLIDAYS_CHANGED_EVENT = ORG_SETTINGS.holidays.changedEvent;

function notifyHolidaysChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(HOLIDAYS_CHANGED_EVENT));
}

function readStoredHolidays(): Holiday[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(HOLIDAYS_STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Holiday[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The organisation's declared holidays, or none.
 *
 * Empty means exactly one thing — nobody has declared any — whether this
 * organisation was created a minute ago or the cache has not hydrated from
 * Firestore yet. Every caller must render that as "not set up" rather than as
 * a working year with no holidays in it, because the two are indistinguishable
 * from here and only one of them is worth telling somebody about.
 */
export function getHolidayDirectory(): Holiday[] {
  return readStoredHolidays() ?? [];
}

/**
 * The calendar years the declared holidays actually cover, for page copy.
 *
 * The pages said "for 2026" in a string literal beside a list that was also
 * pinned to 2026 — two independent claims about the year that had to be
 * updated together and would not be. Derived, the heading cannot disagree with
 * the list beneath it, and an organisation that declares holidays across a
 * financial year boundary gets "2026–2027" rather than half of its calendar
 * filed under the wrong heading.
 */
export function holidayYearsCovered(holidays: Holiday[]): string | null {
  const years = holidays
    .map((holiday) => Number(holiday.date.slice(0, 4)))
    .filter((year) => Number.isFinite(year) && year > 0);
  if (!years.length) return null;

  const first = Math.min(...years);
  const last = Math.max(...years);
  return first === last ? String(first) : `${first}–${last}`;
}

/** Resolves once the organisation's copy has caught up — see publishOrgSetting. */
export function saveHolidayDirectory(holidays: Holiday[]): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  window.localStorage.setItem(orgScopedKey(HOLIDAYS_STORAGE_KEY), JSON.stringify(holidays));
  notifyHolidaysChanged();
  // The calendar attendance and payroll are computed against.
  return publishOrgSetting(ORG_SETTINGS.holidays, holidays);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === orgScopedKey(HOLIDAYS_STORAGE_KEY)) {
      notifyHolidaysChanged();
    }
  });
}
