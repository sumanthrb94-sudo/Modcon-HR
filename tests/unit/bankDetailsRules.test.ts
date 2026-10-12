import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskAccountNumber, validateBankDetails } from '../../src/data/bankDetailsRules.ts';

const good = {
  accountHolderName: '  Meera   Iyer ',
  accountNumber: '1234 5678 9012',
  confirmAccountNumber: '123456789012',
  ifsc: 'hdfc0001234',
  bankName: 'HDFC Bank',
};

test('tidies spaces and case, and accepts a well-formed entry', () => {
  const r = validateBankDetails(good);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.accountHolderName, 'Meera Iyer');
    assert.equal(r.value.accountNumber, '123456789012');
    assert.equal(r.value.ifsc, 'HDFC0001234');
  }
});

test('refuses a mistyped confirmation — one wrong digit pays somebody else', () => {
  const r = validateBankDetails({ ...good, confirmAccountNumber: '123456789013' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.confirmAccountNumber);
});

test('refuses account numbers outside 9–18 digits, and letters', () => {
  for (const n of ['12345678', '1234567890123456789', '12345ABC9012']) {
    const r = validateBankDetails({ ...good, accountNumber: n, confirmAccountNumber: n });
    assert.equal(r.ok, false, n);
  }
});

test('refuses an IFSC without the zero in fifth place', () => {
  const r = validateBankDetails({ ...good, ifsc: 'HDFC1001234' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.ifsc);
});

test('requires a name on the account', () => {
  const r = validateBankDetails({ ...good, accountHolderName: '   ' });
  assert.equal(r.ok, false);
});

test('masks all but the last four digits', () => {
  assert.equal(maskAccountNumber('123456789012'), '•••• 9012');
});
