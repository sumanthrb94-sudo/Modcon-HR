import { Loader2 } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth';
import { getActiveOrgKey, resolveOrgKeyForProfile, setActiveOrgKey } from '@/lib/orgScope';

/** When this tab last reloaded to fix its namespace, so a fix that does not
 * take cannot become a reload loop. Per tab, like the key it protects. */
const LAST_RELOAD_STORAGE = 'modcon.hr.orgGuardReloadAt';
const RELOAD_COOLDOWN_MS = 10_000;

function reloadedRecently(): boolean {
    try {
        const at = Number(window.sessionStorage.getItem(LAST_RELOAD_STORAGE) ?? 0);
        return Date.now() - at < RELOAD_COOLDOWN_MS;
    } catch {
        return true;
    }
}

function markReload(): void {
    try {
        window.sessionStorage.setItem(LAST_RELOAD_STORAGE, String(Date.now()));
    } catch {
        // reloadedRecently() answers true when storage is refused, so no loop
    }
}

/**
 * Refuses to render the app while this tab's data namespace belongs to a
 * different organisation from the signed-in account.
 *
 * The `src/data/*` modules read their organisation at module-load time, so a
 * page is only ever as right as the org key was when it loaded. The sign-in
 * path reloads when that key moves, and the key is now per tab so another tab
 * cannot move it — but "the app reloads in time" is an ordering argument, and
 * an ordering argument is exactly what failed when the key was browser-wide:
 * six accounts in six tabs, and whichever signed in last decided which
 * company's records the other five were shown. This is the check that does not
 * depend on order. If the namespace and the profile disagree, nothing
 * org-scoped renders; the tab is re-pointed and reloaded once, and if that
 * does not take, it says so instead of showing one organisation's data under
 * another's name.
 */
export function OrgContextGuard({ children }: { children: ReactNode }) {
    const { profile } = useAuth();
    const expected = profile ? resolveOrgKeyForProfile(profile) : null;
    const loadedUnder = getActiveOrgKey();
    const mismatch = expected !== null && expected !== loadedUnder;
    const canRetry = mismatch && !reloadedRecently();

    useEffect(() => {
        if (!mismatch || !canRetry || !expected) return;
        setActiveOrgKey(expected);
        if (getActiveOrgKey() !== expected) return; // storage refused; see below
        markReload();
        window.location.reload();
    }, [mismatch, canRetry, expected]);

    if (!mismatch) return <>{children}</>;

    if (canRetry) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-ink-50" role="status">
                <Loader2 className="animate-spin text-brand-600" size={28} />
                <span className="sr-only">Loading your organisation</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-ink-50 px-4" role="alert">
            <div className="max-w-md border-2 border-ink-900 bg-white p-6 space-y-3">
                <p className="text-base font-semibold text-ink-900">This tab could not switch to your organisation</p>
                <p className="text-sm text-ink-600">
                    The data this tab loaded belongs to a different organisation from the account signed in, so
                    nothing is shown rather than the wrong company&rsquo;s records. Reload the page; if this keeps
                    happening, the browser may be blocking site storage.
                </p>
                <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
                    Reload
                </button>
            </div>
        </div>
    );
}
