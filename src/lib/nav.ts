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
  BookOpen,
  Megaphone,
  type LucideIcon,
} from 'lucide-react';
import { canAccessModule, type AppModule, type AppRole } from '@/lib/accessControl';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  group: 'Main' | 'People' | 'Operations';
  /**
   * The permission-matrix module this item is gated by.
   *
   * Optional, and only for items that belong to everybody: The Board is the
   * organisation's own feed, and a noticeboard the matrix can switch off for
   * employees is a noticeboard nobody reads. An item with no module is always
   * visible — so leaving it off is a decision, not an oversight, and the
   * filter below says so.
   */
  module?: AppModule;
  /** Visible to an organisation's administrators — Admin and HR Manager. */
  adminOnly?: boolean;
  /** Visible to managers and admins only. */
  managerOnly?: boolean;
  /** Visible to super admins only (see useAuth().isSuperAdmin). */
  superAdminOnly?: boolean;
  /**
   * Part of the platform console rather than of a company's HR system.
   *
   * A super admin belongs to no organisation, so these are the only items that
   * mean anything until they step into one. Everything else on this list is a
   * tenant's own app and is hidden from them while they are outside every
   * tenant — see the filter below.
   */
  platform?: boolean;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, group: 'Main', module: 'Dashboard' },
  // No `module`: the board is for everybody in the organisation, so there is
  // nothing in the permission matrix to filter it by. See the route in App.tsx.
  { label: 'The Board', path: '/board', icon: Megaphone, group: 'Main' },
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
  // No adminOnly/managerOnly flag: the handbook is readable by every role, and
  // only the upload panel inside the page is HR-gated.
  { label: 'Documents', path: '/documents', icon: BookOpen, group: 'Main', module: 'Documents' },
  // Both are platform items for a super admin: the Admin dashboard's user list
  // is deliberately cross-organisation for them (see useUserDirectory in
  // pages/admin), and Organizations is the console itself.
  { label: 'Admin', path: '/admin', icon: ShieldCheck, group: 'Operations', module: 'Admin', adminOnly: true, platform: true },
  { label: 'Organizations', path: '/organizations', icon: Building2, group: 'Operations', module: 'Admin', adminOnly: true, superAdminOnly: true, platform: true },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'Operations', module: 'Settings' },
];

export const navGroups: NavItem['group'][] = ['Main', 'People', 'Operations'];

/**
 * The sidebar for one viewer.
 *
 * `superAdminInsideOrg` is the third state this used to be missing. A super
 * admin has `role: 'admin'`, so every check below passed and they were shown a
 * full HR system — Attendance, Leave, Payroll — belonging to whichever
 * organisation their browser happened to be namespaced to, usually the default
 * one. They administer the platform and work at none of these companies, so
 * outside an organisation they get the platform console and nothing else;
 * stepping into one (Organizations → Manage this org) is what puts that
 * company's app in front of them, and the topbar says which company it is.
 */
export function getVisibleNavItems(
  role: AppRole,
  isSuperAdmin = false,
  superAdminInsideOrg = false,
): NavItem[] {
  const canManage = role === 'Admin' || role === 'HR Manager' || role === 'Manager';
  // An HR Manager administers their own company, so admin-flagged entries are
  // theirs too. Cross-organisation entries stay behind `superAdminOnly`, which
  // no amount of org-level administration satisfies.
  const isOrgAdmin = role === 'Admin' || role === 'HR Manager';
  const platformOnly = isSuperAdmin && !superAdminInsideOrg;

  return navItems.filter(
    (item) =>
      // An item with no module belongs to everybody — see the field's note.
      (item.module === undefined || canAccessModule(item.module, role)) &&
      (!item.adminOnly || isOrgAdmin) &&
      (!item.managerOnly || canManage) &&
      (!item.superAdminOnly || isSuperAdmin) &&
      (!platformOnly || item.platform === true),
  );
}
