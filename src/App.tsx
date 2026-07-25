import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Loader2 } from 'lucide-react';
import { EMPLOYEE_DIRECTORY_CHANGED_EVENT } from '@/data/employees';
import { canAccessModule, resolveAppRole, type AppModule } from '@/lib/accessControl';
import { useAccessControlRevision } from '@/lib/useAccessControlRevision';

import { DashboardPage } from '@/pages/dashboard';
import { EmployeesPage, EmployeeDetailPage } from '@/pages/employees';
import { AttendancePage } from '@/pages/attendance';
import { LeavePage } from '@/pages/leave';
import { FinancePage } from '@/pages/finance';
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
import { Card } from '@/components/ui';

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

function AccessDeniedPage({ module }: { module: AppModule }) {
  return (
    <div className="py-10">
      <Card>
        <div className="p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-ink-900">Access Restricted</h1>
          <p className="mt-2 text-sm text-ink-500">
            You do not have permission to access {module}. Contact an administrator to update Roles and Permissions.
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
    return <AccessDeniedPage module={module} />;
  }

  return children;
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
        <Route path="/" element={<RequireModuleAccess module="Dashboard"><DashboardPage /></RequireModuleAccess>} />
        <Route path="employees" element={<RequireModuleAccess module="Employee Directory"><EmployeesPage /></RequireModuleAccess>} />
        <Route path="employees/:id" element={<RequireModuleAccess module="Employee Directory"><EmployeeDetailPage /></RequireModuleAccess>} />
        <Route path="attendance" element={<RequireModuleAccess module="Attendance"><AttendancePage /></RequireModuleAccess>} />
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
        <Route path="settings" element={<RequireModuleAccess module="Settings"><SettingsPage /></RequireModuleAccess>} />
        <Route path="admin" element={<RequireModuleAccess module="Admin"><RequireAdmin><AdminDashboardPage /></RequireAdmin></RequireModuleAccess>} />
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
  const [, setDirectoryRevision] = useState(0);

  useEffect(() => {
    const bumpRevision = () => setDirectoryRevision((prev) => prev + 1);
    window.addEventListener(EMPLOYEE_DIRECTORY_CHANGED_EVENT, bumpRevision);
    return () => {
      window.removeEventListener(EMPLOYEE_DIRECTORY_CHANGED_EVENT, bumpRevision);
    };
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
