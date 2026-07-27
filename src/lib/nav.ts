import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  CalendarOff,
  Banknote,
  Wallet,
  Briefcase,
  UserPlus,
  Target,
  IndianRupee,
  Laptop,
  LifeBuoy,
  BarChart3,
  Settings,
  ShieldCheck,
  ClipboardCheck,
  CalendarClock,
  Building2,
  type LucideIcon,
} from 'lucide-react';
import { canAccessModule, type AppModule, type AppRole } from '@/lib/accessControl';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  group: 'Main' | 'People' | 'Operations';
  module: AppModule;
  /** Visible to an organisation's administrators — Admin and HR Manager. */
  adminOnly?: boolean;
  /** Visible to managers and admins only. */
  managerOnly?: boolean;
  /** Visible to super admins only (see useAuth().isSuperAdmin). */
  superAdminOnly?: boolean;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, group: 'Main', module: 'Dashboard' },
  { label: 'Employees', path: '/employees', icon: Users, group: 'People', module: 'Employee Directory' },
  { label: 'Attendance', path: '/attendance', icon: CalendarCheck, group: 'People', module: 'Attendance' },
  { label: 'My Attendance', path: '/my-attendance', icon: CalendarClock, group: 'People', module: 'My Attendance' },
  { label: 'Leave', path: '/leave', icon: CalendarOff, group: 'People', module: 'Leave Management' },
  { label: 'Finance', path: '/finance', icon: Banknote, group: 'People', module: 'Finance' },
  { label: 'Payroll', path: '/payroll', icon: Wallet, group: 'Operations', module: 'Payroll' },
  { label: 'Recruitment', path: '/recruitment', icon: Briefcase, group: 'Operations', module: 'Recruitment' },
  { label: 'Onboarding', path: '/onboarding', icon: UserPlus, group: 'Operations', module: 'Onboarding' },
  { label: 'Performance', path: '/performance', icon: Target, group: 'Operations', module: 'Performance' },
  { label: 'Expenses', path: '/expenses', icon: IndianRupee, group: 'Operations', module: 'Expenses' },
  { label: 'Assets', path: '/assets', icon: Laptop, group: 'Operations', module: 'Assets' },
  { label: 'Helpdesk', path: '/helpdesk', icon: LifeBuoy, group: 'Operations', module: 'Helpdesk' },
  { label: 'Approvals', path: '/approvals', icon: ClipboardCheck, group: 'Operations', module: 'Dashboard', managerOnly: true },
  { label: 'Reports', path: '/reports', icon: BarChart3, group: 'Operations', module: 'Reports & Analytics' },
  { label: 'Admin', path: '/admin', icon: ShieldCheck, group: 'Operations', module: 'Admin', adminOnly: true },
  { label: 'Organizations', path: '/organizations', icon: Building2, group: 'Operations', module: 'Admin', adminOnly: true, superAdminOnly: true },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'Operations', module: 'Settings' },
];

export const navGroups: NavItem['group'][] = ['Main', 'People', 'Operations'];

export function getVisibleNavItems(role: AppRole, isSuperAdmin = false): NavItem[] {
  const canManage = role === 'Admin' || role === 'HR Manager' || role === 'Manager';
  // An HR Manager administers their own company, so admin-flagged entries are
  // theirs too. Cross-organisation entries stay behind `superAdminOnly`, which
  // no amount of org-level administration satisfies.
  const isOrgAdmin = role === 'Admin' || role === 'HR Manager';

  return navItems.filter(
    (item) =>
      canAccessModule(item.module, role) &&
      (!item.adminOnly || isOrgAdmin) &&
      (!item.managerOnly || canManage) &&
      (!item.superAdminOnly || isSuperAdmin),
  );
}
