# Multi-tenancy — orgId scoping across every module

How tenant isolation is enforced in Firestore: the `orgId` convention, the
rules, the client-side query contract, and the backfill that reconciles them.

Status: **implemented** on `fix/org-scoped-multitenancy`.

---

## 1. What was wrong

Before this, most collections read:

```
match /employees/{docId} {
  allow read: if isSignedIn();
  allow write: if isOrgAdmin();
}
```

No `orgId` on the documents, and no org comparison in the rule. So **any
signed-in user of any organisation could read every other organisation's
employees, attendance, payroll runs, jobs, candidates, onboarding, goals,
reviews, expenses, assets, helpdesk tickets and regularizations.** The app is
multi-tenant — super admins provision organisations, each with its own HR
administrator — and the data layer was not.

Two collections were worse than the rest:

- `billing_preferences` / `billing_invoices` were `allow write: if isSignedIn()`
  — any employee could rewrite their company's billing configuration.
- The Firestore purge behind Settings → Delete Mock Data deleted collections
  wholesale, so one organisation clearing its demo data destroyed every other
  tenant's records. It was guarded only by a client-side "default org only"
  check that a non-default admin could not trigger — a comment where an
  authorization rule should have been.

---

## 2. The convention

Every tenant document carries `orgId: string`. The key is **never null**:
accounts without an `orgId` — super admins, and the accounts predating
multi-org support — resolve to the literal `'default'`, matching
`DEFAULT_ORG_KEY` in `src/lib/orgScope.ts` and the convention the handbook
already used.

A string rather than `null` because of §4: Firestore equality filters do not
match a document that is missing the field, and `where('orgId','==',null)` is
not a usable substitute.

```
function myOrgKey() {
  return myOrgId() == null ? 'default' : myOrgId();
}
function inMyOrg() {
  return isSuperAdmin() || resource.data.get('orgId', 'default') == myOrgKey();
}
function writingToMyOrg() {
  return isSuperAdmin() || request.resource.data.get('orgId', 'default') == myOrgKey();
}
```

`inMyOrg()` reads a **missing** `orgId` as `'default'` so legacy records stay
readable the moment these rules deploy, rather than every pre-existing document
vanishing mid-migration. Super admins bypass both, because they administer every
organisation and switch between them in the UI.

### Writes are split, and this matters

```
allow create: if isOrgAdmin() && writingToMyOrg();
allow update: if isOrgAdmin() && inMyOrg() && writingToMyOrg();
allow delete: if isOrgAdmin() && inMyOrg();
```

A single `allow write: if isOrgAdmin() && writingToMyOrg()` is **not enough**,
and the first draft here had exactly that bug. It validates only the *incoming*
document, so org A's HR could overwrite org B's record while stamping their own
`orgId` — a takeover, not a write. `update`/`delete` must also test the stored
document via `inMyOrg()`. The rules test
`"HR of org A cannot overwrite org B's existing record"` exists for this and
fails against the single-rule version.

---

## 3. The client query contract

`firestore.rules` evaluates a `list` against every document the query returns
and fails the **whole query** if any one is disallowed. So an unfiltered read of
an org-scoped collection is rejected outright once a second tenant has data.

Filtering is therefore not an optimisation — it is what makes the query legal.
`useCollection` in `src/lib/useFirestore.ts` adds `where('orgId','==',orgKey)`
to every subscription, resolving the key from the signed-in profile via
`resolveOrgKeyForProfile`.

Any new Firestore read must carry the same filter. A query that omits it will
fail with `permission-denied` rather than silently returning another tenant's
rows, which is the right way round.

---

## 4. Why the backfill is mandatory

The rules and the queries disagree about a document with no `orgId`:

| | Document missing `orgId` |
|---|---|
| `firestore.rules` | Treated as `'default'` → **readable** by the legacy org |
| `where('orgId','==','default')` | Field absent → **does not match** → invisible |

So an un-backfilled record is *permitted but unreachable*: it silently drops out
of every list in the app. The rules fail open (deliberately, so nothing breaks
at deploy time) while the queries fail closed, and only writing the field
reconciles them.

**This is observable, not theoretical.** With legacy documents in place, the
Admin dashboard reports `Employees on record: 0` and `Open Job Postings: 0`
while the documents sit in Firestore, readable. After the backfill the same
screen reports 3 and 1. Both states were reproduced in the browser against the
emulator before this shipped.

`src/lib/orgBackfill.ts` stamps `orgId` onto every document lacking one, across
all 18 tenant collections. It is idempotent, never overwrites an `orgId` that is
already set, and has a dry-run mode — surfaced as Settings → Database →
"Backfill organization IDs", dry run first, then apply. The rules test
`"BACKFILL REQUIRED: a legacy document is invisible to the org-filtered query"`
asserts the asymmetry so it cannot be quietly forgotten.

---

## 5. Coverage

Org-scoped: `employees`, `employee_compensation`, `attendance`, `leave_requests`,
`leave_balances`, `payslips`, `payroll_runs`, `jobs`, `candidates`, `onboarding`,
`goals`, `performance_reviews`, `expenses`, `assets`, `helpdesk_tickets`,
`regularizations`, `billing_preferences`, `billing_invoices`, plus
`handbook_versions` / `handbook` which already were.

Deliberately not org-scoped by `orgId` field, because they carry their own
tenancy: `users` (has `orgId`, with its own rules), `organizations` (the doc id
*is* the org), `role_assignments` and `employee_links` (both already compare
`orgId` against `myOrgId()`).

Salary and leave keep their per-employee rules from
[the salary/leave spec](salary-leave-access-spec.md) — own record via
`employee_links`, managers via `managerChainIds` — with `inMyOrg()` layered on
top. The cross-org gap that spec recorded as a `KNOWN GAP` is now closed, and
its test asserts the opposite.

---

## 6. Verification

- `npm run build` clean; **238/238** rules tests; 48 app + 33 role E2E green.
- Both guarantees proved to discriminate:
  - Neutralising `inMyOrg()` to `isSignedIn()` fails **72** tests.
  - Removing only the `inMyOrg()` guard from `update` fails exactly the 11
    "cannot overwrite org B's existing record" tests and nothing else.
- Backfill exercised end to end in the browser against the Firestore emulator:
  legacy documents → Admin dashboard shows 0 → dry run reports 4 documents and
  changes nothing → apply → dashboard shows 3 employees and 1 job.

---

## 7. Rollout

1. **Deploy rules** (`firebase deploy --only firestore:rules`) — safe on its
   own: legacy documents still read as the default org.
2. **Deploy the app.** From this point the Firestore-backed screens filter by
   `orgId`, so legacy records go invisible until step 3. The Admin dashboard is
   the visible one.
3. **Run the backfill** — Settings → Database → Backfill organization IDs. Dry
   run, check the count, apply.

Steps 2 and 3 are close together by necessity; if that window matters, run the
backfill *before* deploying the app, since stamping `orgId` is harmless under
the old rules.

---

## 8. Known limits

- **`managerChainIds` is a write-time snapshot.** It goes stale when someone
  changes reporting line; whatever rewrites reporting lines must rewrite these.
- **The purge skips un-backfilled documents.** It filters by `orgId`, so legacy
  records match nothing and survive Delete Mock Data until stamped. Safer than
  the previous behaviour, which deleted every tenant's data.
- **`inMyOrg()` costs a `myProfile()` read per evaluation.** Firestore caches
  identical `get()`s within a request, so a list pays it once, not per document.
