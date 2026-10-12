import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMyUpdates, shortDate } from '../../src/data/myUpdatesRules.ts';

const NOW = new Date('2026-10-12T15:00:00.000Z');
const leave = (o: Record<string, unknown> = {}) => ({
  id: 'lr-1', employeeId: 'emp-1', type: 'Casual', startDate: '2026-10-28', endDate: '2026-10-29',
  days: 2, status: 'Approved', decidedAt: '2026-10-12T10:00:00.000Z', decidedByName: 'Aarav Sharma', ...o,
});
const none = { expenses: [], regularizations: [] };

test('the applicant is told their leave was approved, by whom', () => {
  const [u] = buildMyUpdates('emp-1', { leave: [leave()], ...none }, NOW);
  assert.equal(u.title, 'Leave approved');
  assert.equal(u.detail, 'Casual · 28 Oct – 29 Oct · 2 days');
  assert.equal(u.decidedByName, 'Aarav Sharma');
  assert.equal(u.path, '/leave');
});

test('a rejection is an update too', () => {
  const [u] = buildMyUpdates('emp-1', { leave: [leave({ status: 'Rejected' })], ...none }, NOW);
  assert.equal(u.outcome, 'Rejected');
  assert.equal(u.title, 'Leave rejected');
});

test('nobody else is told about my leave', () => {
  assert.equal(buildMyUpdates('emp-2', { leave: [leave()], ...none }, NOW).length, 0);
  assert.equal(buildMyUpdates(undefined, { leave: [leave()], ...none }, NOW).length, 0);
});

test('pending, undated (decided before stamping existed) and old decisions are not news', () => {
  const r = buildMyUpdates('emp-1', {
    leave: [
      leave({ id: 'a', status: 'Pending', decidedAt: undefined }),
      leave({ id: 'b', decidedAt: undefined }),
      leave({ id: 'c', decidedAt: '2026-08-01T10:00:00.000Z' }),
    ],
    ...none,
  }, NOW);
  assert.equal(r.length, 0);
});

test('a re-decided request is a new update, not the one already read', () => {
  const first = buildMyUpdates('emp-1', { leave: [leave()], ...none }, NOW)[0].id;
  const again = buildMyUpdates('emp-1', { leave: [leave({ status: 'Rejected', decidedAt: '2026-10-12T12:00:00.000Z' })], ...none }, NOW)[0].id;
  assert.notEqual(first, again);
});

test('expense claims and raised regularizations; app-flagged entries nobody raised are not', () => {
  const r = buildMyUpdates('emp-1', {
    leave: [],
    expenses: [{ id: 'ex-1', employeeId: 'emp-1', title: 'Cab', amount: 1640, status: 'Approved', decidedAt: '2026-10-11T10:00:00.000Z' }],
    regularizations: [
      { id: 'reg-1', employeeId: 'emp-1', date: '2026-10-01', status: 'Approved', requestedStatus: 'Work From Home', decidedAt: '2026-10-12T09:00:00.000Z' },
      { id: 'reg-2', employeeId: 'emp-1', date: '2026-10-02', status: 'Approved', requestedStatus: null, decidedAt: '2026-10-12T09:00:00.000Z' },
    ],
  }, NOW);
  assert.deepEqual(r.map((u) => u.title), ['Regularization approved', 'Expense claim approved']);
  assert.equal(r[1].detail, 'Cab · ₹1,640');
  assert.equal(r[0].detail, '01 Oct as Work From Home');
});

test('newest first', () => {
  const r = buildMyUpdates('emp-1', {
    leave: [leave({ id: 'old', decidedAt: '2026-10-01T10:00:00.000Z' }), leave({ id: 'new', decidedAt: '2026-10-12T10:00:00.000Z' })],
    ...none,
  }, NOW);
  assert.deepEqual(r.map((u) => u.id.split(':')[1]), ['new', 'old']);
});

test('short dates', () => {
  assert.equal(shortDate('2026-11-04'), '04 Nov');
});
