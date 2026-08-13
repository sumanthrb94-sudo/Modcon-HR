// GET  /functions/v1/checkin-policy — the caller's organisation's policy, or null
// PUT  /functions/v1/checkin-policy — upsert it
//
// The one door between ModCon's Settings page and this subsystem, and the only
// function here whose caller is a person rather than a webhook.
//
// The caller arrives holding a Firebase ID token. That proves a uid and
// nothing else: the organisation and the role come from Firestore, never from
// the request body. An org_id taken from user-supplied JSON would let anyone
// rewrite any tenant's policy.

import { serviceClient } from "../_shared/ingest.ts";
import { json, preflight } from "../_shared/http.ts";
import { googleKeySource, verifyFirebaseToken } from "../_shared/firebaseAuth.ts";
import { resolveCaller } from "../_shared/firestoreUser.ts";
import { validatePolicy } from "../_shared/policyInput.ts";

interface Authorised {
  orgId: string;
}

/**
 * Every refusal here is deliberate about which one it is, because they mean
 * different things to whoever is reading:
 *
 *   401  we do not know who you are
 *   403  we know, and you may not do this
 *   503  we could not find out, and are not going to guess
 */
async function authorise(req: Request): Promise<Authorised | Response> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return json({ error: "unauthorised" }, 401);

  let uid: string;
  try {
    ({ uid } = await verifyFirebaseToken(token, googleKeySource));
  } catch (err) {
    // The reason is logged, never returned: telling an unauthenticated
    // stranger which check they failed tells them what to fix.
    console.warn("token rejected:", (err as Error).message);
    return json({ error: "unauthorised" }, 401);
  }

  let caller;
  try {
    caller = await resolveCaller(uid);
  } catch (err) {
    // The credential is missing or refused. This must never degrade into
    // trusting the token's own contents — that turns an outage into a
    // privilege escalation.
    console.error("could not authorise caller:", (err as Error).message);
    return json({ error: "authorisation unavailable" }, 503);
  }

  if (!caller) return json({ error: "this account belongs to no organisation" }, 403);
  if (!caller.isHrAdmin) {
    return json({ error: "only an administrator of this organisation can change check-ins" }, 403);
  }

  const { data, error } = await serviceClient()
    .rpc("org_id_for_key", { p_org_key: caller.orgKey });
  if (error) {
    console.error("org lookup failed:", error.message);
    return json({ error: "could not resolve organisation" }, 502);
  }

  return { orgId: data as unknown as string };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const authorised = await authorise(req);
  if (authorised instanceof Response) return authorised;

  const { orgId } = authorised;
  const db = serviceClient();

  // The organisation's own policy is the one with neither an employee nor a
  // goal attached — the base of the goal > employee > org resolution.
  if (req.method === "GET") {
    const { data, error } = await db
      .from("progress_checkin_policy")
      .select("cadence_days, channel_ladder, escalate_after_days, quiet_start, quiet_end, timezone")
      .eq("org_id", orgId)
      .is("employee_id", null)
      .is("goal_id", null)
      .maybeSingle();
    if (error) {
      console.error("policy read failed:", error.message);
      return json({ error: "could not read the policy" }, 502);
    }
    // null, not a default. An organisation that has configured nothing is
    // chased not at all, and the page says so in those words rather than
    // showing a form that looks already saved.
    return json({ policy: data ?? null });
  }

  if (req.method === "PUT") {
    const body = await req.json().catch(() => null);
    const checked = validatePolicy(body);
    if (!checked.ok) return json({ error: checked.error }, 400);

    const { error } = await db
      .from("progress_checkin_policy")
      .upsert({
        org_id: orgId,
        employee_id: null,
        goal_id: null,
        active: true,
        ...checked.value,
      });
    if (error) {
      console.error("policy write failed:", error.message);
      return json({ error: "could not save the policy" }, 502);
    }
    return json({ policy: checked.value });
  }

  return json({ error: "method not allowed" }, 405);
});
