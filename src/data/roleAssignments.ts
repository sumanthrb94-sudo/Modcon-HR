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
import { DEFAULT_ORG_KEY } from '@/lib/orgScope';
import type { UserProfile, UserRole } from '@/lib/auth';
import type { Employee } from '@/types';
import { carriesHrFunction } from '@/data/companyProfile';

export interface RoleAssignment {
  email: string;
  role: UserRole;
  /** Organisation the assignment belongs to; absent for the default/legacy org. */
  orgId?: string;
  assignedBy: string;
  /**
   * Why the role was granted. `designation` is a grant `syncHrRoleForEmployee`
   * made because somebody was filed under an HR title in the HR department,
   * and only that kind is withdrawn when they stop being one. Absent on grants
   * written before the field existed.
   */
  source?: RoleAssignmentSource | null;
}

export type RoleAssignmentSource = 'designation' | 'provisioned' | 'invited';

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
  source?: RoleAssignmentSource;
}): Promise<void> {
  const id = roleAssignmentId(params.email);
  if (!id) return;
  await setDoc(
    doc(db, 'role_assignments', id),
    {
      email: id,
      role: params.role,
      // Always a string, never omitted: `DEFAULT_ORG_KEY` for a caller with no
      // orgId of their own. An absent field and the 'default' sentinel mean the
      // same tenant to `orgKeyOf()` in firestore.rules, but only the sentinel
      // is reachable by `where('orgId','==',...)` — see G4 in
      // docs/tenant-isolation-spec.md.
      orgId: params.orgId || DEFAULT_ORG_KEY,
      assignedBy: params.assignedBy,
      // Written every time, null included: the document is merged, and a stale
      // 'designation' left on a grant re-made for another reason would make it
      // revocable by a directory edit.
      source: params.source ?? null,
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
 * "Added as HR" means appointed to one of the job titles the company nominated
 * as carrying the HR function (Settings → Company Profile). Matched against
 * that configured list, not by looking for "HR" inside the title — that
 * substring turns up in titles with no HR involvement at all, and would have
 * handed administrator access to a Threat Analyst.
 *
 * Best-effort by design: the employee directory is local and its write has
 * already succeeded by the time this runs, so a Firestore failure here must not
 * fail the whole operation. It returns what happened so callers can tell the
 * user rather than silently dropping it.
 */
export async function syncHrRoleForEmployee(
  employee: Pick<Employee, 'email' | 'designation' | 'department'>,
  actor: UserProfile | null,
): Promise<'granted' | 'revoked' | 'unchanged' | 'failed'> {
  const email = roleAssignmentId(employee.email ?? '');
  if (!email) return 'unchanged';

  // Both halves, or a nominated title held anywhere in the company would
  // confer administrator access — see carriesHrFunction.
  const shouldBeHr = carriesHrFunction(employee);

  try {
    const existing = await getRoleAssignment(email);

    if (shouldBeHr) {
      if (existing?.role === 'hr') return 'unchanged';
      await assignRole({
        email,
        role: 'hr',
        orgId: actor?.orgId || DEFAULT_ORG_KEY,
        assignedBy: actor?.uid ?? 'unknown',
        source: 'designation',
      });
      await applyRoleToExistingAccount(email, 'hr');
      return 'granted';
    }

    // Only an HR grant made by this mechanism is withdrawn. An organisation's
    // first HR account holds a grant made when the organisation was created,
    // not because of any job title — and before grants carried a source, HR
    // filing themselves under Human Resources with a title nobody had
    // nominated yet revoked their own administrator access. Grants older than
    // the field keep the old behaviour, except that nobody's own directory
    // edit withdraws their own access.
    if (existing?.role !== 'hr') return 'unchanged';
    if (existing.source && existing.source !== 'designation') return 'unchanged';
    if (!existing.source && actor?.email && roleAssignmentId(actor.email) === email) return 'unchanged';
    await clearRoleAssignment(email);
    await applyRoleToExistingAccount(email, 'employee');
    return 'revoked';
  } catch {
    return 'failed';
  }
}
