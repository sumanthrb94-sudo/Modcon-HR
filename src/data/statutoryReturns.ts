/**
 * Assemble a month's payroll into the statutory returns.
 *
 * The thin half of the returns feature: `data/returnFiles.ts` holds the file
 * formats and imports nothing, so it can be unit tested; this reaches for the
 * directory, the statutory configuration and `buildPayslipComponents` and
 * cannot. Same split as statutoryRules / statutory, and shifts before that.
 *
 * ## The returns are built from what payroll computed, not from what it stored
 *
 * `buildPayslipComponents` is called per employee at the moment the return is
 * generated, rather than reading `payslip_documents` or the payroll-run store.
 * That is deliberate and it is the direction that fails safely: a stored payslip
 * is a record of what was *paid*, and a return has to state what is *owed* under
 * today's configuration. If the two disagree — an establishment code added
 * mid-month, a salary structure corrected — the return should carry the
 * corrected figure and the difference should be visible, not silently filed on
 * whichever copy happened to be reached for.
 */
import type { Employee } from '@/types';
import { getEmployeeDirectory } from '@/data/employees';
import { buildPayslipComponents } from '@/data/payroll';
import { getTaxElectionFor, statutoryConfigOrNone } from '@/data/statutory';
import {
  buildEcrFile,
  buildTdsDeducteeSchedule,
  ecrTotals,
  monthsOfQuarter,
  type EcrMemberInput,
  type EcrTotals,
  type GeneratedReturn,
  type TdsDeducteeInput,
} from '@/data/returnFiles';

/**
 * Who a return covers.
 *
 * Resigned employees are included when they were paid in the month — a leaver
 * paid up to the 12th still has a contribution for it, and omitting them is the
 * same silent short-remittance a missing UAN would be. Somebody with no pay in
 * the month is carried into the ECR with zero wages, which is what EPFO expects
 * and what stops the return reading as a departure.
 */
function payrollPopulation(): Employee[] {
  return getEmployeeDirectory();
}

export interface EcrReturn extends GeneratedReturn {
  readonly totals: EcrTotals;
  /** False when this organisation has not declared an EPF registration. */
  readonly configured: boolean;
  /** The establishment code the file will be uploaded under. */
  readonly establishmentCode: string;
}

/**
 * The month's ECR.
 *
 * `configured: false` rather than an empty file for an organisation with no EPF
 * registration: a zero-member ECR is a valid return stating that nobody
 * contributed, and offering one to a company that simply has not set the scheme
 * up invites it to be filed.
 */
export function buildMonthlyEcr(month: string): EcrReturn {
  const config = statutoryConfigOrNone();
  const members: EcrMemberInput[] = [];

  if (config.epf.enabled) {
    for (const employee of payrollPopulation()) {
      const components = buildPayslipComponents(employee, month);
      const epf = components.statutory?.epf;
      // No EPF line for somebody the scheme does not cover — an exempt member,
      // or an organisation that switched PF off between the payslip and here.
      // They are simply not part of this return.
      if (!epf) continue;

      members.push({
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.fullName,
        uan: employee.uan ?? '',
        grossWages: components.grossEarnings,
        epfWages: epf.pfWages,
        epsWages: Math.min(epf.pfWages, 15000),
        edliWages: Math.min(epf.pfWages, 15000),
        epfContribution: epf.employee,
        epsContribution: epf.employerPension,
        epfEpsDifference: epf.employerProvidentFund,
        // Non-contributing days are unpaid absence, which is the same figure
        // payroll deducted for — one register, not two. A separate NCP count
        // that could disagree with the payslip is how a return stops
        // reconciling against the salary it was computed from.
        ncpDays: Math.round(components.lopDays),
        refundOfAdvances: 0,
      });
    }
  }

  const generated = buildEcrFile(members, month);
  return {
    ...generated,
    totals: ecrTotals(members, generated.problems),
    configured: config.epf.enabled,
    establishmentCode: config.epf.establishmentCode,
  };
}

export interface TdsReturn extends GeneratedReturn {
  readonly months: readonly string[];
  readonly configured: boolean;
  readonly tan: string;
  /** Everything withheld across the quarter, to check against the challans. */
  readonly totalTds: number;
}

/**
 * The deductee schedule for the quarter containing `month`.
 *
 * **Not the filed return** — see the note on `buildTdsDeducteeSchedule`. This is
 * the working that goes into the Return Preparation Utility, which is the step
 * that produces the file the department accepts.
 *
 * Every month of the quarter is computed, including months in the future
 * relative to today. That is deliberate: a quarter is filed after it ends, and a
 * schedule that quietly stopped at the current month would be short by however
 * many months the person generating it had not noticed.
 */
export function buildQuarterlyTdsSchedule(month: string): TdsReturn {
  const config = statutoryConfigOrNone();
  const months = monthsOfQuarter(month);
  const deductees: TdsDeducteeInput[] = [];
  let totalTds = 0;

  if (config.incomeTax.enabled) {
    for (const employee of payrollPopulation()) {
      const entries = months.map((quarterMonth) => {
        const components = buildPayslipComponents(employee, quarterMonth);
        return {
          month: quarterMonth,
          amountPaid: components.grossEarnings,
          taxDeducted: components.statutory?.tds ?? 0,
        };
      });

      const withheld = entries.reduce((sum, entry) => sum + entry.taxDeducted, 0);
      // Nothing withheld all quarter means nothing to report for them. A
      // deductee row of zeroes is not a filing requirement and it pads a
      // schedule somebody has to reconcile by hand.
      if (withheld === 0) continue;

      totalTds += withheld;
      deductees.push({
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.fullName,
        pan: employee.pan ?? '',
        months: entries,
      });
    }
  }

  return {
    ...buildTdsDeducteeSchedule(deductees, months),
    months,
    configured: config.incomeTax.enabled,
    tan: config.incomeTax.tan,
    totalTds,
  };
}

/**
 * Everyone missing a detail a return needs.
 *
 * Answered before a return is generated rather than as a list of problems after
 * it, because the fix is on somebody's profile and the deadline is the 15th.
 * Only asked about schemes the organisation actually runs — telling a company
 * with no ESI registration that nobody has an insurance number is noise.
 */
export interface MissingIdentifier {
  readonly employeeId: string;
  readonly employeeCode: string;
  readonly name: string;
  readonly missing: string[];
}

export function employeesMissingStatutoryIdentifiers(): MissingIdentifier[] {
  const config = statutoryConfigOrNone();
  const out: MissingIdentifier[] = [];

  for (const employee of payrollPopulation()) {
    const missing: string[] = [];
    if (config.epf.enabled && !getTaxElectionFor(employee.id).pfExempt && !employee.uan?.trim()) {
      missing.push('UAN');
    }
    if (config.esi.enabled && !employee.esicNumber?.trim()) missing.push('ESIC number');
    if (config.incomeTax.enabled && !employee.pan?.trim()) missing.push('PAN');
    // Bank details are not on any of these returns; they are what the payment
    // file needs, and that is the next thing an employer does after filing.
    if (!employee.bankAccountNumber?.trim() || !employee.bankIfsc?.trim()) {
      missing.push('bank account');
    }
    if (missing.length > 0) {
      out.push({
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.fullName,
        missing,
      });
    }
  }

  return out;
}
