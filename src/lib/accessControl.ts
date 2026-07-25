import type { UserProfile } from '@/lib/auth';

export const APP_ROLES = ['Admin', 'HR Manager', 'Manager', 'Employee'] as const;
export type AppRole = typeof APP_ROLES[number];

export const APP_MODULES = [
  'Dashboard',
  'Employee Directory',
  'Attendance',
  'My Attendance',
  'Leave Management',
  'Finance',
  'Payroll',
  'Recruitment',
  'Onboarding',
  'Performance',
  'Expenses',
  'Assets',
  'Helpdesk',
  'Reports & Analytics',
  'Settings',
  'Admin',
] as const;
export type AppModule = typeof APP_MODULES[number];

export type PermissionLevel = 'full' | 'view' | 'none';
export type PermissionMatrix = Record<AppModule, Record<AppRole, PermissionLevel>>;

const ACCESS_CONTROL_STORAGE_KEY = 'modcon.hr.accessControl.permissions';
export const ACCESS_CONTROL_CHANGED_EVENT = 'modcon-hr-access-control-changed';

export const defaultPermissions: PermissionMatrix = {
  Dashboard: { Admin: 'full', 'HR Manager': 'view', Manager: 'view', Employee: 'view' },
  'Employee Directory': { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'view' },
  Attendance: { Admin: 'full', 'HR Manager': 'full', Manager: 'full', Employee: 'none' },
  // Self-service view of your own attendance — everyone sees their own record.
  'My Attendance': { Admin: 'full', 'HR Manager': 'full', Manager: 'full', Employee: 'full' },
  'Leave Management': { Admin: 'full', 'HR Manager': 'full', Manager: 'full', Employee: 'full' },
  Finance: { Admin: 'full', 'HR Manager': 'view', Manager: 'none', Employee: 'full' },
  Payroll: { Admin: 'full', 'HR Manager': 'full', Manager: 'none', Employee: 'none' },
  Recruitment: { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'none' },
  Onboarding: { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'none' },
  Performance: { Admin: 'full', 'HR Manager': 'full', Manager: 'full', Employee: 'none' },
  Expenses: { Admin: 'full', 'HR Manager': 'view', Manager: 'view', Employee: 'full' },
  Assets: { Admin: 'full', 'HR Manager': 'view', Manager: 'view', Employee: 'none' },
  Helpdesk: { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'full' },
  'Reports & Analytics': { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'none' },
  Settings: { Admin: 'full', 'HR Manager': 'none', Manager: 'none', Employee: 'none' },
  Admin: { Admin: 'full', 'HR Manager': 'none', Manager: 'none', Employee: 'none' },
};

function notifyPermissionsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ACCESS_CONTROL_CHANGED_EVENT));
}

function enforceRequiredPermissions(matrix: PermissionMatrix): PermissionMatrix {
  return {
    ...matrix,
    'Employee Directory': {
      ...matrix['Employee Directory'],
      Employee: 'view',
    },
    Admin: {
      ...matrix.Admin,
      Admin: 'full',
    },
  };
}

function normalizePermissionMatrix(value: unknown): PermissionMatrix {
  const fallback = enforceRequiredPermissions({ ...defaultPermissions });
  if (!value || typeof value !== 'object') return fallback;

  const candidate = value as Partial<Record<AppModule, Partial<Record<AppRole, PermissionLevel>>>>;
  const normalized = { ...fallback };

  APP_MODULES.forEach((module) => {
    const modulePermissions = candidate[module];
    if (!modulePermissions || typeof modulePermissions !== 'object') return;

    APP_ROLES.forEach((role) => {
      const level = modulePermissions[role];
      if (level === 'full' || level === 'view' || level === 'none') {
        normalized[module] = { ...normalized[module], [role]: level };
      }
    });
  });

  return enforceRequiredPermissions(normalized);
}

export function getPermissionMatrix(): PermissionMatrix {
  if (typeof window === 'undefined') return enforceRequiredPermissions({ ...defaultPermissions });

  try {
    const raw = window.localStorage.getItem(ACCESS_CONTROL_STORAGE_KEY);
    if (!raw) return enforceRequiredPermissions({ ...defaultPermissions });
    const parsed = JSON.parse(raw) as unknown;
    return normalizePermissionMatrix(parsed);
  } catch {
    return enforceRequiredPermissions({ ...defaultPermissions });
  }
}

export function savePermissionMatrix(matrix: PermissionMatrix) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCESS_CONTROL_STORAGE_KEY, JSON.stringify(enforceRequiredPermissions(matrix)));
  notifyPermissionsChanged();
}

export function getPermissionLevel(module: AppModule, role: AppRole): PermissionLevel {
  const matrix = getPermissionMatrix();
  return matrix[module][role];
}

export function canAccessModule(module: AppModule, role: AppRole): boolean {
  return getPermissionLevel(module, role) !== 'none';
}

export function resolveAppRole(profile: UserProfile | null): AppRole {
  if (!profile) return 'Employee';
  if (profile.role === 'admin') return 'Admin';
  if (profile.role === 'manager') return 'Manager';
  return 'Employee';
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === ACCESS_CONTROL_STORAGE_KEY) {
      notifyPermissionsChanged();
    }
  });
}
