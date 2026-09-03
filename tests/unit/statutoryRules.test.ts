// Unit tests for the pure statutory arithmetic in src/data/statutoryRules.ts.
//
// Run: npm run test:unit
//
// The module under test imports nothing, deliberately: node's strip-types
// runner resolves neither the `@/*` alias nor firebase, so anything reaching
// for storage cannot be unit tested here. The storage wiring lives in
// src/data/statutory.ts and is covered end to end instead.
//
// What these assert is the arithmetic somebody's pay is computed from, so they
// are written as worked examples with the figure spelled out — a test that
// re-implements the function it is testing proves only that the code is
// self-consistent.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INDIA_STATUTORY_RATES,
  NO_STATUTORY_CONFIG,
  REFERENCE_PROFESSIONAL_TAX,
  annualIncomeTax,
  completedYears,
  epfContribution,
  esiContribution,
  establishmentAdminCharge,
  esiContributionPeriod,
  gratuity,
  monthlyTds,
  monthsLeftInFinancialYear,
  professionalTax,
  resolveMonthlyGross,
  roundUpRupee,
  slabTax,
  surchargeRate,
  wageFloorFinding,
  type ProfessionalTaxSchedule,
  type StatutoryConfig,
} from '../../src/data/statutoryRules.ts';

/** An organisation registered for everything, restricting PF to the ceiling. */
const REGISTERED: StatutoryConfig = {
  epf: { enabled: true, establishmentCode: 'KN/BNG/0012345', restrictToWageCeiling: true, employerShareInCtc: true },
  esi: { enabled: true, establishmentCode: '53000123450000' },
  professionalTax: { enabled: true, schedules: REFERENCE_PROFESSIONAL_TAX },
  incomeTax: { enabled: true, tan: 'BLRM12345C', defaultRegime: 'new' },
  enforceWageFloor: true,
};

const UNCAPPED: StatutoryConfig = {
  ...REGISTERED,
  epf: { ...REGISTERED.epf, restrictToWageCeiling: false },
};

// ---------------------------------------------------------------------------
// Nothing happens until an organisation says it should
// ---------------------------------------------------------------------------

test('an organisation that has declared nothing has nothing withheld', () => {
  assert.equal(epfContribution(50000, NO_STATUTORY_CONFIG), null);
  assert.equal(esiContribution(18000, NO_STATUTORY_CONFIG), null);
  // Null rather than zero on purpose. Zero is a computed figure and would be
  // rendered as "PF: ₹0", which reads as a contribution that happened to come
  // out at nothing. Null is "this organisation does not run PF", which every
  // surface has to say differently.
});

// ---------------------------------------------------------------------------
// EPF
// ---------------------------------------------------------------------------

test('EPF at the ceiling is the familiar 1,800 / 1,250 / 550', () => {
  const epf = epfContribution(15000, REGISTERED)!;
  assert.equal(epf.pfWages, 15000);
  assert.equal(epf.employee, 1800); // 12% of 15,000
  assert.equal(epf.employerPension, 1250); // 8.33% of 15,000
  assert.equal(epf.employerProvidentFund, 550); // the remainder of the 12%
  assert.equal(epf.employerTotal, 1800);
});

test('restricting to the ceiling caps a high earner at the ceiling figures', () => {
  const epf = epfContribution(60000, REGISTERED)!;
  assert.equal(epf.pfWages, 15000);
  assert.equal(epf.employee, 1800);
  assert.equal(epf.employerPension, 1250);
});

test('contributing on full wages deducts on the whole basic — but the pension share does not follow', () => {
  const epf = epfContribution(60000, UNCAPPED)!;
  assert.equal(epf.pfWages, 60000);
  assert.equal(epf.employee, 7200); // 12% of 60,000
  assert.equal(epf.employerTotal, 7200);
  // EPS is capped by statute whatever the establishment chooses, so it stays at
  // 8.33% of 15,000. Computing both from one ceiling is the bug this asserts
  // against: it would remit 8.33% of 60,000 to a scheme that will refuse it.
  assert.equal(epf.employerPension, 1250);
  assert.equal(epf.employerProvidentFund, 5950);
});

test('the two employer shares always sum to the employer total', () => {
  // Including the wages where rounding 8.33% and 12% independently disagrees.
  for (const wages of [1, 999, 3333, 7777, 12345, 15000, 15001, 48991, 100000]) {
    for (const config of [REGISTERED, UNCAPPED]) {
      const epf = epfContribution(wages, config)!;
      assert.equal(
        epf.employerPension + epf.employerProvidentFund,
        epf.employerTotal,
        `wages ${wages}, capped ${config.epf.restrictToWageCeiling}`,
      );
    }
  }
});

test('a member\'s admin charge is the percentage, with no floor', () => {
  // 0.5% of 5,000 is 25. The ₹75 minimum is the establishment's, not this
  // person's — applied here it would be charged once per employee and a ₹75
  // monthly floor would become ₹75 × headcount.
  assert.equal(epfContribution(5000, REGISTERED)!.adminCharge, 25);
  // The wage is capped first, so a 40,000 basic is charged on 15,000.
  assert.equal(epfContribution(40000, REGISTERED)!.adminCharge, 75);
  // Uncapped, the same wage charges on the whole 40,000.
  assert.equal(epfContribution(40000, UNCAPPED)!.adminCharge, 200);
});

test('the floor is the establishment\'s, charged once', () => {
  // Three members at ₹25 each is ₹75 of percentage — but so is one member at
  // ₹25, and that one still owes the floor.
  assert.equal(establishmentAdminCharge([25]), 75);
  assert.equal(establishmentAdminCharge([25, 25, 25]), 75);
  assert.equal(establishmentAdminCharge([200, 75, 75]), 350);
  // An establishment with nobody contributing files nothing and owes nothing.
  assert.equal(establishmentAdminCharge([]), 0);
  assert.equal(establishmentAdminCharge([0, 0]), 0);
});

test('an unpaid month costs the employer nothing at all', () => {
  const epf = epfContribution(0, REGISTERED)!;
  assert.equal(epf.employee, 0);
  assert.equal(epf.employerTotal, 0);
  assert.equal(epf.employerPension, 0);
  assert.equal(epf.employerProvidentFund, 0);
  // Including EDLI and the admin charge. Nobody is a contributing member on
  // nothing, and showing an employer a cost for a person their payroll did not
  // pay is a figure they cannot reconcile against anything.
  assert.equal(epf.edli, 0);
  assert.equal(epf.adminCharge, 0);
  assert.equal(epf.employerCost, 0);
});

// ---------------------------------------------------------------------------
// ESI
// ---------------------------------------------------------------------------

test('ESI covers a wage at the threshold and not one above it', () => {
  assert.equal(esiContribution(21000, REGISTERED)!.covered, true);
  assert.equal(esiContribution(21001, REGISTERED)!.covered, false);
  // The boundary belongs to coverage: the Act says "not exceeding".
});

test('ESI rounds both shares up to the next rupee', () => {
  const esi = esiContribution(18000, REGISTERED)!;
  assert.equal(esi.employee, 135); // 0.75% of 18,000 = 135 exactly
  assert.equal(esi.employer, 585); // 3.25% of 18,000 = 585 exactly

  const odd = esiContribution(17777, REGISTERED)!;
  // 0.75% of 17,777 is 133.3275 — remitted as 134, not 133.
  assert.equal(odd.employee, 134);
  // 3.25% is 577.7525 — 578.
  assert.equal(odd.employer, 578);
});

test('roundUpRupee does not push an exact rupee to the next one', () => {
  assert.equal(roundUpRupee(135), 135);
  assert.equal(roundUpRupee(135.0000000001), 135);
  assert.equal(roundUpRupee(135.01), 136);
});

test('a disability raises the coverage threshold', () => {
  assert.equal(esiContribution(24000, REGISTERED)!.covered, false);
  assert.equal(esiContribution(24000, REGISTERED, { hasDisability: true })!.covered, true);
});

test('the period override keeps somebody covered through a mid-period raise', () => {
  // Over the threshold this month, but they were covered when the period
  // opened, so they contribute until it closes.
  const esi = esiContribution(26000, REGISTERED, { coveredOverride: true })!;
  assert.equal(esi.covered, true);
  assert.equal(esi.employee, 195); // 0.75% of 26,000
});

test('the contribution periods are April–September and October–March', () => {
  assert.equal(esiContributionPeriod('2026-04'), 1);
  assert.equal(esiContributionPeriod('2026-09'), 1);
  assert.equal(esiContributionPeriod('2026-10'), 2);
  assert.equal(esiContributionPeriod('2027-03'), 2);
});

// ---------------------------------------------------------------------------
// Professional tax
// ---------------------------------------------------------------------------

const KARNATAKA = REFERENCE_PROFESSIONAL_TAX.find((s) => s.state === 'Karnataka')!;
const MAHARASHTRA = REFERENCE_PROFESSIONAL_TAX.find((s) => s.state === 'Maharashtra')!;

test('professional tax picks the band the month\'s gross falls in', () => {
  assert.equal(professionalTax(24999, KARNATAKA, '2026-06'), 0);
  assert.equal(professionalTax(25000, KARNATAKA, '2026-06'), 200);
  assert.equal(professionalTax(90000, KARNATAKA, '2026-06'), 200);
});

test('February is different where the state trues up to the annual ceiling', () => {
  assert.equal(professionalTax(30000, MAHARASHTRA, '2026-01'), 200);
  assert.equal(professionalTax(30000, MAHARASHTRA, '2026-02'), 300);
  // Somebody in the exempt band owes nothing to true up, so the override is
  // not applied to them — 300 in February on a salary that pays zero the rest
  // of the year would be a deduction with no basis.
  assert.equal(professionalTax(5000, MAHARASHTRA, '2026-02'), 0);
});

test('an organisation with no schedule for a state deducts nothing', () => {
  assert.equal(professionalTax(50000, null, '2026-06'), 0);
});

test('a state that has typed its own slabs is honoured as given', () => {
  const own: ProfessionalTaxSchedule = {
    state: 'Nowhere',
    slabs: [
      { upTo: 20000, amount: 0 },
      { upTo: null, amount: 175 },
    ],
    checkedAgainst: '2026-09',
  };
  assert.equal(professionalTax(19999, own, '2026-06'), 0);
  assert.equal(professionalTax(20001, own, '2026-06'), 175);
});

// ---------------------------------------------------------------------------
// Income tax
// ---------------------------------------------------------------------------

test('the slab scale taxes each band at its own rate', () => {
  const { slabs } = INDIA_STATUTORY_RATES.incomeTax.newRegime;
  // 4L free, then 5% of the next 4L.
  assert.equal(slabTax(800000, slabs), 20000);
  // ...then 10% of the next 4L.
  assert.equal(slabTax(1200000, slabs), 60000);
  assert.equal(slabTax(0, slabs), 0);
  assert.equal(slabTax(400000, slabs), 0);
});

test('a salary inside the rebate ceiling pays nothing under the new regime', () => {
  // 12,75,000 less the 75,000 standard deduction is exactly 12,00,000, which
  // is the rebate ceiling — so the slab tax of 60,000 is entirely rebated.
  const tax = annualIncomeTax({ grossSalary: 1275000, regime: 'new' });
  assert.equal(tax.taxableIncome, 1200000);
  assert.equal(tax.slabTax, 60000);
  assert.equal(tax.rebate, 60000);
  assert.equal(tax.annualTax, 0);
});

test('a rupee over the rebate ceiling is a cliff, and that cliff is the law\'s', () => {
  const over = annualIncomeTax({ grossSalary: 1275100, regime: 'new' });
  // Taxable 12,00,100 — over the ceiling, so no rebate at all.
  assert.equal(over.rebate, 0);
  assert.ok(over.annualTax > 60000, `expected a full liability, got ${over.annualTax}`);
  // Asserted deliberately: modelling §87A as a zero band instead of a rebate
  // would make this figure a few rupees rather than sixty-odd thousand, and
  // the difference lands on one employee's payslip.
});

test('cess is charged on the tax, not on the income', () => {
  const tax = annualIncomeTax({ grossSalary: 2000000, regime: 'new' });
  // 20,00,000 - 75,000 = 19,25,000 taxable.
  // 4L @0 + 4L @5% = 20,000; 4L @10% = 40,000; 4L @15% = 60,000;
  // 3,25,000 @20% = 65,000. Total 1,85,000. Cess 4% = 7,400.
  assert.equal(tax.taxableIncome, 1925000);
  assert.equal(tax.slabTax, 185000);
  assert.equal(tax.cess, 7400);
  assert.equal(tax.annualTax, 192400);
});

test('the old regime allows declared deductions and the new regime does not', () => {
  const old = annualIncomeTax({ grossSalary: 1200000, regime: 'old', otherDeductions: 150000 });
  assert.equal(old.standardDeduction, 50000);
  assert.equal(old.otherDeductions, 150000);
  assert.equal(old.taxableIncome, 1000000);

  const fresh = annualIncomeTax({ grossSalary: 1200000, regime: 'new', otherDeductions: 150000 });
  // Ignored rather than allowed. Silently allowing an 80C declaration under a
  // regime that does not permit it under-deducts all year and surfaces as a
  // demand on the employee.
  assert.equal(fresh.otherDeductions, 0);
  assert.equal(fresh.taxableIncome, 1125000);
});

test('the surcharge applies above fifty lakh', () => {
  assert.equal(surchargeRate(4999999, INDIA_STATUTORY_RATES), 0);
  assert.equal(surchargeRate(5000000, INDIA_STATUTORY_RATES), 0);
  assert.equal(surchargeRate(6000000, INDIA_STATUTORY_RATES), 10);
  assert.equal(surchargeRate(150000000, INDIA_STATUTORY_RATES), 25);

  const big = annualIncomeTax({ grossSalary: 8000000, regime: 'new' });
  assert.ok(big.surcharge > 0, 'a 80 lakh salary should attract a surcharge');
});

test('a salary below the standard deduction is not taxed into the negative', () => {
  const tax = annualIncomeTax({ grossSalary: 40000, regime: 'new' });
  assert.equal(tax.standardDeduction, 40000);
  assert.equal(tax.taxableIncome, 0);
  assert.equal(tax.annualTax, 0);
});

// ---------------------------------------------------------------------------
// Monthly TDS
// ---------------------------------------------------------------------------

test('the financial year runs April to March', () => {
  assert.equal(monthsLeftInFinancialYear('2026-04'), 12);
  assert.equal(monthsLeftInFinancialYear('2026-12'), 4);
  assert.equal(monthsLeftInFinancialYear('2027-03'), 1);
});

test('TDS spreads over the months that remain, not over twelve', () => {
  assert.equal(monthlyTds({ annualTax: 120000, monthsRemaining: 12 }), 10000);
  // Somebody who joined in October has six months for the whole year's tax.
  assert.equal(monthlyTds({ annualTax: 120000, monthsRemaining: 6 }), 20000);
});

test('what has already been withheld is credited against the rest of the year', () => {
  // Half the year gone at 10,000 a month, then a raise doubles the liability.
  assert.equal(
    monthlyTds({ annualTax: 240000, monthsRemaining: 6, alreadyDeducted: 60000 }),
    30000,
  );
});

test('an over-deduction does not produce a negative TDS', () => {
  assert.equal(
    monthlyTds({ annualTax: 50000, monthsRemaining: 3, alreadyDeducted: 90000 }),
    0,
  );
});

// ---------------------------------------------------------------------------
// Gratuity
// ---------------------------------------------------------------------------

test('a part-year over six months counts as a whole one', () => {
  assert.equal(completedYears('2020-01-01', '2024-12-31'), 5);
  // Four years and seven months rounds up...
  assert.equal(completedYears('2020-01-01', '2024-08-15'), 5);
  // ...and four years and five months does not.
  assert.equal(completedYears('2020-01-01', '2024-06-01'), 4);
});

test('gratuity is 15 days\' wages per year on a 26-day month', () => {
  const g = gratuity({ lastDrawnWages: 52000, joinedIso: '2018-04-01', leavingIso: '2028-04-01' });
  assert.equal(g.completedYears, 10);
  // 52,000 × 15 × 10 / 26 = 3,00,000.
  assert.equal(g.computed, 300000);
  assert.equal(g.payable, 300000);
});

test('a fixed-term employee qualifies at one year and a permanent one does not', () => {
  const input = { lastDrawnWages: 26000, joinedIso: '2025-01-01', leavingIso: '2026-06-01' };
  // Seventeen months: one completed year under either count.
  assert.equal(gratuity(input).qualifies, false);
  assert.equal(gratuity(input).payable, 0);

  const fixed = gratuity({ ...input, fixedTerm: true });
  assert.equal(fixed.qualifies, true);
  assert.equal(fixed.payable, 15000); // 26,000 × 15 × 1 / 26
  // This is the 2025 change, and a payroll written before it pays zero to
  // exactly the population it was made for.
});

test('gratuity is capped at the statutory ceiling', () => {
  const g = gratuity({ lastDrawnWages: 500000, joinedIso: '1995-01-01', leavingIso: '2026-01-01' });
  assert.ok(g.computed > 2000000);
  assert.equal(g.payable, 2000000);
});

test('a leaving date before the joining date is nobody\'s service', () => {
  assert.equal(completedYears('2026-01-01', '2020-01-01'), 0);
});

// ---------------------------------------------------------------------------
// The Code on Wages floor
// ---------------------------------------------------------------------------

test('Basic at half of total remuneration is exactly compliant', () => {
  const finding = wageFloorFinding({ wages: 25000, totalRemuneration: 50000 });
  assert.equal(finding.compliant, true);
  assert.equal(finding.wagePercent, 50);
  assert.equal(finding.shortfall, 0);
  assert.equal(finding.statutoryWages, 25000);
});

test('an allowance-heavy structure is reported, with the figure contributions are owed on', () => {
  // Basic 30% — lawful to pay, but the Code adds the excess back for PF and
  // gratuity, so contributions are owed on 50%.
  const finding = wageFloorFinding({ wages: 15000, totalRemuneration: 50000 });
  assert.equal(finding.compliant, false);
  assert.equal(finding.wagePercent, 30);
  assert.equal(finding.shortfall, 10000);
  assert.equal(finding.statutoryWages, 25000);
  // Reported, never applied automatically: recomputing everybody's PF on a
  // number the company never agreed to is the behaviour this codebase refuses
  // everywhere else. An administrator restructures, or contributes on this.
});

test('a zero salary is not a compliance failure', () => {
  const finding = wageFloorFinding({ wages: 0, totalRemuneration: 0 });
  assert.equal(finding.compliant, true);
  assert.equal(finding.wagePercent, 0);
  assert.equal(finding.shortfall, 0);
});

test('wages cannot exceed total remuneration', () => {
  const finding = wageFloorFinding({ wages: 90000, totalRemuneration: 50000 });
  assert.equal(finding.wagePercent, 100);
  assert.equal(finding.compliant, true);
});

// ---------------------------------------------------------------------------
// CTC and gross
// ---------------------------------------------------------------------------

/** Basic at half of gross, this app's demo split. */
const halfBasic = (gross: number) => Math.round(gross * 0.5);

test('an employer contributing on top leaves gross at CTC over twelve', () => {
  const onTop: StatutoryConfig = {
    ...REGISTERED,
    epf: { ...REGISTERED.epf, employerShareInCtc: false },
  };
  const resolved = resolveMonthlyGross({ monthlyCtc: 50000, config: onTop, wagesOf: halfBasic });
  assert.equal(resolved.grossEarnings, 50000);
  assert.equal(resolved.carvedFromCtc, false);
  // The cost is still reported — it is what the employer pays, it is just not
  // taken out of the salary.
  assert.ok(resolved.employerCost > 0);
});

test('an employer share inside the CTC comes out of gross', () => {
  const resolved = resolveMonthlyGross({
    monthlyCtc: 50000,
    config: REGISTERED,
    wagesOf: halfBasic,
  });
  assert.equal(resolved.carvedFromCtc, true);
  assert.ok(resolved.grossEarnings < 50000);
  // Gross plus what the employer pays plus the unspendable remainder is the
  // CTC exactly. If these do not reconcile, the company is paying more or less
  // than it budgeted and nothing on the payslip says so.
  assert.equal(
    resolved.grossEarnings + resolved.employerCost + resolved.ctcVariance,
    50000,
  );
});

test('the employer never spends more than the CTC, at any salary', () => {
  for (const monthlyCtc of [0, 8000, 12000, 15001, 25000, 50000, 83333, 250000, 1000000]) {
    const resolved = resolveMonthlyGross({ monthlyCtc, config: REGISTERED, wagesOf: halfBasic });
    assert.ok(
      resolved.grossEarnings + resolved.employerCost <= monthlyCtc,
      `ctc ${monthlyCtc}: spent ${resolved.grossEarnings + resolved.employerCost}`,
    );
    assert.equal(
      resolved.ctcVariance,
      monthlyCtc - resolved.grossEarnings - resolved.employerCost,
      `ctc ${monthlyCtc}`,
    );
  }
});

test('no gross above the one chosen would still fit', () => {
  // What "the highest gross that fits" means, asserted rather than assumed.
  // Every step rounds and the EPFO admin charge has a flat floor, so the cost
  // is a step function of gross and some CTCs have no exact solution at all —
  // 12,000 a month is one. Leaving a rupee unspent is the deliberate answer;
  // an oscillating fixed point returning whichever value it stopped on is not.
  const employerCostAt = (gross: number) => {
    const epf = epfContribution(halfBasic(gross), REGISTERED)!;
    const esi = esiContribution(gross, REGISTERED)!;
    return epf.employerCost + esi.employer;
  };

  for (const monthlyCtc of [12000, 25000, 50000, 83333]) {
    const { grossEarnings } = resolveMonthlyGross({
      monthlyCtc,
      config: REGISTERED,
      wagesOf: halfBasic,
    });
    const oneMore = grossEarnings + 1;
    assert.ok(
      oneMore + employerCostAt(oneMore) > monthlyCtc,
      `ctc ${monthlyCtc}: ${oneMore} would have fitted too`,
    );
  }
});

test('the variance is a rupee or two, not a rounding hole', () => {
  for (const monthlyCtc of [12000, 25000, 50000, 83333, 250000]) {
    const { ctcVariance } = resolveMonthlyGross({
      monthlyCtc,
      config: REGISTERED,
      wagesOf: halfBasic,
    });
    assert.ok(ctcVariance >= 0 && ctcVariance <= 5, `ctc ${monthlyCtc}: ${ctcVariance}`);
  }
});

test('with no scheme registered, gross is the CTC untouched', () => {
  const resolved = resolveMonthlyGross({
    monthlyCtc: 50000,
    config: NO_STATUTORY_CONFIG,
    wagesOf: halfBasic,
  });
  assert.equal(resolved.grossEarnings, 50000);
  assert.equal(resolved.employerCost, 0);
  // The point of the whole design: switching nothing on changes nothing.
});
