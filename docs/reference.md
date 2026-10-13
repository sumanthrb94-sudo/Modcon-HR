# ModCon HR — reference

Lookup tables. Behaviour is explained in the [user guide](user-guide.md) and [HR & admin guide](hr-admin-guide.md); how it is built is in the [developer guide](developer-guide.md).

## Roles and permissions

Four display roles (`resolveAppRole` in `src/lib/accessControl.ts`): **Admin**, **HR Manager**, **Manager**, **Employee**. Stored on the account as `admin | manager | employee` (an organisation's first account is stored as `hr`); a **Super Admin** is a platform account that belongs to no organisation.

An HR Manager holds the same module access as Admin; the difference is reach — an HR Manager is confined to their own organisation and can never create organisations or grant the Admin role.

Default permission matrix (`full` = act, `view` = read-only, `none` = hidden). Administrators can change configurable cells in Settings → Roles & Permissions; cells marked † are fixed.

| Module | Admin | HR Manager | Manager | Employee |
| --- | --- | --- | --- | --- |
| Dashboard | full | full | view | view |
| Employee Directory | full | full | view | view † |
| Attendance | full | full | full | none |
| My Attendance | full | full | full | full |
| Leave Management | full | full | full | full |
| Finance (own payslips) | n/a † | view | full † | full |
| Payroll | full | full | none | none |
| Recruitment | full | full | view | none |
| Onboarding | full | full | view | none |
| Performance | full | full | full | none |
| Expenses | full | full | view | full |
| Assets | full | full | view | none |
| Helpdesk | full | full | view | full |
| Reports & Analytics | full † | full † | none † | none † |
| Documents | full † | full † | view † | view † |
| Settings | full | full | none | none |
| Admin | full † | full | none | none |

Not in the matrix, deliberately: **The Board** (everyone) and **Support** (HR and Admin, and the Super Admin as an inbox) — a noticeboard or a line to the platform that a matrix can switch off is one nobody uses.

### Who may act on what

| Action | Who |
| --- | --- |
| Decide leave and expense claims | The requester's reporting line (manager and above), **or** HR/Admin organisation-wide. Never your own |
| Decide a regularization | Reporting line for app-flagged entries; **HR/Admin when the request changes the day** |
| Write somebody else's attendance day (Mark Attendance) | HR/Admin only |
| File a primary document (Aadhaar, PAN, bank details) | The employee, or HR |
| File a secondary document | HR or Admin |
| Verify a document or bank details | HR or Admin |
| Replace a *verified* primary document / bank details | HR or Admin — not the employee |
| Read payslips, salary, bank details of one employee | That employee, and HR/Admin |
| Reports & Analytics | HR/Admin, organisation-wide |
| Audit log | Super Admin (everything); Admin for their own organisation (not HR) |
| Create an account | HR/Admin, into their own organisation; never with the Admin role |
| Create an organisation, set trial/payment | Super Admin only |

## Routes

Public (no sign-in): `/`, `/landing`, `/india-first`, `/privacy`, `/terms`, `/payroll-boundaries`, `/careers`, `/careers/:orgKey`, `/careers/:orgKey/:jobId`, `/login`.

Signed in:

| Path | Page | Guard |
| --- | --- | --- |
| `/dashboard` | Today / Inbox (employee view; admin view for platform admins) | any |
| `/employees`, `/employees/:id` | People & Documents, profile | Employee Directory |
| `/attendance` | Attendance (team) | Attendance |
| `/my-attendance` | My Attendance | My Attendance |
| `/leave` | Leave | Leave Management |
| `/finance` | Finance & Payslips | Finance |
| `/payroll` | Payroll Readiness | Payroll |
| `/approvals`, `/dashboard/pending-approvals` | Approvals hub | Manager and above |
| `/dashboard/pending-approvals/{leave-requests, expense-claims, regularizations, onboarding-tasks}` | The queues | Manager and above |
| `/documents` | Handbook | Documents |
| `/board` | The Board | any, inside an organisation |
| `/recruitment`, `/onboarding`, `/performance`, `/expenses`, `/assets`, `/helpdesk`, `/reports` | the module of that name | its module |
| `/settings` (`?tab=…`) | Settings | Settings |
| `/admin` | Admin dashboard | HR/Admin |
| `/support` | Support | HR/Admin |
| `/organizations` | Organizations console | Super Admin |
| `/dashboard/{announcements, celebrations, kpi-graphs, holiday-calendar, recent-activity}` | Dashboard sub-pages | Dashboard (KPI graphs: Reports) |

Settings tab ids (`/settings?tab=<id>`): `company`, `departments`, `locations`, `leave`, `salary`, `statutory`, `shifts`, `weekoff`, `geofence`, `checkins`, `roles`, `holidays`, `notifications`, `integrations`, `billing`, `database`.

## Firestore collections

Every tenant document carries `orgId`, and **every query filters on it**.

### Records the app writes directly

| Collection | Holds | Read | Write |
| --- | --- | --- | --- |
| `users/{uid}` | Account profile and role | self; admins of the org | self (bounded); admins |
| `role_assignments/{email}` | A role granted before an account exists | admins | org admins (never `admin`) |
| `employee_links/{uid}` | Which employee record an account *is* | self; admins | admins only |
| `organizations/{orgId}` | Organisation + subscription | its own tenants | Super Admin |
| `subscription_requests` | A tenant asking to continue | Super Admin | org admin creates (status `open`) |
| `org_records/{org}__{store}__{id}` | All shared mutable records (see below) | by store: org, or reporting line via `readableBy` | by store |
| `org_settings/{org}__{setting}` | Organisation configuration (see below) | org | org admins |
| `employee_documents/{org}__{emp}__{slug}` | Document metadata (name, type, status) | org | by kind; verify HR/Admin |
| `employee_bank_details/{org}__{emp}` | Salary bank account | the employee; HR/Admin | employee (Pending); HR/Admin (review) |
| `payslip_documents/{org}__{emp}__{YYYY-MM}` | Uploaded payslip PDFs (base64) | the employee; HR/Admin | HR/Admin |
| `handbook_versions`, `handbook/{org}` | Handbook versions and the current pointer | org | org admins |
| `org_posts` (+ `comments`) | The Board | org | author; reactions only as yourself |
| `attendance_stamps` | Geofence evidence, immutable to its author | the employee; HR/Admin | the employee (create); HR/Admin (review field) |
| `attendance_geofences/{org}` | Structured projection of the fence, read only by rules | rules only | HR/Admin |
| `jobs`, `job_applications` | Published openings; applications | `jobs`: public if Open; applications: managers | HR/Admin; applications: public create |
| `support_threads` (+ `messages`) | HR ↔ platform chat | its org and Super Admin | append-only, signed by side |
| `audit_logs` | Audit trail | Super Admin; Admin of the org | signed-in |
| `demo_requests` | Landing-page demo bookings | platform | public create |

The typed layer in `src/lib/db.ts` also declares collections the Admin dashboard reads (`employees`, `employee_compensation`, `attendance`, `leave_requests`, `leave_balances`, `payslips`, `payroll_runs`, `candidates`, `onboarding`, `goals`, `performance_reviews`, `expenses`, `assets`, `helpdesk_tickets`, `regularizations`, `billing_*`). Most feature pages use `org_records` instead — see [shared-records-spec](shared-records-spec.md).

### `org_records` stores

`employees` (the directory), `leaveRequests`, `expenseClaims`, `attendanceRecords`, `regularizationOverrides`, `tickets` (helpdesk), `assets`, `onboarding`, `payrollRuns`, `payslips`. A record is a JSON string in `data`; `employeeId`, `status` and (for narrowed stores) `readableBy` are lifted to top level so rules can use them. Firestore holds only what differs from the seed, plus tombstones.

Each store has a **read scope** (`persistentCollection`'s last argument): `org` (everyone in the organisation — the default), `orgAdmin` (HR/Admin only — `payrollRuns`) or `self` (the subject and the people above them in the reporting line, stamped as `readableBy` on save — `expenseClaims`, `regularizationOverrides`, `payslips`). Adding a store means choosing one deliberately; do not widen the generic rule.

### `org_settings` keys

`leavePolicies`, `employeeLeavePolicies`, `companyProfile`, `holidays`, `customDepartments`, `removedDepartments`, `customLocations`, `salaryStructure`, `employeeSalaryStructures`, `shifts`, `employeeShifts`, `employeeShiftOverrides`, `weekOff`, `integrations`, `notificationPreferences`, `accessControl`, `attendanceGeofence`, `geofenceExemptions`, `statutoryConfig`, `employeeTaxElections`. Each is mirrored into a `localStorage` key (`modcon.hr.<name>`) read synchronously by the data modules.

## Notifications

| Preference id | Governs |
| --- | --- |
| `n1` | Leave requests pending (approvers) |
| `n2` | Leave approved / rejected (the person who asked) |
| `n5` | Attendance regularizations (approvers) |
| `n8` | Onboarding tasks outstanding |
| `n13` | Expense claims need review (approvers) |
| `n14` | New company announcement |
| `n15` | Expense claim approved / rejected (the person who asked) |
| `n16` | Regularization approved / rejected (the person who asked) |

Approver counts come from `pendingApprovalsSummary`, so the bell, the Approvals card and the queue agree. Updates on your own requests come from `buildMyUpdates` (decisions in the last 30 days, derived from the records; only "read" state is stored, per device).

## Data worth knowing

- **Decision stamps**: leave, expense and regularization decisions carry `decidedAt` / `decidedByName`. Earlier decisions do not.
- **Financial year** runs April–March; leave accrual and Comp Off reset on 1 April.
- **Payslip id** `ps-<employeeId>-<YYYY-MM>`; payslip document id `<orgKey>__<employeeId>__<YYYY-MM>`.
- **Regularization id** `reg-<employeeId>-<date>` — one per employee per day.
- **Money**: trial price in paise; rupee figures formatted Indian-style (₹1,23,456); PDFs print "Rs.".

## Sandbox accounts

`super@modcon.test`, `hr@modcon.test` (emp-001), `manager@modcon.test` (emp-002), `employee@modcon.test` (emp-003). Password `Sandbox@123`. The seeded trial ends in four days on purpose so the countdown banner is visible.
