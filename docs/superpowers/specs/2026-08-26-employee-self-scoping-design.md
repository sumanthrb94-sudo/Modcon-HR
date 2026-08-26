# Employee self-scoping

**Date:** 2026-08-26
**Status:** approved, implementing

An account whose role is `employee` must see only its own employee record.
Other employees are removed from view. Admins are unaffected.

## Problem

Nothing links an authenticated account to an employee record. `UserProfile`
carries `uid`, `email`, `displayName`, `role` — there is no `employeeId`, so
the app cannot answer "which employee is this?". Eighteen files import the full
directory from `@/data/employees` and render it unconditionally. `isAdmin` is
consulted in exactly two places: sidebar nav filtering and the `/admin` route
guard.

## Decisions

| Question | Decision |
|---|---|
| Account → employee link | Match on work email at sign-in; an admin can set or correct it |
| Scope | Directory + leave, attendance, payroll, expenses, assets, helpdesk, performance |
| Unlinked account | Blocked with an explanation; no data |

## Design

### 1. The link

`UserProfile` gains `employeeId: string | null`.

`upsertUserProfile` resolves it on every sign-in:

1. If the stored profile already has an `employeeId`, keep it. An admin's
   correction must survive the next login — the same precedence the existing
   `role` field already has.
2. Otherwise look the account email up in the directory. Employee emails are
   generated as `first.last@modcon.com`, so this matches anyone who signed up
   with their work address.
3. Otherwise `null` — unlinked.

`src/data/employees.ts` gains `employeeIdByEmail(email): string | null`, backed
by a `Map` built alongside the existing `byId` / `idByCode` maps. Lookup is
lower-cased on both sides.

Admins are deliberately allowed to be unlinked. The two fixed admin accounts are
gmail addresses with no directory record, and an admin does not need one — they
are never scoped.

### 2. The scoping layer

`src/lib/scope.ts`, consumed by pages instead of the raw import:

- `useVisibleEmployees(): Employee[]` — the whole directory for a viewer who
  may see everyone, `[self]` for an employee, `[]` for unlinked.
- `useOwnRecords<T>(rows, key?): T[]` — filters any list of records carrying an
  employee id down to the viewer's own. Defaults to `employeeId`; `key` covers
  `raisedById` and `assignedToId`.
- `useViewerScope()` — the raw `{ employee, canSeeEveryone, isLinked }` for the
  few places that need to branch rather than filter.

Enforcement lives in one module. A page that still says
`import { employees } from '@/data/employees'` is then the thing to grep for,
which is the guardrail — the wrong pattern becomes conspicuous rather than
invisible.

### 3. Blocking unlinked accounts

`RequireAuth` gains a check: signed in, role `employee`, no `employeeId` →
render an explanation ("your account isn't linked to an employee record yet")
instead of the app. Fails closed. Admins bypass it.

### 4. Per-module behaviour

| Module | Employee sees |
|---|---|
| Employees list / grid / org chart | Only their own card |
| Employee detail `/employees/:id` | Their own; another id is "not found" |
| Topbar search | Nav destinations + themselves |
| Leave, attendance, payroll, expenses, assets, helpdesk, performance | Only their own records |
| Approval queues, `/admin` | Admin only (unchanged) |
| Dashboard KPIs and charts | Company-wide aggregates, unchanged |
| Dashboard New Joiners / Celebrations / activity feed | Hidden — these enumerate other people by name |

The dashboard split is an interpretation: "all personal modules" left the
dashboard out of scope, but three of its panels list other employees by name,
which is precisely what the feature removes. Aggregate counts stay; name lists
go.

### 5. Firestore rules

Client-side filtering is presentation, not enforcement. Every page reads static
fixtures today, so the filtering genuinely removes other employees from view —
but the moment any of this reads live Firestore, an employee could query the
collection directly.

The `employeeId` link makes owner-scoped rules expressible for the first time.
Previously the ownership clauses compared a directory id (`emp-007`) against
`request.auth.uid` and could never match. Now:

```
function myEmployeeId() {
  return myProfile().get('employeeId', '');
}
```

Reads on the personal collections become self-or-admin. `employees` keeps a
signed-in read: the directory backs manager names, the org chart and assignment
pickers, and narrowing it needs its own design.

`employeeId` is added to the fields a user may not self-assign, alongside
`role`. A user who could set their own `employeeId` could read any colleague's
payslips.

## Out of scope

- Narrowing the `employees` collection read in rules.
- Manager-scoped visibility (a manager seeing their reports). Roles today are
  `admin` and `employee` only.
- Reports page. Company-wide aggregates, no individual names.

## Verification

- `npm run check:data`, `tsc -b`, `vite build`, `npm run lint` stay green.
- Unit tests for `employeeIdByEmail` and the scoping helpers, covering: admin
  sees all, employee sees one, unlinked sees none, and a record list filtered by
  each of the three id fields.
- Manual: sign in as an employee, confirm the directory shows one card, another
  employee's detail URL is not reachable, and search returns no colleagues.
