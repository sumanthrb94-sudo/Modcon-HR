import { useMemo, useState } from 'react';
import { AlertTriangle, Ban, Check, Clock, Gift, Loader2, ShieldCheck, Wallet } from 'lucide-react';
import { Card, CardHeader, Button, Badge, Modal, Table, Select, EmptyState } from '@/components/ui';
import type { Column } from '@/components/ui';
import type { Organization } from '@/types';
import { useAuth } from '@/lib/auth';
import {
  DEFAULT_GRACE_DAYS,
  DEFAULT_TRIAL_DAYS,
  beginTrial,
  clearOverride,
  closeSubscriptionRequest,
  formatPaise,
  grantPaidTerm,
  overrideSubscription,
  resolveSubscription,
  setSuspended,
  setTrialEndBehaviour,
  subscriptionOf,
  useOpenSubscriptionRequests,
  type SubscriptionStatus,
} from '@/lib/subscription';

/**
 * Organizations → Subscriptions. Super admin only.
 *
 * Everything commercial about a tenant is decided here, because
 * `organizations/{orgId}` is super-admin-writable and nothing else is. An
 * organisation cannot extend its own trial, mark itself paid or comp itself,
 * which is the property the whole model rests on — `tests/rules/
 * subscription.rules.test.mjs` is where that is asserted rather than assumed.
 *
 * ## Paid and comped are different buttons on purpose
 *
 * "Record payment" writes `paidThrough`; "Carry this organisation" writes an
 * override with a reason and a name against it. They could be one control that
 * moves a date, and they must not be: a comp recorded as a payment is a comp
 * nobody can find again, and it will be looked for again — at renewal, by
 * somebody who was not there when it was promised.
 *
 * ## Confirming a payment is a manual step, and the UI says so
 *
 * There is no charge in this app and no server to receive a signed webhook, so
 * the only trustworthy confirmation is a human checking the provider's own
 * dashboard against the reference the tenant sent. `grantPaidTerm` is exactly
 * what a webhook handler would call when there is one; what changes then is the
 * confirmation, not the shape.
 */

const TRIAL_PRESETS = [
  { label: '₹1 for 14 days', days: 14, pricePaise: 100 },
  { label: '₹1 for 30 days', days: 30, pricePaise: 100 },
  { label: 'Free for 14 days', days: 14, pricePaise: 0 },
  { label: 'Free for 30 days', days: 30, pricePaise: 0 },
];

function isoInDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '—';
  return new Date(parsed).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StateBadge({ status }: { status: SubscriptionStatus }) {
  if (status.state === 'locked') return <Badge tone="red" dot>Locked</Badge>;
  if (status.state === 'grace') return <Badge tone="amber" dot>Grace</Badge>;
  if (status.state === 'trialing') return <Badge tone="blue" dot>Trial</Badge>;
  if (status.onOverride) return <Badge tone="violet" dot>Carried</Badge>;
  return <Badge tone="green" dot>Active</Badge>;
}

export default function SubscriptionsPanel({
  organizations,
  loading,
}: {
  organizations: Organization[];
  loading: boolean;
}) {
  const { profile, isSuperAdmin } = useAuth();
  const requests = useOpenSubscriptionRequests(isSuperAdmin);

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [target, setTarget] = useState<Organization | null>(null);
  const [mode, setMode] = useState<'trial' | 'paid' | 'override' | 'suspend' | null>(null);

  const [presetIndex, setPresetIndex] = useState('0');
  const [graceDays, setGraceDays] = useState(String(DEFAULT_GRACE_DAYS));
  const [behaviour, setBehaviour] = useState<'lock' | 'stayActive'>('lock');
  const [paidMonths, setPaidMonths] = useState('12');
  const [overrideDays, setOverrideDays] = useState('90');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const rows = useMemo(
    () =>
      organizations.map((org) => {
        const record = subscriptionOf(org as unknown as Record<string, unknown>);
        return { org, record, status: resolveSubscription(record) };
      }),
    [organizations],
  );

  function open(org: Organization, next: typeof mode) {
    setTarget(org);
    setMode(next);
    setReason('');
    setReasonError('');
    setNotice('');
  }

  function close() {
    setTarget(null);
    setMode(null);
  }

  async function run(label: string, action: () => Promise<void>) {
    if (!target?.id) return;
    setBusy(target.id);
    try {
      await action();
      setNotice(`${label} — ${target.name}.`);
      close();
    } catch (err) {
      setNotice(`Could not ${label.toLowerCase()}: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: 'name',
      header: 'Organization',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-900 truncate">{row.org.name}</p>
          <p className="text-xs text-ink-500 truncate">{row.org.adminEmail}</p>
        </div>
      ),
    },
    {
      key: 'state',
      header: 'Standing',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <StateBadge status={row.status} />
          {row.status.daysRemaining !== null && (
            <span className="text-xs text-ink-500">
              {row.status.daysRemaining} {row.status.daysRemaining === 1 ? 'day' : 'days'} left
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'trial',
      header: 'Trial',
      render: (row) => (
        <div className="text-xs text-ink-600">
          <p>{shortDate(row.record.trialEndsAt)}</p>
          {row.record.trialPricePaise !== undefined && (
            <p className="text-ink-400">{formatPaise(row.record.trialPricePaise)} entry</p>
          )}
        </div>
      ),
    },
    {
      key: 'paid',
      header: 'Paid through',
      render: (row) => <span className="text-xs text-ink-600">{shortDate(row.record.paidThrough)}</span>,
    },
    {
      key: 'override',
      header: 'Carried',
      // Shown as its own column rather than folded into the standing: an
      // override is a promise somebody made, and it has to be findable by
      // whoever is looking at renewal without opening a dialog per row.
      render: (row) =>
        row.record.overrideUntil ? (
          <div className="text-xs">
            <p className="text-ink-700">to {shortDate(row.record.overrideUntil)}</p>
            <p className="text-ink-400 truncate max-w-[180px]" title={row.record.overrideReason}>
              {row.record.overrideReason}
            </p>
            <p className="text-ink-400">by {row.record.overrideBy}</p>
          </div>
        ) : (
          <span className="text-xs text-ink-300">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button variant="secondary" className="text-xs py-1" onClick={() => open(row.org, 'trial')}>
            <Clock size={12} className="mr-1" /> Trial
          </Button>
          <Button variant="secondary" className="text-xs py-1" onClick={() => open(row.org, 'paid')}>
            <Wallet size={12} className="mr-1" /> Payment
          </Button>
          <Button variant="secondary" className="text-xs py-1" onClick={() => open(row.org, 'override')}>
            <Gift size={12} className="mr-1" /> Carry
          </Button>
          <Button variant="secondary" className="text-xs py-1" onClick={() => open(row.org, 'suspend')}>
            <Ban size={12} className="mr-1" /> {row.record.suspended ? 'Restore' : 'Suspend'}
          </Button>
          {row.record.overrideUntil && (
            <Button
              variant="secondary"
              className="text-xs py-1"
              disabled={busy === row.org.id}
              onClick={() => {
                setTarget(row.org);
                void clearOverride(row.org.id!).then(() => setNotice(`Override withdrawn — ${row.org.name}.`));
              }}
            >
              Withdraw
            </Button>
          )}
        </div>
      ),
    },
  ];

  const targetRecord = target ? subscriptionOf(target as unknown as Record<string, unknown>) : null;

  return (
    <div className="space-y-6">
      {notice && (
        <div className="flex items-center gap-2 border border-ink-300 bg-ink-100 px-4 py-2.5 text-sm text-ink-800">
          <Check size={15} className="shrink-0 text-emerald-600" /> {notice}
        </div>
      )}

      {/* ---- The queue --------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Requests from organizations"
          subtitle="A tenant can ask; only this page grants. Confirm the reference against the provider before recording a payment."
        />
        {requests.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing waiting.</p>
        ) : (
          <ul className="divide-y divide-ink-200">
            {requests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">
                    {request.kind === 'activate' && 'Activate subscription'}
                    {request.kind === 'extend-trial' && 'Extend trial'}
                    {request.kind === 'add-seats' && `Add seats${request.seats ? ` (${request.seats})` : ''}`}
                    <span className="ml-2 text-xs font-normal text-ink-500">{request.orgId}</span>
                  </p>
                  <p className="text-xs text-ink-500">{request.requestedByEmail}</p>
                  {request.reference && (
                    <p className="mt-1 text-xs text-ink-700">
                      Reference <span className="font-mono">{request.reference}</span>
                    </p>
                  )}
                  {request.note && <p className="mt-1 text-xs leading-relaxed text-ink-600">{request.note}</p>}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="text-xs py-1"
                    onClick={() => void closeSubscriptionRequest(request.id!, 'actioned')}
                  >
                    Mark done
                  </Button>
                  <Button
                    variant="secondary"
                    className="text-xs py-1"
                    onClick={() => void closeSubscriptionRequest(request.id!, 'declined')}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-ink-500">
          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-600" />
          <span>
            Nothing here charges anybody. The only trustworthy signal that money arrived is a signed
            webhook to a server, and this deployment has none — so a payment is confirmed by a
            person against the provider&rsquo;s own dashboard, and then recorded below.
          </span>
        </p>
      </Card>

      {/* ---- The tenants -------------------------------------------------- */}
      <Card>
        <CardHeader title="Subscriptions" subtitle="Every organization's commercial standing" />
        {loading ? (
          <div className="flex items-center justify-center py-10 text-ink-400">
            <Loader2 className="animate-spin mr-2" size={18} /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No organizations yet" description="Create one to put it on a trial." />
        ) : (
          <Table columns={columns} data={rows} keyExtractor={(row) => row.org.id ?? row.org.adminEmail} />
        )}
      </Card>

      {/* ---- Trial -------------------------------------------------------- */}
      <Modal open={mode === 'trial'} onClose={close} title={`Start a trial — ${target?.name ?? ''}`}>
        <div className="space-y-4">
          <div>
            <label className="label">Offer</label>
            <Select
              ariaLabel="Trial offer"
              value={presetIndex}
              onChange={setPresetIndex}
              options={TRIAL_PRESETS.map((preset, index) => ({
                value: String(index),
                label: preset.label,
              }))}
            />
            <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
              The price is written onto the organisation&rsquo;s record, not looked up later. Somebody
              who signs up under a ₹1 trial keeps that offer even if the campaign ends while they
              are still inside it.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="grace-days">Grace days after it ends</label>
              <input
                id="grace-days"
                className="input"
                type="number"
                min={0}
                value={graceDays}
                onChange={(event) => setGraceDays(event.target.value)}
              />
            </div>
            <div>
              <label className="label">When it ends</label>
              <Select
                ariaLabel="Trial end behaviour"
                value={behaviour}
                onChange={(value) => setBehaviour(value === 'stayActive' ? 'stayActive' : 'lock')}
                options={[
                  { value: 'lock', label: 'Lock after the grace period' },
                  { value: 'stayActive', label: 'Stay open (carry them)' },
                ]}
              />
            </div>
          </div>

          <p className="text-xs leading-relaxed text-ink-500">
            Starting a trial clears any suspension and any override on this organisation — otherwise
            it would be shown a fresh countdown while something else was actually keeping it open,
            and nobody could tell which.
          </p>

          <div className="flex gap-2">
            <Button
              disabled={busy !== null}
              onClick={() => {
                const preset = TRIAL_PRESETS[Number(presetIndex)] ?? TRIAL_PRESETS[0];
                void run('Trial started', () =>
                  beginTrial({
                    orgId: target!.id!,
                    days: preset.days,
                    pricePaise: preset.pricePaise,
                    graceDays: Number(graceDays) || 0,
                    behaviour,
                  }),
                );
              }}
            >
              Start trial
            </Button>
            <Button
              variant="secondary"
              disabled={busy !== null || !targetRecord?.trialEndsAt}
              onClick={() =>
                void run('Trial-end behaviour updated', () =>
                  setTrialEndBehaviour({
                    orgId: target!.id!,
                    behaviour,
                    graceDays: Number(graceDays) || 0,
                  }),
                )
              }
            >
              Only change what happens at the end
            </Button>
          </div>
        </div>
      </Modal>

      {/* ---- Payment ------------------------------------------------------ */}
      <Modal open={mode === 'paid'} onClose={close} title={`Record a payment — ${target?.name ?? ''}`}>
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="paid-months">Paid through</label>
            <Select
              ariaLabel="Paid term"
              value={paidMonths}
              onChange={setPaidMonths}
              options={[
                { value: '1', label: '1 month' },
                { value: '3', label: '3 months' },
                { value: '12', label: '12 months' },
              ]}
            />
          </div>
          <div className="border border-amber-500 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-ink-800">
            <p className="font-medium">Confirm the money first.</p>
            <p className="mt-1">
              This records a paid term; it does not take a payment and cannot verify one. Check the
              reference the organisation sent against the provider&rsquo;s dashboard before writing
              it — a term recorded here is what stops their workspace locking.
            </p>
          </div>
          <Button
            disabled={busy !== null}
            onClick={() =>
              void run('Payment recorded', () =>
                grantPaidTerm({
                  orgId: target!.id!,
                  paidThroughIso: isoInDays(Number(paidMonths) * 30),
                }),
              )
            }
          >
            <Wallet size={14} className="mr-1.5" /> Record payment
          </Button>
        </div>
      </Modal>

      {/* ---- Override ------------------------------------------------------ */}
      <Modal open={mode === 'override'} onClose={close} title={`Carry this organisation — ${target?.name ?? ''}`}>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink-600">
            Keeps the workspace open whatever the dates say, without recording a payment. Use it for
            a design partner, a migration in progress, or a customer between purchase orders.
          </p>
          <div>
            <label className="label" htmlFor="override-days">For how long</label>
            <input
              id="override-days"
              className="input"
              type="number"
              min={1}
              value={overrideDays}
              onChange={(event) => setOverrideDays(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="override-reason">Why</label>
            <input
              id="override-reason"
              className="input"
              placeholder="e.g. Design partner through the pilot"
              value={reason}
              onChange={(event) => { setReason(event.target.value); setReasonError(''); }}
            />
            {reasonError && <p className="mt-1 text-xs text-brand-700">{reasonError}</p>}
            <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
              Required. An override with no reason is indistinguishable from a mistake six months
              later, and whoever finds it will either revoke a promise somebody made or honour one
              nobody did. Your address is stamped on it.
            </p>
          </div>
          <Button
            disabled={busy !== null}
            onClick={() => {
              if (!reason.trim()) {
                setReasonError('Say why. This is what somebody reads at renewal.');
                return;
              }
              void run('Organization carried', () =>
                overrideSubscription({
                  orgId: target!.id!,
                  untilIso: isoInDays(Number(overrideDays) || 30),
                  reason,
                  byEmail: profile?.email ?? 'unknown',
                }),
              );
            }}
          >
            <Gift size={14} className="mr-1.5" /> Carry them
          </Button>
        </div>
      </Modal>

      {/* ---- Suspend ------------------------------------------------------- */}
      <Modal
        open={mode === 'suspend'}
        onClose={close}
        title={`${targetRecord?.suspended ? 'Restore' : 'Suspend'} — ${target?.name ?? ''}`}
      >
        <div className="space-y-4">
          {targetRecord?.suspended ? (
            <>
              <p className="text-sm text-ink-600">
                Suspended: {targetRecord.suspendedReason || 'no reason recorded'}. Restoring hands
                the decision back to the dates on the record.
              </p>
              <Button
                disabled={busy !== null}
                onClick={() => void run('Restored', () => setSuspended({ orgId: target!.id!, suspended: false }))}
              >
                <ShieldCheck size={14} className="mr-1.5" /> Restore
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-ink-600">
                Stops the workspace immediately, whatever the dates say — including a paid term. A
                payment that has not been refunded yet must not quietly undo this, so suspension
                beats everything until it is lifted here.
              </p>
              <div>
                <label className="label" htmlFor="suspend-reason">Why</label>
                <input
                  id="suspend-reason"
                  className="input"
                  placeholder="e.g. Chargeback under investigation"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <p className="mt-1.5 text-xs text-ink-500">
                  Shown to the organisation. Whoever reads it should know who to talk to.
                </p>
              </div>
              <Button
                disabled={busy !== null}
                onClick={() =>
                  void run('Suspended', () =>
                    setSuspended({ orgId: target!.id!, suspended: true, reason }),
                  )
                }
              >
                <Ban size={14} className="mr-1.5" /> Suspend
              </Button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

export { DEFAULT_TRIAL_DAYS };
