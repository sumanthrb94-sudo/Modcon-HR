import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarOff, CheckSquare, Clock, Megaphone, Receipt, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';
import { getNotifications, getIntegrationSummary, type NotificationIcon } from '@/data/notifications';
import { useNotificationPreferencesRevision } from '@/lib/useNotificationPreferencesRevision';
import { useIntegrationPreferencesRevision } from '@/lib/useIntegrationPreferencesRevision';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { useDashboardDataRevision } from '@/lib/useDashboardDataRevision';
import { useAuth } from '@/lib/auth';
import { resolveAppRole } from '@/lib/accessControl';
import { useClampedMenuPosition } from '@/lib/useClampedMenuPosition';

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
};

// Matches `w-80` on the panel below — the two have to agree, because the
// clamp is computed from this number rather than measured from the panel
// itself (which does not exist in the DOM to measure until it is open).
const PANEL_WIDTH = 320;

export function NotificationsMenu({ compact = false, className }: NotificationsMenuProps) {
    const navigate = useNavigate();
    const { profile } = useAuth();
    const role = resolveAppRole(profile);
    const isEmployee = role === 'Employee';
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    // menuRef already wraps exactly the trigger (see the JSX below), so it
    // doubles as the element the panel's position is measured from.
    const position = useClampedMenuPosition(open, menuRef, PANEL_WIDTH);
    const notificationRevision = useNotificationPreferencesRevision();
    const integrationRevision = useIntegrationPreferencesRevision();
    const directoryRevision = useEmployeeDirectoryRevision();
    // The same sources the dashboard's approval cards read, so approving a
    // claim empties the badge instead of leaving a stale number behind.
    const dataRevision = useDashboardDataRevision();

    // Counted from live records each time anything they depend on changes, so
    // approving the last leave request empties the badge instead of leaving it
    // stuck on a number that was written by hand.
    const visibleNotifications = useMemo(
        () => getNotifications(profile),
        [profile, notificationRevision, directoryRevision, dataRevision],
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

            {open && position ? (
                // Positioned from a measurement (useClampedMenuPosition), not
                // a fixed CSS anchor: `right: 0` only stays on screen when the
                // trigger itself is pinned to the screen's right edge, which
                // is true of the topbar's compact bell but not of this button
                // wherever else it renders (stacked under a heading on a
                // phone, or second in a row after another button on the Admin
                // dashboard) — both ran the panel off one edge of the screen.
                <div
                    className="fixed z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-ink-300 bg-white p-1.5 shadow-card-hover"
                    style={{ top: position.top, left: position.left }}
                >
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
                                    key={item.id}
                                    className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-ink-50"
                                    onClick={() => {
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
