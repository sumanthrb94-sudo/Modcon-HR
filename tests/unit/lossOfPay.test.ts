// Unit tests for the loss-of-pay arithmetic in src/data/lossOfPay.ts.
//
// Run: npm run test:unit
//
// The module imports nothing; which records, holidays and week-offs feed it is
// `lossOfPayDays` in src/data/payroll.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { combineLossOfPay, unpaidLeaveByDate } from '../../src/data/lossOfPay.ts';

const MONTH = '2026-09';
// 2026-09-06 and 2026-09-13 are Sundays; 2026-09-10 is declared a holiday below.
const sundaysAndHoliday = (date: string) =>
  new Date(`${date}T00:00:00Z`).getUTCDay() === 0 || date === '2026-09-10';

test('approved Unpaid leave costs every working day it covers', () => {
  // Mon 7th to Sun 13th: seven calendar days, a holiday and a Sunday inside.
  const dates = unpaidLeaveByDate([{ startDate: '2026-09-07', endDate: '2026-09-13', days: 5 }], MONTH, sundaysAndHoliday);
  assert.deepEqual([...dates.keys()].sort(), ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-11', '2026-09-12']);
  assert.equal(combineLossOfPay([], dates, MONTH), 5);
});

test('a day both on Unpaid leave and marked Absent is deducted once', () => {
  const dates = unpaidLeaveByDate([{ startDate: '2026-09-07', endDate: '2026-09-08', days: 2 }], MONTH, sundaysAndHoliday);
  const attendance = [
    { date: '2026-09-07', status: 'Absent' },
    { date: '2026-09-08', status: 'On Leave' },
    { date: '2026-09-15', status: 'Absent' },
  ];
  // 7th (leave + absent) once, 8th (leave), 15th (absent only).
  assert.equal(combineLossOfPay(attendance, dates, MONTH), 3);
});

test('a half-day Unpaid request costs half, and a Half Day on the same date is the same half', () => {
  const dates = unpaidLeaveByDate([{ startDate: '2026-09-07', endDate: '2026-09-07', days: 0.5 }], MONTH, sundaysAndHoliday);
  assert.equal(combineLossOfPay([{ date: '2026-09-07', status: 'Half Day' }], dates, MONTH), 0.5);
  // Absent that day outranks the half.
  assert.equal(combineLossOfPay([{ date: '2026-09-07', status: 'Absent' }], dates, MONTH), 1);
});

test('a request spanning a month boundary charges each month its own days', () => {
  const request = [{ startDate: '2026-08-31', endDate: '2026-09-02', days: 3 }];
  const none = () => false;
  assert.equal(combineLossOfPay([], unpaidLeaveByDate(request, '2026-08', none), '2026-08'), 1);
  assert.equal(combineLossOfPay([], unpaidLeaveByDate(request, '2026-09', none), '2026-09'), 2);
});

test('attendance alone is what it always was', () => {
  const attendance = [
    { date: '2026-09-01', status: 'Absent' },
    { date: '2026-09-02', status: 'Half Day' },
    { date: '2026-09-03', status: 'On Leave' },
    { date: '2026-09-04', status: 'Present' },
    { date: '2026-10-01', status: 'Absent' },
  ];
  assert.equal(combineLossOfPay(attendance, new Map(), MONTH), 1.5);
});

test('a malformed range charges nothing rather than spinning', () => {
  assert.equal(unpaidLeaveByDate([{ startDate: 'not-a-date', endDate: '2026-09-30', days: 1 }], MONTH, () => false).size, 0);
  assert.equal(unpaidLeaveByDate([{ startDate: '2026-09-30', endDate: '2026-09-01', days: 1 }], MONTH, () => false).size, 0);
});
