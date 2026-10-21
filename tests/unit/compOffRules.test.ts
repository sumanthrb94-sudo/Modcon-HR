import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compOffCandidates, compOffDaysGranted, compOffId, type CompOffCredit } from '../../src/data/compOffRules.ts';

const sundays = (_e: string, d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() === 0;
const diwali = (d: string) => d === '2026-11-08';

test('a day worked on a week-off or a holiday is a candidate; an ordinary day is not', () => {
  const out = compOffCandidates(
    [
      { employeeId: 'e1', date: '2026-10-18', status: 'Present' }, // Sunday
      { employeeId: 'e1', date: '2026-10-19', status: 'Present' }, // Monday
      { employeeId: 'e2', date: '2026-11-08', status: 'Half Day' }, // holiday (also Sunday)
      { employeeId: 'e3', date: '2026-10-18', status: 'Absent' },
    ],
    sundays,
    diwali,
    new Set(),
  );
  assert.deepEqual(out.map((c) => [c.employeeId, c.date, c.days, c.why]), [
    ['e2', '2026-11-08', 0.5, 'holiday'],
    ['e1', '2026-10-18', 1, 'week-off'],
  ]);
});

test('a decided day is not offered again', () => {
  const out = compOffCandidates([{ employeeId: 'e1', date: '2026-10-18', status: 'Present' }], sundays, diwali, new Set([compOffId('e1', '2026-10-18')]));
  assert.equal(out.length, 0);
});

test('only approved, unexpired credits count', () => {
  const credits: CompOffCredit[] = [
    { id: 'a', employeeId: 'e1', date: '2026-10-18', days: 1, status: 'Approved', expiresOn: '2027-01-16' },
    { id: 'b', employeeId: 'e1', date: '2026-06-07', days: 1, status: 'Approved', expiresOn: '2026-09-05' },
    { id: 'c', employeeId: 'e1', date: '2026-10-11', days: 1, status: 'Rejected', expiresOn: '2027-01-09' },
  ];
  assert.equal(compOffDaysGranted(credits, 'e1', '2026-10-21'), 1);
  assert.equal(compOffDaysGranted(credits, 'e1', '2027-02-01'), 0);
});
