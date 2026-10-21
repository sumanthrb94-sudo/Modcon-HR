/**
 * What a year of salary looks like from one month inside it, for TDS.
 *
 * Monthly TDS is the year's liability, less what is already withheld, spread
 * over the months that remain. The engine had all three parts and joined them
 * wrongly: the year was always this month's gross × 12, and "already withheld"
 * was one figure HR typed once. So the outstanding tax was re-spread over a
 * shrinking number of months against a credit that never grew — ₹1.5 lakh a
 * month withheld ₹4.68 lakh against a ₹1.51 lakh liability — and a joiner in
 * October was taxed as though they had been paid since April.
 *
 * Here each month of the financial year is what it actually is: a month
 * already paid is its stored payslip (gross and the tax it withheld); a month
 * paid before payroll ran in this app is estimated at the monthly rate, with
 * the tax withheld for it entered by HR; months before joining or after the
 * last working day are nothing. A leaver's final month is the last month that
 * remains, so it trues the year up instead of deducting a fraction of it.
 *
 * Pure, imports nothing, unit-tested (tests/unit/tdsProjection.test.ts).
 */

/** The twelve months of the Indian financial year containing `month`, April first. */
export function financialYearMonths(month: string): string[] {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const startYear = m >= 4 ? year : year - 1;
  const out: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const mm = ((3 + i) % 12) + 1;
    const yy = mm >= 4 ? startYear : startYear + 1;
    out.push(`${yy}-${String(mm).padStart(2, '0')}`);
  }
  return out;
}

export interface PaidMonth {
  /** Gross paid that month, including any arrears it carried. */
  readonly gross: number;
  /** Income tax it withheld. */
  readonly tax: number;
}

export interface TaxYearInput {
  /** The month being paid now, YYYY-MM. */
  readonly month: string;
  /** This month's gross, including arrears. */
  readonly currentGross: number;
  /** The full monthly rate, for months not yet paid. */
  readonly monthlyRate: number;
  /** The share of a month (0–1) the person is employed for. */
  readonly employedShare: (month: string) => number;
  /** Months already paid by this app, by YYYY-MM. */
  readonly paid: ReadonlyMap<string, PaidMonth>;
  /** Tax withheld this year for months paid before this app ran payroll. */
  readonly taxDeductedOutside?: number;
}

export interface TaxYearProjection {
  readonly projectedAnnualSalary: number;
  readonly alreadyDeducted: number;
  /** This month plus every later month the person is employed for, at least 1. */
  readonly monthsRemaining: number;
}

export function projectTaxYear(input: TaxYearInput): TaxYearProjection {
  let projected = 0;
  let deducted = 0;
  let later = 0;
  for (const m of financialYearMonths(input.month)) {
    if (m < input.month) {
      const p = input.paid.get(m);
      if (p) {
        projected += p.gross;
        deducted += p.tax;
      } else {
        projected += Math.round(input.monthlyRate * clampShare(input.employedShare(m)));
      }
    } else if (m === input.month) {
      projected += input.currentGross;
    } else {
      const share = clampShare(input.employedShare(m));
      if (share > 0) {
        projected += Math.round(input.monthlyRate * share);
        later += 1;
      }
    }
  }
  return {
    projectedAnnualSalary: projected,
    alreadyDeducted: deducted + Math.max(0, input.taxDeductedOutside ?? 0),
    monthsRemaining: 1 + later,
  };
}

function clampShare(share: number): number {
  return Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0;
}
