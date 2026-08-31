/**
 * Authentication context & hooks.
 *
 * Supports email + password sign-in. There is no sign-up: see the note
 * where signUpEmail used to be.
 *
 * On every successful sign-in, a profile document is upserted at
 * `users/{uid}` in Firestore with a `role` field. Emails present in
 * `ADMIN_EMAILS` are always granted (and kept synced to) the `admin` role;
 * everyone else defaults to `employee`. Role changes made by an admin via
 * the Admin Dashboard are respected on subsequent logins unless the email
 * is a hard-coded admin (in which case admin access can never be revoked
 * by mistake).
 */

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    isSignInWithEmailLink,
    signOut,
    type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { setActiveOrgKey, resolveOrgKeyForProfile } from './orgScope';
import { startOrgSettingsSync } from './orgSettings';
import { startSubscriptionSync } from './subscriptionSync';
import { startOrgFeatureSync } from './features';
import { getEmployeeByEmail, linkEmployeeToAuthAccount } from '@/data/employees';

// ---------------------------------------------------------------------------
// Admin allow-list
// ---------------------------------------------------------------------------
// E2E test accounts are only granted elevated roles when the build explicitly
// enables them (VITE_ENABLE_E2E_ACCOUNTS=true), so production deployments never
// ship privileged test logins.
const E2E_ACCOUNTS_ENABLED = import.meta.env.VITE_ENABLE_E2E_ACCOUNTS === 'true';
const E2E_ADMIN_EMAILS = E2E_ACCOUNTS_ENABLED ? ['playwright-e2e-admin@modcon-hr.test'] : [];
const E2E_MANAGER_EMAILS = E2E_ACCOUNTS_ENABLED ? ['playwright-e2e-manager@modcon-hr.test'] : [];

export const ADMIN_EMAILS = [
    'sumanthbolla97@gmail.com',
    'saikrishnakoppaka@gmail.com',
    'info@modconbuilders.com',
    ...E2E_ADMIN_EMAILS,
].map((e) => e.toLowerCase());

// Emails that are always granted the `manager` role on sign-in.
export const MANAGER_EMAILS = [
    ...E2E_MANAGER_EMAILS,
].map((e) => e.toLowerCase());

// Super-admins are always `admin` role (see ADMIN_EMAILS above) plus this
// marker flag. Super admins can see/create organizations (see
// src/pages/organizations) and are not scoped to any single `orgId`.
export const SUPER_ADMIN_EMAILS = [
    'saikrishnakoppaka@gmail.com',
].map((e) => e.toLowerCase());

/**
 * `hr` is a real, assignable role — not a label. An HR Manager has
 * admin-equivalent reach over people data, but only inside their own
 * organization: they never see the Organizations page and are never a super
 * admin. See `resolveAppRole` and `canAccessModule` in lib/accessControl.ts.
 */
export type UserRole = 'admin' | 'hr' | 'manager' | 'employee';

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    photoURL: string | null;
    role: UserRole;
    superAdmin?: boolean;
    /** Organization this profile belongs to. Unset for super admins and for
     * legacy/hard-coded accounts that predate multi-org support. */
    orgId?: string;
    createdAt?: unknown;
    lastLoginAt?: unknown;
}

export const USER_ROLES: UserRole[] = ['admin', 'hr', 'manager', 'employee'];

/** Narrows a stored `users/{uid}.role` value, which is arbitrary data as far as
 * the client is concerned. Anything unrecognised — including documents written
 * before a role existed — falls back to the least-privileged role. */
function asUserRole(value: unknown): UserRole {
    return USER_ROLES.includes(value as UserRole) ? (value as UserRole) : 'employee';
}

/** Roles that an administrator's assignment may confer at sign-in. `admin` is
 *  excluded here and in firestore.rules: it is granted directly on a profile by
 *  an existing admin, not through the employee-directory flow. */
const ASSIGNABLE_ON_SIGN_IN: UserRole[] = ['hr', 'manager', 'employee'];

async function readAssignedRole(email: string): Promise<UserRole | null> {
    const id = email.trim().toLowerCase();
    if (!id) return null;
    try {
        const snap = await getDoc(doc(db, 'role_assignments', id));
        if (!snap.exists()) return null;
        const role = snap.data().role as UserRole;
        return ASSIGNABLE_ON_SIGN_IN.includes(role) ? role : null;
    } catch {
        // Never block sign-in on this lookup.
        return null;
    }
}

// ---------------------------------------------------------------------------
// Firestore profile sync
// ---------------------------------------------------------------------------
async function upsertUserProfile(user: User): Promise<UserProfile> {
    const email = (user.email ?? '').toLowerCase();
    const isHardcodedAdmin = ADMIN_EMAILS.includes(email);
    const isHardcodedManager = MANAGER_EMAILS.includes(email);
    const ref = doc(db, 'users', user.uid);
    const existing = await getDoc(ref);

    const storedRole = asUserRole(existing.exists() ? existing.data().role : undefined);

    // A role an administrator granted to this address before the account
    // existed — how someone added to the HR department picks up their access
    // the first time they sign in. Never consulted for the hard-coded lists,
    // and never able to produce `admin`: firestore.rules verifies this write
    // against the same document, and only accepts hr/manager/employee.
    // Deliberately does not downgrade someone whose profile already carries a
    // higher role, so assigning `employee` cannot demote an admin.
    const assigned = isHardcodedAdmin || isHardcodedManager
        ? null
        : await readAssignedRole(email);

    const role: UserRole = isHardcodedAdmin
        ? 'admin'
        : isHardcodedManager
            ? 'manager'
            : storedRole === 'admin'
                ? 'admin'
                : assigned ?? storedRole;

    // orgId is assigned once at org-creation time (see src/lib/organizations.ts)
    // and never set here, but must be carried forward so it isn't dropped from
    // the in-memory profile on every subsequent sign-in.
    const existingOrgId = existing.exists() ? (existing.data().orgId as string | undefined) : undefined;

    const profile: UserProfile = {
        uid: user.uid,
        email,
        displayName: user.displayName || email.split('@')[0],
        photoURL: user.photoURL,
        role,
        superAdmin: SUPER_ADMIN_EMAILS.includes(email),
        ...(existingOrgId ? { orgId: existingOrgId } : {}),
    };

    await setDoc(
        ref,
        {
            ...profile,
            lastLoginAt: serverTimestamp(),
            ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true },
    );

    return profile;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
interface AuthContextValue {
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    isAdmin: boolean;
    /** True for the HR Manager role. Distinct from `isAdmin`: an HR Manager has
     * admin-level reach over their own organization's people data, but is not a
     * platform admin and can never act across organizations. */
    isHR: boolean;
    /** True for managers, HR managers and admins (each has all manager privileges). */
    isManager: boolean;
    /** Reserved for future cross-org scoping; not yet enforced anywhere. */
    isSuperAdmin: boolean;
    error: string;
    clearError: () => void;
    signInEmail: (email: string, password: string) => Promise<void>;
    signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The message shown when sign-in fails.
 *
 * Every wrong-credential case returns the *same* sentence, deliberately.
 * `auth/user-not-found` used to say "No account found with that email", which
 * answers a question the person asking is not entitled to have answered: it
 * confirms, one address at a time, exactly who has an account here. On a
 * product with no self-registration — where holding an account means somebody
 * decided you should — that list is worth something to an attacker, and
 * assembling it needs nothing but the login form.
 *
 * The trade is a slightly less helpful message for someone who mistyped their
 * address. Firebase's own rate limiting still surfaces separately, because
 * "you are locked out for a while" is not a fact about who exists.
 */
function friendlyAuthError(err: unknown): string {
    const code = (err as { code?: string })?.code ?? '';
    const SAME_FOR_EVERY_BAD_CREDENTIAL = 'Incorrect email or password.';
    const map: Record<string, string> = {
        'auth/invalid-credential': SAME_FOR_EVERY_BAD_CREDENTIAL,
        'auth/user-not-found': SAME_FOR_EVERY_BAD_CREDENTIAL,
        'auth/wrong-password': SAME_FOR_EVERY_BAD_CREDENTIAL,
        'auth/invalid-login-credentials': SAME_FOR_EVERY_BAD_CREDENTIAL,
        'auth/email-already-in-use': 'An account already exists with that email.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/popup-closed-by-user': 'Sign-in popup was closed before completing.',
        'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    };
    return map[code] ?? 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);
            if (firebaseUser) {
                try {
                    const p = await upsertUserProfile(firebaseUser);
                    setProfile(p);
                    // The src/data/*.ts local-overlay layer reads its org
                    // namespace at plain module-load time (see orgScope.ts),
                    // so if this sign-in belongs to a different org than
                    // whatever was last active on this browser, reload once
                    // to re-evaluate every module under the correct org —
                    // otherwise a different org's admin could briefly see
                    // (or worse, edit) the previous org's local data. Super
                    // admins have no orgId of their own — resolveOrgKeyForProfile
                    // uses whichever org they last switched to instead.
                    if (setActiveOrgKey(resolveOrgKeyForProfile(p))) {
                        window.location.reload();
                        return;
                    }
                    // Bind this account to its directory record now, while the
                    // sign-in address still matches the work email on it. The
                    // work email is editable from the profile; the uid is not,
                    // so from here on the person is found by uid and editing
                    // their email cannot cut them off from their own profile.
                    // Runs after the org key is settled, so it writes into the
                    // right org's overlay.
                    const record = getEmployeeByEmail(p.email);
                    if (record) linkEmployeeToAuthAccount(record.id, p.uid);
                } catch {
                    setProfile(null);
                }
            } else {
                setProfile(null);
            }
            setLoading(false);
        });
        return unsub;
    }, []);

    // Hydrate the organisation's configuration — leave policies, company
    // profile, holiday calendar, departments, permission matrix, preferences —
    // from Firestore into the localStorage cache the data modules read.
    //
    // Here rather than at module load because it needs the resolved profile to
    // know which organisation's documents to subscribe to, and because the
    // subscription must be torn down when the account changes. The modules keep
    // reading localStorage synchronously; this is what keeps that copy the
    // organisation's rather than the browser's. See src/lib/orgSettings.ts.
    useEffect(() => {
        if (!profile) return;
        const stopSettings = startOrgSettingsSync(profile);
        // Per-organisation feature flags, from the same resolved profile. A
        // separate subscription because it is a different thing with different
        // rules: configuration the organisation owns, versus a platform
        // decision about which tenants a change has reached yet.
        const stopFeatures = startOrgFeatureSync(profile);
        // Whether this organisation has paid. A third subscription rather than
        // a field on one of the above, because it is written by the payment
        // webhook and by nothing in this client — see lib/subscriptionSync.ts.
        const stopSubscription = startSubscriptionSync(profile);
        return () => {
            stopSettings();
            stopFeatures();
            stopSubscription();
        };
    }, [profile?.uid, profile?.orgId]);

    const clearError = () => setError('');

    async function signInEmail(email: string, password: string) {
        setError('');
        try {
            await signInWithEmailAndPassword(auth, email.trim(), password);
        } catch (err) {
            setError(friendlyAuthError(err));
            throw err;
        }
    }

    // No signUpEmail. Self-registration created an account with no `orgId`,
    // and "no orgId" resolved to the default organisation — so anyone who
    // signed up could read the default tenant's directory, attendance, jobs,
    // expenses and assets. The rules now fail closed for an unassigned account
    // (myOrgKey in firestore.rules) and this removes the way to make one.
    //
    // Accounts are created by super-admin org provisioning
    // (src/lib/organizations.ts, on a throwaway secondary FirebaseApp so the
    // caller's own session survives) or by an administrator attaching an
    // existing one. See G7 in docs/tenant-isolation-spec.md.

    async function signOutUser() {
        await signOut(auth);
    }

    const isAdmin = profile?.role === 'admin';
    const isHR = profile?.role === 'hr';
    const isManager = profile?.role === 'manager' || isHR || isAdmin;
    const isSuperAdmin = profile?.superAdmin === true;

    return (
        <AuthContext.Provider
            value={{
                user,
                profile,
                loading,
                isAdmin,
                isHR,
                isManager,
                isSuperAdmin,
                error,
                clearError,
                signInEmail,
                signOutUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
