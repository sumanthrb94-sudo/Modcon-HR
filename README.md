# ModCon HR — Modern HR Platform

A modern, full-featured **HRMS (Human Resource Management System)** built as an
investor-ready product demo. ModCon HR covers the complete employee lifecycle —
from hire to retire — in a single, polished web application.

> **Access & roles:** the app is protected by Firebase email/password
> authentication with three roles — **employee**, **manager**, and **admin**.
> Employees get the core modules; managers additionally get the **Approvals**
> workspace; admins get everything including the Admin dashboard. Roles come
> from the allow-lists in `src/lib/auth.tsx` (or are assigned by an admin), and
> per-module visibility is further governed by the permission matrix in
> `src/lib/accessControl.ts`.
>
> **Demo mode:** the app ships with realistic mock data generated in-app, plus a
> one-click "Employee Profile" demo login on the sign-in screen. Sign-in itself
> is a real, required step — it is not disabled. Live Firestore backs the admin
> views and seeding.

![Stack](https://img.shields.io/badge/React-18-61dafb) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6) ![Vite](https://img.shields.io/badge/Vite-5-646cff) ![Tailwind](https://img.shields.io/badge/Tailwind-3-38bdf8)

## ✨ Modules

| Module | Highlights |
| --- | --- |
| **Dashboard** | HR command-center: headcount growth, attendance trends, diversity, pending approvals, announcements, celebrations |
| **Employees** | Searchable directory with filters, grid/list views, rich profiles, and an interactive **org chart** |
| **Attendance** | Daily attendance, check-in/out, late tracking, weekly trends, regularization approvals |
| **Leave** | Requests with approve/reject, leave balances, who's-off calendar, holiday list, apply-leave flow |
| **Payroll** | Payroll runs, per-employee payslips with full earnings/deductions breakdown, salary cost by department |
| **Recruitment** | Job openings, a drag-style **candidate Kanban pipeline**, hiring funnel analytics, post-a-job flow |
| **Onboarding** | New-hire checklists grouped by category with live progress tracking |
| **Performance** | Goals & OKRs, review cycles, rating distribution and goal-status insights |
| **Expenses** | Expense claims by status, category breakdown, approve/reject and new-claim flows |
| **Assets** | Asset inventory with assign/reassign, category breakdown, value tracking |
| **Helpdesk** | Employee tickets with priorities, status workflow, and detail threads |
| **Reports** | Analytics hub: 9+ charts across headcount, attrition, DEI, payroll and hiring |
| **Settings** | Company profile, departments, leave policies, roles & permissions, integrations, billing |

## 🛠 Tech Stack

- **React 18** + **TypeScript** (strict)
- **Vite 5** build tooling
- **Tailwind CSS 3** with a custom ModCon design system
- **React Router 6** for navigation
- **Recharts** for data visualization
- **lucide-react** for iconography

## 🚀 Getting Started

```bash
npm install      # install dependencies
npm run dev      # start dev server → http://localhost:5173
npm run build    # type-check + production build
npm run preview  # preview the production build
npm run test:e2e # end-to-end tests (Playwright, drives the production build)
```

### End-to-end tests

`npm run test:e2e` builds/serves the app and drives it in a real Chromium
browser (Playwright), signing in through Firebase Auth. Coverage:

- **All modules** (Dashboard → Settings), employee detail, modals, 404,
  sign-out, and a zero-runtime-errors assertion across the walkthrough.
- **Per-role flows run in parallel** — separate Playwright projects for
  `role-employee`, `role-manager`, and `role-admin` assert role-appropriate
  navigation and access control (Approvals/Admin gating and route redirects).

Dedicated test accounts are provisioned automatically; the manager/admin
accounts are only privileged when the app is built with
`VITE_ENABLE_E2E_ACCOUNTS=true` (the test harness does this), so production
builds never trust them. Override credentials or the browser binary via
`E2E_EMAIL` / `E2E_MANAGER_EMAIL` / `E2E_ADMIN_EMAIL` / `E2E_PASSWORD` /
`PW_CHROMIUM_PATH`. Behind an HTTPS-intercepting proxy the browser is
configured automatically (TLS 1.2, proxy tunnelling) so Firebase calls
succeed.

## 🚢 Deployment

The app is hosted on **Vercel**. Firebase provides Auth and Firestore only —
it is not the host, and Firebase Hosting must not be used to serve the app.

### The app (Vercel)

Deployment is handled by Vercel's Git integration, not by a workflow in this
repo: connect the repository once in the Vercel dashboard and every push to
`main` builds and promotes to production, while pull requests get their own
preview URL. Build settings come from [`vercel.json`](vercel.json) — Vite
framework preset, `npm run build`, `dist/` output, an SPA rewrite so
client-side routes resolve, plus immutable caching on `/assets/*` and the
baseline security headers.

No environment variables are required. The Firebase web config in
`src/lib/firebase.ts` is public by design and ships in the bundle.

To deploy by hand from a checkout:

```bash
npx vercel --prod
```

### Firestore rules (Firebase)

Security rules are a database concern and still ship through the Firebase
CLI — independent of the host, and **always before** the app code that
depends on them:

```bash
npm run rules:deploy      # firebase deploy --only firestore:rules
```

## 🧱 Architecture

```
src/
├── components/
│   ├── ui/         # Reusable design-system primitives (Card, Table, Badge, Modal…)
│   └── layout/     # App shell: sidebar, topbar, layout
├── data/           # Mock datasets per module (employees is the source of truth)
├── lib/            # Utilities (formatting, navigation config)
├── pages/          # One folder per feature module
└── types/          # Shared domain model
```

Every module reads people data from a single master employee directory
(`src/data/employees.ts`), keeping cross-module references consistent.

---

© ModCon Technologies — product demo. Built to scale.
