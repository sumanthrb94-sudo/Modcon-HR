import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useOrganizations } from '@/lib/useFirestore';
import { getActiveOrgKey, isSuperAdminInsideOrg, leaveSuperAdminOrg, DEFAULT_ORG_KEY } from '@/lib/orgScope';

/**
 * Persistent banner shown on every page while a super admin is inside a
 * tenant's organisation.
 *
 * The scope flag used to be visible only as fine print — a line in the
 * Organizations table and a small dropdown in the Topbar — while every page
 * underneath rendered as though the super admin actually worked there. This
 * is the opposite of fine print: it renders above the content of every page
 * in `AppLayout`, not just Organizations, because the risk it is naming
 * (full HR-administrator access to somebody else's company) is present on
 * every one of them, not only the one where the scope was chosen.
 *
 * Mirrors `SubscriptionBanner`'s placement in `AppLayout` for the same
 * reason: state whose cost of going unnoticed lands on the tenant, not on
 * the person looking at it, does not belong tucked into a settings screen.
 */
export function SuperAdminScopeBanner() {
    const { isSuperAdmin } = useAuth();
    const { data: organizations } = useOrganizations(isSuperAdmin);

    if (!isSuperAdmin || !isSuperAdminInsideOrg()) return null;

    const activeOrgKey = getActiveOrgKey();
    const orgName =
        organizations.find((o) => o.id === activeOrgKey)?.name ??
        (activeOrgKey === DEFAULT_ORG_KEY ? 'ModCon Builders (Default)' : activeOrgKey);

    return (
        <div className="border-b-2 border-brand-600 bg-brand-50 px-4 py-2.5 lg:px-6">
            <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2.5 text-sm">
                <ShieldAlert size={16} className="shrink-0 text-brand-600" />
                <span className="text-ink-900">
                    You are managing <span className="font-semibold">{orgName}</span> as a super admin —
                    everything on this page is that organization&rsquo;s data.
                </span>
                <button
                    type="button"
                    onClick={leaveSuperAdminOrg}
                    className="ml-auto shrink-0 font-medium text-ink-900 underline underline-offset-2"
                >
                    Exit to the platform console
                </button>
            </div>
        </div>
    );
}
