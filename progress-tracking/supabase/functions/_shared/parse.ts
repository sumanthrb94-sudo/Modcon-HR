// Pure channel parsing helpers — no Deno, no network, unit testable.

const SLASH_PATTERN = /^\s*(?<goal>[A-Za-z][A-Za-z0-9-]*)?\s*(?<percent>\d{1,3})\s*%?\s*(?<rest>.*)$/;
const GOAL_ADDRESS = /goal\+([0-9a-fA-F-]{36})@/;

export interface SlashUpdate {
  goalRef: string | null;
  percent: number;
  blockers: string[];
  note: string;
}

/** `/progress GOAL-12 60% blocked on vendor sign-off` */
export function parseSlashCommand(text: string): SlashUpdate | null {
  const m = SLASH_PATTERN.exec(text ?? "");
  if (!m?.groups?.percent) return null;

  const percent = Number(m.groups.percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;

  const rest = (m.groups.rest ?? "").trim();
  const blocked = /blocked (?:on|by) (.+)/i.exec(rest);

  return {
    goalRef: m.groups.goal ?? null,
    percent,
    blockers: blocked ? [blocked[1].trim()] : [],
    note: rest,
  };
}

/**
 * Strip the quoted original so the model reads only what the person typed.
 * Covers the common client conventions; anything left over is harmless context.
 */
export function stripQuotedReply(text: string): string {
  const cutPatterns = [
    /^On .+ wrote:$/m,
    /^-{2,}\s*Original Message\s*-{2,}$/im,
    /^_{5,}$/m,
    /^From:\s.+$/m,
    /^>{1,}/m,
    /^Sent from my /m,
  ];
  let cut = text.length;
  for (const pattern of cutPatterns) {
    const m = pattern.exec(text);
    if (m?.index !== undefined && m.index < cut) cut = m.index;
  }
  return text.slice(0, cut).trim();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Human goal refs like "GOAL-12" must never reach a uuid column. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Pull the goal id out of a `goal+<uuid>@updates.example.com` recipient. */
export function extractGoalId(...addresses: (string | undefined | null)[]): string | undefined {
  for (const addr of addresses) {
    const m = addr ? GOAL_ADDRESS.exec(addr) : null;
    if (m) return m[1].toLowerCase();
  }
  return undefined;
}
