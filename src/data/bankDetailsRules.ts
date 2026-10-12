/**
 * Bank details: what a valid entry looks like. Pure, imports nothing, so the
 * unit suite can check it and the form can explain a refusal before the
 * server makes one. `validBankDetails` in firestore.rules is the same check
 * and the one that decides — change them together.
 */

/** Indian account numbers run 9 to 18 digits. */
export const ACCOUNT_NUMBER_PATTERN = /^[0-9]{9,18}$/;
/** IFSC: four letters (the bank), a zero, six letters or digits (the branch). */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export interface BankDetailsInput {
  accountHolderName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifsc: string;
  bankName: string;
}

export interface NormalisedBankDetails {
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
}

/**
 * Tidy what somebody typed — spaces in an account number, a lower-case IFSC —
 * and say what is still wrong. Returns the field errors, or the cleaned value.
 */
export function validateBankDetails(
  input: BankDetailsInput,
): { ok: true; value: NormalisedBankDetails } | { ok: false; errors: Partial<Record<keyof BankDetailsInput, string>> } {
  const accountHolderName = input.accountHolderName.trim().replace(/\s+/g, ' ');
  const accountNumber = input.accountNumber.replace(/[\s-]/g, '');
  const confirm = input.confirmAccountNumber.replace(/[\s-]/g, '');
  const ifsc = input.ifsc.trim().toUpperCase();
  const bankName = input.bankName.trim().replace(/\s+/g, ' ');

  const errors: Partial<Record<keyof BankDetailsInput, string>> = {};
  if (!accountHolderName) errors.accountHolderName = 'Enter the name on the account.';
  else if (accountHolderName.length > 120) errors.accountHolderName = 'That name is too long.';
  if (!ACCOUNT_NUMBER_PATTERN.test(accountNumber)) {
    errors.accountNumber = 'An account number is 9 to 18 digits.';
  }
  // Typed twice because a single wrong digit pays somebody else.
  if (confirm !== accountNumber) errors.confirmAccountNumber = 'The two account numbers do not match.';
  if (!IFSC_PATTERN.test(ifsc)) errors.ifsc = 'An IFSC is 11 characters, like HDFC0001234.';
  if (bankName.length > 120) errors.bankName = 'That bank name is too long.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { accountHolderName, accountNumber, ifsc, bankName } };
}

/** `123456789012` → `•••• 9012`. Shown wherever the full number is not needed. */
export function maskAccountNumber(accountNumber: string): string {
  const last4 = accountNumber.slice(-4);
  return accountNumber.length > 4 ? `•••• ${last4}` : last4;
}
