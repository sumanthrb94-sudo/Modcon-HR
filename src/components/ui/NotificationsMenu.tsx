import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarOff, CheckSquare, Megaphone, Receipt, Settings } from 'lucide-react';
import { Button } from './Button';

interface NotificationsMenuProps {
    compact?: boolean;
    className?: string;
}

const notifications = [
    {
        id: 'n1',
        title: 'Leave requests pending',
        subtitle: '7 approvals are waiting',
        path: '/dashboard/pending-approvals',
        icon: CalendarOff,
    },
    {
        id: 'n2',
        title: 'Expense claims need review',
        subtitle: '4 claims in queue',
        path: '/expenses',
        icon: Receipt,
    },
    {
        id: 'n3',
        title: 'New company announcement',
        subtitle: 'Policy update posted',
        path: '/dashboard/announcements',
        icon: Megaphone,
    },
    {
        id: 'n4',
        title: 'Tasks require action',
        subtitle: '5 onboarding tasks due',
        path: '/dashboard/pending-approvals',
        icon: CheckSquare,
    },
];

export function NotificationsMenu({ compact = false, className }: NotificationsMenuProps) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const totalCount = 19;

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
                    className={className ?? 'relative rounded-lg p-2 text-ink-500 hover:bg-ink-100'}
                    onClick={() => setOpen((prev) => !prev)}
                    aria-expanded={open}
                    aria-haspopup="menu"
                    aria-label="Notifications"
                >
                    <Bell size={20} />
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
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
                    <span className="ml-1 h-4 w-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {totalCount}
                    </span>
                </Button>
            )}

            {open ? (
                <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-ink-100 bg-white p-1.5 shadow-card-hover">
                    <div className="flex items-center justify-between px-2.5 py-2">
                        <p className="text-sm font-semibold text-ink-800">Notifications</p>
                        <span className="text-xs text-ink-500">{totalCount} unread</span>
                    </div>
                    <div className="max-h-80 overflow-auto">
                        {notifications.map((item) => {
                            const Icon = item.icon;
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
                    </div>
                    <div className="mt-1 border-t border-ink-100 pt-1.5">
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
                </div>
            ) : null}
        </div>
    );
}
