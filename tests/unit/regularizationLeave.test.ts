// Unit tests for "a day covered by leave is not a day to regularize" —
// src/data/regularizationLeave.ts.
//
// Run: npm run test:unit

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { leaveCovers, withoutRequestsCoveredByLeave } from '../../src/data/regularizationLeave.ts';

const leave = (status: string, startDate = '2026-10-14', endDate = '2026-10-15', employeeId = 'emp-005') =>
  ({ employeeId, startDate, endDate, status }) as never;

test('approved and pending leave cover their days; rejected and cancelled do not', () => {
  assert.equal(leaveCovers([leave('Approved')], 'emp-005', '2026-10-14'), true);
  assert.equal(leaveCovers([leave('Pending')], 'emp-005', '2026-10-15'), true);
  assert.equal(leaveCovers([leave('Rejected')], 'emp-005', '2026-10-14'), false);
  assert.equal(leaveCovers([leave('Cancelled')], 'emp-005', '2026-10-14'), false);
  // Only that person, only those days.
  assert.equal(leaveCovers([leave('Approved')], 'emp-006', '2026-10-14'), false);
  assert.equal(leaveCovers([leave('Approved')], 'emp-005', '2026-10-16'), false);
});

test('a pending request raised before the leave is set aside; decided ones stay as history', () => {
  const requests = [
    { id: 'a', employeeId: 'emp-005', date: '2026-10-14', status: 'Pending' },
    { id: 'b', employeeId: 'emp-005', date: '2026-10-15', status: 'Approved' },
    { id: 'c', employeeId: 'emp-005', date: '2026-10-16', status: 'Pending' },
  ] as never[];
  const visible = withoutRequestsCoveredByLeave(requests, [leave('Approved')]) as { id: string }[];
  assert.deepEqual(visible.map((r) => r.id), ['b', 'c']);
  // The leave is rejected: the request is back, unchanged.
  const back = withoutRequestsCoveredByLeave(requests, [leave('Rejected')]) as { id: string }[];
  assert.deepEqual(back.map((r) => r.id), ['a', 'b', 'c']);
});
