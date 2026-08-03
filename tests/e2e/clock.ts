/**
 * Fixed instants for `page.clock`, anchored on a day that is nobody's week-off.
 *
 * Seeded employees are rostered off on Sunday, Monday or Tuesday (`weekOff` in
 * data/employees.ts, defaulting to Sunday), and a record on someone's week-off
 * is deliberately never flagged for regularization —
 * `deriveRegularizationRequests` filters it out, because asking someone to
 * account for their own day off is not an anomaly.
 *
 * Anchoring on the wall-clock day therefore made three specs fail every Monday.
 * Both of them act on the first seed employee — Aarav Sharma, MC-001, who is
 * off on Mondays: `regularizations.spec.ts` picks him as `people[0]`, and in
 * `check-in-out.spec.ts` the admin persona has no employee record of its own,
 * so My Attendance falls back to the first employee in the directory. Marking
 * him absent, or stamping a late check-in for him, on a Monday correctly
 * produces no queue entry, and the day is correctly absent from the
 * regularization dialog's date list. The app was right; the specs assumed
 * today was a working day for whoever they happened to pick.
 *
 * The anchor steps back to the most recent Wednesday–Saturday, which is a
 * working day for every employee in the seed. Still derived from the real clock
 * rather than a pinned literal, so the suite cannot quietly start simulating a
 * fixed day in the past. IST is UTC+5:30 year-round.
 */

/** `YYYY-MM-DD` for an instant, as IST reckons it. */
function istDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * Read in UTC, matching `isWeekOffFor` in the app — `getDay()` would answer in
 * the runner's own zone and land on the wrong weekday west of IST.
 */
function weekdayOf(isoDate: string): number {
  return new Date(isoDate).getUTCDay();
}

/** Sunday, Monday, Tuesday — every week-off the seed roster uses. */
const ROSTERED_OFF = new Set([0, 1, 2]);

/** The most recent date that is a working day for every seeded employee. */
export function anchorWorkingDay(now: Date = new Date()): string {
  let iso = istDate(now);
  // At most three steps: Tuesday is the furthest any of them is from Saturday.
  while (ROSTERED_OFF.has(weekdayOf(iso))) {
    const previous = new Date(`${iso}T00:00:00+05:30`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    iso = istDate(previous);
  }
  return iso;
}

/** A fixed instant at `HH:mm` IST, `offsetDays` from the anchor working day. */
export function istDay(offsetDays: number, time: string): Date {
  const shifted = new Date(`${anchorWorkingDay()}T00:00:00+05:30`);
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return new Date(`${istDate(shifted)}T${time}:00+05:30`);
}

/** A fixed instant at `HH:mm` IST on the anchor working day. */
export function istToday(time: string): Date {
  return istDay(0, time);
}
