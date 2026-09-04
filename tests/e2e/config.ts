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
 * The HR persona, kept apart from PERSONAS for the same reason as SUPER_ADMIN:
 * the three role projects exist to check access control per role, and adding a
 * fourth would run every role spec again for a role they were not written
 * about.
 *
 * `hr` is not granted by an email allow-list the way admin and manager are for
 * tests — the role is read from the stored profile — so seeding
 * `users/{uid}.role = 'hr'` is the whole of it, and the sign-in upsert
 * re-affirms what it finds.
 */
export const HR_PERSONA = {
  role: 'hr' as const,
  email: process.env.E2E_HR_EMAIL ?? 'playwright-e2e-hr@modcon-hr.test',
  password: process.env.E2E_PASSWORD ?? 'Playwright!2026',
  name: 'Playwright HR',
  roleLabel: 'HR Manager',
};

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

/**
 * The account whose role gets changed underneath a live session.
 *
 * Dedicated rather than borrowed from PERSONAS, because the projects run in
 * parallel: rewriting `users/{uid}.role` for a persona other specs are signed
 * in as would revoke their access mid-test, and the failure would surface
 * somewhere far from the cause. This address belongs to one spec, and that
 * spec puts the role back.
 *
 * Deliberately **not** in any of the `E2E_*_EMAIL` allow-lists that
 * src/lib/auth.tsx honours. Those pin a role whatever the stored profile says,
 * which is the very mechanism under test — an allow-listed address would keep
 * its role through every write the spec makes and pass without proving
 * anything.
 */
export const ROLE_CHURN_PERSONA = {
  role: 'employee' as const,
  email: process.env.E2E_ROLE_CHURN_EMAIL ?? 'playwright-e2e-role-churn@modcon-hr.test',
  password: process.env.E2E_PASSWORD ?? 'Playwright!2026',
  name: 'Playwright Role Churn',
  roleLabel: 'Employee',
};

/**
 * The two personas that are *linked* to an employee record — one address per
 * spec that writes `employee_links/{uid}`.
 *
 * That document is what firestore.rules resolves an account to, and — since
 * the client started reading the same document instead of matching the
 * directory by work email — it is what the app resolves it to as well. It
 * lives in Firestore, so it is shared across every project, worker and browser
 * context in the run: writing one changes who that account *is* everywhere at
 * once, until it is deleted. A shared persona would therefore be repointed
 * underneath specs that never mention links —
 *
 *   PERSONAS.admin   check-in-out and persistence resolve it through the work
 *                    email they set, at a different employee.
 *   PERSONAS.manager leave-approval-scope seeds it a reporting line and matches
 *                    it by email, also at a different employee.
 *
 * — and because the linking spec and the affected one run in different
 * projects at the same time, the failure would be intermittent and would
 * surface nowhere near its cause. Same reasoning as ROLE_CHURN_PERSONA, for
 * the other half of an account's identity.
 *
 * Both take their role from the stored profile rather than an allow-list, so
 * both depend on `seedPersonaProfiles`, which runs against the emulator only —
 * as HR_PERSONA already does. Both specs are in the emulator-gated
 * org-settings project, so that holds.
 */
export const GEOFENCE_PERSONA = {
  role: 'hr' as const,
  email: process.env.E2E_GEOFENCE_EMAIL ?? 'playwright-e2e-geofence@modcon-hr.test',
  password: process.env.E2E_PASSWORD ?? 'Playwright!2026',
  name: 'Playwright Geofence',
  roleLabel: 'HR Manager',
};

/** The hiring manager in careers.spec.ts — see the note above. */
export const HIRING_MANAGER_PERSONA = {
  role: 'manager' as const,
  email: process.env.E2E_HIRING_MANAGER_EMAIL ?? 'playwright-e2e-hiring@modcon-hr.test',
  password: process.env.E2E_PASSWORD ?? 'Playwright!2026',
  name: 'Playwright Hiring Manager',
  roleLabel: 'Manager',
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
