// POST /functions/v1/ingest-voice
//
// Post-call webhook for the scheduled check-in agent (ElevenLabs Conversational
// AI or Twilio + your own STT). The agent asks three fixed questions:
//   1. What moved on <goal> since last time?
//   2. Where would you put it, as a percentage?
//   3. Anything blocking you?
//
// org_id / employee_id / goal_id ride along as dynamic variables set when the
// call is placed, so we never have to guess who was on the phone.
//
// Refuses to store anything without a live voice-consent row.

import { ingestProgress, serviceClient } from "../_shared/ingest.ts";
import { hmacSha256Hex, json, preflight, safeEqual, verifySharedSecret } from "../_shared/http.ts";

interface TranscriptTurn {
  role?: string;
  speaker?: string;
  message?: string;
  text?: string;
}

/** ElevenLabs sends `elevenlabs-signature: t=<unix>,v0=<hex hmac of "t.body">`. */
async function verifyElevenLabs(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
  const header = req.headers.get("elevenlabs-signature");
  if (!secret || !header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...rest] = p.trim().split("=");
      return [k, rest.join("=")];
    }),
  );
  if (!parts.t || !parts.v0) return false;

  // Reject replays older than 5 minutes.
  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = await hmacSha256Hex(secret, `${parts.t}.${rawBody}`);
  return safeEqual(parts.v0, expected);
}

function flattenTranscript(turns: TranscriptTurn[]): string {
  return turns
    .filter((t) => (t.role ?? t.speaker) !== "agent")
    .map((t) => (t.message ?? t.text ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const rawBody = await req.text();
  const authorised = (await verifyElevenLabs(req, rawBody)) ||
    verifySharedSecret(req, "VOICE_WEBHOOK_SECRET");
  if (!authorised) return json({ error: "bad signature" }, 401);

  let body: Record<string, any>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const data = body.data ?? body;
  const vars = data.conversation_initiation_client_data?.dynamic_variables ??
    data.dynamic_variables ?? data.metadata ?? {};

  const org_id = vars.org_id;
  const employee_id = vars.employee_id;
  const goal_id = vars.goal_id || undefined;
  const conversationId = data.conversation_id ?? data.call_sid ?? body.event_id;

  if (!org_id || !employee_id) {
    return json({ error: "call is missing org_id/employee_id dynamic variables" }, 400);
  }

  // Fail closed: no recorded consent, no stored transcript.
  const db = serviceClient();
  const { data: consent, error: consentError } = await db.rpc("has_channel_consent", {
    p_employee: employee_id,
    p_channel: "call",
  });
  if (consentError) {
    console.error("consent lookup failed", consentError);
    return json({ error: "consent lookup failed" }, 500);
  }
  if (!consent) {
    console.warn(`voice update discarded — no consent on file for employee ${employee_id}`);
    return json({ status: "discarded", reason: "no voice consent on file" }, 202);
  }

  const turns: TranscriptTurn[] = data.transcript ?? data.messages ?? [];
  const raw_text = typeof data.transcript === "string" ? data.transcript : flattenTranscript(turns);

  try {
    const result = await ingestProgress({
      org_id,
      employee_id,
      goal_id,
      source: "call",
      source_ref: conversationId ? `call:${conversationId}` : undefined,
      raw_text,
      raw_meta: {
        conversation_id: conversationId,
        duration_secs: data.metadata?.call_duration_secs ?? data.duration_secs ?? null,
        agent_id: data.agent_id ?? null,
        // Deliberately NOT storing the recording URL — the transcript is enough,
        // and audio is the part employees object to most.
      },
      occurred_at: data.metadata?.start_time_unix_secs
        ? new Date(data.metadata.start_time_unix_secs * 1000).toISOString()
        : undefined,
    });
    return json(result);
  } catch (err) {
    console.error("ingest-voice failed", err);
    return json({ error: (err as Error).message }, 500);
  }
});
