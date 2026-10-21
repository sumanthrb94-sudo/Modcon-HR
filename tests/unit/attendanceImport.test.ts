import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAttendanceCsv, readDate, readTime } from '../../src/data/attendanceImport.ts';

const people = [
  { id: 'e1', employeeCode: 'MC-001', fullName: 'Asha Rao' },
  { id: 'e2', employeeCode: 'MC-002', fullName: 'Ravi Kumar' },
];
const TODAY = '2026-10-21';

test('dates in the formats registers print, day first', () => {
  assert.equal(readDate('2026-10-05'), '2026-10-05');
  assert.equal(readDate('05-10-2026'), '2026-10-05');
  assert.equal(readDate('5/10/2026'), '2026-10-05');
  assert.equal(readDate('05.10.2026'), '2026-10-05');
  assert.equal(readDate('5-Oct-2026'), '2026-10-05');
  assert.equal(readDate('31-02-2026'), null);
});

test('times with seconds, without a leading zero, and in 12-hour form', () => {
  assert.equal(readTime('9:05'), '09:05');
  assert.equal(readTime('09:05:33'), '09:05');
  assert.equal(readTime('6:10 pm'), '18:10');
  assert.equal(readTime('12:00 AM'), '00:00');
  assert.equal(readTime('25:00'), null);
});

test('a device export with its own column names reads, and hours are measured', () => {
  const csv = 'Emp Code,Punch Date,First In,Last Out\nMC-001,20-10-2026,09:02,18:15\nMC-002,20-10-2026,21:00,06:00\n';
  const { days, problems } = parseAttendanceCsv(csv, people, TODAY);
  assert.deepEqual(problems, []);
  assert.equal(days.length, 2);
  assert.equal(days[0].status, 'Present');
  assert.equal(days[0].workedHours, 9.22);
  // Out before in: a night shift.
  assert.equal(days[1].workedHours, 9);
});

test('statuses by their usual letters, and a non-working day carries no times', () => {
  const csv = 'employee_code,date,check_in,check_out,status\nMC-001,2026-10-19,,,A\nMC-002,2026-10-19,,,WO\nMC-001,2026-10-18,09:00,13:00,HD\n';
  const { days, problems } = parseAttendanceCsv(csv, people, TODAY);
  assert.deepEqual(problems, []);
  assert.deepEqual(days.map((d) => d.status), ['Absent', 'Weekend', 'Half Day']);
  assert.equal(days[0].checkIn, null);
});

test('every unusable row is reported with its line, never dropped', () => {
  const csv = [
    'employee_code,date,check_in,status',
    'MC-999,2026-10-19,09:00,',
    'MC-001,yesterday,09:00,',
    'MC-001,2026-10-30,09:00,',
    'MC-001,2026-10-19,nine,',
    'MC-001,2026-10-19,,X',
    'MC-002,2026-10-19,,',
    'MC-001,2026-10-19,09:00,',
    'MC-001,2026-10-19,09:10,',
  ].join('\n');
  const { days, problems } = parseAttendanceCsv(csv, people, TODAY);
  assert.equal(days.length, 1);
  assert.deepEqual(problems.map((p) => p.line), [2, 3, 4, 5, 6, 7, 9]);
  assert.match(problems[2].reason, /has not happened yet/);
  assert.match(problems[6].reason, /also on line 8/);
});

test('a file without the columns says what it needs', () => {
  const { days, problems } = parseAttendanceCsv('name,hours\nAsha,8\n', people, TODAY);
  assert.equal(days.length, 0);
  assert.match(problems[0].reason, /employee code, a date/);
});
