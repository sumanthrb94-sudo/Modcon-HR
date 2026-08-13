# Per-organisation check-in policy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each organisation using ModCon HR configure its own progress check-in cadence, channels and quiet hours, through a Settings page authenticated with the Firebase account the user already has.

**Architecture:** The React app stays Firebase-only and calls one new Supabase edge function over `fetch`, sending the user's Firebase ID token. The function verifies that token against Google's public JWKS (identity), then reads Firestore `users/{uid}` with a service-account credential (authorisation — org and role), maps `orgKey` to `org_id` through `org_directory`, and reads or upserts the row in `progress_checkin_policy` with the service role. Postgres stays the single source of truth; no Supabase SDK enters the app bundle.

**Tech Stack:** Deno edge functions (Supabase), PostgreSQL 15+, React 18 + TypeScript 5.5 + Vite, Tailwind, Firebase Auth + Firestore REST.

**Spec:** [docs/checkin-policy-spec.md](../../checkin-policy-spec.md)

## Global Constraints

- **No platform default cadence.** An organisation with no policy row is chased not at all. `checkin_due` already enforces this via `pol.id is not null`; no task may add a fallback.
- **`orgKey` comes from the verified identity, never from the request body.** Any handler reading an org from user-supplied JSON is a defect.
- **A missing credential is a refusal, never a downgrade.** If the service account is absent or rejected, respond `503`. Never fall back to trusting the token's own contents.
- **An account with no `orgId` resolves to nobody, never the default tenant** (CLAUDE.md, *Auth & roles*).
- **`isHrAdmin` is `role in ('hr','admin')`**, matching `isOrgAdmin()` in `firestore.rules`.
- **Firebase project id is `modcon-hr`**; token `iss` must be `https://securetoken.google.com/modcon-hr` and `aud` must be `modcon-hr`.
- **Type-check with `npm run typecheck:progress`** (edge functions) and `npx tsc -b` (app). Both must pass before any commit.
- **No new npm dependency** in the root `package.json`.

## Verification boundary — read before starting

Tasks 1, 2 and 5 are fully verifiable on this machine. Tasks 3, 4 and 6 are **not**, and the plan does not pretend otherwise:

| Task | Verified by | Needs credentials? |
| --- | --- | --- |
| 1 `org_directory` lookup | `psql` against a local cluster | No |
| 2 Token verification | `node --test`, injected keys | No |
| 3 Firestore read | Unit tests with a stubbed fetch only | **Yes** — real read needs a service account |
| 4 `checkin-policy` function | `supabase start` + `curl`, with a stubbed identity | Partly |
| 5 Settings page | `npx tsc -b`, manual render | No |
| 6 End-to-end | Nothing here | **Yes** — Supabase project + service account |

Stop after Task 5 and report if credentials have not arrived. Do not mark Task 6 complete on the basis of unit tests.

---

### Task 1: `org_directory` lookup by tenant key

**Files:**
- Create: `progress-tracking/supabase/migrations/20260813000700_org_directory_lookup.sql`
- Test: `progress-tracking/test/40_org_directory.sql`

**Interfaces:**
- Consumes: `public.org_directory` (`org_id`, `org_key`, `slack_team_id`) from `20260813000060`, already on `main`.
- Produces: `public.org_id_for_key(p_org_key text) returns uuid` — creates the row if absent, returns the existing `org_id` otherwise. Used by Task 4.

- [ ] **Step 1: Write the failing test**

Create `progress-tracking/test/40_org_directory.sql`:

```sql
\set ON_ERROR_STOP on
begin;

do $$
declare first_id uuid; second_id uuid;
begin
  first_id  := public.org_id_for_key('Acme');
  second_id := public.org_id_for_key('acme');
  if first_id is null then
    raise exception 'TEST 1 FAILED — no org_id returned';
  end if;
  if first_id <> second_id then
    raise exception 'TEST 1 FAILED — case variants produced two organisations: % and %', first_id, second_id;
  end if;
  raise notice 'TEST 1 ok — a tenant key resolves to one organisation regardless of case';
end $$;

do $$
declare a uuid; b uuid;
begin
  a := public.org_id_for_key('one');
  b := public.org_id_for_key('two');
  if a = b then
    raise exception 'TEST 2 FAILED — two tenant keys resolved to the same organisation';
  end if;
  raise notice 'TEST 2 ok — different tenant keys are different organisations';
end $$;

rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd progress-tracking
psql -d modcon_test -f test/40_org_directory.sql
```

Expected: `ERROR: function public.org_id_for_key(unknown) does not exist`.

- [ ] **Step 3: Write the minimal migration**

Create `progress-tracking/supabase/migrations/20260813000700_org_directory_lookup.sql`:

```sql
-- Resolve a ModCon tenant key to this subsystem's organisation id, creating the
-- row the first time that tenant configures anything.
--
-- Creation lives here rather than in the edge function so that "which uuid is
-- this tenant" has exactly one answer, arrived at the same way whoever asks.
create or replace function public.org_id_for_key(p_org_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found uuid;
begin
  if p_org_key is null or btrim(p_org_key) = '' then
    raise exception 'org key is required';
  end if;

  select org_id into found
    from public.org_directory
   where lower(org_key) = lower(btrim(p_org_key));

  if found is not null then
    return found;
  end if;

  insert into public.org_directory (org_key)
  values (btrim(p_org_key))
  on conflict do nothing
  returning org_id into found;

  -- A concurrent caller may have won the insert; the unique index makes that
  -- safe, and re-reading is how this stays idempotent rather than erroring.
  if found is null then
    select org_id into found
      from public.org_directory
     where lower(org_key) = lower(btrim(p_org_key));
  end if;

  return found;
end;
$$;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
psql -d modcon_test -f supabase/migrations/20260813000700_org_directory_lookup.sql
psql -d modcon_test -f test/40_org_directory.sql
```

Expected: `TEST 1 ok`, `TEST 2 ok`, no `ERROR`.

- [ ] **Step 5: Add it to the README test list**

In `progress-tracking/README.md`, after the `30_tenant_isolation.sql` line:

```
psql -d modcon_test -f test/40_org_directory.sql               #  2 pass
```

- [ ] **Step 6: Commit**

```bash
git add progress-tracking/supabase/migrations/20260813000700_org_directory_lookup.sql \
        progress-tracking/test/40_org_directory.sql progress-tracking/README.md
git commit -m "feat(progress): resolve a ModCon tenant key to one organisation id"
```

---

### Task 2: Verify a Firebase ID token

**Files:**
- Create: `progress-tracking/supabase/functions/_shared/firebaseAuth.ts`
- Test: `progress-tracking/test/firebase-auth.test.ts`

**Interfaces:**
- Produces:
  - `export interface FirebaseKeySource { fetchKeys(): Promise<Record<string, JsonWebKey>> }`
  - `export async function verifyFirebaseToken(token: string, keys: FirebaseKeySource, now?: number): Promise<{ uid: string }>` — throws `Error` with a message naming the failure.
  - `export const googleKeySource: FirebaseKeySource` — the real JWKS endpoint, cached.

Keys are injected so the tests need no network. `now` is injectable so expiry is testable without waiting.

- [ ] **Step 1: Write the failing test**

Create `progress-tracking/test/firebase-auth.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { verifyFirebaseToken, type FirebaseKeySource } from "../supabase/functions/_shared/firebaseAuth.ts";

const PROJECT = "modcon-hr";

/** Sign a token with a throwaway key pair so the test controls every claim. */
async function makeToken(
  claims: Record<string, unknown>,
  kid = "test-key",
): Promise<{ token: string; source: FirebaseKeySource }> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const b64 = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const header = b64(JSON.stringify({ alg: "RS256", kid }));
  const body = b64(JSON.stringify(claims));
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${header}.${body}`),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { token: `${header}.${body}.${sigB64}`, source: { fetchKeys: async () => ({ [kid]: jwk }) } };
}

const validClaims = (over: Record<string, unknown> = {}) => ({
  iss: `https://securetoken.google.com/${PROJECT}`,
  aud: PROJECT,
  sub: "uid-123",
  exp: 2000,
  iat: 1000,
  ...over,
});

test("accepts a well-formed token and returns the uid", async () => {
  const { token, source } = await makeToken(validClaims());
  assert.deepEqual(await verifyFirebaseToken(token, source, 1500), { uid: "uid-123" });
});

test("rejects an expired token", async () => {
  const { token, source } = await makeToken(validClaims());
  await assert.rejects(() => verifyFirebaseToken(token, source, 3000), /expired/i);
});

test("rejects a token for another Firebase project", async () => {
  const { token, source } = await makeToken(validClaims({ aud: "someone-else" }));
  await assert.rejects(() => verifyFirebaseToken(token, source, 1500), /audience/i);
});

test("rejects a token with the wrong issuer", async () => {
  const { token, source } = await makeToken(validClaims({ iss: "https://evil.example.com" }));
  await assert.rejects(() => verifyFirebaseToken(token, source, 1500), /issuer/i);
});

test("rejects a token whose kid is not published", async () => {
  const { token } = await makeToken(validClaims());
  const empty: FirebaseKeySource = { fetchKeys: async () => ({}) };
  await assert.rejects(() => verifyFirebaseToken(token, empty, 1500), /signing key/i);
});

test("rejects a tampered payload", async () => {
  const { token, source } = await makeToken(validClaims());
  const [h, , s] = token.split(".");
  const forged = btoa(JSON.stringify(validClaims({ sub: "somebody-else" })))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await assert.rejects(() => verifyFirebaseToken(`${h}.${forged}.${s}`, source, 1500), /signature/i);
});

test("rejects a token with no subject", async () => {
  const { token, source } = await makeToken(validClaims({ sub: "" }));
  await assert.rejects(() => verifyFirebaseToken(token, source, 1500), /subject/i);
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
node --experimental-strip-types --test progress-tracking/test/firebase-auth.test.ts
```

Expected: FAIL — cannot find module `firebaseAuth.ts`.

- [ ] **Step 3: Write the implementation**

Create `progress-tracking/supabase/functions/_shared/firebaseAuth.ts`:

```ts
// Verifying who is calling.
//
// A Firebase ID token is an RS256 JWT signed by Google. Verifying it needs no
// secret — only Google's published keys — which is why identity and
// authorisation are split: this file establishes the uid and nothing else.
// What that uid is allowed to do is a Firestore read, in firestoreUser.ts.

const PROJECT_ID = "modcon-hr";
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export interface FirebaseKeySource {
  fetchKeys(): Promise<Record<string, JsonWebKey>>;
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

/**
 * Throws on anything short of a valid, unexpired token for this project.
 * Every rejection names its reason: these messages are logged, never returned
 * to the caller, who gets a bare 401.
 */
export async function verifyFirebaseToken(
  token: string,
  keys: FirebaseKeySource,
  now: number = Math.floor(Date.now() / 1000),
): Promise<{ uid: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeSegment(headerB64) as { alg?: string; kid?: string };
  if (header.alg !== "RS256") throw new Error(`unexpected algorithm ${header.alg}`);
  if (!header.kid) throw new Error("token names no signing key");

  const published = await keys.fetchKeys();
  const jwk = published[header.kid];
  if (!jwk) throw new Error("token names a signing key Google does not publish");

  const key = await crypto.subtle.importKey(
    "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key, base64UrlToBytes(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!ok) throw new Error("signature does not verify");

  const claims = decodeSegment(payloadB64) as {
    iss?: string; aud?: string; sub?: string; exp?: number;
  };
  if (claims.iss !== ISSUER) throw new Error(`unexpected issuer ${claims.iss}`);
  if (claims.aud !== PROJECT_ID) throw new Error(`unexpected audience ${claims.aud}`);
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("token expired");
  if (!claims.sub) throw new Error("token carries no subject");

  return { uid: claims.sub };
}

/** Google's live keys, cached until they expire. */
export const googleKeySource: FirebaseKeySource = (() => {
  let cached: Record<string, JsonWebKey> | null = null;
  let expiresAt = 0;
  return {
    async fetchKeys() {
      if (cached && Date.now() < expiresAt) return cached;
      const res = await fetch(JWKS_URL);
      if (!res.ok) throw new Error(`could not fetch Google signing keys (${res.status})`);
      const body = await res.json() as { keys: (JsonWebKey & { kid: string })[] };
      cached = Object.fromEntries(body.keys.map((k) => [k.kid, k]));
      const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1];
      expiresAt = Date.now() + (Number(maxAge ?? 3600) * 1000);
      return cached;
    },
  };
})();
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --experimental-strip-types --test progress-tracking/test/firebase-auth.test.ts
npm run typecheck:progress
```

Expected: 7 pass, 0 fail; type-check clean.

- [ ] **Step 5: Add the suite to `test:progress`**

In root `package.json`, extend the script:

```json
"test:progress": "node --experimental-strip-types --test progress-tracking/test/pure.test.ts progress-tracking/test/schedule.test.ts progress-tracking/test/firebase-auth.test.ts"
```

- [ ] **Step 6: Commit**

```bash
git add progress-tracking/supabase/functions/_shared/firebaseAuth.ts \
        progress-tracking/test/firebase-auth.test.ts package.json
git commit -m "feat(progress): verify Firebase ID tokens against Google's published keys"
```

---

### Task 3: Read the caller's organisation and role from Firestore

**Files:**
- Create: `progress-tracking/supabase/functions/_shared/firestoreUser.ts`
- Test: `progress-tracking/test/firestore-user.test.ts`

**Interfaces:**
- Consumes: nothing from Task 2 at runtime; both are called in sequence by Task 4.
- Produces:
  - `export interface Caller { orgKey: string; isHrAdmin: boolean }`
  - `export function parseUserDocument(doc: FirestoreDocument | null): Caller | null`
  - `export async function resolveCaller(uid: string, fetchImpl?: typeof fetch): Promise<Caller | null>` — `null` when the user document is missing or carries no `orgId`. Throws when the credential is missing or rejected, so Task 4 can answer `503` rather than `403`.

- [ ] **Step 1: Write the failing test**

Create `progress-tracking/test/firestore-user.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseUserDocument } from "../supabase/functions/_shared/firestoreUser.ts";

test("reads orgId and an hr role", () => {
  assert.deepEqual(
    parseUserDocument({ fields: { orgId: { stringValue: "acme" }, role: { stringValue: "hr" } } }),
    { orgKey: "acme", isHrAdmin: true },
  );
});

test("treats the platform admin role as an org administrator", () => {
  assert.deepEqual(
    parseUserDocument({ fields: { orgId: { stringValue: "acme" }, role: { stringValue: "admin" } } }),
    { orgKey: "acme", isHrAdmin: true },
  );
});

test("an employee is not an administrator", () => {
  assert.deepEqual(
    parseUserDocument({ fields: { orgId: { stringValue: "acme" }, role: { stringValue: "employee" } } }),
    { orgKey: "acme", isHrAdmin: false },
  );
});

test("a manager is not an org administrator", () => {
  assert.deepEqual(
    parseUserDocument({ fields: { orgId: { stringValue: "acme" }, role: { stringValue: "manager" } } }),
    { orgKey: "acme", isHrAdmin: false },
  );
});

test("an account with no orgId resolves to nobody, not the default tenant", () => {
  assert.equal(parseUserDocument({ fields: { role: { stringValue: "hr" } } }), null);
});

test("an empty orgId resolves to nobody", () => {
  assert.equal(parseUserDocument({ fields: { orgId: { stringValue: "" }, role: { stringValue: "hr" } } }), null);
});

test("a missing document resolves to nobody", () => {
  assert.equal(parseUserDocument(null), null);
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
node --experimental-strip-types --test progress-tracking/test/firestore-user.test.ts
```

Expected: FAIL — cannot find module `firestoreUser.ts`.

- [ ] **Step 3: Write the implementation**

Create `progress-tracking/supabase/functions/_shared/firestoreUser.ts`:

```ts
// What the caller is allowed to do.
//
// The ID token proves a uid and nothing more. Role and orgId live in Firestore
// users/{uid} — deliberately, because src/data/employees.ts is localStorage
// backed and therefore client-controlled, so a self-asserted designation must
// never confer access (CLAUDE.md, Auth & roles). This file is the only place
// that answers "which organisation, and are they its administrator".

const PROJECT_ID = "modcon-hr";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/datastore";

export interface Caller {
  orgKey: string;
  isHrAdmin: boolean;
}

export interface FirestoreDocument {
  fields?: Record<string, { stringValue?: string }>;
}

/**
 * Pure, so every branch is testable without a credential.
 *
 * Returns null for an account with no organisation. That is not the default
 * tenant and must never become it: an account with no orgId is *unassigned*,
 * and resolving it to the incumbent organisation is the bug that let
 * self-registration read another company's data.
 */
export function parseUserDocument(doc: FirestoreDocument | null): Caller | null {
  const orgKey = doc?.fields?.orgId?.stringValue?.trim();
  if (!orgKey) return null;
  const role = doc?.fields?.role?.stringValue ?? "";
  return { orgKey, isHrAdmin: role === "hr" || role === "admin" };
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

/** Exchange the service account for an access token. Cached until it expires. */
let accessToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(fetchImpl: typeof fetch): Promise<string> {
  if (accessToken && Date.now() < accessToken.expiresAt) return accessToken.value;

  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");

  let credential: { client_email: string; private_key: string };
  try {
    credential = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64Url(new TextEncoder().encode(JSON.stringify({
    iss: credential.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
  })));

  const key = await crypto.subtle.importKey(
    "pkcs8", pemToPkcs8(credential.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`),
  );

  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${base64Url(new Uint8Array(signature))}`,
    }),
  });
  if (!res.ok) throw new Error(`service account rejected (${res.status})`);

  const body = await res.json() as { access_token: string; expires_in: number };
  accessToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
  return accessToken.value;
}

export async function resolveCaller(
  uid: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Caller | null> {
  const token = await getAccessToken(fetchImpl);
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });

  // A user document that does not exist is an answer, not a failure.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore read failed (${res.status})`);

  return parseUserDocument(await res.json() as FirestoreDocument);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --experimental-strip-types --test progress-tracking/test/firestore-user.test.ts
npm run typecheck:progress
```

Expected: 7 pass, 0 fail.

- [ ] **Step 5: Add the suite to `test:progress`**

Append ` progress-tracking/test/firestore-user.test.ts` to the `test:progress` script in root `package.json`.

- [ ] **Step 6: Commit**

```bash
git add progress-tracking/supabase/functions/_shared/firestoreUser.ts \
        progress-tracking/test/firestore-user.test.ts package.json
git commit -m "feat(progress): resolve a Firebase uid to its organisation and role"
```

---

### Task 4: The `checkin-policy` edge function

**Files:**
- Create: `progress-tracking/supabase/functions/checkin-policy/index.ts`
- Create: `progress-tracking/supabase/functions/_shared/policyInput.ts`
- Test: `progress-tracking/test/policy-input.test.ts`
- Modify: `progress-tracking/supabase/config.toml`

**Interfaces:**
- Consumes: `verifyFirebaseToken`, `googleKeySource` (Task 2); `resolveCaller` (Task 3); `public.org_id_for_key` (Task 1).
- Produces: `export function validatePolicy(input: unknown): { ok: true; value: PolicyInput } | { ok: false; error: string }` where
  `PolicyInput = { cadence_days: number; channel_ladder: string[]; escalate_after_days: number; quiet_start: number; quiet_end: number; timezone: string }`.

- [ ] **Step 1: Write the failing test**

Create `progress-tracking/test/policy-input.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { validatePolicy } from "../supabase/functions/_shared/policyInput.ts";

const valid = {
  cadence_days: 7,
  channel_ladder: ["app", "chat", "email"],
  escalate_after_days: 2,
  quiet_start: 19,
  quiet_end: 9,
  timezone: "Asia/Kolkata",
};

test("accepts a well-formed policy", () => {
  assert.equal(validatePolicy(valid).ok, true);
});

test("refuses an empty channel ladder", () => {
  const result = validatePolicy({ ...valid, channel_ladder: [] });
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /at least one channel/i);
});

test("refuses a channel that is not a known source", () => {
  const result = validatePolicy({ ...valid, channel_ladder: ["carrier-pigeon"] });
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /carrier-pigeon/);
});

test("refuses a cadence of zero days", () => {
  const result = validatePolicy({ ...valid, cadence_days: 0 });
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /cadence/i);
});

test("refuses quiet hours outside the clock", () => {
  const result = validatePolicy({ ...valid, quiet_start: 25 });
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /quiet/i);
});

test("refuses an unrecognised timezone", () => {
  const result = validatePolicy({ ...valid, timezone: "Mars/Olympus_Mons" });
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /timezone/i);
});

test("refuses a duplicated channel", () => {
  const result = validatePolicy({ ...valid, channel_ladder: ["app", "app"] });
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /once/i);
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
node --experimental-strip-types --test progress-tracking/test/policy-input.test.ts
```

Expected: FAIL — cannot find module `policyInput.ts`.

- [ ] **Step 3: Write the validator**

Create `progress-tracking/supabase/functions/_shared/policyInput.ts`:

```ts
// What an organisation is allowed to save.
//
// Validation is here rather than in the handler because an invalid policy is
// not merely a bad request: an empty channel ladder produces check-ins the
// dispatcher can only fail (see dispatch-checkins), so it is refused at the
// point of writing rather than discovered a tick later.

export interface PolicyInput {
  cadence_days: number;
  channel_ladder: string[];
  escalate_after_days: number;
  quiet_start: number;
  quiet_end: number;
  timezone: string;
}

/** Matches the progress_source enum, minus 'system', which nobody is asked on. */
const CHANNELS = ["call", "chat", "email", "app"];

const isWholeNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v);

function isKnownTimezone(tz: unknown): boolean {
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
  const p = input as Partial<PolicyInput> | null;
  if (!p || typeof p !== "object") return { ok: false, error: "a policy object is required" };

  if (!isWholeNumber(p.cadence_days) || p.cadence_days < 1) {
    return { ok: false, error: "cadence must be a whole number of days, at least 1" };
  }
  if (!isWholeNumber(p.escalate_after_days) || p.escalate_after_days < 1) {
    return { ok: false, error: "escalation must be a whole number of days, at least 1" };
  }
  for (const [name, value] of [["quiet_start", p.quiet_start], ["quiet_end", p.quiet_end]] as const) {
    if (!isWholeNumber(value) || value < 0 || value > 23) {
      return { ok: false, error: `${name} must be an hour between 0 and 23` };
    }
  }
  if (!Array.isArray(p.channel_ladder) || p.channel_ladder.length === 0) {
    return { ok: false, error: "choose at least one channel" };
  }
  for (const channel of p.channel_ladder) {
    if (!CHANNELS.includes(channel)) {
      return { ok: false, error: `${channel} is not a channel this system can use` };
    }
  }
  if (new Set(p.channel_ladder).size !== p.channel_ladder.length) {
    return { ok: false, error: "each channel may appear only once in the ladder" };
  }
  if (!isKnownTimezone(p.timezone)) {
    return { ok: false, error: "timezone must be a recognised IANA zone, e.g. Asia/Kolkata" };
  }

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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --experimental-strip-types --test progress-tracking/test/policy-input.test.ts
```

Expected: 7 pass, 0 fail.

- [ ] **Step 5: Write the handler**

Create `progress-tracking/supabase/functions/checkin-policy/index.ts`:

```ts
// GET  /functions/v1/checkin-policy — the caller's organisation's policy, or null
// PUT  /functions/v1/checkin-policy — upsert it
//
// The one door between ModCon's Settings page and this subsystem. The caller
// arrives with a Firebase ID token, which proves a uid; the organisation and
// the role come from Firestore, never from the request body.

import { serviceClient } from "../_shared/ingest.ts";
import { json, preflight } from "../_shared/http.ts";
import { googleKeySource, verifyFirebaseToken } from "../_shared/firebaseAuth.ts";
import { resolveCaller } from "../_shared/firestoreUser.ts";
import { validatePolicy } from "../_shared/policyInput.ts";

interface Authorised { orgId: string }

/** Every refusal here is deliberate about which one it is. */
async function authorise(req: Request): Promise<Authorised | Response> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return json({ error: "unauthorised" }, 401);

  let uid: string;
  try {
    ({ uid } = await verifyFirebaseToken(token, googleKeySource));
  } catch (err) {
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

  if (!caller) return json({ error: "no organisation" }, 403);
  if (!caller.isHrAdmin) return json({ error: "not an administrator of this organisation" }, 403);

  const db = serviceClient();
  const { data, error } = await db.rpc("org_id_for_key", { p_org_key: caller.orgKey });
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

  if (req.method === "GET") {
    const { data, error } = await db
      .from("progress_checkin_policy")
      .select("cadence_days, channel_ladder, escalate_after_days, quiet_start, quiet_end, timezone")
      .eq("org_id", orgId)
      .is("employee_id", null)
      .is("goal_id", null)
      .maybeSingle();
    if (error) return json({ error: error.message }, 502);
    // null, not a default: an organisation that has configured nothing is
    // chased not at all, and the page says so in those words.
    return json({ policy: data ?? null });
  }

  if (req.method === "PUT") {
    const body = await req.json().catch(() => null);
    const checked = validatePolicy(body);
    if (!checked.ok) return json({ error: checked.error }, 400);

    const { error } = await db
      .from("progress_checkin_policy")
      .upsert({ org_id: orgId, employee_id: null, goal_id: null, active: true, ...checked.value });
    if (error) return json({ error: error.message }, 502);
    return json({ policy: checked.value });
  }

  return json({ error: "method not allowed" }, 405);
});
```

- [ ] **Step 6: Declare the function in `config.toml`**

Append to `progress-tracking/supabase/config.toml`:

```toml
# Authenticates a Firebase ID token itself; the gateway would reject it as not
# being a Supabase JWT before this function's own verification could run.
[functions.checkin-policy]
verify_jwt = false
```

And add to the existing `[edge_runtime.secrets]` block:

```toml
FIREBASE_SERVICE_ACCOUNT = "env(FIREBASE_SERVICE_ACCOUNT)"
```

- [ ] **Step 7: Verify what can be verified locally**

```bash
npm run typecheck:progress
cd progress-tracking && supabase start
curl -s -o /dev/null -w "%{http_code}\n" -X GET http://127.0.0.1:54321/functions/v1/checkin-policy
```

Expected: type-check clean; `401` from the curl (no token). A `401` here proves the gateway passed the request through and this function refused it — the same signal `verify_jwt = false` gave for `dispatch-checkins`.

**Do not attempt a 200.** That needs a real Firebase token and a service account; it is Task 6.

- [ ] **Step 8: Commit**

```bash
git add progress-tracking/supabase/functions/checkin-policy/index.ts \
        progress-tracking/supabase/functions/_shared/policyInput.ts \
        progress-tracking/test/policy-input.test.ts \
        progress-tracking/supabase/config.toml package.json
git commit -m "feat(progress): one door for an organisation's check-in policy"
```

---

### Task 5: Settings → Check-ins

**Files:**
- Create: `src/lib/checkinPolicy.ts`
- Create: `src/pages/settings/CheckinPolicySection.tsx`
- Modify: `src/pages/settings/index.tsx`

`src/pages/settings/index.tsx` is already over 3,000 lines. The section goes in its own file rather than growing it further; read the Leave Policies section around `index.tsx:1348` first and match its wrapper, heading and save-state pattern.

**Interfaces:**
- Consumes: the `checkin-policy` function from Task 4.
- Produces: `getCheckinPolicy(): Promise<CheckinPolicy | null>` and `saveCheckinPolicy(p: CheckinPolicy): Promise<void>`.

- [ ] **Step 1: Write the client module**

Create `src/lib/checkinPolicy.ts`:

```ts
import { getAuth } from 'firebase/auth'

export interface CheckinPolicy {
  cadence_days: number
  channel_ladder: string[]
  escalate_after_days: number
  quiet_start: number
  quiet_end: number
  timezone: string
}

/**
 * The check-in subsystem is a separate deployment, so its address is
 * configuration. Absent, the section reports that check-ins are not wired up
 * rather than failing on every render.
 */
export const checkinApiBase = import.meta.env.VITE_CHECKIN_FUNCTIONS_URL ?? ''

async function authorizedFetch(init: RequestInit = {}): Promise<Response> {
  const user = getAuth().currentUser
  if (!user) throw new Error('Sign in again to change check-in settings.')
  const token = await user.getIdToken()
  return fetch(`${checkinApiBase}/checkin-policy`, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  })
}

export async function getCheckinPolicy(): Promise<CheckinPolicy | null> {
  const res = await authorizedFetch()
  if (res.status === 403) throw new Error('Only an administrator of this organisation can change check-ins.')
  if (!res.ok) throw new Error('Could not load the check-in policy.')
  const body = await res.json() as { policy: CheckinPolicy | null }
  return body.policy
}

export async function saveCheckinPolicy(policy: CheckinPolicy): Promise<void> {
  const res = await authorizedFetch({ method: 'PUT', body: JSON.stringify(policy) })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? 'Could not save the check-in policy.')
  }
}
```

- [ ] **Step 2: Write the section component**

Create `src/pages/settings/CheckinPolicySection.tsx`. It must:

- Load on mount with `getCheckinPolicy()`.
- When that returns `null`, render this sentence and no form values: **"Nobody in this organisation is being asked for progress. Saving a policy below is what starts it."**
- Offer: cadence (days), an ordered channel ladder over `app`, `chat`, `email`, `call`, escalation threshold (days), quiet start and end hours, timezone.
- Disable Save while a request is in flight, and surface the function's `error` string verbatim — the validator's messages are written to be read by a person.
- When `checkinApiBase` is empty, say check-ins are not configured for this deployment and render no form.
- Avoid the words "leave policies" anywhere in the heading: Playwright matches accessible names by substring and the Leave Policies section is on the same page (CLAUDE.md).

- [ ] **Step 3: Render it from the settings page**

In `src/pages/settings/index.tsx`, import the component and render it after the Leave Policies section.

- [ ] **Step 4: Type-check and view it**

```bash
npx tsc -b
npm run dev
```

Open Settings. With `VITE_CHECKIN_FUNCTIONS_URL` unset the section must state that check-ins are not configured — **not** throw, and not render an empty form that looks saved.

- [ ] **Step 5: Commit**

```bash
git add src/lib/checkinPolicy.ts src/pages/settings/CheckinPolicySection.tsx src/pages/settings/index.tsx
git commit -m "feat(settings): let an organisation configure its check-in policy"
```

---

### Task 6: End to end, against a real project

**Blocked** until a Supabase project and a Firebase service account exist. Do not start it, and do not mark Tasks 1–5 as end-to-end verified on the strength of unit tests.

**Files:**
- Create: `tests/e2e/checkin-policy.spec.ts` (project `org-settings` — it writes shared organisation configuration)

- [ ] **Step 1: Deploy**

```bash
cd progress-tracking
supabase link --project-ref <ref>
supabase db push
supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat /path/to/service-account.json)"
supabase functions deploy checkin-policy
```

- [ ] **Step 2: Confirm the refusals before the successes**

An expired token, a token for another Firebase project, an account with no `orgId`, and a signed-in non-HR employee must each be refused — `401`, `401`, `403`, `403`. Check these first: a system that accepts the right token is only interesting once it rejects the wrong ones.

- [ ] **Step 3: Save a policy as HR and read it back from Postgres**

```sql
select org_id, cadence_days, channel_ladder from progress_checkin_policy;
select org_key from org_directory;
```

- [ ] **Step 4: Confirm a second organisation is unaffected**

Sign in as HR of another tenant, save a different cadence, and assert both rows exist with different `org_id` and different values. This is the whole requirement — every HR, differing.

- [ ] **Step 5: Take the service account off this machine**

The key must exist only in `supabase secrets` and wherever you keep secrets. Delete any local copy used during deployment.

---

## Self-review

**Spec coverage.** Every section maps to a task: the no-default rule is a global constraint and Task 5 Step 2; the edge-function door is Task 4; identity-versus-authorisation is Tasks 2 and 3; `org_directory` is Task 1; the Settings page is Task 5; the failure-mode table is Task 4's `authorise`, with `503` called out explicitly. The spec's `slack_team_id` work already shipped in `2d8d0e3` and needs no task.

**Not covered, deliberately.** The spec's foreign key from `employees.org_id` to `org_directory` is not in this plan: it would fail on existing data and on the SQL suites, which seed organisations directly. It needs a backfill of its own and is out of scope here, as the spec's migration note anticipates.

**Type consistency.** `Caller { orgKey, isHrAdmin }` is produced by Task 3 and consumed by Task 4 under those names. `FirestoreDocument` is exported from Task 3 because its test imports the type. `PolicyInput` field names match the `progress_checkin_policy` columns and the `CheckinPolicy` interface in Task 5, so the JSON needs no mapping layer.
