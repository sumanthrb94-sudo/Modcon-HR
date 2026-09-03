// Unit tests for the statutory return generators in src/data/returnFiles.ts.
//
// Run: npm run test:unit
//
// These assert the shape of a file that goes to a government portal, so the
// expected values are written out literally rather than composed from the same
// helpers the code uses. A test that builds its expectation with the separator
// constant proves the code is self-consistent and nothing about whether the
// file is the format EPFO accepts.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEcrFile,
  buildTdsDeducteeSchedule,
  ecrTotals,
  financialQuarterOf,
  isIndividualPan,
  isValidPan,
  isValidUan,
  monthsOfQuarter,
  type EcrMemberInput,
  type TdsDeducteeInput,
} from '../../src/data/returnFiles.ts';

/** Somebody at the PF ceiling: the familiar 1,800 / 1,250 / 550. */
const AT_CEILING: EcrMemberInput = {
  employeeId: 'emp-001',
  employeeCode: 'MC-001',
  name: 'Aarav Sharma',
  uan: '100123456789',
  grossWages: 45000,
  epfWages: 15000,
  epsWages: 15000,
  edliWages: 15000,
  epfContribution: 1800,
  epsContribution: 1250,
  epfEpsDifference: 550,
  ncpDays: 0,
  refundOfAdvances: 0,
};

// ---------------------------------------------------------------------------
// ECR
// ---------------------------------------------------------------------------

test('an ECR line is eleven #~# fields in the order EPFO fixes them', () => {
  const { text, included, problems } = buildEcrFile([AT_CEILING], '2026-08');
  assert.equal(included, 1);
  assert.deepEqual(problems, []);
  // Written out rather than composed: reordering two numeric columns produces a
  // file that uploads cleanly and remits the wrong amounts to the wrong scheme,
  // and a test built from the same array would reorder with it.
  assert.equal(
    text,
    '100123456789#~#Aarav Sharma#~#45000#~#15000#~#15000#~#15000#~#1800#~#1250#~#550#~#0#~#0\n',
  );
  assert.equal(text.split('#~#').length, 11);
});

test('a member with no UAN is kept out of the file and named', () => {
  const noUan: EcrMemberInput = { ...AT_CEILING, employeeId: 'emp-002', employeeCode: 'MC-002', name: 'Riya Sharma', uan: '' };
  const { text, included, problems } = buildEcrFile([AT_CEILING, noUan], '2026-08');

  assert.equal(included, 1);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].severity, 'blocking');
  assert.equal(problems[0].employeeCode, 'MC-002');
  assert.match(problems[0].message, /No UAN/);
  // The rest of the return is still generated. Blocking the whole file on one
  // missing number would stop an employer remitting for the ninety people whose
  // details are complete, on the 15th.
  assert.match(text, /^100123456789#~#/);
  // And the person who was left out is nowhere in it — silently including them
  // with a blank first field is a corrupt line, not a partial one.
  assert.equal(text.includes('Riya'), false);
});

test('a malformed UAN is refused rather than sent', () => {
  for (const uan of ['12345', '10012345678A', '1001234567890']) {
    const { included, problems } = buildEcrFile([{ ...AT_CEILING, uan }], '2026-08');
    assert.equal(included, 0, uan);
    assert.equal(problems[0].severity, 'blocking', uan);
    // EPFO rejects the whole upload on one of these and reports a line number,
    // not a name — so catching it here is the difference between a fix and an
    // afternoon.
    assert.match(problems[0].message, /twelve-digit/, uan);
  }
  assert.equal(isValidUan('100123456789'), true);
  assert.equal(isValidUan(' 100123456789 '), true);
});

test('the separator cannot be smuggled in through a name', () => {
  const { text } = buildEcrFile(
    [{ ...AT_CEILING, name: 'Aarav#~#Sharma' }],
    '2026-08',
  );
  // Twelve fields would shift every column after the name by one, so the
  // employee's EPF contribution would be read as their EPS wages. The format
  // has no escape, so the separator is stripped.
  assert.equal(text.split('#~#').length, 11);
  assert.match(text, /#~#Aarav Sharma#~#/);
});

test('an unpaid month is filed with zero wages, and flagged', () => {
  const unpaid: EcrMemberInput = {
    ...AT_CEILING,
    grossWages: 0, epfWages: 0, epsWages: 0, edliWages: 0,
    epfContribution: 0, epsContribution: 0, epfEpsDifference: 0,
    ncpDays: 31,
  };
  const { text, included, problems } = buildEcrFile([unpaid], '2026-08');
  assert.equal(included, 1);
  // A member omitted from the return reads as somebody who left.
  assert.match(text, /#~#0#~#0#~#0#~#0#~#0#~#0#~#0#~#31#~#0\n$/);
  assert.equal(problems[0].severity, 'warning');
  assert.match(problems[0].message, /check that they have not left/);
});

test('the file is empty rather than a stray newline when nothing is fileable', () => {
  const { text, included } = buildEcrFile([{ ...AT_CEILING, uan: '' }], '2026-08');
  assert.equal(text, '');
  assert.equal(included, 0);
});

test('the filename names the month it is for', () => {
  assert.equal(buildEcrFile([], '2026-08').filename, 'ECR_2026_08.txt');
});

test('totals cover the members that were filed, not the ones that were not', () => {
  const noUan: EcrMemberInput = { ...AT_CEILING, employeeId: 'emp-002', uan: '' };
  const second: EcrMemberInput = { ...AT_CEILING, employeeId: 'emp-003', uan: '100123456780' };
  const members = [AT_CEILING, noUan, second];
  const { problems } = buildEcrFile(members, '2026-08');
  const totals = ecrTotals(members, problems);

  assert.equal(totals.members, 2);
  assert.equal(totals.employeeShare, 3600);
  assert.equal(totals.pensionShare, 2500);
  assert.equal(totals.employerShare, 1100);
  // A total that includes somebody the return excluded will not reconcile
  // against the challan, which is the only reason to show one.
  assert.equal(totals.epfWages, 30000);
});

// ---------------------------------------------------------------------------
// The quarterly TDS deductee schedule
// ---------------------------------------------------------------------------

const DEDUCTEE: TdsDeducteeInput = {
  employeeId: 'emp-001',
  employeeCode: 'MC-001',
  name: 'Aarav Sharma',
  pan: 'ABCPS1234K',
  months: [
    { month: '2026-04', amountPaid: 200000, taxDeducted: 15000 },
    { month: '2026-05', amountPaid: 200000, taxDeducted: 15000 },
    { month: '2026-06', amountPaid: 210000, taxDeducted: 16000 },
  ],
};

test('the schedule is one row per deductee, month by month, with totals', () => {
  const months = ['2026-04', '2026-05', '2026-06'];
  const { text, included, problems } = buildTdsDeducteeSchedule([DEDUCTEE], months);

  assert.equal(included, 1);
  assert.deepEqual(problems, []);
  const [header, row] = text.trim().split('\n');
  assert.equal(
    header,
    'employee_code,deductee_name,pan,2026-04_paid,2026-04_tds,2026-05_paid,2026-05_tds,'
    + '2026-06_paid,2026-06_tds,total_paid,total_tds',
  );
  assert.equal(row, 'MC-001,Aarav Sharma,ABCPS1234K,200000,15000,200000,15000,210000,16000,610000,46000');
});

test('a month with no payslip is a zero, not a missing column', () => {
  const joinedMidQuarter: TdsDeducteeInput = {
    ...DEDUCTEE,
    months: [{ month: '2026-06', amountPaid: 100000, taxDeducted: 5000 }],
  };
  const { text } = buildTdsDeducteeSchedule([joinedMidQuarter], ['2026-04', '2026-05', '2026-06']);
  const row = text.trim().split('\n')[1];
  // Eleven cells either way. A short row shifts every column after it.
  assert.equal(row.split(',').length, 11);
  assert.match(row, /,0,0,0,0,100000,5000,100000,5000$/);
});

test('a deductee with no PAN is included and flagged, not omitted', () => {
  const { text, included, problems } = buildTdsDeducteeSchedule(
    [{ ...DEDUCTEE, pan: '' }],
    ['2026-04', '2026-05', '2026-06'],
  );
  // Included: the return has to reconcile against the challans that were
  // actually paid, and leaving somebody out understates the quarter.
  assert.equal(included, 1);
  assert.match(text, /MC-001/);
  assert.equal(problems[0].severity, 'warning');
  assert.match(problems[0].message, /206AA/);
});

test('an invalid PAN is reported before the utility rejects it', () => {
  const { problems } = buildTdsDeducteeSchedule(
    [{ ...DEDUCTEE, pan: 'ABC1234567' }],
    ['2026-04', '2026-05', '2026-06'],
  );
  assert.match(problems[0].message, /not a valid PAN/);
});

test('a valid PAN that is not an individual\'s is worth a second look', () => {
  // Fourth character C is a company. Valid, filed, and almost always a typo on
  // a salary return — so it is a warning and not a refusal.
  const { included, problems } = buildTdsDeducteeSchedule(
    [{ ...DEDUCTEE, pan: 'ABCCS1234K' }],
    ['2026-04', '2026-05', '2026-06'],
  );
  assert.equal(included, 1);
  assert.match(problems[0].message, /fourth character is not P/);

  assert.equal(isValidPan('ABCCS1234K'), true);
  assert.equal(isIndividualPan('ABCCS1234K'), false);
  assert.equal(isIndividualPan('ABCPS1234K'), true);
});

test('a comma in a name does not become a column break', () => {
  const { text } = buildTdsDeducteeSchedule(
    [{ ...DEDUCTEE, name: 'Sharma, Aarav' }],
    ['2026-04', '2026-05', '2026-06'],
  );
  const row = text.trim().split('\n')[1];
  assert.match(row, /"Sharma, Aarav"/);
  // Otherwise the PAN lands in the deductee-name column and every amount after
  // it shifts one place — a return that validates and is wrong.
  assert.equal(row.split('"')[2].split(',').length - 1, 9);
});

// ---------------------------------------------------------------------------
// Quarters
// ---------------------------------------------------------------------------

test('quarters run April to March, and January belongs to the previous April', () => {
  assert.equal(financialQuarterOf('2026-04').quarter, 1);
  assert.equal(financialQuarterOf('2026-09').quarter, 2);
  assert.equal(financialQuarterOf('2026-12').quarter, 3);
  assert.equal(financialQuarterOf('2027-01').quarter, 4);

  assert.equal(financialQuarterOf('2026-05').label, 'Q1 2026-27');
  // The one worth asserting: filing January against 2027-28 puts a quarter in
  // the wrong year, which surfaces as a notice rather than a warning.
  assert.equal(financialQuarterOf('2027-02').label, 'Q4 2026-27');
});

test('a quarter is its own three months, whichever one you name', () => {
  assert.deepEqual(monthsOfQuarter('2026-05'), ['2026-04', '2026-05', '2026-06']);
  assert.deepEqual(monthsOfQuarter('2026-04'), ['2026-04', '2026-05', '2026-06']);
  assert.deepEqual(monthsOfQuarter('2026-11'), ['2026-10', '2026-11', '2026-12']);
  assert.deepEqual(monthsOfQuarter('2027-02'), ['2027-01', '2027-02', '2027-03']);
});
