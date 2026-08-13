// POST /functions/v1/ingest-slack
//
// Handles three things from one endpoint:
//   1. url_verification  — Slack's setup handshake
//   2. /progress GOAL-12 60% blocked on vendor  — fast path, no model call
//   3. thread replies to the scheduled check-in prompt — full extraction
//
// Slack retries aggressively on slow responses, so the extraction runs after
// the 200 has already gone out.

import { applyDirect, ingestProgress, serviceClient } from "../_shared/ingest.ts";
import { isUuid, parseSlashCommand } from "../_shared/parse.ts";
import { hmacSha256Hex, json, safeEqual } from "../_shared/http.ts";

async function verifySlack(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("SLACK_SIGNING_SECRET");
  const ts = req.headers.get("x-slack-request-timestamp");
  const sig = req.headers.get("x-slack-signature");
  if (!secret || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = `v0=${await hmacSha256Hex(secret, `v0:${ts}:${rawBody}`)}`;
  return safeEqual(sig, expected);
}

/**
 * Which organisation owns this Slack workspace.
 *
 * A Slack user id is unique inside a workspace, not across Slack, and this
 * application serves many organisations — so the id alone does not identify a
 * person. An unmapped workspace resolves to nobody rather than to whichever
 * tenant happened to match: a workspace no organisation has claimed is not one
 * whose messages may be filed against anybody.
 */
async function resolveOrgBySlackTeam(teamId: string): Promise<string | null> {
  if (!teamId) return null;
  const db = serviceClient();
  const { data } = await db
    .from("org_directory")
    .select("org_id")
    .eq("slack_team_id", teamId)
    .maybeSingle();
  return (data as { org_id: string } | null)?.org_id ?? null;
}

/** Map a Slack user to a ModCon employee, within that workspace's organisation. */
async function resolveEmployee(slackUserId: string, teamId: string) {
  const orgId = await resolveOrgBySlackTeam(teamId);
  if (!orgId) {
    console.warn(`slack workspace ${teamId || "(none supplied)"} is not mapped to an organisation`);
    return null;
  }

  const db = serviceClient();
  const { data } = await db
    .from(Deno.env.get("EMPLOYEES_TABLE") ?? "employees")
    .select("id, org_id")
    .eq("org_id", orgId)
    .eq("slack_user_id", slackUserId)
    .maybeSingle();
  return data as { id: string; org_id: string } | null;
}

async function handleEvent(payload: Record<string, any>) {
  const event = payload.event ?? {};
  if (event.type !== "message" || event.bot_id || event.subtype) return;
  // Only replies inside a check-in thread count as updates.
  if (!event.thread_ts || event.thread_ts === event.ts) return;

  const employee = await resolveEmployee(event.user, payload.team_id ?? "");
  if (!employee) {
    console.warn(`no ModCon employee mapped to slack user ${event.user} in team ${payload.team_id}`);
    return;
  }

  await ingestProgress({
    org_id: employee.org_id,
    employee_id: employee.id,
    source: "chat",
    source_ref: `slack:${event.channel}:${event.ts}`,
    raw_text: event.text ?? "",
    raw_meta: { channel: event.channel, thread_ts: event.thread_ts, team: payload.team_id },
    occurred_at: new Date(Number(event.ts) * 1000).toISOString(),
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const rawBody = await req.text();
  if (!(await verifySlack(req, rawBody))) return json({ error: "bad signature" }, 401);

  const contentType = req.headers.get("content-type") ?? "";

  // ---- Slash command (form-encoded) --------------------------------------
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(rawBody);
    // Slack sends team_id on the slash-command form as well as on events.
    const employee = await resolveEmployee(form.get("user_id") ?? "", form.get("team_id") ?? "");
    if (!employee) {
      return json({ response_type: "ephemeral", text: "I couldn't match your Slack account to a ModCon profile." });
    }

    const parsed = parseSlashCommand(form.get("text") ?? "");
    if (!parsed) {
      return json({
        response_type: "ephemeral",
        text: "Try: `/progress GOAL-12 60% blocked on vendor sign-off`",
      });
    }

    // The person typed the number themselves. A uuid goes straight in; a human
    // ref like "GOAL-12" still needs the extractor to match it to a goal.
    const common = {
      org_id: employee.org_id,
      employee_id: employee.id,
      source: "chat" as const,
      source_ref: `slack-cmd:${form.get("trigger_id")}`,
      raw_text: form.get("text") ?? "",
      raw_meta: { via: "slash_command", parsed },
    };

    queueMicrotask(() =>
      (isUuid(parsed.goalRef)
        ? applyDirect({ ...common, goal_id: parsed.goalRef, percent: parsed.percent, blockers: parsed.blockers, summary: parsed.note })
        : ingestProgress(common)
      ).catch((e) => console.error("slash ingest failed", e))
    );

    return json({
      response_type: "ephemeral",
      text: `Logged ${parsed.percent}%${parsed.blockers.length ? ` — blocked on ${parsed.blockers[0]}` : ""}.`,
    });
  }

  // ---- Events API (JSON) --------------------------------------------------
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  if (payload.type === "url_verification") {
    return new Response(payload.challenge, { headers: { "content-type": "text/plain" } });
  }

  // Ack first, extract after — Slack retries anything slower than 3s.
  queueMicrotask(() => handleEvent(payload).catch((e) => console.error("slack event failed", e)));
  return json({ ok: true });
});
