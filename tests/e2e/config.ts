/**
 * Shared E2E test configuration.
 *
 * The Firebase Web API key is a public client identifier (it ships in the
 * browser bundle), so it is safe to reference here for provisioning test
 * accounts. Credentials for the dedicated test users can be overridden via env.
 */
export const FIREBASE_API_KEY =
  process.env.E2E_FIREBASE_API_KEY ?? 'AIzaSyCDTZ1Sc3ajyKE7fKnzDguzoIphn9tDRQU';

export type Role = 'employee' | 'manager' | 'admin';

/**
 * The cross-organisation persona, kept apart from PERSONAS.
 *
 * PERSONAS drives the three role projects, and a super admin is not a fourth
 * role to check access control for — it is the only account that can create a
 * second organisation and switch between them, which is what
 * org-isolation.spec.ts needs and nothing else does.
 *
 * Its `superAdmin: true` cannot come from signing in: firestore.rules only lets
 * a self-write re-affirm the flag a profile already carries, and its
 * hard-coded list does not contain this address. `seedPersonaProfiles` writes
 * it with the emulator's owner bypass, exactly as the real super admin's
 * profile was created.
 */
export const SUPER_ADMIN = {
  role: 'admin' as const,
  email: process.env.E2E_SUPER_ADMIN_EMAIL ?? 'playwright-e2e-super@modcon-hr.test',
  password: process.env.E2E_PASSWORD ?? 'Playwright!2026',
  name: 'Playwright Super Admin',
  roleLabel: 'Administrator',
  superAdmin: true as const,
};

export interface Persona {
  role: Role;
  email: string;
  password: string;
  name: string;
  /** How the role is labelled in the topbar. */
  roleLabel: string;
}

const PASSWORD = process.env.E2E_PASSWORD ?? 'Playwright!2026';

/**
 * Test personas. The manager/admin emails are only granted elevated roles when
 * the app is built with VITE_ENABLE_E2E_ACCOUNTS=true (see src/lib/auth.tsx),
 * so production deployments never trust these logins.
 */
export const PERSONAS: Record<Role, Persona> = {
  employee: {
    role: 'employee',
    email: process.env.E2E_EMAIL ?? 'playwright-e2e@modcon-hr.test',
    password: PASSWORD,
    name: 'Playwright Employee',
    roleLabel: 'Employee',
  },
  manager: {
    role: 'manager',
    email: process.env.E2E_MANAGER_EMAIL ?? 'playwright-e2e-manager@modcon-hr.test',
    password: PASSWORD,
    name: 'Playwright Manager',
    roleLabel: 'Manager',
  },
  admin: {
    role: 'admin',
    email: process.env.E2E_ADMIN_EMAIL ?? 'playwright-e2e-admin@modcon-hr.test',
    password: PASSWORD,
    name: 'Playwright Admin',
    roleLabel: 'Administrator',
  },
};

// Backwards-compatible exports used by the general app specs.
export const TEST_EMAIL = PERSONAS.employee.email;
export const TEST_PASSWORD = PERSONAS.employee.password;
export const TEST_NAME = PERSONAS.employee.name;
