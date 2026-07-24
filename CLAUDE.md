# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ModCon HR is a modern HRMS single-page app (React + TypeScript + Vite + Tailwind), backed by Firebase (Auth + Firestore) and deployed to Firebase Hosting at `modcon-hr.web.app`.

## Commands

```bash
npm run dev        # Vite dev server → http://localhost:5173
npm run build      # tsc -b && vite build  (type-check is part of the build)
npm run preview    # serve the production build locally
npm run test:e2e   # Playwright E2E (playwright test)
```

- **Type checking is the CI gate, not lint.** `npm run lint` (`eslint .`) is defined but ESLint is **not configured or installed**, so it currently fails. Correctness is enforced by `tsc -b` inside `npm run build` — run the build to type-check.
- **Single E2E test / project:** `npx playwright test tests/e2e/smoke.spec.ts`, filter with `-g "test name"`, or one role with `--project=role-admin`. Point at the sandbox browser with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`. The suite builds + serves the production bundle and signs in through real Firebase Auth, so it needs network access to Firebase.
- **Deploy:** `npm run firebase:deploy` (hosting). Firestore rules deploy separately: `firebase deploy --only firestore:rules`. Pushes to `main` also auto-deploy hosting via `.github/workflows/firebase-hosting.yml` (needs the `FIREBASE_TOKEN` repo secret).

Path alias: `@/*` → `src/*` (configured in both `tsconfig.json` and `vite.config.ts`).

## Architecture

### Two independent data sources — do not conflate them

1. **Mock/seed data in `src/data/*.ts`** powers most feature pages (attendance, leave, payroll, etc.). It is static seed data, not Firestore.
2. **The employee directory is a mutable localStorage-backed overlay.** `getEmployeeDirectory()` (`src/data/employees.ts`) merges seed employees + locally-added employees minus locally-deleted IDs (both persisted in localStorage). `addEmployeeToDirectory` / `deleteEmployeeFromDirectory` mutate it and dispatch a `modcon-hr-directory-changed` window event; components (e.g. `Topbar`) listen and re-render. So `employees` / `getEmployee(id)` reflect live local edits, **not** the raw seed array.
3. **A separate live Firestore layer** (`src/lib/db.ts` typed collection refs + `src/lib/useFirestore.ts` real-time `use*()` hooks like `useEmployees`, `useExpenses`). This is currently used mainly by the **Admin dashboard**. `useEmployees()` (Firestore) and `@/data/employees` (mock directory) are two different employee sources — pick deliberately.

### Auth & roles (`src/lib/auth.tsx`)

- Firebase email/password auth. On each sign-in, upserts `users/{uid}` in Firestore with a `role`.
- Roles: `admin | manager | employee`. `ADMIN_EMAILS` are always admin, `MANAGER_EMAILS` always manager; otherwise the Firestore-stored role wins (admins change it from the Admin dashboard), defaulting to `employee`.
- `useAuth()` exposes `profile`, `isAdmin`, and `isManager` (**manager includes admin**). Prefer `isManager` for approval/team gating and `isAdmin` for admin-only.
- E2E test emails are granted elevated roles **only** when built with `VITE_ENABLE_E2E_ACCOUNTS=true`; production builds never trust them.

### Routing & access control (`src/App.tsx`)

- Every page is `React.lazy`-loaded under one `<Suspense>`, and the whole tree is wrapped in `ErrorBoundary`.
- Route guards: `RequireAuth`, `RequireManager` (`/approvals`, `/dashboard/pending-approvals/*`), `RequireAdmin` (`/admin`). Unauthorized users are redirected to `/`.
- The sidebar is data-driven from `src/lib/nav.ts` (`navItems` with `adminOnly` / `managerOnly` flags); `Sidebar` filters by role. **When adding a gated page, update both the route guard in `App.tsx` and the nav flag in `nav.ts`** or the two will disagree.

### Firebase & security rules

- `src/lib/firebase.ts` holds the public web config for project `modcon-hr` (safe to ship). Firestore uses long-polling only on localhost.
- `firestore.rules`: helpers `isSignedIn` / `isAdmin` / `isManager`. General pattern — read: any signed-in user; write: admins/managers per collection. Rules changes must be deployed separately (see Commands); pushing app code does not update them.

### UI & styling

- Tailwind with a custom semantic palette: `ink-*` (neutrals) and `brand-*` (primary), plus `.card` / `.input` / `.btn` component classes in `src/index.css`.
- Reusable primitives live in `src/components/ui/` (`Card`, `Table`, `Badge`, `Modal`, `StatCard`, `Select`, `Avatar`, …). `statusTone(status)` maps domain status strings to `Badge` tones — reuse it rather than hardcoding colors.
- All shared domain types are centralized in `src/types/index.ts`; feature modules import from there.

### Testing layout (`tests/e2e/`)

`playwright.config.ts` builds with `VITE_ENABLE_E2E_ACCOUNTS=true`, serves the production build, and runs four projects: `app` (`smoke` + `interactions` specs) and `role-employee` / `role-manager` / `role-admin` (each runs `roles.spec.ts` for its persona, in parallel). `global-setup.ts` provisions the Firebase Auth test accounts; personas/credentials are in `tests/e2e/config.ts` and overridable via `E2E_*` env vars.
