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
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  group: 'Main' | 'People' | 'Operations' | 'Insights';
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, group: 'Main' },
  { label: 'Employees', path: '/employees', icon: Users, group: 'People' },
  { label: 'Attendance', path: '/attendance', icon: CalendarCheck, group: 'People' },
  { label: 'Leave', path: '/leave', icon: CalendarOff, group: 'People' },
  { label: 'Payroll', path: '/payroll', icon: Wallet, group: 'Operations' },
  { label: 'Recruitment', path: '/recruitment', icon: Briefcase, group: 'Operations' },
  { label: 'Onboarding', path: '/onboarding', icon: UserPlus, group: 'Operations' },
  { label: 'Performance', path: '/performance', icon: Target, group: 'Operations' },
  { label: 'Expenses', path: '/expenses', icon: Receipt, group: 'Operations' },
  { label: 'Assets', path: '/assets', icon: Laptop, group: 'Operations' },
  { label: 'Helpdesk', path: '/helpdesk', icon: LifeBuoy, group: 'Operations' },
  { label: 'Reports', path: '/reports', icon: BarChart3, group: 'Insights' },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'Insights' },
];

export const navGroups: NavItem['group'][] = ['Main', 'People', 'Operations', 'Insights'];
