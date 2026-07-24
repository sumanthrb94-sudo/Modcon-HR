import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

// Route-level code splitting: each feature module ships in its own chunk so the
// initial bundle stays small and heavy pages (charts, tables) load on demand.
const DashboardPage = lazy(() => import('@/pages/dashboard').then((m) => ({ default: m.DashboardPage })));
const EmployeesPage = lazy(() => import('@/pages/employees').then((m) => ({ default: m.EmployeesPage })));
const EmployeeDetailPage = lazy(() => import('@/pages/employees').then((m) => ({ default: m.EmployeeDetailPage })));
const AttendancePage = lazy(() => import('@/pages/attendance').then((m) => ({ default: m.AttendancePage })));
const LeavePage = lazy(() => import('@/pages/leave').then((m) => ({ default: m.LeavePage })));
const PayrollPage = lazy(() => import('@/pages/payroll').then((m) => ({ default: m.PayrollPage })));
const RecruitmentPage = lazy(() => import('@/pages/recruitment').then((m) => ({ default: m.RecruitmentPage })));
const OnboardingPage = lazy(() => import('@/pages/onboarding').then((m) => ({ default: m.OnboardingPage })));
const PerformancePage = lazy(() => import('@/pages/performance').then((m) => ({ default: m.PerformancePage })));
const ExpensesPage = lazy(() => import('@/pages/expenses').then((m) => ({ default: m.ExpensesPage })));
const AssetsPage = lazy(() => import('@/pages/assets').then((m) => ({ default: m.AssetsPage })));
const HelpdeskPage = lazy(() => import('@/pages/helpdesk').then((m) => ({ default: m.HelpdeskPage })));
const ReportsPage = lazy(() => import('@/pages/reports').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('@/pages/settings').then((m) => ({ default: m.SettingsPage })));
const AdminDashboardPage = lazy(() => import('@/pages/admin').then((m) => ({ default: m.AdminDashboardPage })));
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

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <Loader2 className="animate-spin text-brand-600" size={28} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return isAdmin ? children : <Navigate to="/" replace />;
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
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employees/:id" element={<EmployeeDetailPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="recruitment" element={<RecruitmentPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="performance" element={<PerformancePage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="helpdesk" element={<HelpdeskPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin" element={<RequireAdmin><AdminDashboardPage /></RequireAdmin>} />
        <Route path="dashboard/pending-approvals" element={<PendingApprovalsPage />} />
        <Route path="dashboard/pending-approvals/leave-requests" element={<LeaveRequestsApprovalsPage />} />
        <Route path="dashboard/pending-approvals/expense-claims" element={<ExpenseClaimsApprovalsPage />} />
        <Route path="dashboard/pending-approvals/regularizations" element={<RegularizationsApprovalsPage />} />
        <Route path="dashboard/pending-approvals/onboarding-tasks" element={<OnboardingTasksApprovalsPage />} />
        <Route path="dashboard/announcements" element={<AnnouncementsPage />} />
        <Route path="dashboard/celebrations" element={<CelebrationsPage />} />
        <Route path="dashboard/kpi-graphs" element={<KpiGraphsPage />} />
        <Route path="dashboard/holiday-calendar" element={<HolidayCalendarPage />} />
        <Route path="dashboard/recent-activity" element={<RecentActivityPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </Suspense>
  );
}

export default function App() {
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
