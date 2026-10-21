import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loanRecovery, outstandingOn, type Loan } from '../../src/data/loanRules.ts';

const loan: Loan = { id: 'l1', employeeId: 'e1', label: 'Salary advance', principal: 25000, emi: 10000, startMonth: '2026-10', givenOn: '2026-09-20' };

test('nothing is recovered before the start month', () => {
  assert.equal(loanRecovery(loan, '2026-09', 0), 0);
});

test('the EMI each month, and only what is left at the end', () => {
  assert.equal(loanRecovery(loan, '2026-10', 0), 10000);
  assert.equal(loanRecovery(loan, '2026-11', 10000), 10000);
  assert.equal(loanRecovery(loan, '2026-12', 20000), 5000);
  assert.equal(loanRecovery(loan, '2027-01', 25000), 0);
  assert.equal(outstandingOn(loan, 20000), 5000);
});
