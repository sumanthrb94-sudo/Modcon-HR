import { test } from 'node:test';
import assert from 'node:assert/strict';
import { financialYearMonths, projectTaxYear, type PaidMonth } from '../../src/data/tdsProjection.ts';
import { annualIncomeTax, monthlyTds } from '../../src/data/statutoryRules.ts';

const always = () => 1;

test('the financial year runs April to March', () => {
  const months = financialYearMonths('2026-10');
  assert.equal(months.length, 12);
  assert.equal(months[0], '2026-04');
  assert.equal(months[11], '2027-03');
  assert.deepEqual(financialYearMonths('2027-02'), months);
});

test('with nothing paid yet, a full-year employee is projected on twelve months', () => {
  const p = projectTaxYear({ month: '2026-04', currentGross: 100000, monthlyRate: 100000, employedShare: always, paid: new Map() });
  assert.equal(p.projectedAnnualSalary, 1200000);
  assert.equal(p.monthsRemaining, 12);
  assert.equal(p.alreadyDeducted, 0);
});

test('a constant salary withholds the year’s liability once, not three times', () => {
  // ₹1,50,000 a month under the new regime. The old wiring re-spread the whole
  // year over a shrinking count against a credit that never grew, and withheld
  // ₹4,67,965 over the year. Fed its own payslips, it must withhold the
  // liability and stop there.
  const paid = new Map<string, PaidMonth>();
  let total = 0;
  for (const month of financialYearMonths('2026-04')) {
    const p = projectTaxYear({ month, currentGross: 150000, monthlyRate: 150000, employedShare: always, paid });
    const annual = annualIncomeTax({ grossSalary: p.projectedAnnualSalary, regime: 'new' }).annualTax;
    const tds = monthlyTds({ annualTax: annual, monthsRemaining: p.monthsRemaining, alreadyDeducted: p.alreadyDeducted });
    paid.set(month, { gross: 150000, tax: tds });
    total += tds;
  }
  const liability = annualIncomeTax({ grossSalary: 1800000, regime: 'new' }).annualTax;
  assert.ok(Math.abs(total - liability) <= 12, `withheld ${total} against ${liability}`);
});

test('an October joiner is projected on the months they are employed, and owes nothing under the rebate', () => {
  const employedFromOct = (m: string) => (m >= '2026-10' ? 1 : 0);
  const p = projectTaxYear({ month: '2026-10', currentGross: 150000, monthlyRate: 150000, employedShare: employedFromOct, paid: new Map() });
  assert.equal(p.projectedAnnualSalary, 900000);
  assert.equal(p.monthsRemaining, 6);
  assert.equal(annualIncomeTax({ grossSalary: p.projectedAnnualSalary, regime: 'new' }).annualTax, 0);
});

test('a leaver’s final month is the last that remains, so it trues the year up', () => {
  const leavesInNov = (m: string) => (m <= '2026-11' ? 1 : 0);
  const p = projectTaxYear({ month: '2026-11', currentGross: 100000, monthlyRate: 100000, employedShare: leavesInNov, paid: new Map() });
  assert.equal(p.monthsRemaining, 1);
  assert.equal(p.projectedAnnualSalary, 800000);
});

test('months paid before go-live are estimated, and HR’s figure for them is credited', () => {
  const p = projectTaxYear({
    month: '2026-10',
    currentGross: 100000,
    monthlyRate: 100000,
    employedShare: always,
    paid: new Map(),
    taxDeductedOutside: 30000,
  });
  assert.equal(p.projectedAnnualSalary, 1200000);
  assert.equal(p.alreadyDeducted, 30000);
  assert.equal(p.monthsRemaining, 6);
});

test('a paid month counts what it actually paid, arrears included', () => {
  const paid = new Map<string, PaidMonth>([['2026-04', { gross: 130000, tax: 5000 }]]);
  const p = projectTaxYear({ month: '2026-05', currentGross: 100000, monthlyRate: 100000, employedShare: always, paid });
  assert.equal(p.projectedAnnualSalary, 130000 + 100000 * 11);
  assert.equal(p.alreadyDeducted, 5000);
});
