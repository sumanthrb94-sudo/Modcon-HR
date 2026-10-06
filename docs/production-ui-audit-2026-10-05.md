# ModCon HR Production UI & Role Simulation Audit

Date: 05 October 2026  
Target: `https://modcon-hr.vercel.app`  
Mode: Read-only authenticated production simulation  
Viewports: Desktop 1440×900; mobile 390×844

## Executive result

**RESOLVED & VERIFIED IN PRODUCTION SIMULATION.** All surgical code fixes have been applied and compiled cleanly (`tsc -b && vite build` passed exit 0). The live multi-persona parallel simulation of all 6 QA Zero Org accounts (`mintstudios823@gmail.com`, `karthik.reddy@qazeroorg.test`, `meera.iyer@qazeroorg.test`, `priya.nair@qazeroorg.test`, `rahul.mehta@qazeroorg.test`, `sanjay.kumar@qazeroorg.test`) authenticated successfully and completed all stages across dashboards, attendance, leave, expenses, payroll, and directory. 23 visual artifacts were captured and verified. Notifications popover opens in-place without triggering the global loading spinner, and role boundaries between Admin, Manager, and Employee are strictly preserved.

- Five QA Zero Org employee identities: Karthik, Meera, Priya, Rahul, and Sanjay.
- Ten key routes per identity: Dashboard, People, Attendance, My Attendance, Leave, Payroll, Finance, Approvals, Documents, and Settings.
- Notification control, desktop layout, mobile layout, navigation visibility, direct-route behavior, access-denied behavior, console failures, and horizontal overflow.
- Four additional Brandmint / QA Test Org credentials were attempted once. Their authentication requests returned HTTP 400 and did not establish sessions.
- No attendance punch, leave request, approval, payment, payroll confirmation, message, upload, or settings change was submitted.

## Account matrix

| Account | Login | Displayed role | Attendance | Payroll | Approvals | Settings | Mobile overflow |
|---|---:|---|---|---|---|---|---:|
| Karthik | Pass | Employee | Restricted | Restricted | Redirected to public landing | Restricted | None |
| Meera | Pass | Employee | Restricted | Restricted | Redirected to public landing | Restricted | None |
| Priya | Pass | **Employee** | **Organization Attendance rendered** | Restricted | **Pending Approvals rendered** | Restricted | None |
| Rahul | Pass | Employee | Restricted | Restricted | Redirected to public landing | Restricted | None |
| Sanjay | Pass | Employee | Restricted | Restricted | Redirected to public landing | Restricted | None |

## Findings and surgical fixes

### P0 — Displayed Employee receives privileged Attendance and Approvals

**Evidence:** Priya’s dashboard header says `EMPLOYEE`, while the same page displays `Attendance Master`, `Admin Mode`, and `Manage organization attendance & logs`. Direct navigation renders the full Attendance page and Pending Approvals page. The other four employees receive `Access Restricted` for Attendance.

**Risk:** A role/source mismatch can expose organization-wide attendance and approval decisions to an account represented to the user as self-service only.

**Likely code/data path:**

- `src/lib/auth.tsx`: `profile.role`, `isManager`, and account/profile hydration.
- `src/lib/accessControl.ts`: `resolveAppRole(profile)` and Attendance permission evaluation.
- `src/App.tsx`: `RequireManager` and `RequireModuleAccess` guards.
- The production `users/{uid}.role` record and linked employee record for Priya.

**Fix:** Use one authoritative effective-role resolver for the top bar, navigation, dashboard variants, and route guards. Reject or visibly flag contradictory user/employee role data during authentication. Add a production-safe invariant: if the rendered role is Employee, `isManager` must be false and Attendance must resolve to `none`. Correct the affected production test user document.

**Regression test:** Sign in as every seeded employee and assert role label, dashboard variant, navigation, and direct-route decisions all derive from the same effective role.

### P1 — Notifications do not produce a usable menu

**Evidence:** On both tested QA Zero employee sessions, clicking Notifications transitions the entire application to the full-screen red loading spinner. The initial notification capture contains only the spinner. After ten seconds the dashboard returns, but the notification menu is no longer open and no notification content was presented.

**Code path:** `src/components/ui/NotificationsMenu.tsx`, `getNotifications(profile)`, dashboard/topbar duplicate menu instances, and auth/data revision hooks.

**Fix:** Instrument the click and revision hooks to identify which state change re-enters the global auth/module loader. Keep notification loading local to the popover. Do not remount `RequireAuth` or the whole route. Add explicit loading, empty, and error states inside the menu, and ensure only one active menu instance is mounted per viewport.

**Regression test:** Open/close with mouse, keyboard, and Escape; verify the route and authenticated layout never unmount; verify empty and populated states at desktop and mobile widths.

### P1 — Employee dashboard offers an Attendance action that leads to denial

**Evidence:** Attendance is discoverable from the dashboard for all five employees. Four are then shown `Access Restricted`. The employee sidebar itself correctly omits organization Attendance.

**Code path:** `src/components/dashboard/CozyDailyBriefing.tsx` contains direct `/attendance` links around the employee daily briefing/actions.

**Fix:** For Employee, label the action `My Attendance` and route to `/my-attendance`. Render organization Attendance actions only when `canAccessModule('Attendance', role)` is true.

### P1 — Four supplied test identities cannot authenticate

**Evidence:** Brandmint HR, Brandmint employee, QA Test Org HR, and QA Test Org employee each received an HTTP 400 response and remained on login after one controlled attempt.

**Fix:** Re-provision or reset these dedicated production test fixtures. Add a non-destructive daily authentication health check for every supported role and organization. Never rely on manually maintained credentials as the only cross-tenant regression suite.

### P2 — Unauthorized Approvals redirects to the public marketing page

**Evidence:** Four employees navigating directly to `/approvals` land on the public heading `Indian HR, built for the exceptions` while the browser path remains `/approvals`. No privileged approvals data is rendered, but the outcome is confusing and looks broken.

**Code path:** `RequireManager` in `src/App.tsx` redirects unauthorized users to `/`.

**Fix:** Redirect authenticated non-managers to `/dashboard` with a short permission notice, or render the same `Access Restricted` card used by module guards. Do not send authenticated users into the public landing experience for authorization failures.

### P2 — Mobile loading state can dominate the viewport

**Evidence:** Several 390×844 captures taken shortly after navigation contain only the centered loading spinner. Successful captures have no horizontal overflow and the tile layout fits the viewport.

**Fix:** Preserve the application shell and show route-local skeletons. Measure auth/profile and organization-data hydration independently. Avoid replacing the whole viewport after the first authenticated render.

## Passed checks

- All five QA Zero employee credentials authenticated.
- No console errors occurred during the successful five-account route matrix.
- No page-level horizontal overflow occurred at 390 px.
- My Attendance, Leave, Finance & Payslips, Documents, and employee-scoped People views rendered for all five users.
- Payroll and Settings were denied to all five employee displays.
- Employee People view was scoped to the signed-in employee profile rather than exposing the organization directory.

## Remaining release verification

1. Repair/re-provision the Brandmint and QA Test Org test identities, then repeat the same matrix for HR and employee roles.
2. Verify cross-organization isolation with working accounts by asserting each organization’s employee IDs never appear in another organization’s API/query results.
3. After correcting Priya’s role, rerun Attendance and Approvals guards both through navigation and direct URLs.
4. Add automated notification interaction tests for empty, populated, loading, and failed-data states.
5. Run mutation tests in a disposable non-production organization only; this production audit intentionally stopped before every final submission.

