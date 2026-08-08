/**
 * What this organisation pays, and whether it has.
 *
 * Replaces a plan card that quoted "₹4,999/seat/year" beside a hardcoded next
 * invoice of ₹2,99,940, a due date of 01 Jan 2027 and a card ending 4242 —
 * demo fiction that would have been read as a bill. Everything here comes from
 * the subscription record, and where there is no record it says so rather than
 * inventing one.
 *
 * One price: ₹5,000 per organisation per month, whatever the headcount.
 */
import { useState } from 'react';
import { CreditCard, ShieldCheck, AlertCircle, Users } from 'lucide-react';

import { Badge, Button, Card, CardHeader, type BadgeTone } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { auth } from '@/lib/firebase';
import { useSubscription } from '@/lib/useSubscription';
import { PLAN, formatPaise, priceFor, GST_RATE, type SubscriptionStatus } from '@/data/subscription';
import { billingConfigured, startSubscriptionCheckout, BillingNotConfiguredError } from '@/lib/razorpay';
import { getEmployeeDirectory } from '@/data/employees';
import { getCompanyProfile } from '@/data/companyProfile';
import { formatDate } from '@/lib/utils';

const STATUS_TONE: Record<SubscriptionStatus, BadgeTone> = {
  active: 'green',
  trialing: 'violet',
  past_due: 'amber',
  cancelled: 'red',
  none: 'gray',
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Payment failed',
  cancelled: 'Cancelled',
  none: 'Not subscribed',
};

export function SubscriptionPanel() {
  const { profile } = useAuth();
  const { subscription, access } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const price = priceFor(1);
  const headcount = getEmployeeDirectory().length;
  const company = getCompanyProfile();
  const status = subscription?.status ?? 'none';

  async function handlePay() {
    setError('');
    if (!profile?.orgId) {
      setError('Your account is not attached to an organisation, so there is nothing to bill.');
      return;
    }
    setBusy(true);
    try {
      // The Firebase ID token is what the server uses to decide which
      // organisation is paying — never a value from this page. Taken from the
      // live auth user rather than the profile snapshot, which is a plain
      // object read out of Firestore and carries no credential.
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Could not verify your session. Sign in again.');
      await startSubscriptionCheckout(
        {
          orgId: profile.orgId,
          organisationName: company.name || 'This organisation',
          email: company.supportEmail || profile.email,
          name: profile.displayName,
        },
        idToken,
      );
      // Deliberately no optimistic "you are now subscribed": the record is
      // written by the payment webhook, and the snapshot listener updates this
      // panel when it lands. Claiming success here would show Active to
      // someone whose payment had not actually been confirmed.
    } catch (err) {
      if (err instanceof BillingNotConfiguredError) {
        setError(
          'Online payment is not connected for this deployment yet. See docs/billing-razorpay.md — ' +
          'the server half (subscription creation and webhook verification) has to be deployed first.',
        );
      } else {
        setError(err instanceof Error ? err.message : 'The payment could not be started.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 mb-5">
      <Card className="border-2 border-brand-200 bg-gradient-to-br from-brand-50 to-violet-50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-brand-600 flex items-center justify-center">
              <ShieldCheck size={22} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-ink-900 text-lg">{PLAN.name}</span>
                <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
              </div>
              <p className="text-sm text-ink-600">{PLAN.description}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-ink-900">{formatPaise(PLAN.pricePaise)}</p>
            <p className="text-xs text-ink-500">per month, excl. GST</p>
          </div>
        </div>
      </Card>

      {access.kind !== 'ok' && (
        <div
          className={
            access.kind === 'blocked'
              ? 'flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'
              : 'flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'
          }
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{access.message}</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="This month" subtitle="One organisation, one price" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-500">Subscription</span>
              <span className="font-semibold">{formatPaise(price.basePaise)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">GST ({Math.round(GST_RATE * 100)}%)</span>
              <span className="font-semibold">{formatPaise(price.gstPaise)}</span>
            </div>
            <div className="flex justify-between border-t border-ink-100 pt-2">
              <span className="text-ink-700 font-medium">Total</span>
              <span className="font-bold text-ink-900">{formatPaise(price.totalPaise)}</span>
            </div>
            {company.gstin && (
              <p className="text-xs text-ink-400 pt-1">Billed to GSTIN {company.gstin}</p>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-ink-100">
            <Button variant="primary" size="sm" className="w-full" onClick={handlePay} disabled={busy}
              icon={<CreditCard size={15} />}>
              {busy
                ? 'Opening payment…'
                : status === 'active' ? 'Manage payment method' : 'Pay with Razorpay'}
            </Button>
            {!billingConfigured() && (
              <p className="text-xs text-ink-400 mt-2">
                Payments are not connected in this deployment yet.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Your organisation" subtitle="Headcount does not change the price" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-ink-500 flex items-center gap-1.5"><Users size={14} /> Employees</span>
              <span className="font-semibold">{headcount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">Current period</span>
              <span className="font-semibold">
                {subscription
                  ? `${formatDate(subscription.currentPeriodStart)} – ${formatDate(subscription.currentPeriodEnd)}`
                  : 'Not started'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">Last payment</span>
              <span className="font-semibold">
                {subscription?.lastPaymentAt ? formatDate(subscription.lastPaymentAt) : '—'}
              </span>
            </div>
            {subscription?.lastFailureReason && (
              <p className="text-xs text-rose-600 pt-1">{subscription.lastFailureReason}</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
