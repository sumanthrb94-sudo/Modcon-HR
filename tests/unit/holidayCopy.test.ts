import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyHolidaysForward } from '../../src/data/holidayCopy.ts';
import type { Holiday } from '../../src/types/index.ts';

const h = (name: string, date: string): Holiday => ({ id: name, name, date, type: 'National' });

test('nothing to copy is null', () => {
  assert.equal(copyHolidaysForward([]), null);
});

test('the latest year is copied to the next, fixed dates kept and the rest named for checking', () => {
  const out = copyHolidaysForward([h('Republic Day', '2026-01-26'), h('Diwali', '2026-11-08'), h('Old', '2025-03-01')])!;
  assert.equal(out.fromYear, 2026);
  assert.equal(out.toYear, 2027);
  assert.deepEqual(out.added.map((x) => x.date), ['2027-01-26', '2027-11-08']);
  assert.deepEqual(out.toCheck, ['Diwali']);
});

test('a holiday already declared for next year is not added twice', () => {
  const out = copyHolidaysForward([h('Diwali', '2026-11-08'), h('Republic Day', '2026-01-26'), h('Diwali', '2027-10-29')])!;
  // 2027 is now the latest year, so it is 2027 → 2028.
  assert.equal(out.fromYear, 2027);
  assert.deepEqual(out.added.map((x) => x.name), ['Diwali']);
});

test('29 February becomes the 28th and is flagged', () => {
  const out = copyHolidaysForward([h('Leap', '2028-02-29')])!;
  assert.equal(out.added[0].date, '2029-02-28');
  assert.deepEqual(out.toCheck, ['Leap']);
});
