import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

import { DashboardPage } from '@/pages/dashboard';
import { EmployeesPage, EmployeeDetailPage } from '@/pages/employees';
import { AttendancePage } from '@/pages/attendance';
import { LeavePage } from '@/pages/leave';
import { PayrollPage } from '@/pages/payroll';
import { RecruitmentPage } from '@/pages/recruitment';
import { OnboardingPage } from '@/pages/onboarding';
import { PerformancePage } from '@/pages/performance';
import { ExpensesPage } from '@/pages/expenses';
import { AssetsPage } from '@/pages/assets';
import { HelpdeskPage } from '@/pages/helpdesk';
import { ReportsPage } from '@/pages/reports';
import { SettingsPage } from '@/pages/settings';
import { AdminDashboardPage } from '@/pages/admin';
import { PendingApprovalsPage } from '@/pages/dashboard/PendingApprovalsPage';
import { LeaveRequestsApprovalsPage } from '@/pages/dashboard/LeaveRequestsApprovalsPage';
import { ExpenseClaimsApprovalsPage } from '@/pages/dashboard/ExpenseClaimsApprovalsPage';
import { RegularizationsApprovalsPage } from '@/pages/dashboard/RegularizationsApprovalsPage';
import { OnboardingTasksApprovalsPage } from '@/pages/dashboard/OnboardingTasksApprovalsPage';
import { AnnouncementsPage } from '@/pages/dashboard/AnnouncementsPage';
import { CelebrationsPage } from '@/pages/dashboard/CelebrationsPage';
import { KpiGraphsPage } from '@/pages/dashboard/KpiGraphsPage';
import { HolidayCalendarPage } from '@/pages/dashboard/HolidayCalendarPage';
import { RecentActivityPage } from '@/pages/dashboard/RecentActivityPage';
import { NotFoundPage } from '@/pages/NotFound';
import { LoginPage } from '@/pages/login';

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
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
