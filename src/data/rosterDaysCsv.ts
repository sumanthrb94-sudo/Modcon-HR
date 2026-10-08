import { parseImportDate } from './employeeImport.ts';

/**
 * Reading a roster of days off from a spreadsheet — pure, so
 * `npm run test:unit` reaches it. The store is data/rosterDays.ts.
 *
 * One row per person per day, or per run of days (`date_to`): the roster sheet
 * HR already keeps for a rotating team. Dates are read day-first like every
 * other upload here. Every unusable row is reported with its line, never
 * dropped — a day off silently ignored is a day somebody is marked absent for.
 */

export const ROSTER_DAYS_CSV_HEADER = 'employee_code,date,date_to';

export interface RosterSubject {
  id: string;
  employeeCode: string;
  fullName: string;
}

export interface RosterDaysMatch {
  employee: RosterSubject;
  dates: string[];
  line: number;
}

export interface RosterDaysMiss {
  line: number;
  text: string;
  reason: string;
}

function squash(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A run longer than this is almost certainly a typo in the year. */
const MAX_RUN_DAYS = 31;

export function parseRosterDaysCsv(
  text: string,
  employees: readonly RosterSubject[],
): { matched: RosterDaysMatch[]; unmatched: RosterDaysMiss[] } {
  const byCode = new Map<string, RosterSubject>();
  for (const employee of employees) {
    const code = squash(employee.employeeCode ?? '');
    if (code) byCode.set(code, employee);
  }

  const matched: RosterDaysMatch[] = [];
  const unmatched: RosterDaysMiss[] = [];

  text.replace(/^﻿/, '').split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === '') return;
    const cells = trimmed.split(',').map((cell) => cell.trim());
    if (squash(cells[0] ?? '') === 'employeecode') return;
    const refuse = (reason: string) => unmatched.push({ line, text: trimmed, reason });

    const employee = byCode.get(squash(cells[0] ?? ''));
    if (!employee) return refuse(cells[0] ? `No employee with code ${cells[0]}.` : 'No employee code.');
    const from = parseImportDate(cells[1] ?? '');
    if (!from) return refuse(`"${cells[1] ?? ''}" is not a date — use DD/MM/YYYY or YYYY-MM-DD.`);
    let to = from;
    if (cells[2]) {
      const parsed = parseImportDate(cells[2]);
      if (!parsed) return refuse(`"${cells[2]}" is not a date — use DD/MM/YYYY or YYYY-MM-DD.`);
      if (parsed < from) return refuse('The end date is before the start date.');
      to = parsed;
    }
    const dates: string[] = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
      dates.push(day);
      if (dates.length > MAX_RUN_DAYS) return refuse(`More than ${MAX_RUN_DAYS} days in one row — check the year.`);
    }
    matched.push({ employee, dates, line });
  });

  return { matched, unmatched };
}
