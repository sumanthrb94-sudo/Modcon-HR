# Tenant Isolation — data and operational containment

Technical specification for strict isolation between organisational tenants:
the invariants, where each one is enforced, what "contained" can honestly mean
for a deployment on this architecture, and the conformance rules every future
change must satisfy.

Status: **implemented** on `fix/tenant-isolation-gaps`. The data-plane half
predates this and is documented in [multi-tenancy-spec.md](multi-tenancy-spec.md);
this document states the guarantees as invariants, extends them to the control
plane (seed / purge / backfill / deploy), and records the six gaps found while
writing it (§7) — all now closed, with the verification in §9. G7 was found
while running the rollout and is the most serious of them: **a public sign-up
read the default organisation.** §10 has the deploy state and why the ordering
was not optional.

This spec does not restate the `orgId` convention, the write-split rationale, or
the backfill asymmetry — see the multi-tenancy spec §2–§4 for those.

---

## 1. The four planes

"Tenant isolation" is one phrase covering four different mechanisms with four
different enforcement points. Conflating them is how the gaps in §7 got in.

| Plane | What it holds | Tenant key | Enforced by |
|---|---|---|---|
| **Identity** | `users/{uid}`, `role_assignments/{email}`, `organizations/{orgId}` | `users/{uid}.orgId` | [firestore.rules:213–370](../firestore.rules#L213-L370) |
| **Data** | the 18 tenant collections + handbook | `orgId` field on each document | `inMyOrg()` / `writingToMyOrg()`, [firestore.rules:138–145](../firestore.rules#L138-L145) |
| **Access mapping** | `employee_links/{uid}`, `managerChainIds[]` | `orgId` field / derived from org-filtered employees | [firestore.rules:69–94](../firestore.rules#L69-L94), [firestore.rules:336–354](../firestore.rules#L336-L354) |
| **Config** | leave policies, company profile, holidays, departments, permission matrix, preferences | `orgId` + the `<orgKey>__<setting>` document id | [firestore.rules](../firestore.rules) `org_settings`, synced by [orgSettings.ts](../src/lib/orgSettings.ts) |
| **Local** | the rest of the `src/data/*` overlay, and the config cache | localStorage key suffix `::org:<id>` | [orgScope.ts:47](../src/lib/orgScope.ts#L47) — **browser-local, not a server boundary** |
| **Control** | seed, purge, `orgId` backfill, access backfills, rules deploy, hosting deploy | `orgKey` parameter / *nothing* | §4 |

The tenant key itself is a string that is **never null**: accounts with no
`orgId` resolve to the literal `'default'`
([orgScope.ts:18](../src/lib/orgScope.ts#L18),
[firestore.rules:114](../firestore.rules#L114)).

---

## 2. Invariants

Each is a statement that must be true of the deployed system, stated so it can
be tested. `A` and `B` are distinct tenants; "principal of A" means a signed-in
account whose `users/{uid}.orgId` is A. Super admins
(`users/{uid}.superAdmin == true`) are the one deliberate exemption and are
called out where they apply.

**I1 — No cross-tenant read.** A principal of A can read no document whose
`orgId` is B, in any collection, by `get` or by `list`, regardless of role.

**I2 — No cross-tenant read of identity or content-bearing metadata.** I1
extends to `users`, `role_assignments`, `employee_links`, `organizations`,
`handbook`, and `handbook_versions`. These are not "tenant data collections",
which is exactly why they were skipped; the handbook version document carries
the PDF bytes and `users` carries every account's email, role and tenant.

**I3 — No cross-tenant write, and no takeover.** A principal of A can neither
create a document stamped `orgId: B`, nor modify or delete an existing document
whose stored `orgId` is B — including by overwriting it while stamping A. The
second clause is why `update`/`delete` test the stored document with
`inMyOrg()` and not only the incoming one
([firestore.rules:382–383](../firestore.rules#L382-L383); multi-tenancy spec §2).

**I4 — No cross-tenant privilege.** A principal of A cannot create, modify or
delete a `users`, `role_assignments` or `employee_links` document belonging to
B, cannot move any account between tenants (`orgId` is immutable on self-update
and on every HR-authored update,
[firestore.rules:275](../firestore.rules#L275),
[firestore.rules:289](../firestore.rules#L289)), and cannot grant `admin` or
`superAdmin` by any path.

**I5 — Access mappings resolve within one tenant.** `myEmployeeId()` may only
resolve to an employee of the caller's own tenant, and `managerChainIds` may
only contain employee ids from the same tenant. Both are administrator-authored
or write-time-derived; neither is ever a client claim
([firestore.rules:69–94](../firestore.rules#L69-L94)).

**I6 — Every server read is tenant-filtered at the query, not only at the rule.**
A `list` is evaluated against every document it returns and fails whole if any
one is disallowed, so `where('orgId','==',orgKey)` is what makes the query
legal, not an optimisation ([useFirestore.ts:73](../src/lib/useFirestore.ts#L73)).
A query missing the filter must fail closed with `permission-denied` rather than
return another tenant's rows.

**I7 — Every data operation is tenant-parameterised.** Seed, purge and all three
backfills take an `orgKey` and touch only documents matching it. No operation
reachable from the UI may perform an unfiltered collection scan-and-write.
Enforced today by construction:
[seed.ts:92](../src/lib/seed.ts#L92),
[seed.ts:110](../src/lib/seed.ts#L110),
[orgBackfill.ts:29](../src/lib/orgBackfill.ts#L29),
[accessBackfill.ts:59](../src/lib/accessBackfill.ts#L59),
[accessBackfill.ts:195](../src/lib/accessBackfill.ts#L195); all call sites pass
`getActiveOrgKey()` ([settings/index.tsx:2454–2519](../src/pages/settings/index.tsx#L2454-L2519)).

**I8 — Local state is namespaced per tenant per browser.** Two tenants signed in
on the same machine never read each other's overlay, and a local reset sweeps
only the active tenant's keys
([orgScope.ts:47](../src/lib/orgScope.ts#L47),
[orgScope.ts:59](../src/lib/orgScope.ts#L59),
[persistence.ts:42](../src/data/persistence.ts#L42)). This is a
same-device hygiene property, **not** an authorization boundary: localStorage is
client-owned. Nothing security-relevant may depend on it — the rule the project
already applies to the employee directory
(`CLAUDE.md`, *Auth & roles*) and to handbook upload
([document-management-spec.md §1.1](document-management-spec.md)).

**I9 — An account with no organisation is nobody.** A signed-in principal whose
`users/{uid}` carries no `orgId` reads and writes nothing: not the default
tenant, not any other. "Unassigned" and "the incumbent tenant" must never be the
same value. Super admins are the exemption, as everywhere
([firestore.rules `myOrgKey`](../firestore.rules)).

---

## 3. Enforcement requirements, plane by plane

### 3.1 Data plane

Every tenant collection carries `orgId: string` and matches this shape exactly:

```
allow get, list: if isSignedIn() && inMyOrg();
allow create:    if isOrgAdmin() && writingToMyOrg();
allow update:    if isOrgAdmin() && inMyOrg() && writingToMyOrg();
allow delete:    if isOrgAdmin() && inMyOrg();
```

Collections with self-service writes (`expenses`, `leave_requests`,
`helpdesk_tickets`, `regularizations`) substitute the *writer* predicate only —
`isSignedIn()` plus an ownership test — and keep `inMyOrg()`/`writingToMyOrg()`
untouched ([firestore.rules:541–597](../firestore.rules#L541-L597)).

Collections with per-employee reads (`employee_compensation`, `payslips`,
`leave_requests`, `leave_balances`) **AND** the tenant test with the
per-employee test; `inMyOrg()` is never the thing that narrows to an employee,
and `isSelf()`/`managesSubject()` is never the thing that narrows to a tenant.
Either alone is insufficient: `isSelf()` without `inMyOrg()` was the cross-org
gap the salary/leave spec recorded and this one closed.

The 18 collections in scope are enumerated in
[orgBackfill.ts:29](../src/lib/orgBackfill.ts#L29). **That array is the
authoritative list.** Adding a tenant collection means adding it there, to
`SEEDED_COLLECTION_NAMES` if the seed writes it
([seed.ts:64](../src/lib/seed.ts#L64)), and to the parameterised rules tests —
in the same change, or the collection is unreachable by the purge and
unrepairable by the backfill.

### 3.2 Identity plane

- `orgId` is written by an administrator, never by the account itself
  ([firestore.rules:262–271](../firestore.rules#L262-L271)). A self-created
  profile may not carry `orgId` at all; a self-updated one must leave it
  identical. This is load-bearing: `myOrgKey()` derives from it, so a
  self-assignable `orgId` would be a self-service tenant switch.
- An HR administrator acts only within their own tenant and can neither grant
  nor edit `admin`/`superAdmin`
  ([firestore.rules:280–290](../firestore.rules#L280-L290)).
- Attaching an existing account to a tenant writes `role` and `orgId` together
  and is super-admin only (Organizations → "Set HR admin",
  `src/lib/organizations.ts`). The Admin dashboard can change a role but never
  an `orgId` — that asymmetry is the invariant, not an oversight.
- `role_assignments` mirrors every restriction of `/users`; `admin` is not
  assignable through it ([firestore.rules:315–324](../firestore.rules#L315-L324)).

### 3.3 Access-mapping plane

`employee_links` and `managerChainIds` are the two denormalisations that make
"only your own record" and "only your reports" expressible on the server. Both
are administrator-authored or derived server-side from already-filtered data —
never a client claim, because `Employee.authUid` and `reportingManagerId` live
in localStorage.

Requirements:

1. A link may only be written by an org administrator, must key on the caller's
   own `uid`, and (for HR) must carry the writer's `orgId`
   ([firestore.rules:347–352](../firestore.rules#L347-L352)).
2. `backfillEmployeeLinks` matches by email and links **only when exactly one
   employee in that tenant carries the address**; anything ambiguous is skipped
   and reported. A wrong link hands someone another person's salary, so guessing
   is prohibited ([accessBackfill.ts:59](../src/lib/accessBackfill.ts#L59)).
3. `managerChainIds` is a write-time snapshot. Any change to a reporting line —
   hire, termination, transfer, department merge, a `reportingManagerId` edit on
   the profile page — obliges a `backfillManagerChains` run for that tenant.
   It recomputes from the org-filtered `employees` query
   ([accessBackfill.ts:210](../src/lib/accessBackfill.ts#L210)), so it can never
   pull an id from another tenant.
4. Both backfills fail closed — an absent link or chain withholds access rather
   than granting it — so both must offer a dry run, and both do.

### 3.4 Local/config plane

`orgScopedKey` suffixes every `modcon.hr.*` key with `::org:<id>` for
non-default tenants and leaves the default tenant's keys bare
([orgScope.ts:47](../src/lib/orgScope.ts#L47)). The module permission matrix
behind `RequireModuleAccess` lives here too
([accessControl.ts:170](../src/lib/accessControl.ts#L170)) — which is why it
gates *navigation*, and why no server-side authorization may be derived from it
(G5). New local stores must route
through `persistentCollection` or call `orgScopedKey` directly — a raw
`localStorage.getItem('modcon.hr.foo')` is a cross-tenant bleed on a shared
browser and is prohibited.

The active key is cached in localStorage rather than React state because the
data modules read it at module-load time, before auth resolves; a tenant change
therefore requires a page reload so every module re-evaluates
([orgScope.ts:12](../src/lib/orgScope.ts#L12),
[orgScope.ts:108](../src/lib/orgScope.ts#L108)). Any future code path that
changes the active tenant without reloading breaks I8 — the modules already
loaded keep serving the previous tenant's namespace.

**Configuration no longer lives here.** Leave policies, the company profile,
the holiday calendar, the department list, the permission matrix and the two
preference lists moved to the `org_settings` collection (G3); localStorage keeps
a cache of them so the data modules can go on reading synchronously at
module-load time, but the organisation's copy is the Firestore document.
`src/lib/orgSettings.ts` owns the registry, the write-through, and the
subscription that hydrates the cache. A new configuration surface belongs in
that registry, not in a bare localStorage key.

---

## 4. Operational and deployment containment

### 4.1 What is shared, and therefore cannot be contained

The requirement asks that deployments affecting one tenant not propagate to
another. On this architecture that is **not achievable for code or rules**, and
the specification says so rather than promising it:

| Singleton | Where | Blast radius of one change |
|---|---|---|
| One Firebase project, one Firestore database `(default)` | [firebase.json](../firebase.json) | every tenant |
| One `firestore.rules` ruleset | `firebase deploy --only firestore:rules` | every tenant, instantly, no staging |
| One `firestore.indexes.json` | [firestore.indexes.json](../firestore.indexes.json) | every tenant; a query needing a missing composite index fails for all of them |
| One hosting site, one bundle | [firebase-hosting.yml:54](../.github/workflows/firebase-hosting.yml#L54), push to `main` | every tenant, simultaneously |

There is no per-tenant deploy target, no per-tenant ruleset, and no canary. A
change built for one tenant reaches all of them in one release. Claiming
otherwise would be false, and designing against a guarantee the platform does
not provide is how isolation bugs get written.

**Per-tenant containment of a behaviour change therefore has to be expressed in
data, not in deployment.** The alternatives that would give true deploy
isolation — a Firebase project per tenant, or hosting multi-site — buy it at a
cost this application does not justify.

The mechanism is `organizations/{orgId}.features`, a map of flags on the tenant
record, with [src/lib/features.ts](../src/lib/features.ts) subscribing each
session to its own organisation and Organizations → **Features** letting a super
admin toggle them. The code ships to everyone; the flag decides who runs it.

Three constraints on it, and the second corrects an earlier draft of this
section:

1. **Super admins set them, not the organisation.** `organizations/{orgId}` is
   super-admin-writable only, which is right: which tenants a change has reached
   is a platform decision about a rollout, not a preference the tenant
   configures. An organisation's *own* configuration is `org_settings` (§3.4) —
   a different collection with different rules, and the distinction is worth
   keeping sharp.
2. **A flag gates behaviour, never authorization.** An earlier draft said a rule
   could read one "where a rule must vary". It should not. `firestore.rules` is
   a single global ruleset, and per-tenant authorization means tenants running
   security models that cannot be held in one head or tested together — quite
   apart from the `get()` per evaluation it would cost, and from making "may I
   read this?" depend on a field an administrator can edit. Whatever a flag
   turns on must be safe for every tenant to have *reached*, because the rules
   will not stop them.
3. **The registry is the source of truth.** `FEATURE_FLAGS` declares each flag
   with its default and its meaning; an undeclared key stored on an organisation
   is ignored, which is what makes deleting a finished rollout safe. Empty
   between rollouts is the correct state — the point is that the next change
   which must not reach everyone at once has somewhere to go.

### 4.2 What is contained, and must stay that way

Every *data* operation is tenant-parameterised (I7). The properties that make
this hold are requirements, not incidental:

- **The purge deletes by query, never by collection.**
  `batchDeleteCollection` filters `where('orgId','==',orgKey)`
  ([seed.ts:92](../src/lib/seed.ts#L92)). The previous wholesale delete meant
  one company clearing its demo data destroyed every other tenant's records —
  guarded only by a client-side comment. An unfiltered `getDocs` followed by a
  batched delete is prohibited in this codebase.
- **The seed stamps `orgId` on every document it writes**
  ([seed.ts:226](../src/lib/seed.ts#L226)); unstamped records are
  permitted-but-invisible, which is the failure mode the backfill exists to
  repair.
- **A new tenant starts empty.** `isMockDataCleared()` defaults to *cleared* for
  every non-default tenant ([mockDataFlag.ts:18](../src/lib/mockDataFlag.ts#L18)),
  so a newly provisioned organisation never inherits ModCon Builders' demo
  roster.
- **Destructive and repair operations dry-run first.** The `orgId` backfill and
  both access backfills report before they write; the purge does not, and is
  therefore the operation that most needs the gating in G5.
- **Super-admin tenant switching reloads the page**
  ([orgScope.ts:108](../src/lib/orgScope.ts#L108)). A super admin is exempt from
  `inMyOrg()`/`writingToMyOrg()` ([firestore.rules:139](../firestore.rules#L139)),
  so the client-side active key is the only thing keeping their writes in the
  intended tenant. The reload is not cosmetic — without it a super admin
  operates one tenant's UI against another tenant's namespace, and the rules
  will not stop them.

### 4.3 Deployment procedure

Ordering is a containment control, because rules and app code deploy
independently and a mismatch is visible to every tenant at once.

1. **Rules first, app second.** Rules must be written so the *currently
   deployed* app still functions under them — additive tightening only, with a
   compatibility window. The reverse order gives privileged users
   permission-denied against the new UI.
2. **Data migrations after both**, per tenant, dry run then apply, one tenant at
   a time. Ordering rationale and the one exception (stamping `orgId` early is
   harmless under the old rules) are in
   [multi-tenancy-spec.md §7](multi-tenancy-spec.md).
3. **The rules test suite must pass with two populated tenants** before any
   rules deploy. Single-tenant fixtures cannot observe a cross-tenant failure —
   they pass identically against a ruleset with no `inMyOrg()` at all.
4. **Never build production with `VITE_ENABLE_E2E_ACCOUNTS=true`.** It grants
   elevated roles to fixed test emails, and those accounts carry no `orgId`, so
   they land in the `'default'` tenant with administrator reach
   (`CLAUDE.md`, *Auth & roles*).

---

## 5. Conformance requirements for new code

A change satisfies this specification only if all of these hold.

**New Firestore collection holding tenant data**
1. Documents carry `orgId: string`.
2. Rules use the §3.1 shape, with `update`/`delete` testing *both* the stored
   and incoming document.
3. Added to `ORG_SCOPED_COLLECTIONS` ([orgBackfill.ts:29](../src/lib/orgBackfill.ts#L29)).
4. Added to `SEEDED_COLLECTION_NAMES` if seeded ([seed.ts:64](../src/lib/seed.ts#L64)).
5. Covered by the parameterised cross-tenant read/write/overwrite tests.

**New Firestore query**
6. Carries `where('orgId','==',orgKey)` with the key from
   `resolveOrgKeyForProfile(profile)` — reached by going through `useCollection`
   rather than around it ([useFirestore.ts:57](../src/lib/useFirestore.ts#L57)).
7. If it adds `orderBy` or a second equality, the composite index ships in
   `firestore.indexes.json` in the same change — a missing index fails the query
   for every tenant.

**New local store**
8. Keyed through `persistentCollection` or `orgScopedKey`; never a bare
   `localStorage` key.
9. Read through the store getter, never the exported seed array (`CLAUDE.md`,
   *Mutable collections must persist*).

**New bulk or administrative operation**
10. Takes an `orgKey` parameter and filters every read and write by it.
11. Offers a dry run if it writes or deletes in bulk.
12. Is gated in the UI by role *and* by rule — never by rule alone if it has any
    client-side effect (G5), and never by UI alone.

**Any change that should not reach every tenant at once**
13. Declared in `FEATURE_FLAGS` ([features.ts](../src/lib/features.ts)) and read
    through `useFeature`/`isFeatureEnabled` — there is no deployment-level way
    to stage a rollout (§4.1).
14. Gates behaviour only. A flag must never appear in `firestore.rules`, and
    whatever it turns on must be safe for a tenant to reach with it off.

**Any change touching roles, `orgId`, or the access mappings**
15. Ships a `tests/rules/` case. The E2E suite drives the UI and never exercises
    the rules, so a permission change with only an E2E test is untested
    (`CLAUDE.md`, *Commands*).

---

## 6. Test obligations

`tests/rules/multitenancy.rules.test.mjs` already parameterises the core matrix
over every scoped collection: cross-tenant `get` denied, own-tenant `get`
allowed, unfiltered `list` denied, foreign-filtered `list` denied, cross-tenant
write denied, and cross-tenant **overwrite** denied
([multitenancy.rules.test.mjs:117–231](../tests/rules/multitenancy.rules.test.mjs#L117-L231)).
Extend that matrix rather than writing a bespoke test per collection.

Cases added to satisfy §2 as written, all now present:

| Invariant | Case | Where |
|---|---|---|
| I2 | employee of B cannot read A's `handbook` pointer or version document | `handbook.rules.test.mjs` |
| I2 | principal of B cannot read A's `users/{uid}`; an employee cannot list at all | `multitenancy.rules.test.mjs` |
| I2 | employee of B cannot read A's `org_settings`; an unpublished setting still reads | `multitenancy.rules.test.mjs` |
| I4 | HR of B cannot move an account into A by writing `orgId` | `multitenancy.rules.test.mjs` |
| I5 | a link naming an employee of A, written by HR of B, is denied | `multitenancy.rules.test.mjs` |
| I8→config | configuration survives a browser that has never seen it | `org-settings.spec.ts` (deploy-gated, §8) |

One shape is worth copying rather than rediscovering: a rule that reads
`resource.data` denies a `get` on a document that does **not exist**, because
`resource` is null and the dereference fails evaluation. Any collection the app
subscribes to before first write — `org_settings` is the one so far — must test
the document id instead, and needs a test for the absent case.

A guarantee also has to be shown to *discriminate*. The multi-tenancy spec's
verification does this and the practice is required going forward: neutralising
`inMyOrg()` to `isSignedIn()` must fail a large block of tests, and removing
`inMyOrg()` from `update` alone must fail exactly the overwrite tests.

---

## 7. The gaps, and how each was closed

G1–G6 were found while writing this against the code. G7 was found while
running the rollout for them, and is the most serious: it is not one tenant
reading another, it is anyone at all reading the incumbent one. Each entry
states what was wrong, the change, and the test that fails without it.

**G1 — The handbook was readable across tenants. (I2, high.) — CLOSED.**
`allow read: if isSignedIn()` on both `handbook_versions` and `handbook`, and
the version document carries the PDF itself in `contentBase64`: any signed-in
account of any organisation could read any other's employee handbook in full.
The write side was scoped from the start, which is what made the read side easy
to miss.

*Fix.* `inMyOrg()` on the version read, split get/list; the pointer tests its
own document id (`orgKey == myOrgKey()`), the trick it was already using for
writes. `useHandbook` now filters with `where('orgId','==',orgKey)` instead of
fetching the collection and filtering in JS — the list rule makes that
mandatory, not merely tidier. `handbookOrgId` stamped `null` for a legacy org,
which no equality filter matches, so it now stamps the `'default'` sentinel and
`handbook_versions` joined `ORG_SCOPED_COLLECTIONS` to repair the existing ones.
*Discriminates:* 6 failures in `handbook.rules.test.mjs`.

**G2 — The user directory was readable across tenants. (I2, medium.) — CLOSED.**
`allow read: if isSignedIn()` on `users` exposed every account's email, role,
`orgId` and `superAdmin` flag to every signed-in user of every organisation.

*Fix.* Split get/list. `get` is self, a platform admin, a super admin, or HR
over an account in their own org; `list` drops the self case. A platform admin
is deliberately **not** org-scoped — administering every organisation is the
difference between `admin` and `hr`. The Admin dashboard's directory query is
now filtered by `orgId` for HR and unfiltered for platform admins, with the
`orderBy` moved into JS so the filter needs no composite index. The two
backfills that read `users` were adjusted the same way.
*Discriminates:* 6 failures in `multitenancy.rules.test.mjs`.

**G3 — Leave policies and payroll configuration were not tenant data at all.
(I8 misapplied, high.) — CLOSED.**
`leavePolicies`, `companyProfile`, `holidays`, `departments`, `integrations`,
`notificationPreferences` and the permission matrix existed **only** in
localStorage. Three consequences, and only the first was about isolation: the
tenant boundary was a client-owned string; two administrators of the *same*
organisation did not share the configuration, while accrual policy is what LOP
deductions are computed from; and Delete Mock Data destroyed the only copy.

*Fix.* A new org-scoped `org_settings` collection, one document per setting per
organisation, keyed `<orgKey>__<setting>` and carrying `orgId` like every other
tenant document. The payload is a JSON string — nothing queries inside it, and a
string sidesteps Firestore's nested-array and undefined-field constraints while
staying byte-identical to the cache. `src/lib/orgSettings.ts` holds the registry,
the write-through publish, and the sign-in subscription; the data modules keep
reading localStorage synchronously at module-load time, which is now a **cache**
hydrated from Firestore rather than the store. `backfillOrgSettings` publishes an
existing organisation's local configuration once, never overwriting a document
another administrator already published, and the purge deletes `org_settings`
so a reset is still a reset.

One detail worth keeping: `get` on these documents tests the **document id**,
not `resource.data`. The sync subscribes before the document exists, `resource`
is null for a document that is not there, and a rule that dereferences it fails
evaluation — which denies every subscription and leaves configuration silently
un-synced. That bug was found by driving the real app, not by the rules tests,
and there is now a test for it.
*Discriminates:* 3 failures in `multitenancy.rules.test.mjs`.

**G4 — `employee_links` used a different tenant key from everything else.
(I5, low but latent.) — CLOSED.**
The backfill omitted `orgId` entirely for the default tenant and the rules
compared the nullable `myOrgId()` rather than the `'default'`-sentinel
`myOrgKey()`; `role_assignments` did the same. Consistent only for as long as
"no orgId" and "orgId 'default'" stay interchangeable, which stops being true
the moment a default-tenant account is given an explicit `orgId`.

*Fix.* One `orgKeyOf(data)` helper in the rules reads absent **and**
explicitly-null `orgId` as `'default'`, and `inMyOrg`/`writingToMyOrg` and both
identity collections now go through it. The three write sites stamp the sentinel
unconditionally, and `backfillIdentityOrgIds` repairs existing documents in
`users`, `employee_links` and `role_assignments` — skipping super admins, who
are not members of an organisation and must not be recorded as if they were.
*Discriminates:* 1 failure in `multitenancy.rules.test.mjs`.

**G5 — The gate on Settings → Database was client-owned. (I7 / defence in depth,
low.) — CLOSED.**
`/settings` was guarded, but by a permission matrix living in localStorage that
`enforceRequiredPermissions` does not pin for the Settings row — so an employee
could grant themselves the module in devtools. The Firestore half of each
operation was refused by the rules, but the localStorage sweep in
`handleResetMockData` had no server to refuse it.

*Fix.* `DatabaseSection` authorizes on `profile.role`, a Firestore document only
an administrator can write, and the reset handler re-checks before the sweep.
The permission matrix moving into `org_settings` (G3) removes the forgery's
durability as well — it is now an administrator-authored document, though the
rules remain the authorization boundary either way.
*Discriminates:* the E2E test performs exactly that devtools edit and fails
against the ungated section.

**G6 — `managerChainIds` staleness had no trigger. (I5, medium.) — CLOSED.**
An access-control input that only a manual Settings action refreshed. Stale in
both directions: it withholds a manager's access to a new report's leave, and
after a transfer it keeps granting the *former* manager access.

*Fix.* `src/lib/reportingChains.ts` recomputes on the three directory writes
that move the tree — hire under a manager, reporting-line change, deletion —
and is skipped for edits that do not touch it. It reads the tree from the
**employee directory**, not the Firestore `employees` collection: it runs
immediately after a localStorage write that Firestore has not seen, so
recomputing from Firestore would rewrite the stale chain and report success.
Best-effort like the HR role sync beside it; the Settings backfill still repairs
anything missed.

**G7 — A public sign-up read the default organisation. (I9, critical.) —
CLOSED.**
Found while running the rollout, not while writing this. The login page offered
self-registration (`signUpEmail`), a new account got `role: 'employee'` and **no
`orgId`**, and `myOrgKey()` defined "no orgId" as `'default'`. So anyone who
signed up landed inside the incumbent tenant. Confirmed against the live
project with a throwaway account, since created and deleted: `employees`
returned rows, `org_settings` returned rows. Everything on the
`isSignedIn() && inMyOrg()` tier was exposed — directory, attendance, jobs,
candidates, expenses, assets, goals, reviews, onboarding, payroll runs,
helpdesk, billing. `payslips` correctly returned 403, so the per-employee tier
from the salary/leave spec held.

This is not one tenant reading another. It is the failure mode the whole
document is about, reached by the front door.

The root cause is the `'default'` sentinel doing two jobs. For a **document** it
is right: one written before multi-tenancy is legacy data belonging to the
legacy org, which is what `orgKeyOf` encodes and what kept the migration from
breaking every existing record. For a **person** it is wrong: a document with no
orgId is legacy data, an account with no orgId is a stranger.

*Fix, both halves.*
  - `myOrgKey()` resolves an unassigned account to a sentinel that matches
    nothing. Safe only because the identity backfill had already stamped every
    legitimate default-org account — the sequencing was luck, and §10 now states
    the dependency so it cannot be run the other way round. Super admins keep
    `'default'`: they deliberately carry no `orgId`, `isSuperAdmin()`
    short-circuits the checks that matter, and a few rules compare the value
    directly, so changing it for them would revoke capabilities unrelated to
    this. The sentinel contains no `__`, because the `org_settings` rule splits
    a document id on that separator.
  - Self-registration is gone — the form, and `signUpEmail` from the auth
    context, so there is no callable path left. Accounts are created the way
    every other account already is: super-admin org provisioning, or an
    administrator attaching an existing one. Closing the door as well as the
    room behind it, because the rules fix protects against the next way in and
    the removal protects against this one.

*Discriminates:* 3 failures in `multitenancy.rules.test.mjs`. One of those
asserts sign-in still works — an account that fails closed must still read its
own profile, or it is broken rather than merely unauthorised.

**Residual, not a gap: super-admin exemption.** A super admin bypasses
`inMyOrg()` and `writingToMyOrg()` by design, so their client-side active tenant
key is the only thing keeping their writes in the right namespace. The
reload-on-switch (§4.2) is the mitigation, and it is why that reload may not be
optimised away.

---

## 8. What the E2E suite cannot check

Worth recording, because it looks like a coverage gap and is a structural one.

The E2E suite signs in against **live** Firebase, so it exercises the *deployed*
ruleset rather than the one in the working tree. A rules change cannot be
verified end-to-end before it ships. That is why the cross-machine configuration
test in `tests/e2e/org-settings.spec.ts` is gated behind
`E2E_ORG_SETTINGS_DEPLOYED=true` — it is the real acceptance test for G3, it
could not pass before the rules were deployed, and it passes now that they are.
The gate stays, so the suite still runs green against a project on older rules.

What runs unconditionally is the property that made the ordering safe: a refused
publish is logged and swallowed, never thrown, so a save cannot surface as a
lost edit during the window between the two deploys.

**A second thing changed with G3 that is easy to miss.** Configuration used to
be per-browser, so a test that edited it dirtied only its own throwaway context.
It is a shared document now, and Settings offers Edit but no Delete for a leave
type — so a test that adds one has no UI path to undo it, and every run would
add another to the organisation's real configuration. `removeTestPolicies`
cleans up over the Firestore REST API in an `afterAll`, which runs even on a red
run. Any future spec that writes configuration owes the same.

---

## 9. Verification

- `npm run build` clean. **284/284** rules tests. **93 passed** across the
  Chromium E2E projects, the deploy-gated test included now that the rules are
  out.
- Every fix shown to discriminate by neutralising it and re-running:

  | Neutralised | Failures |
  |---|---|
  | handbook read → `isSignedIn()` | 6 |
  | `users` read → `isSignedIn()` | 6 |
  | `org_settings` read → `isSignedIn()` | 3 |
  | identity keys → `myOrgId()` | 1 |
  | unassigned account → `'default'` | 3 |
  | `DatabaseSection` gate → always true | the E2E forged-grant test |

- G5 verified in the real app: an employee persona writes a permission matrix
  granting itself Settings, reaches Settings → Database, and the section
  refuses on the server-backed role.
- One incidental fix the verification forced: `Field` in the settings page
  rendered a `<label>` that neither wrapped its input nor carried `htmlFor`, so
  every field in Settings had no accessible name. It now associates them with
  `useId`.
- The feature-flag mechanism (§4.1) ships with its own rules cases: a member
  reads their own organisation record, another organisation's is denied, HR and
  employees cannot set a flag, a super admin can set one on any organisation.
  One of them pins a bug the change fixed on the way past — `organizations`
  compared `myProfile().orgId == orgId`, which *errors* for an account with no
  `orgId` (a missing map key fails evaluation rather than reading as null), so
  every legacy account was refused the read outright rather than simply not
  matching.

---

## 10. Rollout

Ordering is not optional here — **rules first**, and the gap is user-visible if
it is reversed.

1. ~~**Deploy the rules** (`firebase deploy --only firestore:rules`).~~ **Done.**
   Safe against the app that was deployed at the time: the tightened reads only
   ever remove access the old bundle did not depend on, with one exception —
   the Admin dashboard's `users` query, which the old bundle issues unfiltered
   and which fails for an **HR manager** until step 2. Platform admins and super
   admins are unaffected, and no employee-facing screen reads `users`.
2. ~~**Deploy the app**~~ **Done** — merged; `main` auto-deployed hosting. This
   cleared the HR-manager exception above and turned `org_settings` on.
3. **Run the backfills, per organisation**, dry run then apply:
   Settings → Database → "Backfill organization IDs" (now also stamps the
   identity collections and publishes this browser's configuration), then
   "Backfill employee access mapping". Whoever runs step 3 should be on the
   browser holding the good copy of that organisation's configuration — it
   publishes what is local, and never overwrites what another administrator
   already published.
4. ~~**Run the deploy-gated E2E test.**~~ **Done** — passing with
   `E2E_ORG_SETTINGS_DEPLOYED=true` against the deployed rules.
5. **Deploy the rules again for G7, and only after step 3.** This is a hard
   dependency, not a preference: the G7 rule tells a legitimate default-org
   account apart from a stranger *by the stamp the identity backfill writes*.
   Deploy it against un-stamped accounts and you lock out every one of them.
   Step 3 has been run for the default organisation; any organisation whose
   accounts have not been stamped must be done first.

Step 3 matters for a reason §4 of [multi-tenancy-spec.md](multi-tenancy-spec.md)
sets out: an un-stamped document is permitted but unreachable. Two new instances
of that asymmetry ship here — legacy `handbook_versions` carrying `orgId: null`,
and `users` documents carrying no `orgId` at all, the latter showing a legacy
organisation's HR manager an empty Admin dashboard until it runs.

---


## 11. Review checklist

For any change touching data, rules, roles or the admin operations:

- [ ] Every new document type carries `orgId`, and every new query filters on it.
- [ ] `update`/`delete` rules test the stored document, not only the incoming one.
- [ ] No unfiltered `getDocs` on a tenant collection outside the backfill path.
- [ ] No bare `localStorage` key; no security decision derived from one.
- [ ] New bulk operation takes `orgKey`, dry-runs, and is gated in UI *and* rules.
- [ ] Rules tests added, with two populated tenants, and shown to fail without
      the change.
- [ ] Deploy order stated: rules → app → per-tenant migration.
- [ ] If the change must not reach all tenants at once, say so explicitly — there
      is no mechanism for that today (§4.1).
