import type { WeekOffDay } from '@/types';

/**
 * What an organisation's week-off is beyond its one weekly day.
 *
 * Which Saturdays an office works "depends on the company" — the product
 * owner's words, and the right answer. Some are closed Saturday and Sunday;
 * many Indian offices close only the 2nd and 4th Saturdays (banks, and the
 * many firms that follow them), some the 1st and 3rd, some every other
 * weekend. The weekly-day setting could express none of that, so a company
 * closed on alternate Saturdays had every one of them marked absent or every
 * one of them treated as worked.
 *
 * Two optional additions to the weekly day, both the organisation's choice:
 *
 *   secondDay   another day off every week (Saturday + Sunday)
 *   nthDays     a day off only in certain weeks of the month — "the 2nd and
 *               4th Saturday" is `{ day: 'Saturday', weeks: [2, 4] }`; week n
 *               is days 7(n-1)+1 to 7n, so the 5th covers the 29th onward
 *
 * They apply to everyone following the organisation's week-off. Somebody with
 * a week-off of their own keeps exactly that, as before: the narrower level
 * wins. Pure, so `npm run test:unit` reaches it.
 */
export interface WeekOffRules {
  secondDay: WeekOffDay | null;
  nthDays: { day: WeekOffDay; weeks: number[] } | null;
}

export const NO_EXTRA_WEEK_OFF: WeekOffRules = { secondDay: null, nthDays: null };

const DAY_NAMES: readonly WeekOffDay[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

function dayOf(isoDate: string): { name: WeekOffDay; dayOfMonth: number } {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return { name: DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()], dayOfMonth: d };
}

/** Which occurrence of its weekday in the month a date is: 1 for the 1st–7th. */
export function weekOfMonth(isoDate: string): number {
  return Math.ceil(dayOf(isoDate).dayOfMonth / 7);
}

/** True when `isoDate` is a day off under the organisation's policy. */
export function isOrganisationWeekOffDate(isoDate: string, weeklyDay: WeekOffDay, rules: WeekOffRules): boolean {
  const { name } = dayOf(isoDate);
  if (name === weeklyDay) return true;
  if (rules.secondDay && name === rules.secondDay) return true;
  if (rules.nthDays && name === rules.nthDays.day && rules.nthDays.weeks.includes(weekOfMonth(isoDate))) return true;
  return false;
}

/** "Sunday", "Sunday & Saturday", "Sunday & 2nd/4th Saturday". */
export function describeOrganisationWeekOff(weeklyDay: WeekOffDay, rules: WeekOffRules): string {
  const parts: string[] = [weeklyDay];
  if (rules.secondDay && rules.secondDay !== weeklyDay) parts.push(rules.secondDay);
  if (rules.nthDays && rules.nthDays.weeks.length > 0) {
    const weeks = [...rules.nthDays.weeks].sort((a, b) => a - b).map((w) => ORDINALS[w - 1]).join('/');
    parts.push(`${weeks} ${rules.nthDays.day}`);
  }
  return parts.join(' & ');
}

/** Narrow stored JSON to rules, dropping anything malformed rather than guessing. */
export function normalizeWeekOffRules(value: unknown): WeekOffRules {
  if (!value || typeof value !== 'object') return NO_EXTRA_WEEK_OFF;
  const raw = value as { secondDay?: unknown; nthDays?: unknown };
  const isDay = (v: unknown): v is WeekOffDay => DAY_NAMES.includes(v as WeekOffDay);
  const secondDay = isDay(raw.secondDay) ? raw.secondDay : null;
  let nthDays: WeekOffRules['nthDays'] = null;
  const nth = raw.nthDays as { day?: unknown; weeks?: unknown } | null | undefined;
  if (nth && isDay(nth.day) && Array.isArray(nth.weeks)) {
    const weeks = [...new Set(nth.weeks.filter((w): w is number => Number.isInteger(w) && w >= 1 && w <= 5))].sort();
    if (weeks.length > 0) nthDays = { day: nth.day, weeks };
  }
  return { secondDay, nthDays };
}
