# Multi-organisation onboarding — simulation and production readiness

**Verdict: not ready for a second paying organisation. Ready to keep serving the
incumbent one.**

An organisation can be created, its administrator can sign in, and it is
genuinely isolated from every other tenant — that part holds up, and is now
tested. What does not work is the step after: the people that organisation adds
never reach the server, so its employees cannot read their own salary or leave,
and its roster does not survive a change of browser. One isolation defect was
also found and fixed here; two rollout steps from
[tenant-isolation-spec.md](tenant-isolation-spec.md) §10 remain open.

The blocking items are B1, B2 and R1–R2 below. None is large. B1 is a day's work
with a spec; the rest are hours.

---

## 1. What was simulated

`tests/rules/onboarding.rules.test.mjs` — **525 assertions**, run under
`npm run test:rules` against the Firestore emulator and the **working tree's**
`firestore.rules`.

Three organisations (Acme, Borealis, Cendant) are brought into being in order,
and every write is issued **through the rules, as the principal who issues it in
the app** — the super admin for provisioning, each organisation's own `hr`
account for configuration, invites and data. A provisioning step the rules would
refuse fails the suite rather than being written past with
`withSecurityRulesDisabled`. The sequence mirrors `src/lib/organizations.ts:52-102`
and `src/lib/accountInvites.ts:104-127`.

Three tenants rather than two, deliberately: with two, "my org" and "not my org"
are the same partition, so a rule leaking to exactly one other tenant is
indistinguishable from one leaking to all of them. The cross-tenant matrix runs
over every ordered pair.

**No production data was touched.** `createOrganization` mints a real Firebase
Auth account and an `organizations` document, and the app has no
delete-organisation path — so a live rehearsal would have left permanent test
tenants in `modcon-hr`.

**What this cannot tell you**: the emulator runs the working tree's ruleset, not
the deployed one. That is the point (it is the first thing here that can test a
rules change *before* it ships — [tenant-isolation-spec.md](tenant-isolation-spec.md)
§8), but it means "green here" and "green in production" are different claims
until the rules are deployed.

### Results

| Group | Assertions | Result |
|---|---|---|
| Provisioning: org record, first `hr` account, role assignment, org-key shape | 13 | pass |
| An org administrator administers one organisation (9 escalation attempts) | 9 | pass |
| Cross-tenant matrix, every ordered pair × every collection | 444 | pass |
| Unfiltered lists denied; own-org lists allowed; self-reads survive | 43 | pass |
| A new organisation can use the product (config, directory, salary via link) | 10 | pass |
| Super admin spans organisations | 5 | pass |
| An account with no organisation reaches none of them | 5 | pass |
| **Total** | **525** | **525 pass** |

Full suite after the change: **816 / 816** (`npm run test:rules`).
`npm run build` clean. Chromium E2E: see §5.

---

## 2. Fixed in this change

### B0 — Any organisation's HR admin could read every organisation's access mappings

`firestore.rules`, `/role_assignments` and `/employee_links`, both:

```
allow read: if isOrgAdmin() || (isSignedIn() && <self>);
```

`read` covers `list`, and `isOrgAdmin()` never dereferences `resource` — so it
was satisfied for a whole-collection list regardless of which tenant owned the
documents returned. The HR administrator of any organisation could
`getDocs(collection(db, 'employee_links'))` and read **every** tenant's
`uid → employeeId → orgId` mapping, and likewise every pending role assignment
with its email and orgId. That is invariant **I2** exactly, which names both
collections.

It survived because every existing test on these two collections is a *write*
test. The read side was never asserted.

Fixed by splitting `get`/`list` and org-scoping both, with the self branch
evaluated first — `inMyOrg()` reads `resource.data`, and a `get` on a document
that does not exist has no `resource`, so ordering it first would deny a new
account the read of its own not-yet-written link.

`src/lib/accessBackfill.ts:86` did exactly that unfiltered list for its own
org's backfill, so it is filtered in the same change, on the same terms the
adjacent `users` read already uses.

**Discrimination**: reverting the two rule blocks and re-running →
**26 of 525 fail**. Restored, 525 pass.

### B3 — Four Firestore writes never stamped `orgId`, and hid their own failure

- `src/data/billing.ts` — `billing_preferences` was written to the fixed
  document id `'current'`, **shared by every tenant**, with no `orgId`. Keyed
  per organisation now.
- `src/data/billing.ts` — `billing_invoices` written with no `orgId`.
- `src/pages/expenses/index.tsx` — expense claims written with no `orgId`.

All four are denied by `writingToMyOrg()` for any non-default tenant, and for
the default tenant produce a document that `useExpenses()` / the billing hooks
then drop, because their own `where('orgId','==',…)` filter does not match a
missing field. Both failures were silent: two bare `catch {}`, two
`console.error`. Now stamped with `getActiveOrgKey()`, and the failures are
logged rather than swallowed.

### B4 — The Admin dashboard showed a correctly onboarded organisation zeros

`src/pages/admin/index.tsx` blanked employees, jobs, payroll runs and expenses
for every organisation except the default one:

```ts
const isDefaultOrgViewer = isSuperAdmin || !profile?.orgId;
const employees = isDefaultOrgViewer ? allEmployees : [];
```

The comment justifying it said those collections "have no orgId field at all".
That is stale: `useCollection` injects `where('orgId','==',orgKey)`
(`src/lib/useFirestore.ts:69-76`) and the seed stamps every document it writes
(`src/lib/seed.ts:235-237`). So a new organisation's administrator saw an empty
dashboard for its own real data. Removed; the hook's filter is the mechanism
the rest of the app already trusts.

### B5 — The credentials handed to a new administrator did not name their organisation

`src/pages/organizations/index.tsx` — the copy-to-clipboard text read
`Organization: <adminEmail>`. One line, in the flow being simulated.

---

## 3. Found and **not** fixed

### B1 — Employees never reach Firestore (blocking)

`addEmployeeToDirectory` (`src/data/employees.ts:219`) writes only to
org-scoped localStorage. Nothing in `src/` calls
`addNew(Collections.employees, …)` — the only `addNew` call in the codebase
creates organisations.

Three consequences, in order of severity:

1. **An invited employee cannot read their own salary or leave.**
   `inviteAccount`'s `linkToEmployeeRecord` (`src/lib/accountInvites.ts:148-174`)
   queries Firestore `employees` for the address and writes
   `employee_links/{uid}` only on exactly one match. For an organisation whose
   people were added through the UI there are zero matches, so no link is
   written — and without a link the per-employee tier of the rules resolves to
   no employee and fails closed. The simulation asserts the positive case
   (`an invited employee reads their own compensation through their link`); in
   production that link does not exist.
2. **The roster is per-browser and per-device.** A new organisation's directory
   lives in one browser's localStorage. Another administrator, or the same
   person on another machine, sees an empty company.
3. `backfillEmployeeLinks` has nothing to match against, so the documented
   repair path does not repair it either.

This is the single largest gap between "the demo works" and "a second customer
can use it". It is not fixed here because making the directory
Firestore-authoritative means turning `getEmployeeDirectory()` from a
synchronous module-load read into an async subscription, and every
`src/data/*.ts` module reads it at module scope — rippling into `dataScope.ts`,
`dashboard.ts`, `notifications.ts`, `reportingChains.ts` and every approval
page. That is its own change with its own spec.

**The cheap correct interim fix** is a write-through, keeping localStorage as
the sole read path — the same shape `orgSettings.ts` already uses for
configuration (Firestore is the copy of record, localStorage a synchronously
readable cache). A `syncEmployeeToFirestore(employee)` built on the existing
`upsert`/`remove` in `src/lib/db.ts`, stamped with `getActiveOrgKey()`, called
beside the existing `syncHrRoleForEmployee` calls in
`src/pages/employees/index.tsx`. It unblocks consequence 1 and 3 immediately and
leaves 2 for the larger change.

### B2 — The per-organisation backfill cannot be run by the organisation (blocking for rollout)

`backfillOrgIds` does an unfiltered `getDocs(collection(db, name))` per
collection (`src/lib/orgBackfill.ts:95`). Once a second tenant has data that
list is denied for anyone who is not a platform or super admin. The code comment
at `orgBackfill.ts:16-19` already concedes this; §10 step 3 of the isolation
spec does not, and points an organisation's own HR admin at Settings → Database.
They get per-collection `⚠️` lines that the UI presents as completion.

This matters because §10 step 5 — the G7 rules deploy — is hard-blocked on step
3 having genuinely run for every organisation. Fix is documentation plus a UI
gate: the backfill must be run by a **super admin switched to that
organisation**. §10 step 3 of the isolation spec now says so; the UI gate is
still to do.

The B0 fix above narrows this slightly and in the same direction:
`backfillIdentityOrgIds` lists `employee_links` and `role_assignments`
unfiltered (`src/lib/orgBackfill.ts:174`), which an HR admin could previously
do and now cannot. Every other reader of those two collections is a
single-document `getDoc` keyed by uid or email and is unaffected — checked
across `src/data/roleAssignments.ts`, `src/data/employeeLinks.ts`,
`src/lib/auth.tsx` and `src/lib/accountInvites.ts`.

### Lower severity, recorded

| | Finding |
|---|---|
| **L1** | A super admin who has not switched organisation and uses Admin → Create account files the new user into `'default'`, with nothing in the dialog saying so. `resolveOrgKeyForProfile` is right; the dialog should name the target organisation. |
| **L2** | Client and rules compute the unassigned key differently — `'default'` (`src/lib/orgScope.ts:102`) vs `'~unassigned~'` (`firestore.rules:139-143`). Fails closed as intended, but produces confusing permission-denied. |
| **L3** | `firestore.rules:321,328` — `users` update/delete still compare the nullable `myOrgId()` rather than `myOrgKey()`. G4 was only half-applied; the read and create paths were converted, the mutate path was not. |
| **L4** | `src/lib/seed.ts:50` reuses the literal source-file document ids, so seeding a second tenant collides with the first. The rules stop it for HR, but a super admin bypasses `inMyOrg()` and would silently take the first tenant's documents over. The `try/catch` at `:245-247` logs "Skipped" either way. |
| **L5** | The purge never clears `billing_preferences`, `billing_invoices` or `handbook_versions` — they are in `ORG_SCOPED_COLLECTIONS` but in neither `SEEDED_COLLECTION_NAMES` nor `PURGED_ONLY_COLLECTION_NAMES`. |
| **L6** | `firestore.rules:488,595,644` — the self-service update predicates compare `employeeId` to `request.auth.uid`, which can never be true (the file's own comment at `:58-61` says so). Net effect: an employee cannot update their own expense, leave request or regularization; only a manager can. |
| **L7** | There is no delete-organisation path. A mis-provisioned organisation is permanent and its `adminEmail` is burned (`auth/email-already-in-use` on retry). No password reset and no email delivery either — temporary passwords are shown once and passed on by hand. |
| **L8** | Remaining test gaps: no cross-org write/overwrite case for `employee_compensation`, `payslips`, `leave_requests`, `leave_balances`, `helpdesk_tickets`, `regularizations`; no E2E persona for a second organisation. |

---

## 4. Onboarding runbook — organisation N+1

1. Super admin → **Organizations → Create Organization**. Name, administrator
   name, administrator email. The temporary password is shown **once** — copy it
   before closing the dialog; there is no reset flow and no email is sent.
2. Hand over the credentials. The new administrator signs in; the page reloads
   once as the local namespace switches to their organisation.
3. They fill **Settings → Company Profile**, including **HR designations** —
   this list decides who administers the organisation and who sees whose
   records, and an empty list means the organisation has no HR manager.
4. They add employees, then create accounts from **Admin → Create account**.
   *Today this is where onboarding stops working* — see B1. Until it is fixed,
   an invited employee will not be able to read their own salary or leave.
5. **A super admin, switched to that organisation** (not its own HR admin —
   B2), runs Settings → Database → "Backfill organization IDs", dry run then
   apply, then "Backfill employee access mapping". From the browser holding that
   organisation's good configuration: it publishes what is local and never
   overwrites what another administrator already published.
6. Verify: the new administrator's Admin dashboard shows their real counts, and
   Settings → Company Profile survives a reload in a different browser.

---

## 5. Verification performed

| Command | Result |
|---|---|
| `npm ci` | clean |
| `npm run build` (`tsc -b && vite build`) | clean |
| `npm run test:rules` | **816 / 816** |
| `tests/rules/onboarding.rules.test.mjs` alone | **525 / 525** |
| Discrimination: revert the B0 rule fix, re-run | **26 fail** — restored, green |
| `E2E_BROWSERS=chromium npm run test:e2e`, projects `app`, `role-employee`, `role-manager`, `role-admin` | **92 passed, 1 skipped** |

The skip is `org-settings.spec.ts`'s cross-machine configuration test, gated
behind `E2E_ORG_SETTINGS_DEPLOYED=true` (§8).

E2E runs against **live** Firebase and therefore against the **deployed**
ruleset, not the working tree. It cannot confirm the B0 fix — that is what the
rules suite is for. `app-firefox` / `app-webkit` need
`npx playwright install firefox webkit` and were not run.

---

## 6. Go-live gate

**Verified by CI** (`.github/workflows/ci.yml` runs build + rules on every PR):

- [x] `npm run build` clean
- [x] 816 rules assertions, including the 525-assertion three-organisation
      onboarding simulation
- [x] Tenant isolation holds across every ordered pair of three organisations

**Requires a human, before a second organisation is sold:**

- [ ] **B1** — employees reach Firestore, so an invited employee can read their
      own salary and leave. *Blocking.*
- [ ] **B2** — §10 step 3 corrected to say super-admin-only, and gated in the UI.
      *Blocking for rollout.*
- [ ] Deploy the rules **before** the app (`firebase deploy --only
      firestore:rules`). The B0 tightening removes access, so it must land
      first — and the `accessBackfill` query fix must ship with or before it.
- [ ] Run the per-organisation backfills for **every** existing organisation.
      There is no record of which have been done.
- [ ] **Then** the G7 rules deploy (§10 step 5, still open). Deployed against
      un-stamped accounts it locks every one of them out. *Largest single risk
      on the board.*
- [ ] Audit `users` for documents with no `orgId` and `superAdmin !== true` —
      each is an account the G7 deploy will lock out.
- [ ] Audit `organizations` for records with no `adminUid` — a
      `createOrganization` whose rollback also failed.
- [ ] Organizations → "Review admin roles": confirm no organisation still holds
      a platform `admin` as its first account.
- [ ] Confirm no production build carries `VITE_ENABLE_E2E_ACCOUNTS=true`
      (§4.3.4) — check `vercel.json` and
      `.github/workflows/firebase-hosting.yml`.

**Accepted, by design:**

- No per-tenant deploy target, ruleset or canary — one Firebase project, one
  ruleset, one hosting bundle ([tenant-isolation-spec.md](tenant-isolation-spec.md)
  §4.1). Per-tenant containment is expressed in `organizations/{orgId}.features`,
  not in deployment.
