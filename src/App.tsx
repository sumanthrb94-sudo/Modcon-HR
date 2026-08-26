import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui';

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

/**
 * Signed in, but the account isn't attached to a directory record. Everything
 * an employee sees is scoped by that link, so with no link there is nothing
 * safe to show — this fails closed rather than falling back to the full
 * company view.
 */
function UnlinkedAccount() {
  const { profile, signOutUser } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-50 px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <ShieldAlert size={24} />
        </div>
        <h1 className="text-lg font-semibold text-ink-900">Account not linked yet</h1>
        <p className="mt-2 text-sm text-ink-500 leading-relaxed">
          {profile?.email ? (
            <span className="font-medium text-ink-700">{profile.email}</span>
          ) : (
            'This account'
          )}{' '}
          isn&apos;t linked to an employee record, so there&apos;s nothing to show yet. Ask your
          administrator to connect it to your profile.
        </p>
        <Button variant="secondary" className="mt-6" onClick={() => signOutUser()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading, isAdmin, isLinked } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <Loader2 className="animate-spin text-brand-600" size={28} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  // Admins are never scoped, so they need no directory record — the fixed
  // admin accounts deliberately have none.
  if (!isAdmin && !isLinked) return <UnlinkedAccount />;
  return children;
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
        {/* Approval queues are other people's requests by definition, so they
            are admin-only at the route — not merely hidden from the nav, which
            a typed URL would walk straight past. */}
        <Route path="dashboard/pending-approvals" element={<RequireAdmin><PendingApprovalsPage /></RequireAdmin>} />
        <Route path="dashboard/pending-approvals/leave-requests" element={<RequireAdmin><LeaveRequestsApprovalsPage /></RequireAdmin>} />
        <Route path="dashboard/pending-approvals/expense-claims" element={<RequireAdmin><ExpenseClaimsApprovalsPage /></RequireAdmin>} />
        <Route path="dashboard/pending-approvals/regularizations" element={<RequireAdmin><RegularizationsApprovalsPage /></RequireAdmin>} />
        <Route path="dashboard/pending-approvals/onboarding-tasks" element={<RequireAdmin><OnboardingTasksApprovalsPage /></RequireAdmin>} />
        <Route path="dashboard/announcements" element={<AnnouncementsPage />} />
        {/* Celebrations and the KPI graphs are whole-company views of other
            people, so they follow the same rule. */}
        <Route path="dashboard/celebrations" element={<RequireAdmin><CelebrationsPage /></RequireAdmin>} />
        <Route path="dashboard/kpi-graphs" element={<RequireAdmin><KpiGraphsPage /></RequireAdmin>} />
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
