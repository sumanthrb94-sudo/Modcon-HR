/**
 * Employee handbook — reads, and the publish operation.
 *
 * Authorization note, because the shape of this file invites the wrong
 * assumption: nothing here is a security boundary. `canPublishHandbook` decides
 * whether to *render* the upload panel, and `getCurrentEmployeeRecord` supplies
 * a display name for attribution. Both read `resolveAppRole(profile)` and the
 * localStorage-backed employee directory, which the user controls — see
 * `src/data/employees.ts`. A user who forges `role: 'hr'` locally gets the
 * button and then a `permission-denied` from the server.
 *
 * The actual gate is `isHR()` in firestore.rules, reading `users/{uid}.role`,
 * a document only an administrator can write. Same split the rest of the app
 * uses; see docs/document-management-spec.md §5.
 */
import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Collections } from '@/lib/db';
import { resolveAppRole } from '@/lib/accessControl';
import { getCurrentEmployeeRecord } from '@/lib/dataScope';
import { nowInstant } from '@/lib/today';
import { encodeUpload, HANDBOOK_CONTENT_TYPE } from '@/lib/handbookStorage';
import type { UserProfile } from '@/lib/auth';
import type { HandbookPointer, HandbookVersion } from '@/types';

/** Longest accepted "what changed" note. Mirrored in firestore.rules. */
export const HANDBOOK_NOTES_MAX = 500;

/**
 * The pointer document id for a profile's organisation.
 *
 * `default` for accounts with no `orgId` — super admins and the legacy accounts
 * that predate multi-org support — matching `DEFAULT_ORG_KEY` and the
 * `handbookOrgKey()` helper the rules use to check the same thing server-side.
 */
export function handbookOrgKey(profile: UserProfile | null): string {
  return profile?.orgId || 'default';
}

/** The `orgId` field value for a profile: `null`, not `'default'`, for legacy orgs. */
export function handbookOrgId(profile: UserProfile | null): string | null {
  return profile?.orgId ?? null;
}

/**
 * Whether to offer the upload control. Presentation only — see the file header.
 * HR only, deliberately excluding platform Admin: see the spec §5 on the legacy
 * organisations this leaves without an uploader until their admin is converted.
 */
export function canPublishHandbook(profile: UserProfile | null): boolean {
  return resolveAppRole(profile) === 'HR Manager';
}

interface UseHandbookResult {
  /** Every version in the org, newest first. */
  versions: HandbookVersion[];
  pointer: HandbookPointer | null;
  /** The published version, or null if none has been published yet. */
  current: HandbookVersion | null;
  /**
   * Versions that exist but are not published — the residue of an upload whose
   * pointer write failed. HR can publish them without re-uploading.
   */
  unpublished: HandbookVersion[];
  loading: boolean;
  error: Error | null;
}

/**
 * Live handbook state for the signed-in profile's organisation.
 *
 * Versions are filtered to the caller's org client-side rather than with a
 * `where` clause: the collection is one document per handbook revision, so it
 * stays small, and a query would need a composite index for the ordering.
 */
export function useHandbook(profile: UserProfile | null): UseHandbookResult {
  const [versions, setVersions] = useState<HandbookVersion[]>([]);
  const [pointer, setPointer] = useState<HandbookPointer | null>(null);
  const [loadedVersions, setLoadedVersions] = useState(false);
  const [loadedPointer, setLoadedPointer] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const orgKey = handbookOrgKey(profile);
  const orgId = handbookOrgId(profile);

  useEffect(() => {
    if (!profile) {
      setVersions([]);
      setLoadedVersions(true);
      return;
    }
    // onSnapshot directly rather than the `subscribe` helper in db.ts: that
    // helper takes no error callback, so a denied listener would leave
    // `loadedVersions` false forever and the page stuck on "Loading…". The
    // denial is a real state here — the handbook rules deploy separately from
    // the app, so the app can be live against rules that do not know this
    // collection yet.
    const unsub = onSnapshot(
      Collections.handbookVersions,
      (snap) => {
        setVersions(
          snap.docs
            .map((d) => ({ ...d.data(), id: d.id }))
            .filter((v) => (v.orgId ?? null) === orgId)
            .sort((a, b) => b.version - a.version),
        );
        setLoadedVersions(true);
      },
      (err) => {
        setError(err as Error);
        setVersions([]);
        setLoadedVersions(true);
      },
    );
    return unsub;
  }, [profile, orgId]);

  useEffect(() => {
    if (!profile) {
      setPointer(null);
      setLoadedPointer(true);
      return;
    }
    const unsub = onSnapshot(
      doc(Collections.handbook, orgKey),
      (snap) => {
        setPointer(snap.exists() ? ({ ...snap.data(), id: snap.id } as HandbookPointer) : null);
        setLoadedPointer(true);
      },
      (err) => {
        setError(err as Error);
        setLoadedPointer(true);
      },
    );
    return unsub;
  }, [profile, orgKey]);

  const current = pointer
    ? versions.find((v) => v.id === pointer.currentVersionId) ?? null
    : null;

  return {
    versions,
    pointer,
    current,
    unpublished: versions.filter((v) => v.id !== pointer?.currentVersionId),
    loading: !loadedVersions || !loadedPointer,
    error,
  };
}

/** Next version number for an org. 1-based, monotonic, never reused. */
function nextVersionNumber(versions: HandbookVersion[]): number {
  return versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
}

export interface PublishResult {
  versionId: string;
  version: number;
  /**
   * True when the version document was written but the pointer was not. The
   * upload is not lost — it appears in history as unpublished and can be
   * published with `publishExistingVersion` without re-uploading.
   */
  pointerFailed: boolean;
}

/**
 * Upload a new handbook version and publish it.
 *
 * Two writes, deliberately not wrapped in a batch: the version document is the
 * durable artifact and the pointer is a cheap, repeatable follow-up. If the
 * pointer write fails, re-running the whole upload would burn another copy of
 * the PDF, so instead the version survives as unpublished and the UI offers a
 * one-click publish. Nothing is ever deleted on failure — a stranded version is
 * inert, because only the pointer makes a version live.
 */
export async function publishHandbookVersion(
  profile: UserProfile | null,
  file: File,
  notes: string,
  existingVersions: HandbookVersion[],
): Promise<PublishResult> {
  if (!profile) throw new Error('Not signed in.');

  const { contentBase64, sizeBytes } = await encodeUpload(file);

  const versionId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `hbk-${nowInstant()}-${Math.floor(Math.random() * 1e9)}`;
  const version = nextVersionNumber(existingVersions);
  const self = getCurrentEmployeeRecord(profile);

  const record: HandbookVersion = {
    id: versionId,
    orgId: handbookOrgId(profile),
    version,
    fileName: file.name.slice(0, 200),
    contentType: HANDBOOK_CONTENT_TYPE,
    sizeBytes,
    contentBase64,
    uploadedAt: nowInstant(),
    uploadedByUid: profile.uid,
    uploadedByName: self?.fullName || profile.displayName || profile.email,
    uploadedByEmployeeId: self?.id ?? null,
    notes: notes.trim().slice(0, HANDBOOK_NOTES_MAX),
  };

  await setDoc(doc(Collections.handbookVersions, versionId), record);

  try {
    await writePointer(profile, versionId, version);
  } catch {
    return { versionId, version, pointerFailed: true };
  }

  return { versionId, version, pointerFailed: false };
}

/**
 * Point the handbook at an existing version — publishing a stranded upload, or
 * reverting to a previous version after a bad one.
 *
 * Reverting is a pointer move rather than a delete, so the version that was
 * rolled back stays in the history where the audit trail expects it.
 */
export async function publishExistingVersion(
  profile: UserProfile | null,
  target: HandbookVersion,
): Promise<void> {
  if (!profile) throw new Error('Not signed in.');
  await writePointer(profile, target.id, target.version);
}

async function writePointer(profile: UserProfile, versionId: string, version: number) {
  const pointer: HandbookPointer = {
    orgId: handbookOrgId(profile),
    currentVersionId: versionId,
    currentVersion: version,
    updatedAt: nowInstant(),
    updatedByUid: profile.uid,
  };
  // setDoc, not updateDoc: the first publish has to create the document.
  await setDoc(doc(Collections.handbook, handbookOrgKey(profile)), pointer);
}
