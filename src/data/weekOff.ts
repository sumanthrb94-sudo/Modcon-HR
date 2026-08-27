/**
 * The day the organisation is closed, and the day one person is.
 *
 * Week-off existed at one level only: `weekOff` on the employee record, and a
 * `?? 'Sunday'` literal in `weekOffOf` standing in for everybody else. That
 * literal was the organisation's policy in every sense that mattered — it
 * decided which day the attendance grid may leave unworked, which days a leave
 * request is charged for, and which absences payroll deducts — except that no
 * organisation could see it, state it, or change it. A company closed on
 * Friday had to set a personal week-off on every one of its employees, one at
 * a time, and every new joiner silently reverted to Sunday.
 *
 * So there are two levels, and the narrower one wins:
 *
 *   organisation   Settings → Week Off. Applies to everybody who has not been
 *                  given a day of their own.
 *   employee       `weekOff` on their record (Employees → profile → Edit).
 *                  Overrides the organisation's, and is how a support rota or
 *                  a negotiated arrangement is expressed.
 *
 * `weekOffOf` in data/employees.ts is that resolution, and the only thing that
 * should read either store directly.
 *
 * **This one has a fallback, unlike the holiday calendar and the salary
 * split.** Those return "not set" and show nothing, because a plausible
 * default is indistinguishable from a decision the organisation made. Here
 * nothing is not an option: every date has to resolve to worked or not, and an
 * organisation that has not declared a week-off would otherwise have a
 * seven-day working week — marking every Sunday absent for everybody and
 * deducting it from their pay. Failing to a day off is the safe direction;
 * failing to a working day is not.
 */
import { WEEK_OFF_DAYS, type WeekOffDay } from '@/types';
import { orgScopedKey } from '@/lib/orgScope';
import { ORG_SETTINGS, publishOrgSetting } from '@/lib/orgSettings';

const STORAGE_KEY = ORG_SETTINGS.weekOff.storageKey;
export const WEEK_OFF_CHANGED_EVENT = ORG_SETTINGS.weekOff.changedEvent;

/**
 * What an organisation that has not chosen gets.
 *
 * Named rather than inlined so the one day this app assumes is greppable, and
 * so Settings can say the organisation has not chosen yet rather than
 * presenting Sunday as a choice somebody made.
 */
export const FALLBACK_WEEK_OFF: WeekOffDay = 'Sunday';

function notifyWeekOffChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(WEEK_OFF_CHANGED_EVENT));
}

/** Narrows a stored value: it is arbitrary JSON as far as this module knows. */
function asWeekOffDay(value: unknown): WeekOffDay | null {
  return WEEK_OFF_DAYS.includes(value as WeekOffDay) ? (value as WeekOffDay) : null;
}

/**
 * The organisation's declared week-off, or `null` when it has declared none.
 *
 * Separate from `getOrganisationWeekOff()` because the difference is worth
 * showing in Settings: "Sunday, because nobody has chosen" and "Sunday,
 * because somebody chose Sunday" are the same day and different facts, and
 * only one of them should look settled.
 */
export function getDeclaredOrganisationWeekOff(): WeekOffDay | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(STORAGE_KEY));
    if (!raw) return null;
    return asWeekOffDay(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** The day this organisation is closed. Falls back — see FALLBACK_WEEK_OFF. */
export function getOrganisationWeekOff(): WeekOffDay {
  return getDeclaredOrganisationWeekOff() ?? FALLBACK_WEEK_OFF;
}

/** Resolves once the organisation's copy has caught up — see publishOrgSetting. */
export function saveOrganisationWeekOff(day: WeekOffDay): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  window.localStorage.setItem(orgScopedKey(STORAGE_KEY), JSON.stringify(day));
  notifyWeekOffChanged();
  // The calendar attendance and unpaid-absence deductions are computed against.
  return publishOrgSetting(ORG_SETTINGS.weekOff, day);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === orgScopedKey(STORAGE_KEY)) {
      notifyWeekOffChanged();
    }
  });
}
