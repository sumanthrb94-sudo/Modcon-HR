import { useState } from 'react';
import { AlertCircle, Check, Clock, Lock, Send } from 'lucide-react';
import { Card, CardHeader, Button, Badge, Select } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  LOCKED_CAPABILITIES,
  formatPaise,
  requestActivation,
  useSubscription,
} from '@/lib/subscription';

/**
 * Settings → Billing: what this organisation's standing actually is, and how to
 * change it.
 *
 * ## Why this asks rather than charges
 *
 * The subscription lives on `organizations/{orgId}`, which is super-admin
 * writable and nothing else — that is what stops an organisation extending its
 * own trial, and it is the property the whole model rests on. The cost is that a
 * tenant cannot mark itself paid either, so what this form does is **raise a
 * request**: a message with a payment reference on it that a super admin
 * confirms against the provider's own dashboard.
 *
 * That manual step is not a placeholder for a missing button. The only
 * trustworthy signal that money arrived is a signed webhook to a server, and
 * this deployment has no server to receive one — so anything the browser
 * reported about a payment would be a claim by the party who owes it. When
 * there is a Cloud Function, it replaces the human confirmation and calls the
 * same `grantPaidTerm`; the request document and the shape stay as they are.
 *
 * The page says all of this, because a billing screen that looks like a
 * checkout and is not one wastes somebody's afternoon.
 */
export default function SubscriptionCard() {
  const { profile } = useAuth();
  const { status, record, loading } = useSubscription();

  const [kind, setKind] = useState<'activate' | 'extend-trial' | 'add-seats'>('activate');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    if (!profile?.uid) return;
    setError('');
    setSending(true);
    try {
      await requestActivation({
        kind,
        reference,
        note,
        uid: profile.uid,
        email: profile.email ?? '',
      });
      setSent(true);
      setReference('');
      setNote('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (loading) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Your subscription"
          subtitle="What this workspace's standing is today"
          action={
            status.state === 'locked' ? <Badge tone="red" dot>Locked</Badge>
              : status.state === 'grace' ? <Badge tone="amber" dot>Grace period</Badge>
                : status.state === 'trialing' ? <Badge tone="blue" dot>Trial</Badge>
                  : <Badge tone="green" dot>Active</Badge>
          }
        />

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {record.planName && (
            <div className="contents">
              <dt className="text-ink-500">Plan</dt>
              <dd className="text-ink-900">{record.planName}</dd>
            </div>
          )}
          {record.trialEndsAt && (
            <div className="contents">
              <dt className="text-ink-500">Trial ends</dt>
              <dd className="text-ink-900">
                {new Date(record.trialEndsAt).toLocaleDateString('en-IN', {
                  day: '2-digit', month: 'long', year: 'numeric',
                })}
                {record.trialPricePaise !== undefined && (
                  <span className="text-ink-500"> · started on the {formatPaise(record.trialPricePaise)} trial</span>
                )}
              </dd>
            </div>
          )}
          {record.paidThrough && (
            <div className="contents">
              <dt className="text-ink-500">Paid through</dt>
              <dd className="text-ink-900">
                {new Date(record.paidThrough).toLocaleDateString('en-IN', {
                  day: '2-digit', month: 'long', year: 'numeric',
                })}
              </dd>
            </div>
          )}
          {status.daysRemaining !== null && (
            <div className="contents">
              <dt className="text-ink-500">Days remaining</dt>
              <dd className="text-ink-900 tabular-nums">{status.daysRemaining}</dd>
            </div>
          )}
        </dl>

        {status.message && (
          <p className="mt-3 flex items-start gap-2 border-t border-ink-200 pt-3 text-sm text-ink-700">
            {status.locked
              ? <Lock size={15} className="mt-0.5 shrink-0 text-brand-600" />
              : <Clock size={15} className="mt-0.5 shrink-0 text-ink-400" />}
            <span>{status.message}</span>
          </p>
        )}

        {status.locked && (
          <div className="mt-3 border border-ink-300 bg-ink-100 px-4 py-3 text-sm">
            <p className="font-medium text-ink-900">What is paused</p>
            <ul className="mt-1.5 space-y-0.5 text-ink-700">
              {LOCKED_CAPABILITIES.map((capability) => (
                <li key={capability}>· {capability}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs leading-relaxed text-ink-600">
              Nothing is deleted and nothing is hidden. Everyone can still read their own records —
              attendance, leave balances and payslips are untouched, and so is your directory.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Ask us to activate"
          subtitle="Send the payment reference and we will confirm it against the provider"
        />

        {sent ? (
          <div className="flex items-start gap-2 border border-ink-300 bg-ink-100 px-4 py-3 text-sm">
            <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium text-ink-900">Sent.</p>
              <p className="mt-1 text-ink-700">
                Your workspace keeps working while this is looked at. You will see the standing above
                change once it is confirmed.
              </p>
              <button
                type="button"
                className="mt-2 text-sm font-medium text-brand-700 underline underline-offset-2"
                onClick={() => setSent(false)}
              >
                Send another
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">What do you need</label>
                <Select
                  ariaLabel="Request kind"
                  value={kind}
                  onChange={(value) => setKind(value as typeof kind)}
                  options={[
                    { value: 'activate', label: 'Activate a paid subscription' },
                    { value: 'extend-trial', label: 'Extend the trial' },
                    { value: 'add-seats', label: 'Add seats' },
                  ]}
                />
              </div>
              <div>
                <label className="label" htmlFor="payment-reference">Payment reference</label>
                <input
                  id="payment-reference"
                  className="input"
                  placeholder="Transaction id, UTR or invoice number"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="billing-note">Anything else</label>
              <textarea
                id="billing-note"
                className="input min-h-[80px]"
                placeholder="Purchase order number, billing address, how many seats…"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

            {error && (
              <p className="flex items-start gap-2 text-sm text-brand-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
              </p>
            )}

            <Button onClick={send} disabled={sending}>
              <Send size={14} className="mr-1.5" /> {sending ? 'Sending…' : 'Send request'}
            </Button>

            <p className="text-xs leading-relaxed text-ink-500">
              This form does not take a payment, and it is honest about that rather than looking like
              a checkout that fails at the last step. Your subscription is held on a record only we
              can write — which is what stops anybody, including us by accident, extending a trial
              from a browser — so a payment is confirmed against the provider&rsquo;s own dashboard
              and then recorded. Your workspace keeps working while that happens.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
