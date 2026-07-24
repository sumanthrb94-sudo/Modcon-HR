import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export function LoginPage() {
    const navigate = useNavigate();
    const { user, loading, error, clearError, signInEmail, signUpEmail } = useAuth();

    const [isSignUp, setIsSignUp] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!loading && user) {
            navigate('/', { replace: true });
        }
    }, [loading, user, navigate]);

    async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmitting(true);
        try {
            if (isSignUp) {
                await signUpEmail(name, email, password);
            } else {
                await signInEmail(email, password);
            }
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
                    <h1 className="text-2xl font-bold text-ink-900">
                        {isSignUp ? 'Create your account' : 'Sign in to continue'}
                    </h1>
                    <p className="mt-1 text-sm text-ink-500">Use your work email and password.</p>

                    <form className="mt-6 space-y-4" onSubmit={handlePasswordSubmit}>
                        {isSignUp && (
                            <div>
                                <label className="label" htmlFor="name">Full name</label>
                                <input
                                    id="name"
                                    className="input"
                                    placeholder="Your name"
                                    value={name}
                                    onChange={(event) => { setName(event.target.value); if (error) clearError(); }}
                                />
                            </div>
                        )}
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
                                onChange={(event) => {
                                    setEmail(event.target.value);
                                    if (error) clearError();
                                }}
                                required
                            />
                        </div>

                        <div>
                            <label className="label" htmlFor="password">
                                Password
                            </label>
                            <input
                                id="password"
                                type="password"
                                className="input"
                                placeholder="Enter password"
                                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                                value={password}
                                onChange={(event) => {
                                    setPassword(event.target.value);
                                    if (error) clearError();
                                }}
                                required
                                minLength={6}
                            />
                        </div>

                        {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

                        <Button type="submit" className="w-full justify-center" disabled={submitting}>
                            {submitting ? <Loader2 className="animate-spin" size={16} /> : isSignUp ? 'Create account' : 'Sign In'}
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
                        {!isSignUp && (
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
                        )}

                        <p className="text-center text-sm text-ink-500">
                            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                            <button
                                type="button"
                                className="font-semibold text-brand-600 hover:underline"
                                onClick={() => { setIsSignUp((v) => !v); clearError(); }}
                            >
                                {isSignUp ? 'Sign in' : 'Sign up'}
                            </button>
                        </p>
                    </form>
                </section>
            </div>
        </main>
    );
}
