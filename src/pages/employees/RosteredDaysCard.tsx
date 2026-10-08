import { useMemo, useState } from 'react';
import { CalendarOff, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useWeekOffRevision } from '@/lib/useWeekOffRevision';
import { addRosteredDaysOff, getRosteredDaysOff, removeRosteredDayOff } from '@/data/rosterDays';
import { todayIso } from '@/lib/today';
import { formatDate } from '@/lib/utils';

/**
 * The specific days HR has rostered this person off — see data/rosterDays.ts.
 * Shown to anyone who can open the profile; changed by HR and Admin only.
 * Upcoming days are listed; past ones stay stored (payroll still needs them)
 * but are only counted, so the card does not grow forever.
 */
export function RosteredDaysCard({ employeeId }: { employeeId: string }) {
  const { isHR, isAdmin } = useAuth();
  const canEdit = isHR || isAdmin;
  const revision = useWeekOffRevision();
  const [date, setDate] = useState('');
  const dates = useMemo(() => getRosteredDaysOff()[employeeId] ?? [], [employeeId, revision]);
  const today = todayIso();
  const upcoming = dates.filter((d) => d >= today);
  const pastCount = dates.length - upcoming.length;

  if (!canEdit && dates.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Rostered days off"
        subtitle="Specific dates off beyond the weekly week-off. Never marked absent, never regularized, never charged as leave."
      />
      {upcoming.length === 0 ? (
        <p className="text-sm text-ink-500">No upcoming rostered days off.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Upcoming rostered days off">
          {upcoming.map((d) => (
            <li key={d} className="inline-flex items-center gap-1.5 border border-ink-300 px-2 py-1 text-sm">
              <CalendarOff size={13} className="text-ink-500" />
              {formatDate(d)}
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Remove rostered day off ${d}`}
                  className="text-ink-400 hover:text-rose-600"
                  onClick={() => void removeRosteredDayOff(employeeId, d)}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {pastCount > 0 && <p className="mt-2 text-xs text-ink-500">{pastCount} earlier rostered day{pastCount === 1 ? '' : 's'} off on record.</p>}
      {canEdit && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor={`roster-day-${employeeId}`}>Add a day off</label>
            <input
              id={`roster-day-${employeeId}`}
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            disabled={!date}
            onClick={() => {
              void addRosteredDaysOff({ [employeeId]: [date] });
              setDate('');
            }}
          >
            Add
          </Button>
        </div>
      )}
    </Card>
  );
}
