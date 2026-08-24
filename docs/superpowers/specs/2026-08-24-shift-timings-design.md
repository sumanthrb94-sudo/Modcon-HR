# HR-configurable shift timings

How an organisation using ModCon HR declares the hours its people work, assigns
a person to a set of hours, and has lateness judged against the hours that
person actually works rather than against a platform constant.

Companion to [tenant-isolation-spec.md](../../tenant-isolation-spec.md) §3.4,
which governs where organisation configuration lives and why.

Status: **designed, not implemented.**

---

## 1. What is actually there today

Verified against the repo, because this changes attendance code that already
exists rather than adding a greenfield module.

| Thing | Where | Value |
|---|---|---|
| Shift label | `src/data/attendance.ts` | `DEFAULT_SHIFT = 'General (09:00 – 18:00)'` |
| Late threshold | `src/data/attendance.ts` | `LATE_AFTER = '09:15'` |
| Lateness test | `src/data/attendance.ts` | `isLateCheckIn(checkIn)` |
| Week off | `src/data/employees.ts` | `weekOffOf(employee)` — already per employee |

Three facts shape everything below.

**The hours are a platform constant, but the days are already personal.**
`weekOffOf` answers "which day is this person rostered off" per employee, and
`deriveRegularizationRequests` already leans on it — a Monday absence is an
anomaly for most of the company and a rostered day off for sales and support.
The hours never got the same treatment.

**`shift` on `AttendanceRecord` is a caption, not data.** It is typed `string`,
it is stamped `DEFAULT_SHIFT` at every write, and nothing parses it. The two
attendance tables render it and that is all it does.

**`09:00` and `09:15` are unrelated literals.** The shift start exists only
inside a display string; the grace threshold is a separate constant. Nothing
ties them together, which is why making shifts configurable naively would let
HR declare a 22:00 shift while lateness went on keying off 09:15 — flagging
every night worker late, every night, silently.

## 2. The requirement

An organisation should be able to declare the shifts it runs, assign each
employee to one, and have every lateness judgement made against that person's
own shift. An organisation that has declared nothing should have nobody flagged
late.

## 3. Decisions

### 3.1 A shift carries a name, a start, an end and a grace period

```ts
interface Shift {
  id: string;            // stable slug — the reference key
  name: string;          // 'General', 'Night'
  start: string;         // 'HH:mm'
  end: string;           // 'HH:mm'
  graceMinutes: number;
}

interface ShiftConfig {
  shifts: Shift[];
  defaultShiftId: string | null;
}
```

**Grace belongs to the shift, not to the organisation.** A night shift and a
general shift have no reason to share one tolerance, and the constant this
replaces was organisation-wide only because there was one shift.

**`defaultShiftId` is a field, not an `isDefault` flag on each shift.** Two
defaults must not be representable. A flag per shift makes "which one is the
default" a question the data can answer twice.

**Minimum hours for a full or half day are deliberately absent.** They would
pull `Half Day` from a status a human sets into a status the app derives, which
reaches into payroll's unpaid-absence arithmetic. Worked hours go on being
measured from the captured instants exactly as they are today.

### 3.2 Storage: two org settings sharing one change event

| Setting | localStorage key | Payload |
|---|---|---|
| `shifts` | `modcon.hr.shifts` | `ShiftConfig` |
| `employeeShifts` | `modcon.hr.employeeShifts` | sparse `{ [employeeId]: shiftId }` |

Both dispatch **`modcon-hr-shifts-changed`**. The same event on purpose, for
the reason `src/lib/orgSettings.ts` already gives for the leave and salary
pairs: every surface that re-renders when the organisation's hours move has to
re-render when one person's do, or the two figures drift on screen because only
one of them published.

The assignment map is **sparse**, like the per-employee leave entitlements: a
file about three people is a statement about those three. Removing an
assignment puts the employee back on the organisation's default, never on
nothing.

Assignment is stored here rather than on the `Employee` record, even though
`weekOff` — the closest analogue — lives there. The employee directory is
localStorage-backed and client-controlled, so an assignment made in one browser
would never reach the organisation's other administrators, and this one drives a
flag that appears in the regularization queue.

**No `firestore.rules` change is needed, and no `rules:deploy`.** The
`org_settings` rule keys on the document *id* (`<orgKey>__<setting>`) rather
than on a list of known settings, so two new keys ride the existing
`isOrgAdmin()` write rule unchanged. Nothing is added to `tests/rules/` for the
same reason: there is no new collection and no new rule to prove.

### 3.3 An organisation that has declared no shifts flags nobody late

`getShifts()` returns `[]` for such an organisation, `getShiftFor()` returns
`null`, `isLateFor()` returns `false`, and the record's caption renders "—".

Falling back to a plausible 09:00–18:00 would tell a company its people are
late against hours nobody there set — the same fabrication
`getSalaryStructure()` refuses when it returns `null` rather than inventing a
Basic 50%.

`General (09:00 – 18:00)` with a 15-minute grace becomes **ModCon Builders'
demo data**, gated by `isMockDataCleared()` exactly like `demoCompanyProfile`
and the demo salary split. The demo organisation therefore behaves precisely as
it does today; a real organisation created later starts empty.

### 3.4 One function answers "which hours is this person on"

```ts
getShifts(): Shift[]                     // [] when the org has declared none
getShiftFor(employeeId?): Shift | null   // theirs → org default → null
isLateFor(employeeId, checkIn): boolean  // replaces isLateCheckIn
shiftCaption(shift: Shift | null): string // 'General (09:00 – 18:00)' | ''
```

`getShiftFor` is the `getSalaryStructureFor` / `getLeavePoliciesFor` shape:
called with no id it means "the organisation's own", which is what Settings
edits and what everyone without an assignment is judged on.

**`employeeId` is required on `isLateFor`, not optional.** Optional, every
existing call site keeps compiling and goes on judging everyone against the
wrong shift — the reason `updateLeaveRequestStatus` takes a required `profile`.
A required argument turns "did I update this call site?" from a review question
into a build failure.

Read it through `getShiftFor` at call time, never captured at module load, and
subscribe with a `useShiftRevision` hook in anything that stays mounted: an
administrator can change it in Settings, and the cache is hydrated from
Firestore after sign-in.

### 3.5 A shift that crosses midnight

A shift with `end < start` runs into the next day. For lateness this matters in
exactly one place, and it is a real defect if missed.

A Night shift starting 22:00 with a 15-minute grace is late after 22:15 — 1335
minutes past midnight. A check-in at 00:30 computes as 30 minutes, sails under
1335, and reports **not late** for somebody two and a half hours late.

So: when `end < start` and the check-in falls before `end`, add 1440 minutes
before comparing. Parsed through the existing `clockMinutes`, which already
refuses an unpadded hour — the trap that made `'9:05' > '09:15'` true.

### 3.6 A record keeps the judgement it was given

`isLate` and the shift caption stay on the attendance record as stored facts
about that day. Retiming a shift, widening a grace period or moving somebody to
different hours applies to days judged from then on.

This is what the record already does — `isLate` is written at check-in — and it
means HR cannot retroactively erase or invent a month of late arrivals by
editing Settings. Regularization requests are raised against those flags.

The consequence is a smaller change than the alternative: because the caption is
stamped at write time from the then-current definition, `AttendanceRecord.shift`
stays `string`. Re-deriving would have forced it to `string | null`, rippled
into both attendance tables, and needed a migration story for every record
already carrying `isLate`.

The caption is `shiftCaption(shift)` — `` `${name} (${start} – ${end})` ``, an
en dash, reproducing today's `DEFAULT_SHIFT` byte for byte for the demo General
shift so no seed caption changes. For an organisation that has declared no
shifts it is the **empty string**, and both attendance tables render an empty
`shift` as "—". `AttendanceRecord.shift` therefore stays a non-nullable
`string` and neither table column signature changes.

**The guarantee covers stored records, not the regenerated seed.** The demo
dataset in `attendanceRecords` is rebuilt at module load, so retiming a shift
does change the caption and the flags on those rows — they were never stored to
begin with. Records written through `writeRecord` are the ones this is a promise
about: a real check-in, a manual mark, an approved regularization. That is the
right boundary, since the seed is demo data and the promise is about what an
organisation's own attendance says.

### 3.7 Renaming is free; withdrawing needs an empty shift

Assignment is by `id`, so renaming a shift moves everyone on it with it. This is
strictly better than the Locations tab, where the name *was* the key and a
rename had to carry its occupants explicitly.

A shift can be withdrawn only once nobody is assigned to it — the Locations
precedent. Hours people are still rostered on cannot be retired out from under
them.

## 4. Where HR edits it

**A new Settings tab**, `shifts` — *"Shifts / Working hours & grace"* — beside
Leave Policies and Salary Structure. It adds and edits shifts, sets the default,
and lists who is on each.

**The employee profile** gets a `Shift` row beside `Week Off` and a picker in
the edit form beside `editWeekOff`.

**Add Employee** offers the same picker, defaulting to the organisation's
default shift.

All three write the sparse assignment map. None of them writes the employee
record.

## 5. What changes at the edges

| Change | Detail |
|---|---|
| `LATE_AFTER` | deleted |
| `isLateCheckIn` | deleted → `isLateFor(employeeId, checkIn)` |
| `DEFAULT_SHIFT` | deleted; the caption is built from the resolved definition |
| `src/pages/attendance/index.tsx` | Mark Attendance already has the employee id in scope |
| `src/data/attendance.ts` | the seed's `override()` and `checkIn()` |

Seed lateness still computes against 09:15 — the demo General shift with a
15-minute grace — so **no seed record changes value**.

The notification preference *"Notify manager if employee clocks in after shift
start"* becomes literally true for the first time. No edit.

## 6. Testing

`tests/e2e/shift-timings.spec.ts`, in the **org-settings project**, Chromium
only. It writes the organisation's shared configuration, which is the same
reason the leave, salary and location specs live there, and running it once per
engine would make three concurrent whole-document writers out of one.

It restores the organisation's pre-run shift configuration at **both ends**: an
interrupted run otherwise strands a fake shift that is offered to every
employee and looks exactly like a real one.

Five assertions:

1. A declared shift reaches the organisation's **Firestore** copy, with its
   actual hours rather than merely something written.
2. An assignment is visible from a **second browser context** — a reload proves
   nothing here, because the localStorage cache reloads with it.
3. A shift somebody is on **cannot** be withdrawn (§3.7).
4. Renaming a shift keeps its people, because assignment is by id (§3.7).
5. An empty shift **can** be withdrawn.

**The arithmetic is unit tested, not driven through the browser.**
`tests/unit/shiftRules.test.ts` (`npm run test:unit`, node's strip-types
runner — the `test:progress` pattern) enumerates the grace boundary, the
unreadable time, the null shift, and the midnight cases from §3.5. That is
where they can actually be stated: the E2E personas match no employee record,
so driving a 00:30 arrival through the UI would need a seeded reporting line
before it could assert anything. It is also where the midnight case **did**
fail before the +1440 was written.

This is why `src/data/shiftRules.ts` imports nothing at all — the strip-types
runner resolves neither the `@/*` alias nor firebase, so the arithmetic and the
storage have to be separate modules for either to be testable at its own level.

Nothing is added to `tests/rules/` — see §3.2.

## 7. Out of scope

- Minimum hours driving `Half Day` (§3.1).
- Rosters that vary by date — a shift is a standing assignment, not a calendar.
- Overtime, night-shift allowances, or anything reaching payroll.
- Bulk CSV assignment. The picker and the Settings roster cover the demo; the
  leave-entitlement upload is the pattern to copy if it is ever wanted.
