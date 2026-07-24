import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  CalendarOff,
  Wallet,
  Briefcase,
  UserPlus,
  Target,
  Receipt,
  Laptop,
  LifeBuoy,
  BarChart3,
  Settings,
  ShieldCheck,
  ClipboardCheck,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  group: 'Main' | 'People' | 'Operations' | 'Insights';
  adminOnly?: boolean;
  /** Visible to managers and admins only. */
  managerOnly?: boolean;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, group: 'Main' },
  { label: 'Employees', path: '/employees', icon: Users, group: 'People' },
  { label: 'Attendance', path: '/attendance', icon: CalendarCheck, group: 'People' },
  { label: 'My Attendance', path: '/my-attendance', icon: CalendarClock, group: 'People' },
  { label: 'Leave', path: '/leave', icon: CalendarOff, group: 'People' },
  { label: 'Payroll', path: '/payroll', icon: Wallet, group: 'Operations' },
  { label: 'Recruitment', path: '/recruitment', icon: Briefcase, group: 'Operations' },
  { label: 'Onboarding', path: '/onboarding', icon: UserPlus, group: 'Operations' },
  { label: 'Performance', path: '/performance', icon: Target, group: 'Operations' },
  { label: 'Expenses', path: '/expenses', icon: Receipt, group: 'Operations' },
  { label: 'Assets', path: '/assets', icon: Laptop, group: 'Operations' },
  { label: 'Helpdesk', path: '/helpdesk', icon: LifeBuoy, group: 'Operations' },
  { label: 'Approvals', path: '/approvals', icon: ClipboardCheck, group: 'Operations', managerOnly: true },
  { label: 'Reports', path: '/reports', icon: BarChart3, group: 'Insights' },
  { label: 'Admin', path: '/admin', icon: ShieldCheck, group: 'Insights', adminOnly: true },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'Insights' },
];

export const navGroups: NavItem['group'][] = ['Main', 'People', 'Operations', 'Insights'];
