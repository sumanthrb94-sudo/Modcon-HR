/**
 * Bank account details — the account an employee's salary is paid into.
 *
 * Firestore `employee_bank_details`, one document per employee per
 * organisation at `<orgId>__<employeeId>`. Not fields on the employee record:
 * the directory is readable by everyone in the organisation, and an account
 * number is not.
 *
 * The flow is the one the product owner asked for (2026-10-12):
 *  - the employee enters their details; they arrive `Pending`;
 *  - HR (or an administrator) verifies or rejects them;
 *  - once `Verified`, the employee cannot change them — they ask HR, who can.
 *
 * Every check here is presentation; `firestore.rules` (`employee_bank_details`)
 * is the copy that decides, so a restored button still cannot overwrite a
 * verified account.
 */
import { useEffect, useState } from 'react';
import { deleteField, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { Collections } from '@/lib/db';
import { resolveAppRole } from '@/lib/accessControl';
import { getCurrentEmployee } from '@/lib/currentEmployee';
import { DEFAULT_ORG_KEY } from '@/lib/orgScope';
import type { UserProfile } from '@/lib/auth';
import type { BankDetails, BankDetailsStatus } from '@/types';
import type { NormalisedBankDetails } from '@/data/bankDetailsRules';

export type { BankDetails, BankDetailsStatus } from '@/types';

export class BankDetailsError extends Error {}

function orgIdOf(profile: UserProfile | null): string {
  return profile?.orgId || DEFAULT_ORG_KEY;
}

export function bankDetailsId(orgId: string, employeeId: string): string {
  return `${orgId}__${employeeId}`;
}

/** HR Manager or Administrator: reviews, and may correct a verified account. */
export function canReviewBankDetails(profile: UserProfile | null): boolean {
  const role = resolveAppRole(profile);
  return role === 'HR Manager' || role === 'Admin';
}

export function isOwnRecord(profile: UserProfile | null, employeeId: string): boolean {
  return getCurrentEmployee(profile)?.id === employeeId;
}

/**
 * Whether this account may enter or change these details right now.
 * HR and administrators always; the employee only until HR has verified them.
 */
export function canEditBankDetails(
  profile: UserProfile | null,
  employeeId: string,
  current: BankDetails | null,
): boolean {
  if (canReviewBankDetails(profile)) return true;
  if (!isOwnRecord(profile, employeeId)) return false;
  return current?.status !== 'Verified';
}

interface BankDetailsResult {
  details: BankDetails | null;
  loading: boolean;
  error: Error | null;
}

/**
 * One employee's bank details, live.
 *
 * A query rather than a document get, filtered on orgId and employeeId: the
 * rules read `resource.data`, which denies a get on a document that does not
 * exist yet — and "nobody has entered anything" is the normal starting state.
 */
export function useBankDetails(profile: UserProfile | null, employeeId: string | null): BankDetailsResult {
  const [details, setDetails] = useState<BankDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const orgId = orgIdOf(profile);

  useEffect(() => {
    if (!profile || !employeeId) {
      setDetails(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    return onSnapshot(
      query(
        Collections.employeeBankDetails,
        where('orgId', '==', orgId),
        where('employeeId', '==', employeeId),
      ),
      (snap) => {
        setDetails(snap.empty ? null : (snap.docs[0].data() as BankDetails));
        setLoading(false);
      },
      (err) => {
        setError(err as Error);
        setDetails(null);
        setLoading(false);
      },
    );
  }, [profile, orgId, employeeId]);

  return { details, loading, error };
}

/**
 * Enter or replace the details.
 *
 * From the employee: always `Pending`, review fields cleared. From HR or an
 * administrator: recorded as verified by them — HR typing an account in from
 * a cancelled cheque has checked it by doing so.
 */
export async function saveBankDetails(
  profile: UserProfile | null,
  employeeId: string,
  value: NormalisedBankDetails,
  current: BankDetails | null,
): Promise<void> {
  if (!profile) throw new BankDetailsError('Not signed in.');
  if (!canEditBankDetails(profile, employeeId, current)) {
    throw new BankDetailsError(
      current?.status === 'Verified'
        ? 'HR has verified these details. Contact HR to change them.'
        : 'Only the employee or HR can enter these details.',
    );
  }
  const orgId = orgIdOf(profile);
  const byReviewer = canReviewBankDetails(profile);
  const now = new Date().toISOString();
  const record: Record<string, unknown> = {
    orgId,
    employeeId,
    accountHolderName: value.accountHolderName,
    accountNumber: value.accountNumber,
    ifsc: value.ifsc,
    status: (byReviewer ? 'Verified' : 'Pending') satisfies BankDetailsStatus,
    submittedByUid: profile.uid,
    submittedAt: now,
  };
  if (value.bankName) record.bankName = value.bankName;
  if (byReviewer) {
    record.reviewedByUid = profile.uid;
    record.reviewedAt = now;
  }
  // A full replace, not a merge: a resubmission must not carry the previous
  // review (or a rejection note) along with it.
  await setDoc(doc(Collections.employeeBankDetails, bankDetailsId(orgId, employeeId)), record as unknown as BankDetails);
}

/** HR verifies or rejects what the employee submitted. */
export async function reviewBankDetails(
  profile: UserProfile | null,
  current: BankDetails,
  status: 'Verified' | 'Rejected',
  note?: string,
): Promise<void> {
  if (!profile) throw new BankDetailsError('Not signed in.');
  if (!canReviewBankDetails(profile)) throw new BankDetailsError('Only HR or an administrator reviews bank details.');
  const trimmed = note?.trim();
  await setDoc(
    doc(Collections.employeeBankDetails, bankDetailsId(current.orgId, current.employeeId)),
    {
      status,
      reviewedByUid: profile.uid,
      reviewedAt: new Date().toISOString(),
      reviewNote: trimmed ? trimmed.slice(0, 300) : deleteField(),
    } as unknown as BankDetails,
    { merge: true },
  );
}
