/**
 * The documents filed against an employee, and who is allowed to file them.
 *
 * This library was localStorage-backed (`src/data/documents.ts`), which made
 * `canFileDocuments` below a suggestion: the page hid the upload button from
 * whoever should not see it, and anyone who wanted the button back could have
 * it, because there was no server in the path to refuse the write. A rule about
 * who may submit somebody's Aadhaar card is not a rendering decision.
 *
 * So the library lives in Firestore, and `firestore.rules` states the same rule
 * a second time — that restatement is the enforcement, and the copy here exists
 * only so the page can offer the right controls. The two must agree; the rules
 * tests in tests/rules/employee-documents.rules.test.mjs are what keep them
 * honest, because the E2E suite drives the client and can only ever prove what
 * the client does.
 *
 * ## Primary vs secondary
 *
 * Primary documents are the employee's own identity and bank records — Aadhaar,
 * PAN, account details. They are submitted by the person they belong to, or by
 * HR on their behalf; an administrator uploading somebody else's identity
 * document is not a workflow this company has. "The employee" means the owner
 * of the record whatever their role, so a manager still submits their own PAN.
 *
 * Secondary documents are the organisation's paperwork about the employee, so
 * they run the other way: administrators and HR file them, the employee does
 * not. Which is which follows from the document's *name*, not from a field on
 * it — a stored category would be a claim the writer makes about their own
 * write, and the rules would have to check the name anyway to know it was true.
 *
 * ## What is stored
 *
 * Metadata only. The library has never held the file itself, and adding that is
 * the same base64-in-the-document decision written up in
 * src/lib/handbookStorage.ts.
 */
import { useEffect, useState } from 'react';
import { deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';

import { Collections } from '@/lib/db';
import { resolveAppRole } from '@/lib/accessControl';
import { getCurrentEmployee } from '@/lib/currentEmployee';
import { DEFAULT_ORG_KEY } from '@/lib/orgScope';
import type { UserProfile } from '@/lib/auth';
import type { DocumentStatus, EmployeeDocument } from '@/types';

export type { DocumentStatus, EmployeeDocument } from '@/types';

export type DocumentCategory = 'primary' | 'secondary';

export class EmployeeDocumentError extends Error {}

/**
 * The names that make a document primary, lowercased.
 *
 * Mirrored verbatim by `isPrimaryDocumentName` in firestore.rules. Matched
 * exactly rather than by looking for "aadhaar" inside a longer name: a
 * secondary document called "Aadhaar Card Verification Note" is the
 * organisation's paperwork, not the employee's identity record, and the two are
 * filed by different people.
 */
export const PRIMARY_DOCUMENT_NAMES = [
  'aadhaar card',
  'aadhar card',
  'pan card',
  'bank account details',
] as const;

export function documentCategory(name: string): DocumentCategory {
  return (PRIMARY_DOCUMENT_NAMES as readonly string[]).includes(name.trim().toLowerCase())
    ? 'primary'
    : 'secondary';
}

/**
 * The `orgId` stamped on a document.
 *
 * The `'default'` string, never null, for the legacy org — a null is invisible
 * to `where('orgId','==',…)`, which is the filter every read here depends on.
 * Same reasoning as `payslipOrgId`.
 */
export function employeeDocumentOrgId(profile: UserProfile | null): string {
  return profile?.orgId || DEFAULT_ORG_KEY;
}

/** `Bank Account Details` → `bank-account-details`. */
export function documentSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Deterministic id: one document per name per employee per organisation.
 *
 * Re-filing a document replaces it, which is what re-filing means — the
 * previous version of this library reached for the existing record's id to get
 * the same effect, and fell back to `doc-${Date.now()}` when it could not find
 * one, so a name that differed only in case accumulated duplicates.
 */
export function employeeDocumentId(orgId: string, employeeId: string, name: string): string {
  return `${orgId}__${employeeId}__${documentSlug(name)}`;
}

/**
 * Whether this account may file a document of `category` against `employeeId`.
 *
 * Presentation only — see the file header. `firestore.rules` decides.
 */
export function canFileDocuments(
  profile: UserProfile | null,
  category: DocumentCategory,
  employeeId: string,
): boolean {
  const role = resolveAppRole(profile);
  if (role === 'HR Manager') return true;
  if (category === 'secondary') return role === 'Admin';
  return getCurrentEmployee(profile)?.id === employeeId;
}

/** Whether this account may change a document's verification status. */
export function canVerifyDocuments(profile: UserProfile | null): boolean {
  return resolveAppRole(profile) === 'Admin';
}

function sortDocuments(documents: EmployeeDocument[]): EmployeeDocument[] {
  return documents
    .slice()
    .sort((a, b) => b.uploaded.localeCompare(a.uploaded) || a.name.localeCompare(b.name));
}

interface DocumentsResult {
  documents: EmployeeDocument[];
  loading: boolean;
  error: Error | null;
}

/**
 * Live documents for one employee, or for the whole organisation.
 *
 * `employeeId === null` means "this account matched no employee record", which
 * is not the same as `undefined` — the org-wide read. Querying with null would
 * ask for everyone's documents.
 *
 * The org filter is not merely a narrowing: the rules evaluate a list against
 * every document it returns and fail the whole query if one belongs to another
 * tenant, so an unfiltered read is denied rather than merely wasteful.
 */
export function useEmployeeDocuments(
  profile: UserProfile | null,
  employeeId?: string | null,
): DocumentsResult {
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const orgId = employeeDocumentOrgId(profile);

  useEffect(() => {
    if (!profile || employeeId === null) {
      setDocuments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const constraints = [where('orgId', '==', orgId)];
    if (employeeId) constraints.push(where('employeeId', '==', employeeId));

    // onSnapshot with an error callback rather than db.ts's `subscribe`, which
    // takes none: the rules deploy separately from the app, so a denied
    // listener is a real state and must not leave this stuck loading.
    return onSnapshot(
      query(Collections.employeeDocuments, ...constraints),
      (snap) => {
        setDocuments(sortDocuments(snap.docs.map((d) => ({ ...d.data(), id: d.id }))));
        setLoading(false);
      },
      (err) => {
        setError(err as Error);
        setDocuments([]);
        setLoading(false);
      },
    );
  }, [profile, orgId, employeeId]);

  return { documents, loading, error };
}

/**
 * File a document against an employee, replacing any previous one of that name.
 *
 * The client check is here as well as at render because a hidden control is not
 * a closed one — but it is the `setDoc` that can actually be refused, and the
 * error a caller sees on a forged role comes from the rules, not from this.
 */
export async function fileEmployeeDocument(
  profile: UserProfile | null,
  params: {
    employeeId: string;
    name: string;
    type: string;
    uploaded: string;
    size: string;
  },
): Promise<EmployeeDocument> {
  if (!profile) throw new EmployeeDocumentError('Not signed in.');

  const name = params.name.trim();
  if (!name) throw new EmployeeDocumentError('A document needs a name.');
  if (name.length > 200) throw new EmployeeDocumentError('That document name is too long.');

  const category = documentCategory(name);
  if (!canFileDocuments(profile, category, params.employeeId)) {
    throw new EmployeeDocumentError(
      category === 'primary'
        ? 'Primary documents are uploaded by the employee themselves or by HR.'
        : 'Secondary documents are uploaded by an administrator or by HR.',
    );
  }

  const orgId = employeeDocumentOrgId(profile);
  const record: EmployeeDocument = {
    id: employeeDocumentId(orgId, params.employeeId, name),
    orgId,
    employeeId: params.employeeId,
    name,
    type: params.type,
    // Newly filed is always unverified: a document arrives claiming nothing
    // about itself, and an administrator says whether it checks out.
    status: 'Pending',
    uploaded: params.uploaded,
    size: params.size,
    uploadedByUid: profile.uid,
  };

  await setDoc(doc(Collections.employeeDocuments, record.id), record);
  return record;
}

/**
 * Mark a filed document verified, pending or expired.
 *
 * A merge write of the one field, so it cannot double as a way to rename a
 * document into the other category — which the rules also refuse.
 */
export async function setEmployeeDocumentStatus(
  profile: UserProfile | null,
  documentId: string,
  status: DocumentStatus,
): Promise<void> {
  if (!profile) throw new EmployeeDocumentError('Not signed in.');
  await setDoc(doc(Collections.employeeDocuments, documentId), { status }, { merge: true });
}

/** Remove a filed document. Org administrators only, in the rules as well. */
export async function deleteEmployeeDocument(documentId: string): Promise<void> {
  await deleteDoc(doc(Collections.employeeDocuments, documentId));
}
