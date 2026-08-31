/**
 * Creating an account for a colleague.
 *
 * ## Why this exists
 *
 * Until now the only ways an account came into being were super-admin org
 * provisioning, which mints exactly one HR administrator per organisation, and
 * public self-registration on the login page. Everyone else — every ordinary
 * employee — arrived through the second one, and that account carried **no
 * `orgId`**, because a self-write is forbidden from naming its own organisation
 * (it would otherwise be a self-service tenant switch, see the /users rules).
 *
 * "No orgId" used to resolve to the default organisation, so self-registration
 * was a door into the incumbent tenant, and it has been removed (G7 in
 * docs/tenant-isolation-spec.md). That closed the hole and left a hole in the
 * product: no way to onboard an employee at all. This is that way, and it is
 * the shape the fix wanted from the start — an account is created **by someone
 * who already holds the privilege**, and stamped with their organisation at the
 * moment it is created, so an unassigned account never exists.
 *
 * ## How
 *
 * The same trick org provisioning uses: `createUserWithEmailAndPassword` signs
 * the client in as whoever it just created, so the call runs on a throwaway
 * secondary `FirebaseApp` and the inviter's own session on the primary `auth`
 * is untouched.
 *
 * The profile is then written through the *primary* `db`, as the inviter, which
 * is what makes it legal: `firestore.rules` lets an administrator create a user
 * document in their own organisation, and lets nobody create one without an
 * organisation at all.
 */
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth';
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db, firebaseConfig } from './firebase';
import { assignRole } from '@/data/roleAssignments';
import { randomPassword } from './tempPassword';
import type { UserRole } from './auth';

/** Roles an administrator may hand out here. `admin` is never one of them —
 *  same restriction as role_assignments and the /users rules. */
export const INVITABLE_ROLES: UserRole[] = ['employee', 'manager', 'hr'];

export interface InviteAccountInput {
  name: string;
  email: string;
  role: UserRole;
  /** The inviter's own organisation. Never chosen in the form. */
  orgId: string;
}

export interface InviteAccountResult {
  uid: string;
  email: string;
  tempPassword: string;
  /** Set when the new account was matched to an employee record. */
  linkedEmployeeId?: string;
  /** Why no link was made, when one was not. */
  linkNote?: string;
}

/**
 * Create an account in the caller's organisation and hand back its password.
 *
 * The password is shown once and never stored — there is no email delivery in
 * this app, so the inviter passes it on. That is worth stating plainly rather
 * than implying a mail flow that does not exist.
 */
export async function inviteAccount(
  input: InviteAccountInput,
  invitedByUid: string,
): Promise<InviteAccountResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const role = input.role;

  if (!email) throw new Error('An email address is required.');
  if (!input.orgId) {
    // Refused rather than defaulted. Guessing an organisation here is how an
    // account ends up in the wrong tenant, and the rules would reject it
    // anyway — failing here says why.
    throw new Error('Your account has no organisation, so it cannot create one for someone else.');
  }
  if (!INVITABLE_ROLES.includes(role)) {
    throw new Error(`${role} cannot be granted here.`);
  }

  const tempPassword = randomPassword();
  const secondaryApp = initializeApp(firebaseConfig, `invite-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
    if (name) await updateProfile(cred.user, { displayName: name });
    const uid = cred.user.uid;

    // Written as the inviter, through the primary db. `orgId` is present and is
    // the inviter's own — the whole point of the flow.
    await setDoc(doc(db, 'users', uid), {
      uid,
      email,
      displayName: name || email.split('@')[0],
      photoURL: null,
      role,
      orgId: input.orgId,
      superAdmin: false,
      createdAt: serverTimestamp(),
      lastLoginAt: null,
      invitedBy: invitedByUid,
    });

    // Durability, not authorization: if the profile document is ever deleted
    // and rebuilt by a later sign-in, the role is restored from here. The
    // profile above is what actually grants access, so a failure is swallowed.
    await assignRole({ email, role, orgId: input.orgId, assignedBy: invitedByUid }).catch(() => {});

    const link = await linkToEmployeeRecord(uid, email, input.orgId, invitedByUid);

    await signOut(secondaryAuth);
    return { uid, email, tempPassword, ...link };
  } finally {
    await deleteApp(secondaryApp);
  }
}

/**
 * Point the new account at its employee record, if that is unambiguous.
 *
 * This is the hook `docs/multi-tenancy-spec.md` §8 recorded as missing —
 * "`employee_links` is not populated automatically… new joiners still need
 * linking as they are hired". Without a link an account resolves to no employee
 * and reads none of its own salary or leave, so every invite would have needed
 * a follow-up backfill run to be useful.
 *
 * Deliberately as conservative as the backfill it mirrors: linked only when
 * exactly one employee **in this organisation** carries the address. A wrong
 * link is not cosmetic — it hands someone another employee's salary — so
 * anything ambiguous is reported and left for a human. Best-effort: the account
 * is already created and must not be rolled back over this.
 */
async function linkToEmployeeRecord(
  uid: string,
  email: string,
  orgId: string,
  linkedBy: string,
): Promise<{ linkedEmployeeId?: string; linkNote?: string }> {
  try {
    const snap = await getDocs(query(
      collection(db, 'employees'),
      where('orgId', '==', orgId),
      where('email', '==', email),
    ));
    if (snap.empty) {
      return { linkNote: 'No employee record carries this address yet — link it once one does.' };
    }
    if (snap.size > 1) {
      return { linkNote: `${snap.size} employee records share this address, so it was not linked automatically.` };
    }
    const employeeId = snap.docs[0].id;
    await setDoc(doc(db, 'employee_links', uid), {
      uid, employeeId, orgId, linkedBy, linkedAt: serverTimestamp(),
    });
    return { linkedEmployeeId: employeeId };
  } catch (err) {
    return { linkNote: `The account was created, but linking it to an employee record failed: ${String(err)}` };
  }
}

export function friendlyInviteError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/email-already-in-use': 'That address already has an account.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Could not set a valid temporary password. Please try again.',
  };
  return map[code] ?? (err as Error)?.message ?? 'Could not create the account.';
}
