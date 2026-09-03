# Shared records, and The Board

Two changes, one cause: the app's record collections were per-browser, so an
organisation could not actually be an organisation. Attendance, leave, assets,
expenses, helpdesk, payroll and onboarding are now Firestore-backed; and the
static announcements array is now a live feed people post to.

## 1. What was wrong

`persistentCollection` wrote to `localStorage` and nowhere else. Every module
that went through it — seven of them, plus leave, which had a hand-rolled copy
of the same pattern — held a copy belonging to one browser:

- An employee checked in on their phone; HR, on a laptop, saw nothing.
- Two administrators of one company edited unrelated datasets.
- Clearing site data destroyed the record, with no backup anywhere.
- The geofencing shipped just before this had a hole through it: the location
  *stamp* was in Firestore and visible to HR, but the attendance day it was
  evidence for stayed on the employee's own device.

None of it was visible from the screens, because a demo is one person in one
browser. The E2E suite could not catch it either: every spec ran in a single
context, where per-browser and shared storage are indistinguishable.
`tests/e2e/shared-records.spec.ts` is the spec that can, and it uses **two
browser contexts** for exactly that reason.

## 2. The seam

`src/data/persistence.ts`. One module changed and nine stores moved, because
every one of them already went through `persistentCollection` — except leave,
which is why leave was the collection a careless migration would have silently
skipped. It is on the seam now.

The synchronous contract is kept: data modules read at module-load time, before
React or auth resolves, so they cannot await. localStorage is the cache;
Firestore is the store; `startSharedCollectionsSync` hydrates one from the other
once the profile is known. Identical arrangement to `lib/orgSettings.ts`, which
did this for configuration a while ago.

## 3. The overlay model

Firestore holds only what **differs** from the seed — records added or edited,
plus a tombstone for a seed record somebody deleted — and `get()` merges the
two.

The alternative was materialising the whole demo dataset into every new
organisation on its first write: hundreds of documents to say nothing the code
did not already say. The seed is identical code for every user, so merging it
locally still leaves everyone looking at the same thing.

This is the shape `getEmployeeDirectory()` has always had: seed, plus additions,
minus deletions.

**Tombstones are not optional.** Absence cannot distinguish "the seed has this
and the organisation removed it" from "this was never here", so without a
tombstone a deleted record reappears on the next read.

**The cache key is new** (`<baseKey>.overlay`). The old key holds the *merged*
array, and reading that back as an overlay would resurrect every record an
organisation had deleted. A one-time migration lifts additions and edits across;
deletions are lost, once, because a merged array cannot express them.

## 4. One Firestore collection, not nine

Everything lives in `org_records`, keyed `<orgKey>__<store>__<recordId>`, with
the record carried as a JSON string in `data`. One collection means one rules
block rather than nine near-identical ones, and a JSON string sidesteps
Firestore's constraints on nested arrays and undefined fields — the same
reasoning `publishOrgSetting` uses.

`employeeId` and `status` are lifted to top-level fields where a record has
them. Nothing in the app reads them there; `firestore.rules` does, because a
rule cannot parse the JSON and "only a manager decides a leave request" has to
be expressible.

Subscriptions are **per store**, not per organisation: attendance alone is
thousands of documents a year and a page that wants the ticket list should not
stream them. That query filters on `orgId` and `store` together, so it needs the
composite index in `firestore.indexes.json`.

## 5. What the rules do and do not enforce — read this before adding a module

`org_records` is a **tenant** boundary. A signed-in member of an organisation
reads and writes that organisation's records and no other's, and the document id
cannot be forged to file a record under a tenant the caller does not belong to.

Plus **one** authority rule: an ordinary employee cannot move a leave request out
of `Pending`. Leave is where the money is — an approved day is a paid day, and
unpaid absence is what payroll deducts. `src/lib/dataScope.ts` computes the
precise set (the reporting line plus the administrators) and that needs the org
chart, which rules cannot walk; so the server enforces the coarse half that
catches the case that matters. Cancelling your own request is untouched.

**It is not yet a per-record authority boundary.** Whether a ticket may be edited
by somebody who does not own it, or an expense approved by somebody who is not a
manager, is still decided in the client. That is a real gap. It is also strictly
more than existed before, when these records had no server at all and every check
was a hidden button.

Closing it means promoting the fields each rule needs to top-level — the pattern
`employeeId`/`status` already establishes — and adding a per-store clause beside
`leaveDecisionIsAuthorised`. Do that per store, with a rules test per claim; do
not widen the generic block.

## 6. The Board

`src/lib/orgFeed.ts`, `org_posts`. What it replaces was `announcements` in
`src/data/common.ts`: a static array, read-only, identical for every tenant,
impossible for anyone inside a company to add to. It looked like a feature and
was a decoration.

Firestore-native from the first line rather than another localStorage overlay to
migrate later.

**Reactions are a map of `uid → emoji` on the post, and that is a rules
decision.** It lets `firestore.rules` say:

```
request.resource.data.reactions.diff(resource.data.reactions)
  .affectedKeys().hasOnly([request.auth.uid])
```

— you may react as yourself and nobody else, as a property of the storage rather
than of the button. A counter would let anyone increment anything; a
subcollection would need a second rules block and a second read to say the same
thing. The emoji set is closed and mirrored in the rules, because free text there
is arbitrary strings on everyone's board.

Every update path is restricted to the keys it is about, so "react" cannot double
as "rewrite what this post says" — `tests/rules/org-posts.rules.test.mjs` has the
test for that specific smuggle.

**Replies cannot be edited by anybody, including their author.** A conversation
people rely on is not one where earlier turns change under later ones. Removal is
allowed; rewriting is not.

**The Board is deliberately not in the permission matrix.** A noticeboard an
administrator can switch off for employees is a noticeboard nobody reads. `NavItem.module`
is optional for this reason and the filter in `nav.ts` says so.

## 7. Celebrations are derived, never stored

`src/data/celebrations.ts` computes birthdays and work anniversaries from
`dateOfBirth` and `dateOfJoining` at read time. Writing a post per celebration
would need a scheduled job this project has no backend for, and would leave a
year of stale documents the day somebody's date is corrected on their profile.

What the board offers instead is a **composer pre-filled with a greeting**, so
the wish is a real post by a real person rather than an automated card nobody
wrote.

Dates are compared in IST like every other date in the app: a birthday on the 4th
displays as the 3rd for anyone west of Greenwich otherwise, and "today" is
exactly the question this module answers. Resigned employees are excluded — a
board wishing somebody a happy work anniversary the month after they left is
worse than saying nothing — and so is a zero-year anniversary. 29 February is not
special-cased into 28 February or 1 March: picking a substitute would be the app
deciding when somebody's birthday is.

## 8. The suite runs on one worker now

Before this change every spec had a private dataset — its own localStorage, in
its own context — so four workers could safely mark the same employee absent on
the same day. They now share one server and one demo organisation, and they
interfere: a reset in one spec deletes records another just wrote, and the
regularization queue is *derived from all attendance*, so a day marked anywhere
shows up everywhere.

`fullyParallel` cannot express the constraint, because it parallelises across
files and the interference is between files. Two mitigations went in first and
were not enough on their own:

- `clearOrgRecords(store, { employeeId })` scopes a reset to one person, so a
  spec no longer wipes the organisation's attendance to clean up after itself.
  `employeeId` is a top-level field for exactly this reason.
- The specs that link an account to a directory record each take a different
  employee (`check-in-out` the first, `geofenced-attendance` the third,
  `persistence` the fifth offered).

The org-wide derived queues defeat the rest, so `workers: 1`. The suite trades
wall-clock for determinism — the same trade the `org-isolation` dependency edge
already makes.

**The way back to parallelism is a per-spec organisation** rather than the
shared demo one: provision one in `global-setup.ts`, stamp it on the persona,
and the interference disappears along with the need for either mitigation
above. That is the right fix and it is not done.

## 9. Writes are optimistic, and a reload is not free

`save()` writes the cache, fires the change event and returns; the batch commit
happens afterwards and is never awaited. That is deliberate — no page should
wait on the network to show what the user just did — but it has one consequence
worth stating, because it cost three specs to find:

**A reload is a fresh Firestore SDK with an empty mutation queue.** No offline
persistence is configured, so a write that has not yet been acknowledged does
not survive the page that made it. The new page then subscribes, the server
sends the *older* copy, and `hydrate` writes that over the cache — so the change
silently reverts. From the screen it looks exactly like a decision that never
landed: the approvals page had already dropped the row (the day it was about is
no longer flagged), while the queue on Attendance still read `Pending`.

The same race runs the other way for a reset: a delete issued before the commit
is overtaken by it, and the next scenario starts against the record it thought
it had removed.

Both are visible in tests and vanishingly rare in a browser a person is using —
a commit is milliseconds and a reload is not. The specs therefore wait rather
than the app blocking:

- `waitForOrgRecord(store, id, predicate)` where a spec can state the value it
  expects, which is the stronger assertion;
- `waitForOrgRecordsQuiet(store, { employeeId })` where it cannot — a reset
  clears whatever is there. "Quiet" is two identical reads 400 ms apart, not
  one: a single read a moment after a click sees the state *before* it just as
  convincingly as the state after.

**The way to remove the hazard rather than wait it out is Firestore's
IndexedDB-backed cache** (`persistentLocalCache`), which keeps the mutation
queue across a reload and would also make an offline check-in survive being
closed. It is not enabled: it changes the storage model the E2E resets are
written against — they clear `localStorage`, not IndexedDB — so it needs its own
pass rather than riding along with this one.

## 10. Testing

- `tests/rules/org-records.rules.test.mjs` — the tenant boundary, the leave
  authority rule, and that the status rule does not leak onto other stores.
- `tests/rules/org-posts.rules.test.mjs` — attribution, the reaction rule and
  every way round it, pinning, and reply immutability.
- `tests/e2e/shared-records.spec.ts` — **two browser contexts**. The only spec in
  the suite that can tell shared storage from per-browser storage.
