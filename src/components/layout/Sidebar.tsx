import { NavLink, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { navGroups, getVisibleNavItems } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { resolveAppRole } from '@/lib/accessControl';
import { PLAN, formatPaise } from '@/data/subscription';
import { useSubscription } from '@/lib/useSubscription';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { profile, isAdmin, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const role = profile ? resolveAppRole(profile) : 'Employee';
  const visibleItems = getVisibleNavItems(role, isSuperAdmin);
  // The subscription record, not the seat preferences. This card used to sell
  // an Enterprise tier and quote a seat count; there is one plan now, at one
  // price per organisation, and whether it is paid is a fact from the server.
  const { subscription, access } = useSubscription();
  const statusLabel = subscription?.status === 'active' ? 'Active'
    : subscription?.status === 'trialing' ? 'Trial'
    : subscription?.status === 'past_due' ? 'Payment failed'
    : subscription?.status === 'cancelled' ? 'Cancelled'
    : 'Not subscribed';

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

        {/* Billing card — for the organisation this account belongs to.
            Never for a super admin: they administer every organisation and
            belong to none, so "Not subscribed" would be a statement about
            nobody. They manage subscriptions from Organizations instead. */}
        {isAdmin && !isSuperAdmin ? (
          <div className="p-3">
          <div className="rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white">
            <p className="text-sm font-semibold">{PLAN.name}</p>
            <p className="text-xs text-brand-100 mt-0.5">
              {subscription?.status === 'promotional'
                ? 'Complimentary · unlimited employees'
                : `${formatPaise(PLAN.pricePaise)} per month · unlimited employees`}
            </p>
            <button
              type="button"
              onClick={() => { navigate('/settings?tab=billing'); onClose(); }}
              className="mt-3 w-full rounded-lg bg-white/15 hover:bg-white/25 py-1.5 text-xs font-semibold transition-colors"
            >
              {subscription?.status === 'promotional' ? 'View plan'
                : subscription?.status === 'active' ? 'Manage billing'
                : 'Set up billing'}
            </button>
          </div>
          <div className="mt-2 space-y-0.5 px-1 text-[11px] text-ink-400">
            <p>{statusLabel}</p>
            {access.kind !== 'ok' && <p className="text-amber-600">{access.message}</p>}
          </div>
          </div>
        ) : null}

      </aside>
    </>
  );
}
