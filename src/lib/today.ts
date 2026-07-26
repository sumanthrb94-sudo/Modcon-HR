// ===========================================================================
// The app's single source of "now".
//
// Previously nine modules each declared their own `const TODAY = '2026-06-10'`
// while ~20 other sites used the real system clock (timeAgo, greetings, and
// every newly-created record). The app therefore disagreed with itself: a
// claim filed today got a real date but was filtered against a fixed June
// afternoon. Everything reads the real clock from here now.
// ===========================================================================

/**
 * Today as `YYYY-MM-DD` in the viewer's local calendar.
 *
 * Deliberately not `new Date().toISOString().slice(0, 10)` — that is UTC, so
 * for anyone east or west of Greenwich it reports the wrong day for part of
 * every 24 hours (IST is +5:30, so late evening already reads as tomorrow).
 */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Midnight today, parsed exactly the way the app's stored `YYYY-MM-DD` record
 * dates parse. Keeping both sides on the same footing means `new Date(record.date)
 * >= todayDate()` compares like with like instead of drifting by a timezone offset.
 */
export function todayDate(): Date {
  return new Date(todayIso());
}

/** Current month as `YYYY-MM`, for month-keyed records such as payroll runs. */
export function currentMonthIso(): string {
  return todayIso().slice(0, 7);
}

/** Midnight on 1 January of the current year. */
export function startOfYear(): Date {
  return new Date(`${new Date().getFullYear()}-01-01`);
}
