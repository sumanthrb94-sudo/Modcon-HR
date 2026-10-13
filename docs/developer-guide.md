# ModCon HR — developer guide

How the app is built, how to run it, and the decisions that are easy to undo by accident. [`CLAUDE.md`](../CLAUDE.md) holds the long-form reasoning behind each decision; this guide is the map. For product behaviour see the [user guide](user-guide.md) and [HR & admin guide](hr-admin-guide.md); for lookup tables see the [reference](reference.md).

## Stack

React 18, TypeScript (strict), Vite 5, Tailwind 3, React Router 6, Recharts, lucide-react, `motion` for animation, jsPDF for payslips. **Firebase is backend only** (Auth + Firestore); the app is hosted on **Vercel** at `modcon-hr.vercel.app`. Never run `firebase deploy --only hosting`.

## Run it

```bash
npm install
npm run sandbox     # emulators + seeded accounts + Vite  → http://localhost:5173  (start here)
npm run dev         # Vite against the LIVE Firebase project — needs real credentials
npm run build       # tsc -b && vite build — type-checking is part of the build
npm run test:unit   # pure-arithmetic suite, about a second
npm run test:rules  # Firestore rules against the emulator (needs a JDK)
npm run test:e2e    # Playwright, against the emulators
```

**Use the sandbox.** `npm run dev` points at production data where a careless click writes the organisation's real records. `npm run sandbox` starts the Firestore and Auth emulators, seeds an organisation on a trial, and runs Vite against them, so `firestore.rules` as it is in your working tree is what is exercised.

| Account | Role |
| --- | --- |
| `super@modcon.test` | Super Admin (no organisation) |
| `hr@modcon.test` | HR Manager (emp-001) |
| `manager@modcon.test` | Manager (emp-002) |
| `employee@modcon.test` | Employee (emp-003) |

Password for all four: `Sandbox@123`. Every run starts clean — nothing persists between runs, by design. If something is already listening on 8080 it is reused.

`npm run lint` runs ESLint and currently reports warnings only (no errors); the gate that matters is `tsc -b` inside `npm run build`.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_ENABLE_E2E_ACCOUNTS` | Grants elevated roles to the test personas. **Never set in a production build.** |
| `VITE_E2E_*_EMAIL` | Persona addresses, shared by the app and `tests/e2e/config.ts` |
| `VITE_FIRESTORE_EMULATOR_HOST` | Points the bundle at a Firestore emulator |
| `VITE_APP_RELEASE` | Deployed commit/release id, attached to error reports |
| `VITE_OBSERVABILITY_ENDPOINT` | Where privacy-minimised browser error events go |

## Repository layout

```
src/
  App.tsx            routes and guards (all pages React.lazy-loaded)
  main.tsx           MotionConfig (reduced motion) → App
  components/
    ui/              design-system primitives (Card, Table, Badge, Modal, StatCard, motion.tsx …)
    layout/          sidebar, topbar, AppLayout
    dashboard/       CozyDailyBriefing, MyUpdatesCard
  data/              domain logic and shared stores — one module per area; *Rules.ts files are pure
  lib/               auth, access control, scoping, Firestore wiring, hooks (use*Revision)
  pages/             one folder per feature
  types/index.ts     shared domain types
firestore.rules      the authority on who may read and write what
tests/
  unit/              node:test, no browser — pure arithmetic and rules logic
  rules/             @firebase/rules-unit-testing against the emulator
  e2e/               Playwright specs
scripts/             sandbox, deploy verification, backfills, audits
docs/                specs and guides
```

Path alias: `@/*` → `src/*`.

## The four data sources — do not conflate them

1. **Seed/mock data in `src/data/*.ts`** — the canonical demo dataset. Never read the exported seed array from a component; read through the store's getter, or an edit is lost on refresh.
2. **Shared mutable records — `persistentCollection`** (`src/data/persistence.ts`): Firestore-backed with `localStorage` as a synchronous cache. Used for employees, leave requests, expense claims, attendance, regularizations, tickets, assets, onboarding and payroll. One Firestore collection, `org_records`, keyed `<orgKey>__<store>__<recordId>`, holds only what differs from the seed plus tombstones for deleted seed records. Design: [shared-records-spec](shared-records-spec.md).
3. **Direct Firestore collections** with typed refs in `src/lib/db.ts` and hooks in `src/lib/useFirestore.ts`: payslip documents, employee documents, bank details, board posts, support threads, job applications, attendance stamps and others.
4. **Organisation configuration — `org_settings`**, one document per setting per organisation, keyed `<orgKey>__<setting>`. `src/lib/orgSettings.ts` is the registry: it publishes on save and hydrates the same `localStorage` keys the data modules read synchronously at module load. **A new configuration surface goes in that registry, not in a bare `localStorage` key.**

### Why the cache exists, and what it costs

Data modules read synchronously at module-load time, before React or auth resolves, so they cannot await. Hence Firestore + a `localStorage` cache. Consequences to keep in mind:

- **Writes are optimistic and a reload is not free.** `save()` updates the cache, fires the change event and returns; the commit follows and is never awaited. A reload starts a fresh SDK with an empty mutation queue, so an un-acked write can lose the race and revert. Tests wait for the write to land (`waitForOrgRecord`, `waitForOrgRecordsQuiet`) rather than reload.
- **A page that stays mounted must subscribe to change events** (`useDashboardDataRevision`, `useCollectionRevision`, or a feature `use*Revision` hook). A mount-time snapshot never sees a colleague's write.
- **Stores register late** (pages are lazy), so sync subscribes late registrations itself.

### Adding a shared store or a setting

- A shared record store: use `persistentCollection`, read §5 of the shared-records spec first (the generic rule is a tenant boundary plus one authority rule — **do not widen it**; narrow stores carry a `readableBy` list stamped on save).
- A configuration surface: add it to `ORG_SETTINGS`, expose a getter read **at call time** (never captured at module load) and a `use*Revision` hook.
- A new Firestore collection: filter every query on `orgId` (a list is evaluated against every document it returns and fails whole if one belongs to another tenant), write a rules block, and a rules test.

## Identity, roles and scope

- **Who an account *is*** is answered by `employee_links/{uid}`, written by an administrator, and nothing else. `resolveEmployeeForAccount` (`src/lib/currentEmployee.ts`) is the one client-side resolution order; the directory match by uid/email/name is only the fallback for an account with no link.
- **Roles**: `admin | manager | employee` in `users/{uid}.role`, plus `superAdmin`. `resolveAppRole(profile)` yields the display role (Admin, HR Manager, Manager, Employee) every guard uses. A role change reaches the open session via a live subscription — no sign-out, except an `orgId` change, which reloads.
- **A super admin belongs to no organisation.** Tenant routes are refused until they deliberately open one (`isSuperAdminInsideOrg`).
- **Scope** (`src/lib/dataScope.ts`): `getVisibleEmployeeIds` (whose records you may read) and `getApprovableEmployeeIds` (whose requests you may decide) are different sets on purpose. Authority comes from the reporting line **or** the HR/Admin role. `updateLeaveRequestStatus`, `updateExpenseClaimStatus` and `decideRegularization` are the enforcement points, not the pages; each takes the deciding `profile` as a **required** argument.
- **Guards**: route guards in `App.tsx` and the nav flags in `src/lib/nav.ts` must agree. The permission matrix is `src/lib/accessControl.ts`; pinned cells are enforced on read so a stored matrix cannot re-grant them.

## Security rules

`firestore.rules` is authoritative; the client check is only an explanation. General pattern: read — a signed-in user of the owning organisation; write — organisation administrators per collection. Specifics that have bitten before:

- A rule reading `resource.data` **denies a `get` on a document that does not exist**. Subscribe with a query filtered on `orgId` (+ `employeeId` where the rule is per person), never a `get` by id, wherever "nothing yet" is a normal state.
- Use `.get('field', default)`, not `.field`, in rules — a missing field errors and denies the whole rule.
- Use `callerIsSuperAdmin()`, not `isSuperAdmin()`, where negated or in a ternary.
- Rules have no `sqrt`/`cos`/JSON parser: geofence distance is compared squared and the fence is projected into a structured document (`attendance_geofences`). `squaredMetresBetween` (client) and `squaredMetres` (rules) are mirrors — change them together.
- **Deploy order**: app code and rules ship independently. When a change needs both, **deploy the rules first**, or privileged users get permission-denied against the new UI. (The regularization backfill is the one exception: backfill → app → rules.)
- Prove a rule in `tests/rules/` — the E2E suite only ever sends what the UI was built to send.

## Money and compliance code

Pure modules with no imports, unit-tested with worked examples: `statutoryRules.ts`, `returnFiles.ts`, `shiftRules.ts`, `geofenceRules.ts`, `compOffRules.ts`, `lossOfPay.ts`, `subscriptionRules.ts`, `bankDetailsRules.ts`, `myUpdatesRules.ts`. Keep logic there; keep the stores thin.

The recurring principle: **no plausible default**. Holidays, salary split, shifts and statutory schemes return `[]`/`null`/"not set" for an unconfigured organisation, and every surface renders that state explicitly. `statutory` on a payslip is `null`, never a block of zeroes.

Also: a row that cannot be used in an upload is **reported, never dropped**; a payslip PDF is built once (`src/lib/payslipPdf.ts`, amounts print as "Rs." because jsPDF's built-in fonts have no ₹ glyph).

## UI conventions

- **Tokens live in `tailwind.config.js`** and nowhere else: `brand-*` (Signal Red #EC3013), `ink-*` warm neutrals, Archivo, zero border radius (including `full`). A component reads `bg-brand-600`, never a hex. Charts are the exception and take colours from `src/lib/chartTheme.ts`.
- Flush-left everywhere; `.btn-block` for full-width buttons.
- Status hues (`statusTone`) are the only place colour carries meaning.
- The mark is `BrandMark.tsx`; do not re-draw it.
- **Motion** has one vocabulary, `src/components/ui/motion.tsx`: `FadeIn`, `Stagger`/`StaggerItem`, `TextEffect`, `SlidingNumber`, `PageTransition`. Heavy on public pages, light in the app. Two rules: the DOM text is always the final text, and a reveal drops its `filter` when it lands (a leftover filter traps `position: fixed` children). Reduced motion is handled by `MotionConfig` plus a CSS guard.
- A stat tile that counts something should open it: `StatCard` takes `to`.
- Shared primitives are in `src/components/ui/`; add there rather than copy.

## Testing

| Suite | Command | What it proves |
| --- | --- | --- |
| Unit | `npm run test:unit` | Arithmetic and pure rules (statutory, TDS credit, loss of pay, comp off, bank details, updates) |
| Rules | `npm run test:rules` | `firestore.rules` boundaries — who cannot read or write what |
| E2E | `npm run test:e2e` | The UI, in a real browser, against the emulators |

E2E specifics:

- Runs against the **Firestore (8080) and Auth (9099) emulators** and `scripts/e2e.sh` starts them. Nothing runs against the live project; reaching it means typing `E2E_LIVE_FIRESTORE=true` by hand, and it writes the organisation's real data (a live run once exhausted the daily Firestore quota and stranded fake records in Settings).
- Projects: `app` (+ `app-firefox`, `app-webkit`), `org-settings` (Chromium only, writes shared configuration, runs serially), `role-employee` / `role-manager` / `role-admin`. Scope engines with `E2E_BROWSERS=chromium`; point at the sandbox browser with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- A spec that writes `employee_links` needs a persona of its own — the document is shared by every worker in the run.
- Anything that fakes "today" belongs in `tests/e2e/clock.ts`.
- Specs avoid `page.reload()` after a write for the reason above.
- **The session lives in the tab** (`browserSessionPersistence`, `src/lib/firebase.ts`): a reload keeps you signed in, but a new tab or a closed browser does not. A script that calls `page.goto()` on a fresh page is signed out; sign in once and navigate inside that page (`history.pushState` + a `popstate` event) to move between routes.
- Running the four app and role projects together on one emulator can overload it and produce "browser has been closed" timeouts that are not code failures. Run projects separately and compare against the known failures before reading a failure as a regression.

A change to rules or permissions needs a rules test **and** an E2E check; a change to money needs a unit test with the figure written out.

### Verify what the user sees, not what the code says

Several defects here passed type-checks, unit tests and E2E because nothing read the screen as a user: a status line claiming "everyone is available" with zero check-ins, a bell count that differed from the queue it opened, a decision that told the applicant nothing. When a change touches wording, a count or a notification, sign in as the affected role in the sandbox, perform the action, and read the text — then write the check down as a spec. `tests/e2e/notification-counts.spec.ts` is the model.

## Deploying

- **App**: Vercel's Git integration — a push to `main` builds and promotes to production; PRs get preview URLs. Build settings are in `vercel.json` (Vite preset, SPA rewrite, immutable caching on `/assets/*`, security headers). Manual: `npx vercel --prod`. A production deploy can fail on Vercel's side (for example `git_info_fail`) while the same commit builds as a branch preview — check the deployment state after pushing, do not assume.
- **Rules**: `npm run rules:deploy`, then `npm run rules:verify`, which fetches the deployed ruleset and compares it byte-for-byte with `firestore.rules` (reads no documents, spends no quota). Rules deploy needs a logged-in Firebase CLI.
- Release gate: [launch-readiness](launch-readiness.md).
- CI (`.github/workflows/ci.yml`) runs the build, rules tests and the E2E suite (`app` + `org-settings`, Chromium) on every PR and push to `main`. `npm run test:unit` is not in CI yet.

## Known gaps

- **Onboarding approvals** (`/dashboard/pending-approvals/onboarding-tasks`): Approve/Decline hide a task for the session only; they write nothing.
- **Leave, expense, onboarding and recruitment-overlay decisions are client-enforced**; the rules enforce a tenant boundary and the "employee cannot move their own request out of Pending" rule, not the full reporting line (regularizations and expenses are stricter; see CLAUDE.md).
- **Read state for notifications is per device** (`localStorage`).
- **ESI coverage** is tested monthly, not held for the April/October contribution period (stated in the UI).
- **No device attestation** for attendance location; it would need a backend this project does not have.
- The `app` E2E project had 16 failures on 2026-10-12 that predate the changes of that day (browser-closed timeouts and a few strict selectors, e.g. `getByText('—')` matching two cells). Compare before and after rather than expecting a clean run, and fix them rather than adding to them.
- `Employee.bankAccountNumber` / `bankIfsc` still exist on the type; nothing writes them — the account lives in `employee_bank_details`.

## Where the deeper specs are

| Topic | Document |
| --- | --- |
| Shared records and the cache | [shared-records-spec](shared-records-spec.md) |
| Tenant isolation, conformance rules for new collections | [tenant-isolation-spec](tenant-isolation-spec.md) · [multi-tenancy-spec](multi-tenancy-spec.md) |
| Salary and leave access | [salary-leave-access-spec](salary-leave-access-spec.md) |
| Geofenced attendance | [geofenced-attendance-spec](geofenced-attendance-spec.md) · [checkin-policy-spec](checkin-policy-spec.md) |
| Document management | [document-management-spec](document-management-spec.md) |
| Product requirements | [PRD](PRD.md) · [india-first-positioning](india-first-positioning.md) |
