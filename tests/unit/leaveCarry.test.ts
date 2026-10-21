import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carriedInto, type CarryInput } from '../../src/data/leaveCarry.ts';

const base: CarryInput = {
  year: 2027,
  carriesBeyondYear: true,
  firstTrackedYear: 2026,
  openingCarried: 0,
  grantedInYear: () => 15,
  usedInYear: () => 5,
};

test('a policy that does not carry past March carries nothing', () => {
  assert.equal(carriedInto({ ...base, carriesBeyondYear: false }), 0);
});

test('the unused part of last year is carried in', () => {
  assert.equal(carriedInto(base), 10);
});

test('it accumulates across years and adds the opening balance', () => {
  assert.equal(carriedInto({ ...base, year: 2028, openingCarried: 8 }), 8 + 10 + 10);
});

test('the cap bounds every year’s carry', () => {
  assert.equal(carriedInto({ ...base, year: 2029, cap: 12 }), 12);
});

test('the first tracked year carries only the opening balance, and earlier years nothing', () => {
  assert.equal(carriedInto({ ...base, year: 2026, openingCarried: 6 }), 6);
  assert.equal(carriedInto({ ...base, year: 2025, openingCarried: 6 }), 0);
});

test('a year that overdrew carries nothing negative', () => {
  assert.equal(carriedInto({ ...base, usedInYear: () => 20 }), 0);
});
