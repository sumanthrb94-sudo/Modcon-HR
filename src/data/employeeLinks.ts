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
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
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

export type LinkOutcome =
  | { status: 'linked'; uid: string }
  | { status: 'no-account' }
  | { status: 'already-linked' }
  | { status: 'ambiguous'; count: number }
  | { status: 'conflict'; employeeId: string }
  | { status: 'failed'; reason: string };

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Point an existing account at an employee record just added to the directory.
 *
 * The other direction — account created first, employee record found for it —
 * is `linkToEmployeeRecord` in lib/accountInvites.ts. This is the same join
 * approached from the other side, and it exists because the two halves of an
 * employee's identity are created by different flows and neither one used to
 * complete the join:
 *
 *   Admin → Create account   writes the account, and links it to an employee
 *                            record if one already carries the address.
 *   Employees → Add Employee writes the directory record… and nothing else.
 *
 * So anyone hired in that order stayed unlinked, and `isSelf()` in
 * firestore.rules resolved them to no employee — they read none of their own
 * salary or leave and could not file their own documents. Failing closed is
 * right; failing closed silently, on the ordinary hiring path, is not. The
 * identity backfill (lib/accessBackfill.ts) existed to repair it, but only if
 * someone remembered to run it.
 *
 * As conservative as both the flows it joins: linked only when exactly one
 * account **in this organisation** carries the address, and never over a link
 * that already points somewhere else. A wrong link is not cosmetic — it hands
 * someone another employee's salary — so anything ambiguous is reported and
 * left for a human.
 */
export async function linkAccountForEmployee(params: {
  employeeId: string;
  email: string;
  orgId?: string;
  linkedBy: string;
}): Promise<LinkOutcome> {
  const email = normalizeEmail(params.email);
  const employeeId = params.employeeId.trim();
  if (!email || !employeeId) return { status: 'no-account' };
  const orgKey = params.orgId || DEFAULT_ORG_KEY;

  try {
    // The default org holds accounts written before multi-tenancy, which carry
    // no `orgId` at all — and an equality filter matches neither a missing
    // field nor a null one. Same split, and the same reasoning, as
    // backfillEmployeeLinks.
    const snap = orgKey === DEFAULT_ORG_KEY
      ? await getDocs(collection(db, 'users'))
      : await getDocs(query(collection(db, 'users'), where('orgId', '==', orgKey)));

    const accounts = snap.docs.filter((d) => {
      if (normalizeEmail(d.data().email) !== email) return false;
      const accountOrg = (d.data().orgId as string | undefined) || DEFAULT_ORG_KEY;
      return accountOrg === orgKey;
    });

    if (accounts.length === 0) return { status: 'no-account' };
    if (accounts.length > 1) return { status: 'ambiguous', count: accounts.length };

    const uid = accounts[0].id;
    const existing = await getEmployeeLink(uid);
    if (existing?.employeeId === employeeId) return { status: 'already-linked' };
    // Re-pointing an account that is already somebody is not a join, it is a
    // reassignment — and the wrong one hands over a salary. Left for a human,
    // who has Admin → Create account and the backfill to do it deliberately.
    if (existing?.employeeId) return { status: 'conflict', employeeId: existing.employeeId };

    await linkEmployeeAccount({ uid, employeeId, orgId: orgKey, linkedBy: params.linkedBy });
    return { status: 'linked', uid };
  } catch (err) {
    return { status: 'failed', reason: String(err) };
  }
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
