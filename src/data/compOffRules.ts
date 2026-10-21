/**
 * How comp off is earned. Pure arithmetic — imports nothing — so the rule can be
 * unit-tested; which records, week-offs and holidays feed it is
 * `compOffEarned` in ./leaveEntitlements.ts.
 *
 * Comp Off used to grant nothing at all: the policy's quota is zero and nothing
 * ever added to it, so an employee who worked their Sunday and then asked for
 * the day back was charged a day of loss of pay for it. The day off they had
 * given up became a deduction.
 *
 * The rule is deliberately the simple one a small company runs by hand: a day
 * worked on your own week-off or on a declared holiday earns a day back. Half a
 * day's work earns half a day. No approval step, because the evidence is the
 * attendance record itself — the same check-in an employee cannot backdate.
 */

/** The parts of an attendance record the rule reads. */
export interface WorkedDay {
  readonly date: string;
  readonly checkIn: string | null;
  readonly workedHours: number;
}

/** Hours from which a worked day off counts as a full day earned. */
export const FULL_DAY_HOURS = 4;

/**
 * Comp off days earned in `[from, to]` (inclusive ISO dates).
 *
 * A day counts only when somebody checked in on it and it was a day off for
 * them. A shift still open (no hours yet) earns nothing until it is closed or
 * regularized — an open shift has no length to judge.
 */
export function compOffDaysEarned(
  days: readonly WorkedDay[],
  isDayOff: (date: string) => boolean,
  from: string,
  to: string,
): number {
  let earned = 0;
  for (const day of days) {
    if (!day.checkIn || day.date < from || day.date > to) continue;
    if (!isDayOff(day.date)) continue;
    const hours = Number.isFinite(day.workedHours) ? day.workedHours : 0;
    if (hours >= FULL_DAY_HOURS) earned += 1;
    else if (hours > 0) earned += 0.5;
  }
  return earned;
}
