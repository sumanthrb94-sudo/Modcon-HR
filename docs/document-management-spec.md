# Document Management — Employee Handbook

System specification for a document module in the ModCon HR portal, providing a
single org-wide **employee handbook** artifact: HR uploads and replaces it,
everybody reads it.

Status: **implemented on `feat/handbook-document-management`, storage option C.**
§4 was the one blocking decision; it is resolved for now behind an adapter seam
(`src/lib/handbookStorage.ts`) so A or B can replace it without touching the
rest of the module. See §11 for what shipped and what it cost.

---

## 1. Requirement as stated, and three corrections

The brief:

> Only authenticated users holding the HR role — validated against
> `getCurrentEmployeeRecord` and associated `dataScope` permissions — may
> initiate and complete upload. All authenticated users, irrespective of role or
> `isOwnRecord` status, get read-only access to the current version.

The *intent* is right and is what this spec builds. Three details in the wording
do not survive contact with the codebase and are corrected below.

### 1.1 `getCurrentEmployeeRecord` / `dataScope` cannot authorize a write

`getCurrentEmployeeRecord` ([dataScope.ts:123](../src/lib/dataScope.ts#L123))
resolves the caller against `getEmployeeDirectory()`, which is a
**localStorage-backed, client-controlled overlay** (`src/data/employees.ts`). A
user can edit their own `designation` in devtools. Gating upload on it means
gating upload on a value the attacker owns.

This is not a hypothetical — it is the exact trap the project already documented
and deliberately avoided for role grants (`CLAUDE.md`, *Auth & roles*):

> The grant is not derived from the employee record at sign-in. `src/data/employees.ts`
> is localStorage-backed and therefore client-controlled, so trusting it would let
> anyone edit their own designation and become an admin.

**Correction.** The authority for upload is the server-side `isOrgAdmin()`
helper in [firestore.rules:42](../firestore.rules#L42) — `users/{uid}.role` being
`hr` or `admin`, a document only an administrator can write. `getCurrentEmployeeRecord` and
`dataScope` are used **for presentation only**: deciding whether to render the
upload control, and stamping the uploader's name/employee id onto the metadata
record. Neither is ever the last line of defence. Same split the rest of the app
uses — see §5.

### 1.2 There is no `'HR'` role string

Stored roles are `admin | manager | employee | hr`. `'HR Manager'` is the
*display* role produced by `resolveAppRole`
([accessControl.ts:157](../src/lib/accessControl.ts#L157)). Throughout this spec,
"HR" means `profile.role === 'hr'` on the server and `resolveAppRole(profile) === 'HR Manager'`
in the UI.

### 1.3 `isOwnRecord` is not a permission primitive

It is a local `const` in one component
([my-attendance/index.tsx:163](../src/pages/my-attendance/index.tsx#L163)),
scoped to "am I looking at my own attendance row". A handbook is an
organisation-level artifact with no subject employee, so there is no ownership
relation to be irrespective of. The read rule is simply `isSignedIn()`, which is
already the read rule on every core collection.

The stated intent — *no per-employee scoping narrows handbook reads* — is
preserved and is tested explicitly (§8, R3): an Employee-role account with an
empty `dataScope` visibility set must still read the handbook. That test exists
to stop a future change from routing handbook reads through
`getVisibleEmployeeIds`.

---

## 2. Scope

**In scope.** One handbook artifact per organisation; administrator-only upload/replace;
universal authenticated read; immutable version history with a "current" pointer;
audit metadata; nav + route + permission-matrix wiring.

**Out of scope.** Arbitrary document libraries, per-employee documents (contracts,
payslip PDFs — payslips already have their own collection), acknowledgement
tracking ("I have read the handbook"), e-signature, folders, full-text search.
The data model in §3 is shaped so a general document library is a later
generalisation of `documents/{documentId}` rather than a rewrite, but nothing in
this spec builds it.

---

## 3. Data model

Two Firestore collections plus one binary object. Metadata is queryable and
rule-checkable; the binary is not in Firestore.

### `handbook_versions/{versionId}` — immutable, append-only

```ts
interface HandbookVersion {
  id: string;              // uuid, also the storage object name
  orgId: string | null;    // null = default/legacy org, matching users.orgId
  version: number;         // 1-based, monotonic per org
  fileName: string;        // original upload name, for the download filename
  contentType: 'application/pdf';
  sizeBytes: number;
  storagePath: string;     // orgs/{orgId}/handbook/{versionId}.pdf
  checksum: string;        // sha-256 hex of the bytes, computed client-side
  uploadedAt: string;      // ISO timestamp
  uploadedByUid: string;   // === request.auth.uid, enforced in rules
  uploadedByName: string;  // display only, from getCurrentEmployeeRecord
  uploadedByEmployeeId: string | null; // display only
  notes: string;           // optional "what changed", max 500 chars
}
```

Never updated, never deleted. Superseding is publishing a new version.

### `handbook/{orgId}` — the current-version pointer

```ts
interface HandbookPointer {
  orgId: string | null;
  currentVersionId: string;   // -> handbook_versions/{id}
  currentVersion: number;
  updatedAt: string;
  updatedByUid: string;
}
```

One document per org, so "the current handbook" is a single-document read with no
query, no index, and no ordering ambiguity. Document id is the `orgId` (literal
`default` for the null-org case) so the rules can compare it against `myOrgId()`
without a `get()`.

### Why versions are immutable

Reverting a bad upload is publishing the prior version's id back into the
pointer — an operation that cannot lose the intermediate state, and one HR can
perform without an engineer. It also makes the audit trail append-only, which is
the property you actually want from an HR policy document.

### Org scoping

`uploadedAt` and every other timestamp must come from the app clock
(`src/lib/today.ts`), never `new Date().toISOString()` inline — see the existing
convention. `orgId` comes from the caller's own profile server-side; the client
never names it (§6).

---

## 4. Binary storage — **the open decision**

Firebase Storage is **not provisioned in this project**. There is no
`firebase/storage` import anywhere in `src/`, no `storage` block in
`firebase.json`, and no `storage.rules` file. A `storageBucket` string exists in
[firebase.ts:10](../src/lib/firebase.ts#L10) but nothing uses it.

Worse, there is a constraint that shapes the whole module:

> **Cloud Storage security rules cannot read Firestore.** There is no
> `firestore.get()` in Storage rules. So a Storage rule *cannot* consult
> `users/{uid}.role` — the mechanism every other authorization check in this app
> relies on.

Role must therefore reach Storage some other way. Three viable options:

| | Approach | Cost | Fidelity |
|---|---|---|---|
| **A** *(recommended)* | Cloud Function sets an `hr` **custom claim** on the ID token when a role changes; Storage rules read `request.auth.token.hr == true` | Requires Cloud Functions + Blaze plan; claim refresh lag on role change (~1h, or force `getIdToken(true)`) | Production-correct |
| **B** | Upload via an authenticated **callable Function** that checks Firestore role and writes with the Admin SDK; Storage stays closed to all clients | Requires Functions + Blaze; upload path is server code | Production-correct, no claim lag |
| **C** | No Storage. Handbook PDF stored **base64 in the Firestore version doc**, gated by the existing `isOrgAdmin()` rule | Free, no new infra, ships today. Hard ceiling: Firestore's 1 MiB/doc, and base64 inflates ~33% → **~740 KB max PDF** | Demo-grade only |

**Recommendation: B.** It puts the role check in the one place that can read the
role, avoids the custom-claim staleness window entirely, and keeps Storage
client-closed so a leaked object path is not a write vector. A is acceptable if
you would rather not add a server-side upload path; C is acceptable *only* as a
demo stopgap and should be labelled as such in the UI, because a real handbook
will exceed 740 KB.

**Everything in §5–§9 is written for B, with the deltas for A and C noted
inline.** Confirm the option before implementation starts; the Firestore model in
§3, the permission wiring in §7, and the test plan in §8 are identical across all
three.

---

## 5. Authorization model

Two layers, and only one of them is trusted.

```
┌─ Presentation (src/, untrusted) ──────────────────────────────┐
│  resolveAppRole(profile) === 'HR Manager'                     │
│    → render the "Upload new version" control                  │
│  getCurrentEmployeeRecord(profile)                            │
│    → uploadedByName / uploadedByEmployeeId, display only      │
│  Purpose: affordance + attribution. Never a security boundary.│
└───────────────────────────────────────────────────────────────┘
┌─ Enforcement (firestore.rules / callable, trusted) ───────────┐
│  isOrgAdmin() → users/{uid}.role in ('hr', 'admin')           │
│  Purpose: the actual gate. Assume the client is hostile.      │
└───────────────────────────────────────────────────────────────┘
```

A user who forges `role: 'hr'` in localStorage gets a non-functional upload
button and a `permission-denied` on submit. That is the intended outcome and
must be covered by a rules test (§8, W4).

### Matrix

| Actor | Read current | Read history | Upload / publish |
|---|---|---|---|
| Unauthenticated | ✗ | ✗ | ✗ |
| Employee | ✓ | ✓ | ✗ |
| Manager | ✓ | ✓ | ✗ |
| **HR (`hr`)** | ✓ | ✓ | **✓** |
| **Admin (`admin`)** | ✓ | ✓ | **✓** |
| Super admin | ✓ | ✓ | ✗ (no org context) |

**Admin write — resolved.** The brief said HR *only*. That was raised as a
deviation, because every other write rule in `firestore.rules` uses
`isOrgAdmin() = isAdmin() || isHR()`, and an HR-only write would make this the
first collection a platform admin cannot write. The practical consequence:
organisations created before the HR-role change still hold a platform `admin`
account rather than an `hr` one (`CLAUDE.md`, *Organizations → Review admin
roles*), so those orgs would have had **nobody** able to upload a handbook until
their admin was converted.

**Decision: `isOrgAdmin()`.** HR and platform admins can both publish. This
removes the legacy-org gap entirely — no migration is required before the module
is enabled. HR remains the role that owns the handbook in practice; admins are
included so no organisation can end up with an unpublishable handbook.

Super admins hold `role: 'admin'` and so satisfy `isOrgAdmin()`, but they carry
no `orgId`, so `handbookOrgKey()` resolves them to `default` and they cannot
write another org's pointer. Without that the widening would have handed every
organisation's handbook to the super admin; it is asserted in the rules tests.

Read history is granted to everyone alongside read-current. Restricting history
while publishing the current file to all would protect nothing: prior versions
were themselves universally readable when current.

---

## 6. Rules

### Firestore (`firestore.rules`) — add before the catch-all deny

```
    // -------------------------------------------------------------------
    // Employee handbook. Read: any signed-in user — the handbook is
    // org-wide policy, deliberately not narrowed by dataScope visibility.
    // Write: organisation administrators, HR and Admin (see §5). Versions are append-only; superseding is a new version
    // plus a pointer update, never an edit.
    // -------------------------------------------------------------------
    function handbookOrgKey() {
      return myOrgId() == null ? 'default' : myOrgId();
    }

    match /handbook_versions/{versionId} {
      allow read: if isSignedIn();
      allow create: if isOrgAdmin() &&
        // Attribution cannot be forged: the uploader is the caller.
        request.resource.data.uploadedByUid == request.auth.uid &&
        // The client never names its own org.
        request.resource.data.get('orgId', null) == myOrgId() &&
        request.resource.data.id == versionId &&
        request.resource.data.contentType == 'application/pdf' &&
        request.resource.data.sizeBytes is int &&
        request.resource.data.sizeBytes > 0 &&
        request.resource.data.sizeBytes <= 20 * 1024 * 1024 &&
        request.resource.data.fileName is string &&
        request.resource.data.fileName.size() <= 200 &&
        request.resource.data.get('notes', '').size() <= 500;
      // Append-only: an audit trail that can be rewritten is not one.
      allow update, delete: if false;
    }

    match /handbook/{orgKey} {
      allow read: if isSignedIn();
      allow create, update: if isOrgAdmin() &&
        orgKey == handbookOrgKey() &&
        request.resource.data.updatedByUid == request.auth.uid &&
        request.resource.data.currentVersionId is string &&
        // The pointer may only name a version that exists in my org.
        exists(/databases/$(database)/documents/handbook_versions/$(request.resource.data.currentVersionId)) &&
        get(/databases/$(database)/documents/handbook_versions/$(request.resource.data.currentVersionId))
          .data.get('orgId', null) == myOrgId();
      allow delete: if false;
    }
```

The `exists`/`get` pair on the pointer is what stops HR in org A from pointing
their handbook at org B's version document. It costs two document reads per
pointer write — negligible at this write volume.

*Option C delta:* add `request.resource.data.contentBase64.size() <= 900000` to
the version `create` rule and drop `storagePath`.

### Storage (`storage.rules` — new file, Options A/B only)

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Handbook objects: readable by any signed-in user, never client-writable.
    // Storage rules cannot read Firestore, so the role check for uploads lives
    // in the callable Function that writes with the Admin SDK (spec §4, B).
    match /orgs/{orgId}/handbook/{versionId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

*Option A delta:* `allow write: if request.auth.token.hr == true && request.resource.size <= 20 * 1024 * 1024 && request.resource.contentType == 'application/pdf';`

Read is `request.auth != null` rather than org-scoped because Storage rules
cannot resolve the caller's `orgId` without Firestore. Object names are uuids, so
this is unguessable-by-default rather than enforced isolation — acceptable for a
handbook (a document every employee may read), **not** acceptable if this module
is later generalised to per-employee documents. Note it at that point.

`firebase.json` gains:

```json
"storage": { "rules": "storage.rules" }
```

---

## 7. Application wiring

New module `Documents` (`src/pages/documents/`), one route `/documents`.

Because the sidebar and the route guard are independent, **both** must be updated
or they disagree (`CLAUDE.md`, *Routing & access control*):

1. `src/lib/accessControl.ts` — add `'Documents'` to `APP_MODULES` and a row to
   `defaultPermissions`:
   `{ Admin: 'view', 'HR Manager': 'full', Manager: 'view', Employee: 'view' }`.
   `full` = upload; `view` = read. No `none` anywhere: universal read is the
   requirement. Add a floor in `enforceRequiredPermissions` pinning
   `Documents.Employee` to at least `'view'`, the same way `Employee Directory`
   is pinned — otherwise an admin can toggle the cell in Settings and silently
   break the universal-access guarantee.
2. `src/lib/nav.ts` — add the nav item, no `adminOnly` / `managerOnly` flag.
3. `src/App.tsx` — lazy route under `RequireAuth` only. There is no
   `RequireHR` guard and none is needed: the page is legitimately universal, and
   upload is gated inside it.
4. `src/types/index.ts` — `HandbookVersion` and `HandbookPointer`.
5. `src/lib/db.ts` + `src/lib/useFirestore.ts` — typed refs and a
   `useHandbook()` real-time hook. This module is Firestore-native, so it does
   **not** use `persistentCollection`; that store is for the localStorage mock
   layer.

### Page behaviour

```
Employee Handbook                                    v4 · 12 Jun 2026
─────────────────────────────────────────────────────────────────────
[ PDF viewer / Download handbook.pdf  (1.4 MB) ]

Version history
  v4  12 Jun 2026  Priya Raman   "Updated leave policy"   [Download]
  v3  04 Jan 2026  Priya Raman                            [Download]
  …

┌─ Upload new version ───────────── (HR + Admin) ─┐
│  [Choose PDF]  Notes: [_______________]         │
│  [Publish as v5]                                │
└─────────────────────────────────────────────────┘
```

- No handbook yet: empty state. For HR, the upload panel; for everyone else,
  "No handbook has been published yet."
- Upload is a two-phase operation — object first, then metadata, then pointer —
  and the phases can fail independently (§9).
- The upload panel renders only when `resolveAppRole(profile) === 'HR Manager'`,
  **and** the submit handler re-checks before firing, the same belt-and-braces
  pattern as the check-in handlers at
  [my-attendance/index.tsx:170](../src/pages/my-attendance/index.tsx#L170).
- Client-side validation (type, 20 MB ceiling) is UX, not enforcement; the same
  limits appear in the rules above.
- `notes` is rendered as text, never HTML.

---

## 8. Test plan

### Rules tests — `tests/rules/handbook.spec.ts` (`npm run test:rules`)

The E2E suite never exercises rules, so these are the only proof of the
authorization model.

| | Case | Expect |
|---|---|---|
| R1 | Employee reads `handbook/default` | allow |
| R2 | Manager reads a version doc | allow |
| R3 | Employee whose `dataScope` visibility set is empty reads the pointer | allow — *guards §1.3* |
| R4 | Unauthenticated read | deny |
| W1 | HR creates a version in their own org | allow |
| W2 | HR creates a version with `uploadedByUid` set to another uid | deny |
| W3 | HR of org A points org A's handbook at an org B version | deny |
| W4 | Employee creates a version doc | deny — *the forged-localStorage case* |
| W5 | Manager creates a version doc | deny |
| W6 | Admin creates a version doc | allow — *§5: admins publish too, so legacy orgs are never stranded* |
| W7 | HR updates an existing version doc | deny (append-only) |
| W8 | HR deletes a version doc | deny |
| W9 | Version doc over the size ceiling / wrong content type | deny |
| W10 | HR writes a pointer naming a nonexistent version | deny |

Each test reseeds — the suites mutate roles and shared state produces false
passes.

### E2E — `tests/e2e/documents.spec.ts`

Runs under the existing `role-employee` / `role-manager` / `role-admin`
projects, plus HR coverage.

- Employee opens `/documents`, sees the current handbook, sees **no** upload
  control.
- Manager: same.
- HR uploads a PDF fixture, **reloads the page**, and asserts the new version is
  current and appears in history. The reload is the point — the other specs never
  reload, so in-memory state passes them exactly as persisted state would
  (`CLAUDE.md`, *Mutable collections must persist*).
- HR publishes v2, then reverts the pointer to v1; v2 remains in history.

Nav coverage: `/documents` appears in the sidebar for all four personas.

`npm run build` is the type-check gate; ESLint is not configured.

---

## 9. Failure modes and deploy

### Partial upload

The three phases (object → version doc → pointer) are not atomic.

- **Object written, version doc fails** → orphan object, no user-visible effect.
  Acceptable; sweep with a scheduled job if it ever matters.
- **Version doc written, pointer fails** → version exists in history but is not
  current. The UI shows it as "unpublished" with a **Publish** action, so HR
  recovers without re-uploading.
- Never delete on failure. The pointer is the only thing that makes a version
  live, so a stranded object or doc is inert.

Under Option B all three happen inside the callable and the failure surface
shrinks to one round trip — a further argument for B.

### Deploy order

App code and rules deploy independently, and **rules must go first**:

```
firebase deploy --only firestore:rules,storage    # first
npm run firebase:deploy                           # then hosting
```

Ship the UI first and HR gets `permission-denied` against rules that do not yet
grant the write. Pushes to `main` auto-deploy hosting but **not** rules, so the
rules deploy is a manual step that must precede the merge.

Option A additionally requires the custom-claim Function deployed and every HR
account's token refreshed before upload works. Options A and B both move the
project to the Blaze plan.

---

## 10. Decisions needed

1. **§4 — storage option A, B, or C.** Shipped as **C** behind an adapter, since
   A and B both need Cloud Functions and the Blaze plan, which is a billing
   decision. Recommendation stands: move to **B**.
2. **§5 — admin write.** ~~Open.~~ **Resolved: `isOrgAdmin()`** — HR and platform
   admins both publish, so no legacy-org migration is required first.
3. **§3 — retention.** History is unbounded and append-only. Confirm that is
   wanted; a policy document arguably should never lose a version.

---

## 11. What was built

| Concern | File |
|---|---|
| Types | `src/types/index.ts` — `HandbookVersion`, `HandbookPointer` |
| Binary transport (the seam) | `src/lib/handbookStorage.ts` |
| Reads + publish | `src/lib/handbook.ts` |
| Collection refs | `src/lib/db.ts` |
| Page | `src/pages/documents/index.tsx` |
| Permissions / nav / route | `src/lib/accessControl.ts`, `src/lib/nav.ts`, `src/App.tsx` |
| Enforcement | `firestore.rules` — `handbook_versions`, `handbook` |
| Rules tests | `tests/rules/handbook.rules.test.mjs` (21 tests) |
| E2E | `tests/e2e/documents.spec.ts` (4 tests × 3 personas) |

### Deviations from the spec above

- **`contentBase64` replaces `storagePath` + `checksum`** on `HandbookVersion`.
  Those two fields belong to the Cloud Storage variant; with the bytes inside
  the document, Firestore guarantees the integrity a checksum was there to
  catch. Restoring them is part of the A/B migration.
- **Size ceiling is 720 KB**, not 20 MB — derived from Firestore's 1 MiB
  document limit and base64's 4/3 inflation. The 20 MB figure in §6 applies
  once the bytes move to Cloud Storage.
- **The whole `Documents` row is pinned, not just the read floor.** Publish is
  `isOrgAdmin()` in the rules, so a Settings toggle granting a Manager 'full'
  could only ever render an upload panel the server then refuses. The row is
  fixed in `PINNED_PERMISSIONS` and `canPublishHandbook()` reads the matrix, so
  the client and the rules have one definition of who publishes rather than two
  that can drift.

### A third problem, found when pinning the matrix

**Pinned permission cells silently reverted.** `Employee Directory`/Employee and
`Admin`/Admin were enforced on read but left clickable in Settings → Roles &
Permissions: the cell cycled, looked saved, and came back unchanged on the next
read — exactly the failure the code comment there warns about for *excluded*
pairs. Pinning is now a first-class concept (`PINNED_PERMISSIONS` +
`pinnedPermission()`), and the UI locks pinned cells showing their fixed value,
distinct from excluded cells which show "n/a". This fixes the two pre-existing
cells as well as the new `Documents` row.

### Two problems found while building, both fixed

- **`npm run test:rules` was silently order-dependent.** Adding a second file
  under `tests/rules/` exposed it: `node --test` runs files concurrently, every
  suite reseeds with `clearFirestore()`, and that wipes the whole emulator — so
  the two files deleted each other's fixtures. The first green run was luck.
  The script now passes `--test-concurrency=1`. **This affected the existing
  suite too**, not just the new file.
- **A denied read left the page loading forever.** The versions listener had no
  error callback, so `loading` never cleared and users saw a permanent
  "Loading the handbook…" beneath the error. This is a reachable state, not a
  hypothetical: rules deploy separately from the app, so between the two
  deploys every user hits exactly it.

### Verification performed

- `npm run build` (the type-check gate) — clean.
- `npm run test:rules` — 71/71, stable across three consecutive runs.
- **Rules tests proved to discriminate:** weakening the version create rule to
  `isSignedIn()` fails exactly the tests asserting that an employee and a manager
  cannot publish, and nothing else.
- `documents.spec.ts` — 12/12 across all three personas, against live Firebase
  Auth. **Proved to discriminate:** adding `adminOnly: true` to the nav item
  fails the employee and manager runs.
- **Rules deployed to production and re-verified in the browser:** `/documents`
  as an employee against live Firestore renders the empty state with no console
  errors, where before the deploy it showed "Could not load the handbook".
- **End-to-end against the real rules in the emulator:** signed in with
  `users/{uid}.role = 'hr'`, published a PDF, confirmed the version document and
  pointer were written, the PDF rendered, and history showed v1 as current.
  Then flipped the same account to `role: 'employee'` server-side and reloaded —
  the handbook still read, the upload panel was gone.

### Not verified, and why

A successful publish is not covered by the E2E suite. There is no `hr` persona,
and adding one would not work: `firestore.rules` deliberately does not trust the
E2E email allow-list, so an E2E account cannot self-assign `role: 'hr'` without
a real `role_assignments` document. The write path is therefore proved in the
rules tests and in the emulator run above, not in CI. `tests/e2e/documents.spec.ts`
says the same thing in its header.

### Deploy status

`firebase deploy --only firestore:rules` **has been run** against `modcon-hr` —
the handbook rules are live, verified by loading `/documents` against production
Firestore as an employee and getting the empty state rather than the permission
error. The app can now merge in any order.

Future rules changes keep the same hazard: pushing to `main` auto-deploys hosting
but never rules, so a change touching both must deploy rules first.
