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
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
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

// ---------------------------------------------------------------------------
// The signed-in account's own link, readable synchronously
// ---------------------------------------------------------------------------
//
// Everything above is the administrator's end of this: writing a link, finding
// one, removing one. What follows is the *reader's* end, and it exists because
// the app had a second, incompatible answer to "who is this account".
//
// `getCurrentEmployee` matched the signed-in account against the employee
// directory — by `authUid`, then by work email, then by display name. That is a
// claim the client makes about itself, and it is not what the server uses:
// `myEmployeeId()` in firestore.rules resolves `employee_links/{uid}` and
// nothing else. When the two disagree the UI acts as one person while every
// write is judged as another, and the failure is silent in the worst
// direction — a check-in stamp refused by `isSelf`, a payslip the employee
// cannot read, an employee document filed as somebody else. Editing a work
// email was enough to cause it.
//
// So the link becomes the answer wherever there is one. It has to be readable
// *synchronously*, because `getCurrentEmployee` is called from render paths and
// from module-level data code that cannot await — the same constraint that
// makes org settings a Firestore store with a localStorage cache, and this is
// the same arrangement: Firestore is the truth, this cache is how a synchronous
// caller reads it, and a subscription keeps it current.
//
// The cache carries the uid it was written for. A browser signs two people in
// one after another, and a link cached under the previous account would answer
// for the next one — which is precisely the confusion of identity this exists
// to remove.

const LINK_CACHE_KEY = 'modcon.hr.myEmployeeLink';

/** Fired when the signed-in account's link is hydrated or changes. */
export const EMPLOYEE_LINK_CHANGED_EVENT = 'modcon-hr-employee-link-changed';

interface CachedLink {
  uid: string;
  /** The linked record, or null when an administrator has linked nothing. */
  employeeId: string | null;
}

/**
 * This session's answer, held in memory as well as in localStorage.
 *
 * The localStorage copy is what survives a reload, so the first paint after one
 * already knows who this account is. The memory copy is what survives the
 * cache being cleared out from under the subscription — `onSnapshot` fires on
 * change, so a wiped key would not be rewritten and the account would quietly
 * fall back to the directory match for the rest of the page. Several E2E specs
 * clear `localStorage` keys wholesale, and devtools is one click from doing the
 * same.
 */
let liveLink: CachedLink | null = null;

function readCachedLink(): CachedLink | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LINK_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedLink>;
    if (typeof parsed?.uid !== 'string' || !parsed.uid) return null;
    const employeeId = typeof parsed.employeeId === 'string' && parsed.employeeId ? parsed.employeeId : null;
    return { uid: parsed.uid, employeeId };
  } catch {
    return null;
  }
}

function writeCachedLink(next: CachedLink): void {
  if (typeof window === 'undefined') return;
  const current = liveLink ?? readCachedLink();
  const unchanged = Boolean(current && current.uid === next.uid && current.employeeId === next.employeeId);
  liveLink = next;
  try {
    window.localStorage.setItem(LINK_CACHE_KEY, JSON.stringify(next));
  } catch {
    // The in-memory copy still stands; a browser refusing storage should not
    // cost this session its identity.
  }
  if (!unchanged) window.dispatchEvent(new Event(EMPLOYEE_LINK_CHANGED_EVENT));
}

/**
 * The employee record an administrator says this account is, or null.
 *
 * Null covers three different states on purpose — no link, not signed in, and
 * not yet hydrated — because all three mean the same thing to a caller: this
 * is not a question the server has answered yet, so fall back to whatever the
 * directory says and be prepared for the answer to change. `useMyEmployeeId`
 * is the version that can tell "resolved to nothing" from "still resolving",
 * and surfaces that distinction where a control must not be offered on a guess.
 */
export function getLinkedEmployeeId(uid: string | null | undefined): string | null {
  const id = (uid ?? '').trim();
  if (!id) return null;
  const cached = liveLink?.uid === id ? liveLink : readCachedLink();
  return cached && cached.uid === id ? cached.employeeId : null;
}

/**
 * Keep the cache above in step with `employee_links/{uid}` for the life of the
 * session.
 *
 * A subscription rather than a one-off read: an administrator can link or
 * unlink an account while its owner is signed in, and the whole point of
 * `unlinkEmployeeAccount` is that the account stops resolving to that employee
 * — which it would not do until the next reload if this were fetched once.
 * Same reasoning as `watchUserProfile` for the role.
 */
export function startEmployeeLinkSync(uid: string): () => void {
  const id = uid.trim();
  if (!id) return () => {};

  // Clear a link cached for a different account before the first snapshot
  // arrives, or this account briefly answers as the previous one.
  const cached = readCachedLink();
  if (cached && cached.uid !== id) clearEmployeeLinkCache();

  return onSnapshot(
    doc(db, 'employee_links', id),
    (snap) => {
      const employeeId = snap.exists() ? ((snap.data() as EmployeeLink).employeeId ?? null) : null;
      writeCachedLink({ uid: id, employeeId: employeeId || null });
    },
    () => {
      // A read failure leaves whatever was cached rather than asserting "no
      // link": dropping it would demote a linked employee to nobody on a
      // dropped connection, and nobody reads none of their own salary.
    },
  );
}

/** Forget the cached link. Called on sign-out — the next account is not this one. */
export function clearEmployeeLinkCache(): void {
  liveLink = null;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LINK_CACHE_KEY);
  } catch {
    // Nothing to undo — the in-memory copy is already gone, which is the half
    // that answers.
  }
  window.dispatchEvent(new Event(EMPLOYEE_LINK_CHANGED_EVENT));
}
