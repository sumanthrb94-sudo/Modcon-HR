/**
 * Which employee record a signed-in account is, keyed by Firebase Auth uid.
 *
 * Why this exists rather than reading `Employee.authUid`: that field lives in
 * the localStorage employee directory (see data/employees.ts), which is
 * entirely under the client's control. A rule that trusted it would let anyone
 * open devtools, point their own record at the CEO's `employeeId`, and read
 * that salary. The directory is a claim, not evidence — the same reasoning as
 * data/roleAssignments.ts, and this follows the same shape.
 *
 * So the link is written by someone who already holds the privilege (an
 * organisation administrator) and `firestore.rules` consults it server-side via
 * `myEmployeeId()`. The client never says who it is; it only discovers who an
 * administrator said it is.
 *
 * Keyed by uid rather than email because it answers a question the rules ask
 * about `request.auth.uid`, and because an employee's email is editable while
 * their uid is not.
 */
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULT_ORG_KEY } from '@/lib/orgScope';

export interface EmployeeLink {
  /** Firebase Auth uid — also the document id. */
  uid: string;
  employeeId: string;
  /** Organisation the link belongs to; absent for the default/legacy org. */
  orgId?: string;
  linkedBy: string;
}

export async function getEmployeeLink(uid: string): Promise<EmployeeLink | null> {
  const id = uid.trim();
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'employee_links', id));
    return snap.exists() ? (snap.data() as EmployeeLink) : null;
  } catch {
    // A read failure must not break the caller — the account simply resolves
    // to no employee record, which fails closed: it reads nothing of its own.
    return null;
  }
}

/**
 * Point an account at an employee record. Administrators only — the rules
 * reject this write for anyone else, which is what the whole model rests on.
 */
export async function linkEmployeeAccount(params: {
  uid: string;
  employeeId: string;
  orgId?: string;
  linkedBy: string;
}): Promise<void> {
  const id = params.uid.trim();
  if (!id || !params.employeeId.trim()) return;
  await setDoc(
    doc(db, 'employee_links', id),
    {
      uid: id,
      employeeId: params.employeeId.trim(),
      // Always stamped, never omitted — see the note in data/roleAssignments.ts
      // and G4 in docs/tenant-isolation-spec.md.
      orgId: params.orgId || DEFAULT_ORG_KEY,
      linkedBy: params.linkedBy,
      linkedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Remove a link — e.g. when someone leaves, or when an account was pointed at
 * the wrong record. The account immediately stops resolving to any employee,
 * so it reads none of that employee's salary or leave.
 */
export async function unlinkEmployeeAccount(uid: string): Promise<void> {
  const id = uid.trim();
  if (!id) return;
  await deleteDoc(doc(db, 'employee_links', id));
}
