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
    isSignInWithEmailLink,
    signOut,
    updateProfile,
    type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

// ---------------------------------------------------------------------------
// Admin allow-list
// ---------------------------------------------------------------------------
export const ADMIN_EMAILS = [
    'sumanthbolla97@gmail.com',
    'saikrishnakoppaka@gmail.com',
].map((e) => e.toLowerCase());

export type UserRole = 'admin' | 'manager' | 'employee';

// Roles that carry approval / team-management privileges.
export function isManagerRole(role: UserRole | undefined | null): boolean {
    return role === 'manager' || role === 'admin';
}

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    photoURL: string | null;
    role: UserRole;
    createdAt?: unknown;
    lastLoginAt?: unknown;
}

// ---------------------------------------------------------------------------
// Firestore profile sync
// ---------------------------------------------------------------------------
async function upsertUserProfile(user: User): Promise<UserProfile> {
    const email = (user.email ?? '').toLowerCase();
    const isHardcodedAdmin = ADMIN_EMAILS.includes(email);
    const ref = doc(db, 'users', user.uid);
    const existing = await getDoc(ref);

    const role: UserRole = isHardcodedAdmin
        ? 'admin'
        : (existing.exists() ? (existing.data().role as UserRole) : 'employee') ?? 'employee';

    const profile: UserProfile = {
        uid: user.uid,
        email,
        displayName: user.displayName || email.split('@')[0],
        photoURL: user.photoURL,
        role,
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
    isManager: boolean;
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
    const isManager = isManagerRole(profile?.role);

    return (
        <AuthContext.Provider
            value={{
                user,
                profile,
                loading,
                isAdmin,
                isManager,
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
