# ModCon HR — Modern HR Platform

A modern, full-featured **HRMS (Human Resource Management System)** built as an
investor-ready product demo. ModCon HR covers the complete employee lifecycle —
from hire to retire — in a single, polished web application.

> **Access:** the app is protected by Firebase email/password authentication.
> Sign up (or sign in) with a work email to explore every module. Accounts in
> the admin allow-list (`src/lib/auth.tsx`) get the admin dashboard; everyone
> else signs in as an employee. Module data is realistic mock data generated
> in-app; live Firestore backs the admin views and seeding.

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
browser (Playwright), signing in through Firebase Auth and walking every
module plus key interactions (modals, 404, sign-out). A dedicated test account
is provisioned automatically. Override credentials or the browser binary via
`E2E_EMAIL` / `E2E_PASSWORD` / `PW_CHROMIUM_PATH`. When run behind an
HTTPS-intercepting proxy the browser is configured automatically (TLS 1.2,
proxy tunnelling) so Firebase calls succeed.

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
