// ===========================================================================
// Statutory return files: the EPFO's ECR, and the deductee schedule behind a
// quarterly salary TDS return.
//
// This module imports nothing, and must go on importing nothing — the same
// contract as statutoryRules.ts, and for the same reason: a file that goes to a
// government portal is the last thing that should only be checkable by opening
// the app and clicking through a month of payroll. `npm run test:unit` runs it
// in a second.
//
// ---------------------------------------------------------------------------
// What these are, and what they are not
//
// **The ECR is the actual filing.** EPFO's Electronic Challan cum Return is a
// plain text file of `#~#`-delimited member lines, uploaded to the employer
// portal as-is. What `buildEcrFile` returns is that file.
//
// **The TDS schedule is not.** A quarterly salary return is filed by loading it
// into the Income Tax Department's Return Preparation Utility and validating it
// through the FVU, which produces the file that is actually accepted. No web
// app generates that end to end, and one that claimed to would be lying about
// the step where the errors surface. `buildTdsDeducteeSchedule` produces the
// deductee-wise working that goes *into* the RPU — the figures, per PAN, per
// month of the quarter, adding up to the challans — which is the part payroll
// actually knows and the part that is tedious and error-prone to assemble by
// hand.
//
// ---------------------------------------------------------------------------
// A row that cannot be filed is REPORTED, never dropped
//
// The rule the payslip, leave-entitlement and salary-split uploads already
// follow, and it matters more here than in any of them: a member silently
// missing from an ECR looks exactly like a member who was not employed that
// month. The contribution is not remitted, nobody notices until that person
// tries to withdraw, and the employer has an interest-and-damages liability
// under §7Q and §14B running from the month it happened.
//
// So every generator returns `{ text, included, problems }`, the file is
// generated anyway from the rows that are usable, and the caller must show the
// problems beside the download.
// ===========================================================================

/** One person's month, as payroll computed it. */
export interface EcrMemberInput {
  readonly employeeId: string;
  readonly employeeCode: string;
  readonly name: string;
  /** Universal Account Number. Empty when nobody has recorded it. */
  readonly uan: string;
  /** Everything paid in the month. */
  readonly grossWages: number;
  /** The PF-liable wage, after whatever ceiling the establishment applies. */
  readonly epfWages: number;
  /** Always capped at the statutory ceiling — see epfContribution. */
  readonly epsWages: number;
  readonly edliWages: number;
  /** The employee's own 12%. */
  readonly epfContribution: number;
  /** The employer's pension share. */
  readonly epsContribution: number;
  /** The employer's 12% less the pension share. */
  readonly epfEpsDifference: number;
  /** Non-contributing period: days of unpaid absence in the month. */
  readonly ncpDays: number;
  /** Advances refunded this month. Almost always zero. */
  readonly refundOfAdvances: number;
}

/** Something that stopped a row being filed, or that a human should look at. */
export interface ReturnProblem {
  readonly employeeId: string;
  readonly employeeCode: string;
  readonly name: string;
  /** `blocking` keeps the row out of the file; `warning` lets it through. */
  readonly severity: 'blocking' | 'warning';
  readonly message: string;
}

export interface GeneratedReturn {
  /** The file's contents. Empty when nothing was fileable. */
  readonly text: string;
  /** How many people made it in. */
  readonly included: number;
  /** How many were left out, and why — never silently. */
  readonly problems: readonly ReturnProblem[];
  /** What to call the download. */
  readonly filename: string;
}

/** The EPFO's field separator. Not a comma, and not configurable. */
const ECR_SEPARATOR = '#~#';

/** A whole rupee. The ECR takes no paise anywhere. */
function rupees(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * A UAN is twelve digits.
 *
 * Checked rather than assumed, because the failure is silent at this end and
 * expensive at the other: EPFO rejects the whole upload on a malformed number,
 * and the message names a line rather than a person.
 */
export function isValidUan(uan: string): boolean {
  return /^\d{12}$/.test(uan.trim());
}

/**
 * A PAN is five letters, four digits, a letter — and the fourth character
 * encodes the holder type, which for an individual is `P`.
 *
 * The fourth-character check is a warning rather than a refusal: a valid PAN in
 * some other category on a salary return is somebody's data-entry mistake far
 * more often than it is a genuine oddity, but it is not this app's place to
 * refuse to report a number the employer holds.
 */
export function isValidPan(pan: string): boolean {
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(pan.trim().toUpperCase());
}

export function isIndividualPan(pan: string): boolean {
  return isValidPan(pan) && pan.trim().toUpperCase()[3] === 'P';
}

/**
 * Build the month's ECR.
 *
 * Eleven `#~#`-separated fields per member, in the order EPFO's v2.0 format
 * fixes them — UAN, name, gross wages, EPF wages, EPS wages, EDLI wages, the
 * employee's EPF contribution, the EPS contribution, the EPF/EPS difference,
 * NCP days, refund of advances. The order is not a preference and reordering
 * two numeric columns produces a file that uploads cleanly and remits the wrong
 * amounts to the wrong scheme.
 *
 * Members with no UAN are **excluded and reported**. There is nothing else to
 * do with them: the UAN is the first field and EPFO has no way to identify a
 * member without it. The point of reporting rather than dropping is that
 * somebody has to go and get the number before the 15th.
 */
export function buildEcrFile(
  members: readonly EcrMemberInput[],
  month: string,
): GeneratedReturn {
  const problems: ReturnProblem[] = [];
  const lines: string[] = [];

  for (const member of members) {
    const uan = member.uan.trim();

    if (!uan) {
      problems.push({
        employeeId: member.employeeId,
        employeeCode: member.employeeCode,
        name: member.name,
        severity: 'blocking',
        message: 'No UAN on record, so this member cannot be identified on the return.',
      });
      continue;
    }
    if (!isValidUan(uan)) {
      problems.push({
        employeeId: member.employeeId,
        employeeCode: member.employeeCode,
        name: member.name,
        severity: 'blocking',
        message: `“${uan}” is not a twelve-digit UAN. EPFO rejects the whole upload on a malformed one.`,
      });
      continue;
    }

    // A member paid nothing this month is still a member: EPFO expects a line
    // with zero wages and the month's NCP days, and omitting it reads as
    // somebody who left. Reported so a human can confirm which it is.
    if (rupees(member.grossWages) === 0) {
      problems.push({
        employeeId: member.employeeId,
        employeeCode: member.employeeCode,
        name: member.name,
        severity: 'warning',
        message: 'Paid nothing this month. Filed with zero wages — check that they have not left.',
      });
    }

    lines.push([
      uan,
      // The separator inside a name would split one member into two fields and
      // shift every column after it. Stripped rather than escaped: the format
      // has no escape, and a name is not worth a corrupt return.
      member.name.split(ECR_SEPARATOR).join(' ').trim(),
      rupees(member.grossWages),
      rupees(member.epfWages),
      rupees(member.epsWages),
      rupees(member.edliWages),
      rupees(member.epfContribution),
      rupees(member.epsContribution),
      rupees(member.epfEpsDifference),
      Math.max(0, Math.round(member.ncpDays)),
      rupees(member.refundOfAdvances),
    ].join(ECR_SEPARATOR));
  }

  return {
    // Trailing newline: EPFO's parser treats the last line as data either way,
    // but a file without one has bitten enough uploads to be worth the byte.
    text: lines.length > 0 ? `${lines.join('\n')}\n` : '',
    included: lines.length,
    problems,
    filename: `ECR_${month.replace('-', '_')}.txt`,
  };
}

/** What the ECR adds up to, for checking against the challan before remitting. */
export interface EcrTotals {
  readonly members: number;
  readonly epfWages: number;
  readonly epsWages: number;
  readonly edliWages: number;
  readonly employeeShare: number;
  readonly pensionShare: number;
  readonly employerShare: number;
}

/**
 * Totals for the members that made it into the file.
 *
 * Computed from the same filtered set the file was built from, not from every
 * member — a total that includes people the return excluded is a total that
 * will not reconcile against the challan, and reconciling is the only reason to
 * show one.
 */
export function ecrTotals(
  members: readonly EcrMemberInput[],
  problems: readonly ReturnProblem[],
): EcrTotals {
  const blocked = new Set(
    problems.filter((p) => p.severity === 'blocking').map((p) => p.employeeId),
  );
  const filed = members.filter((member) => !blocked.has(member.employeeId));

  const sum = (pick: (member: EcrMemberInput) => number) =>
    filed.reduce((total, member) => total + rupees(pick(member)), 0);

  return {
    members: filed.length,
    epfWages: sum((m) => m.epfWages),
    epsWages: sum((m) => m.epsWages),
    edliWages: sum((m) => m.edliWages),
    employeeShare: sum((m) => m.epfContribution),
    pensionShare: sum((m) => m.epsContribution),
    employerShare: sum((m) => m.epfEpsDifference),
  };
}

// ---------------------------------------------------------------------------
// The quarterly salary TDS return
// ---------------------------------------------------------------------------

/** One month of one deductee's salary and the tax withheld from it. */
export interface TdsMonthEntry {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly amountPaid: number;
  readonly taxDeducted: number;
}

export interface TdsDeducteeInput {
  readonly employeeId: string;
  readonly employeeCode: string;
  readonly name: string;
  /** Permanent Account Number. Empty when nobody has recorded it. */
  readonly pan: string;
  readonly months: readonly TdsMonthEntry[];
}

/** Which quarter a `YYYY-MM` falls in, on the Indian financial year. */
export function financialQuarterOf(month: string): { quarter: 1 | 2 | 3 | 4; label: string } {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const quarter = (m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 && m <= 12 ? 3 : 4) as 1 | 2 | 3 | 4;
  // April to March, so January to March belongs to the year that started the
  // previous April. Getting this wrong files a quarter against the wrong year,
  // which is the kind of error that surfaces as a notice rather than a warning.
  const startYear = m >= 4 ? year : year - 1;
  return { quarter, label: `Q${quarter} ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}` };
}

/**
 * The deductee-wise working behind a quarter's salary TDS return.
 *
 * **This is not the filed return.** A quarterly salary return goes through the
 * Income Tax Department's Return Preparation Utility and its File Validation
 * Utility, and what the FVU emits is the thing the department accepts. Nothing
 * generated in a browser is that file, and an app that said otherwise would be
 * hiding the step at which the errors actually appear.
 *
 * What this is: the per-deductee, per-month schedule that goes into the RPU —
 * PAN, name, what was paid, what was withheld, month by month, totalled. That is
 * the part payroll knows and the part that is miserable to assemble by hand from
 * twelve payslips a person.
 *
 * A deductee with no PAN is reported and **still included**, because leaving
 * them out understates the quarter and the return has to reconcile against the
 * challans that were actually paid. A missing or invalid PAN is a §206AA
 * problem — deduction at the higher of the normal rate or 20% — which is a
 * decision for whoever files, not something to resolve by omission.
 */
export function buildTdsDeducteeSchedule(
  deductees: readonly TdsDeducteeInput[],
  quarterMonths: readonly string[],
): GeneratedReturn {
  const problems: ReturnProblem[] = [];
  const header = [
    'employee_code',
    'deductee_name',
    'pan',
    ...quarterMonths.flatMap((month) => [`${month}_paid`, `${month}_tds`]),
    'total_paid',
    'total_tds',
  ];
  const rows: string[] = [];

  for (const deductee of deductees) {
    const pan = deductee.pan.trim().toUpperCase();

    if (!pan) {
      problems.push({
        employeeId: deductee.employeeId,
        employeeCode: deductee.employeeCode,
        name: deductee.name,
        severity: 'warning',
        message:
          'No PAN on record. Included in the schedule, but §206AA requires deduction at the higher '
          + 'of the normal rate or 20% until one is provided.',
      });
    } else if (!isValidPan(pan)) {
      problems.push({
        employeeId: deductee.employeeId,
        employeeCode: deductee.employeeCode,
        name: deductee.name,
        severity: 'warning',
        message: `“${pan}” is not a valid PAN. The utility will reject the return on it.`,
      });
    } else if (!isIndividualPan(pan)) {
      problems.push({
        employeeId: deductee.employeeId,
        employeeCode: deductee.employeeCode,
        name: deductee.name,
        severity: 'warning',
        message:
          `“${pan}” is a valid PAN but its fourth character is not P, so it is not an individual’s. `
          + 'Check it against the card before filing.',
      });
    }

    const byMonth = new Map(deductee.months.map((entry) => [entry.month, entry]));
    const cells = quarterMonths.flatMap((month) => {
      const entry = byMonth.get(month);
      return [rupees(entry?.amountPaid ?? 0), rupees(entry?.taxDeducted ?? 0)];
    });
    const totalPaid = quarterMonths.reduce(
      (sum, month) => sum + rupees(byMonth.get(month)?.amountPaid ?? 0),
      0,
    );
    const totalTds = quarterMonths.reduce(
      (sum, month) => sum + rupees(byMonth.get(month)?.taxDeducted ?? 0),
      0,
    );

    rows.push(
      [
        csvCell(deductee.employeeCode),
        csvCell(deductee.name),
        csvCell(pan),
        ...cells,
        totalPaid,
        totalTds,
      ].join(','),
    );
  }

  const quarter = quarterMonths.length > 0 ? financialQuarterOf(quarterMonths[0]) : null;

  return {
    text: rows.length > 0 ? `${[header.join(','), ...rows].join('\n')}\n` : '',
    included: rows.length,
    problems,
    filename: quarter
      ? `TDS_deductee_schedule_${quarter.label.replace(/[ -]/g, '_')}.csv`
      : 'TDS_deductee_schedule.csv',
  };
}

/**
 * Quote a CSV cell.
 *
 * A comma in a name would otherwise become a column break and shift a PAN into
 * the amount-paid field, which is a return that validates and is wrong. The
 * three months of columns beside it are numeric and cannot contain one.
 */
function csvCell(value: string): string {
  const text = value ?? '';
  return /[",\n]/.test(text) ? `"${text.split('"').join('""')}"` : text;
}

/** The three `YYYY-MM` months of the quarter a month falls in. */
export function monthsOfQuarter(month: string): string[] {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(m)) return [];
  // Quarters start in April, July, October and January.
  const startMonth = m >= 4 && m <= 6 ? 4 : m >= 7 && m <= 9 ? 7 : m >= 10 && m <= 12 ? 10 : 1;
  return [0, 1, 2].map((offset) => {
    const value = startMonth + offset;
    return `${year}-${String(value).padStart(2, '0')}`;
  });
}
