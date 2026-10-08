// Unit tests for who a payroll run pays — src/data/payRun.ts.
//
// Run: npm run test:unit

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { carriedOverLossOfPay, isInventedAdminRecord, lastDayOf, payRunRoll, payeesFor, runnableMonths } from '../../src/data/payRun.ts';

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

test('a run lists every earlier month it corrects, deductions and refunds alike', () => {
  const rows = carriedOverLossOfPay([
    { employeeId: 'emp-2', lopArrears: [{ month: '2026-09', days: 2, amount: 3333 }] },
    { employeeId: 'emp-1', lopArrears: [{ month: '2026-09', days: -1, amount: -1667 }, { month: '2026-08', days: 1, amount: 1613 }] },
    { employeeId: 'emp-3' },
  ]);
  assert.deepEqual(rows, [
    { employeeId: 'emp-1', fromMonth: '2026-08', days: 1, amount: 1613 },
    { employeeId: 'emp-1', fromMonth: '2026-09', days: -1, amount: -1667 },
    { employeeId: 'emp-2', fromMonth: '2026-09', days: 2, amount: 3333 },
  ]);
});

test('a run with no corrections lists nothing', () => {
  assert.deepEqual(carriedOverLossOfPay([{ employeeId: 'emp-1', lopArrears: [] }, { employeeId: 'emp-2' }]), []);
});

test('the current month cannot be run until the 25th', () => {
  assert.deepEqual(runnableMonths('2026-10-08'), ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04']);
  assert.deepEqual(runnableMonths('2026-10-24'), runnableMonths('2026-10-08'));
  assert.deepEqual(runnableMonths('2026-10-25'), ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05']);
  // Across a year end, in both directions.
  assert.deepEqual(runnableMonths('2027-01-03').slice(0, 2), ['2026-12', '2026-11']);
  assert.deepEqual(runnableMonths('2026-12-31')[0], '2026-12');
});

test('a record the app invented for an administrator is excluded from a run, and named', () => {
  const invented = { id: 'emp-hr-001-evDh2Y', status: 'Active', dateOfJoining: '2023-01-01', dateOfBirth: '1992-05-15', ctc: 3600000 };
  const corrected = { ...invented, dateOfBirth: '1986-07-22', ctc: 960000 };
  const ordinary = { id: 'emp-001', status: 'Active', dateOfJoining: '2020-01-01', dateOfBirth: '1992-05-15', ctc: 3600000 };
  assert.equal(isInventedAdminRecord(invented), true);
  assert.equal(isInventedAdminRecord({ ...invented, id: 'emp-adm-001-abc123' }), true);
  // Somebody genuinely born that day on that salary is not mistaken for one.
  assert.equal(isInventedAdminRecord(ordinary), false);
  assert.equal(isInventedAdminRecord(corrected), false);

  const roll = payRunRoll([invented, ordinary], '2026-09');
  assert.deepEqual(roll.payees.map((e) => e.id), ['emp-001']);
  assert.equal(roll.excluded.length, 1);
  assert.match(roll.excluded[0].reason, /never entered/);
  assert.deepEqual(payRunRoll([corrected], '2026-09').payees.map((e) => e.id), ['emp-hr-001-evDh2Y']);
});

test('a leaver is paid for their last month and not after it', () => {
  const leaver = { status: 'Resigned' as const, dateOfJoining: '2024-01-01', lastWorkingDay: '2026-10-10' };
  assert.equal(payeesFor([leaver], '2026-10').length, 1);
  assert.equal(payeesFor([leaver], '2026-11').length, 0);
  // Serving notice: still on the roll until the day.
  assert.equal(payeesFor([{ ...leaver, status: 'Notice Period' as const }], '2026-10').length, 1);
});
