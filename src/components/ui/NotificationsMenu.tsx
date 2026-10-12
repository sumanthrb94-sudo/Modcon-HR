import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarOff, CheckCircle2, CheckSquare, Clock, Loader2, Megaphone, Receipt, Settings, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';
import { getNotifications, getIntegrationSummary, type NotificationIcon } from '@/data/notifications';
import { useNotificationPreferencesRevision } from '@/lib/useNotificationPreferencesRevision';
import { useIntegrationPreferencesRevision } from '@/lib/useIntegrationPreferencesRevision';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
// NOTE: useDashboardDataRevision is intentionally NOT used here. That hook
// listens to the global 'storage' event, which the auth and org-settings
// modules also fire during sign-in and profile hydration. Using it inside the
// notifications popover caused the entire app to re-enter its auth loading
// state (full-screen red spinner) whenever the bell was clicked. Notification
// freshness is maintained by the three focused revision hooks below instead.
import { useAuth } from '@/lib/auth';
import { resolveAppRole } from '@/lib/accessControl';
import { markUpdatesSeen, useSeenUpdatesRevision } from '@/lib/seenUpdates';
import { LEAVE_REQUESTS_CHANGED_EVENT } from '@/data/leave';
import { EXPENSES_CHANGED_EVENT } from '@/data/expenses';
import { REGULARIZATIONS_CHANGED_EVENT } from '@/data/attendance';

/**
 * Re-render when a leave request, expense claim or regularization changes —
 * including a colleague's decision arriving through the Firestore
 * subscription. Only these specific events, never the window 'storage' event
 * (see the note on useDashboardDataRevision below).
 */
function useRequestsRevision(): number {
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const bump = () => setRevision((r) => r + 1);
        const events = [LEAVE_REQUESTS_CHANGED_EVENT, EXPENSES_CHANGED_EVENT, REGULARIZATIONS_CHANGED_EVENT];
        events.forEach((e) => window.addEventListener(e, bump));
        return () => events.forEach((e) => window.removeEventListener(e, bump));
    }, []);
    return revision;
}

interface NotificationsMenuProps {
    compact?: boolean;
    className?: string;
}

const ICONS: Record<NotificationIcon, LucideIcon> = {
    leave: CalendarOff,
    expense: Receipt,
    announcement: Megaphone,
    task: CheckSquare,
    clock: Clock,
    approved: CheckCircle2,
    rejected: XCircle,
};

export function NotificationsMenu({ compact = false, className }: NotificationsMenuProps) {
    const navigate = useNavigate();
    const { profile } = useAuth();
    const role = resolveAppRole(profile);
    const isEmployee = role === 'Employee';
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const notificationRevision = useNotificationPreferencesRevision();
    const integrationRevision = useIntegrationPreferencesRevision();
    const directoryRevision = useEmployeeDirectoryRevision();
    const requestsRevision = useRequestsRevision();
    const seenRevision = useSeenUpdatesRevision();
    // Note: useDashboardDataRevision is intentionally excluded — see import
    // comment above. Notifications stay fresh via the three focused hooks.

    // Computed synchronously from localStorage — no async required. The
    // [profile] dependency re-runs this when the session hydrates or changes,
    // and each revision hook re-runs it when its specific data source changes.
    const visibleNotifications = useMemo(
        () => getNotifications(profile),
        // `open` too: opening the bell always shows the current state.
        [profile, notificationRevision, directoryRevision, requestsRevision, seenRevision, open],
    );
    const { connected: connectedIntegrations, total: totalIntegrations } = useMemo(
        () => getIntegrationSummary(),
        [integrationRevision],
    );

    // The badge counts outstanding items, not the number of rows in the menu —
    // "3 unread" when three separate queues each hold work was misleading.
    const totalCount = visibleNotifications.reduce((sum, item) => sum + item.count, 0);

    useEffect(() => {
        function handleOutsideClick(event: MouseEvent) {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }

        function handleEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false);
        }

        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    return (
        <div className="relative" ref={menuRef}>
            {compact ? (
                <button
                    type="button"
                    className={className ?? 'relative p-2 text-ink-600 hover:bg-ink-100 hover:text-ink-900'}
                    onClick={() => setOpen((prev) => !prev)}
                    aria-expanded={open}
                    aria-haspopup="menu"
                    aria-label="Notifications"
                >
                    <Bell size={20} />
                    {/* The dot was painted unconditionally, so the bell always
                        looked like it had something waiting. */}
                    {totalCount > 0 ? (
                        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-600 ring-2 ring-white" />
                    ) : null}
                </button>
            ) : (
                <Button
                    variant="secondary"
                    size="sm"
                    icon={<Bell size={15} />}
                    className={className}
                    onClick={() => setOpen((prev) => !prev)}
                    aria-expanded={open}
                    aria-haspopup="menu"
                >
                    Notifications
                    {totalCount > 0 ? (
                        <span className="ml-1 h-4 min-w-4 px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">
                            {totalCount}
                        </span>
                    ) : null}
                </Button>
            )}

            {open ? (
                <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-ink-300 bg-white p-1.5 shadow-card-hover">
                    <div className="flex items-center justify-between px-2.5 py-2">
                        <p className="text-sm font-semibold text-ink-800">Notifications</p>
                        <span className="text-xs text-ink-500">
                            {totalCount === 1 ? '1 item' : `${totalCount} items`}
                        </span>
                    </div>
                    <div className="max-h-80 overflow-auto">
                        {visibleNotifications.map((item) => {
                            const Icon = ICONS[item.icon];
                            return (
                                <button
                                    key={item.updateId ?? item.id}
                                    className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-ink-50"
                                    onClick={() => {
                                        if (item.updateId) markUpdatesSeen(profile?.uid, [item.updateId]);
                                        setOpen(false);
                                        navigate(item.path);
                                    }}
                                >
                                    <span className="mt-0.5 rounded-md bg-ink-100 p-1 text-ink-600">
                                        <Icon size={14} />
                                    </span>
                                    <span>
                                        <span className="block text-sm font-medium text-ink-800">{item.title}</span>
                                        <span className="block text-xs text-ink-500">{item.subtitle}</span>
                                    </span>
                                </button>
                            );
                        })}
                        {visibleNotifications.length === 0 ? (
                            <div className="px-2.5 py-4 text-center text-sm text-ink-500">
                                Nothing needs your attention right now.
                            </div>
                        ) : null}
                    </div>
                    {!isEmployee ? (
                        <div className="mt-1 border-t border-ink-100 pt-1.5">
                            <div className="px-2.5 pb-2 text-[11px] text-ink-500">
                                {connectedIntegrations}/{totalIntegrations} integrations connected
                            </div>
                            <button
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-ink-700 hover:bg-ink-50"
                                onClick={() => {
                                    setOpen(false);
                                    navigate('/settings');
                                }}
                            >
                                <Settings size={14} />
                                Notification preferences
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
