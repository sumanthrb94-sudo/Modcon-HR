// Unit tests for leave taken before go-live — src/data/openingLeaveCsv.ts.
//
// Run: npm run test:unit

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseOpeningLeaveCsv } from '../../src/data/openingLeaveCsv.ts';

const people = [
  { id: 'emp-001', employeeCode: 'SE001', fullName: 'Rajesh Sharma' },
  { id: 'emp-004', employeeCode: 'SE-005', fullName: 'Vikram Joshi' },
];
const types = ['Casual', 'Sick', 'Earned'];
const normalize = (raw: string) => raw.trim().replace(/\s+leave$/i, '').replace(/^./, (c) => c.toUpperCase());

test('rows are matched by code and type, header and blank lines skipped', () => {
  const csv = '﻿employee_code,leave_type,days_taken\nse001,Casual Leave,3\n\nSE005,sick,1.5\n';
  const { matched, unmatched } = parseOpeningLeaveCsv(csv, people, types, normalize);
  assert.deepEqual(unmatched, []);
  assert.deepEqual(
    matched.map((m) => [m.employee.id, m.typeKey, m.days]),
    [['emp-001', 'Casual', 3], ['emp-004', 'Sick', 1.5]],
  );
});

test('every unusable row is reported with its reason', () => {
  const csv = [
    'SE999,Casual,2',
    'SE001,Bereavement,1',
    'SE001,Casual,-1',
    'SE001,Casual,1.25',
    'SE001,Earned',
    'SE001,Sick,2',
    'SE001,Sick,1',
  ].join('\n');
  const { matched, unmatched } = parseOpeningLeaveCsv(csv, people, types, normalize);
  assert.deepEqual(matched.map((m) => m.line), [6]);
  assert.deepEqual(unmatched.map((m) => m.line), [1, 2, 3, 4, 5, 7]);
  assert.match(unmatched[0].reason, /No employee with code SE999/);
  assert.match(unmatched[1].reason, /not a leave type/);
  assert.match(unmatched[2].reason, /0 or more/);
  assert.match(unmatched[3].reason, /half days/);
  assert.match(unmatched[4].reason, /three columns/);
  assert.match(unmatched[5].reason, /also on line 6/);
});
