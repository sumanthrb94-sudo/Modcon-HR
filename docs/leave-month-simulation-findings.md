# A month of leave, two organisations — what needs improving

Two organisations, ten people each, one month of ordinary leave, run through the
application's own modules: `tests/simulation/leave-month.test.mjs`, **30
assertions**, `npm run test:sim`.

**The flow works end to end.** Applications are filed, the manager is notified,
decisions stick, the approver is recorded, a rejection credits nobody,
entitlements accrue and net off correctly, and the two organisations never touch
each other's records. That is the headline and it is not a small one.

**Seven things need improving.** Three would be visible to a customer in their
first month; two are correctness bugs waiting for a second reporting line or a
deleted record; two are reporting inaccuracies.

---

## What was simulated

| | |
|---|---|
| Organisations | Northwind Consulting, Sterling Works — provisioned empty, populated independently |
| People, each | 1 HR (`Head of People`), 1 manager (`Engineering Manager`), 7 reports, 1 person reporting to HR |
| Month | June 2026 — 30 days, 22 weekdays |
| Applications | 8: a long weekend, flu, a 12-day wedding block, a single day, a migraine, a declined holiday, a house move, and one left undecided |
| Decisions | 6 approved, 1 rejected, 1 pending at month end |

The tenth person matters more than they look. **An organisation where everyone
reports to the one manager cannot tell a scoped queue from an unscoped one** —
both return everything. One person outside the line is what makes the difference
measurable, and it is the ordinary shape anyway.

Each organisation's month is observed while that organisation is active and
reduced to plain data before the next loads. The active org key is global and
read at call time, so a module instance from org A queries org B's namespace the
moment B loads — which is exactly why switching organisation in the browser is
followed by a page reload.

---

## Findings

### 1. The manager is told about 7 requests and sent to a page listing 8 — including one they should not see, with an Approve button

The badge and the page disagree, because only one of them is scoped.

- The notification counts what `dataScope` says is theirs
  (`src/data/notifications.ts:61`) → **7**.
- `LeaveRequestsApprovalsPage` (`src/pages/dashboard/LeaveRequestsApprovalsPage.tsx:43-48`)
  imports no scoping at all. It filters `status === 'Pending'` and nothing
  else → **8**.

At month end the divergence is total: the only request left belongs to the
person reporting to HR, so the badge reads **0** and the page reads **1**.

And the manager can act on it. `updateLeaveRequestStatus`
(`src/data/leave.ts:259`) takes a request id and an approver and applies no
visibility check — the simulation approves an out-of-line request as the manager
and it lands, stamped with their name.

The Leave page gets this right (`src/pages/leave/index.tsx:109-113` filters by
`getVisibleEmployeeIds`). The dedicated approvals page was not given the same
treatment.

**Fix:** filter `pendingRequests` through `getVisibleEmployeeIds(profile)`, and
have `updateLeaveRequestStatus` refuse a subject outside the caller's scope so
the guarantee does not depend on every page remembering.

### 2. Leave is counted in calendar days, so weekends and public holidays are deducted

`days = Math.ceil((end - start) / 86400000) + 1` (`src/pages/leave/index.tsx:186-188`).

The 8–19 June wedding block is **ten working days**. The app records **twelve**.
Every downstream figure inherits it — the balance, the entitlement, and any
payroll deduction computed from it. `src/data/holidays.ts` exists, is org-scoped,
and is not consulted either, so a public holiday inside a block is deducted as
leave as well.

For an Indian HR product with a holidays module already in the box, this is the
finding most likely to produce a support ticket in month one.

**Fix:** count working days, excluding weekends and the organisation's own
holiday list. Consider a half-day flag while touching it.

### 3. A new organisation's leave balances never appear on two of the three surfaces that show them

`leaveBalances` is built from a seed array that is empty for every organisation
but the demo one (`isMockDataCleared()`). Two things read it:

- `balanceEmployeeIds` drives the Leave page's **Balances tab for HR and
  managers** (`src/pages/leave/index.tsx:321`) — so it lists **nobody**, for
  ever, however many people the organisation has.
- `getEmployeeBalances` backs the **dashboard's own-balance card**
  (`src/pages/dashboard/index.tsx:119`) and the **employee detail page**
  (`src/pages/employees/index.tsx:1843`) — both render empty.

The entitlement engine computes the right figures for the same people — the
simulation asserts correct accrual and usage for all of them. Nothing routes
those figures to these two surfaces. An employee viewing their own Balances tab
sees them (that branch calls `getEntitlements` directly); HR looking at the
same tab sees an empty list.

**Fix:** derive both from `getEntitlements`. `getEntitlementBalances`
(`src/data/leaveEntitlements.ts:162`) already returns exactly the `LeaveBalance`
shape those callers want and is **dead code today** — nothing imports it.

### 4. Request ids are derived from the list length, so a deletion makes them collide

`id: \`lr-${String(leaveRequests.length + 1).padStart(3, '0')}\`` (`src/pages/leave/index.tsx:187`).

Ids are unique across this month only because nothing was ever deleted. Remove
one request and the next application reuses a live id — and
`updateLeaveRequestStatus` maps over **every** match, so one decision would
change two requests. The simulation demonstrates the collision arithmetic
directly.

**Fix:** `crypto.randomUUID()`, or a monotonic counter persisted with the
collection. Not the length of an array that can shrink.

### 5. "Approved this month" counts when leave was applied for, not when it is taken

`getApprovedThisMonth` (`src/data/leave.ts:377`) matches on `appliedOn`. Six
approved requests fall in June; the figure reads **five**, because the 1–2 June
leave was applied for on 28 May. It is reported in May and missing from June.

The same expression backs the Leave page's stat card
(`src/pages/leave/index.tsx:118-121`).

**Fix:** match on `startDate` (or overlap with the month), which is what the
label says.

### 6. The organisation-wide pending count is handed to whoever asks

`getPendingCount()` (`src/data/leave.ts:372`) takes no viewer and applies no
scope. In the simulation it returns 1 — a request the manager reading it cannot
see. Same for `getOnLeaveToday`, which is a company-wide list.

**Fix:** take a profile and filter through `getVisibleEmployeeIds`, as
`notifications.ts` already does.

### 7. There is no validation at the point of application

Nothing in `handleApplySubmit` (`src/pages/leave/index.tsx:174-214`) checks:

- **overlap** — the same person can file the same dates twice, and both can be
  approved;
- **balance** — an application can exceed the entitlement, and approving it
  drives `available` to zero via `Math.max(0, …)` rather than refusing or
  flagging unpaid leave;
- **backdating** — nothing bounds `startDate` against today or a cut-off.

The only checks are non-empty fields and `end >= start`.

**Fix:** at minimum, warn on overlap and show the remaining balance beside the
day count as the form is filled in.

---

## What worked, and is worth not regressing

- **Tenant separation held completely.** Two organisations, populated
  identically and independently, shared nothing: separate directories, separate
  company profiles, separate leave records. Every `modcon.hr.*` key was
  namespaced `::org:<id>`; the only bare key was the active-org pointer itself.
- **A new organisation starts genuinely empty** — no demo roster leaked into
  either.
- **`dataScope` is right.** The manager sees their own subtree plus HR and
  nobody else; an employee sees only themselves; HR sees all ten. The HR
  designation is matched exactly from the company profile.
- **The audit trail is honest.** Every approval records the manager who made it;
  a rejection clears the approver rather than crediting one.
- **The entitlement engine is correct.** Monthly accrual, the one-year Earned
  Leave gate, approved leave netted off, rejected and pending consuming nothing
  — all verified, in both organisations, reaching identical figures from
  identical months.

---

## Suggested order

1. **#1** — a manager acting on another line's leave is the one with a
   confidentiality dimension, and the fix is small.
2. **#2** — wrong day counts propagate into balances and pay.
3. **#3** — HR of a new organisation cannot see anybody's balance; the fix is to
   call a function that already exists.
4. **#4** — silent data corruption, but only once deletion exists.
5. **#5, #6, #7** — reporting accuracy and input validation.

None is architectural. #3 is close to a one-line change.

---

## Running it

```bash
npm run test:sim
```

No emulator and no network: the simulation imports the application's real
domain modules (bundled by `tests/simulation/build.mjs`, since `src/` needs the
`@/` alias, JSX, and a definition for `import.meta.env`) and runs them against
an in-memory `localStorage`. Findings are asserted **as they behave today**, so
the assertion fails the day someone fixes one and this document gets revisited
rather than quietly going stale.
