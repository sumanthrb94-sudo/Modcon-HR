import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export function LoginPage() {
    const navigate = useNavigate();
    const { user, loading, error, clearError, signInEmail, sendPasswordReset } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    // The reset flow reuses this card rather than a separate route: it shares
    // the email field, the error slot and the auth context, so nothing about
    // the sign-in path changes when it is not in use.
    const [mode, setMode] = useState<'signin' | 'reset'>('signin');
    const [resetSent, setResetSent] = useState('');

    useEffect(() => {
        if (!loading && user) {
            navigate('/', { replace: true });
        }
    }, [loading, user, navigate]);

    function switchMode(next: 'signin' | 'reset') {
        setMode(next);
        setResetSent('');
        if (error) clearError();
    }

    function onEmailChange(value: string) {
        setEmail(value);
        setResetSent('');
        if (error) clearError();
    }

    async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmitting(true);
        try {
            await signInEmail(email, password);
        } catch {
            // error surfaced via context
        } finally {
            setSubmitting(false);
        }
    }

    async function handleResetSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmitting(true);
        setResetSent('');
        try {
            const address = email.trim();
            await sendPasswordReset(address);
            // Worded to be true whether or not the address is registered —
            // Firebase's enumeration protection resolves successfully for
            // unknown addresses on purpose. See sendPasswordReset in auth.tsx.
            setResetSent(
                `If ${address} belongs to a ModCon HR account, a reset link is on its way. ` +
                    'It expires in an hour — check your spam folder if it has not arrived in a few minutes.',
            );
        } catch {
            // error surfaced via context
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="min-h-screen bg-ink-50 px-4 py-8">
            <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center justify-center">
                <section className="card w-full p-6 sm:p-8">
                    <div className="flex items-center gap-2.5 mb-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white font-bold text-lg shadow-sm">
                            M
                        </div>
                        <p className="font-bold text-ink-900">ModCon HR</p>
                    </div>
                    {mode === 'reset' ? (
                        <>
                            <h1 className="text-2xl font-bold text-ink-900">Reset your password</h1>
                            <p className="mt-1 text-sm text-ink-500">
                                Enter your work email and we&rsquo;ll send you a link to set a new password.
                            </p>

                            <form className="mt-6 space-y-4" onSubmit={handleResetSubmit}>
                                <div>
                                    <label className="label" htmlFor="reset-email">
                                        Email
                                    </label>
                                    <input
                                        id="reset-email"
                                        type="email"
                                        className="input"
                                        placeholder="you@company.com"
                                        autoComplete="email"
                                        value={email}
                                        onChange={(event) => onEmailChange(event.target.value)}
                                        required
                                        autoFocus
                                    />
                                </div>

                                {error ? (
                                    <p role="alert" className="text-sm font-medium text-rose-600">
                                        {error}
                                    </p>
                                ) : null}

                                {resetSent ? (
                                    <p
                                        role="status"
                                        className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"
                                    >
                                        {resetSent}
                                    </p>
                                ) : null}

                                <Button type="submit" className="w-full justify-center" disabled={submitting}>
                                    {submitting ? (
                                        <Loader2 className="animate-spin" size={16} />
                                    ) : resetSent ? (
                                        'Resend link'
                                    ) : (
                                        'Send reset link'
                                    )}
                                </Button>

                                <p className="text-center text-sm text-ink-500">
                                    <button
                                        type="button"
                                        className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
                                        onClick={() => switchMode('signin')}
                                    >
                                        Back to sign in
                                    </button>
                                </p>

                                <p className="text-center text-sm text-ink-500">
                                    Still stuck? Your organization&rsquo;s administrator can reset it for you.
                                </p>
                            </form>
                        </>
                    ) : (
                    <>
                    <h1 className="text-2xl font-bold text-ink-900">Sign in to continue</h1>
                    <p className="mt-1 text-sm text-ink-500">Use your work email and password.</p>

                    <form className="mt-6 space-y-4" onSubmit={handlePasswordSubmit}>
                        <div>
                            <label className="label" htmlFor="username">
                                Email
                            </label>
                            <input
                                id="username"
                                type="email"
                                className="input"
                                placeholder="you@company.com"
                                autoComplete="email"
                                value={email}
                                onChange={(event) => onEmailChange(event.target.value)}
                                required
                            />
                        </div>

                        <div>
                            <div className="flex items-baseline justify-between gap-2">
                                <label className="label" htmlFor="password">
                                    Password
                                </label>
                                <button
                                    type="button"
                                    className="mb-1 text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
                                    onClick={() => switchMode('reset')}
                                >
                                    Forgot Password?
                                </button>
                            </div>
                            <input
                                id="password"
                                type="password"
                                className="input"
                                placeholder="Enter password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(event) => {
                                    setPassword(event.target.value);
                                    if (error) clearError();
                                }}
                                required
                                minLength={6}
                            />
                        </div>

                        {error ? (
                            <p role="alert" className="text-sm font-medium text-rose-600">
                                {error}
                            </p>
                        ) : null}

                        <Button type="submit" className="w-full justify-center" disabled={submitting}>
                            {submitting ? <Loader2 className="animate-spin" size={16} /> : 'Sign In'}
                        </Button>

                        {/*
                          * SECURITY: a "Quick Demo Login" block used to live here with a
                          * hardcoded email/password pair for a real admin account (one of
                          * the entries in ADMIN_EMAILS, see src/lib/auth.tsx). Because Vite
                          * inlines client code as-is, that password was shipped in plain
                          * text to every visitor's browser and readable in the compiled JS
                          * — effectively a public admin credential. It has been removed.
                          *
                          * If that account's password was ever committed/deployed, rotate
                          * it in the Firebase console — removing this code does not undo
                          * an already-exposed credential.
                          *
                          * If a one-click demo login is still wanted, point it at a
                          * dedicated, low-privilege, non-real demo account (not an entry
                          * in ADMIN_EMAILS), and prefer reading its credentials from a
                          * non-committed env var over hardcoding them here — keeping in
                          * mind Vite still inlines VITE_-prefixed env vars into the client
                          * bundle, so this only keeps the secret out of git, not out of
                          * the shipped app.
                          */}
                        <>
                                <div className="relative flex py-2 items-center">
                                    <div className="flex-grow border-t border-ink-150"></div>
                                    <span className="flex-shrink mx-3 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Quick Demo Login</span>
                                    <div className="flex-grow border-t border-ink-150"></div>
                                </div>

                                <div className="grid grid-cols-1 gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="text-xs justify-center py-2"
                                        onClick={async () => {
                                            setSubmitting(true);
                                            try {
                                                await signInEmail('riya.sharma@modconhr.test', 'Employee@123');
                                            } catch (err) {
                                                console.error('Demo Employee sign in failed:', err);
                                            } finally {
                                                setSubmitting(false);
                                            }
                                        }}
                                        disabled={submitting}
                                    >
                                        Employee Profile
                                    </Button>
                                </div>
                        </>

                        {/*
                          * No self-registration. An account created here carried no
                          * `orgId`, and "no orgId" used to mean the default organisation —
                          * so anyone who signed up landed inside ModCon Builders' tenant
                          * and could read its directory, attendance, jobs, expenses and
                          * assets. Verified against production before this was removed.
                          *
                          * The rules now fail closed for an unassigned account as well
                          * (myOrgKey in firestore.rules), so this is the outer of two
                          * doors rather than the only one. Accounts are created the way
                          * every other account in the system already is: super-admin org
                          * provisioning, or an administrator attaching an existing one.
                          * See G7 in docs/tenant-isolation-spec.md.
                          */}
                        <p className="text-center text-sm text-ink-500">
                            No account? Your organization&rsquo;s administrator creates one for you.
                        </p>
                    </form>
                    </>
                    )}
                </section>
            </div>
        </main>
    );
}
