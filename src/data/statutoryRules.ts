// ===========================================================================
// Indian statutory payroll: the arithmetic.
//
// This module imports nothing, and must go on importing nothing. It is the
// half of the statutory feature that can be unit tested (`npm run test:unit`)
// under node's strip-types runner, which resolves neither the `@/*` alias nor
// firebase. Everything that reaches for storage — the org_settings registry,
// the localStorage cache, the change event — lives in data/statutory.ts.
//
// The same split as shiftRules.ts and geofenceRules.ts, and for the same
// reason: money arithmetic that nobody can run in a second is money arithmetic
// nobody checks.
//
// ---------------------------------------------------------------------------
// What is a platform constant here, and what is not
//
// Everywhere else in this app, a plausible default is worse than none: an
// unset salary structure shows "not set" rather than Basic 50%, because a
// company shown a number it did not choose reads it as its own policy.
//
// Statutory rates are the opposite case. 12% EPF is not ModCon Builders'
// opinion, it is the Employees' Provident Funds Act, and asking each customer
// to type it in would be asking them to re-derive the law — and to get it
// wrong. So the rates ARE shipped, as `INDIA_STATUTORY_RATES`.
//
// What is NOT shipped is whether a scheme applies to a given organisation.
// Registration under EPF, ESI, professional tax and TDS depends on headcount,
// state and business, and an app that assumed any of them would either withhold
// money from people it should not, or quietly under-deduct and leave the
// employer liable. So every scheme is off until an administrator declares the
// registration, and an organisation that declares nothing gets exactly the
// behaviour this app had before this module existed: gross minus unpaid
// absence, and nothing else.
//
// Rates carry the year they were last checked (`effectiveFrom`,
// `checkedAgainst`) so a stale figure is visible as a stale figure rather than
// as an authoritative one. Settings shows it.
// ===========================================================================

// ---------------------------------------------------------------------------
// Rates and thresholds
// ---------------------------------------------------------------------------

/** One slab of a progressive scale: `upTo` is inclusive; null is "and above". */
export interface TaxSlab {
  readonly upTo: number | null;
  readonly rate: number;
}

/** A professional-tax slab: a flat monthly amount, not a rate. */
export interface ProfessionalTaxSlab {
  /** Monthly gross up to and including this figure, or null for "and above". */
  readonly upTo: number | null;
  /** Rupees deducted in a month whose gross falls in this band. */
  readonly amount: number;
}

/**
 * One state's professional tax.
 *
 * `februaryAmount` exists because Maharashtra deducts a different figure in the
 * last month of the year to make the annual total ₹2,500 — the statutory
 * ceiling on professional tax under Article 276 of the Constitution. Modelled
 * rather than averaged, because a payslip has to show what was actually taken.
 */
export interface ProfessionalTaxSchedule {
  readonly state: string;
  readonly slabs: readonly ProfessionalTaxSlab[];
  /** Overrides the slab amount in February, where the state does that. */
  readonly februaryAmount?: number;
  /** When this table was last checked against the state's notification. */
  readonly checkedAgainst: string;
}

export interface StatutoryRates {
  readonly epf: {
    /** Employee's share of PF wages. */
    readonly employeePercent: number;
    /** Employer's total share of PF wages, of which EPS is carved out first. */
    readonly employerPercent: number;
    /** The pension share, taken from the employer's total. */
    readonly pensionPercent: number;
    /**
     * The statutory wage ceiling. EPS is *always* computed on wages capped
     * here; whether EPF itself is capped is the organisation's choice, because
     * an establishment may contribute on full wages and many do.
     */
    readonly wageCeiling: number;
    /** Employer-borne, on PF wages. Not deducted from anybody's salary. */
    readonly adminChargePercent: number;
    /**
     * The EPFO's floor on the admin charge — **per establishment per month**,
     * not per member.
     *
     * Applied per payslip it would charge ₹75 for somebody on ₹5,000 whose
     * actual 0.5% is ₹25, and ₹75 again for the next thirty people, turning a
     * ₹75 monthly floor into a ₹2,250 one. So `epfContribution` charges the
     * percentage only and this figure is for whoever aggregates the
     * establishment's remittance to apply once — see `establishmentAdminCharge`.
     */
    readonly adminChargeMinimum: number;
    /** Employees' Deposit Linked Insurance, employer-borne, capped wages. */
    readonly edliPercent: number;
  };
  readonly esi: {
    readonly employeePercent: number;
    readonly employerPercent: number;
    /** Monthly gross at or below which an employee is covered. */
    readonly wageThreshold: number;
    /** The higher threshold for an employee with a disability. */
    readonly disabilityWageThreshold: number;
  };
  readonly gratuity: {
    /** Days of wages per completed year: the statutory 15/26. */
    readonly daysPerYear: number;
    readonly monthlyWorkingDays: number;
    /** Years of service before the entitlement arises, for a permanent role. */
    readonly qualifyingYears: number;
    /**
     * Years for a fixed-term employee. One, since the 2025 change — a
     * fixed-term worker no longer has to reach five to qualify, which is the
     * single change most likely to be missed by a payroll built before it.
     */
    readonly fixedTermQualifyingYears: number;
    /** The statutory ceiling on an exempt gratuity payment. */
    readonly ceiling: number;
  };
  readonly incomeTax: {
    readonly newRegime: {
      readonly slabs: readonly TaxSlab[];
      readonly standardDeduction: number;
      /** Total income at or below which §87A leaves nothing payable. */
      readonly rebateIncomeCeiling: number;
      readonly rebateCeiling: number;
    };
    readonly oldRegime: {
      readonly slabs: readonly TaxSlab[];
      readonly standardDeduction: number;
      readonly rebateIncomeCeiling: number;
      readonly rebateCeiling: number;
    };
    /** Health and education cess, applied to tax plus surcharge. */
    readonly cessPercent: number;
    /** Surcharge bands on total income, applied to the tax before cess. */
    readonly surcharge: readonly TaxSlab[];
  };
  /** The financial year these figures were read for. */
  readonly effectiveFrom: string;
  /** When somebody last checked them. Shown in Settings; keep it honest. */
  readonly checkedAgainst: string;
}

/**
 * The rates as at the date in `checkedAgainst`.
 *
 * **These need a maintainer.** A rate that has moved is worse than a rate that
 * is missing, because a payslip computed on last year's slab looks exactly like
 * a payslip computed on this year's. The date is rendered in Settings → Payroll
 * Compliance beside every figure derived from it, so an administrator can see
 * how old the table is without reading this file.
 *
 * The income-tax slabs are the default (new) regime under the Income-tax Act
 * 2025 as it stood for FY 2025-26. The old regime is retained because an
 * employee who elected it before the switch keeps it, and payroll has to be
 * able to compute what it is actually deducting.
 */
export const INDIA_STATUTORY_RATES: StatutoryRates = {
  epf: {
    employeePercent: 12,
    employerPercent: 12,
    pensionPercent: 8.33,
    wageCeiling: 15000,
    adminChargePercent: 0.5,
    adminChargeMinimum: 75,
    edliPercent: 0.5,
  },
  esi: {
    employeePercent: 0.75,
    employerPercent: 3.25,
    wageThreshold: 21000,
    disabilityWageThreshold: 25000,
  },
  gratuity: {
    daysPerYear: 15,
    monthlyWorkingDays: 26,
    qualifyingYears: 5,
    fixedTermQualifyingYears: 1,
    ceiling: 2000000,
  },
  incomeTax: {
    newRegime: {
      slabs: [
        { upTo: 400000, rate: 0 },
        { upTo: 800000, rate: 5 },
        { upTo: 1200000, rate: 10 },
        { upTo: 1600000, rate: 15 },
        { upTo: 2000000, rate: 20 },
        { upTo: 2400000, rate: 25 },
        { upTo: null, rate: 30 },
      ],
      standardDeduction: 75000,
      rebateIncomeCeiling: 1200000,
      rebateCeiling: 60000,
    },
    oldRegime: {
      slabs: [
        { upTo: 250000, rate: 0 },
        { upTo: 500000, rate: 5 },
        { upTo: 1000000, rate: 20 },
        { upTo: null, rate: 30 },
      ],
      standardDeduction: 50000,
      rebateIncomeCeiling: 500000,
      rebateCeiling: 12500,
    },
    cessPercent: 4,
    surcharge: [
      { upTo: 5000000, rate: 0 },
      { upTo: 10000000, rate: 10 },
      { upTo: 20000000, rate: 15 },
      { upTo: null, rate: 25 },
    ],
  },
  effectiveFrom: '2025-04-01',
  checkedAgainst: '2026-09',
};

/**
 * Reference professional-tax schedules.
 *
 * Shipped as a **starting point an administrator confirms**, not as the answer.
 * Professional tax is a state levy, the notifications move independently, and
 * this app cannot know which of them is current where a company actually
 * operates. So Settings presents the state's table for editing with the
 * `checkedAgainst` date beside it, and an organisation whose state is not here
 * types its own slabs — which is why `professionalTax` takes a schedule rather
 * than a state name.
 *
 * Deliberately not exhaustive. A half-remembered table for a state nobody
 * checked is worse than no table, because it is indistinguishable from a
 * checked one.
 */
export const REFERENCE_PROFESSIONAL_TAX: readonly ProfessionalTaxSchedule[] = [
  {
    state: 'Karnataka',
    slabs: [
      { upTo: 24999, amount: 0 },
      { upTo: null, amount: 200 },
    ],
    checkedAgainst: '2026-09',
  },
  {
    state: 'Maharashtra',
    slabs: [
      { upTo: 7500, amount: 0 },
      { upTo: 10000, amount: 175 },
      { upTo: null, amount: 200 },
    ],
    // ₹300 in February brings the year to the ₹2,500 constitutional ceiling.
    februaryAmount: 300,
    checkedAgainst: '2026-09',
  },
  {
    state: 'West Bengal',
    slabs: [
      { upTo: 10000, amount: 0 },
      { upTo: 15000, amount: 110 },
      { upTo: 25000, amount: 130 },
      { upTo: 40000, amount: 150 },
      { upTo: null, amount: 200 },
    ],
    checkedAgainst: '2026-09',
  },
  {
    state: 'Telangana',
    slabs: [
      { upTo: 15000, amount: 0 },
      { upTo: 20000, amount: 150 },
      { upTo: null, amount: 200 },
    ],
    checkedAgainst: '2026-09',
  },
  {
    state: 'Andhra Pradesh',
    slabs: [
      { upTo: 15000, amount: 0 },
      { upTo: 20000, amount: 150 },
      { upTo: null, amount: 200 },
    ],
    checkedAgainst: '2026-09',
  },
  {
    state: 'Gujarat',
    slabs: [
      { upTo: 12000, amount: 0 },
      { upTo: null, amount: 200 },
    ],
    checkedAgainst: '2026-09',
  },
];

// ---------------------------------------------------------------------------
// What an organisation has declared
// ---------------------------------------------------------------------------

/**
 * Which regime an employee's tax is computed under.
 *
 * `null` means they have not elected one, which is a real state and not the
 * same as choosing the default: an employer who has not collected the election
 * has not collected the investment declarations either, so the old regime
 * cannot be computed and the new one is what applies by law. `resolveRegime`
 * makes that explicit rather than leaving `??` at four call sites.
 */
export type TaxRegime = 'new' | 'old';

export interface StatutoryConfig {
  /**
   * EPF. Off until an establishment code is recorded, because a contribution
   * deducted from somebody's pay and not remitted anywhere is worse than one
   * not deducted at all.
   */
  readonly epf: {
    readonly enabled: boolean;
    /** The establishment's EPFO code. Appears on the ECR. */
    readonly establishmentCode: string;
    /**
     * Whether contributions are limited to the ₹15,000 statutory ceiling.
     *
     * A real choice, not a detail: restricting to the ceiling caps the
     * employee's deduction at ₹1,800 however much they earn, while
     * contributing on full wages deducts 12% of the whole basic. Both are
     * lawful and organisations do both, so this app cannot pick.
     */
    readonly restrictToWageCeiling: boolean;
    /**
     * Whether the employer's share is inside the CTC the employee was offered.
     *
     * Decides whether enabling EPF reduces net pay by 12% (employer share
     * carved out of the same CTC) or costs the employer 12% more. It changes
     * nobody's deduction; it changes what gross the deduction is taken from.
     */
    readonly employerShareInCtc: boolean;
  };
  readonly esi: {
    readonly enabled: boolean;
    readonly establishmentCode: string;
  };
  readonly professionalTax: {
    readonly enabled: boolean;
    /** The schedules this organisation deducts under, one per state. */
    readonly schedules: readonly ProfessionalTaxSchedule[];
    /**
     * Which state each work location is in.
     *
     * Professional tax is levied by the state somebody works in, and this app's
     * work locations are names ("Bengaluru HQ", "Site 3") with no state on
     * them. Rather than migrate the location model — a location is a string in
     * `customLocations` and on every employee record — the mapping lives here,
     * beside the schedules it selects. An unmapped location deducts nothing,
     * which is the direction a missing answer has to fail: another state's
     * slab is simply a wrong deduction.
     */
    readonly stateByLocation: Readonly<Record<string, string>>;
  };
  readonly incomeTax: {
    readonly enabled: boolean;
    /** The employer's TAN. Required on Form 138 and on every challan. */
    readonly tan: string;
    /** Applied to anybody who has not elected a regime. */
    readonly defaultRegime: TaxRegime;
  };
  /**
   * Whether to warn when Basic falls below the Code on Wages floor.
   *
   * Separable from the schemes above because it is a check rather than a
   * deduction, and an organisation may want the warning while it is still
   * deciding whether to register.
   */
  readonly enforceWageFloor: boolean;
}

/** An organisation that has declared nothing: every scheme off. */
export const NO_STATUTORY_CONFIG: StatutoryConfig = {
  epf: { enabled: false, establishmentCode: '', restrictToWageCeiling: true, employerShareInCtc: true },
  esi: { enabled: false, establishmentCode: '' },
  professionalTax: { enabled: false, schedules: [], stateByLocation: {} },
  incomeTax: { enabled: false, tan: '', defaultRegime: 'new' },
  enforceWageFloor: true,
};

// ---------------------------------------------------------------------------
// Rounding
// ---------------------------------------------------------------------------

/** A finite non-negative number, or 0. Rejects NaN, Infinity and negatives. */
function safe(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Round up to the next whole rupee.
 *
 * ESIC's own rule for both shares, and it is not a nicety: contributions are
 * remitted in whole rupees and a half-paisa rounded down across a payroll is a
 * short remittance the employer answers for.
 */
export function roundUpRupee(value: number): number {
  return Math.ceil(safe(value) - 1e-9);
}

/** Round to the nearest whole rupee. EPF's convention. */
export function roundRupee(value: number): number {
  return Math.round(safe(value));
}

// ---------------------------------------------------------------------------
// Employees' Provident Fund
// ---------------------------------------------------------------------------

export interface EpfContribution {
  /** The wages the contribution was computed on, after any ceiling. */
  readonly pfWages: number;
  /** Deducted from the employee's pay. */
  readonly employee: number;
  /** The employer's pension share — always computed on the capped wage. */
  readonly employerPension: number;
  /** The rest of the employer's 12%, credited to the PF account. */
  readonly employerProvidentFund: number;
  /** Pension plus provident fund: the employer's 12%. */
  readonly employerTotal: number;
  /** EDLI premium, employer-borne, on the capped wage. */
  readonly edli: number;
  /**
   * This member's share of the EPFO administration charge: the percentage, with
   * no floor. The floor is the establishment's — see `establishmentAdminCharge`.
   */
  readonly adminCharge: number;
  /** Everything the employer pays over and above the employee's own share. */
  readonly employerCost: number;
}

/**
 * One month's EPF for one employee.
 *
 * `wages` is PF wages — basic plus dearness allowance plus retaining allowance,
 * which in this app is the Basic component of the salary structure. HRA is
 * excluded by the Act; the Supreme Court's 2019 decision brought most other
 * allowances in where they are paid universally, which is a determination about
 * a particular pay structure and not something a formula can make. So the
 * caller decides what `wages` is and this computes on it.
 *
 * Two ceilings, and they are not the same ceiling:
 *
 *   - **EPS is always capped at ₹15,000.** The pension scheme's ceiling is
 *     statutory and an establishment cannot contribute above it, so the pension
 *     share is at most ₹1,250 whatever anybody earns.
 *   - **EPF may or may not be capped**, which is the establishment's choice
 *     (`restrictToWageCeiling`). Restricting caps the employee's deduction at
 *     ₹1,800; not restricting deducts 12% of the whole Basic.
 *
 * Computing both from one ceiling — the mistake this comment exists to
 * prevent — either under-deducts PF for a well-paid employee or over-remits to
 * a pension scheme that will refuse it.
 */
export function epfContribution(
  wages: number,
  config: StatutoryConfig,
  rates: StatutoryRates = INDIA_STATUTORY_RATES,
): EpfContribution | null {
  if (!config.epf.enabled) return null;

  const gross = safe(wages);
  const { wageCeiling } = rates.epf;
  const pfWages = config.epf.restrictToWageCeiling ? Math.min(gross, wageCeiling) : gross;
  const pensionWages = Math.min(gross, wageCeiling);

  // Nobody is a contributing member on nothing. Without this the admin charge
  // and EDLI would still be levied for an unpaid month, and the employer would
  // be shown a cost for a person their payroll did not pay.
  if (pfWages === 0) {
    return {
      pfWages: 0,
      employee: 0,
      employerPension: 0,
      employerProvidentFund: 0,
      employerTotal: 0,
      edli: 0,
      adminCharge: 0,
      employerCost: 0,
    };
  }

  const employee = roundRupee(pfWages * (rates.epf.employeePercent / 100));
  const employerPension = roundRupee(pensionWages * (rates.epf.pensionPercent / 100));
  const employerTotal = roundRupee(pfWages * (rates.epf.employerPercent / 100));
  // The provident-fund half is the remainder, so the two always sum to the
  // employer's 12% exactly — including the rupee that rounding 8.33% leaves.
  // Floored at zero: on a very low wage the rounded pension share can exceed
  // the rounded total, and a negative credit is not a thing.
  const employerProvidentFund = Math.max(0, employerTotal - employerPension);

  const edli = roundRupee(pensionWages * (rates.epf.edliPercent / 100));
  const adminCharge = roundRupee(pfWages * (rates.epf.adminChargePercent / 100));

  return {
    pfWages,
    employee,
    employerPension,
    employerProvidentFund,
    employerTotal,
    edli,
    adminCharge,
    employerCost: employerTotal + edli + adminCharge,
  };
}

/**
 * The establishment's EPFO administration charge for a month.
 *
 * The floor lives here rather than in `epfContribution` because it is a floor
 * on the *establishment's* remittance. Charged per member it would multiply by
 * headcount — thirty people on low wages would pay thirty times a floor that
 * exists once — which overstates the employer's cost by more than the charge
 * itself.
 *
 * `memberCharges` is every contributing member's percentage share for the
 * month. An establishment with no contributing members owes nothing, floor
 * included: the minimum applies to a return that is being filed, not to one
 * that is not.
 */
export function establishmentAdminCharge(
  memberCharges: readonly number[],
  rates: StatutoryRates = INDIA_STATUTORY_RATES,
): number {
  const charged = memberCharges.filter((amount) => safe(amount) > 0);
  if (charged.length === 0) return 0;
  const total = charged.reduce((sum, amount) => sum + safe(amount), 0);
  return Math.max(rates.epf.adminChargeMinimum, roundRupee(total));
}

// ---------------------------------------------------------------------------
// Employees' State Insurance
// ---------------------------------------------------------------------------

export interface EsiContribution {
  readonly covered: boolean;
  /** The gross the contribution was computed on. */
  readonly esiWages: number;
  readonly employee: number;
  readonly employer: number;
}

/**
 * ESI's two contribution periods, as a `1 | 2` for the month given.
 *
 * April–September and October–March. The period matters because coverage is
 * decided at its start: somebody covered in April stays covered until September
 * even if a raise in June takes them over the threshold, and somebody over it in
 * April is not covered mid-period by a pay cut. Exposed so the caller can carry
 * that decision forward; `esiContribution` on its own only knows this month.
 */
export function esiContributionPeriod(month: string): 1 | 2 {
  const m = Number(month.slice(5, 7));
  return m >= 4 && m <= 9 ? 1 : 2;
}

/**
 * One month's ESI for one employee.
 *
 * `coveredOverride` carries the period rule above: pass `true` to keep somebody
 * contributing through a period they started inside, `false` to keep somebody
 * out of one they started outside. Undefined tests the threshold, which is
 * right for the first month of a period and for a new joiner.
 *
 * Both shares round **up** to the next rupee — ESIC's rule, not a preference.
 */
export function esiContribution(
  monthlyGross: number,
  config: StatutoryConfig,
  options: { hasDisability?: boolean; coveredOverride?: boolean } = {},
  rates: StatutoryRates = INDIA_STATUTORY_RATES,
): EsiContribution | null {
  if (!config.esi.enabled) return null;

  const esiWages = safe(monthlyGross);
  const threshold = options.hasDisability
    ? rates.esi.disabilityWageThreshold
    : rates.esi.wageThreshold;
  const covered = options.coveredOverride ?? esiWages <= threshold;

  if (!covered || esiWages === 0) {
    return { covered: false, esiWages, employee: 0, employer: 0 };
  }

  return {
    covered: true,
    esiWages,
    employee: roundUpRupee(esiWages * (rates.esi.employeePercent / 100)),
    employer: roundUpRupee(esiWages * (rates.esi.employerPercent / 100)),
  };
}

// ---------------------------------------------------------------------------
// Professional tax
// ---------------------------------------------------------------------------

/**
 * The month's professional tax under one state's schedule.
 *
 * Flat amounts by band, not a rate, and the band is decided on the month's
 * gross. `month` is only read for the February override some states apply, so
 * passing the wrong month costs at most that one month's difference — but it is
 * the month the payslip is for, so pass it.
 */
export function professionalTax(
  monthlyGross: number,
  schedule: ProfessionalTaxSchedule | null,
  month: string,
): number {
  if (!schedule) return 0;
  const gross = safe(monthlyGross);
  const slab = schedule.slabs.find((entry) => entry.upTo === null || gross <= entry.upTo);
  if (!slab) return 0;
  // The February override applies to the top band only — it exists to true up
  // the annual total to the ceiling, and somebody in a zero band owes nothing
  // to true up.
  const isFebruary = month.slice(5, 7) === '02';
  if (isFebruary && schedule.februaryAmount !== undefined && slab.amount > 0) {
    return schedule.februaryAmount;
  }
  return slab.amount;
}

// ---------------------------------------------------------------------------
// Income tax
// ---------------------------------------------------------------------------

/** Tax on `taxable` under a progressive slab scale, before rebate and cess. */
export function slabTax(taxable: number, slabs: readonly TaxSlab[]): number {
  let remaining = safe(taxable);
  let floor = 0;
  let tax = 0;
  for (const slab of slabs) {
    if (remaining <= 0) break;
    const ceiling = slab.upTo ?? Number.POSITIVE_INFINITY;
    const band = Math.min(remaining, ceiling - floor);
    tax += band * (slab.rate / 100);
    remaining -= band;
    floor = ceiling;
  }
  return tax;
}

/** The surcharge rate that applies to a total income. */
export function surchargeRate(totalIncome: number, rates: StatutoryRates): number {
  const income = safe(totalIncome);
  const band = rates.incomeTax.surcharge.find(
    (entry) => entry.upTo === null || income <= entry.upTo,
  );
  return band?.rate ?? 0;
}

export interface AnnualTaxAssessment {
  readonly regime: TaxRegime;
  /** Gross salary for the year, before any deduction. */
  readonly grossSalary: number;
  /** The standard deduction actually applied. */
  readonly standardDeduction: number;
  /** Chapter VI-A and the rest, as declared. Zero under the new regime. */
  readonly otherDeductions: number;
  readonly taxableIncome: number;
  /** Tax on the slabs, before rebate. */
  readonly slabTax: number;
  /** The §87A rebate applied, if any. */
  readonly rebate: number;
  readonly surcharge: number;
  readonly cess: number;
  /** What is payable for the year, after everything. */
  readonly annualTax: number;
}

/**
 * A year's income tax on a salary.
 *
 * The new regime allows the standard deduction and essentially nothing else,
 * which is why `otherDeductions` is ignored under it rather than trusted: an
 * employee who declared ₹1.5 lakh of 80C and then elected the new regime would
 * otherwise have it silently allowed, and the shortfall would surface as a
 * demand on them a year later.
 *
 * §87A is modelled as the rebate it is — capped, and withdrawn entirely above
 * the income ceiling — rather than as a zero band, because the two differ by
 * thousands of rupees for somebody a little over the line. That cliff is real
 * and it is the law's, not this function's.
 */
export function annualIncomeTax(
  input: {
    grossSalary: number;
    regime: TaxRegime;
    /** Chapter VI-A, HRA exemption, everything else. Old regime only. */
    otherDeductions?: number;
  },
  rates: StatutoryRates = INDIA_STATUTORY_RATES,
): AnnualTaxAssessment {
  const scale = input.regime === 'old' ? rates.incomeTax.oldRegime : rates.incomeTax.newRegime;
  const grossSalary = safe(input.grossSalary);
  const standardDeduction = Math.min(scale.standardDeduction, grossSalary);
  const otherDeductions =
    input.regime === 'old' ? Math.min(safe(input.otherDeductions ?? 0), grossSalary) : 0;

  const taxableIncome = Math.max(0, grossSalary - standardDeduction - otherDeductions);
  const beforeRebate = slabTax(taxableIncome, scale.slabs);

  const rebate =
    taxableIncome <= scale.rebateIncomeCeiling
      ? Math.min(beforeRebate, scale.rebateCeiling)
      : 0;
  const afterRebate = Math.max(0, beforeRebate - rebate);

  const surcharge = afterRebate * (surchargeRate(taxableIncome, rates) / 100);
  const cess = (afterRebate + surcharge) * (rates.incomeTax.cessPercent / 100);

  return {
    regime: input.regime,
    grossSalary,
    standardDeduction,
    otherDeductions,
    taxableIncome,
    slabTax: Math.round(beforeRebate),
    rebate: Math.round(rebate),
    surcharge: Math.round(surcharge),
    cess: Math.round(cess),
    annualTax: Math.round(afterRebate + surcharge + cess),
  };
}

/**
 * The month's TDS: the year's liability spread over the months left in it.
 *
 * Spread over what **remains**, not over twelve. An employee who joins in
 * October has six months for the whole year's tax, and dividing by twelve would
 * under-deduct by half and leave them a demand in July. `monthsRemaining` is
 * inclusive of the month being paid, so December of a year ending in March
 * is 4.
 *
 * `alreadyDeducted` is what has been withheld so far, so a mid-year change —
 * a raise, a late investment declaration, a regime election — corrects the rest
 * of the year rather than being applied from scratch.
 */
export function monthlyTds(input: {
  annualTax: number;
  monthsRemaining: number;
  alreadyDeducted?: number;
}): number {
  const months = Math.max(1, Math.floor(safe(input.monthsRemaining)));
  const outstanding = Math.max(0, safe(input.annualTax) - safe(input.alreadyDeducted ?? 0));
  return Math.round(outstanding / months);
}

/** Months left in the Indian financial year, inclusive of `month`. */
export function monthsLeftInFinancialYear(month: string): number {
  const m = Number(month.slice(5, 7));
  if (!Number.isFinite(m) || m < 1 || m > 12) return 12;
  // April is month 1 of the year and March is month 12.
  const position = m >= 4 ? m - 3 : m + 9;
  return 13 - position;
}

// ---------------------------------------------------------------------------
// Gratuity
// ---------------------------------------------------------------------------

export interface GratuityAssessment {
  /** Completed years, as the Act counts them — see `completedYears`. */
  readonly completedYears: number;
  readonly qualifies: boolean;
  /** What would be payable on today's wage, before the statutory ceiling. */
  readonly computed: number;
  /** What is payable, after the ceiling. */
  readonly payable: number;
}

/**
 * Completed years of service, counted the way the Payment of Gratuity Act does.
 *
 * A part-year over six months counts as a full year; six months or less is
 * discarded. Stated here rather than as `Math.floor(months / 12)`, which is the
 * obvious implementation and understates by a year for most leavers.
 */
export function completedYears(joinedIso: string, leavingIso: string): number {
  const joined = Date.parse(`${joinedIso.slice(0, 10)}T00:00:00Z`);
  const leaving = Date.parse(`${leavingIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(joined) || !Number.isFinite(leaving) || leaving <= joined) return 0;

  const months = (leaving - joined) / (1000 * 60 * 60 * 24 * 30.4375);
  const whole = Math.floor(months / 12);
  const remainderMonths = months - whole * 12;
  return remainderMonths > 6 ? whole + 1 : whole;
}

/**
 * Gratuity on separation.
 *
 * `lastDrawnWages` is basic plus dearness allowance — the same base as PF, and
 * not the whole salary. The formula is 15 days' wages for every completed year,
 * with a month taken as 26 working days.
 *
 * The qualifying period is five years, **or one for a fixed-term employee**
 * since the 2025 change. That is the trap: a payroll written before it silently
 * pays nothing to exactly the population the change was made for, and nothing
 * on the payslip says why.
 */
export function gratuity(
  input: {
    lastDrawnWages: number;
    joinedIso: string;
    leavingIso: string;
    fixedTerm?: boolean;
  },
  rates: StatutoryRates = INDIA_STATUTORY_RATES,
): GratuityAssessment {
  const years = completedYears(input.joinedIso, input.leavingIso);
  const qualifyingYears = input.fixedTerm
    ? rates.gratuity.fixedTermQualifyingYears
    : rates.gratuity.qualifyingYears;
  const qualifies = years >= qualifyingYears;

  const computed = Math.round(
    (safe(input.lastDrawnWages) * rates.gratuity.daysPerYear * years) /
      rates.gratuity.monthlyWorkingDays,
  );

  return {
    completedYears: years,
    qualifies,
    computed,
    payable: qualifies ? Math.min(computed, rates.gratuity.ceiling) : 0,
  };
}

// ---------------------------------------------------------------------------
// The Code on Wages floor
// ---------------------------------------------------------------------------

/** The share of total remuneration the Code on Wages treats as "wages". */
export const WAGE_FLOOR_PERCENT = 50;

export interface WageFloorFinding {
  /** What the structure actually allocates to wages, as a percentage. */
  readonly wagePercent: number;
  /** The floor: 50%. */
  readonly floorPercent: number;
  readonly compliant: boolean;
  /**
   * The wage figure statutory contributions must be computed on — the declared
   * Basic, or the floor, whichever is higher. This is the number the Code makes
   * load-bearing: an employer cannot reduce its PF and gratuity liability by
   * moving pay into allowances.
   */
  readonly statutoryWages: number;
  /** Monthly rupees by which the declared Basic falls short of the floor. */
  readonly shortfall: number;
}

/**
 * Check a month's components against the Code on Wages floor.
 *
 * The Code defines "wages" as basic plus dearness allowance plus retaining
 * allowance, and provides that where the excluded allowances exceed half of
 * total remuneration, the excess is added back — so wages are at least 50% of
 * the total however the structure is drawn.
 *
 * This is the cheapest compliance feature in this app and the one most worth
 * having: Settings → Salary Structure accepts any Basic percentage, so an
 * organisation can configure itself into under-contributing without any surface
 * saying so. It is a *finding*, never an automatic correction — `statutoryWages`
 * says what contributions should be computed on and an administrator decides
 * whether to restructure or to contribute on the higher figure. Silently
 * recomputing everybody's PF on a number the company never agreed to is the
 * behaviour this codebase refuses everywhere else.
 */
export function wageFloorFinding(input: {
  /** Basic plus dearness allowance, as the structure allocates it. */
  wages: number;
  /** Everything paid in the month, wages included. */
  totalRemuneration: number;
}): WageFloorFinding {
  const total = safe(input.totalRemuneration);
  const wages = Math.min(safe(input.wages), total);
  const floor = Math.round((total * WAGE_FLOOR_PERCENT) / 100);
  const wagePercent = total === 0 ? 0 : Math.round((wages / total) * 1000) / 10;

  return {
    wagePercent,
    floorPercent: WAGE_FLOOR_PERCENT,
    compliant: wages >= floor,
    statutoryWages: Math.max(wages, floor),
    shortfall: Math.max(0, floor - wages),
  };
}

// ---------------------------------------------------------------------------
// CTC and gross
// ---------------------------------------------------------------------------

export interface MonthlyGrossResolution {
  /** One month of the CTC the employee was offered. */
  readonly monthlyCtc: number;
  /** What is actually paid as salary, before deductions. */
  readonly grossEarnings: number;
  /** The employer's statutory cost, carved out of the CTC or added to it. */
  readonly employerCost: number;
  /** True when the employer's share was taken out of the CTC to get gross. */
  readonly carvedFromCtc: boolean;
  /**
   * `monthlyCtc - grossEarnings - employerCost`: the rupee or two of the budget
   * that no gross can spend.
   *
   * Never negative, and reported rather than hidden. See `resolveMonthlyGross`
   * for why it exists at all; a payslip that shows a CTC reconciliation which
   * is silently a rupee out is a payslip somebody will spend an afternoon on.
   */
  readonly ctcVariance: number;
}

/**
 * Work out what a month's gross actually is, given the CTC.
 *
 * The whole question is one flag: **is the employer's PF share inside the CTC
 * the employee was offered?** Both arrangements are ordinary in India and they
 * pay different amounts.
 *
 *   - `employerShareInCtc: false` — the employer contributes on top. Gross is
 *     CTC ÷ 12 exactly, which is what this app did before statutory payroll
 *     existed, so an organisation choosing this sees no change to anybody's
 *     gross when it switches EPF on.
 *   - `employerShareInCtc: true` — the offer of "₹6,00,000 CTC" already
 *     included the employer's ₹21,600 a year, so the salary is lower than
 *     CTC ÷ 12 by exactly that.
 *
 * The second case is circular: gross decides Basic, Basic decides the employer
 * contribution, and the contribution decides gross.
 *
 * **And it does not always have an exact solution.** Every step rounds — Basic
 * to the rupee, each contribution to the rupee, the EPFO admin charge to a
 * floor of ₹75 that is not a percentage of anything — so the cost is a step
 * function of gross, and for some CTCs no gross satisfies
 * `gross + cost(gross) == ctc` at all. Iterating alone therefore oscillates
 * between two values a rupee or two apart, and a bare fixed-point loop simply
 * returns whichever one it stopped on.
 *
 * So the rule is stated instead of discovered: **the highest gross whose
 * employer cost still fits inside the CTC.** The employer never spends more
 * than it budgeted, the employee gets every rupee that does fit, and whatever
 * cannot be spent is reported as `ctcVariance` rather than quietly absorbed.
 * The iteration is only how the search starts; the climb is what decides.
 *
 * `wagesOf` is supplied by the caller because the salary structure lives behind
 * the org_settings registry, which this module must not import. It answers
 * "what is PF-liable in this gross" — the Basic component.
 */
export function resolveMonthlyGross(
  input: {
    monthlyCtc: number;
    config: StatutoryConfig;
    /** gross -> the PF-liable wage inside it. */
    wagesOf: (gross: number) => number;
    esi?: { hasDisability?: boolean; coveredOverride?: boolean };
  },
  rates: StatutoryRates = INDIA_STATUTORY_RATES,
): MonthlyGrossResolution {
  const monthlyCtc = Math.round(safe(input.monthlyCtc));

  const employerCostAt = (gross: number): number => {
    const epf = epfContribution(input.wagesOf(gross), input.config, rates);
    const esi = esiContribution(gross, input.config, input.esi ?? {}, rates);
    return (epf?.employerCost ?? 0) + (esi?.employer ?? 0);
  };

  if (!input.config.epf.employerShareInCtc) {
    return {
      monthlyCtc,
      grossEarnings: monthlyCtc,
      employerCost: employerCostAt(monthlyCtc),
      carvedFromCtc: false,
      // Nothing was carved out, so there is nothing left over.
      ctcVariance: 0,
    };
  }

  // Start somewhere close. Three passes land within a rupee or two of the
  // answer for every salary this app can hold, which is what makes the bounded
  // search below cheap.
  let gross = monthlyCtc;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = Math.max(0, monthlyCtc - employerCostAt(gross));
    if (next === gross) break;
    gross = next;
  }

  const fits = (candidate: number) => candidate + employerCostAt(candidate) <= monthlyCtc;

  // Down first, in case the estimate overspends; then up, to the highest gross
  // that still fits. Both bounded — an unbounded search here is a render that
  // hangs, and the estimate is never more than a few rupees out.
  const LIMIT = 64;
  for (let step = 0; step < LIMIT && gross > 0 && !fits(gross); step += 1) gross -= 1;
  for (let step = 0; step < LIMIT && fits(gross + 1); step += 1) gross += 1;

  const employerCost = employerCostAt(gross);
  return {
    monthlyCtc,
    grossEarnings: gross,
    employerCost,
    carvedFromCtc: true,
    ctcVariance: Math.max(0, monthlyCtc - gross - employerCost),
  };
}
