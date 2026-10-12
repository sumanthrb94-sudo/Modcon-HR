// Unit tests for the TDS credit and the mid-year projection in
// src/data/statutoryRules.ts.
//
// Run: npm run test:unit
//
// The defect these guard: every month recomputed the year's tax over the months
// left as though nothing had been withheld, so a ₹36 lakh CTC (₹6,63,000 tax)
// had ₹2,21,000 withheld in January, ₹3,31,500 in February and ₹6,63,000 in
// March — ₹12,15,500 against a liability of ₹6,63,000, and a negative March
// net pay.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  annualIncomeTax,
  monthlyTds,
  monthsEmployedInFinancialYear,
  monthsLeftInFinancialYear,
  taxWithheldEarlierInYear,
} from '../../src/data/statutoryRules.ts';

test('crediting what was withheld makes the year add up to the liability', () => {
  const annualTax = 663_000;
  const months = ['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'];
  const issued: { month: string; tax: number }[] = [];
  for (const month of months) {
    const tds = monthlyTds({
      annualTax,
      monthsRemaining: monthsLeftInFinancialYear(month),
      alreadyDeducted: taxWithheldEarlierInYear(issued, month),
    });
    issued.push({ month, tax: tds });
  }
  const total = issued.reduce((sum, p) => sum + p.tax, 0);
  assert.ok(Math.abs(total - annualTax) <= 12, `withheld ${total}, liability ${annualTax}`);
});

test('a January joiner is taxed on the three months they are paid, spread over those three', () => {
  const monthly = 300_000;
  const months = monthsEmployedInFinancialYear('2026-01', '2026-01-05');
  assert.equal(months, 3);
  const annualTax = annualIncomeTax({ grossSalary: monthly * months, regime: 'new' }).annualTax;
  const issued: { month: string; tax: number }[] = [];
  for (const month of ['2026-01', '2026-02', '2026-03']) {
    issued.push({
      month,
      tax: monthlyTds({ annualTax, monthsRemaining: monthsLeftInFinancialYear(month), alreadyDeducted: taxWithheldEarlierInYear(issued, month) }),
    });
  }
  const total = issued.reduce((sum, p) => sum + p.tax, 0);
  assert.ok(Math.abs(total - annualTax) <= 3);
  for (const p of issued) assert.ok(p.tax < monthly, `${p.month} withheld ${p.tax} of a ${monthly} salary`);
});

test('months employed: since April is twelve, mid-year counts from the joining month', () => {
  assert.equal(monthsEmployedInFinancialYear('2026-09', '2019-06-03'), 12);
  assert.equal(monthsEmployedInFinancialYear('2026-09', '2026-04-01'), 12);
  assert.equal(monthsEmployedInFinancialYear('2026-09', '2026-07-15'), 9);
  assert.equal(monthsEmployedInFinancialYear('2026-02', '2025-10-01'), 6);
  assert.equal(monthsEmployedInFinancialYear('2026-09', undefined), 12);
  assert.equal(monthsEmployedInFinancialYear('2026-09', 'not a date'), 12);
});

test('the credit ignores the month itself, other years, and a duplicate payslip', () => {
  const issued = [
    { month: '2026-03', tax: 9_000 }, // previous financial year
    { month: '2026-04', tax: 1_000 },
    { month: '2026-04', tax: 1_000 }, // same cycle twice
    { month: '2026-05', tax: 2_000 },
    { month: '2026-06', tax: 5_000 }, // the month being computed
  ];
  assert.equal(taxWithheldEarlierInYear(issued, '2026-06'), 3_000);
  assert.equal(taxWithheldEarlierInYear(issued, '2026-04'), 0);
});
