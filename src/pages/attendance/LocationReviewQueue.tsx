/**
 * The stamps that need a human to look at them.
 *
 * This is the "consequences" half of geofenced attendance, and the shape of it
 * is the point. Nothing in this app can establish that a set of coordinates is
 * genuine — the browser reports what the platform hands it, and on a rooted or
 * developer-mode device that is whatever a mock-location app says. So the
 * system does the part it can do honestly: it records where each stamp claimed
 * to be, flags the ones whose shape does not look like a real receiver's, and
 * puts them in front of somebody who can go and check.
 *
 * `falsified` is therefore a person's finding, never the system's inference.
 * The wording throughout says so, because a queue that reads as an accusation
 * gets treated as one — and every signal here has a false-positive story
 * (a laptop on office wifi, a genuine flight, a phone that reports no altitude).
 *
 * A recorded finding is permanent in the direction that matters: firestore.rules
 * lets an administrator attach a review and lets nobody — the employee included
 * — alter the stamp underneath it.
 */
import { useMemo, useState } from 'react';
import { MapPin, ShieldAlert } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Modal,
  Select,
  Table,
  type Column,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getEmployeeName } from '@/data/employees';
import { formatDate } from '@/lib/utils';
import {
  needsReview,
  reviewAttendanceStamp,
  useOrgAttendanceStamps,
} from '@/lib/attendanceStamps';
import type { AttendanceStamp, AttendanceStampReview } from '@/types';

/** Why a stamp is in this queue, in the words of somebody who has to act on it. */
const SIGNAL_COPY: Record<string, string> = {
  'impossible-accuracy': 'Claimed a precision no consumer receiver produces',
  'no-sensor-detail': 'Satellite-grade precision with no altitude, speed or heading',
  'stale-fix': 'Position was minutes old when it was submitted',
  'repeated-fix': 'Coordinates identical to this person’s previous stamp',
  'impossible-travel': 'Too far from the previous stamp for the time between them',
  'exact-centre': 'Landed exactly on the attendance area’s centre point',
};

const OUTCOME_COPY: Record<string, string> = {
  outside: 'Outside every attendance area',
  inaccurate: 'Device could not place them precisely enough',
  unavailable: 'No position was captured',
  inside: 'Inside the attendance area',
};

export function LocationReviewQueue() {
  const { profile, isAdmin } = useAuth();
  // HR and platform admins. The rules say the same thing (`isOrgAdmin`), so a
  // user who forges a role locally gets the panel and then permission-denied.
  const canReview = isAdmin || profile?.role === 'hr';
  const { data: stamps, loading } = useOrgAttendanceStamps(profile, canReview);

  const [openStamp, setOpenStamp] = useState<AttendanceStamp | null>(null);
  const [verdict, setVerdict] = useState<AttendanceStampReview['verdict']>('genuine');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const queue = useMemo(() => stamps.filter(needsReview), [stamps]);
  const confirmedFalsified = useMemo(
    () => stamps.filter((s) => s.review?.verdict === 'falsified'),
    [stamps],
  );

  if (!canReview) return null;

  async function submitReview() {
    if (!openStamp) return;
    setSaving(true);
    setError('');
    const ok = await reviewAttendanceStamp({
      profile,
      stampId: openStamp.id,
      verdict,
      note,
      reviewerName: profile?.displayName || profile?.email || 'Administrator',
    });
    setSaving(false);
    if (!ok) {
      // Reaching this means the rules and the UI disagree about who may review,
      // and silence would look exactly like a finding that landed.
      setError('That finding could not be recorded. You may not have permission to review this stamp.');
      return;
    }
    setOpenStamp(null);
    setNote('');
    setVerdict('genuine');
  }

  const columns: Column<AttendanceStamp>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (stamp) => (
        <div>
          <p className="font-medium text-ink-900">{getEmployeeName(stamp.employeeId)}</p>
          <p className="text-xs text-ink-500">
            {formatDate(stamp.date)} · check {stamp.kind === 'in' ? 'in' : 'out'}
          </p>
        </div>
      ),
    },
    {
      key: 'where',
      header: 'Where',
      render: (stamp) => (
        <div>
          <p className="text-sm text-ink-800">
            {OUTCOME_COPY[stamp.outcome] ?? stamp.outcome}
          </p>
          {stamp.siteName && stamp.distanceMetres !== null && (
            <p className="text-xs text-ink-500">
              {stamp.distanceMetres} m from {stamp.siteName}
            </p>
          )}
          {stamp.lat !== null && stamp.lng !== null && (
            <p className="text-xs text-ink-400 font-mono">
              {stamp.lat.toFixed(5)}, {stamp.lng.toFixed(5)}
              {stamp.accuracyMetres !== null ? ` ±${Math.round(stamp.accuracyMetres)} m` : ''}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'signals',
      header: 'Flags',
      render: (stamp) =>
        stamp.signals.length === 0 ? (
          <span className="text-xs text-ink-400">—</span>
        ) : (
          <div className="space-y-1">
            {stamp.signals.map((code) => (
              <p key={code} className="text-xs text-ink-700">
                {SIGNAL_COPY[code] ?? code}
              </p>
            ))}
          </div>
        ),
    },
    {
      key: 'mode',
      header: 'Mode',
      render: (stamp) => (
        <Badge tone={stamp.mode === 'enforced' ? 'blue' : 'gray'}>{stamp.mode}</Badge>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (stamp) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setOpenStamp(stamp);
            setVerdict('genuine');
            setNote('');
            setError('');
          }}
        >
          Record finding
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card padding={false} data-testid="location-review-queue">
        <div className="p-5 border-b border-ink-200">
          <CardHeader
            title="Attendance locations to review"
            subtitle="Stamps that fell outside an area, or whose reading does not look like a receiver’s. A flag is a reason to check, not a finding."
            action={
              confirmedFalsified.length > 0 ? (
                <Badge tone="red">
                  {confirmedFalsified.length} confirmed falsified
                </Badge>
              ) : undefined
            }
          />
        </div>
        {loading ? (
          <p className="p-5 text-sm text-ink-500">Loading stamps…</p>
        ) : queue.length === 0 ? (
          <EmptyState
            icon={<MapPin size={26} />}
            title="Nothing to review"
            description="Every captured stamp landed inside an attendance area with an ordinary reading."
          />
        ) : (
          <Table columns={columns} data={queue} keyExtractor={(stamp) => stamp.id} />
        )}
      </Card>

      <Modal
        open={Boolean(openStamp)}
        onClose={() => setOpenStamp(null)}
        title="Record a finding"
        subtitle={
          openStamp
            ? `${getEmployeeName(openStamp.employeeId)} · ${formatDate(openStamp.date)}`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpenStamp(null)}>Cancel</Button>
            <Button onClick={submitReview} disabled={saving}>
              {saving ? 'Saving…' : 'Record finding'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="border border-ink-200 bg-ink-100 p-3 text-xs text-ink-700 flex gap-2">
            <ShieldAlert size={15} className="mt-0.5 shrink-0" />
            <span>
              This app cannot tell a genuine position from one a mock-location app supplied — no
              browser can. The flags say a reading looked wrong; only checking whether this person
              was actually in the office says whether it was.
            </span>
          </div>

          {openStamp && openStamp.signals.length > 0 && (
            <div>
              <p className="label">What was flagged</p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-ink-700">
                {openStamp.signals.map((code) => (
                  <li key={code}>{SIGNAL_COPY[code] ?? code}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="label" htmlFor="stamp-verdict">Finding</label>
            <Select
              ariaLabel="Finding"
              value={verdict}
              onChange={(value) => setVerdict(value as AttendanceStampReview['verdict'])}
              options={[
                { label: 'Genuine — they were where the stamp says', value: 'genuine' },
                { label: 'Inconclusive — could not establish either way', value: 'inconclusive' },
                { label: 'Falsified — verified they were not there', value: 'falsified' },
              ]}
            />
            {verdict === 'falsified' && (
              <p className="mt-2 text-xs text-brand-700">
                This is the only finding that counts against the employee. It is permanent, and the
                stamp underneath it cannot be edited by anybody, you included.
              </p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="stamp-note">How this was checked</label>
            <input
              id="stamp-note"
              className="input"
              placeholder="e.g. Confirmed with the site supervisor that they were not on site"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
