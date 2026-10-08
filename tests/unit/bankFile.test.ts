import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bankTransferFile } from '../../src/data/bankFile.ts';

test('pays everyone with usable details and lists everyone else with why', () => {
  const file = bankTransferFile([
    { employeeCode: 'SE001', name: 'Meera Sharma', accountNumber: '1234 5678 9012', ifsc: 'hdfc0001234', amount: 45_000.4 },
    { employeeCode: 'SE002', name: 'Anil, Kumar', accountNumber: '99887766', ifsc: 'SBIN0000123', amount: 30_000 },
    { employeeCode: 'SE003', name: 'Vikram', amount: 22_000 },
    { employeeCode: 'SE004', name: 'Ravi', accountNumber: '12345678', ifsc: 'BAD', amount: 18_000 },
    { employeeCode: 'SE005', name: 'Zero', accountNumber: '12345678', ifsc: 'SBIN0000123', amount: 0 },
  ], 'Salary Oct 2026');
  assert.equal(file.included, 2);
  assert.equal(file.total, 75_000);
  assert.deepEqual(file.excluded.map((e) => [e.employeeCode, e.reason]), [
    ['SE003', 'No bank account recorded'],
    ['SE004', 'IFSC does not look right'],
    ['SE005', 'Nothing to pay this month'],
  ]);
  const lines = file.csv.trim().split('\n');
  assert.equal(lines[1], 'Meera Sharma,123456789012,HDFC0001234,45000,Salary Oct 2026,SE001');
  // A comma inside a name is quoted, not allowed to shift the columns.
  assert.equal(lines[2], '"Anil, Kumar",99887766,SBIN0000123,30000,Salary Oct 2026,SE002');
});
