// Unit tests for an organisation's days off beyond its weekly one —
// src/data/weekOffRules.ts.
//
// Run: npm run test:unit

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NO_EXTRA_WEEK_OFF,
  describeOrganisationWeekOff,
  isOrganisationWeekOffDate,
  normalizeWeekOffRules,
  weekOfMonth,
} from '../../src/data/weekOffRules.ts';

// October 2026: Saturdays are the 3rd, 10th, 17th, 24th and 31st.
const SATURDAYS = ['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31'];

test('the weekly day alone is what it always was', () => {
  assert.equal(isOrganisationWeekOffDate('2026-10-04', 'Sunday', NO_EXTRA_WEEK_OFF), true);
  assert.equal(isOrganisationWeekOffDate('2026-10-10', 'Sunday', NO_EXTRA_WEEK_OFF), false);
});

test('a second weekly day is off every week', () => {
  const rules = { secondDay: 'Saturday' as const, nthDays: null };
  assert.deepEqual(SATURDAYS.map((d) => isOrganisationWeekOffDate(d, 'Sunday', rules)), [true, true, true, true, true]);
});

test('2nd and 4th Saturday off — the bank pattern', () => {
  const rules = { secondDay: null, nthDays: { day: 'Saturday' as const, weeks: [2, 4] } };
  assert.deepEqual(SATURDAYS.map(weekOfMonth), [1, 2, 3, 4, 5]);
  assert.deepEqual(SATURDAYS.map((d) => isOrganisationWeekOffDate(d, 'Sunday', rules)), [false, true, false, true, false]);
  // Only Saturdays: the 2nd-week Friday is a working day.
  assert.equal(isOrganisationWeekOffDate('2026-10-09', 'Sunday', rules), false);
  assert.equal(describeOrganisationWeekOff('Sunday', rules), 'Sunday & 2nd/4th Saturday');
});

test('1st, 3rd and 5th covers a fifth Saturday', () => {
  const rules = { secondDay: null, nthDays: { day: 'Saturday' as const, weeks: [5, 1, 3] } };
  assert.deepEqual(SATURDAYS.map((d) => isOrganisationWeekOffDate(d, 'Sunday', rules)), [true, false, true, false, true]);
  assert.equal(describeOrganisationWeekOff('Sunday', rules), 'Sunday & 1st/3rd/5th Saturday');
});

test('stored rules are narrowed, not trusted', () => {
  assert.deepEqual(normalizeWeekOffRules(null), NO_EXTRA_WEEK_OFF);
  assert.deepEqual(normalizeWeekOffRules({ secondDay: 'Funday', nthDays: { day: 'Saturday', weeks: [0, 2, 2, 7, 4] } }), {
    secondDay: null,
    nthDays: { day: 'Saturday', weeks: [2, 4] },
  });
  assert.deepEqual(normalizeWeekOffRules({ nthDays: { day: 'Saturday', weeks: [] } }), NO_EXTRA_WEEK_OFF);
});
