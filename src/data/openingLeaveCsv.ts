/**
 * Reading "leave already taken this year" from a spreadsheet — pure, so
 * `npm run test:unit` reaches it. The store is data/openingLeave.ts.
 *
 * A company that starts using this app in October has six months of leave
 * behind it that happened in a register or a spreadsheet. Without this, every
 * balance in the app opens as though nobody had taken a day since April — in
 * the office simulation, everyone showed 7 of 7 Casual — and the first person
 * to apply for leave they no longer have is approved for it.
 *
 * The figure asked for is **days taken**, not days remaining, on purpose. A
 * remaining figure would have to be reconciled with how this app accrues the
 * rest of the year; a taken figure is simply added to what this app has seen
 * approved, and accrual goes on exactly as configured. It is also the number
 * a leave register actually holds.
 *
 * Every unusable row is reported with its line, never dropped — the same rule
 * as every other upload here.
 */

export const OPENING_LEAVE_CSV_HEADER = 'employee_code,leave_type,days_taken';

export interface OpeningLeaveSubject {
  id: string;
  employeeCode: string;
  fullName: string;
}

export interface OpeningLeaveMatch {
  employee: OpeningLeaveSubject;
  /** The stored key, e.g. `'Casual'`. */
  typeKey: string;
  days: number;
  line: number;
}

export interface OpeningLeaveMiss {
  line: number;
  text: string;
  reason: string;
}

function squash(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * `typeKeys` is the organisation's leave types as `normalizeType` returns
 * them; a row naming any other type is refused, because a balance can only be
 * opened against a type the organisation grants.
 */
export function parseOpeningLeaveCsv(
  text: string,
  employees: readonly OpeningLeaveSubject[],
  typeKeys: readonly string[],
  normalizeType: (raw: string) => string,
): { matched: OpeningLeaveMatch[]; unmatched: OpeningLeaveMiss[] } {
  const byCode = new Map<string, OpeningLeaveSubject>();
  for (const employee of employees) {
    const code = squash(employee.employeeCode ?? '');
    if (code) byCode.set(code, employee);
  }
  const types = new Map(typeKeys.map((key) => [key.toLowerCase(), key]));

  const matched: OpeningLeaveMatch[] = [];
  const unmatched: OpeningLeaveMiss[] = [];
  const claimed = new Map<string, number>();

  text.replace(/^﻿/, '').split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === '') return;
    const cells = trimmed.split(',').map((cell) => cell.trim());
    if (squash(cells[0] ?? '') === 'employeecode') return;
    const refuse = (reason: string) => unmatched.push({ line, text: trimmed, reason });

    if (cells.length < 3) return refuse('Needs three columns: employee code, leave type, days taken.');
    const employee = byCode.get(squash(cells[0]));
    if (!employee) return refuse(cells[0] ? `No employee with code ${cells[0]}.` : 'No employee code.');
    const typeKey = types.get(normalizeType(cells[1]).toLowerCase());
    if (!typeKey) return refuse(`"${cells[1]}" is not a leave type your organisation grants.`);
    const days = Number(cells[2]);
    if (cells[2] === '' || !Number.isFinite(days) || days < 0) return refuse(`Days taken "${cells[2]}" must be a number, 0 or more.`);
    if (Math.round(days * 2) !== days * 2) return refuse(`Days taken "${cells[2]}" must be in whole or half days.`);
    const key = `${employee.id}::${typeKey}`;
    const earlier = claimed.get(key);
    if (earlier !== undefined) return refuse(`${employee.fullName}'s ${typeKey} is also on line ${earlier}.`);
    claimed.set(key, line);
    matched.push({ employee, typeKey, days, line });
  });

  return { matched, unmatched };
}
