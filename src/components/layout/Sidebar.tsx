import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { navGroups, getVisibleNavItems } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { resolveAppRole } from '@/lib/accessControl';
import { useAccessControlRevision } from '@/lib/useAccessControlRevision';
import { BrandMark, Wordmark } from '@/components/ui';
import { isSuperAdminInsideOrg } from '@/lib/orgScope';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navIconTone: Record<'Today' | 'Core workspace' | 'More', string> = {
  Today: 'bg-lime-100 text-lime-800',
  'Core workspace': 'bg-sky-50 text-sky-700',
  More: 'bg-violet-50 text-violet-700',
};

export function Sidebar({ open, onClose }: SidebarProps) {
  const { profile, isSuperAdmin } = useAuth();
  const role = profile ? resolveAppRole(profile) : 'Employee';
  // Re-render when the organisation switches a module on or off, or the
  // permission matrix moves — both decide what is listed here.
  useAccessControlRevision();
  // A super admin sees the platform console until they step into a company.
  // See getVisibleNavItems — their role is `admin`, so without this they were
  // shown a tenant's Attendance, Leave and Payroll as if they worked there.
  const visibleItems = getVisibleNavItems(role, isSuperAdmin, isSuperAdminInsideOrg());

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
        {/* Brand — the primary lockup, flush left, over a 2px rule. */}
        <div className="flex h-16 items-center justify-between gap-2 px-5 border-b-2 border-ink-900/40">
          <div className="flex items-center gap-2.5">
            <BrandMark size={32} />
            <div>
              <Wordmark size={18} className="block leading-none" />
              <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-ink-500 leading-none">People Platform</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close navigation menu" className="lg:hidden p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900">
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {navGroups.filter((group) => visibleItems.some((item) => item.group === group)).map((group) => (
            <div key={group}>
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">{group}</p>
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
                          'flex items-center gap-3 border-l-2 px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'border-brand-600 bg-brand-100 text-brand-800'
                            : 'border-transparent text-ink-600 hover:bg-ink-900/[0.05] hover:text-ink-900',
                        )
                      }
                    >
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', navIconTone[item.group])}>
                        <item.icon size={17} aria-hidden="true" />
                      </span>
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
              </div>
            </div>
          ))}
        </nav>

      </aside>
    </>
  );
}
