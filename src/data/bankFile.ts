/**
 * The bank transfer file for a payroll run — what a small company uploads to
 * its net-banking bulk-payment screen, or hands to the bank, so nobody types
 * twenty account numbers by hand on the 30th.
 *
 * One plain CSV in the columns every Indian bank's bulk upload asks for in
 * some order (beneficiary name, account number, IFSC, amount, narration).
 * Banks differ in exact layout, so this is the data in a neutral shape rather
 * than a pretend bank-specific format; most bulk screens map columns on
 * upload.
 *
 * A person who cannot be paid by transfer — no account, or an IFSC that cannot
 * be right — is **listed, never dropped**. A row silently missing from a
 * salary file is somebody not paid this month who finds out from their bank
 * balance. Pure, and unit-tested.
 */

export interface BankTransferRow {
  readonly employeeCode: string;
  readonly name: string;
  readonly accountNumber?: string;
  readonly ifsc?: string;
  readonly amount: number;
}

export interface BankTransferFile {
  readonly csv: string;
  readonly included: number;
  readonly total: number;
  /** Everyone left out, with why. */
  readonly excluded: readonly { name: string; employeeCode: string; reason: string }[];
}

export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function cell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function bankTransferFile(rows: readonly BankTransferRow[], narration: string): BankTransferFile {
  const lines = ['Beneficiary Name,Account Number,IFSC,Amount,Narration,Employee Code'];
  const excluded: { name: string; employeeCode: string; reason: string }[] = [];
  let total = 0;
  for (const row of rows) {
    const account = (row.accountNumber ?? '').replace(/\s/g, '');
    const ifsc = (row.ifsc ?? '').trim().toUpperCase();
    if (row.amount <= 0) {
      excluded.push({ name: row.name, employeeCode: row.employeeCode, reason: 'Nothing to pay this month' });
      continue;
    }
    if (!/^\d{6,18}$/.test(account)) {
      excluded.push({ name: row.name, employeeCode: row.employeeCode, reason: account ? 'Account number does not look right' : 'No bank account recorded' });
      continue;
    }
    if (!IFSC_PATTERN.test(ifsc)) {
      excluded.push({ name: row.name, employeeCode: row.employeeCode, reason: ifsc ? 'IFSC does not look right' : 'No IFSC recorded' });
      continue;
    }
    const amount = Math.round(row.amount);
    total += amount;
    lines.push([row.name, account, ifsc, amount, narration, row.employeeCode].map(cell).join(','));
  }
  return { csv: `${lines.join('\n')}\n`, included: lines.length - 1, total, excluded };
}
