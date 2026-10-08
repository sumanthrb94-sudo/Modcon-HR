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

// The rows a simulated 22-person Pune contractor lost on its first upload.
// Each is ordinary in an Indian office; each is now imported with a note, or
// refused only where payroll would otherwise pay the wrong amount.
test("an office's real spreadsheet: mononyms, no email, Excel dates, blank DOB, LPA", () => {
  const csv = [
    'Emp ID,Name,Email ID,Designation,Department,Location,DOB,DOJ,CTC (Annual),Reporting Manager',
    'SE007,Raju,raju@example.com,Site Supervisor,Projects,Hinjewadi Site,01/01/1985,01/03/2016,"3,60,000",',
    'SE008,Ganesh Kale,,Helper,Projects,Hinjewadi Site,15/06/1990,01/09/2023,"1,80,000",',
    'SE009,Kavita Rao,kavita@example.com,Draughtsman,Design,Pune,12-Mar-1993,02/05/2020,"4,20,000",',
    'SE010,Sameer Khan,sameer@example.com,Purchase Officer,Purchase,Pune,,14/10/2018,"5,00,000",',
    'SE011,Neha Gupta,neha@example.com,Architect,Design,Pune,30/04/1992,01/12/2019,4.2 LPA,',
    'SE020,Snehal Jadhav,snehal@example.com,Intern,Projects,Pune,14/01/2004,01/09/2026,15000,',
  ].join('\n');
  const result = parse(csv);
  assert.equal(result.fileError, null);
  const byCode = new Map(result.rows.map((r) => [r.employee.employeeCode, r]));

  assert.equal(byCode.get('SE007')?.employee.lastName, '');
  assert.equal(byCode.get('SE008')?.employee.email, '');
  assert.match(byCode.get('SE008')!.notes.join(' '), /not have a login/);
  assert.equal(byCode.get('SE009')?.employee.dateOfBirth, '1993-03-12');
  assert.equal(byCode.get('SE010')?.employee.dateOfBirth, '');
  assert.match(byCode.get('SE010')!.notes.join(' '), /date of birth/i);
  assert.equal(byCode.get('SE011')?.employee.ctc, 420000);

  // The intern's monthly stipend in the annual column is refused, not paid at a twelfth.
  assert.equal(byCode.has('SE020'), false);
  assert.match(result.unmatched[0].reason, /looks like a monthly figure/);
  assert.match(result.unmatched[0].reason, /1,80,000/);
});

test('a shared email gives one person the login and says how to add the other', () => {
  const csv = [HEADER, row({ email: 'info@example.com' }), row({ email: 'info@example.com', first_name: 'Rohit' })].join('\n');
  const result = parse(csv);
  assert.equal(result.rows.length, 1);
  assert.match(result.unmatched[0].reason, /leave it blank/);
  // Two people with no email at all are not a duplicate.
  const blank = parse([HEADER, row({ email: '' }), row({ email: '', first_name: 'Rohit' })].join('\n'));
  assert.equal(blank.rows.length, 2);
});

test('reporting managers are resolved from the file and the directory, never guessed', () => {
  const csv = [
    'name,email,designation,department,location,doj,ctc,code,reporting manager',
    'Anil Deshpande,anil@example.com,Project Manager,Projects,Pune,2012-01-10,1800000,SE003,Rajesh Sharma',
    'Vikram Joshi,vikram@example.com,Site Engineer,Projects,Pune,2021-02-05,600000,SE005,Anil Deshpande',
    'Pooja Iyer,pooja@example.com,Site Engineer,Projects,Pune,2022-07-11,540000,SE006,anil@example.com',
    'Imran Q,imran@example.com,Electrician,Projects,Pune,2020-11-20,288000,SE019,SE005',
    'Somebody,some@example.com,Clerk,Admin,Pune,2020-11-20,288000,SE030,Nobody Known',
    'Twin A,twa@example.com,Clerk,Admin,Pune,2020-11-20,288000,SE031,Ravi Kumar',
    'Self,self@example.com,Clerk,Admin,Pune,2020-11-20,288000,SE032,SE032',
  ].join('\n');
  const existing = [
    { id: 'emp-001', email: 'rajesh@example.com', employeeCode: 'SE001', fullName: 'Rajesh Sharma' },
    { id: 'emp-050', email: 'r1@example.com', employeeCode: 'X1', fullName: 'Ravi Kumar' },
    { id: 'emp-051', email: 'r2@example.com', employeeCode: 'X2', fullName: 'Ravi Kumar' },
  ];
  const result = parse(csv, existing);
  const byCode = new Map(result.rows.map((r) => [r.employee.employeeCode, r]));
  assert.deepEqual(byCode.get('SE003')?.manager, { kind: 'directory', id: 'emp-001' });
  assert.deepEqual(byCode.get('SE005')?.manager, { kind: 'file', line: 2 });
  assert.deepEqual(byCode.get('SE006')?.manager, { kind: 'file', line: 2 });
  assert.deepEqual(byCode.get('SE019')?.manager, { kind: 'file', line: 3 });
  assert.equal(byCode.get('SE030')?.manager, undefined);
  assert.match(byCode.get('SE030')!.notes.join(' '), /not among the people/);
  assert.match(byCode.get('SE031')!.notes.join(' '), /more than one person/);
  assert.match(byCode.get('SE032')!.notes.join(' '), /own reporting manager/);
});

test('statutory identifiers are kept when valid and left off, with a note, when not', () => {
  const csv = [
    'name,email,designation,department,location,doj,ctc,pan,uan,bank a/c no,ifsc code',
    'Asha Rao,asha@example.com,Clerk,Admin,Pune,2020-01-01,300000,abcde1234f,1001 2345 6789,1234-5678-9012,sbin0001234',
    'Bad Ids,bad@example.com,Clerk,Admin,Pune,2020-01-01,300000,ABC123,99,12,SBIN1234',
  ].join('\n');
  const [good, bad] = parse(csv).rows;
  assert.deepEqual(
    [good.employee.pan, good.employee.uan, good.employee.bankAccountNumber, good.employee.bankIfsc],
    ['ABCDE1234F', '100123456789', '123456789012', 'SBIN0001234'],
  );
  assert.equal(bad.employee.pan, undefined);
  assert.equal(bad.employee.bankIfsc, undefined);
  assert.equal(bad.notes.filter((note) => /PAN|UAN|Bank account|IFSC/.test(note)).length, 4);
});

test('lakh shorthand and Excel month names', () => {
  assert.equal(parseImportAmount('4.2 LPA'), 420000);
  assert.equal(parseImportAmount('12 lakhs'), 1200000);
  assert.equal(parseImportAmount('₹ 3.5L'), 350000);
  assert.equal(parseImportDate('12-Mar-1993'), '1993-03-12');
  assert.equal(parseImportDate('5 September 2024'), '2024-09-05');
  assert.equal(parseImportDate('31-Feb-2024'), null);
  assert.equal(parseImportDate('12-Mar-93'), null);
});
