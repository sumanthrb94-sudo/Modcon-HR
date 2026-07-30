# Salary & Leave — Firestore structure and access control

Technical specification for employee-scoped salary and leave data in Firestore:
collection structure, the `firestore.rules` that enforce role-based access, and
the identity mapping the rules need before "only their own data" can mean
anything.

Status: **partially implemented** on `fix/salary-leave-read-scope`.

Implemented: the read exposure (§1.1), the identity mapping (§3), the manager
subtree (§4), the get/list split (§6), `isOrgAdmin()` writes (§2.2). Deferred:
the leave write redesign (§2.1), `orgId` backfill and payslip re-keying (§5),
and the three sibling collections carrying the same dead check (§1.2). See §10.

---

## 1. What is actually there today

Verified against the repo, because the brief describes a change to collections
that already exist rather than a greenfield design.

| Collection | Doc id | Read | Write |
|---|---|---|---|
| `employee_compensation` | `emp-001` | `isOrgAdmin()` | `isOrgAdmin()` |
| `payslips` | auto | **`isSignedIn()`** | `isOrgAdmin()` |
| `leave_requests` | auto | **`isSignedIn()`** | create: `isSignedIn()`; update: self *or* `isManager()`; delete: `isOrgAdmin()` |
| `leave_balances` | `emp-001_Casual` | **`isSignedIn()`** | `isOrgAdmin()` |

Three facts that shape everything below.

### 1.1 Payslips, leave requests and leave balances are readable by everyone

`allow read: if isSignedIn()` on `payslips` means **any signed-in employee can
read every colleague's payslip** — gross pay, deductions, net pay. The same
applies to every leave request and leave balance in the company.

This is the real exposure the brief is reaching for, and it is larger than the
brief states. `employee_compensation` was deliberately split out of `employees`
so the broadly-readable directory would not carry salary
([seed.ts:10](../src/lib/seed.ts#L10)) — but `payslips` carries the same
information per month and was left open.

### 1.2 The "own record" checks in the rules are dead code

`leave_requests` already contains:

```
allow update: if isSignedIn() && (resource.data.employeeId == request.auth.uid || isManager());
```

`resource.data.employeeId` is `emp-009`
([data/leave.ts:13](../src/data/leave.ts#L13)). `request.auth.uid` is a Firebase
uid like `leK1BpMDAyT0FeWX0LF36fln8lM2`. **These can never be equal**, so the
self-branch never matches and only `isManager()` has ever worked.

The same dead comparison appears at four places in `firestore.rules` —
`leave_requests:246`, `expenses:294`, `helpdesk_tickets:317` (`raisedById`,
seeded as `emp-009`) and `regularizations:324`. Every one of them is written to
grant a self-service permission that has never actually been granted. Fixing
salary and leave with `employee_links` (§3) gives the other two a working
mechanism too; they are out of scope here but should follow.

So "employees can access only their own data" is not a tightening of an existing
mechanism — the mechanism does not exist yet. §3 is about building it.

### 1.3 Almost nothing reads these collections yet

`src/pages/leave` and `src/pages/payroll` read the localStorage mock layer
(`@/data/leave`, `@/data/payroll`), not Firestore. Only the Admin dashboard uses
a Firestore hook (`useEmployees`). The seeded `leave_*`, `payslips` and
`employee_compensation` documents are essentially write-only today.

That is good news twice over: tightening these rules breaks no current screen,
and the model can be got right *before* the app migrates onto it. It also means
this spec is a precondition for that migration, not a refactor of it.

---

## 2. Two corrections to the brief

### 2.1 HR-only writes would remove leave self-service

The brief asks that writes to **both** salary and leave be "exclusively
permitted for users possessing the HR role". For salary that is correct and
already close to what exists. For leave it would delete a feature: employees
apply for their own leave today ("Apply Leave",
[leave/index.tsx:354](../src/pages/leave/index.tsx#L354)), and the rules permit
`create: if isSignedIn()` precisely so they can.

Making leave HR-write-only turns leave into a system where HR keys in requests
on employees' behalf. That is a product decision, not an access-control
tightening, and it is almost certainly not the intent.

**Correction.** Split the two, because they are different objects:

- `leave_requests` — an employee **authors their own** (create, and update while
  still `Pending`). Only a manager/HR/admin may change `status`, which is what
  approval means.
- `leave_balances` — the entitlement ledger. **HR/admin write only.** An
  employee must never be able to grant themselves leave days.

Salary (`employee_compensation`, `payslips`) is administrator-write-only
throughout, as asked.

### 2.2 `isHR()` versus `isOrgAdmin()` — this was already decided

The brief specifies `isHR()`. The handbook module raised exactly this question
and it was resolved in favour of `isOrgAdmin()`
([document-management-spec.md §5](document-management-spec.md)): organisations
created before the `hr` role existed hold a platform `admin` account, so an
`isHR()`-only write leaves those orgs with nobody able to administer the data.

Using `isHR()` here would re-create that gap for payroll — a worse place to have
it than the handbook — and would make salary the only collection in the file
whose write rule disagrees with every other. `employee_compensation` already
uses `isOrgAdmin()`.

**Recommendation: `isOrgAdmin()`**, consistent with the decision already taken.
If HR-only is genuinely wanted, it is a one-token change in each rule below, and
the *Organizations → Review admin roles* migration becomes a prerequisite.

---

## 3. The identity mapping — the part that must be built first

Rules see `request.auth.uid`. Records are keyed by `employeeId` (`emp-001`).
Nothing on the server connects them.

`Employee.authUid` exists in the type ([types/index.ts:26](../src/types/index.ts#L26))
and `dataScope.getCurrentEmployeeRecord` uses it, but it is written to the
**localStorage** directory only — `src/lib/seed.ts` seeds `employees` from the
static array, which carries no `authUid`. Client-written and client-controlled,
it could not be trusted by the rules even if it were there.

### `employee_links/{uid}` — administrator-authored, server-consulted

Mirrors the `role_assignments` pattern already in `firestore.rules`: a document
an administrator writes, which the rules `get()` to answer a question the client
must not be trusted to answer about itself.

```ts
interface EmployeeLink {
  uid: string;        // Firebase Auth uid — also the document id
  employeeId: string; // -> employees/{id}
  orgId: string | null;
}
```

- Written **only** by `isOrgAdmin()`, and only within their own org.
- Read by the owning user and by administrators.
- One link per uid. The reverse (one employee, many uids) is not modelled.

Rule helper:

```
function myEmployeeId() {
  return exists(/databases/$(database)/documents/employee_links/$(request.auth.uid))
    ? get(/databases/$(database)/documents/employee_links/$(request.auth.uid)).data.employeeId
    : null;
}
function isSelf(employeeId) {
  return employeeId != null && employeeId == myEmployeeId();
}
```

**Cost.** One extra document read per rule evaluation that consults it, billed
and latency-bearing. Acceptable for payslips and leave, which are low-volume
per-user reads. It is the price of not keying records by uid.

**Alternative considered — re-key records by uid.** Rejected: employee records
exist before the person has an account (onboarding creates the record, the
account comes later), so `employeeId` cannot be the uid at creation time.

---

## 4. Manager visibility — a limit worth stating plainly

`src/lib/dataScope.ts` defines who sees whom: a manager sees their whole
reporting subtree, HR sees everyone, an employee sees only themselves. **None of
that is available to `firestore.rules`.** It walks `reportingManagerId` through
the localStorage employee directory, which the server cannot read and could not
trust.

So the rules can express three tiers, not four:

| Tier | Expressible server-side |
|---|---|
| Own record | ✓ via `isSelf()` |
| Whole org | ✓ via `isOrgAdmin()` |
| Any manager | ✓ via `isManager()` |
| **This manager's subtree only** | ✗ |

The rules below grant `isManager()` read across the org for leave (needed for
approvals) and **not** for salary. A manager therefore sees leave requests
outside their own reports — narrower than today's "everyone sees everything",
wider than `dataScope`.

Closing that gap needs the reporting chain denormalised onto each record (e.g.
`managerChainUids: string[]`, maintained on write) so a rule can test
`request.auth.uid in resource.data.managerChainUids`. That is a real piece of
work with its own consistency problems when someone changes manager, and it is
**out of scope here** — listed so the residual gap is a decision rather than an
oversight.

---

## 5. Collection structure

Unchanged shapes, plus `orgId` on each record. None of these collections carries
`orgId` today, so an org's salary data is readable by another org's HR — the
handbook added `orgId` for exactly this reason and these should follow.

```ts
interface EmployeeCompensation {          // employee_compensation/{employeeId}
  id: string; employeeId: string; orgId: string | null;
  ctc: number;
}

interface Payslip {                       // payslips/{employeeId}_{YYYY-MM}
  id: string; employeeId: string; orgId: string | null;
  month: string;                          // "2026-05"
  basic; hra; specialAllowance; bonus;    // earnings
  pf; tax; otherDeductions;               // deductions
  grossEarnings; totalDeductions; netPay: number;
  status: PayrollRunStatus;
}

interface LeaveRequest {                  // leave_requests/{auto}
  id: string; employeeId: string; orgId: string | null;
  type: LeaveType; startDate; endDate: string; days: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  appliedOn: string; approverId: string | null;
}

interface LeaveBalance {                  // leave_balances/{employeeId}_{type}
  id: string; employeeId: string; orgId: string | null;
  type: LeaveType; total; used; available: number;
}
```

Deterministic ids on `payslips` (`{employeeId}_{month}`) rather than auto-ids, so
a re-run of payroll overwrites rather than duplicating — the current auto-id
seeding will double up on a second seed.

---

## 6. Rules

Helpers `isSignedIn` / `isOrgAdmin` / `isManager` / `myOrgId` are the existing
ones. `myEmployeeId` / `isSelf` are from §3.

```
    // -------------------------------------------------------------------
    // Identity mapping: which employee record a signed-in account is.
    // Administrator-authored, exactly like /role_assignments — the client is
    // never trusted to say which employee it is, because that would let anyone
    // read anyone's salary by claiming their employeeId.
    // -------------------------------------------------------------------
    match /employee_links/{uid} {
      allow read: if isOrgAdmin() || (isSignedIn() && uid == request.auth.uid);
      allow create, update: if isOrgAdmin() &&
        request.resource.data.uid == uid &&
        request.resource.data.employeeId is string &&
        (isAdmin() || request.resource.data.get('orgId', null) == myOrgId());
      allow delete: if isOrgAdmin() &&
        (isAdmin() || resource.data.get('orgId', null) == myOrgId());
    }

    // -------------------------------------------------------------------
    // Salary. Read: the employee it belongs to, and administrators. NOT
    // managers — a manager having staff does not entitle them to those
    // people's pay, and dataScope's subtree rule is not expressible here
    // anyway (see spec §4). Write: administrators only.
    // -------------------------------------------------------------------
    match /employee_compensation/{employeeId} {
      allow read: if isOrgAdmin() || isSelf(employeeId);
      allow write: if isOrgAdmin() &&
        request.resource.data.get('orgId', null) == myOrgId();
    }

    match /payslips/{docId} {
      // Replaces `allow read: if isSignedIn()`, which let every employee read
      // every colleague's payslip.
      allow read: if isOrgAdmin() || isSelf(resource.data.employeeId);
      allow write: if isOrgAdmin() &&
        request.resource.data.get('orgId', null) == myOrgId();
    }

    // -------------------------------------------------------------------
    // Leave requests. An employee authors their own and may edit it while it
    // is still Pending; only a manager/administrator may decide it. Managers
    // read org-wide because approval queues need it (§4).
    // -------------------------------------------------------------------
    match /leave_requests/{docId} {
      allow read: if isOrgAdmin() || isManager() || isSelf(resource.data.employeeId);

      allow create: if isSignedIn() &&
        // You may only file leave as yourself.
        isSelf(request.resource.data.employeeId) &&
        request.resource.data.get('orgId', null) == myOrgId() &&
        // A request starts Pending. Self-approval is the whole risk here.
        request.resource.data.status == 'Pending' &&
        request.resource.data.get('approverId', null) == null &&
        request.resource.data.days is number &&
        request.resource.data.days > 0;

      allow update: if
        // The decision path: managers and administrators.
        (isManager() || isOrgAdmin()) ||
        // The author's own edit, only while undecided, and never touching the
        // status — otherwise this branch would be self-approval.
        (isSelf(resource.data.employeeId) &&
          resource.data.status == 'Pending' &&
          request.resource.data.status == 'Pending' &&
          request.resource.data.employeeId == resource.data.employeeId);

      allow delete: if isOrgAdmin();
    }

    // -------------------------------------------------------------------
    // Leave balances — the entitlement ledger. Read your own; administrators
    // write. An employee must never be able to grant themselves days.
    // -------------------------------------------------------------------
    match /leave_balances/{docId} {
      allow read: if isOrgAdmin() || isManager() || isSelf(resource.data.employeeId);
      allow write: if isOrgAdmin() &&
        request.resource.data.get('orgId', null) == myOrgId();
    }
```

**On `isSelf(resource.data.employeeId)` in a read rule.** Firestore evaluates a
`list` against the *query*, not the returned documents: it will only allow a
listing it can prove is safe in advance, and it cannot prove that about a rule
whose condition depends on `resource.data`. So an employee's
`where('employeeId','==','emp-009')` query is denied even though every document
it would return is one they may read.

The fix is to split `get` from `list` rather than leave it to be discovered
during UI work:

```
allow get: if isOrgAdmin() || isSelf(resource.data.employeeId);
allow list: if isOrgAdmin() || isManager() ||
  // A listing an employee can prove is their own, before it runs.
  (myEmployeeId() != null && request.query.limit <= 200 &&
   resource.data.employeeId == myEmployeeId());
```

`allow read` in §6 is shorthand for both; substitute the pair above on
`payslips`, `leave_requests` and `leave_balances`, which are the three an
employee lists. `employee_compensation` is fetched by id (`emp-001`) and needs
`get` only. This is also why §5 specifies deterministic payslip ids.

---

## 7. Test plan — `tests/rules/salary-leave.rules.test.mjs`

The E2E suite never exercises rules, so these are the only proof.

| | Case | Expect |
|---|---|---|
| S1 | Employee reads own `employee_compensation` (link present) | allow |
| S2 | Employee reads a colleague's compensation | deny |
| S3 | Employee with **no** link document reads any compensation | deny |
| S4 | Manager reads a report's compensation | deny — *§6, deliberate* |
| S5 | HR/admin reads any compensation in own org | allow |
| S6 | HR of org A reads org B's compensation | deny |
| S7 | Employee reads own payslip / a colleague's payslip | allow / deny |
| S8 | Employee writes own compensation | deny |
| S9 | Employee `get`s own payslip by id, then `list`s their own payslips | allow both — *§6 get/list split* |
| S10 | Employee lists payslips **unfiltered** | deny |
| L1 | Employee creates a leave request as themselves, `Pending` | allow |
| L2 | Employee creates a request naming another employeeId | deny |
| L3 | Employee creates a request already `Approved` | deny — *self-approval* |
| L4 | Employee edits own `Pending` request (reason/dates) | allow |
| L5 | Employee sets own request to `Approved` | deny — *self-approval* |
| L6 | Employee edits own request once `Approved` | deny |
| L7 | Manager approves someone's request | allow |
| L8 | Employee reads own / a colleague's request | allow / deny |
| L9 | Employee writes any `leave_balances` doc | deny |
| L10 | Employee reads own balance | allow |
| K1 | Employee writes their own `employee_links` doc | deny — *the escalation* |
| K2 | HR writes a link within own org / into another org | allow / deny |

K1 is the one that matters most: if a user can author their own link they can
point it at the CEO's `employeeId` and read that salary. Every read rule here
rests on that document being administrator-authored.

Run with `npm run test:rules` (serialised — see the note in
`tests/rules/handbook.rules.test.mjs`).

---

## 8. Rollout

Ordering matters, because tightening reads before the links exist locks
employees out of their own data — and because rules deploy separately from the
app.

1. **Backfill `employee_links`.** Nothing populates it. Until a uid has a link,
   `isSelf()` is false and that user reads nothing of their own. Existing
   accounts must be linked before the read rules tighten. Source: the
   localStorage `authUid` values where present, otherwise email-matched against
   `employees` and confirmed by an administrator.
2. **Add `orgId` to existing salary/leave documents.** They have none today, so
   every write rule above would reject an update to them until backfilled.
3. **Deploy rules**, then the app — never the reverse.
4. **Migrate payslip ids** to `{employeeId}_{month}` if the re-seed duplication
   in §5 is to be fixed; this rewrites documents and should precede step 1.

Steps 1 and 2 are data migrations against production Firestore with no UI
behind them yet, so they want a one-off script and a dry-run mode.

---

## 9. Decisions needed

1. **`isOrgAdmin()` vs `isHR()` for writes.** Recommendation: `isOrgAdmin()`,
   matching the handbook decision. §2.2.
2. **Leave self-service.** Confirm employees keep authoring their own requests
   (recommended) rather than leave becoming HR-entry-only. §2.1.
3. **Manager scope.** Accept org-wide manager reads on leave, or fund the
   `managerChainUids` denormalisation to match `dataScope`. §4.
4. **Payslip listing.** Confirm clients can fetch by deterministic id, or a
   per-employee index document is needed. §6.


---

## 10. Implementation status

Scoped deliberately to the read exposure and the two limits. Everything else in
this document remains specification.

### Done

| | Where |
|---|---|
| `employee_links/{uid}` collection + rules — administrator-authored uid → employeeId | `firestore.rules`, `src/data/employeeLinks.ts` |
| `myEmployeeId()` / `isSelf()` / `managesSubject()` helpers | `firestore.rules` |
| Salary reads closed to own + org admin; **managers excluded** | `firestore.rules` |
| Leave reads closed to own + reporting chain + org admin | `firestore.rules` |
| `get`/`list` split on all four collections | `firestore.rules` |
| `managerChainIds` denormalised onto leave documents | `src/lib/seed.ts` |
| 36 rules tests | `tests/rules/salary-leave.rules.test.mjs` |

Writes use `isOrgAdmin()`, not `isHR()` — HR *is* the organisation
administrator, and `isOrgAdmin() = isAdmin() || isHR()` keeps an org whose
administrator predates the `hr` role from being locked out of its own payroll.

### Verified

- `npm run build` clean; **109/109** rules tests; 48 app + 33 role E2E specs green.
- **Both new guarantees proved to discriminate.** Reverting `payslips` to
  `allow read: if isSignedIn()` fails exactly the four salary-exposure tests.
  Widening `managesSubject()` back to `isManager()` fails exactly the two
  subtree tests. Nothing else moves in either case.

### Deliberately not done

- **Leave write redesign (§2.1).** The dead `employeeId == request.auth.uid`
  check still stands on `leave_requests` create/update, so leave writes behave
  exactly as before. `isSelf()` now exists to fix it properly, together with
  pinning `status` to `Pending` on create — the self-approval hole — but that is
  a behaviour change to leave, not a read exposure.
- ~~**`orgId` backfill (§5).**~~ **Now closed** — see
  [multi-tenancy-spec.md](multi-tenancy-spec.md). Every collection is org-scoped
  and the `KNOWN GAP:` test has been flipped to assert that another
  organisation's HR is refused.
- **Payslip re-keying** to `{employeeId}_{month}`; a second seed run still
  duplicates.
- **`expenses`, `helpdesk_tickets`, `regularizations`** still carry the same
  dead self-check (§1.2). They now have a working mechanism available.

### Before this can ship

`employee_links` is empty, and **nothing populates it**. Until an administrator
links an account, that user resolves to no employee and reads none of their own
salary or leave — the rules fail closed, which is the right direction, but it
means the employee-facing benefit is not live until the backfill runs. No screen
regresses in the meantime, because no screen reads these collections from
Firestore yet (§1.3).

Rules must deploy before any app code that depends on them.
