// Unit tests for the loss-of-pay arithmetic in src/data/lossOfPay.ts.
//
// Run: npm run test:unit
//
// The module imports nothing; which records, holidays and week-offs feed it is
// `lossOfPayDays` in src/data/payroll.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { combineLossOfPay, lossOfPayArrears, overQuotaDays, unpaidLeaveByDate } from '../../src/data/lossOfPay.ts';

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

test('leave within the balance is paid; the days beyond it are loss of pay', () => {
  assert.equal(overQuotaDays(2, 5), 0);
  assert.equal(overQuotaDays(5, 2), 3);
  assert.equal(overQuotaDays(3, 0), 3);
  // A balance already overdrawn by pending requests pays nothing, never less.
  assert.equal(overQuotaDays(3, -1), 3);
  assert.equal(overQuotaDays(3, 1.5), 1.5);
});

test('over-quota days are the request’s last working days', () => {
  // Mon 7th to Sat 12th, the 10th a holiday: five working days, two unpaid.
  const dates = unpaidLeaveByDate(
    [{ startDate: '2026-09-07', endDate: '2026-09-12', days: 5, lossOfPayDays: 2 }],
    MONTH,
    sundaysAndHoliday,
  );
  assert.deepEqual([...dates.entries()].sort(), [['2026-09-11', 1], ['2026-09-12', 1]]);
});

test('a request within its balance costs nothing', () => {
  const dates = unpaidLeaveByDate(
    [{ startDate: '2026-09-07', endDate: '2026-09-09', days: 3, lossOfPayDays: 0 }],
    MONTH,
    sundaysAndHoliday,
  );
  assert.equal(dates.size, 0);
});

test('a fractional excess leaves half a day unpaid', () => {
  // Three working days against a balance of 1.5.
  const dates = unpaidLeaveByDate(
    [{ startDate: '2026-09-07', endDate: '2026-09-09', days: 3, lossOfPayDays: 1.5 }],
    MONTH,
    sundaysAndHoliday,
  );
  assert.deepEqual([...dates.entries()].sort(), [['2026-09-08', 0.5], ['2026-09-09', 1]]);
  assert.equal(combineLossOfPay([], dates, MONTH), 1.5);
});

test('over-quota days across a month end are charged in the month they fall in', () => {
  // Mon 28 Sep to Fri 2 Oct: five working days, the last three over quota.
  const request = { startDate: '2026-09-28', endDate: '2026-10-02', days: 5, lossOfPayDays: 3 };
  const noWeekOff = () => false;
  assert.deepEqual([...unpaidLeaveByDate([request], '2026-09', noWeekOff).keys()], ['2026-09-30']);
  assert.deepEqual([...unpaidLeaveByDate([request], '2026-10', noWeekOff).keys()].sort(), ['2026-10-01', '2026-10-02']);
});

// ---- Arrears: loss of pay that changed after its month was paid ------------

const AUGUST = { month: '2026-08', lopDays: 1, grossEarnings: 62_000, payableDays: 31 };

test('leave approved after payroll ran is deducted on the next payslip, at its own month’s rate', () => {
  // August paid with 1 day deducted; a late approval makes it 3.
  const arrears = lossOfPayArrears('2026-09', [AUGUST], () => 3);
  // ₹62,000 ÷ 31 × 2 = ₹4,000.
  assert.deepEqual(arrears, [{ month: '2026-08', days: 2, amount: 4000 }]);
});

test('an absence corrected after payroll is refunded, not ignored', () => {
  const arrears = lossOfPayArrears('2026-09', [AUGUST], () => 0);
  assert.deepEqual(arrears, [{ month: '2026-08', days: -1, amount: -2000 }]);
});

test('nothing changed, nothing carried', () => {
  assert.deepEqual(lossOfPayArrears('2026-09', [AUGUST], () => 1), []);
});

test('arrears already recovered on a later payslip are not charged twice', () => {
  const september = { month: '2026-09', lopDays: 0, grossEarnings: 60_000, payableDays: 30, lopArrears: [{ month: '2026-08', days: 2 }] };
  const now = (m: string) => (m === '2026-08' ? 3 : 0);
  // October sees August already settled: 1 on its own payslip + 2 recovered in September.
  assert.deepEqual(lossOfPayArrears('2026-10', [AUGUST, september], now), []);
});

test('recomputing a month that was itself paid gives the answer it was paid with', () => {
  // September's own recovery must not count as already recovered when
  // September is recomputed, or the live view and the paid payslip disagree.
  const september = { month: '2026-09', lopDays: 0, grossEarnings: 60_000, payableDays: 30, lopArrears: [{ month: '2026-08', days: 2 }] };
  const arrears = lossOfPayArrears('2026-09', [AUGUST, september], () => 3);
  assert.deepEqual(arrears, [{ month: '2026-08', days: 2, amount: 4000 }]);
});

test('only earlier months are considered', () => {
  const october = { month: '2026-10', lopDays: 0, grossEarnings: 62_000, payableDays: 31 };
  assert.deepEqual(lossOfPayArrears('2026-09', [october], () => 5), []);
});
