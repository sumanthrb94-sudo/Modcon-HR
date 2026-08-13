// POST /functions/v1/extract-progress
// The generic entry point. Channel adapters call ingestProgress() directly;
// this endpoint exists for the in-app form, backfills, and manual testing.
//
// Auth: service-role key, or a shared secret in x-webhook-secret.

import { ingestProgress } from "../_shared/ingest.ts";
import { json, preflight, verifySharedSecret } from "../_shared/http.ts";
import type { IngestPayload, ProgressSource } from "../_shared/types.ts";

const VALID_SOURCES: ProgressSource[] = ["call", "chat", "email", "app", "system"];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorised = (serviceKey && auth === `Bearer ${serviceKey}`) ||
    verifySharedSecret(req, "INGEST_SHARED_SECRET");
  if (!authorised) return json({ error: "unauthorised" }, 401);

  let payload: IngestPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  for (const field of ["org_id", "employee_id", "source", "raw_text"] as const) {
    if (!payload[field]) return json({ error: `missing field: ${field}` }, 400);
  }
  if (!VALID_SOURCES.includes(payload.source)) {
    return json({ error: `source must be one of ${VALID_SOURCES.join(", ")}` }, 400);
  }

  try {
    const result = await ingestProgress(payload);
    return json(result, result.status === "ignored" ? 202 : 200);
  } catch (err) {
    console.error("extract-progress failed", err);
    return json({ error: (err as Error).message }, 500);
  }
});
