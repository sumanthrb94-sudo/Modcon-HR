// ===========================================================================
// The app's single source of "now", fixed to Indian Standard Time.
//
// ModCon HR is an Indian HR product: payroll cut-offs, attendance days, leave
// dates and holidays are all IST business days. They must not shift because
// someone opens the app from another timezone — a claim filed at 20:00 IST is
// filed today, whether the viewer's laptop says London or Chicago.
//
// So every calendar question is answered in Asia/Kolkata, not in the viewer's
// local zone and not in UTC. IST is UTC+5:30 year-round with no DST, but this
// resolves the zone properly through Intl rather than hardcoding an offset.
// ===========================================================================

export const APP_TIME_ZONE = 'Asia/Kolkata';

const istYmd = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const istHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23',
});

function partsOf(formatter: Intl.DateTimeFormat, instant: Date): Record<string, string> {
  const out: Record<string, string> = {};
  formatter.formatToParts(instant).forEach((part) => {
    out[part.type] = part.value;
  });
  return out;
}

/**
 * Today's IST calendar date as `YYYY-MM-DD`.
 *
 * Deliberately not `new Date().toISOString().slice(0, 10)` — that is UTC, so
 * from 18:30 IST onwards it already reports tomorrow. Nor the local
 * components, which would give a Chicago viewer a different "today" than a
 * Bengaluru one looking at the same payroll.
 */
export function todayIso(): string {
  const p = partsOf(istYmd, new Date());
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Midnight of the current IST date, parsed exactly the way the app's stored
 * `YYYY-MM-DD` record dates parse. Both sides land on UTC midnight of the same
 * calendar day, so `new Date(record.date) >= todayDate()` compares like with
 * like instead of drifting by an offset.
 */
export function todayDate(): Date {
  return new Date(todayIso());
}

/** Current IST month as `YYYY-MM`, for month-keyed records such as payroll runs. */
export function currentMonthIso(): string {
  return todayIso().slice(0, 7);
}

/** Midnight on 1 January of the current IST year. */
export function startOfYear(): Date {
  return new Date(`${todayIso().slice(0, 4)}-01-01`);
}

/** Hour of day (0–23) in IST — for greetings and shift-window logic. */
export function currentHour(): number {
  return Number(partsOf(istHour, new Date()).hour);
}
