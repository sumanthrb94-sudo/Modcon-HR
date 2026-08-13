// POST /functions/v1/ingest-email
//
// Inbound webhook for replies to the scheduled update request.
// Outbound mail is sent with a per-goal reply-to address:
//
//   goal+<goal_id>@updates.yourdomain.com
//
// so the employee just hits reply and types — no links, no login, no form.
// Signature verification follows the Svix scheme Resend uses.

import { ingestProgress, serviceClient } from "../_shared/ingest.ts";
import { extractGoalId, stripQuotedReply } from "../_shared/parse.ts";
import { json, preflight, safeEqual, verifySharedSecret } from "../_shared/http.ts";

/** Svix: base64(HMAC-SHA256(secret, "id.timestamp.body")), header may list several. */
async function verifySvix(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sigHeader = req.headers.get("svix-signature");
  if (!secret || !id || !ts || !sigHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;

  const keyBytes = secret.startsWith("whsec_")
    ? Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(secret);

  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${rawBody}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  return sigHeader
    .split(" ")
    .map((p) => p.split(",")[1] ?? "")
    .some((candidate) => safeEqual(candidate, expected));
}

async function resolveEmployeeByEmail(email: string) {
  const db = serviceClient();
  const { data } = await db
    .from(Deno.env.get("EMPLOYEES_TABLE") ?? "employees")
    .select("id, org_id")
    .ilike("email", email)
    .maybeSingle();
  return data as { id: string; org_id: string } | null;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const rawBody = await req.text();
  const authorised = (await verifySvix(req, rawBody)) || verifySharedSecret(req, "EMAIL_WEBHOOK_SECRET");
  if (!authorised) return json({ error: "bad signature" }, 401);

  let body: Record<string, any>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const mail = body.data ?? body;
  const toList: string[] = [mail.to, mail.cc].flat().filter(Boolean).map(String);
  const from = String(Array.isArray(mail.from) ? mail.from[0] : mail.from ?? "");
  const senderEmail = (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();

  const goal_id = extractGoalId(...toList, mail.headers?.["reply-to"]);
  if (!goal_id) return json({ status: "ignored", reason: "no goal address in recipients" }, 202);

  const employee = await resolveEmployeeByEmail(senderEmail);
  if (!employee) {
    console.warn(`inbound mail from unknown sender ${senderEmail}`);
    return json({ status: "ignored", reason: "sender not recognised" }, 202);
  }

  const rawText = String(mail.text ?? mail.plain ?? "");
  const cleaned = stripQuotedReply(rawText);
  if (!cleaned) return json({ status: "ignored", reason: "reply was empty after quote stripping" }, 202);

  try {
    const result = await ingestProgress({
      org_id: employee.org_id,
      employee_id: employee.id,
      goal_id,
      source: "email",
      source_ref: `email:${mail.message_id ?? mail.headers?.["message-id"] ?? body.created_at}`,
      raw_text: cleaned,
      raw_meta: { subject: mail.subject ?? null, from: senderEmail },
      occurred_at: body.created_at ?? undefined,
    });
    return json(result);
  } catch (err) {
    console.error("ingest-email failed", err);
    return json({ error: (err as Error).message }, 500);
  }
});
