/**
 * Where each check-in and check-out was captured.
 *
 * ## Why this is not part of the attendance record
 *
 * Attendance records live in the localStorage overlay (`src/data/attendance.ts`),
 * which the employee's own browser owns. That is acceptable for a time somebody
 * typed and useless for evidence somebody may want to falsify: anyone can open
 * devtools and edit `modcon.hr.attendanceRecords`. A feature whose entire point
 * is that a stamp cannot be quietly improved after the fact has to put the
 * stamp somewhere its author cannot reach.
 *
 * So the stamp goes to Firestore, and `firestore.rules` — not this file — is
 * what makes it evidence:
 *
 *   - `create` only by the employee themselves (`isSelf`), so a manager cannot
 *     manufacture one. The same principle the check-in button already follows.
 *   - **No `update` and no `delete` by the employee, ever.** A stamp recorded
 *     outside the fence stays recorded outside the fence. This is the single
 *     most important line in the whole feature.
 *   - `recordedAt` must be `request.time`, so the moment is the server's and
 *     not the device's.
 *   - The geofence verdict is **recomputed in the rules** from the
 *     organisation's own fence document, so a client cannot post
 *     `outcome: 'inside'` while its own coordinates say otherwise.
 *   - The review is a separate, admin-only field-set, so HR's finding cannot be
 *     written by the person it is about.
 *
 * ## What this does not prove
 *
 * That the coordinates are true. Nothing in a browser can: the Geolocation API
 * reports whatever the platform hands it, and on a rooted or developer-mode
 * device that is whatever a mock-location app says. The integrity signals in
 * `data/geofenceRules.ts` are heuristics that raise a flag, and the flag goes
 * to a person. `verdict: 'falsified'` is HR's finding after checking whether
 * the employee was actually in the office — it is never the system's own
 * conclusion, and deliberately so.
 *
 * A server-side attestation (Play Integrity / App Attest via a Cloud Function)
 * is the real answer to mock providers, and it needs a mobile app and a
 * backend this project does not have. The migration path: keep this collection
 * and this shape, and have the Function verify an attestation token before
 * writing. Nothing above the storage layer would change.
 */
import { useEffect, useState } from 'react';
import { Timestamp, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { Collections } from '@/lib/db';
import { DEFAULT_ORG_KEY } from '@/lib/orgScope';
import { nowInstant } from '@/lib/today';
import type { UserProfile } from '@/lib/auth';
import type { AttendanceStamp, AttendanceStampReview } from '@/types';
import type { GeofenceVerdict, LocationFix, GeofenceMode } from '@/data/geofenceRules';

/**
 * The `orgId` stamped on an attendance stamp.
 *
 * `'default'`, never null, for the legacy org — a null is invisible to
 * `where('orgId','==',…)`, which is the filter every list read here depends
 * on. Same reasoning as `payslipOrgId`.
 */
export function stampOrgId(profile: UserProfile | null): string {
  return profile?.orgId || DEFAULT_ORG_KEY;
}

/**
 * One stamp per employee per day per kind.
 *
 * Deterministic, so a second check-in on a day already stamped lands on the
 * document it would duplicate — and is then refused by the rules, because
 * `create` on an existing document fails. That is the behaviour we want:
 * `recordCheckIn` is already a no-op on a day already checked in, and the
 * first stamp is the one that happened.
 */
export function stampId(
  orgId: string,
  employeeId: string,
  date: string,
  kind: 'in' | 'out',
): string {
  return `${orgId}__${employeeId}__${date}__${kind}`;
}

/**
 * Normalise a stored stamp for the app.
 *
 * `recordedAt` is written as a server timestamp and therefore comes back as a
 * Firestore `Timestamp`, while everything above this module wants the ISO
 * string every other date in the app is. Converting here rather than at each
 * call site is what keeps `AttendanceStamp.recordedAt` honestly typed as a
 * string.
 */
function normalizeStamp(id: string, data: Record<string, unknown>): AttendanceStamp {
  const recordedAt = data.recordedAt;
  return {
    ...(data as unknown as AttendanceStamp),
    id,
    recordedAt:
      recordedAt instanceof Timestamp
        ? recordedAt.toDate().toISOString()
        : typeof recordedAt === 'string'
          ? recordedAt
          : '',
  };
}

/**
 * File a stamp.
 *
 * Returns the document it wrote, or null when the write was refused. A refusal
 * is not swallowed silently by the caller: the check-in panel says the stamp
 * could not be filed, because a check-in whose evidence did not land is
 * exactly the case this feature exists to notice.
 *
 * `recordedAt` is written as `serverTimestamp()`, and that is not a nicety:
 * `firestore.rules` requires the stored value to equal `request.time`, so a
 * client-supplied instant — even an honest one — is refused. The device's
 * clock does not get a vote on when somebody arrived.
 */
export async function fileAttendanceStamp(input: {
  profile: UserProfile | null;
  employeeId: string;
  date: string;
  kind: 'in' | 'out';
  fix: LocationFix | null;
  verdict: GeofenceVerdict;
  mode: GeofenceMode;
}): Promise<AttendanceStamp | null> {
  const { profile, employeeId, date, kind, fix, verdict, mode } = input;
  if (!profile?.uid || !employeeId) return null;

  const orgId = stampOrgId(profile);
  const id = stampId(orgId, employeeId, date, kind);

  const stamp: AttendanceStamp = {
    id,
    orgId,
    employeeId,
    date,
    kind,
    // Replaced by `serverTimestamp()` on the way out; kept here so the object
    // this function returns is complete for the caller that just filed it.
    recordedAt: nowInstant(),
    lat: fix ? fix.lat : null,
    lng: fix ? fix.lng : null,
    // Infinity is what `captureLocationFix` uses for "would not say", and it is
    // not representable in JSON or Firestore. Null carries the same meaning
    // here and survives the round trip.
    accuracyMetres: fix && Number.isFinite(fix.accuracyMetres) ? fix.accuracyMetres : null,
    siteId: verdict.siteId,
    siteName: verdict.siteName,
    distanceMetres: verdict.distanceMetres,
    outcome: verdict.outcome,
    mode,
    signals: verdict.signals.map((signal) => signal.code),
    employeeUid: profile.uid,
  };

  try {
    await setDoc(doc(Collections.attendanceStamps, id), {
      ...stamp,
      recordedAt: serverTimestamp(),
    } as unknown as AttendanceStamp);
    return stamp;
  } catch (err) {
    console.warn('[attendance-stamps] could not file stamp:', err);
    return null;
  }
}

/**
 * Record HR's finding on a stamp.
 *
 * Only the review fields move — the rules refuse an update that touches
 * anything else, so "review this stamp" cannot double as "correct where it
 * says I was".
 */
export async function reviewAttendanceStamp(input: {
  profile: UserProfile | null;
  stampId: string;
  verdict: AttendanceStampReview['verdict'];
  note: string;
  reviewerName: string;
}): Promise<boolean> {
  const { profile, stampId: id, verdict, note, reviewerName } = input;
  if (!profile?.uid) return false;

  const review: AttendanceStampReview = {
    verdict,
    note: note.trim().slice(0, 500),
    reviewedAt: nowInstant(),
    reviewedByUid: profile.uid,
    reviewedByName: reviewerName,
  };

  try {
    await updateDoc(doc(Collections.attendanceStamps, id), { review });
    return true;
  } catch (err) {
    console.warn('[attendance-stamps] could not record review:', err);
    return false;
  }
}

/**
 * Every stamp for one organisation, newest first.
 *
 * Filtered on `orgId` because a list is evaluated against every document it
 * returns and fails whole if one belongs to another tenant — an unfiltered
 * read here is denied, not merely wasteful. For an employee the rules
 * additionally require `isSelf`, so their query must filter on `employeeId`
 * too; `useMyAttendanceStamps` is that read.
 */
export function useOrgAttendanceStamps(profile: UserProfile | null, enabled = true) {
  const [data, setData] = useState<AttendanceStamp[]>([]);
  const [loading, setLoading] = useState(enabled);
  const orgId = stampOrgId(profile);

  useEffect(() => {
    if (!enabled || !profile?.uid) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      query(Collections.attendanceStamps, where('orgId', '==', orgId)),
      (snap) => {
        setData(
          snap.docs
            .map((d) => normalizeStamp(d.id, d.data() as unknown as Record<string, unknown>))
            .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
        );
        setLoading(false);
      },
      (err) => {
        console.warn('[attendance-stamps] org subscription failed:', err);
        setData([]);
        setLoading(false);
      },
    );
    return unsub;
  }, [enabled, orgId, profile?.uid]);

  return { data, loading };
}

/** One employee's own stamps. Filters on `employeeId` because the rules require it. */
export function useMyAttendanceStamps(profile: UserProfile | null, employeeId: string | null) {
  const [data, setData] = useState<AttendanceStamp[]>([]);
  const orgId = stampOrgId(profile);

  useEffect(() => {
    if (!profile?.uid || !employeeId) {
      setData([]);
      return;
    }
    const unsub = onSnapshot(
      query(
        Collections.attendanceStamps,
        where('orgId', '==', orgId),
        where('employeeId', '==', employeeId),
      ),
      (snap) => {
        setData(
          snap.docs
            .map((d) => normalizeStamp(d.id, d.data() as unknown as Record<string, unknown>))
            .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
        );
      },
      (err) => {
        console.warn('[attendance-stamps] own subscription failed:', err);
        setData([]);
      },
    );
    return unsub;
  }, [orgId, profile?.uid, employeeId]);

  return data;
}

/**
 * The stamps worth a person's attention.
 *
 * A stamp is flagged when it fell outside a fence, when no position could be
 * captured at all, or when any integrity signal was raised — and has not yet
 * been reviewed. `exempt` and `no-sites` never appear: neither says anything
 * about the employee, only about the configuration.
 */
export function needsReview(stamp: AttendanceStamp): boolean {
  if (stamp.review) return false;
  if (stamp.outcome === 'exempt' || stamp.outcome === 'no-sites') return false;
  return stamp.outcome !== 'inside' || stamp.signals.length > 0;
}

/** The most recent position this employee's own stamps recorded, for impossible-travel. */
export function lastKnownFix(
  stamps: AttendanceStamp[],
): { lat: number; lng: number; capturedAtMs: number } | null {
  for (const stamp of stamps) {
    if (stamp.lat !== null && stamp.lng !== null) {
      const capturedAtMs = Date.parse(stamp.recordedAt);
      if (!Number.isNaN(capturedAtMs)) {
        return { lat: stamp.lat, lng: stamp.lng, capturedAtMs };
      }
    }
  }
  return null;
}
