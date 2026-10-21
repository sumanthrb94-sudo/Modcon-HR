import { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardHeader } from '@/components/ui';
import { ATTENDANCE_CHANGED_EVENT, getAttendanceRecords } from '@/data/attendance';
import { COMP_OFF_CHANGED_EVENT, decideCompOff, getCompOffCredits } from '@/data/compOff';
import { compOffCandidates } from '@/data/compOffRules';
import { getEmployee, isWeekOffFor } from '@/data/employees';
import { getHolidayDirectory } from '@/data/holidays';
import { useCollectionRevision } from '@/lib/useCollectionRevision';
import { todayIso } from '@/lib/today';
import { formatDate } from '@/lib/utils';

/**
 * Days worked on a day off, waiting for somebody to say whether they earn a
 * comp-off. Shown to whoever decides leave for those people.
 */
export function CompOffDecisions({ decidable, decidedBy }: { decidable: ReadonlySet<string>; decidedBy: string }) {
  const attendanceRevision = useCollectionRevision(ATTENDANCE_CHANGED_EVENT);
  const creditRevision = useCollectionRevision(COMP_OFF_CHANGED_EVENT);
  const [, setTick] = useState(0);
  useEffect(() => setTick((n) => n + 1), [attendanceRevision, creditRevision]);

  const candidates = useMemo(() => {
    const holidays = new Set(getHolidayDirectory().map((h) => h.date));
    const decided = new Set(getCompOffCredits().map((c) => c.id));
    return compOffCandidates(
      getAttendanceRecords().filter((r) => decidable.has(r.employeeId)),
      (employeeId, date) => isWeekOffFor(getEmployee(employeeId) ?? null, date),
      (date) => holidays.has(date),
      decided,
    ).slice(0, 50);
  }, [decidable, attendanceRevision, creditRevision]);

  if (candidates.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title="Comp-off to decide"
        subtitle="Days worked on a week-off or holiday. Approved, each becomes a Comp Off day for 90 days."
      />
      <ul className="divide-y divide-ink-100 border border-ink-200 text-sm">
        {candidates.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              {getEmployee(c.employeeId)?.fullName ?? c.employeeId} worked {formatDate(c.date)}
              <span className="text-ink-500"> · {c.why === 'holiday' ? 'a holiday' : 'their week-off'} · {c.days === 1 ? '1 day' : 'half a day'}</span>
            </span>
            <Button size="sm" variant="primary" onClick={() => decideCompOff(c, 'Approved', decidedBy, todayIso())}>Approve</Button>
            <Button size="sm" variant="ghost" onClick={() => decideCompOff(c, 'Rejected', decidedBy, todayIso())}>Not a comp-off</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
