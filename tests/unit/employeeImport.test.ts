// Unit tests for the guided setup's staff import — src/data/employeeImport.ts —
// and its leave templates — src/data/leavePolicyTemplates.ts.
//
// Run: npm run test:unit

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPLOYEE_IMPORT_CSV_EXAMPLE,
  EMPLOYEE_IMPORT_CSV_HEADER,
  parseEmployeeImportCsv,
  parseImportAmount,
  parseImportDate,
  splitCsvLine,
} from '../../src/data/employeeImport.ts';
import { LEAVE_POLICY_TEMPLATES, describeGrant } from '../../src/data/leavePolicyTemplates.ts';

const TODAY = '2026-10-08';
const suggest = (ahead: number) => `MC-${String(10 + ahead).padStart(3, '0')}`;
const parse = (text: string, existing: { email: string; employeeCode?: string }[] = []) =>
  parseEmployeeImportCsv(text, existing, suggest, TODAY);

const HEADER = EMPLOYEE_IMPORT_CSV_HEADER;
const row = (overrides: Partial<Record<string, string>> = {}) => {
  const values: Record<string, string> = {
    first_name: 'Priya',
    last_name: 'Sharma',
    email: 'priya@example.com',
    designation: 'Accountant',
    department: 'Finance',
    location: 'Pune',
    date_of_birth: '1994-03-12',
    date_of_joining: '2023-06-01',
    annual_ctc: '650000',
    employment_type: '',
    gender: '',
    phone: '',
    employee_code: '',
    ...overrides,
  };
  return HEADER.split(',').map((column) => values[column] ?? '').join(',');
};

test('the downloadable template parses as one person', () => {
  const result = parse(`${HEADER}\n${EMPLOYEE_IMPORT_CSV_EXAMPLE}`);
  assert.equal(result.fileError, null);
  assert.equal(result.unmatched.length, 0);
  assert.equal(result.rows.length, 1);
  const person = result.rows[0].employee;
  assert.equal(person.email, 'priya.sharma@example.com');
  assert.equal(person.ctc, 650000);
  assert.equal(person.gender, 'Female');
  assert.equal(person.employmentType, 'Full-time');
  assert.equal(person.employeeCode, 'MC-010');
  assert.equal(person.codeSuggested, true);
});

test('columns are found by heading in any order, with aliases and extras ignored', () => {
  const text = [
    'Notes,DOJ,Work Email,Name,Dept,Job Title,Office,DOB,CTC',
    'ignore me,01/06/2023,ravi@example.com,Ravi Kumar Iyer,Sales,Executive,Chennai,05/11/1990,"4,80,000"',
  ].join('\n');
  const result = parse(text);
  assert.equal(result.fileError, null);
  assert.deepEqual(result.unmatched, []);
  const person = result.rows[0].employee;
  assert.equal(person.firstName, 'Ravi');
  assert.equal(person.lastName, 'Kumar Iyer');
  assert.equal(person.dateOfJoining, '2023-06-01');
  assert.equal(person.dateOfBirth, '1990-11-05');
  assert.equal(person.ctc, 480000);
  assert.equal(person.department, 'Sales');
});

test('a file missing a required column is refused whole, naming the column', () => {
  const result = parse('first_name,last_name,email\nA,B,a@b.co');
  assert.equal(result.rows.length, 0);
  assert.match(result.fileError ?? '', /designation/);
  assert.match(result.fileError ?? '', /annual_ctc/);
});

test('every unusable row is reported with its line, never dropped', () => {
  const text = [
    HEADER,
    row(),
    row({ email: 'not-an-email' }),
    row({ email: 'b@example.com', annual_ctc: '0' }),
    row({ email: 'c@example.com', date_of_joining: '31/02/2024' }),
    row({ email: 'd@example.com', date_of_birth: '2030-01-01' }),
    row({ email: 'e@example.com', employment_type: 'Freelance' }),
    row({ email: 'f@example.com', location: '' }),
  ].join('\n');
  const result = parse(text);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(
    result.unmatched.map((miss) => miss.line),
    [3, 4, 5, 6, 7, 8],
  );
  assert.match(result.unmatched[0].reason, /valid email/);
  assert.match(result.unmatched[1].reason, /above zero/);
  assert.match(result.unmatched[2].reason, /not a date/);
  assert.match(result.unmatched[3].reason, /future/);
  assert.match(result.unmatched[4].reason, /Freelance/);
  assert.match(result.unmatched[5].reason, /Location/);
});

test('somebody already in the directory, or twice in the file, is not created twice', () => {
  const text = [HEADER, row({ email: 'Existing@Example.com' }), row({ email: 'new@example.com' }), row({ email: 'NEW@example.com' })].join('\n');
  const result = parse(text, [{ email: 'existing@example.com', employeeCode: 'MC-001' }]);
  assert.deepEqual(result.rows.map((r) => r.employee.email), ['new@example.com']);
  assert.match(result.unmatched[0].reason, /already in your directory/);
  assert.match(result.unmatched[1].reason, /also on line 3/);
});

test('codes: a taken code is refused, a suggestion never takes a code the file typed', () => {
  const text = [
    HEADER,
    row({ email: 'a@example.com' }), // suggested — must skip MC-010, typed below
    row({ email: 'b@example.com', employee_code: 'mc010' }),
    row({ email: 'c@example.com', employee_code: 'MC-001' }), // in the directory
    row({ email: 'd@example.com', employee_code: 'MC-010' }), // duplicate in file
  ].join('\n');
  const result = parse(text, [{ email: 'x@example.com', employeeCode: 'MC-001' }]);
  assert.deepEqual(
    result.rows.map((r) => [r.employee.email, r.employee.employeeCode]),
    [
      ['a@example.com', 'MC-011'],
      ['b@example.com', 'mc010'],
    ],
  );
  assert.equal(result.unmatched.length, 2);
  assert.match(result.unmatched[0].reason, /already belongs/);
  assert.match(result.unmatched[1].reason, /also used on line 3/);
});

test('quoted cells keep their commas and doubled quotes', () => {
  assert.deepEqual(splitCsvLine('a,"b, c","say ""hi""",d'), ['a', 'b, c', 'say "hi"', 'd']);
});

test('dates are day-first and must exist', () => {
  assert.equal(parseImportDate('03/04/2024'), '2024-04-03');
  assert.equal(parseImportDate('3-4-2024'), '2024-04-03');
  assert.equal(parseImportDate('2024-02-29'), '2024-02-29');
  assert.equal(parseImportDate('2023-02-29'), null);
  assert.equal(parseImportDate('April 3'), null);
});

test('amounts accept rupee signs and lakh grouping', () => {
  assert.equal(parseImportAmount('₹6,50,000'), 650000);
  assert.equal(parseImportAmount('Rs. 12000.50'), 12000.5);
  assert.equal(parseImportAmount('six lakh'), null);
});

test('templates never carry the demo policy ids, and monthly figures are derived', () => {
  for (const template of LEAVE_POLICY_TEMPLATES) {
    for (const policy of template.policies) {
      assert.match(policy.id, /^lp-tpl-/);
      if (policy.accrual === 'monthly') assert.equal(policy.annual, policy.monthlyAccrual * 12);
    }
    const types = template.policies.map((policy) => policy.type);
    assert.equal(new Set(types).size, types.length, `${template.id} repeats a leave type`);
  }
});

test('describeGrant reads as a sentence', () => {
  const monthly = LEAVE_POLICY_TEMPLATES[0].policies;
  assert.equal(describeGrant(monthly[0]), '1 day a month');
  assert.equal(describeGrant(monthly[2]), '15 days a year, after 12 months');
  assert.equal(describeGrant(monthly[3]), 'Unpaid — deducted from pay');
});
