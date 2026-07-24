import { NavLink, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { navGroups, navItems } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { isAdmin, isManager } = useAuth();
  const navigate = useNavigate();
  const visibleItems = navItems.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.managerOnly || isManager),
  );

  function handleUpgradePlan() {
    navigate('/settings?tab=billing&action=upgrade-plan');
    onClose();
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && <div className="fixed inset-0 z-30 bg-ink-900/40 lg:hidden" onClick={onClose} />}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-white border-r border-ink-200 transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center justify-between gap-2 px-5 border-b border-ink-100">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white font-bold text-lg shadow-sm">
              M
            </div>
            <div>
              <p className="font-bold text-ink-900 leading-tight">ModCon HR</p>
              <p className="text-[11px] text-ink-400 leading-tight">People Platform</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden rounded-lg p-1.5 text-ink-400 hover:bg-ink-100">
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {navGroups.map((group) => (
            <div key={group}>
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{group}</p>
              <div className="space-y-0.5">
                {visibleItems
                  .filter((i) => i.group === group)
                  .map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                        )
                      }
                    >
                      <item.icon size={18} className="shrink-0" />
                      {item.label}
                    </NavLink>
                  ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Upgrade card */}
        <div className="p-3">
          <div className="rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white">
            <p className="text-sm font-semibold">ModCon HR Pro</p>
            <p className="text-xs text-brand-100 mt-0.5">Unlock advanced analytics & automations.</p>
            <button
              type="button"
              onClick={handleUpgradePlan}
              className="mt-3 w-full rounded-lg bg-white/15 hover:bg-white/25 py-1.5 text-xs font-semibold transition-colors"
            >
              Upgrade plan
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
