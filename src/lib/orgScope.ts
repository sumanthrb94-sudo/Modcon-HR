/**
 * Namespaces the `src/data/*.ts` local-overlay/seed layer by organization so
 * different orgs signed in on the same browser never see each other's data,
 * and so a brand new organization starts empty instead of inheriting the
 * default org's demo dataset.
 *
 * The data modules read the active org key at plain module-load time, before
 * React/Firebase auth has resolved, so it lives in Web Storage rather than
 * React state. `setActiveOrgKey` is called once auth resolves; if it finds the
 * org actually changed, the caller reloads the page so every module
 * re-evaluates under the new namespace.
 *
 * **It is per tab (sessionStorage), and it used to be per browser.** Auth is
 * already per tab — `browserSessionPersistence` in lib/firebase.ts — so six
 * tabs can hold six different accounts. The org key was one localStorage entry
 * shared by all of them, so the last tab to sign in re-namespaced every other
 * tab underneath it: a QA Zero Org employee's tab, clobbered to `default` by a
 * super admin signing in next door, rendered ModCon Builders' demo payroll as
 * though it were theirs. The key now lives with the session it belongs to.
 *
 * A browser-wide copy is still written, as a *hint* and nothing more: it seeds
 * a brand-new tab's first guess (so the common case — the same org as last
 * time — does not cost a reload after sign-in), and it is what the sign-in
 * page's careers link follows, since nobody is signed in there to ask. The hint
 * is copied into the tab once, at first read, and never consulted again by
 * that tab, so another tab rewriting it cannot move this one.
 */
const ACTIVE_ORG_KEY_STORAGE = 'modcon.hr.activeOrgKey';

/** Sentinel for accounts with no `orgId` (super admin, and the original
 * ModCon Builders accounts that predate multi-org support) — keeps their
 * storage keys exactly as they were before this feature existed. */
export const DEFAULT_ORG_KEY = 'default';

/** The organisation this browser last signed into — a hint, never this
 * tab's answer. Used where nobody is signed in (the careers link on the
 * sign-in page) and to seed a new tab's first guess. */
export function getLastSignedInOrgKey(): string {
    if (typeof window === 'undefined') return DEFAULT_ORG_KEY;
    try {
        return window.localStorage.getItem(ACTIVE_ORG_KEY_STORAGE) || DEFAULT_ORG_KEY;
    } catch {
        return DEFAULT_ORG_KEY;
    }
}

/** This tab's in-memory copy, for a browser that refuses sessionStorage. */
let tabOrgKey: string | null = null;

export function getActiveOrgKey(): string {
    if (typeof window === 'undefined') return DEFAULT_ORG_KEY;
    if (tabOrgKey) return tabOrgKey;
    try {
        const pinned = window.sessionStorage.getItem(ACTIVE_ORG_KEY_STORAGE);
        if (pinned) {
            tabOrgKey = pinned;
            return pinned;
        }
    } catch {
        // fall through to the hint
    }
    // First read in this tab: pin the hint so the namespace every module
    // loaded under cannot drift if another tab rewrites it mid-session.
    const seeded = getLastSignedInOrgKey();
    tabOrgKey = seeded;
    try {
        window.sessionStorage.setItem(ACTIVE_ORG_KEY_STORAGE, seeded);
    } catch {
        // the in-memory copy stands for this page
    }
    return seeded;
}

/** Returns true if the active org context changed (caller should reload). */
export function setActiveOrgKey(orgKey: string | null | undefined): boolean {
    if (typeof window === 'undefined') return false;
    const next = orgKey || DEFAULT_ORG_KEY;
    const prev = getActiveOrgKey();
    try {
        window.sessionStorage.setItem(ACTIVE_ORG_KEY_STORAGE, next);
    } catch {
        // A browser refusing sessionStorage cannot carry the key across the
        // reload the caller would do, so reloading would loop. The tab keeps
        // the key its modules loaded under, and the render guard
        // (`OrgContextGuard`) refuses to show org data under a mismatch —
        // failing closed rather than rendering one org as another.
        return false;
    }
    tabOrgKey = next;
    try {
        window.localStorage.setItem(ACTIVE_ORG_KEY_STORAGE, next);
    } catch {
        // the hint is a convenience; this tab's own key is already set
    }
    return prev !== next;
}

/**
 * Namespaces a `modcon.hr.*` base key by the active org. The default org
 * keeps the bare key so existing ModCon Builders local data isn't orphaned
 * by this change; every other org gets its own suffixed key.
 */
export function orgScopedKey(baseKey: string): string {
    const org = getActiveOrgKey();
    return org === DEFAULT_ORG_KEY ? baseKey : `${baseKey}::org:${org}`;
}

/**
 * True if a raw localStorage key belongs to the currently active org — used
 * by the "Delete Mock Data" sweep so resetting one org's local data never
 * touches another org's data cached in the same browser. The default org
 * owns every bare (unsuffixed) key; any other org owns only its own
 * `::org:<id>`-suffixed keys.
 */
export function belongsToActiveOrg(key: string): boolean {
    const org = getActiveOrgKey();
    const suffix = '::org:';
    if (org === DEFAULT_ORG_KEY) return !key.includes(suffix);
    return key.endsWith(`${suffix}${org}`);
}

// ---------------------------------------------------------------------------
// Super-admin org switching
// ---------------------------------------------------------------------------
// A super admin isn't a member of any single org — they manage every
// organization from one account, so which org's data they're currently
// working in is a per-session choice (persisted here), not derived from
// their own profile like it is for a regular org-scoped admin/employee.
//
// Per tab, like the active org key above and for the same reason: it was
// localStorage, so a super admin entering one company in one tab moved every
// other tab of theirs into it on its next reload.
const SUPER_ADMIN_SELECTED_ORG_STORAGE = 'modcon.hr.superAdminSelectedOrg';

export function getSuperAdminSelectedOrg(): string {
    if (typeof window === 'undefined') return DEFAULT_ORG_KEY;
    try {
        return window.sessionStorage.getItem(SUPER_ADMIN_SELECTED_ORG_STORAGE) || DEFAULT_ORG_KEY;
    } catch {
        return DEFAULT_ORG_KEY;
    }
}

/**
 * Whether a super admin has deliberately stepped *into* an organisation.
 *
 * The absence of the key and the default organisation used to be the same
 * state, and that is what put a tenant's HR app in front of an account that
 * belongs to no tenant: a super admin who had never chosen anything resolved
 * to `default` and was shown ModCon Builders' attendance, leave and payroll as
 * though they worked there. They are separate states now — nothing selected is
 * the platform console, and the default organisation is a company like any
 * other that has to be entered on purpose.
 *
 * The storage value stays the org key rather than gaining a sentinel, so
 * `resolveOrgKeyForProfile` still answers `default` for a super admin who is
 * outside every org: the namespace a page would read if one somehow rendered
 * is the same one it read before, and nothing about where data is filed
 * changes with this.
 */
export function isSuperAdminInsideOrg(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return Boolean(window.sessionStorage.getItem(SUPER_ADMIN_SELECTED_ORG_STORAGE));
    } catch {
        return false;
    }
}

function setSuperAdminSelectedOrg(orgKey: string) {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.setItem(SUPER_ADMIN_SELECTED_ORG_STORAGE, orgKey || DEFAULT_ORG_KEY);
    } catch {
        // ignore
    }
}

/**
 * Resolves which org's local data namespace should be active for a signed-in
 * profile. Regular accounts are pinned to their own orgId. Super admins have
 * no orgId of their own — they act on whichever org they last switched to
 * via the Organizations page (default: the default/legacy org).
 */
export function resolveOrgKeyForProfile(profile: { orgId?: string; superAdmin?: boolean } | null | undefined): string {
    if (!profile) return DEFAULT_ORG_KEY;
    if (profile.superAdmin) return getSuperAdminSelectedOrg();
    return profile.orgId || DEFAULT_ORG_KEY;
}

/** Switches which org a super admin is currently acting on and reloads so
 * every org-scoped module re-evaluates under the new namespace. No-op (and
 * does not reload) if the org didn't actually change.
 *
 * The no-op test is on the *selection*, not on `getActiveOrgKey()`. Those two
 * agree for every org but one: a super admin outside every organisation has an
 * active key of `default` and no selection, so comparing active keys refused to
 * let them enter the default organisation at all — the one company on the
 * platform they could not open. */
export function switchSuperAdminOrg(orgKey: string) {
    if (typeof window === 'undefined') return;
    const next = orgKey || DEFAULT_ORG_KEY;
    if (isSuperAdminInsideOrg() && next === getSuperAdminSelectedOrg() && next === getActiveOrgKey()) return;
    setSuperAdminSelectedOrg(next);
    setActiveOrgKey(next);
    window.location.reload();
}

/**
 * Clears the super-admin org selection without reloading the page.
 *
 * `leaveSuperAdminOrg` below is the reloading version, used while the app is
 * still up and every `src/data/*` module needs to re-evaluate under the
 * platform namespace. Signing out is a different moment: `signOutUser` is
 * about to call `signOut(auth)` and navigate away on its own, so a reload
 * fired from here would race that navigation rather than help it. Without
 * this, the selection survived `signOut` entirely — the next person to sign
 * in on this browser (or the same super admin, a minute later) landed back
 * inside whichever organisation was last entered, with nothing on screen
 * saying so.
 */
export function clearSuperAdminOrgSelection() {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.removeItem(SUPER_ADMIN_SELECTED_ORG_STORAGE);
        // The per-browser copy this used to be, so an older build's selection
        // cannot outlive the sign-out that was meant to end it.
        window.localStorage.removeItem(SUPER_ADMIN_SELECTED_ORG_STORAGE);
    } catch {
        // ignore
    }
}

/** Steps a super admin back out to the platform console, and reloads for the
 * same reason switching in does: the `src/data/*` modules read their namespace
 * at module-load time, so leaving one in place would show the org they just
 * left under the identity of somebody who is in none. */
export function leaveSuperAdminOrg() {
    if (typeof window === 'undefined') return;
    if (!isSuperAdminInsideOrg()) return;
    clearSuperAdminOrgSelection();
    setActiveOrgKey(DEFAULT_ORG_KEY);
    window.location.reload();
}
