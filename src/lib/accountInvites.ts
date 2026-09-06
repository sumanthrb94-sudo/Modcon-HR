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
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from './firebase';
import { assignRole } from '@/data/roleAssignments';
import { getEmployeeDirectory } from '@/data/employees';
import { passwordActionSettings } from './authEmail';
import type { UserRole } from './auth';

/** Roles an administrator may hand out here. `admin` is never one of them —
 *  same restriction as role_assignments and the /users rules. */
export const INVITABLE_ROLES: UserRole[] = ['employee', 'manager', 'hr'];

/**
 * A throwaway FirebaseApp to create the account on.
 *
 * `createUserWithEmailAndPassword` signs the client in as whoever it just
 * created, so it cannot run on the primary `auth` without dropping the
 * inviter's own session.
 *
 * The emulator wiring is not optional. The primary app is pointed at the Auth
 * emulator in lib/firebase.ts when `VITE_AUTH_EMULATOR_HOST` is set; an app
 * created here knows nothing about that, so without these three lines an
 * emulated run — the sandbox, the E2E suite — mints **real accounts on the
 * production project**. `organizations.ts` had this exact bug and fixed it;
 * this copy never got the fix.
 */
function secondaryAuth(label: string) {
  const app = initializeApp(firebaseConfig, `${label}-${Date.now()}`);
  const auth = getAuth(app);
  const emulator = import.meta.env.VITE_AUTH_EMULATOR_HOST;
  if (emulator) connectAuthEmulator(auth, `http://${emulator}`, { disableWarnings: true });
  return { app, auth };
}

/**
 * Ask Firebase to email this address a link for setting a password.
 *
 * This is the whole answer to "how does a new joiner get their login". It is
 * Firebase's own password-reset mail, sent to an account that has just been
 * created with a password nobody has ever seen — so there is no secret to hand
 * over, nothing to read off one screen and type into another, and the employee
 * ends up with a password their employer does not know. It needs no backend:
 * the mail is sent by Firebase Auth, not by this app.
 *
 * The alternative it replaces is the temporary password below, which is still
 * produced and still shown, because email is not reliable — an employee with a
 * misspelled address, or a company whose filter eats the message, needs a way
 * in that does not depend on the message arriving.
 */
export async function sendSetPasswordEmail(email: string): Promise<void> {
  const address = email.trim().toLowerCase();
  if (!address) throw new Error('An email address is required.');
  const { app, auth } = secondaryAuth('invite-mail');
  try {
    await sendPasswordResetEmail(auth, address, passwordActionSettings());
  } finally {
    await deleteApp(app);
  }
}

function randomPassword(length = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export interface InviteAccountInput {
  name: string;
  email: string;
  role: UserRole;
  /** The inviter's own organisation. Never chosen in the form. */
  orgId: string;
  /**
   * Have Firebase email them a set-password link. Default true — it is the
   * path that does not require the inviter to carry a password to somebody.
   */
  sendEmail?: boolean;
}

export interface InviteAccountResult {
  uid: string;
  email: string;
  tempPassword: string;
  /** Set when the new account was matched to an employee record. */
  linkedEmployeeId?: string;
  /** Why no link was made, when one was not. */
  linkNote?: string;
  /** Whether Firebase accepted the set-password mail for delivery. */
  emailSent: boolean;
  /** Why it did not, when it did not — the temporary password is the way in. */
  emailError?: string;
}

/**
 * Create an account in the caller's organisation, and get the new joiner in.
 *
 * By default Firebase emails them a link to set their own password, so nothing
 * secret has to travel from the inviter to the employee — which is the step
 * that kept failing, twice on the organisation-provisioning path alone,
 * because fourteen random characters do not survive being read off a laptop
 * and typed into a phone.
 *
 * A temporary password is still generated and still returned, because email is
 * not reliable and a company whose filter eats the message needs a way in that
 * does not depend on the message arriving. It is shown once and never stored.
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
  const { app: secondaryApp, auth: inviteAuth } = secondaryAuth('invite');

  try {
    const cred = await createUserWithEmailAndPassword(inviteAuth, email, tempPassword);
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

    await signOut(inviteAuth);

    // After the sign-out, so the mail is sent by an app that is not holding a
    // session for the account it is about. Never fatal: the account exists
    // either way, and the temporary password is what gets them in when this
    // fails.
    let emailSent = false;
    let emailError: string | undefined;
    if (input.sendEmail !== false) {
      try {
        await sendPasswordResetEmail(inviteAuth, email, passwordActionSettings());
        emailSent = true;
      } catch (err) {
        emailError = friendlyInviteError(err);
      }
    }

    return { uid, email, tempPassword, emailSent, emailError, ...link };
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
    // The **directory**, not the Firestore `employees` collection this used to
    // query. Employees added through Employees → Add Employee live in the
    // localStorage overlay (data/employees.ts) and are never written to that
    // collection, which holds the seeded demo dataset — so every person hired
    // through the app failed this match and was reported as having no record.
    // The order HR actually works in is "hire them, then give them a login",
    // and that was the order this could not serve.
    //
    // Reading a client-side directory to choose an employeeId is the same
    // trust the sibling `linkAccountForEmployee` already places in it: the
    // administrator says who this is, and `firestore.rules` decides whether
    // they may say it. The claim being checked here is the *administrator's*,
    // not the new account's.
    const matches = getEmployeeDirectory().filter(
      (employee) => (employee.email ?? '').trim().toLowerCase() === email,
    );
    if (matches.length === 0) {
      return { linkNote: 'No employee record carries this address yet — link it once one does.' };
    }
    if (matches.length > 1) {
      return { linkNote: `${matches.length} employee records share this address, so it was not linked automatically.` };
    }
    const employeeId = matches[0].id;
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
