import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ctcOn,
  employedDaysInMonth,
  finalSettlement,
  monthlyCtcFor,
  salaryArrears,
  type SalaryRevision,
} from '../../src/data/payChanges.ts';

test('a whole month is every day of it', () => {
  assert.deepEqual(employedDaysInMonth('2026-09', '2024-01-01'), { employedDays: 30, payableDays: 30 });
});

test('a joiner on the 15th is paid from the 15th', () => {
  assert.deepEqual(employedDaysInMonth('2026-09', '2026-09-15'), { employedDays: 16, payableDays: 30 });
});

test('a leaver on the 10th is paid to the 10th, inclusive', () => {
  assert.deepEqual(employedDaysInMonth('2026-10', '2020-01-01', '2026-10-10'), { employedDays: 10, payableDays: 31 });
});

test('joining and leaving in one month', () => {
  assert.equal(employedDaysInMonth('2026-02', '2026-02-10', '2026-02-20').employedDays, 11);
});

test('a month wholly outside employment pays nothing', () => {
  assert.equal(employedDaysInMonth('2026-08', '2026-09-01').employedDays, 0);
  assert.equal(employedDaysInMonth('2026-11', '2020-01-01', '2026-10-31').employedDays, 0);
});

const raise: SalaryRevision[] = [
  { effectiveFrom: '2026-09-16', ctc: 720_000, previousCtc: 600_000, recordedOn: '2026-10-05' },
];

test('the CTC in force follows the effective date', () => {
  assert.equal(ctcOn('2026-09-15', 720_000, raise), 600_000);
  assert.equal(ctcOn('2026-09-16', 720_000, raise), 720_000);
  assert.equal(ctcOn('2026-01-01', 720_000, []), 720_000);
});

test('a raise mid-month pays each rate for its own days', () => {
  // 15 days at 50,000 and 15 days at 60,000 a month.
  assert.equal(monthlyCtcFor('2026-09', 720_000, raise), 55_000);
  assert.equal(monthlyCtcFor('2026-08', 720_000, raise), 50_000);
  assert.equal(monthlyCtcFor('2026-10', 720_000, raise), 60_000);
});

test('a raise backdated over paid months is owed once, as arrears', () => {
  const paid = [
    { month: '2026-08', ctcBasis: 50_000, grossEarnings: 50_000, payableDays: 31, lopDays: 0 },
    { month: '2026-09', ctcBasis: 50_000, grossEarnings: 50_000, payableDays: 30, lopDays: 0 },
  ];
  const expected = (month: string) => {
    const basis = monthlyCtcFor(month, 720_000, raise);
    return { ctcBasis: basis, grossEarnings: basis };
  };
  // August was before the raise: nothing. September: 5,000.
  assert.deepEqual(salaryArrears('2026-10', paid, expected), [{ month: '2026-09', amount: 5_000 }]);

  // Once October's payslip has paid it, November owes nothing more.
  const withOctober = [
    ...paid,
    { month: '2026-10', ctcBasis: 60_000, grossEarnings: 60_000, payableDays: 31, lopDays: 0, salaryArrears: [{ month: '2026-09', amount: 5_000 }] },
  ];
  assert.deepEqual(salaryArrears('2026-11', withOctober, expected), []);
});

test('loss of pay taken that month is not paid back as arrears', () => {
  const paid = [{ month: '2026-09', ctcBasis: 50_000, grossEarnings: 50_000, payableDays: 30, lopDays: 3 }];
  const expected = () => ({ ctcBasis: 55_000, grossEarnings: 55_000 });
  // 5,000 more for the month, of which 27 of 30 days were paid.
  assert.deepEqual(salaryArrears('2026-10', paid, expected), [{ month: '2026-09', amount: 4_500 }]);
});

test('a payslip that did not record its CTC basis produces no arrears', () => {
  const paid = [{ month: '2026-09', grossEarnings: 50_000, payableDays: 30, lopDays: 0 }];
  assert.deepEqual(salaryArrears('2026-10', paid, () => ({ ctcBasis: 60_000, grossEarnings: 60_000 })), []);
});

test('final settlement: encashment on Basic, gratuity, notice recovered', () => {
  const s = finalSettlement({
    monthlyBasic: 30_000,
    monthlyGross: 60_000,
    encashableDays: 10,
    gratuity: 86_538,
    noticeShortDays: 15,
    otherAmount: 0,
  });
  assert.equal(s.encashmentBasis, 'basic');
  assert.equal(s.leaveEncashment, 10_000);
  assert.equal(s.noticeRecovery, 30_000);
  assert.equal(s.net, 10_000 + 86_538 - 30_000);
});

test('with no salary split, encashment is priced on gross and says so', () => {
  const s = finalSettlement({ monthlyBasic: null, monthlyGross: 45_000, encashableDays: 2, gratuity: null, noticeShortDays: 0, otherAmount: -5_000 });
  assert.equal(s.encashmentBasis, 'gross');
  assert.equal(s.leaveEncashment, 3_000);
  assert.equal(s.gratuity, 0);
  assert.equal(s.net, -2_000);
});
