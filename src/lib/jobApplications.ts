/**
 * Applying for a job posted on this app, and the reads that surface it.
 *
 * Recruitment already had job openings and a candidate pipeline, but no way in:
 * every candidate in it was typed there by a recruiter. This module is the way
 * in, and it has two doors onto one collection —
 *
 *   - the public careers page (`/careers/:orgKey`), read and written by
 *     somebody with no account in this organisation, who could not have one:
 *     you do not get a login at a company before it hires you; and
 *   - the Apply button inside Recruitment, which is internal mobility.
 *
 * **The public door is the only unauthenticated write in this application**, so
 * the interesting part of this feature is not the form, it is what the form is
 * allowed to say. Nothing here is that boundary — the checks below are UX, and
 * a hostile client simply would not run them. `firestore.rules` states the same
 * limits again and that copy is the one that decides: one shape of document,
 * only against a job the organisation has actually published as Open, only at
 * an id derived from the applicant's own address, and no read of any kind back
 * out. An applicant cannot read, edit or delete what they submitted, and cannot
 * see anybody else's.
 *
 * What neither copy can do is rate-limit — Firestore rules have no request
 * counter. A flood of applications under varying addresses will land, and this
 * project has already lost a day to an exhausted Firestore quota. The real
 * answer is App Check, which is not provisioned on this project; until it is,
 * the deterministic document id below (one application per address per job) is
 * the whole of the defence.
 *
 * The resume PDF rides inside the document, base64-encoded, sharing the
 * `readAsBase64` seam in src/lib/handbookStorage.ts — no Cloud Storage bucket
 * is provisioned here and Storage rules cannot read Firestore to check a role.
 * Replacing that seam replaces this feature's transport along with the other
 * two.
 */
import { useEffect, useState } from 'react';
import { doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { Collections } from '@/lib/db';
import { readAsBase64, formatBytes } from '@/lib/handbookStorage';
import { DEFAULT_ORG_KEY } from '@/lib/orgScope';
import { nowInstant, todayIso } from '@/lib/today';
import type {
  Candidate,
  CandidateStage,
  JobApplication,
  JobApplicationSource,
} from '@/types';

export const RESUME_CONTENT_TYPE = 'application/pdf';

/**
 * Largest resume accepted, in bytes. Mirrored in firestore.rules.
 *
 * Same arithmetic as `HANDBOOK_MAX_BYTES` and `PAYSLIP_MAX_BYTES`: Firestore's
 * ceiling is 1 MiB for the whole document, base64 costs 4 bytes per 3, and the
 * cover note plus the metadata need headroom.
 */
export const RESUME_MAX_BYTES = 720 * 1024;

/** Largest cover note accepted. Mirrored in firestore.rules. */
export const COVER_NOTE_MAX_CHARS = 4000;

export class JobApplicationError extends Error {}

export { formatBytes };

/**
 * Deterministic document id: one application per address per job.
 *
 * Not cosmetic. A random id per submission is an unauthenticated caller writing
 * an unbounded number of documents; this id is the only bound there is, because
 * rules cannot count requests. It also makes a double-tap on Apply land on the
 * same document rather than two, and it is why a second application from the
 * same address is refused rather than silently duplicated — see `submit` below.
 */
export function jobApplicationId(orgId: string, jobId: string, email: string): string {
  return `${orgId}__${jobId}__${normaliseEmail(email)}`;
}

/**
 * The address as it is stored and as it appears in the document id.
 *
 * Lowercased so `A@b.com` and `a@b.com` are one applicant rather than two, and
 * so the id the client computes matches the one the rules recompute from the
 * payload. Trimmed because a trailing space in a pasted address would otherwise
 * become part of the document id.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Shape check only — deliverability is not something this app can know. */
export function isPlausibleEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normaliseEmail(email));
}

// ---------------------------------------------------------------------------
// Submitting
// ---------------------------------------------------------------------------

export interface JobApplicationDraft {
  name: string;
  email: string;
  phone: string;
  currentCompany?: string;
  experienceYears: number;
  coverNote?: string;
  resume: File;
}

/** Validate and encode the chosen resume. UX only — the rules assert the same. */
async function encodeResume(file: File): Promise<{ contentBase64: string; sizeBytes: number }> {
  if (file.type !== RESUME_CONTENT_TYPE) {
    throw new JobApplicationError(`${file.name} is not a PDF. Please attach your resume as a PDF.`);
  }
  if (file.size === 0) {
    throw new JobApplicationError(`${file.name} is empty.`);
  }
  if (file.size > RESUME_MAX_BYTES) {
    throw new JobApplicationError(
      `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(RESUME_MAX_BYTES)}.`,
    );
  }
  return { contentBase64: await readAsBase64(file), sizeBytes: file.size };
}

/**
 * File an application against a published job opening.
 *
 * `setDoc` at a deterministic id, and the rules allow `create` but not a public
 * `update`, so a second application from the same address to the same job is
 * refused by the server. That refusal is deliberate and is reported as such
 * rather than swallowed: quietly overwriting would let anyone who knows an
 * applicant's address — it is half the document id — replace their application,
 * and quietly succeeding would tell them they had applied twice when they had
 * not.
 */
export async function submitJobApplication(params: {
  orgId: string;
  jobId: string;
  jobTitle: string;
  source: JobApplicationSource;
  /** The signed-in applicant. Required for 'Internal', absent for 'Website'. */
  submittedByUid?: string;
  draft: JobApplicationDraft;
}): Promise<JobApplication> {
  const { draft } = params;
  const name = draft.name.trim();
  const email = normaliseEmail(draft.email);

  if (!name) throw new JobApplicationError('Please enter your name.');
  if (!isPlausibleEmail(email)) throw new JobApplicationError('Please enter a valid email address.');
  if (!draft.phone.trim()) throw new JobApplicationError('Please enter a phone number.');
  if (!Number.isInteger(draft.experienceYears) || draft.experienceYears < 0 || draft.experienceYears > 60) {
    throw new JobApplicationError('Years of experience must be a whole number between 0 and 60.');
  }
  if ((draft.coverNote?.length ?? 0) > COVER_NOTE_MAX_CHARS) {
    throw new JobApplicationError(`The cover note is limited to ${COVER_NOTE_MAX_CHARS} characters.`);
  }
  if (params.source === 'Internal' && !params.submittedByUid) {
    throw new JobApplicationError('Not signed in.');
  }

  const { contentBase64, sizeBytes } = await encodeResume(draft.resume);
  const orgId = params.orgId || DEFAULT_ORG_KEY;
  const id = jobApplicationId(orgId, params.jobId, email);

  const record: JobApplication = {
    id,
    orgId,
    jobId: params.jobId,
    jobTitle: params.jobTitle.slice(0, 160),
    name: name.slice(0, 120),
    email,
    phone: draft.phone.trim().slice(0, 32),
    experienceYears: draft.experienceYears,
    source: params.source,
    stage: 'Applied',
    appliedOn: todayIso(),
    submittedAt: nowInstant(),
    resumeFileName: draft.resume.name.slice(0, 200),
    resumeContentType: RESUME_CONTENT_TYPE,
    resumeSizeBytes: sizeBytes,
    resumeContentBase64: contentBase64,
    // Firestore rejects `undefined`, and the rules whitelist the keys, so an
    // optional field is either present with a value or not present at all.
    ...(draft.currentCompany?.trim() ? { currentCompany: draft.currentCompany.trim().slice(0, 120) } : {}),
    ...(draft.coverNote?.trim() ? { coverNote: draft.coverNote.trim() } : {}),
    ...(params.source === 'Internal' ? { submittedByUid: params.submittedByUid } : {}),
  };

  // The id is not stored as a field — it *is* the id, and the rules recompute
  // it from orgId/jobId/email, so a stored copy could disagree with it.
  const { id: _id, ...payload } = record;
  try {
    await setDoc(doc(Collections.jobApplications, id), payload as JobApplication);
  } catch (err) {
    if ((err as { code?: string }).code === 'permission-denied') {
      throw new JobApplicationError(
        'This application could not be submitted. You may have already applied for this role with this email address, or the role may have closed.',
      );
    }
    throw err;
  }
  return record;
}

// ---------------------------------------------------------------------------
// Reading (organisation side)
// ---------------------------------------------------------------------------

/**
 * Live applications for one organisation.
 *
 * Filtered on `orgId` because it must be: a list is evaluated against every
 * document it returns and fails whole if one belongs to another tenant, so an
 * unfiltered read is denied outright rather than merely wasteful.
 *
 * Only an organisation's administrators may read this at all — an applicant
 * cannot read back even their own, which is why there is no employee-side hook
 * here. The resume bytes ride along in every document; at one document per
 * applicant per role that is affordable, and it would not be if this listed
 * every organisation at once.
 */
export function useJobApplications(orgId: string | null | undefined, enabled = true): {
  applications: JobApplication[];
  loading: boolean;
  error: Error | null;
} {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const key = orgId || DEFAULT_ORG_KEY;

  useEffect(() => {
    if (!enabled) {
      setApplications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // onSnapshot with an error callback rather than the `subscribe` helper in
    // db.ts, which takes none: rules deploy separately from the app, so a
    // denied listener is a real state and must not leave this stuck loading.
    const unsub = onSnapshot(
      query(Collections.jobApplications, where('orgId', '==', key)),
      (snap) => {
        setApplications(
          snap.docs
            .map((d) => ({ ...d.data(), id: d.id }))
            .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err as Error);
        setApplications([]);
        setLoading(false);
      },
    );
    return unsub;
  }, [key, enabled]);

  return { applications, loading, error };
}

/**
 * Move an application through the pipeline.
 *
 * Stage only. The rules refuse a write that touches anything else, so an
 * "advance" cannot also rewrite the name, the address or the resume — which is
 * the difference between advancing an application and replacing it.
 */
export async function setJobApplicationStage(id: string, stage: CandidateStage): Promise<void> {
  await updateDoc(doc(Collections.jobApplications, id), { stage });
}

/**
 * An object URL for viewing or downloading an attached resume.
 *
 * A Blob URL rather than a `data:` URL so the browser's PDF viewer and the
 * download attribute both behave. Callers must revoke it.
 */
export function resumeBlobUrl(contentBase64: string): string {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: RESUME_CONTENT_TYPE }));
}

// ---------------------------------------------------------------------------
// Joining the pipeline
// ---------------------------------------------------------------------------

/** Prefix that marks a pipeline card as an application rather than a `Candidate`. */
export const APPLICATION_CANDIDATE_PREFIX = 'application:';

/** True when a pipeline id came from `asCandidate` below. */
export function isApplicationCandidateId(id: string): boolean {
  return id.startsWith(APPLICATION_CANDIDATE_PREFIX);
}

/** The application id behind a pipeline card, or null if it is a plain candidate. */
export function applicationIdFromCandidateId(id: string): string | null {
  return isApplicationCandidateId(id) ? id.slice(APPLICATION_CANDIDATE_PREFIX.length) : null;
}

/**
 * An application as it appears in the candidate pipeline.
 *
 * One pipeline, two stores behind it. Recruiters should not have to look in two
 * places for the people applying to one role, and a board that showed only the
 * candidates a recruiter typed in would report zero for a job the organisation
 * had just published and received applications for.
 *
 * `rating: 0` because the applicant does not rate themselves and nobody has yet
 * — distinct from a 1 that would say somebody looked and was unimpressed.
 */
export function asCandidate(application: JobApplication): Candidate {
  return {
    id: `${APPLICATION_CANDIDATE_PREFIX}${application.id}`,
    name: application.name,
    email: application.email,
    phone: application.phone,
    jobId: application.jobId,
    jobTitle: application.jobTitle,
    stage: application.stage,
    appliedOn: application.appliedOn,
    rating: 0,
    source: application.source,
    currentCompany: application.currentCompany,
    experienceYears: application.experienceYears,
  };
}
