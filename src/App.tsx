import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Loader2 } from 'lucide-react';
import { EMPLOYEE_DIRECTORY_CHANGED_EVENT } from '@/data/employees';
import { canAccessModule, isModuleExcluded, resolveAppRole, type AppModule } from '@/lib/accessControl';
import { useAccessControlRevision } from '@/lib/useAccessControlRevision';
import { isSuperAdminInsideOrg } from '@/lib/orgScope';

import { Card } from '@/components/ui';

// Route-level code splitting: each feature module ships in its own chunk so the
// initial bundle stays small and heavy pages (charts, tables) load on demand.
const DashboardPage = lazy(() => import('@/pages/dashboard').then((m) => ({ default: m.DashboardPage })));
const EmployeesPage = lazy(() => import('@/pages/employees').then((m) => ({ default: m.EmployeesPage })));
const EmployeeDetailPage = lazy(() => import('@/pages/employees').then((m) => ({ default: m.EmployeeDetailPage })));
const AttendancePage = lazy(() => import('@/pages/attendance').then((m) => ({ default: m.AttendancePage })));
const MyAttendancePage = lazy(() => import('@/pages/my-attendance').then((m) => ({ default: m.MyAttendancePage })));
const FeedPage = lazy(() => import('@/pages/feed').then((m) => ({ default: m.FeedPage })));
const LeavePage = lazy(() => import('@/pages/leave').then((m) => ({ default: m.LeavePage })));
const FinancePage = lazy(() => import('@/pages/finance').then((m) => ({ default: m.FinancePage })));
const PayrollPage = lazy(() => import('@/pages/payroll').then((m) => ({ default: m.PayrollPage })));
const RecruitmentPage = lazy(() => import('@/pages/recruitment').then((m) => ({ default: m.RecruitmentPage })));
const OnboardingPage = lazy(() => import('@/pages/onboarding').then((m) => ({ default: m.OnboardingPage })));
const PerformancePage = lazy(() => import('@/pages/performance').then((m) => ({ default: m.PerformancePage })));
const ExpensesPage = lazy(() => import('@/pages/expenses').then((m) => ({ default: m.ExpensesPage })));
const AssetsPage = lazy(() => import('@/pages/assets').then((m) => ({ default: m.AssetsPage })));
const HelpdeskPage = lazy(() => import('@/pages/helpdesk').then((m) => ({ default: m.HelpdeskPage })));
const ReportsPage = lazy(() => import('@/pages/reports').then((m) => ({ default: m.ReportsPage })));
const DocumentsPage = lazy(() => import('@/pages/documents').then((m) => ({ default: m.DocumentsPage })));
const SettingsPage = lazy(() => import('@/pages/settings').then((m) => ({ default: m.SettingsPage })));
const AdminDashboardPage = lazy(() => import('@/pages/admin').then((m) => ({ default: m.AdminDashboardPage })));
const OrganizationsPage = lazy(() => import('@/pages/organizations').then((m) => ({ default: m.OrganizationsPage })));
const PendingApprovalsPage = lazy(() => import('@/pages/dashboard/PendingApprovalsPage').then((m) => ({ default: m.PendingApprovalsPage })));
const LeaveRequestsApprovalsPage = lazy(() => import('@/pages/dashboard/LeaveRequestsApprovalsPage').then((m) => ({ default: m.LeaveRequestsApprovalsPage })));
const ExpenseClaimsApprovalsPage = lazy(() => import('@/pages/dashboard/ExpenseClaimsApprovalsPage').then((m) => ({ default: m.ExpenseClaimsApprovalsPage })));
const RegularizationsApprovalsPage = lazy(() => import('@/pages/dashboard/RegularizationsApprovalsPage').then((m) => ({ default: m.RegularizationsApprovalsPage })));
const OnboardingTasksApprovalsPage = lazy(() => import('@/pages/dashboard/OnboardingTasksApprovalsPage').then((m) => ({ default: m.OnboardingTasksApprovalsPage })));
const AnnouncementsPage = lazy(() => import('@/pages/dashboard/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage })));
const CelebrationsPage = lazy(() => import('@/pages/dashboard/CelebrationsPage').then((m) => ({ default: m.CelebrationsPage })));
const KpiGraphsPage = lazy(() => import('@/pages/dashboard/KpiGraphsPage').then((m) => ({ default: m.KpiGraphsPage })));
const HolidayCalendarPage = lazy(() => import('@/pages/dashboard/HolidayCalendarPage').then((m) => ({ default: m.HolidayCalendarPage })));
const RecentActivityPage = lazy(() => import('@/pages/dashboard/RecentActivityPage').then((m) => ({ default: m.RecentActivityPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFound').then((m) => ({ default: m.NotFoundPage })));
const LoginPage = lazy(() => import('@/pages/login').then((m) => ({ default: m.LoginPage })));
// The public careers page. Its own chunk, and deliberately outside AppLayout:
// it is read by candidates who have no account here — see src/pages/careers.
const CareersPage = lazy(() => import('@/pages/careers').then((m) => ({ default: m.CareersPage })));
const CareersJobPage = lazy(() => import('@/pages/careers').then((m) => ({ default: m.CareersJobPage })));

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <Loader2 className="animate-spin text-brand-600" size={28} />
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
}

/**
 * An organisation's own administrators: platform Admins and HR Managers.
 * The Admin dashboard they share already filters its user list to the viewer's
 * `orgId`, so an HR Manager admits to their own company and no further.
 * Cross-organisation routes are guarded by RequireSuperAdmin instead.
 */
function RequireOrgAdmin({ children }: { children: JSX.Element }) {
  const { user, isAdmin, isHR, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <Loader2 className="animate-spin text-brand-600" size={28} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return isAdmin || isHR ? children : <Navigate to="/" replace />;
}

function RequireSuperAdmin({ children }: { children: JSX.Element }) {
  const { user, isSuperAdmin, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <Loader2 className="animate-spin text-brand-600" size={28} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return isSuperAdmin ? children : <Navigate to="/" replace />;
}

function RequireManager({ children }: { children: JSX.Element }) {
  const { user, isManager, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <Loader2 className="animate-spin text-brand-600" size={28} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  // Approvals are one company's queue — a super admin has to be in that
  // company before there is anything here to decide.
  return isManager ? <RequireOrgContext>{children}</RequireOrgContext> : <Navigate to="/" replace />;
}

/**
 * The modules that are the platform console rather than a company's HR system.
 *
 * Mirrors `platform` in lib/nav.ts, which hides the same items from the
 * sidebar — the two have to agree or a super admin is offered a link to a page
 * this guard then refuses them.
 */
const PLATFORM_MODULES: readonly AppModule[] = ['Admin'];

function PickAnOrganisationPage() {
  return (
    <div className="py-10">
      <Card>
        <div className="p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-ink-900">Which organization?</h1>
          <p className="mt-2 text-sm text-ink-500">
            This is a company&rsquo;s own HR system, and your account does not belong to a company —
            it administers the platform every company sits on. Open an organization from
            Organizations (or the picker in the top bar) and this page will show you theirs.
          </p>
          <Link to="/organizations" className="btn-primary mt-4 inline-flex">
            Go to Organizations
          </Link>
        </div>
      </Card>
    </div>
  );
}

/**
 * Keeps a super admin out of a tenant page until they say which tenant.
 *
 * A super admin has `role: 'admin'`, so every role guard in this file passed
 * and the whole HR system rendered — against whichever organisation their
 * browser happened to be namespaced to, which for a fresh account is the
 * default one. So an account that belongs to no company was shown one
 * company&rsquo;s attendance, leave and payroll as though it were its own.
 *
 * The remedy is a context rather than a permission: they may still open any
 * organisation, and once they do (Organizations → Manage this org) the same
 * pages render for that company. See isSuperAdminInsideOrg in lib/orgScope.
 */
function RequireOrgContext({ children }: { children: JSX.Element }) {
  const { isSuperAdmin } = useAuth();
  if (isSuperAdmin && !isSuperAdminInsideOrg()) return <PickAnOrganisationPage />;
  return children;
}

function AccessDeniedPage({ module, excluded }: { module: AppModule; excluded: boolean }) {
  return (
    <div className="py-10">
      <Card>
        <div className="p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-ink-900">
            {excluded ? 'Not available for your role' : 'Access Restricted'}
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            {excluded
              // Telling an admin to "contact an administrator" about a module
              // that is deliberately not theirs was misleading — this is not a
              // permission anybody can grant them.
              ? `${module} is not part of your role. It is not a permission that can be enabled in Settings.`
              : `You do not have permission to access ${module}. Contact an administrator to update Roles and Permissions.`}
          </p>
        </div>
      </Card>
    </div>
  );
}

function RequireModuleAccess({ module, children }: { module: AppModule; children: JSX.Element }) {
  const { profile, loading } = useAuth();
  useAccessControlRevision();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <Loader2 className="animate-spin text-brand-600" size={28} />
      </div>
    );
  }

  const role = resolveAppRole(profile);
  if (!canAccessModule(module, role)) {
    return <AccessDeniedPage module={module} excluded={isModuleExcluded(module, role)} />;
  }

  // Every module but the platform console's own is a tenant's, so a super
  // admin needs to have named the tenant first.
  if (PLATFORM_MODULES.includes(module)) return children;
  return <RequireOrgContext>{children}</RequireOrgContext>;
}

/**
 * Where signing in lands you.
 *
 * A tenant's dashboard for everybody who works at one; the platform console
 * for a super admin who has not opened a company, since a dashboard of
 * somebody else's headcount is not their home page. Once they open one, this
 * is that company's dashboard like anybody else's.
 */
function HomeRoute() {
  const { isSuperAdmin } = useAuth();
  if (isSuperAdmin && !isSuperAdminInsideOrg()) return <Navigate to="/organizations" replace />;
  return (
    <RequireModuleAccess module="Dashboard">
      <DashboardPage />
    </RequireModuleAccess>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route
        path="login"
        element={!loading && user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      {/* Public, and unlike /login not redirected away from when somebody is
          signed in: a careers page is a page anybody may read, including an
          employee looking at what their own company has advertised. Declared
          above the authenticated block so the catch-all inside it — which
          sends an unknown path to the sign-in screen — never claims these. */}
      <Route path="careers" element={<CareersPage />} />
      <Route path="careers/:orgKey" element={<CareersPage />} />
      <Route path="careers/:orgKey/:jobId" element={<CareersJobPage />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<HomeRoute />} />
        <Route path="employees" element={<RequireModuleAccess module="Employee Directory"><EmployeesPage /></RequireModuleAccess>} />
        <Route path="employees/:id" element={<RequireModuleAccess module="Employee Directory"><EmployeeDetailPage /></RequireModuleAccess>} />
        <Route path="attendance" element={<RequireModuleAccess module="Attendance"><AttendancePage /></RequireModuleAccess>} />
        <Route path="my-attendance" element={<RequireModuleAccess module="My Attendance"><MyAttendancePage /></RequireModuleAccess>} />
        {/* Deliberately ungated: an organisation-wide board the permission
            matrix can switch off for employees is a noticeboard nobody reads.
            It carries no personal record — only what people chose to post. */}
        <Route path="board" element={<RequireOrgContext><FeedPage /></RequireOrgContext>} />
        <Route path="leave" element={<RequireModuleAccess module="Leave Management"><LeavePage /></RequireModuleAccess>} />
        <Route path="finance" element={<RequireModuleAccess module="Finance"><FinancePage /></RequireModuleAccess>} />
        <Route path="payroll" element={<RequireModuleAccess module="Payroll"><PayrollPage /></RequireModuleAccess>} />
        <Route path="recruitment" element={<RequireModuleAccess module="Recruitment"><RecruitmentPage /></RequireModuleAccess>} />
        <Route path="onboarding" element={<RequireModuleAccess module="Onboarding"><OnboardingPage /></RequireModuleAccess>} />
        <Route path="performance" element={<RequireModuleAccess module="Performance"><PerformancePage /></RequireModuleAccess>} />
        <Route path="expenses" element={<RequireModuleAccess module="Expenses"><ExpensesPage /></RequireModuleAccess>} />
        <Route path="assets" element={<RequireModuleAccess module="Assets"><AssetsPage /></RequireModuleAccess>} />
        <Route path="helpdesk" element={<RequireModuleAccess module="Helpdesk"><HelpdeskPage /></RequireModuleAccess>} />
        <Route path="reports" element={<RequireModuleAccess module="Reports & Analytics"><ReportsPage /></RequireModuleAccess>} />
        {/* RequireAuth only — no role guard. The handbook is deliberately
            readable by every signed-in user; publishing is gated inside the
            page and, decisively, in firestore.rules. */}
        <Route path="documents" element={<RequireModuleAccess module="Documents"><DocumentsPage /></RequireModuleAccess>} />
        <Route path="settings" element={<RequireModuleAccess module="Settings"><SettingsPage /></RequireModuleAccess>} />
        {/* RequireOrgAdmin is outermost so a non-administrator is redirected
            away rather than shown the in-place "Access Restricted" card,
            keeping privileged routes consistent with /approvals. */}
        <Route path="admin" element={<RequireOrgAdmin><RequireModuleAccess module="Admin"><AdminDashboardPage /></RequireModuleAccess></RequireOrgAdmin>} />
        <Route path="organizations" element={<RequireSuperAdmin><OrganizationsPage /></RequireSuperAdmin>} />
        <Route path="approvals" element={<RequireManager><PendingApprovalsPage /></RequireManager>} />
        <Route path="dashboard/pending-approvals" element={<RequireManager><PendingApprovalsPage /></RequireManager>} />
        <Route path="dashboard/pending-approvals/leave-requests" element={<RequireManager><LeaveRequestsApprovalsPage /></RequireManager>} />
        <Route path="dashboard/pending-approvals/expense-claims" element={<RequireManager><ExpenseClaimsApprovalsPage /></RequireManager>} />
        <Route path="dashboard/pending-approvals/regularizations" element={<RequireManager><RegularizationsApprovalsPage /></RequireManager>} />
        <Route path="dashboard/pending-approvals/onboarding-tasks" element={<RequireManager><OnboardingTasksApprovalsPage /></RequireManager>} />
        {/* These five expand a card on the dashboard, and alone among the
            routes in this file they carried no guard at all — not a role
            check, not a module check. Announcements and the holiday calendar
            are company-wide by nature and stay readable by anyone holding the
            Dashboard module; the other two name people, and are scoped
            internally by lib/dataScope.ts as well. KPI graphs are
            organisation-wide analytics — headcount, notice-period rate,
            average tenure — so they belong to Reports & Analytics, which an
            Employee does not hold. */}
        <Route path="dashboard/announcements" element={<RequireModuleAccess module="Dashboard"><AnnouncementsPage /></RequireModuleAccess>} />
        <Route path="dashboard/celebrations" element={<RequireModuleAccess module="Dashboard"><CelebrationsPage /></RequireModuleAccess>} />
        <Route path="dashboard/kpi-graphs" element={<RequireModuleAccess module="Reports & Analytics"><KpiGraphsPage /></RequireModuleAccess>} />
        <Route path="dashboard/holiday-calendar" element={<RequireModuleAccess module="Dashboard"><HolidayCalendarPage /></RequireModuleAccess>} />
        <Route path="dashboard/recent-activity" element={<RequireModuleAccess module="Dashboard"><RecentActivityPage /></RequireModuleAccess>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </Suspense>
  );
}

export default function App() {
  const [, setDirectoryRevision] = useState(0);

  useEffect(() => {
    const bumpRevision = () => setDirectoryRevision((prev) => prev + 1);
    window.addEventListener(EMPLOYEE_DIRECTORY_CHANGED_EVENT, bumpRevision);
    return () => {
      window.removeEventListener(EMPLOYEE_DIRECTORY_CHANGED_EVENT, bumpRevision);
    };
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
