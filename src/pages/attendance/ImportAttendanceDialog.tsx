import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { ATTENDANCE_IMPORT_HEADER, parseAttendanceCsv, type ImportedDay, type ImportProblem } from '@/data/attendanceImport';
import { getAttendanceRecords, saveAttendanceRecords } from '@/data/attendance';
import { getEmployeeDirectory } from '@/data/employees';
import { isLateFor, shiftCaptionFor } from '@/data/shifts';
import { todayIso } from '@/lib/today';
import { formatDate } from '@/lib/utils';
import type { AttendanceRecord } from '@/types';

/**
 * Attendance → Import: a punch machine's CSV, or a register. Nothing is
 * written until the match list has been seen; see data/attendanceImport.ts.
 * A day already recorded for the same person is replaced — the import is the
 * newer statement of that day.
 */
export function ImportAttendanceDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (count: number) => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [result, setResult] = useState<{ days: ImportedDay[]; problems: ImportProblem[] } | null>(null);

  function reset() {
    setResult(null);
    if (input.current) input.current.value = '';
  }

  async function read(file: File | undefined) {
    if (!file) return reset();
    setResult(parseAttendanceCsv(await file.text(), getEmployeeDirectory(), todayIso()));
  }

  function apply() {
    if (!result || result.days.length === 0) return;
    const incoming = new Map(result.days.map((d) => [`${d.employeeId}|${d.date}`, d]));
    const kept = getAttendanceRecords().filter((r) => !incoming.has(`${r.employeeId}|${r.date}`));
    const records: AttendanceRecord[] = result.days.map((d) => ({
      id: `att-import-${d.employeeId}-${d.date}`,
      employeeId: d.employeeId,
      date: d.date,
      status: d.status,
      checkIn: d.checkIn,
      checkOut: d.checkOut,
      workedHours: d.workedHours,
      shift: shiftCaptionFor(d.employeeId),
      isLate: d.checkIn ? isLateFor(d.employeeId, d.checkIn) : false,
    }));
    saveAttendanceRecords([...kept, ...records]);
    onImported(records.length);
    reset();
    onClose();
  }

  function template() {
    const code = getEmployeeDirectory()[0]?.employeeCode ?? 'MC-001';
    const body = `${ATTENDANCE_IMPORT_HEADER}\n${code},${todayIso()},09:00,18:00,\n${code},${todayIso()},,,A\n`;
    const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendance-import.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Import attendance"
      subtitle="From a biometric device's export or a register"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button variant="primary" icon={<Upload size={14} />} onClick={apply} disabled={!result || result.days.length === 0}>
            Save {result?.days.length ?? 0} day{result?.days.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-ink-600">
          One row per person per day. Columns are found by their header — <span className="font-mono">Emp Code</span>,{' '}
          <span className="font-mono">Punch Date</span>, <span className="font-mono">First In</span> and the like all work. A
          time with no status is a day Present; a status alone (P, A, HD, WFH, L, H, WO) needs no times. A day already
          recorded for that person is replaced.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="attendance-import-file">Attendance CSV</label>
            <input id="attendance-import-file" ref={input} type="file" accept=".csv,text/csv" className="input" onChange={(e) => void read(e.target.files?.[0])} />
            <p className="mt-1 text-xs text-ink-400">e.g. <span className="font-mono">{ATTENDANCE_IMPORT_HEADER}</span></p>
          </div>
          <Button variant="secondary" icon={<Download size={14} />} onClick={template}>Template</Button>
        </div>
        {result && (
          <div className="space-y-3" data-testid="attendance-import-preview">
            <p className="font-semibold text-ink-900">{result.days.length} ready to save</p>
            {result.days.length > 0 && (
              <ul className="max-h-56 overflow-auto divide-y divide-ink-100 border border-ink-200">
                {result.days.slice(0, 200).map((d) => (
                  <li key={d.line} className="flex justify-between gap-3 px-3 py-1.5">
                    <span>{d.employeeName} · {formatDate(d.date)}</span>
                    <span className="text-ink-600">{d.status}{d.checkIn ? ` · ${d.checkIn}–${d.checkOut ?? '…'}` : ''}</span>
                  </li>
                ))}
                {result.days.length > 200 && <li className="px-3 py-1.5 text-ink-500">…and {result.days.length - 200} more</li>}
              </ul>
            )}
            {result.problems.length > 0 && (
              <ul className="max-h-40 overflow-auto space-y-1 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {result.problems.map((p) => <li key={p.line}><strong>Line {p.line}:</strong> {p.reason}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
