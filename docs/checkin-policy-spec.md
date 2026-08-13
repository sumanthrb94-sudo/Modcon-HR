# Per-organisation check-in policy

How an organisation using ModCon HR configures the progress check-in subsystem
in [progress-tracking/](../progress-tracking/), and how a Firebase-authenticated
HR admin is allowed to do it against a Postgres backend that has never heard of
Firebase.

Companion to [tenant-isolation-spec.md](tenant-isolation-spec.md), which governs
the Firestore side of the same tenancy.

## The requirement

The subsystem should run for every organisation on the platform, and each
organisation should be able to differ: how often its people are asked, on which
channels and in what order, and the hours it considers civil.

## What already exists, and what does not

`progress_checkin_policy` already resolves **goal > employee > org**
(`effective_checkin_policy`, `20260813000300_checkin_dispatch.sql`), and
`claim_due_checkins()` claims across every organisation rather than one. So the
per-organisation *mechanism* is built and needs no change.

Three things are missing.

1. **No organisation can acquire a policy.** A policy today is a hand-written
   `insert`. There is no UI, no API, and no provisioning step.
2. **No mapping from a ModCon tenant to a Postgres organisation.** ModCon keys
   tenants by a string `orgKey` (`org_settings` document ids are
   `<orgKey>__<setting>`). Every table in the subsystem carries `org_id uuid`.
   Nothing relates the two.
3. **No identity bridge.** The subsystem's RLS reads `org_id`, `employee_id`
   and `hr_role` from a *Supabase* JWT (`jwt_claim()`,
   `20260813000100_progress_core.sql`). ModCon's users hold *Firebase* tokens.

## Decisions

### An organisation with no policy is chased not at all

`checkin_due` already requires `pol.id is not null`, so an organisation without
a policy row produces no due rows and nobody there is contacted. **This is kept,
and is the whole behaviour for a new tenant.**

It follows the rule this codebase already holds for the salary structure: there
is no platform default, because falling back to a plausible one "would tell a
company its pay is divided in a way nobody there decided" (CLAUDE.md). A default
cadence has the same shape — it would chase a company's staff on a rhythm
nobody at that company chose, using channels nobody there approved.

The cost is accepted deliberately: an organisation that never opens the setting
gets nothing from the feature. The Settings page states this in those words
rather than rendering an empty form that looks configured.

### HR reaches the policy through an edge function, not a second SDK

The ModCon client keeps talking only to Firebase. A new `checkin-policy` edge
function is the single door to the policy, called with `fetch` and the user's
Firebase ID token. Postgres remains the one source of truth; no
`@supabase/supabase-js` enters the app bundle, and no policy copy is kept in
Firestore to drift out of date.

The rejected alternative — mirroring the policy into the `ORG_SETTINGS`
registry and syncing it out — was rejected for that drift: HR would change a
cadence and the dispatcher would keep acting on the old one until a sync ran,
with nothing on screen to say so.

### Authorisation reads Firestore; the token only proves identity

A Firebase ID token is verified with Google's published certificates — RS256,
`iss = https://securetoken.google.com/modcon-hr`, `aud = modcon-hr`, unexpired.
No secret is needed for that, and it establishes the `uid`.

It establishes nothing else. Role and `orgId` live in Firestore `users/{uid}`,
never in the token, and deliberately: `src/data/employees.ts` is
localStorage-backed and therefore client-controlled, so a self-asserted
designation must not confer access (CLAUDE.md, *Auth & roles*). The function
therefore **reads Firestore** for the caller's `orgId` and role, using a Firebase
service-account credential held in `supabase secrets` — never in this
repository, never in the client bundle.

This keeps Firestore the single authority on who is HR, which is the invariant
`firestore.rules` already enforces. The alternative — stamping `orgId` and
`hrRole` as Firebase custom claims — is cheaper per request and needs no
credential, but custom claims can only be set with the Admin SDK server-side,
and ModCon has no server: accounts are created client-side in
`src/lib/accountInvites.ts`. It is recorded here as the better end state if a
trusted server ever exists.

**Consequence to accept:** a Firebase service-account key becomes part of the
deployment. It grants full admin access to the `modcon-hr` Firebase project. It
must be a key minted for this purpose, rotatable independently, and it is the
single most valuable secret in the system.

## Design

### `org_directory`

A new table, and the first thing an organisation acquires.

| Column | Type | Notes |
| --- | --- | --- |
| `org_id` | `uuid` primary key | What every existing table's `org_id` means |
| `org_key` | `text` unique not null | ModCon's tenant key, e.g. `modcon` |
| `created_at` | `timestamptz` | |

Rows are created by the edge function the first time an organisation saves a
policy. Nothing else creates them, so an organisation that has never configured
check-ins has no row — which is the same fact as "is not chased", recorded once.

`org_key` is unique and lower-cased on write: the tenant key is the join to
ModCon, and two rows for one tenant would split its policy in half.

### `checkin-policy` edge function

- `GET` — the caller's organisation's policy, or `null`. Never another
  organisation's; `orgKey` comes from the verified identity, never from the
  request body.
- `PUT` — upsert the policy. Validates before writing: `cadence_days >= 1`,
  `channel_ladder` non-empty and drawn from the `progress_source` enum,
  `quiet_start`/`quiet_end` in 0–23, `timezone` a recognised IANA zone.

An empty `channel_ladder` is refused rather than stored. The dispatcher now
fails a check-in whose policy yields no channel
(`dispatch-checkins/index.ts`), so an empty ladder would produce a queue of
failures rather than silence — the refusal belongs at the point of writing.

`verify_jwt = false` in `config.toml`, for the reason the other five functions
have it: the gateway's default would reject the Firebase token as not being a
Supabase one, before this function's own verification could run.

Writes use the service role. RLS on `progress_checkin_policy` is written in
terms of Supabase JWT claims that this caller does not have, and inventing a
Supabase session for a Firebase user is the second identity system this design
exists to avoid.

### `_shared/firebaseAuth.ts`

`verifyFirebaseToken(token)` → `{ uid }` or throws. Signature, issuer,
audience and expiry only; certificates cached per their `Cache-Control`
max-age, refetched on an unknown `kid`.

`resolveCaller(uid)` → `{ orgKey, isHrAdmin }` by reading `users/{uid}` over the
Firestore REST API with the service account. Separated from verification so the
signature checks stay pure and unit-testable without network or credential.

Two definitions it must match, or the function and `firestore.rules` will
disagree about the same account:

- **`orgKey` is `users/{uid}.orgId`.** An account with no `orgId` is
  *unassigned*, not default — `myOrgKey()` resolves it to a sentinel matching
  nothing (CLAUDE.md, *Auth & roles*). `resolveCaller` returns no organisation
  for such an account and the request is refused; it must never fall back to
  the default tenant, which is the bug that made self-registration leak the
  incumbent tenant's data.
- **`isHrAdmin` is `role in ('hr', 'admin')`**, matching `isOrgAdmin()` in
  `firestore.rules`. An organisation's own administrator holds `hr`; the
  platform `admin` role is a different thing a tenant may not have at all.

### Settings → Check-ins

A new page in ModCon, following the existing settings surfaces. Ordinary
`fetch`, Firebase token in the `Authorization` header. Fields: cadence in days,
channel ladder (ordered), escalation threshold, quiet hours, timezone.

Its empty state says nobody in the organisation is being asked for progress and
that saving a policy is what starts it — not a blank form.

## Failure modes

| Situation | Behaviour |
| --- | --- |
| Token absent, malformed, expired, or wrong audience | `401`, no Firestore read attempted |
| Valid token, `users/{uid}` missing **or carrying no `orgId`** | `403`. An account matching no user record, or assigned to no organisation, resolves to nobody rather than to the default tenant — the direction a missing answer has to fail |
| Valid token, caller is not HR for that org | `403`, and the page hides the form rather than offering a control the server will refuse |
| Service-account credential missing or rejected | `503` and a logged error. **Not** a fallback to trusting the token's own contents |
| Firestore reachable, Postgres not | `502`; the policy is unchanged and the page says the save did not land |

The fourth row is the one worth guarding in review: a bug that degrades an
unavailable credential into "assume the caller is who they say" converts an
outage into a privilege escalation.

## Testing

- **SQL** — `org_directory` uniqueness and case-folding; an organisation with no
  policy row produces no `checkin_due` rows. Alongside the existing suites in
  `progress-tracking/test/`.
- **Unit** — token verification: expired, wrong `aud`, wrong `iss`, unknown
  `kid`, tampered signature. No network; certificates injected.
- **E2E** — HR saves a policy and it appears in Postgres; a non-HR account in
  the same organisation is refused. In the `org-settings` project, since it
  writes shared organisation configuration.

## Out of scope

- **Per-employee and per-goal policy UI.** The schema resolves all three scopes
  already; only the organisation row is needed to make the feature usable, and
  the other two are a different screen with a different audience.
- **The review queue UI**, which the subsystem's own README lists as its next
  step. Unrelated to configuration.
- **Backfilling `org_directory` for existing tenants.** No tenant has a policy
  today, so there is nothing to backfill; the first save creates the row.

## Open question

Which Firebase project the edge function verifies against is hard-coded as
`modcon-hr` here. If ModCon ever runs a second Firebase project (staging), the
audience becomes configuration rather than a constant.
