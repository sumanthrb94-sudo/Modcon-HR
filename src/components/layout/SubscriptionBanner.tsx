import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useSubscription, formatPaise, LOCKED_CAPABILITIES } from '@/lib/subscription';

/**
 * The trial countdown, the grace warning, and the lock notice.
 *
 * Rendered above every page rather than on a billing screen nobody visits: a
 * trial ending is the one piece of state where the cost of not noticing lands
 * on the customer, not on us.
 *
 * ## It says nothing during a trial's early days
 *
 * A countdown from day fourteen is a nag, and a nag is read as furniture by the
 * time it matters. The banner appears in the last stretch of a trial, and then
 * every day after it ends. `QUIET_UNTIL_DAYS` is that threshold, named rather
 * than inlined so it can be argued with.
 *
 * ## An employee is not shown their employer's invoice
 *
 * The trial and grace banners are for whoever can act on them — the
 * administrators. An employee seeing "3 days left in your trial" on their leave
 * page can do nothing about it and reasonably concludes their job is at risk.
 * The **locked** notice is shown to everyone, because at that point the app is
 * visibly refusing to do things and silence would read as it being broken.
 */
const QUIET_UNTIL_DAYS = 5;

export function SubscriptionBanner() {
  const { profile, isAdmin } = useAuth();
  const { status, record, loading } = useSubscription();

  // Nothing renders until the record has arrived. A lock screen that flashes at
  // a paying customer while a read is in flight is worse than a second of
  // nothing — see the note in lib/subscription.ts on failing open.
  if (loading) return null;

  const canAct = isAdmin || profile?.role === 'hr';

  if (status.state === 'locked') {
    return (
      <div className="border-b-2 border-brand-600 bg-brand-50 px-4 py-3 lg:px-6">
        <div className="mx-auto flex max-w-[1600px] items-start gap-3">
          <Lock size={18} className="mt-0.5 shrink-0 text-brand-600" />
          <div className="min-w-0">
            <p className="font-semibold text-ink-900">{status.message}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-700">
              Everyone can still read their own records — attendance, leave and payslips are
              untouched. What has stopped is {LOCKED_CAPABILITIES[0].toLowerCase()}, changing the
              directory, deciding approvals and editing settings.
            </p>
            {canAct && (
              <Link
                to="/settings?tab=billing"
                className="mt-2 inline-block text-sm font-medium text-brand-700 underline underline-offset-2"
              >
                Arrange billing
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Below here it is a countdown, and a countdown is only for somebody who can
  // do something about it.
  if (!canAct) return null;

  if (status.state === 'grace') {
    return (
      <div className="border-b border-amber-500 bg-amber-50 px-4 py-2.5 lg:px-6">
        <div className="mx-auto flex max-w-[1600px] items-center gap-2.5 text-sm">
          <AlertTriangle size={16} className="shrink-0 text-amber-600" />
          <span className="text-ink-900">{status.message}</span>
          <Link
            to="/settings?tab=billing"
            className="ml-auto shrink-0 font-medium text-ink-900 underline underline-offset-2"
          >
            Arrange billing
          </Link>
        </div>
      </div>
    );
  }

  if (status.state === 'trialing' && (status.daysRemaining ?? 99) <= QUIET_UNTIL_DAYS) {
    return (
      <div className="border-b border-ink-300 bg-ink-100 px-4 py-2.5 lg:px-6">
        <div className="mx-auto flex max-w-[1600px] items-center gap-2.5 text-sm">
          <Clock size={16} className="shrink-0 text-ink-500" />
          <span className="text-ink-800">
            {status.message}
            {record.trialPricePaise ? (
              <span className="text-ink-500">
                {' '}You started on the {formatPaise(record.trialPricePaise)} trial.
              </span>
            ) : null}
          </span>
          <Link
            to="/settings?tab=billing"
            className="ml-auto shrink-0 font-medium text-ink-900 underline underline-offset-2"
          >
            Continue after the trial
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
