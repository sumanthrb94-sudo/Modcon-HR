/**
 * Payslip PDFs uploaded by an administrator, and the reads that surface them.
 *
 * The app already *computes* a payslip from CTC and attendance
 * (`buildPayslip` in src/data/payroll.ts). That is a statement, not the
 * document payroll issued: the real payslip is a PDF produced outside this app,
 * and until now there was no way to get it to the person it belongs to. This
 * module is that path — an administrator uploads a month's PDFs, and each
 * employee sees their own on the Finance page, where the computed statement
 * already lives.
 *
 * Authorization note, the same one `src/lib/handbook.ts` carries: nothing here
 * is a security boundary. `canUploadPayslips` decides whether to *render* the
 * upload control, reading the client-controlled permission matrix. The gate is
 * `isOrgAdmin()` in firestore.rules — and, for reads, `isSelf()` against
 * `employee_links`, which is what makes "only your own payslip" mean anything.
 * A user who forges a role locally gets the button and then permission-denied.
 *
 * The bytes live in the document, base64-encoded, because this project has no
 * Cloud Storage bucket and Storage rules cannot read Firestore to check a role.
 * That decision, and what it would take to undo it, is written up in
 * src/lib/handbookStorage.ts — this module shares its `readAsBase64` seam so a
 * move to Cloud Storage moves both features at once.
 */
import { useEffect, useState } from 'react';
import { onSnapshot, query, setDoc, where, doc } from 'firebase/firestore';
import { Collections } from '@/lib/db';
import { getPermissionLevel, resolveAppRole } from '@/lib/accessControl';
import { getCurrentEmployeeRecord } from '@/lib/dataScope';
import { readAsBase64, formatBytes } from '@/lib/handbookStorage';
import { DEFAULT_ORG_KEY } from '@/lib/orgScope';
import { nowInstant } from '@/lib/today';
import type { UserProfile } from '@/lib/auth';
import type { Employee, PayslipDocument } from '@/types';

export const PAYSLIP_CONTENT_TYPE = 'application/pdf';

/**
 * Largest payslip PDF accepted, in bytes. Mirrored in firestore.rules.
 *
 * The same arithmetic as `HANDBOOK_MAX_BYTES`: Firestore's ceiling is 1 MiB for
 * the whole document, base64 costs 4 bytes per 3, and the metadata needs
 * headroom. A payslip is a one-page PDF, so this is generous rather than tight.
 */
export const PAYSLIP_MAX_BYTES = 720 * 1024;

export class PayslipUploadError extends Error {}

export { formatBytes };

/**
 * The `orgId` stamped on a payslip document.
 *
 * The `'default'` string, never null, for the legacy org — a null is invisible
 * to `where('orgId','==',…)`, which is the filter the list read depends on. Same
 * reasoning as `handbookOrgId`, written up there.
 */
export function payslipOrgId(profile: UserProfile | null): string {
  return profile?.orgId || DEFAULT_ORG_KEY;
}

/**
 * Deterministic document id: one payslip per employee per month.
 *
 * Re-uploading a month overwrites it. The alternative — a random id per upload —
 * accumulates near-identical documents that only differ by timestamp, and leaves
 * the reader to guess which of them payroll meant.
 */
export function payslipDocId(orgId: string, employeeId: string, month: string): string {
  return `${orgId}__${employeeId}__${month}`;
}

/** Whether to offer the upload control. Presentation only — see the file header. */
export function canUploadPayslips(profile: UserProfile | null): boolean {
  return getPermissionLevel('Payroll', resolveAppRole(profile)) === 'full';
}

/**
 * Live payslip documents for an organisation, newest month first.
 *
 * `employeeId` narrows the query to one person — which is not merely a
 * convenience for the Finance page: the rules evaluate a list against every
 * document it returns and fail the whole query if one is disallowed, so an
 * employee reading the unfiltered collection is denied outright rather than
 * silently handed their own rows.
 *
 * The PDF bytes ride along in every document. That is affordable at one month
 * per employee per document and would not be if this listed years at a time;
 * the month filter on the payroll side is what keeps it bounded.
 */
export function usePayslipDocuments(
  profile: UserProfile | null,
  employeeId?: string | null,
): { documents: PayslipDocument[]; loading: boolean; error: Error | null } {
  const [documents, setDocuments] = useState<PayslipDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const orgId = payslipOrgId(profile);

  useEffect(() => {
    if (!profile) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    // `employeeId === null` means "this account matched no employee record" —
    // distinct from `undefined`, which is the administrator's org-wide read.
    // Querying with null would ask for everyone's payslips and be denied.
    if (employeeId === null) {
      setDocuments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const constraints = [where('orgId', '==', orgId)];
    if (employeeId) constraints.push(where('employeeId', '==', employeeId));

    // onSnapshot with an error callback rather than the `subscribe` helper in
    // db.ts, which takes none: the rules deploy separately from the app, so a
    // denied listener is a real state and must not leave this stuck loading.
    const unsub = onSnapshot(
      query(Collections.payslipDocuments, ...constraints),
      (snap) => {
        setDocuments(
          snap.docs
            .map((d) => ({ ...d.data(), id: d.id }))
            .sort((a, b) => b.month.localeCompare(a.month)),
        );
        setLoading(false);
      },
      (err) => {
        setError(err as Error);
        setDocuments([]);
        setLoading(false);
      },
    );
    return unsub;
  }, [profile, orgId, employeeId]);

  return { documents, loading, error };
}

/** Validate and encode a chosen PDF. UX only — the rules assert the same limits. */
async function encodePayslip(file: File): Promise<{ contentBase64: string; sizeBytes: number }> {
  if (file.type !== PAYSLIP_CONTENT_TYPE) {
    throw new PayslipUploadError(`${file.name} is not a PDF.`);
  }
  if (file.size === 0) {
    throw new PayslipUploadError(`${file.name} is empty.`);
  }
  if (file.size > PAYSLIP_MAX_BYTES) {
    throw new PayslipUploadError(
      `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(PAYSLIP_MAX_BYTES)} — see the note in src/lib/handbookStorage.ts on raising it.`,
    );
  }
  return { contentBase64: await readAsBase64(file), sizeBytes: file.size };
}

/**
 * Upload one employee's payslip for one month, replacing any previous upload.
 *
 * `setDoc` rather than `addDoc`: the id carries the employee and the month, so
 * the write is idempotent and a re-run after a partial failure repairs itself
 * instead of duplicating.
 */
export async function uploadPayslipDocument(
  profile: UserProfile | null,
  params: { employee: Pick<Employee, 'id' | 'employeeCode'>; month: string; file: File },
): Promise<PayslipDocument> {
  if (!profile) throw new PayslipUploadError('Not signed in.');
  if (!/^\d{4}-\d{2}$/.test(params.month)) {
    throw new PayslipUploadError(`"${params.month}" is not a YYYY-MM month.`);
  }

  const { contentBase64, sizeBytes } = await encodePayslip(params.file);
  const orgId = payslipOrgId(profile);
  const id = payslipDocId(orgId, params.employee.id, params.month);
  const self = getCurrentEmployeeRecord(profile);

  const record: PayslipDocument = {
    id,
    orgId,
    employeeId: params.employee.id,
    employeeCode: params.employee.employeeCode,
    month: params.month,
    fileName: params.file.name.slice(0, 200),
    contentType: PAYSLIP_CONTENT_TYPE,
    sizeBytes,
    contentBase64,
    uploadedAt: nowInstant(),
    uploadedByUid: profile.uid,
    uploadedByName: self?.fullName || profile.displayName || profile.email,
  };

  await setDoc(doc(Collections.payslipDocuments, id), record);
  return record;
}

// ---------------------------------------------------------------------------
// Matching a pile of files to the people they belong to
// ---------------------------------------------------------------------------

export interface PayslipFileMatch {
  file: File;
  employee: Employee;
  /** True when a payslip for this employee and month has already been uploaded. */
  replaces: boolean;
}

export interface PayslipFileMiss {
  file: File;
  reason: string;
}

export interface PayslipMatchResult {
  matched: PayslipFileMatch[];
  unmatched: PayslipFileMiss[];
}

/** `MC-090_august.pdf` and `mc090 aug.PDF` both reduce to `MC090AUGUSTPDF`. */
function squash(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Work out which employee each chosen file belongs to, by the employee code in
 * its name.
 *
 * Matching on the code rather than the person's name because a code is unique
 * and a name is not: two people called Priya Nair would silently share a
 * payslip. Anything that does not resolve to exactly one employee is returned
 * as a miss with the reason, and the caller shows it — a file quietly dropped
 * from a payroll run is worse than one the administrator has to look at.
 */
export function matchPayslipFiles(
  files: File[],
  employees: Employee[],
  options: { existingIds?: Set<string>; orgId: string; month: string } = {
    orgId: DEFAULT_ORG_KEY,
    month: '',
  },
): PayslipMatchResult {
  const matched: PayslipFileMatch[] = [];
  const unmatched: PayslipFileMiss[] = [];
  const claimed = new Map<string, string>(); // employeeId -> filename

  const candidates = employees
    .map((employee) => ({ employee, code: squash(employee.employeeCode) }))
    .filter((candidate) => candidate.code.length > 0)
    // Longest code first: with codes of differing length, `MC-9` would
    // otherwise claim a file meant for `MC-90`.
    .sort((a, b) => b.code.length - a.code.length);

  for (const file of files) {
    const name = squash(file.name);
    const hits = candidates.filter((candidate) => name.includes(candidate.code));

    if (hits.length === 0) {
      unmatched.push({ file, reason: 'No employee code in the filename' });
      continue;
    }
    // A longer code containing a shorter one is not ambiguity — `MC-090` and
    // `MC-09` both hit, but only the longest is what the name says.
    const best = hits.filter((hit) => hit.code.length === hits[0].code.length);
    if (best.length > 1) {
      unmatched.push({
        file,
        reason: `Matches ${best.map((hit) => hit.employee.employeeCode).join(' and ')}`,
      });
      continue;
    }

    const { employee } = best[0];
    const already = claimed.get(employee.id);
    if (already) {
      unmatched.push({ file, reason: `${employee.employeeCode} is already taken by ${already}` });
      continue;
    }
    claimed.set(employee.id, file.name);

    matched.push({
      file,
      employee,
      replaces: Boolean(
        options.month &&
          options.existingIds?.has(payslipDocId(options.orgId, employee.id, options.month)),
      ),
    });
  }

  return { matched, unmatched };
}

/**
 * An object URL for viewing or downloading a stored payslip.
 *
 * A Blob URL rather than a `data:` URL so the browser's PDF viewer and the
 * download attribute both behave. Callers must revoke it.
 */
export function payslipBlobUrl(contentBase64: string): string {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: PAYSLIP_CONTENT_TYPE }));
}
