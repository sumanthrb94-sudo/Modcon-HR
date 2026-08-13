// What an organisation is allowed to save.
//
// Validation lives here rather than inside the handler because an invalid
// policy is not merely a bad request. An empty channel ladder produces
// check-ins with no rung to send on, which dispatch-checkins can only mark
// failed — so it is refused at the point of writing rather than discovered an
// hour later by whoever reads the logs.
//
// The messages are written to be read by a person: the Settings page shows
// them verbatim.

export interface PolicyInput {
  cadence_days: number;
  channel_ladder: string[];
  escalate_after_days: number;
  quiet_start: number;
  quiet_end: number;
  timezone: string;
}

/**
 * The progress_source enum minus 'system'. Nobody is ever *asked* on 'system'
 * — it is the provenance of events this app files for itself — so offering it
 * as a rung would queue check-ins nobody could answer.
 */
const CHANNELS = ["call", "chat", "email", "app"];

const isWholeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

const isHourOfDay = (value: unknown): value is number =>
  isWholeNumber(value) && value >= 0 && value <= 23;

function isKnownTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function validatePolicy(
  input: unknown,
): { ok: true; value: PolicyInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "a policy object is required" };
  }
  const p = input as Partial<PolicyInput>;

  if (!isWholeNumber(p.cadence_days) || p.cadence_days < 1) {
    return { ok: false, error: "cadence must be a whole number of days, at least 1" };
  }
  if (!isWholeNumber(p.escalate_after_days) || p.escalate_after_days < 1) {
    return { ok: false, error: "escalation must be a whole number of days, at least 1" };
  }

  // Checked one at a time rather than in a loop: a loop cannot narrow the
  // types, and each field has to be a number by the time it is returned.
  if (!isHourOfDay(p.quiet_start)) {
    return { ok: false, error: "quiet_start must be an hour between 0 and 23" };
  }
  if (!isHourOfDay(p.quiet_end)) {
    return { ok: false, error: "quiet_end must be an hour between 0 and 23" };
  }

  if (!Array.isArray(p.channel_ladder) || p.channel_ladder.length === 0) {
    return { ok: false, error: "choose at least one channel" };
  }
  for (const channel of p.channel_ladder) {
    if (!CHANNELS.includes(channel)) {
      return { ok: false, error: `${channel} is not a channel this system can ask on` };
    }
  }
  if (new Set(p.channel_ladder).size !== p.channel_ladder.length) {
    return { ok: false, error: "each channel may appear only once in the ladder" };
  }

  if (!isKnownTimezone(p.timezone)) {
    return { ok: false, error: "timezone must be a recognised IANA zone, e.g. Asia/Kolkata" };
  }

  // Rebuilt field by field rather than spread: the request body is not the
  // shape that reaches the database, and org_id in particular must come from
  // the verified identity, never from whatever the caller sent.
  return {
    ok: true,
    value: {
      cadence_days: p.cadence_days,
      channel_ladder: p.channel_ladder,
      escalate_after_days: p.escalate_after_days,
      quiet_start: p.quiet_start,
      quiet_end: p.quiet_end,
      timezone: p.timezone,
    },
  };
}
