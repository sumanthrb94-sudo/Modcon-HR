import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';

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
import { NotFoundPage } from '@/pages/NotFound';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
