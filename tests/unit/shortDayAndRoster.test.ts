// Unit tests for a day short of its hours (src/data/shiftRules.ts) and for
// rostered days off read from a sheet (src/data/rosterDaysCsv.ts).
//
// Run: npm run test:unit

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_REQUIRED_HOURS, isShortDay, requiredHours, shiftHours } from '../../src/data/shiftRules.ts';
import { parseRosterDaysCsv } from '../../src/data/rosterDaysCsv.ts';

const shift = (start: string, end: string) => ({ id: 's', name: 'S', start, end, graceMinutes: 15 });

test('a full day is the shift, or nine hours with none', () => {
  assert.equal(shiftHours(shift('09:00', '18:00')), 9);
  assert.equal(shiftHours(shift('22:00', '06:00')), 8); // across midnight
  assert.equal(requiredHours(shift('10:00', '19:30')), 9.5);
  assert.equal(requiredHours(null), DEFAULT_REQUIRED_HOURS);
  assert.equal(DEFAULT_REQUIRED_HOURS, 9);
});

test('late is fine if the hours are worked; short of them is a half day', () => {
  // In at 10:15, out at 19:15: late, and a full nine hours.
  assert.equal(isShortDay(9, 9), false);
  // A minute of rounding does not cost half a day.
  assert.equal(isShortDay(8.99, 9), false);
  // Out at 17:30 after a 10:15 start: 7h15m.
  assert.equal(isShortDay(7.25, 9), true);
});

test('a roster sheet: single days and runs, every bad row named', () => {
  const people = [
    { id: 'emp-019', employeeCode: 'SE019', fullName: 'Imran Qureshi' },
    { id: 'emp-014', employeeCode: 'SE014', fullName: 'Santosh Pawar' },
  ];
  const csv = [
    'employee_code,date,date_to',
    'SE019,14/10/2026,',
    'se014,2026-10-20,22/10/2026',
    'SE999,14/10/2026,',
    'SE019,31/02/2026,',
    'SE019,20/10/2026,18/10/2026',
    'SE019,01/01/2026,01/01/2027',
  ].join('\n');
  const { matched, unmatched } = parseRosterDaysCsv(csv, people);
  assert.deepEqual(matched.map((m) => [m.employee.id, m.dates]), [
    ['emp-019', ['2026-10-14']],
    ['emp-014', ['2026-10-20', '2026-10-21', '2026-10-22']],
  ]);
  assert.deepEqual(unmatched.map((m) => m.line), [4, 5, 6, 7]);
  assert.match(unmatched[0].reason, /No employee/);
  assert.match(unmatched[1].reason, /not a date/);
  assert.match(unmatched[2].reason, /before the start/);
  assert.match(unmatched[3].reason, /check the year/);
});
