/**
 * Role assignments made by an organisation's administrators, keyed by email.
 *
 * Why this exists rather than deriving the role at sign-in: the employee
 * directory lives in localStorage (see data/employees.ts), which is entirely
 * under the client's control. If `auth.tsx` granted a role because the matched
 * employee record said "Human Resources", anyone could open devtools, edit
 * their own department, reload, and be an administrator. The department is a
 * claim, not evidence.
 *
 * So the grant is written here by someone who already holds the privilege — an
 * admin or HR manager adding the employee — and `firestore.rules` verifies the
 * self-write at sign-in against this document. The client never decides its own
 * role; it only discovers a decision an administrator already made.
 *
 * Assignments are keyed by email because the person usually has no account yet
 * when they are added to the directory: there is no uid to write a profile
 * against until they first sign in.
 */
import {
  collection, doc, deleteDoc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile, UserRole } from '@/lib/auth';
import type { Employee } from '@/types';
import { getCompanyProfile } from '@/data/companyProfile';

export interface RoleAssignment {
  email: string;
  role: UserRole;
  /** Organisation the assignment belongs to; absent for the default/legacy org. */
  orgId?: string;
  assignedBy: string;
}

/** Firestore document id for an email. Emails contain no '/' so they are
 *  already valid ids; this only normalises case and whitespace so a lookup at
 *  sign-in finds what the admin wrote. */
export function roleAssignmentId(email: string): string {
  return email.trim().toLowerCase();
}

export async function getRoleAssignment(email: string): Promise<RoleAssignment | null> {
  const id = roleAssignmentId(email);
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'role_assignments', id));
    return snap.exists() ? (snap.data() as RoleAssignment) : null;
  } catch {
    // A read failure must not block sign-in — the account simply keeps
    // whatever role its profile already carries.
    return null;
  }
}

export async function assignRole(params: {
  email: string;
  role: UserRole;
  orgId?: string;
  assignedBy: string;
}): Promise<void> {
  const id = roleAssignmentId(params.email);
  if (!id) return;
  await setDoc(
    doc(db, 'role_assignments', id),
    {
      email: id,
      role: params.role,
      ...(params.orgId ? { orgId: params.orgId } : {}),
      assignedBy: params.assignedBy,
      assignedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function clearRoleAssignment(email: string): Promise<void> {
  const id = roleAssignmentId(email);
  if (!id) return;
  await deleteDoc(doc(db, 'role_assignments', id));
}

/**
 * Applies a role change to an account that already exists, found by email.
 *
 * The assignment above only takes effect when someone next signs in, which is
 * right for a new joiner but leaves an existing account untouched. Without
 * this, moving someone out of HR would revoke nothing until they happened to
 * log out and back in — they would keep administrator access indefinitely.
 *
 * Never touches a profile holding `admin`: a platform admin who happens to sit
 * in the HR department is not demoted by an edit to the employee directory.
 */
async function applyRoleToExistingAccount(email: string, role: UserRole): Promise<void> {
  const id = roleAssignmentId(email);
  if (!id) return;
  const matches = await getDocs(query(collection(db, 'users'), where('email', '==', id)));
  await Promise.all(
    matches.docs
      .filter((snap) => snap.data().role !== 'admin' && snap.data().role !== role)
      .map((snap) => updateDoc(doc(db, 'users', snap.id), { role })),
  );
}

/**
 * Keeps an employee's access in step with whether they sit in the company's HR
 * department.
 *
 * "Added as HR" means added to the department the company nominated as its HR
 * function (Settings → Company Profile), not a job title containing the letters
 * H and R — the department is the thing an organisation actually configures,
 * and departments are renameable, so nothing is matched against a fixed string.
 *
 * Best-effort by design: the employee directory is local and its write has
 * already succeeded by the time this runs, so a Firestore failure here must not
 * fail the whole operation. It returns what happened so callers can tell the
 * user rather than silently dropping it.
 */
export async function syncHrRoleForEmployee(
  employee: Pick<Employee, 'email' | 'department'>,
  actor: UserProfile | null,
): Promise<'granted' | 'revoked' | 'unchanged' | 'failed'> {
  const email = roleAssignmentId(employee.email ?? '');
  const { hrDepartment } = getCompanyProfile();
  if (!email || !hrDepartment) return 'unchanged';

  const shouldBeHr = employee.department === hrDepartment;

  try {
    const existing = await getRoleAssignment(email);

    if (shouldBeHr) {
      if (existing?.role === 'hr') return 'unchanged';
      await assignRole({
        email,
        role: 'hr',
        ...(actor?.orgId ? { orgId: actor.orgId } : {}),
        assignedBy: actor?.uid ?? 'unknown',
      });
      await applyRoleToExistingAccount(email, 'hr');
      return 'granted';
    }

    // Only an HR grant made by this mechanism is withdrawn — a manager role
    // assigned for some other reason is not ours to clear.
    if (existing?.role !== 'hr') return 'unchanged';
    await clearRoleAssignment(email);
    await applyRoleToExistingAccount(email, 'employee');
    return 'revoked';
  } catch {
    return 'failed';
  }
}
