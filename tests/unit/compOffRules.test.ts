// Unit tests for how comp off is earned, src/data/compOffRules.ts.
//
// Run: npm run test:unit

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compOffDaysEarned, FULL_DAY_HOURS } from '../../src/data/compOffRules.ts';

// 2026-01-11 and 2026-01-18 are Sundays (the week-off); 2026-01-26 is a holiday.
const dayOff = (date: string) => ['2026-01-11', '2026-01-18', '2026-01-26'].includes(date);
const FROM = '2026-01-01';
const TO = '2026-01-31';

test('a worked Sunday earns one day back', () => {
  assert.equal(compOffDaysEarned([{ date: '2026-01-11', checkIn: '10:00', workedHours: 5.5 }], dayOff, FROM, TO), 1);
});

test('working an ordinary day earns nothing', () => {
  assert.equal(compOffDaysEarned([{ date: '2026-01-12', checkIn: '09:00', workedHours: 9 }], dayOff, FROM, TO), 0);
});

test('a short day off worked earns half a day; the threshold is a full day', () => {
  assert.equal(compOffDaysEarned([{ date: '2026-01-18', checkIn: '10:00', workedHours: 2 }], dayOff, FROM, TO), 0.5);
  assert.equal(compOffDaysEarned([{ date: '2026-01-18', checkIn: '10:00', workedHours: FULL_DAY_HOURS }], dayOff, FROM, TO), 1);
});

test('an open shift on a day off earns nothing until it has a length', () => {
  assert.equal(compOffDaysEarned([{ date: '2026-01-26', checkIn: '10:00', workedHours: 0 }], dayOff, FROM, TO), 0);
});

test('no check-in, no comp off — an administrator marking the day does not count', () => {
  assert.equal(compOffDaysEarned([{ date: '2026-01-26', checkIn: null, workedHours: 8 }], dayOff, FROM, TO), 0);
});

test('only days inside the window count, and holidays count like week-offs', () => {
  const days = [
    { date: '2025-12-28', checkIn: '10:00', workedHours: 6 }, // outside
    { date: '2026-01-11', checkIn: '10:00', workedHours: 6 },
    { date: '2026-01-26', checkIn: '10:00', workedHours: 6 },
  ];
  assert.equal(compOffDaysEarned(days, (d) => d === '2025-12-28' || dayOff(d), FROM, TO), 2);
});

test('a non-finite hours value is treated as no hours', () => {
  assert.equal(compOffDaysEarned([{ date: '2026-01-11', checkIn: '10:00', workedHours: Number.NaN }], dayOff, FROM, TO), 0);
});
