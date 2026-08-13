// POST /functions/v1/dispatch-checkins
//
// The scheduler. Runs hourly from pg_cron and does four things:
//   1. escalate check-ins nobody answered to the next channel on the ladder
//   2. claim goals that are due (atomically — concurrent runs cannot double-send)
//   3. send each one, honouring quiet hours, weekends and voice consent
//   4. record what happened
//
// Nothing here decides cadence or channel order; that lives in
// progress_checkin_policy, so it stays a product decision.
//
// Supports { dry_run: true } so you can watch a cycle before it messages anyone.

import { serviceClient } from "../_shared/ingest.ts";
import { json, preflight, verifySharedSecret } from "../_shared/http.ts";
import { buildPrompt, canSendNow, requiresConsent } from "../_shared/schedule.ts";
import { send, type Recipient } from "../_shared/senders.ts";
import type { ProgressSource } from "../_shared/types.ts";

const BATCH_LIMIT = Number(Deno.env.get("DISPATCH_BATCH_LIMIT") ?? "50");
const SKIP_WEEKENDS = (Deno.env.get("DISPATCH_SKIP_WEEKENDS") ?? "true") !== "false";
const EMPLOYEES_TABLE = Deno.env.get("EMPLOYEES_TABLE") ?? "employees";

interface Outcome {
  goal_id: string;
  channel: ProgressSource;
  result: "sent" | "deferred" | "failed" | "skipped" | "would_send";
  detail?: string;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorised = (serviceKey && auth === `Bearer ${serviceKey}`) ||
    verifySharedSecret(req, "DISPATCH_SHARED_SECRET");
  if (!authorised) return json({ error: "unauthorised" }, 401);

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dry_run === true;
  const now = new Date();
  const db = serviceClient();

  // -- 1. Escalate anything that has gone unanswered long enough -------------
  const { data: escalated, error: escalateError } = await db.rpc("escalate_stale_checkins", {
    p_limit: BATCH_LIMIT,
  });
  if (escalateError) console.error("escalation failed", escalateError);

  // -- 2. Claim newly due goals ---------------------------------------------
  const { data: claimed, error: claimError } = dryRun
    ? await db.from("checkin_due").select("*").limit(BATCH_LIMIT)
    : await db.rpc("claim_due_checkins", { p_limit: BATCH_LIMIT });
  if (claimError) {
    console.error("claim failed", claimError);
    return json({ error: claimError.message }, 500);
  }

  // Escalated rows are already queued on their new channel; send them too.
  const pending = [...(escalated ?? []), ...(claimed ?? [])];
  if (pending.length === 0) {
    return json({ now: now.toISOString(), dry_run: dryRun, claimed: 0, outcomes: [] });
  }

  // -- 3. Gather everything the senders need, in two queries not 2N ---------
  const goalIds = [...new Set(pending.map((c: any) => c.goal_id))];
  const employeeIds = [...new Set(pending.map((c: any) => c.employee_id))];

  const [{ data: dueRows }, { data: people }] = await Promise.all([
    db.from("checkin_due").select("*").in("goal_id", goalIds),
    db.from(EMPLOYEES_TABLE)
      .select("id, email, slack_user_id, phone, full_name")
      .in("id", employeeIds),
  ]);

  // Escalated rows have dropped out of checkin_due (they have an open check-in),
  // so fall back to the goal record for the title.
  const { data: goalRows } = await db
    .from(Deno.env.get("GOALS_TABLE") ?? "goals")
    .select("id, title")
    .in("id", goalIds);

  const dueByGoal = new Map((dueRows ?? []).map((d: any) => [d.goal_id, d]));
  const titleByGoal = new Map((goalRows ?? []).map((g: any) => [g.id, g.title]));
  const personById = new Map((people ?? []).map((p: any) => [p.id, p as Recipient]));

  // -- 4. Send ---------------------------------------------------------------
  const outcomes: Outcome[] = [];

  for (const checkin of pending) {
    const goalId = checkin.goal_id;
    const channel: ProgressSource = checkin.channel ?? checkin.first_channel;
    const due = dueByGoal.get(goalId);
    const person = personById.get(checkin.employee_id);

    const record = (result: Outcome["result"], detail?: string) =>
      outcomes.push({ goal_id: goalId, channel, result, detail });

    if (!person) {
      record("failed", "employee record not found");
      if (!dryRun) {
        await db.from("progress_checkin")
          .update({ state: "failed", last_error: "employee record not found" })
          .eq("id", checkin.id);
      }
      continue;
    }

    // Quiet hours / weekend: leave it queued and try again next run.
    const window = canSendNow(
      now,
      {
        quiet_start: due?.quiet_start ?? checkin.quiet_start ?? 19,
        quiet_end: due?.quiet_end ?? checkin.quiet_end ?? 9,
        timezone: due?.timezone ?? checkin.timezone ?? "Asia/Kolkata",
      },
      { skipWeekends: SKIP_WEEKENDS },
    );
    if (!window.ok && channel !== "app") {
      record("deferred", window.reason);
      continue;
    }

    // Voice without consent is never attempted — skip straight down the ladder.
    if (requiresConsent(channel)) {
      const { data: consented } = await db.rpc("has_channel_consent", {
        p_employee: checkin.employee_id,
        p_channel: "call",
      });
      if (!consented) {
        record("skipped", "no voice consent on file");
        if (!dryRun) {
          await db.from("progress_checkin")
            .update({ state: "skipped", last_error: "no voice consent on file" })
            .eq("id", checkin.id);
        }
        continue;
      }
    }

    const goalTitle = due?.goal_title ?? titleByGoal.get(goalId) ?? "your goal";
    const prompt = buildPrompt(
      goalTitle,
      due?.current_percent ?? null,
      due?.days_since_update ?? 9999,
      channel,
    );

    if (dryRun) {
      record("would_send", `${person.full_name ?? checkin.employee_id}: ${prompt.subject}`);
      continue;
    }

    try {
      const { external_ref } = await send(channel, {
        org_id: checkin.org_id,
        goal_id: goalId,
        goal_title: goalTitle,
        recipient: { ...person, employee_id: checkin.employee_id },
        prompt,
      });

      await db.from("progress_checkin")
        .update({ state: "sent", sent_at: new Date().toISOString(), external_ref, last_error: null })
        .eq("id", checkin.id);
      record("sent");
    } catch (err) {
      const detail = (err as Error).message;
      console.error(`check-in send failed for goal ${goalId} on ${channel}: ${detail}`);
      // Stay 'sent' so escalation picks it up rather than retrying the same
      // broken channel forever.
      await db.from("progress_checkin")
        .update({ state: "sent", sent_at: new Date().toISOString(), last_error: detail })
        .eq("id", checkin.id);
      record("failed", detail);
    }
  }

  const summary = outcomes.reduce<Record<string, number>>((acc, o) => {
    acc[o.result] = (acc[o.result] ?? 0) + 1;
    return acc;
  }, {});

  return json({
    now: now.toISOString(),
    dry_run: dryRun,
    escalated: escalated?.length ?? 0,
    claimed: claimed?.length ?? 0,
    summary,
    outcomes,
  });
});
