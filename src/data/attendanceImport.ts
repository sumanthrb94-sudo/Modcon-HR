/**
 * Reading a punch machine's export — or anybody's attendance spreadsheet.
 *
 * Mark Attendance was one person, today only, and nothing could be imported,
 * while most 30–100 person companies already own a biometric device that
 * exports a CSV every day. So attendance was re-keyed by hand, or payroll's
 * loss of pay was computed from an empty sheet.
 *
 * Columns are found by header, with the names devices and registers actually
 * use, in any order; dates and times in the formats they actually print.
 * Every row that cannot be used is reported with its line and why, never
 * dropped — a day silently skipped looks exactly like a day nobody worked.
 *
 * Pure, imports types only, unit-tested (tests/unit/attendanceImport.test.ts).
 */
import type { AttendanceStatus } from '@/types';

export const ATTENDANCE_IMPORT_HEADER = 'employee_code,date,check_in,check_out,status';

export interface ImportSubject {
  readonly id: string;
  readonly employeeCode: string;
  readonly fullName: string;
}

export interface ImportedDay {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly date: string;
  readonly status: AttendanceStatus;
  readonly checkIn: string | null;
  readonly checkOut: string | null;
  readonly workedHours: number;
  readonly line: number;
}

export interface ImportProblem {
  readonly line: number;
  readonly text: string;
  readonly reason: string;
}

const ALIASES: Record<'code' | 'date' | 'in' | 'out' | 'status', string[]> = {
  code: ['employeecode', 'empcode', 'code', 'employeeid', 'empid', 'staffid', 'id', 'enrollno', 'userid'],
  date: ['date', 'attendancedate', 'day', 'punchdate'],
  in: ['checkin', 'in', 'intime', 'punchin', 'firstin', 'timein', 'entry'],
  out: ['checkout', 'out', 'outtime', 'punchout', 'lastout', 'timeout', 'exit'],
  status: ['status', 'attendance', 'remarks', 'mark'],
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function squash(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cell.trim()); cell = ''; } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

function iso(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, 12-Mar-2026. Day first: this is India. */
export function readDate(raw: string): string | null {
  const v = raw.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = v.match(/^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/](\d{4})$/);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    return month > 0 ? iso(Number(m[3]), month, Number(m[1])) : null;
  }
  return null;
}

/** 9:05, 09:05, 09:05:33, 9:05 AM, 6:10 pm → HH:mm. */
export function readTime(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  const m = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === 'pm' && h !== 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function readStatus(raw: string): AttendanceStatus | null | undefined {
  const v = squash(raw);
  if (v === '') return undefined;
  if (['p', 'present', 'pr'].includes(v)) return 'Present';
  if (['a', 'absent', 'ab'].includes(v)) return 'Absent';
  if (['hd', 'halfday', 'half', 'h/d'].includes(v)) return 'Half Day';
  if (['wfh', 'workfromhome', 'remote'].includes(v)) return 'Work From Home';
  if (['l', 'leave', 'onleave', 'lv'].includes(v)) return 'On Leave';
  if (['h', 'holiday', 'hol', 'ph'].includes(v)) return 'Holiday';
  if (['wo', 'weeklyoff', 'weekoff', 'off', 'weekend'].includes(v)) return 'Weekend';
  return null;
}

function hoursBetween(checkIn: string, checkOut: string): number {
  const [ih, im] = checkIn.split(':').map(Number);
  const [oh, om] = checkOut.split(':').map(Number);
  let minutes = oh * 60 + om - (ih * 60 + im);
  // Out before in is a night shift that ended the next morning.
  if (minutes < 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}

export function parseAttendanceCsv(
  text: string,
  employees: readonly ImportSubject[],
  today: string,
): { days: ImportedDay[]; problems: ImportProblem[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const days: ImportedDay[] = [];
  const problems: ImportProblem[] = [];
  const headerIndex = lines.findIndex((l) => l.trim() !== '');
  if (headerIndex === -1) return { days, problems: [{ line: 1, text: '', reason: 'The file is empty.' }] };

  const header = splitCsvLine(lines[headerIndex]).map(squash);
  const col = (key: keyof typeof ALIASES) => header.findIndex((h) => ALIASES[key].includes(h));
  const at = { code: col('code'), date: col('date'), in: col('in'), out: col('out'), status: col('status') };
  if (at.code === -1 || at.date === -1 || (at.in === -1 && at.status === -1)) {
    return {
      days,
      problems: [{
        line: headerIndex + 1,
        text: lines[headerIndex].trim(),
        reason: `The first row must name the columns — at least an employee code, a date, and a check-in time or a status. Expected something like: ${ATTENDANCE_IMPORT_HEADER}`,
      }],
    };
  }

  const byCode = new Map(employees.map((e) => [squash(e.employeeCode), e]));
  const seen = new Map<string, number>();

  lines.forEach((raw, index) => {
    if (index <= headerIndex) return;
    const trimmed = raw.trim();
    if (trimmed === '') return;
    const line = index + 1;
    const cells = splitCsvLine(raw);
    const refuse = (reason: string) => problems.push({ line, text: trimmed, reason });
    const cell = (i: number) => (i >= 0 ? cells[i] ?? '' : '');

    const employee = byCode.get(squash(cell(at.code)));
    if (!employee) return refuse(cell(at.code) ? `No employee with code ${cell(at.code)}.` : 'No employee code.');
    const date = readDate(cell(at.date));
    if (!date) return refuse(`"${cell(at.date)}" is not a date this can read (try 2026-10-21 or 21-10-2026).`);
    if (date > today) return refuse(`${date} has not happened yet.`);

    const rawIn = cell(at.in);
    const rawOut = cell(at.out);
    const checkIn = rawIn ? readTime(rawIn) : null;
    const checkOut = rawOut ? readTime(rawOut) : null;
    if (rawIn && !checkIn) return refuse(`Check-in "${rawIn}" is not a time.`);
    if (rawOut && !checkOut) return refuse(`Check-out "${rawOut}" is not a time.`);

    const stated = readStatus(cell(at.status));
    if (stated === null) return refuse(`Status "${cell(at.status)}" is not one this recognises (P, A, HD, WFH, L, H, WO).`);
    const status: AttendanceStatus | undefined = stated ?? (checkIn ? 'Present' : undefined);
    if (!status) return refuse('Neither a check-in time nor a status — nothing to record.');

    const key = `${employee.id}|${date}`;
    const earlier = seen.get(key);
    if (earlier !== undefined) return refuse(`${employee.fullName} on ${date} is also on line ${earlier}.`);
    seen.set(key, line);

    const worked = ['Absent', 'On Leave', 'Holiday', 'Weekend'].includes(status);
    days.push({
      employeeId: employee.id,
      employeeName: employee.fullName,
      date,
      status,
      checkIn: worked ? null : checkIn,
      checkOut: worked ? null : checkOut,
      workedHours: !worked && checkIn && checkOut ? hoursBetween(checkIn, checkOut) : 0,
      line,
    });
  });

  return { days, problems };
}
