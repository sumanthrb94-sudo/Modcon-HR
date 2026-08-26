/**
 * Authentication context & hooks.
 *
 * Supports email + password sign-in / sign-up only.
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
    createUserWithEmailAndPassword,
    signOut,
    updateProfile,
    type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { employeeIdByEmail, getEmployee } from '@/data/employees';
import type { Employee } from '@/types';

// ---------------------------------------------------------------------------
// Admin allow-list
// ---------------------------------------------------------------------------
export const ADMIN_EMAILS = [
    'sumanthbolla97@gmail.com',
    'saikrishnakoppaka@gmail.com',
].map((e) => e.toLowerCase());

export type UserRole = 'admin' | 'employee';

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    photoURL: string | null;
    role: UserRole;
    /**
     * Directory record this account acts as ('emp-007'), or null if unlinked.
     *
     * This is what lets the app answer "which employee is this?". Without it an
     * employee account cannot be scoped to its own data, and the Firestore
     * ownership rules have nothing to compare against — they previously matched
     * a directory id against request.auth.uid, which can never be equal.
     */
    employeeId: string | null;
    createdAt?: unknown;
    lastLoginAt?: unknown;
}

// ---------------------------------------------------------------------------
// Firestore profile sync
// ---------------------------------------------------------------------------
async function upsertUserProfile(
    user: User,
    /**
     * Name to persist when the Auth record doesn't carry one yet. Sign-up fires
     * `onAuthStateChanged` before `updateProfile` resolves, so without this the
     * first write stores the email prefix and the name the user typed is lost.
     */
    displayNameOverride?: string,
): Promise<UserProfile> {
    const email = (user.email ?? '').toLowerCase();
    const isHardcodedAdmin = ADMIN_EMAILS.includes(email);
    const ref = doc(db, 'users', user.uid);
    const existing = await getDoc(ref);

    const role: UserRole = isHardcodedAdmin
        ? 'admin'
        : (existing.exists() ? (existing.data().role as UserRole) : 'employee') ?? 'employee';

    // A link an admin has already set wins over the email match, so a manual
    // correction survives the next sign-in — the same precedence `role` has.
    // Otherwise fall back to matching the account's work email against the
    // directory. Unmatched accounts stay null and are blocked, rather than
    // being guessed into someone else's records.
    const storedEmployeeId = existing.exists()
        ? ((existing.data().employeeId as string | null | undefined) ?? null)
        : null;
    const employeeId: string | null = storedEmployeeId ?? employeeIdByEmail(email);

    const profile: UserProfile = {
        uid: user.uid,
        email,
        displayName:
            user.displayName ||
            displayNameOverride?.trim() ||
            (existing.exists() ? ((existing.data().displayName as string) ?? '') : '') ||
            email.split('@')[0],
        photoURL: user.photoURL,
        role,
        employeeId,
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
    /** The directory record this account acts as, or null when unlinked. */
    linkedEmployee: Employee | null;
    /**
     * Whether this viewer may see the whole directory. Admins may; an employee
     * sees only themselves. Read this rather than `isAdmin` when deciding what
     * DATA to show, so the two concerns stay separable.
     */
    canSeeEveryone: boolean;
    /** Signed in but with no employee record to scope to. */
    isLinked: boolean;
    error: string;
    clearError: () => void;
    signInEmail: (email: string, password: string) => Promise<void>;
    signUpEmail: (name: string, email: string, password: string) => Promise<void>;
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

    async function signUpEmail(name: string, email: string, password: string) {
        setError('');
        try {
            const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
            if (name.trim()) {
                await updateProfile(cred.user, { displayName: name.trim() });
                // `createUserWithEmailAndPassword` already fired onAuthStateChanged,
                // which upserted the profile before `updateProfile` resolved — so
                // that write recorded the email prefix, not the name just typed.
                // Re-upsert (and refresh context state) now that it's set.
                const p = await upsertUserProfile(cred.user, name.trim());
                setProfile(p);
            }
        } catch (err) {
            setError(friendlyAuthError(err));
            throw err;
        }
    }

    async function signOutUser() {
        await signOut(auth);
    }

    const isAdmin = profile?.role === 'admin';
    const linkedEmployee = profile?.employeeId ? getEmployee(profile.employeeId) ?? null : null;
    // Admins see everyone regardless of whether they have a directory record —
    // the fixed admin accounts deliberately have none.
    const canSeeEveryone = isAdmin;
    const isLinked = linkedEmployee !== null;

    return (
        <AuthContext.Provider
            value={{
                user,
                profile,
                loading,
                isAdmin,
                linkedEmployee,
                canSeeEveryone,
                isLinked,
                error,
                clearError,
                signInEmail,
                signUpEmail,
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
