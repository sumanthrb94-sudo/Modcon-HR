// Scheduling decisions — pure, so quiet hours and escalation are unit testable.

import type { ProgressSource } from "./types.ts";

export interface QuietHours {
  /** Local hour contact stops, e.g. 19 for 7pm. */
  quiet_start: number;
  /** Local hour contact may resume, e.g. 9 for 9am. */
  quiet_end: number;
  /** IANA zone, e.g. "Asia/Kolkata". */
  timezone: string;
}

/** The employee's wall-clock hour, whatever server the dispatcher runs on. */
export function localHour(now: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    // "24" appears at midnight in some ICU builds.
    return Number.isFinite(hour) ? hour % 24 : now.getUTCHours();
  } catch {
    // Unknown zone — fall back to UTC rather than messaging at 3am.
    return now.getUTCHours();
  }
}

/**
 * Quiet hours normally wrap midnight (19:00 → 09:00). A window that does not
 * wrap (09:00 → 17:00) is treated literally.
 */
export function isQuietHour(now: Date, policy: QuietHours): boolean {
  const hour = localHour(now, policy.timezone);
  const { quiet_start: start, quiet_end: end } = policy;
  if (start === end) return false;          // no quiet period configured
  if (start > end) return hour >= start || hour < end;   // wraps midnight
  return hour >= start && hour < end;
}

/** Weekends are not a good time to ask someone how their OKR is going. */
export function isWeekend(now: Date, timezone: string): boolean {
  try {
    const day = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "short" })
      .format(now);
    return day === "Sat" || day === "Sun";
  } catch {
    const d = now.getUTCDay();
    return d === 0 || d === 6;
  }
}

export interface SendWindowResult {
  ok: boolean;
  reason?: string;
}

export function canSendNow(
  now: Date,
  policy: QuietHours,
  opts: { skipWeekends?: boolean } = {},
): SendWindowResult {
  if (isQuietHour(now, policy)) {
    return { ok: false, reason: `quiet hours (${policy.quiet_start}:00–${policy.quiet_end}:00 ${policy.timezone})` };
  }
  if (opts.skipWeekends !== false && isWeekend(now, policy.timezone)) {
    return { ok: false, reason: "weekend" };
  }
  return { ok: true };
}

/** The next rung down the ladder, or null at the bottom. */
export function nextChannel(
  ladder: ProgressSource[],
  current: ProgressSource,
): ProgressSource | null {
  const pos = ladder.indexOf(current);
  if (pos === -1 || pos >= ladder.length - 1) return null;
  return ladder[pos + 1];
}

/** Voice is the most intrusive rung — it needs consent the others don't. */
export function requiresConsent(channel: ProgressSource): boolean {
  return channel === "call";
}

export interface Prompt {
  subject: string;
  body: string;
}

/**
 * What the employee actually reads. Three questions, always the same three,
 * because consistent questions make the extraction reliable.
 */
export function buildPrompt(
  goalTitle: string,
  currentPercent: number | null,
  daysSinceUpdate: number,
  channel: ProgressSource,
): Prompt {
  const standing = currentPercent === null
    ? "I don't have a number on file yet."
    : `Last I have is ${currentPercent}%.`;
  const gap = daysSinceUpdate >= 900
    ? "no updates yet"
    : `last update ${daysSinceUpdate} day${daysSinceUpdate === 1 ? "" : "s"} ago`;

  if (channel === "call") {
    // Read aloud, so no formatting and no percentages spelled as symbols.
    return {
      subject: `Check-in: ${goalTitle}`,
      body: [
        `Hi, this is a quick check-in about ${goalTitle}.`,
        currentPercent === null
          ? "I don't have a completion figure on file yet."
          : `My last figure for it is ${currentPercent} percent.`,
        "Three quick questions. What has moved since last time?",
        "Where would you put it now, as a percentage?",
        "And is anything blocking you?",
      ].join(" "),
    };
  }

  const questions = [
    "1. What moved since last time?",
    "2. Where would you put it now, as a %?",
    "3. Anything blocking you?",
  ].join("\n");

  return {
    subject: `Quick check-in: ${goalTitle}`,
    body: [
      `Quick check-in on *${goalTitle}* (${gap}). ${standing}`,
      "",
      questions,
      "",
      "Just reply in your own words — I'll do the rest.",
    ].join("\n"),
  };
}
