// Unit tests for who a payroll run pays — src/data/payRun.ts.
//
// Run: npm run test:unit

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lastDayOf, payeesFor } from '../../src/data/payRun.ts';

const people = [
  { id: 'joined-april', status: 'Active', dateOfJoining: '2026-04-01' },
  { id: 'joined-22-sep', status: 'Active', dateOfJoining: '2026-09-22' },
  { id: 'resigned', status: 'Resigned', dateOfJoining: '2025-01-01' },
  { id: 'no-date', status: 'Active', dateOfJoining: '' },
];

test('the last day of a month, including February and a leap year', () => {
  assert.equal(lastDayOf('2026-08'), '2026-08-31');
  assert.equal(lastDayOf('2026-02'), '2026-02-28');
  assert.equal(lastDayOf('2028-02'), '2028-02-29');
});

test('a month pays whoever had joined by its last day, and nobody resigned', () => {
  assert.deepEqual(payeesFor(people, '2026-09').map((p) => p.id), ['joined-april', 'joined-22-sep', 'no-date']);
});

test('somebody who joined on the 22nd is not on roll for the month before', () => {
  // The QA Zero Org case: records created on 22 Sep 2026 carry that date, so
  // August has nobody on roll, and the run is refused rather than paid at ₹0.
  const august = payeesFor(people.filter((p) => p.id === 'joined-22-sep'), '2026-08');
  assert.equal(august.length, 0);
});

test('a joining date on the last day of the month counts', () => {
  assert.equal(payeesFor([{ status: 'Active', dateOfJoining: '2026-08-31' }], '2026-08').length, 1);
});
