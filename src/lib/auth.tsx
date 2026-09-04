/**
 * Authentication context & hooks.
 *
 * Supports email + password sign-in. There is no sign-up: see the note
 * where signUpEmail used to be.
 *
 * On every successful sign-in, a profile document is upserted at
 * `users/{uid}` in Firestore with a `role` field. Emails present in
 * `ADMIN_EMAILS` are always granted (and kept synced to) the `admin` role;
 * everyone else defaults to `employee`.
 *
 * That document is then **subscribed to for the life of the session**
 * (`watchUserProfile`), so a role changed by an administrator reaches the
 * session it is about without waiting for a sign-out. It used to be read once
 * and cached in React state, which meant a revocation had no effect on the
 * person it was revoking until they happened to log out and back in. A
 * hard-coded admin address is still pinned to `admin` on both paths, so admin
 * access can never be revoked by mistake.
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
    sendPasswordResetEmail,
    isSignInWithEmailLink,
    signOut,
    type User,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, authPersistenceReady } from './firebase';
import { setActiveOrgKey, resolveOrgKeyForProfile } from './orgScope';
import { startOrgSettingsSync } from './orgSettings';
import { startSharedCollectionsSync } from '@/data/persistence';
import { startOrgFeatureSync } from './features';
import { getEmployeeByEmail, linkEmployeeToAuthAccount } from '@/data/employees';

// ---------------------------------------------------------------------------
// Admin allow-list
// ---------------------------------------------------------------------------
// E2E test accounts are only granted elevated roles when the build explicitly
// enables them (VITE_ENABLE_E2E_ACCOUNTS=true), so production deployments never
// ship privileged test logins.
const E2E_ACCOUNTS_ENABLED = import.meta.env.VITE_ENABLE_E2E_ACCOUNTS === 'true';

/**
 * One E2E persona's address, from the build that the suite configured.
 *
 * The addresses used to be literals here while tests/e2e/config.ts let each one
 * be overridden with an `E2E_*_EMAIL` environment variable. Overriding one then
 * left the two halves disagreeing about who the persona was, and the suite
 * failed somewhere far from the cause — the account signed in fine and simply
 * had none of the role it was written to exercise. playwright.config.ts now
 * passes the same values into the build (VITE_E2E_*_EMAIL), so there is one
 * source for them; the literal is the default both sides start from.
 *
 * Empty unless the build opted in, so production ships no privileged test login
 * whatever the environment says.
 */
function e2eEmail(configured: string | undefined, fallback: string): string[] {
    if (!E2E_ACCOUNTS_ENABLED) return [];
    return [(configured || fallback).trim().toLowerCase()];
}

const E2E_ADMIN_EMAILS = e2eEmail(
    import.meta.env.VITE_E2E_ADMIN_EMAIL,
    'playwright-e2e-admin@modcon-hr.test',
);
const E2E_MANAGER_EMAILS = e2eEmail(
    import.meta.env.VITE_E2E_MANAGER_EMAIL,
    'playwright-e2e-manager@modcon-hr.test',
);
// The one persona that can act across organisations, so the suite can prove a
// second organisation sees none of the first's configuration. It is a platform
// admin as well, because every super admin is (see SUPER_ADMIN_EMAILS below).
//
// The rules keep their own hard-coded list (`fixedSuperAdminEmails` in
// firestore.rules) and this email is not in it — deliberately. A self-write may
// only re-affirm the flag a document already carries, so the seeded profile in
// tests/e2e/firestore.ts is what makes this account a super admin, and no build
// of the app can promote itself into one.
const E2E_SUPER_ADMIN_EMAILS = e2eEmail(
    import.meta.env.VITE_E2E_SUPER_ADMIN_EMAIL,
    'playwright-e2e-super@modcon-hr.test',
);

export const ADMIN_EMAILS = [
    'sumanthbolla97@gmail.com',
    ...E2E_ADMIN_EMAILS,
    ...E2E_SUPER_ADMIN_EMAILS,
].map((e) => e.toLowerCase());

// Emails that are always granted the `manager` role on sign-in.
export const MANAGER_EMAILS = [
    ...E2E_MANAGER_EMAILS,
].map((e) => e.toLowerCase());

// Super-admins are always `admin` role (see ADMIN_EMAILS above) plus this
// marker flag. Super admins can see/create organizations (see
// src/pages/organizations) and are not scoped to any single `orgId`.
export const SUPER_ADMIN_EMAILS = [
    'sumanthbolla97@gmail.com',
    ...E2E_SUPER_ADMIN_EMAILS,
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
/**
 * The in-memory profile for a resolved role — the one shape both the sign-in
 * upsert and the live listener below produce.
 *
 * Written once rather than twice because the two paths must agree about what a
 * profile *is*. A second copy is a second chance to drop `superAdmin` or
 * `orgId`, and dropping `orgId` is not a cosmetic bug: `myOrgKey()` in
 * firestore.rules resolves an unassigned account to a sentinel matching
 * nothing, so the session would read none of its own organisation's data.
 */
function buildProfile(user: User, role: UserRole, orgId: string | undefined): UserProfile {
    const email = (user.email ?? '').toLowerCase();
    return {
        uid: user.uid,
        email,
        displayName: user.displayName || email.split('@')[0],
        photoURL: user.photoURL,
        role,
        superAdmin: SUPER_ADMIN_EMAILS.includes(email),
        ...(orgId ? { orgId } : {}),
    };
}

/**
 * The role a stored profile confers *right now*, for the live listener.
 *
 * The hard-coded allow-lists still win, exactly as they do at sign-in: an
 * edit to a hard-coded admin's document must not demote them, or the running
 * app and the next sign-in would disagree about who they are.
 *
 * `role_assignments` is deliberately not consulted here. It is a grant made
 * before an account exists, and `applyRoleToExistingAccount`
 * (src/data/roleAssignments.ts) mirrors every change to it into `users/{uid}`
 * for accounts that already do — so this one document is the whole live
 * signal, and an HR designation granted or withdrawn in Settings arrives
 * through it like any other role change.
 */
function liveRole(email: string, stored: unknown): UserRole {
    if (ADMIN_EMAILS.includes(email)) return 'admin';
    if (MANAGER_EMAILS.includes(email)) return 'manager';
    return asUserRole(stored);
}

/**
 * Keep `profile` in step with `users/{uid}` for as long as this session lasts.
 *
 * The role was read once, at sign-in, and then held in React state — so every
 * way of changing somebody's role landed in Firestore and changed nothing
 * about the app in front of them until they signed out and back in. That is
 * not a cosmetic lag: `applyRoleToExistingAccount` exists *because* moving
 * somebody out of the HR department has to revoke their administrator access
 * immediately, and it wrote the document that nobody was reading. Admin
 * dashboard role changes, "Set HR admin" and "Review admin roles" in
 * Organizations, and the HR-designation grant all write here, so one listener
 * covers every one of them.
 *
 * Everything downstream is already derived from `profile` on each render —
 * the route guards in App.tsx, the sidebar's `navItems` filter, module access,
 * and `lib/dataScope.ts` — so publishing a new profile is the whole of
 * "across the app". Somebody demoted while sitting on `/admin` is redirected
 * by `RequireOrgAdmin` on the next render rather than continuing to act with
 * an authority the server has already withdrawn.
 */
function watchUserProfile(
    user: User,
    initialOrgId: string | undefined,
    apply: (profile: UserProfile) => void,
): () => void {
    return onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
            const data = snap.exists() ? snap.data() : undefined;
            const email = (user.email ?? '').toLowerCase();
            const orgId = data?.orgId as string | undefined;

            // The org moved under this session — "Set HR admin" writes `role`
            // and `orgId` together. The src/data/* overlay reads its org
            // namespace at plain module-load time, so only a reload
            // re-evaluates it; applying the new profile in place would leave
            // the previous organisation's local data on screen under the new
            // one's identity. Same reason, same remedy as the sign-in path.
            //
            // Guarded on the document still existing, or deleting a profile
            // (Admin → Remove) would reload into an upsert that recreates it.
            if (snap.exists() && orgId !== initialOrgId) {
                window.location.reload();
                return;
            }

            // A deleted profile is not "no change" — it is the least
            // privilege this account can hold. `asUserRole(undefined)` is
            // `employee`, and dropping `orgId` makes every org-scoped read
            // fail closed, which is the honest end state for an account the
            // organisation has removed.
            apply(buildProfile(user, liveRole(email, data?.role), orgId));
        },
        () => {
            // A listener error (offline, a rules change) also ends the
            // listener, so role changes stop arriving from here on. The last
            // known profile is kept rather than the session being torn down
            // mid-edit over a dropped connection — the next sign-in resolves
            // it, and firestore.rules refuses anything the stale role should
            // not have been doing regardless.
        },
    );
}

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

    const profile = buildProfile(user, role, existingOrgId);

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
    /** Sends a Firebase password-reset email. Shares `error`/`clearError` with
     * sign-in, so the login card only ever shows one message at a time. */
    sendPasswordReset: (email: string) => Promise<void>;
    signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function friendlyAuthError(err: unknown): string {
    const code = (err as { code?: string })?.code ?? '';
    const map: Record<string, string> = {
        'auth/invalid-credential': 'Incorrect email or password.',
        'auth/user-not-found': 'No account found with that email.',
        'auth/wrong-password': 'Incorrect email or password.',
        'auth/email-already-in-use': 'An account already exists with that email.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/popup-closed-by-user': 'Sign-in popup was closed before completing.',
        'auth/too-many-requests': 'Too many attempts. Wait a few minutes, then try again.',
        'auth/missing-email': 'Enter the email address you sign in with.',
        'auth/network-request-failed': 'Could not reach the server. Check your connection and try again.',
    };
    return map[code] ?? 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        // Torn down and replaced whenever the account changes, so a signed-out
        // session never leaves a listener reporting the previous user's role
        // into the next one's provider.
        let stopProfileWatch: (() => void) | undefined;

        const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
            stopProfileWatch?.();
            stopProfileWatch = undefined;
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

                    // Started only once the upsert has settled the stored
                    // role, so the listener's first snapshot re-states what
                    // was just written rather than racing it and briefly
                    // publishing the pre-sign-in role.
                    stopProfileWatch = watchUserProfile(firebaseUser, p.orgId, setProfile);
                } catch {
                    setProfile(null);
                }
            } else {
                setProfile(null);
            }
            setLoading(false);
        });
        return () => {
            stopProfileWatch?.();
            unsub();
        };
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
        // And the record collections themselves — attendance, leave, assets,
        // expenses, helpdesk, payroll, onboarding. Same arrangement as the
        // configuration above and for the same reason: the data modules read
        // localStorage synchronously at module-load time, so this is what makes
        // that copy the organisation's rather than one browser's. Without it
        // every module falls back to exactly the per-browser behaviour it had
        // before. See src/data/persistence.ts.
        const stopRecords = startSharedCollectionsSync(resolveOrgKeyForProfile(profile));
        return () => {
            stopSettings();
            stopFeatures();
            stopRecords();
        };
    }, [profile?.uid, profile?.orgId]);

    const clearError = () => setError('');

    async function signInEmail(email: string, password: string) {
        setError('');
        try {
            // Settle persistence first, or a fast sign-in is written with
            // Firebase's localStorage default and survives the tab it was
            // made in. See authPersistenceReady in lib/firebase.ts.
            await authPersistenceReady;
            await signInWithEmailAndPassword(auth, email.trim(), password);
        } catch (err) {
            setError(friendlyAuthError(err));
            throw err;
        }
    }

    // Password reset. Firebase sends the mail and hosts the reset page, so
    // nothing here touches the user's session — a signed-out visitor stays
    // signed out, and a signed-in one is not disturbed.
    //
    // Note on "no account found": if email-enumeration protection is enabled
    // on the Firebase project (the default for projects created since Sep
    // 2023), Firebase deliberately resolves successfully for an address it
    // does not know rather than leaking which addresses are registered. So
    // `auth/user-not-found` may never arrive, and the caller's success copy
    // has to be worded to hold either way. The mapping is kept for projects
    // where the protection is off.
    async function sendPasswordReset(email: string) {
        setError('');
        try {
            await sendPasswordResetEmail(auth, email.trim());
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
                sendPasswordReset,
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
