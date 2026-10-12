import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Badge, Card, CardHeader } from '@/components/ui';
import { getMyUpdates, UPDATE_WINDOW_DAYS } from '@/data/myUpdates';
import { LEAVE_REQUESTS_CHANGED_EVENT } from '@/data/leave';
import { EXPENSES_CHANGED_EVENT } from '@/data/expenses';
import { REGULARIZATIONS_CHANGED_EVENT } from '@/data/attendance';
import { getSeenUpdates, markUpdatesSeen, useSeenUpdatesRevision } from '@/lib/seenUpdates';
import { formatDateShort } from '@/lib/utils';

/**
 * "What happened to what I asked for" — decisions on this person's own leave,
 * expense claims and regularizations in the last 30 days, newest first.
 *
 * The answer to "I applied for leave, it was approved, and nothing told me".
 * Shown whether or not the bell entry was opened: the bell is for news, this
 * is where somebody checks. Unread ones are marked New, and opening one marks
 * it read in the bell too.
 */
export function MyUpdatesCard({ employeeId, uid }: { employeeId: string | undefined; uid: string | undefined }) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const bump = () => setRevision((r) => r + 1);
    const events = [LEAVE_REQUESTS_CHANGED_EVENT, EXPENSES_CHANGED_EVENT, REGULARIZATIONS_CHANGED_EVENT];
    events.forEach((e) => window.addEventListener(e, bump));
    return () => events.forEach((e) => window.removeEventListener(e, bump));
  }, []);
  const seenRevision = useSeenUpdatesRevision();
  const updates = useMemo(() => getMyUpdates(employeeId), [employeeId, revision]);
  const seen = useMemo(() => getSeenUpdates(uid), [uid, seenRevision]);

  if (!employeeId) return null;

  return (
    <Card>
      <CardHeader
        title="Recent updates"
        subtitle={`Decisions on your leave, expense claims and regularizations in the last ${UPDATE_WINDOW_DAYS} days`}
      />
      {updates.length === 0 ? (
        <p className="text-sm text-ink-500">Nothing has been decided on your requests recently.</p>
      ) : (
        <ul className="divide-y divide-ink-100" data-testid="my-updates">
          {updates.slice(0, 6).map((update) => {
            const rejected = update.outcome === 'Rejected';
            return (
              <li key={update.id}>
                <Link
                  to={update.path}
                  onClick={() => markUpdatesSeen(uid, [update.id])}
                  className="flex items-start gap-3 py-3 hover:bg-ink-50"
                >
                  {rejected ? (
                    <XCircle size={18} className="mt-0.5 shrink-0 text-rose-600" />
                  ) : (
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink-900">{update.title}</span>
                      {!seen.has(update.id) && <Badge tone="red">New</Badge>}
                    </span>
                    <span className="block text-xs text-ink-600">{update.detail}</span>
                    <span className="block text-[11px] text-ink-400">
                      {formatDateShort(update.decidedAt.slice(0, 10))}
                      {update.decidedByName ? ` · by ${update.decidedByName}` : ''}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
