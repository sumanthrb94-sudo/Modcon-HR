/**
 * Whose birthday and work anniversary is coming up.
 *
 * Derived from `dateOfBirth` and `dateOfJoining` on the employee record at read
 * time, never stored. Writing a post per celebration would need a scheduled job
 * this project has no backend for, and would leave a year of stale documents
 * the day somebody's date is corrected on their profile.
 *
 * The dates are compared **in IST**, like every other date in this app: a
 * birthday on the 4th displays as the 3rd for anyone west of Greenwich if the
 * comparison is made in the viewer's zone, and "today" is exactly the question
 * this module answers.
 */
import type { Employee } from '@/types';
import { APP_TIME_ZONE, todayDate } from '@/lib/today';

export type CelebrationKind = 'birthday' | 'anniversary';

export interface Celebration {
  employeeId: string;
  name: string;
  designation: string;
  kind: CelebrationKind;
  /** Days from today. 0 is today, 1 tomorrow. Never negative. */
  inDays: number;
  /** Years being marked. Absent for a birthday — nobody's age is the company's business. */
  years?: number;
}

/** Month and day of an ISO date, read in IST. Null when the date is not recorded. */
function monthDayOf(iso: string): { month: number; day: number } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return Number.isFinite(month) && Number.isFinite(day) ? { month, day } : null;
}

/**
 * Days until the next occurrence of a month/day, from today in IST.
 *
 * 29 February is deliberately not special-cased into 28 February or 1 March:
 * the anniversary simply lands in the years it exists. Picking a substitute
 * would be this app deciding when somebody's birthday is.
 */
function daysUntil(target: { month: number; day: number }, horizonDays: number): number | null {
  const today = todayDate();
  for (let offset = 0; offset <= horizonDays; offset++) {
    const candidate = new Date(today.getTime() + offset * 86_400_000);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: APP_TIME_ZONE,
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(candidate);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    if (month === target.month && day === target.day) return offset;
  }
  return null;
}

function yearsSince(iso: string): number {
  const then = new Date(iso);
  const now = todayDate();
  return Math.max(0, Math.round((now.getTime() - then.getTime()) / (365.25 * 86_400_000)));
}

/**
 * Everyone with something to mark inside the horizon, soonest first.
 *
 * `Resigned` employees are excluded: a board that wishes somebody a happy work
 * anniversary the month after they left is worse than saying nothing. An
 * anniversary of zero years is excluded for the same reason — somebody who
 * joined last week does not have one.
 */
export function upcomingCelebrations(
  directory: Employee[],
  horizonDays = 7,
): Celebration[] {
  const out: Celebration[] = [];

  for (const employee of directory) {
    if (employee.status === 'Resigned') continue;

    const birthday = monthDayOf(employee.dateOfBirth);
    if (birthday) {
      const inDays = daysUntil(birthday, horizonDays);
      if (inDays !== null) {
        out.push({
          employeeId: employee.id,
          name: employee.fullName,
          designation: employee.designation,
          kind: 'birthday',
          inDays,
        });
      }
    }

    const joined = monthDayOf(employee.dateOfJoining);
    if (joined) {
      const inDays = daysUntil(joined, horizonDays);
      const years = yearsSince(employee.dateOfJoining);
      if (inDays !== null && years >= 1) {
        out.push({
          employeeId: employee.id,
          name: employee.fullName,
          designation: employee.designation,
          kind: 'anniversary',
          inDays,
          years,
        });
      }
    }
  }

  return out.sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name));
}

/** "Today", "Tomorrow", or "in 4 days" — what a person would actually say. */
export function whenLabel(inDays: number): string {
  if (inDays === 0) return 'Today';
  if (inDays === 1) return 'Tomorrow';
  return `In ${inDays} days`;
}

/** The greeting the composer opens with. Editable — it is a starting point. */
export function greetingFor(celebration: Celebration): string {
  const first = celebration.name.split(' ')[0];
  return celebration.kind === 'birthday'
    ? `Happy birthday, ${first}! 🎉`
    : `Happy ${celebration.years} year${celebration.years === 1 ? '' : 's'} at the company, ${first}! 🎉`;
}
