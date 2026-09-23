import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, CalendarOff, LifeBuoy, Plus, Receipt, UserPlus } from 'lucide-react';
import { Button } from './Button';
import { useClampedMenuPosition } from '@/lib/useClampedMenuPosition';

interface QuickAddMenuProps {
    size?: 'sm' | 'md';
    variant?: 'primary' | 'secondary';
    className?: string;
}

const quickActions = [
    { label: 'Add Employee', description: 'Open employee module', path: '/employees', icon: UserPlus },
    { label: 'Leave Request', description: 'Open leave module', path: '/leave', icon: CalendarOff },
    { label: 'Job Opening', description: 'Open recruitment module', path: '/recruitment', icon: Briefcase },
    { label: 'Log Expense', description: 'Open expenses module', path: '/expenses', icon: Receipt },
    { label: 'Helpdesk Ticket', description: 'Open helpdesk module', path: '/helpdesk', icon: LifeBuoy },
];

// Matches `w-64` on the panel below — see the constant of the same name in
// NotificationsMenu.tsx for why this is a number rather than a measurement.
const PANEL_WIDTH = 256;

export function QuickAddMenu({ size = 'sm', variant = 'primary', className }: QuickAddMenuProps) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const position = useClampedMenuPosition(open, menuRef, PANEL_WIDTH);

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
            <Button
                variant={variant}
                size={size}
                icon={<Plus size={15} />}
                className={className}
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
                aria-haspopup="menu"
            >
                Quick Add
            </Button>

            {open && position ? (
                // Measured, not anchored — see useClampedMenuPosition and the
                // comment on NotificationsMenu's panel. This button sits
                // second in a row after Notifications on the Admin
                // dashboard, so a fixed left-vs-right CSS anchor could not
                // have been correct for both of them at once.
                <div
                    className="fixed z-50 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-ink-300 bg-white p-1.5 shadow-card-hover"
                    style={{ top: position.top, left: position.left }}
                >
                    {quickActions.map((item) => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.label}
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
                                    <span className="block text-sm font-medium text-ink-800">{item.label}</span>
                                    <span className="block text-xs text-ink-500">{item.description}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
