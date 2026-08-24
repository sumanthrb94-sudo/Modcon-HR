import { useMemo, useState } from 'react';
import { Clock, Plus, Star, Trash2, AlertCircle } from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import { useCollectionRevision } from '@/lib/useCollectionRevision';
import { getEmployeeName } from '@/data/employees';
import {
  SHIFTS_CHANGED_EVENT,
  employeeIdsOnShift,
  getEmployeeShiftOverrides,
  getShiftAssignments,
  getShiftConfig,
  ownHoursAsShift,
  saveEmployeeCustomShift,
  saveShiftConfig,
  setEmployeeShift,
  shiftCaption,
  shiftIdFor,
  type Shift,
} from '@/data/shifts';

/**
 * Settings → Shifts.
 *
 * Its own file rather than another section inside settings/index.tsx, which is
 * already past four thousand lines — the CheckinPolicySection precedent.
 *
 * The heading deliberately avoids the words "leave policies": Playwright
 * matches an accessible name by substring, and Leave Policies is a heading on
 * this same page (CLAUDE.md).
 */

const BLANK_DRAFT = { name: '', start: '09:00', end: '18:00', graceMinutes: 15 };

export default function ShiftsSection() {
  const revision = useCollectionRevision(SHIFTS_CHANGED_EVENT);
  const config = useMemo(() => getShiftConfig(), [revision]);
  const assignments = useMemo(() => getShiftAssignments(), [revision]);
  const customHours = useMemo(() => getEmployeeShiftOverrides(), [revision]);

  const [draft, setDraft] = useState(BLANK_DRAFT);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publish = (shifts: Shift[], defaultShiftId: string | null) => {
    setError(null);
    void saveShiftConfig({ shifts, defaultShiftId });
  };

  const addShift = () => {
    const name = draft.name.trim();
    if (!name) {
      setError('A shift needs a name.');
      return;
    }
    if (config.shifts.some((shift) => shift.name.toLowerCase() === name.toLowerCase())) {
      setError(`This organisation already runs a shift called ${name}.`);
      return;
    }
    const shift: Shift = {
      id: shiftIdFor(name, config.shifts),
      name,
      start: draft.start,
      end: draft.end,
      graceMinutes: Math.max(0, Number(draft.graceMinutes) || 0),
    };
    const shifts = [...config.shifts, shift];
    // The first shift an organisation declares becomes its default, or nobody
    // would be on any hours until somebody thought to press the star.
    publish(shifts, config.defaultShiftId ?? shift.id);
    setDraft(BLANK_DRAFT);
    setAdding(false);
  };

  const patchShift = (id: string, patch: Partial<Shift>) => {
    publish(
      config.shifts.map((shift) => (shift.id === id ? { ...shift, ...patch } : shift)),
      config.defaultShiftId,
    );
  };

  const withdraw = (shift: Shift) => {
    // Hours people are still rostered on cannot be retired out from under
    // them — the Locations precedent.
    const occupants = employeeIdsOnShift(shift.id);
    if (occupants.length > 0) {
      setError(
        `${occupants.length} ${occupants.length === 1 ? 'person is' : 'people are'} on ${shift.name}. ` +
        'Move them to another shift before withdrawing it.',
      );
      return;
    }
    const shifts = config.shifts.filter((candidate) => candidate.id !== shift.id);
    const nextDefault = config.defaultShiftId === shift.id ? (shifts[0]?.id ?? null) : config.defaultShiftId;
    publish(shifts, nextDefault);
  };

  const roster = useMemo(() => {
    const byShift = new Map<string, string[]>();
    Object.entries(assignments).forEach(([employeeId, shiftId]) => {
      byShift.set(shiftId, [...(byShift.get(shiftId) ?? []), employeeId]);
    });
    return byShift;
  }, [assignments]);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-ink-900">Working hours</h3>
            <p className="mt-1 text-sm text-ink-500">
              The hours this organisation runs, and how long after a start time an arrival is still
              on time. Everyone not given hours of their own is on the default.
            </p>
          </div>
          {!adding && (
            <Button onClick={() => { setAdding(true); setError(null); }}>
              <Plus size={15} /> Add shift
            </Button>
          )}
        </div>

        {error && (
          <p className="mt-4 flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        {config.shifts.length === 0 && !adding && (
          <p className="mt-4 rounded-md bg-ink-50 p-4 text-sm text-ink-600">
            This organisation has not declared any working hours, so nobody is flagged as a late
            arrival and attendance records carry no shift. Add one to start.
          </p>
        )}

        {config.shifts.length > 0 && (
          <div className="mt-4 space-y-2">
            {config.shifts.map((shift) => {
              const occupants = roster.get(shift.id) ?? [];
              const isDefault = shift.id === config.defaultShiftId;
              return (
                <div
                  key={shift.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-ink-200 p-3"
                >
                  <Clock size={16} className="text-ink-400" />
                  <input
                    className="input w-40"
                    aria-label={`Name of the ${shift.name} shift`}
                    value={shift.name}
                    onChange={(event) => patchShift(shift.id, { name: event.target.value })}
                  />
                  <input
                    type="time"
                    className="input w-32"
                    aria-label={`Start of the ${shift.name} shift`}
                    value={shift.start}
                    onChange={(event) => patchShift(shift.id, { start: event.target.value })}
                  />
                  <span className="text-ink-400">–</span>
                  <input
                    type="time"
                    className="input w-32"
                    aria-label={`End of the ${shift.name} shift`}
                    value={shift.end}
                    onChange={(event) => patchShift(shift.id, { end: event.target.value })}
                  />
                  <label className="flex items-center gap-2 text-sm text-ink-600">
                    grace
                    <input
                      type="number"
                      min={0}
                      className="input w-20"
                      aria-label={`Grace period of the ${shift.name} shift, in minutes`}
                      value={shift.graceMinutes}
                      onChange={(event) =>
                        patchShift(shift.id, { graceMinutes: Math.max(0, Number(event.target.value) || 0) })
                      }
                    />
                    min
                  </label>

                  {isDefault ? (
                    <Badge tone="green">Default</Badge>
                  ) : (
                    <button
                      type="button"
                      className="text-ink-400 hover:text-brand-600"
                      title="Make this the default shift"
                      aria-label={`Make ${shift.name} the default shift`}
                      onClick={() => publish(config.shifts, shift.id)}
                    >
                      <Star size={16} />
                    </button>
                  )}

                  <span className="text-xs text-ink-500">
                    {occupants.length === 0
                      ? isDefault ? 'everyone else' : 'nobody assigned'
                      : `${occupants.length} assigned`}
                  </span>

                  <button
                    type="button"
                    className="ml-auto text-ink-400 hover:text-red-600"
                    title="Withdraw this shift"
                    aria-label={`Withdraw the ${shift.name} shift`}
                    onClick={() => withdraw(shift)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {adding && (
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-md border border-brand-200 bg-brand-50/40 p-3">
            <label className="text-sm text-ink-600">
              Name
              <input
                className="input mt-1 w-40"
                aria-label="Name of the new shift"
                autoFocus
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label className="text-sm text-ink-600">
              Starts
              <input
                type="time"
                className="input mt-1 w-32"
                aria-label="Start of the new shift"
                value={draft.start}
                onChange={(event) => setDraft({ ...draft, start: event.target.value })}
              />
            </label>
            <label className="text-sm text-ink-600">
              Ends
              <input
                type="time"
                className="input mt-1 w-32"
                aria-label="End of the new shift"
                value={draft.end}
                onChange={(event) => setDraft({ ...draft, end: event.target.value })}
              />
            </label>
            <label className="text-sm text-ink-600">
              Grace (min)
              <input
                type="number"
                min={0}
                className="input mt-1 w-24"
                aria-label="Grace period of the new shift, in minutes"
                value={draft.graceMinutes}
                onChange={(event) => setDraft({ ...draft, graceMinutes: Number(event.target.value) })}
              />
            </label>
            <Button onClick={addShift}>Save shift</Button>
            <Button variant="ghost" onClick={() => { setAdding(false); setDraft(BLANK_DRAFT); setError(null); }}>
              Cancel
            </Button>
          </div>
        )}

        <p className="mt-4 text-xs text-ink-500">
          A shift ending before it starts runs past midnight, and an arrival in the early hours is
          measured from the evening it began. Renaming a shift moves everyone on it; withdrawing one
          requires it to be empty.
        </p>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-ink-900">People on hours of their own</h3>
        <p className="mt-1 text-sm text-ink-500">
          Assigned from an employee&apos;s profile. Everyone absent from this list is on the
          organisation&apos;s default shift.
        </p>

        {Object.keys(customHours).length > 0 && (
          <ul className="mt-4 divide-y divide-ink-100">
            {Object.entries(customHours).map(([employeeId, hours]) => (
              <li key={employeeId} className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-sm text-ink-800">{getEmployeeName(employeeId)}</span>
                <span className="text-xs text-ink-500">
                  {shiftCaption(ownHoursAsShift(employeeId, hours))}
                  {' · hours of their own, not the organisation’s'}
                </span>
                <Button
                  variant="ghost"
                  aria-label={`Put ${getEmployeeName(employeeId)} back on the organisation's shifts`}
                  onClick={() => void saveEmployeeCustomShift(employeeId, null)}
                >
                  Use default
                </Button>
              </li>
            ))}
          </ul>
        )}

        {Object.keys(assignments).length === 0 && Object.keys(customHours).length === 0 ? (
          <p className="mt-4 rounded-md bg-ink-50 p-4 text-sm text-ink-600">
            Nobody has been given hours of their own.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-100">
            {Object.entries(assignments).map(([employeeId, shiftId]) => {
              const shift = config.shifts.find((candidate) => candidate.id === shiftId) ?? null;
              return (
                <li key={employeeId} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="text-sm text-ink-800">{getEmployeeName(employeeId)}</span>
                  <span className="text-xs text-ink-500">
                    {shift ? shiftCaption(shift) : `${shiftId} — a shift this organisation no longer runs`}
                  </span>
                  <Button
                    variant="ghost"
                    aria-label={`Put ${getEmployeeName(employeeId)} back on the default shift`}
                    onClick={() => void setEmployeeShift(employeeId, null)}
                  >
                    Use default
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
