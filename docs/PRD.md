# ModCon HR — Product Requirements Document

| | |
|---|---|
| **Product** | ModCon HR, a multi-tenant HRMS web application |
| **Version** | 0.1.0 (`package.json`) |
| **Status** | Live at `modcon-hr.vercel.app`, serving the ModCon Builders demo organisation |
| **Document date** | 7 August 2026 |
| **Author** | Generated from the shipped codebase at `main` |

This PRD describes the product as it exists in this repository, states the
requirements each shipped module satisfies, and separates those from the gaps
the team has not closed yet. Every requirement traces to code, and the file
paths are given so a reviewer can check the claim.

---

## 1. Summary

ModCon HR runs an organisation's employee lifecycle in one browser
application: hire someone, track their attendance, approve their leave, pay
them, review them, hand them a laptop, answer their support ticket, and file
their paperwork. It ships as a React single-page app on Vercel with Firebase
Auth and Firestore behind it.

Multiple organisations share one deployment. Each one sees only its own people,
its own configuration and its own money, enforced in `firestore.rules` rather
than in the client.

### What it is not

- Not an ATS replacement. Recruitment tracks openings and a candidate pipeline; it does not parse résumés, schedule interviews or send offer letters.
- Not a payroll engine of record. It computes a statement from CTC and attendance, and it stores the PDF an administrator uploads. It does not file taxes or move money.
- Not a self-service signup product. An administrator creates every account (§5.2).
- Not mobile-native. The app is responsive; there is no iOS or Android client.

---

## 2. Goals

| # | Goal | How it is measured |
|---|---|---|
| G1 | One place for the whole employee lifecycle | 17 modules cover hire to exit (§4) |
| G2 | An organisation configures its own policy, and that configuration reaches every administrator | 11 settings live in `org_settings`, synced at sign-in (`src/lib/orgSettings.ts`) |
| G3 | A tenant cannot read another tenant's data | `firestore.rules` scopes 27 collections by `orgId`; `tests/rules/multitenancy.rules.test.mjs` proves it |
| G4 | An employee cannot read a colleague's salary, leave or documents | `isSelf()` against `employee_links`; `tests/rules/salary-leave.rules.test.mjs`, `payslip-documents.rules.test.mjs` |
| G5 | Nothing a user changes is lost on reload | Everything mutable goes through `persistentCollection` (`src/data/persistence.ts`); `tests/e2e/persistence.spec.ts` reloads and re-asserts |
| G6 | Figures agree across every surface that shows them | Aggregates read the store getter, and long-lived components subscribe to revision hooks (`src/lib/useCollectionRevision.ts`) |

### Non-goals for this version

Offline mode, an audit log a customer can export, per-tenant deployment
targets, and a public API. Feature flags exist (`src/lib/features.ts`) because
one bundle reaches every tenant at once and staged rollout has to be expressed
in data; the flag registry is deliberately empty between rollouts.

---

## 3. Users and roles

Four application roles, defined in `src/lib/accessControl.ts`:

| Role | Who they are | Reach |
|---|---|---|
| **Employee** | Anyone on the payroll | Their own attendance, leave, payslips, expenses, tickets and documents |
| **Manager** | Anyone with reports | Their team, plus the Approvals workspace |
| **HR Manager** | The organisation's administrator | Everything inside one organisation, including Settings |
| **Admin** | Platform administrator | The same modules as HR, plus the Admin dashboard |

A fifth capability sits above the matrix. A **super admin** creates
organisations, attaches accounts to them, sets feature flags, and reviews
legacy admin roles (`src/pages/organizations/`). No amount of organisation-level
administration grants it.

An HR Manager holds the same module access as an Admin. What separates them is
reach, not level: HR is confined to one organisation and can never grant the
Admin role or create an organisation.

### Role assignment

- `ADMIN_EMAILS` and `MANAGER_EMAILS` in `src/lib/auth.tsx` are fixed. Everyone else takes the role stored on `users/{uid}`.
- Appointing an employee to an HR designation grants the `hr` role. Both the job title **and** the department must match (`carriesHrFunction` in `src/data/companyProfile.ts`), so an "Application Developer" in Engineering cannot be nominated into every salary in the company.
- The grant is written to `role_assignments/{email}` by an administrator, and `firestore.rules` checks the sign-in self-write against it. The client-side employee record is localStorage-backed and therefore never trusted for this.
- `admin` is not assignable through role assignment, in the client or in the rules.

---

## 4. Functional requirements by module

Access levels below are the shipped defaults in `defaultPermissions`. An
organisation's administrator can change most cells in Settings → Roles &
Permissions; `PINNED_PERMISSIONS` and `MODULE_ROLE_EXCLUSIONS` mark the ones the
app fixes because the server would otherwise contradict the UI.

### 4.1 Dashboard (`src/pages/dashboard/`)

Headcount, attendance trend, leave summary, pending approvals, announcements
and celebrations, with drill-down pages for each card.

- **FR-DASH-1** Every stat card derives from the live store, not the seed array.
- **FR-DASH-2** The pending-approvals queue splits by type: leave, expense claims, regularizations, onboarding tasks.
- **FR-DASH-3** Cards refresh when the underlying data changes on another page, via `useDashboardDataRevision`.
- **FR-DASH-4** Leave balance cards show approved, pending and remaining days, so a figure on the dashboard matches the same figure on Leave and on the employee profile.

### 4.2 Employee directory (`src/pages/employees/`)

Search, filter, grid and list views, a full profile with tabs, and an
interactive org chart.

- **FR-EMP-1** The directory is seed employees plus locally-added minus locally-deleted (`getEmployeeDirectory()`), and every consumer reads it through the getter.
- **FR-EMP-2** Add Employee offers "+ Add new…" for department and location, and both land in `org_settings` so the next administrator is offered them too.
- **FR-EMP-3** Reporting manager options come from the live directory, so someone hired a minute ago is immediately selectable.
- **FR-EMP-4** Adding an employee links the account when exactly one account in that organisation carries the address, and reports anything ambiguous for a human (`linkAccountForEmployee`).
- **FR-EMP-5** The profile carries optional personal fields (gender, blood group, marital status) that render as missing rather than guessed.

### 4.3 Attendance and My Attendance (`src/pages/attendance/`, `src/pages/my-attendance/`)

- **FR-ATT-1** Statuses: Present, Absent, Half Day, On Leave, Holiday, Weekend, Work From Home.
- **FR-ATT-2** Check-in and check-out record an exact instant (`checkInAt`, `checkOutAt`) alongside the `HH:mm` display value, so worked hours are measured rather than inferred from two rounded strings.
- **FR-ATT-3** A six-day week. Each employee holds one week-off from Sunday, Monday or Tuesday (`WeekOffDay`), and Saturday is a working day for everyone.
- **FR-ATT-4** A record falling on the employee's own week-off is never flagged for regularization.
- **FR-ATT-5** Employees raise regularization requests; managers and administrators approve them from Approvals.

### 4.4 Leave (`src/pages/leave/`)

- **FR-LV-1** Seven leave types, each governed by a policy the organisation configures: annual quota, monthly or annual accrual, carry-forward, encashment, half-day, minimum tenure, applicability.
- **FR-LV-2** Monthly accrual is bounded by the financial year (`src/lib/financialYear.ts`), which resets on 1 April.
- **FR-LV-3** Entitlements derive from approved requests, and the balance counts pending days as committed. An employee cannot apply for days they have already asked for.
- **FR-LV-4** Approve and reject write back to the same store the balances read, so a decision on one page changes the figure on every other.
- **FR-LV-5** A who's-off calendar and the organisation's holiday list.

### 4.5 Payroll and Finance (`src/pages/payroll/`, `src/pages/finance/`)

Payroll is the administrator's view. Finance is the same page rendered for an
employee, showing their own pay. Admin is excluded from Finance by design
(`MODULE_ROLE_EXCLUSIONS`) because it would be a second nav entry onto a page
they already have.

- **FR-PAY-1** Gross earnings are CTC ÷ 12. Net is gross minus unpaid absence. Neither depends on the salary split.
- **FR-PAY-2** The split into Basic, HRA, Medical Allowance, Conveyance Allowance and Special Allowance is per-organisation configuration. There is no platform default: an organisation that has not configured one sees "not set" rather than a plausible-looking guess.
- **FR-PAY-3** Special Allowance is the remainder, never configured, so components always sum to the monthly gross including rounding.
- **FR-PAY-4** `splitMonthlyGross` is the single definition of the arithmetic, used by both the payslip and the Settings preview.
- **FR-PAY-5** An administrator uploads the issued PDF payslips (`payslip_documents`), one per employee per month, keyed so a re-upload corrects rather than duplicates. The uploaded PDF outranks the computed statement on the employee's Finance page.
- **FR-PAY-6** Bulk upload matches files to people by the employee code in the filename and shows the match list before writing. Files matching nobody are listed, never dropped.
- **FR-PAY-7** Payslip bytes are stored base64 in the document, capped at 720 KB, because no Cloud Storage bucket is provisioned and Storage rules cannot read Firestore to check a role. The migration path is recorded in `src/lib/handbookStorage.ts`.

### 4.6 Recruitment (`src/pages/recruitment/`)

Job openings, a candidate Kanban pipeline, hiring funnel analytics, and a
post-a-job flow.

### 4.7 Onboarding (`src/pages/onboarding/`)

- **FR-ONB-1** `standardTaskTemplate` is cloned per hire; HR and Admin start a record from the page.
- **FR-ONB-2** "Onboarding In Progress" counts every record under 100%, including a new hire on day one.
- **FR-ONB-3** Employees already tracked are absent from the picker, so one person's progress cannot split across two checklists.

### 4.8 Performance (`src/pages/performance/`)

Goals and OKRs, review cycles, rating distribution, goal-status insight. A
separate Tasks module was built and then removed on 6 August 2026 for
overlapping this one; goals carry the assignment capability.

### 4.9 Expenses, Assets, Helpdesk

- **FR-EXP-1** Claims by status and category, with approve/reject and a new-claim flow. Employees hold `full` on their own claims.
- **FR-AST-1** Asset inventory with assign and reassign, category breakdown, value tracking.
- **FR-HD-1** Tickets with priority, a status workflow and a detail thread. Employees raise and read their own.

### 4.10 Documents (`src/pages/documents/`)

Two distinct things live here.

- **FR-DOC-1** The **employee handbook** is company policy, versioned in `handbook_versions`. Every role can read it; publishing is HR and Admin. The Documents permission row is pinned in full because `firestore.rules` decides, and the matrix must not promise what the server refuses.
- **FR-DOC-2** **Employee documents** (`employee_documents`) hold metadata only: a name, a type, a status. Never the file.
- **FR-DOC-3** Primary documents (Aadhaar, PAN, bank details) are filed by the employee or by HR. Secondary documents, being the organisation's paperwork, are filed by an administrator or HR.
- **FR-DOC-4** Which kind a document is follows from its name matched exactly, never from a stored field, because a category field would be a claim the writer makes about their own write.
- **FR-DOC-5** A filed document always arrives `Pending`, including a re-file. Verification is `isAdmin()` and may not change the name or the employee.

### 4.11 Reports (`src/pages/reports/`)

Nine charts: headcount growth, notice-period share, headcount by department,
gender diversity, tenure distribution, employment type split, hiring funnel,
attendance rate, monthly salary cost by department, plus a report library. Every
figure derives from live data; the hardcoded KPIs this page once shipped were
removed.

### 4.12 Settings (`src/pages/settings/`)

Eleven tabs: Company Profile, Departments, Locations, Leave Policies, Salary
Structure, Roles & Permissions, Holidays, Notifications, Integrations, Billing,
Database.

- **FR-SET-1** Every one of these writes to `org_settings`, one document per setting per organisation, keyed `<orgKey>__<setting>`. A configuration surface held in a bare localStorage key is invisible to the organisation's other administrators.
- **FR-SET-2** Departments and locations are organisation data, renamable and withdrawable. Renaming a location moves everyone posted there. Withdrawing one is blocked while anyone is still there.
- **FR-SET-3** A location that exists only because somebody's record names it gets no edit buttons. There is no declaration to edit, and it stops being offered when the last person moves.
- **FR-SET-4** Roles & Permissions edits the matrix. Storing it server-side does not make it an authorization boundary; `firestore.rules` still decides.
- **FR-SET-5** Integrations lists Slack, Google Workspace, Razorpay, Zoho, BambooHR and GitHub as connection preferences. No integration transfers data yet.

### 4.13 Admin and Organizations (`src/pages/admin/`, `src/pages/organizations/`)

- **FR-ADM-1** Create account stamps the inviter's `orgId` at creation, links the new account to its employee record where exactly one in that org carries the address, and never grants `admin`.
- **FR-ADM-2** The Admin dashboard changes a role but never an `orgId`.
- **FR-ORG-1** Super admins create organisations. The first account of a new organisation is provisioned as `hr`, not `admin`.
- **FR-ORG-2** "Set HR admin" attaches an existing account to an organisation, writing `role` and `orgId` together. This is the only path that changes an `orgId`.
- **FR-ORG-3** "Review admin roles" converts legacy platform admins from organisations created before that rule, as a two-stage dry-run then confirm, skipping super admins and `ADMIN_EMAILS`.

---

## 5. Cross-cutting requirements

### 5.1 Tenant isolation

Full specification: [tenant-isolation-spec.md](tenant-isolation-spec.md).

| Plane | Tenant key | Enforced by |
|---|---|---|
| Identity | `users/{uid}.orgId` | `firestore.rules` |
| Data | `orgId` field on each of 18 tenant collections | `inMyOrg()` / `writingToMyOrg()` |
| Access mapping | `employee_links/{uid}`, `managerChainIds[]` | `firestore.rules` |
| Config | `orgId` plus the `<orgKey>__<setting>` document id | `org_settings` rules |
| Local | localStorage suffix `::org:<id>` | browser-local, **not** a server boundary |
| Control | seed, purge, backfill, deploy | operational procedure, §4 of the spec |

- **NFR-ISO-1** Every tenant document carries `orgId`, and every query filters on it. A list is evaluated against each document it returns and fails whole if one belongs to another tenant, so an unfiltered read is denied rather than merely wasteful.
- **NFR-ISO-2** An account with no `orgId` is unassigned, not default. `myOrgKey()` resolves it to a sentinel matching nothing. A *document* with no `orgId` still reads as the default org, because that is legacy data and a different thing from a stranger.
- **NFR-ISO-3** The identity backfill must run before that rule reaches an organisation, or its accounts lock out.
- **NFR-ISO-4** A rule that reads `resource.data` denies a `get` on a document that does not exist. Collections the app subscribes to before anything is written must test the document id instead.

### 5.2 Authentication

Firebase email and password. There is no self-registration: an account created
that way carried no `orgId`, and "no orgId" once resolved to the default
organisation, so anyone who signed up read the incumbent tenant's data. That
path is closed. Administrators create accounts, and the rules require the org
stamp so an administrator cannot create an account belonging to nobody either.

### 5.3 Persistence and consistency

- **NFR-PER-1** Anything a user can change goes through `persistentCollection`, an org-scoped localStorage store with a change event.
- **NFR-PER-2** Read through the store's getter everywhere, never the exported seed array. Seeding `useState` straight from a `src/data/*.ts` array loses every edit on refresh.
- **NFR-PER-3** Components that stay mounted while data changes elsewhere subscribe via the revision hooks.
- **NFR-PER-4** "Now" comes from `src/lib/today.ts`. No date literal, and no `toISOString()` for a calendar date.

### 5.4 Data sources

Four, and conflating them causes real bugs:

1. Seed data in `src/data/*.ts`, static, powering most feature pages.
2. The employee directory, a mutable localStorage overlay that dispatches `modcon-hr-directory-changed`.
3. Live Firestore through `src/lib/db.ts` and the `use*()` hooks, used mainly by the Admin dashboard.
4. Organisation configuration in `org_settings`, Firestore-backed with localStorage as its cache.

`useEmployees()` and `@/data/employees` are two different employee sources.
Pick deliberately.

### 5.5 Firestore collections

27 collection rules are declared: `users`, `role_assignments`,
`employee_links`, `organizations`, `employees`, `employee_compensation`,
`attendance`, `leave_requests`, `leave_balances`, `payslips`, `payroll_runs`,
`jobs`, `candidates`, `onboarding`, `goals`, `performance_reviews`, `expenses`,
`assets`, `billing_preferences`, `billing_invoices`, `helpdesk_tickets`,
`regularizations`, `org_settings`, `handbook_versions`, `payslip_documents`,
`employee_documents`, `handbook`. A catch-all denies everything else.

Compensation lives in its own `employee_compensation` collection rather than on
the broadly-readable `employees` document, so pointing this app at real
employees does not put salary in the directory.

---

## 6. Non-functional requirements

| Area | Requirement |
|---|---|
| **Stack** | React 18, TypeScript strict, Vite 5, Tailwind 3, React Router 6, Recharts, Firebase 12 |
| **Type safety** | `tsc -b` inside `npm run build` is the CI gate. ESLint is declared but not configured, so `npm run lint` fails; correctness rests on the compiler |
| **Loading** | Every page is `React.lazy` under one `<Suspense>`, with the tree wrapped in `ErrorBoundary` |
| **Design system** | Semantic Tailwind palette (`ink-*`, `brand-*`), `.card` / `.input` / `.btn`, primitives in `src/components/ui/`, `statusTone(status)` for domain status colours |
| **Types** | All shared domain types in `src/types/index.ts` |
| **Hosting** | Vercel Git integration. Pushes to `main` promote to production; PRs get preview URLs. Firebase is backend and database only, never the host |
| **Rules deploy** | Separate, through `npm run rules:deploy`. If a change needs both, rules ship first or privileged users hit permission-denied against the new UI |
| **Rules verification** | `npm run rules:verify` fetches the deployed ruleset and compares it byte for byte with `firestore.rules`, reading no documents and spending no quota |

### Testing

- **NFR-TEST-1** Tests run against emulators. No test run points at the live project. A live matrix run on 3 August 2026 exhausted the daily Firestore quota, after which the app itself stopped saving for the rest of the day and four fake leave policies sat in the organisation's real configuration, un-removable because removing them needed the quota the run had spent.
- **NFR-TEST-2** Reaching the live project means typing `E2E_LIVE_FIRESTORE=true` by hand. There is deliberately no npm script for it.
- **NFR-TEST-3** Security rules are tested separately from the app, in `tests/rules/` against the Firestore emulator. The E2E suite drives the UI and never exercises the rules, so a role or permission change needs a test in both places.
- **NFR-TEST-4** 21 E2E spec files across up to eight Playwright projects: `app`, `app-firefox`, `app-webkit`, `role-employee`, `role-manager`, `role-admin`, plus `org-settings` and `org-isolation` when the emulator flag is set. App specs run on all three engines. Role specs stay on Chromium, because running access-control logic three times tests the engine, not the app.
- **NFR-TEST-5** `org-settings` and `org-isolation` run in their own single-engine projects with a dependency edge between them, because both write the organisation's shared configuration and concurrent runs contradict each other.
- **NFR-TEST-6** Anything that fakes "today" belongs in `tests/e2e/clock.ts`, anchored on the most recent Wednesday to Saturday, so specs do not fail every Monday on a seeded week-off.
- **NFR-TEST-7** CI runs the build and the rules tests on every PR and push to `main`. E2E is not in CI; adding it is now a runtime decision rather than a credentials one.

---

## 7. Known gaps

Stated as gaps, not as work items, since some are decided rather than open.

| Gap | Status |
|---|---|
| ESLint declared but not installed or configured | Open. `tsc -b` carries the load meanwhile |
| No Cloud Storage bucket; handbook and payslip bytes sit base64 in Firestore under a 720 KB cap | Deliberate. Storage rules cannot read Firestore to check a role. Migration path documented in `src/lib/handbookStorage.ts` |
| E2E absent from CI | Open. Needs browser install plus two emulators in the runner |
| Integrations are preferences only; nothing transfers data | Open, and visible to users as connection toggles |
| Department colour maps and the June 2026 seed dates | Decided. Not to be "fixed" |
| Four fake leave policies stranded in live org configuration from the 3 August run | Waiting on quota reset |
| Feature flag registry empty | Correct between rollouts. The mechanism exists for the next change that should not reach every tenant at once |

---

## 8. Success criteria for the next release

1. `npm run build` passes with no TypeScript errors.
2. `npm run test:rules` passes in full against the emulator.
3. `npm run test:e2e` passes against the emulators, and `npm run test:e2e:emulator` covers the org-settings and org-isolation projects.
4. `npm run rules:verify` reports the deployed ruleset matches `firestore.rules` byte for byte.
5. A second browser context, signed in as a different organisation, reads none of the first organisation's data.
6. Any figure shown twice in the UI shows the same number in both places after a reload.

---

## 9. References

- [tenant-isolation-spec.md](tenant-isolation-spec.md) — isolation invariants and conformance rules for new collections, queries and operations
- [multi-tenancy-spec.md](multi-tenancy-spec.md) — the `orgId` convention and write-split rationale
- [salary-leave-access-spec.md](salary-leave-access-spec.md) — who may read compensation and leave
- [document-management-spec.md](document-management-spec.md) — handbook and employee document model
- [../CLAUDE.md](../CLAUDE.md) — architectural constraints that bind every change
