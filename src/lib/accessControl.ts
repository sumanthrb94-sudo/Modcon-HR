import type { UserProfile } from '@/lib/auth';
import { orgScopedKey } from '@/lib/orgScope';
import { ORG_SETTINGS, publishOrgSetting } from '@/lib/orgSettings';

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
  'Documents',
  'Settings',
  'Admin',
] as const;
export type AppModule = typeof APP_MODULES[number];

export type PermissionLevel = 'full' | 'view' | 'none';
export type PermissionMatrix = Record<AppModule, Record<AppRole, PermissionLevel>>;

const ACCESS_CONTROL_STORAGE_KEY = ORG_SETTINGS.accessControl.storageKey;
export const ACCESS_CONTROL_CHANGED_EVENT = ORG_SETTINGS.accessControl.changedEvent;

// An HR Manager is the administrator of their own company: they hold the same
// module access as Admin. What separates the two is reach, not level — an HR
// Manager is always confined to their own organization (see
// resolveOrgKeyForProfile in lib/orgScope.ts and the org filter on the Admin
// dashboard), and can never create organizations or grant the Admin role.
export const defaultPermissions: PermissionMatrix = {
  Dashboard: { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'view' },
  'Employee Directory': { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'view' },
  Attendance: { Admin: 'full', 'HR Manager': 'full', Manager: 'full', Employee: 'none' },
  // Self-service view of your own attendance — everyone sees their own record.
  'My Attendance': { Admin: 'full', 'HR Manager': 'full', Manager: 'full', Employee: 'full' },
  'Leave Management': { Admin: 'full', 'HR Manager': 'full', Manager: 'full', Employee: 'full' },
  // Admin is absent from Finance by design — see MODULE_ROLE_EXCLUSIONS.
  Finance: { Admin: 'none', 'HR Manager': 'view', Manager: 'none', Employee: 'full' },
  Payroll: { Admin: 'full', 'HR Manager': 'full', Manager: 'none', Employee: 'none' },
  Recruitment: { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'none' },
  Onboarding: { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'none' },
  Performance: { Admin: 'full', 'HR Manager': 'full', Manager: 'full', Employee: 'none' },
  Expenses: { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'full' },
  Assets: { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'none' },
  Helpdesk: { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'full' },
  'Reports & Analytics': { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'none' },
  // The employee handbook is company policy every employee must be able to
  // read, so no role is ever 'none' here — the read floor is pinned for every
  // role in enforceRequiredPermissions. 'full' means publish, and goes to the
  // organisation's administrators (HR and Admin), matching isOrgAdmin() in
  // firestore.rules.
  Documents: { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'view' },
  Settings: { Admin: 'full', 'HR Manager': 'full', Manager: 'none', Employee: 'none' },
  Admin: { Admin: 'full', 'HR Manager': 'full', Manager: 'none', Employee: 'none' },
};

/**
 * Module/role pairs that are structurally unavailable, whatever the stored
 * matrix says.
 *
 * Finance/Admin is here because `/finance` renders the Payroll page verbatim
 * for anyone who isn't an Employee (see pages/finance/index.tsx) — for an Admin
 * it was a second nav entry onto a page they already have. Finance is the
 * employee's own payslip view; an Admin uses Payroll. Enforced here rather than
 * left as a default so toggling the cell in Settings cannot resurrect the
 * duplicate.
 */
export const MODULE_ROLE_EXCLUSIONS: Partial<Record<AppModule, readonly AppRole[]>> = {
  Finance: ['Admin'],
};

export function isModuleExcluded(module: AppModule, role: AppRole): boolean {
  return MODULE_ROLE_EXCLUSIONS[module]?.includes(role) ?? false;
}

/**
 * Cells whose level the app fixes, whatever the stored matrix says.
 *
 * Distinct from MODULE_ROLE_EXCLUSIONS: an excluded pair is *unavailable*
 * ("n/a"), a pinned pair has a real level that simply cannot be changed.
 *
 * `Documents` is pinned in full because the handbook's access model is enforced
 * in firestore.rules, and the matrix must not be able to promise something the
 * server will refuse. Granting a Manager 'full' here would render the upload
 * panel for someone `isOrgAdmin()` then denies; withdrawing an Employee's 'view'
 * would hide company policy the rules still serve. Publish is HR + Admin
 * because that is what the rules say, so the cell is not a choice.
 *
 * The other two entries predate this and were previously enforced silently on
 * read — the Settings cell cycled, appeared to save, and reverted. Listing them
 * here is what lets the UI lock them instead.
 */
export const PINNED_PERMISSIONS: Partial<
  Record<AppModule, Partial<Record<AppRole, PermissionLevel>>>
> = {
  'Employee Directory': { Employee: 'view' },
  Documents: { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'view' },
  Admin: { Admin: 'full' },
};

/** The fixed level for a cell, or undefined when it is configurable. */
export function pinnedPermission(
  module: AppModule,
  role: AppRole,
): PermissionLevel | undefined {
  return PINNED_PERMISSIONS[module]?.[role];
}

function notifyPermissionsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ACCESS_CONTROL_CHANGED_EVENT));
}

function enforceRequiredPermissions(matrix: PermissionMatrix): PermissionMatrix {
  const enforced: PermissionMatrix = { ...matrix };

  // Pinned cells overwrite whatever was stored — see PINNED_PERMISSIONS.
  (Object.keys(PINNED_PERMISSIONS) as AppModule[]).forEach((module) => {
    const pins = PINNED_PERMISSIONS[module];
    if (!pins) return;
    enforced[module] = { ...enforced[module], ...pins };
  });

  // Excluded pairs are pinned closed last, so neither a stored matrix nor the
  // pins above can hand a role a module it is structurally barred from.
  (Object.keys(MODULE_ROLE_EXCLUSIONS) as AppModule[]).forEach((module) => {
    MODULE_ROLE_EXCLUSIONS[module]?.forEach((role) => {
      enforced[module] = { ...enforced[module], [role]: 'none' };
    });
  });

  return enforced;
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
    const raw = window.localStorage.getItem(orgScopedKey(ACCESS_CONTROL_STORAGE_KEY));
    if (!raw) return enforceRequiredPermissions({ ...defaultPermissions });
    const parsed = JSON.parse(raw) as unknown;
    return normalizePermissionMatrix(parsed);
  } catch {
    return enforceRequiredPermissions({ ...defaultPermissions });
  }
}

/** Resolves once the organisation's copy has caught up — see publishOrgSetting. */
export function savePermissionMatrix(matrix: PermissionMatrix): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const enforced = enforceRequiredPermissions(matrix);
  window.localStorage.setItem(orgScopedKey(ACCESS_CONTROL_STORAGE_KEY), JSON.stringify(enforced));
  notifyPermissionsChanged();
  // Storing it server-side does not make the matrix an authorization boundary —
  // firestore.rules still decides, and resolveAppRole still reads the
  // server-backed profile role. It stops one browser's devtools edit from being
  // the whole of it, which is what G5 in docs/tenant-isolation-spec.md is about.
  return publishOrgSetting(ORG_SETTINGS.accessControl, enforced);
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
  if (profile.role === 'hr') return 'HR Manager';
  if (profile.role === 'manager') return 'Manager';
  return 'Employee';
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === orgScopedKey(ACCESS_CONTROL_STORAGE_KEY)) {
      notifyPermissionsChanged();
    }
  });
}
