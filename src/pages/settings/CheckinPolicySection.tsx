import { useEffect, useState } from 'react'
import { AlertCircle, Clock } from 'lucide-react'
import { Card, Button, Select } from '@/components/ui'
import {
  checkinPolicyConfigured,
  getCheckinPolicy,
  saveCheckinPolicy,
  type CheckinPolicy,
} from '@/lib/checkinPolicy'

/**
 * Settings → Progress check-ins.
 *
 * Its own file rather than another section inside settings/index.tsx, which is
 * already past three thousand lines. It also does not share that page's save
 * machinery: every other setting is written to localStorage and published to
 * Firestore, while this one is a request to a different backend that either
 * lands or does not — there is no local copy to reconcile.
 *
 * The heading deliberately avoids the words "leave policies". Playwright
 * matches an accessible name by substring, and Leave Policies is a heading on
 * this same page (CLAUDE.md).
 */

const CHANNELS = [
  { value: 'app', label: 'In the app' },
  { value: 'chat', label: 'Chat (Slack)' },
  { value: 'email', label: 'Email' },
  { value: 'call', label: 'Phone call' },
]

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, '0')}:00`,
}))

/** What a first-time organisation is offered — shown, never saved on its behalf. */
const STARTING_POINT: CheckinPolicy = {
  cadence_days: 7,
  channel_ladder: ['app', 'chat', 'email'],
  escalate_after_days: 2,
  quiet_start: 19,
  quiet_end: 9,
  timezone: 'Asia/Kolkata',
}

export default function CheckinPolicySection() {
  const [policy, setPolicy] = useState<CheckinPolicy>(STARTING_POINT)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!checkinPolicyConfigured) {
      setLoading(false)
      return
    }
    let cancelled = false
    getCheckinPolicy()
      .then((existing) => {
        if (cancelled) return
        setConfigured(existing !== null)
        if (existing) setPolicy(existing)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await saveCheckinPolicy(policy)
      setConfigured(true)
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function toggleChannel(value: string) {
    setPolicy((current) => ({
      ...current,
      channel_ladder: current.channel_ladder.includes(value)
        ? current.channel_ladder.filter((c) => c !== value)
        : [...current.channel_ladder, value],
    }))
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Progress check-ins</h2>
          <p className="text-sm text-ink-500 mt-0.5">
            How often this organisation asks its people for an update on their goals, and how.
          </p>
        </div>
        {saved && !saving && <span className="text-sm text-emerald-600">Saved</span>}
        {saving && <span className="text-sm text-ink-500">Saving…</span>}
      </div>

      <Card>
        {/* Not configured for this deployment at all — a different thing from an
            organisation that has not set a policy, and said differently. */}
        {!checkinPolicyConfigured ? (
          <p className="text-sm text-ink-500">
            Progress check-ins are not connected to this deployment. Nothing is being sent.
          </p>
        ) : loading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : (
          <div className="space-y-5">
            {configured === false && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
                <p className="text-sm text-amber-800">
                  Nobody in this organisation is being asked for progress. Saving a policy below is
                  what starts it.
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-600" />
                <p className="text-sm text-rose-800">{error}</p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-ink-700">Ask every</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    className="input w-24"
                    value={policy.cadence_days}
                    onChange={(e) =>
                      setPolicy({ ...policy, cadence_days: Number(e.target.value) })}
                  />
                  <span className="text-sm text-ink-500">days</span>
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-ink-700">Escalate after</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    className="input w-24"
                    value={policy.escalate_after_days}
                    onChange={(e) =>
                      setPolicy({ ...policy, escalate_after_days: Number(e.target.value) })}
                  />
                  <span className="text-sm text-ink-500">days without an answer</span>
                </div>
              </label>
            </div>

            <div>
              <span className="text-sm font-medium text-ink-700">Channels, gentlest first</span>
              <p className="text-xs text-ink-500 mt-0.5">
                The order matters: an unanswered check-in moves down this list before it gives up.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CHANNELS.map((channel) => {
                  const position = policy.channel_ladder.indexOf(channel.value)
                  const chosen = position !== -1
                  return (
                    <button
                      key={channel.value}
                      type="button"
                      onClick={() => toggleChannel(channel.value)}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        chosen
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-ink-200 text-ink-600'
                      }`}
                    >
                      {chosen && <span className="mr-1 font-semibold">{position + 1}.</span>}
                      {channel.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="text-sm font-medium text-ink-700">Quiet from</span>
                <Select
                  className="mt-1"
                  value={String(policy.quiet_start)}
                  onChange={(v) => setPolicy({ ...policy, quiet_start: Number(v) })}
                  options={HOURS}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink-700">Quiet until</span>
                <Select
                  className="mt-1"
                  value={String(policy.quiet_end)}
                  onChange={(v) => setPolicy({ ...policy, quiet_end: Number(v) })}
                  options={HOURS}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink-700">Timezone</span>
                <input
                  className="input mt-1"
                  value={policy.timezone}
                  onChange={(e) => setPolicy({ ...policy, timezone: e.target.value })}
                />
              </label>
            </div>

            <p className="flex items-center gap-1.5 text-xs text-ink-500">
              <Clock size={13} />
              Quiet hours are read in each employee&rsquo;s own timezone where one is recorded.
            </p>

            <div className="flex justify-end">
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save check-in policy'}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
