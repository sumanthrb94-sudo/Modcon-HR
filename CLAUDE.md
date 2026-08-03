# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ModCon HR is a modern HRMS single-page app (React + TypeScript + Vite + Tailwind), backed by Firebase (Auth + Firestore) and hosted on Vercel at `modcon-hr.vercel.app`. **Firebase is backend and database only — never the host.** Firebase Hosting is not used and `firebase deploy --only hosting` must not be run.

## Commands

```bash
npm run dev        # Vite dev server → http://localhost:5173
npm run build      # tsc -b && vite build  (type-check is part of the build)
npm run preview    # serve the production build locally
npm run test:e2e   # Playwright E2E (playwright test)
npm run test:rules # Firestore security-rules tests (Firestore emulator; needs Java)
```

- **Type checking is the CI gate, not lint.** `npm run lint` (`eslint .`) is defined but ESLint is **not configured or installed**, so it currently fails. Correctness is enforced by `tsc -b` inside `npm run build` — run the build to type-check.
- **Single E2E test / project:** `npx playwright test tests/e2e/smoke.spec.ts`, filter with `-g "test name"`, or one role with `--project=role-admin`. Point at the sandbox browser with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` (Chromium only — the other engines use their own downloaded builds). The suite builds + serves the production bundle and signs in through real Firebase Auth, so it needs network access to Firebase.
- **The app specs run on all three engines; scope with `E2E_BROWSERS`.** `E2E_BROWSERS=chromium npm run test:e2e` is the fast Chromium-only run. Firefox/WebKit need their browsers downloaded once via `npx playwright install firefox webkit`.
- **Security rules are tested separately from the app.** `tests/rules/` runs `firestore.rules` against the Firestore emulator via `@firebase/rules-unit-testing` (`npm run test:rules`, wrapped in `firebase emulators:exec`; needs a JDK). The E2E suite drives the UI and never exercises the rules, so role/permission changes need a test here as well. Each test reseeds — the suites mutate roles, so shared state produces false passes.
- **CI:** `.github/workflows/ci.yml` runs the build and the rules tests on every pull request and push to `main`. E2E is *not* in CI — it signs in through real Firebase Auth and provisions accounts, so it needs live credentials rather than an emulator; run it locally.
- **Deploy:** the app ships via **Vercel's Git integration** — pushes to `main` build and promote to production, pull requests get preview URLs. There is no deploy workflow in this repo; build settings live in `vercel.json`. Manual deploy from a checkout: `npx vercel --prod`. Firestore rules deploy separately through Firebase: `npm run rules:deploy` (`firebase deploy --only firestore:rules`). **App code and rules deploy independently — if a change needs both, deploy the rules first or privileged users get permission-denied against the new UI.**

Path alias: `@/*` → `src/*` (configured in both `tsconfig.json` and `vite.config.ts`).

## Architecture

### Mutable collections must persist

Anything a user can change goes through `persistentCollection` in `src/data/persistence.ts` — an org-scoped localStorage store with a change event. **Read it through the store's getter everywhere, never the exported seed array.** Aggregates (`src/data/dashboard.ts`, `src/data/notifications.ts`) and the approval pages all derived from the seeds, so a decision made on one page left every other surface reporting its original figure. `src/lib/seed.ts` is the deliberate exception — it pushes the canonical demo dataset into Firestore. Components that stay mounted while data changes elsewhere subscribe via `useDashboardDataRevision` / `useCollectionRevision`. Seeding `useState` straight from a `src/data/*.ts` array means every edit is lost on refresh, which is what attendance, assets, expenses, helpdesk and payroll all did. `tests/e2e/persistence.spec.ts` guards this: it creates a record, **reloads**, and asserts it survived. The other specs never reload, so in-memory state passes them exactly as persisted state would.

### Four data sources — do not conflate them

1. **Mock/seed data in `src/data/*.ts`** powers most feature pages (attendance, leave, payroll, etc.). It is static seed data, not Firestore.
2. **The employee directory is a mutable localStorage-backed overlay.** `getEmployeeDirectory()` (`src/data/employees.ts`) merges seed employees + locally-added employees minus locally-deleted IDs (both persisted in localStorage). `addEmployeeToDirectory` / `deleteEmployeeFromDirectory` mutate it and dispatch a `modcon-hr-directory-changed` window event; components (e.g. `Topbar`) listen and re-render. So `employees` / `getEmployee(id)` reflect live local edits, **not** the raw seed array.
3. **A separate live Firestore layer** (`src/lib/db.ts` typed collection refs + `src/lib/useFirestore.ts` real-time `use*()` hooks like `useEmployees`, `useExpenses`). This is currently used mainly by the **Admin dashboard**. `useEmployees()` (Firestore) and `@/data/employees` (mock directory) are two different employee sources — pick deliberately.
4. **Organisation configuration is Firestore-backed, and localStorage is its cache.** Leave policies, company profile, holidays, departments, the permission matrix and the notification/integration preferences live in `org_settings` (one document per setting per org, keyed `<orgKey>__<setting>`). `src/lib/orgSettings.ts` holds the registry, publishes on save, and subscribes at sign-in to hydrate the same localStorage keys the data modules already read synchronously at module-load time. **A new configuration surface goes in that registry, not in a bare localStorage key** — held locally it is invisible to the organisation's other administrators, and leave accrual is what payroll deductions are computed from. See [docs/tenant-isolation-spec.md](docs/tenant-isolation-spec.md) §3.4.

### Auth & roles (`src/lib/auth.tsx`)

- Firebase email/password auth. On each sign-in, upserts `users/{uid}` in Firestore with a `role`.
- Roles: `admin | manager | employee`. `ADMIN_EMAILS` are always admin, `MANAGER_EMAILS` always manager; otherwise the Firestore-stored role wins (admins change it from the Admin dashboard), defaulting to `employee`.
- `useAuth()` exposes `profile`, `isAdmin`, and `isManager` (**manager includes admin**). Prefer `isManager` for approval/team gating and `isAdmin` for admin-only.
- E2E test emails are granted elevated roles **only** when built with `VITE_ENABLE_E2E_ACCOUNTS=true`; production builds never trust them.
- **Appointing an employee to an HR designation grants them the `hr` role** (= administrator for that organisation); removing it revokes. Which job titles count is `hrDesignations` on the company profile (Settings → Company Profile), chosen from titles in use — matched exactly, never by looking for "HR" inside a title, which would catch unrelated roles like "Threat Analyst". The same list identifies the HR Manager(s) in `src/lib/dataScope.ts`, so access and visibility cannot disagree about who HR is.
- **There is no self-registration.** An account created that way carried no `orgId`, and "no orgId" used to resolve to the default organisation — so anyone who signed up read the incumbent tenant's data. Accounts are created by an administrator: Admin dashboard → **Create account** (`src/lib/accountInvites.ts`), which stamps the inviter's `orgId` at creation, links the new account to its employee record when exactly one in that org carries the address, and never grants `admin`. `firestore.rules` requires the stamp, so an administrator cannot create an account belonging to nobody either.
- **An account with no `orgId` is *unassigned*, not default.** `myOrgKey()` resolves it to a sentinel matching nothing; super admins are the exemption. A *document* with no `orgId` still reads as the default org (`orgKeyOf`) — that is legacy data, which is a different thing from a stranger. **The identity backfill must run before that rule reaches an organisation**, or its accounts are locked out.
- **An organisation's first account is provisioned as `hr`, not `admin`** (`src/lib/organizations.ts`). It administers that one organisation and cannot grant the Admin role or reach another org. The `Organization` schema still calls the field `adminEmail`/`adminUid` — the name predates the role, and renaming it would be a data migration.
- **Attaching an *existing* account to an organisation** is Organizations → "Set HR admin" (super-admin only). It writes `role: 'hr'` and `orgId` together and repoints the org record. The Admin dashboard can change a role but never an `orgId`, so this is the only path for it.
- **Organisations created before that change still hold a platform `admin` account.** Organizations → "Review admin roles" lists them and converts them, super-admin only. It is a two-stage dry-run/confirm because it revokes Admin from live accounts, and it never touches super admins or the fixed `ADMIN_EMAILS` (whose role is re-asserted at sign-in anyway).
- **The grant is not derived from the employee record at sign-in.** `src/data/employees.ts` is localStorage-backed and therefore client-controlled, so trusting it would let anyone edit their own designation and become an admin. Instead an administrator writes a `role_assignments/{email}` document (`src/data/roleAssignments.ts`) and `firestore.rules` verifies the sign-in self-write against it. `admin` is never assignable this way, in the client *and* the rules.

### Routing & access control (`src/App.tsx`)

- Every page is `React.lazy`-loaded under one `<Suspense>`, and the whole tree is wrapped in `ErrorBoundary`.
- Route guards: `RequireAuth`, `RequireManager` (`/approvals`, `/dashboard/pending-approvals/*`), `RequireAdmin` (`/admin`). Unauthorized users are redirected to `/`.
- The sidebar is data-driven from `src/lib/nav.ts` (`navItems` with `adminOnly` / `managerOnly` flags); `Sidebar` filters by role. **When adding a gated page, update both the route guard in `App.tsx` and the nav flag in `nav.ts`** or the two will disagree.

### Firebase & security rules

- `src/lib/firebase.ts` holds the public web config for project `modcon-hr` (safe to ship). Firestore uses long-polling only on localhost.
- `firestore.rules`: helpers `isSignedIn` / `isAdmin` / `isManager` / `isOrgAdmin`, plus the tenant helpers `orgKeyOf` / `myOrgKey` / `inMyOrg` / `writingToMyOrg`. General pattern — read: any signed-in user **of the owning organisation**; write: org administrators per collection. Every tenant document carries `orgId`, and **every query must filter on it**: a list is evaluated against each document it returns and fails whole if one belongs to another tenant, so an unfiltered read is denied, not merely wasteful.
- **A rule that reads `resource.data` denies a `get` on a document that does not exist** — `resource` is null and the dereference fails evaluation. Collections the app subscribes to before anything is written (`org_settings`) must test the document id instead.
- Rules changes must be deployed separately (see Commands); pushing app code does not update them. **The E2E suite runs against live Firebase, so it exercises the *deployed* ruleset, not the working tree** — a rules change cannot be verified end-to-end before it ships, which is what `tests/rules/` is for.
- Tenant isolation as a whole — the invariants, what a deployment can and cannot contain, and the conformance rules for new collections/queries/operations — is [docs/tenant-isolation-spec.md](docs/tenant-isolation-spec.md).

### UI & styling

- Tailwind with a custom semantic palette: `ink-*` (neutrals) and `brand-*` (primary), plus `.card` / `.input` / `.btn` component classes in `src/index.css`.
- Reusable primitives live in `src/components/ui/` (`Card`, `Table`, `Badge`, `Modal`, `StatCard`, `Select`, `Avatar`, …). `statusTone(status)` maps domain status strings to `Badge` tones — reuse it rather than hardcoding colors.
- All shared domain types are centralized in `src/types/index.ts`; feature modules import from there.

### Testing layout (`tests/e2e/`)

`playwright.config.ts` builds with `VITE_ENABLE_E2E_ACCOUNTS=true`, serves the production build, and runs six projects: the app specs (`smoke` + `interactions` + `persistence` + `attendance`) once per engine as `app` (Chromium), `app-firefox` and `app-webkit`, plus `role-employee` / `role-manager` / `role-admin` (each runs `roles.spec.ts` for its persona, in parallel). `global-setup.ts` provisions the Firebase Auth test accounts; personas/credentials are in `tests/e2e/config.ts` and overridable via `E2E_*` env vars.

**The role specs stay on Chromium.** They are the only specs that sign in per persona, so running them once per engine would triple live Firebase Auth traffic to re-test access-control logic that is app code, not engine behaviour. The Chromium project deliberately keeps the bare name `app` so existing `--project=app` invocations still work. Chrome-only launch flags (the proxy `args`, `PW_CHROMIUM_PATH`) are applied per engine — Firefox and WebKit fail to launch on unknown argv, so they must never inherit them.
