/**
 * The job openings an organisation has published where candidates can see them.
 *
 * Recruitment keeps its openings in the local overlay (`src/data/recruitment.ts`),
 * which is right for a recruiter's own board and useless to a candidate: it is
 * localStorage, so a role posted in one browser exists in that browser and
 * nowhere else. A careers page is read by somebody who has never opened this
 * app, so the roles it lists have to be on the server.
 *
 * Publishing is therefore an explicit act with its own button, not a side
 * effect of posting. Two reasons it is worth the extra click:
 *
 *   - `Draft` is a status this app already has. A board that published every
 *     opening the moment it was typed would put drafts on the internet.
 *   - The openings seeded for the demo, and any posted before this feature
 *     existed, are local-only. An explicit control lets an administrator put
 *     those live one at a time instead of needing a migration.
 *
 * Reads split the same way the audience does. `usePublicJobOpenings` is what an
 * unauthenticated visitor runs, and it filters on `status == 'Open'` because it
 * must: the rules expose open roles only, and a list is evaluated against every
 * document it returns, so a query that asked for the rest would be denied whole
 * rather than trimmed. `useOrgJobPostings` is the administrator's view of what
 * is currently live, whatever its status.
 */
import { useEffect, useState } from 'react';
import {
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  type DocumentReference,
} from 'firebase/firestore';
import { Collections } from '@/lib/db';
import { DEFAULT_ORG_KEY } from '@/lib/orgScope';
import type { JobOpening } from '@/types';

/**
 * A stored opening carries the tenant stamp every document in this database
 * carries; `JobOpening` itself does not, because the local overlay it also
 * describes is already namespaced by org in its storage key. Same shape the
 * seed writes (see src/lib/seed.ts, which stamps every collection it touches).
 */
type StoredJobOpening = JobOpening & { orgId: string };

/** The path a candidate is sent to for one organisation's open roles. */
export function careersPath(orgId: string | null | undefined): string {
  return `/careers/${encodeURIComponent(orgId || DEFAULT_ORG_KEY)}`;
}

/** The path for a single role, shareable on its own. */
export function careersJobPath(orgId: string | null | undefined, jobId: string): string {
  return `${careersPath(orgId)}/${encodeURIComponent(jobId)}`;
}

/**
 * Put a role on the careers page, or update the copy already there.
 *
 * The document id is the opening's own id, so republishing after an edit lands
 * on what it replaces instead of leaving two versions of one role on the page.
 */
export async function publishJobOpening(orgId: string, job: JobOpening): Promise<void> {
  const ref = doc(Collections.jobs, job.id) as DocumentReference<StoredJobOpening>;
  await setDoc(ref, { ...job, orgId: orgId || DEFAULT_ORG_KEY });
}

/**
 * Take a role off the careers page.
 *
 * Applications already received are not touched: they are the candidates'
 * records of having applied, and deleting them because the role closed would
 * empty the pipeline of the very people the role was posted to find. The rules
 * refuse a new application against a role that is no longer Open, which is the
 * part that actually needs to stop.
 */
export async function unpublishJobOpening(jobId: string): Promise<void> {
  await deleteDoc(doc(Collections.jobs, jobId));
}

/**
 * Open roles for one organisation, readable without an account.
 *
 * Both filters are load-bearing: `orgId` scopes the read to one tenant, and
 * `status` is what the public read rule allows. Dropping either turns a working
 * page into permission-denied.
 */
export function usePublicJobOpenings(orgKey: string): {
  jobs: JobOpening[];
  loading: boolean;
  error: Error | null;
} {
  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      query(
        Collections.jobs,
        where('orgId', '==', orgKey || DEFAULT_ORG_KEY),
        where('status', '==', 'Open'),
      ),
      (snap) => {
        setJobs(
          snap.docs
            .map((d) => ({ ...d.data(), id: d.id }))
            .sort((a, b) => b.postedOn.localeCompare(a.postedOn)),
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err as Error);
        setJobs([]);
        setLoading(false);
      },
    );
    return unsub;
  }, [orgKey]);

  return { jobs, loading, error };
}

/**
 * Everything this organisation currently has published, for the administrator
 * who publishes it. Unlike the public read this is not filtered by status —
 * a role put live and later moved to On Hold is still on the page, and the
 * person who can take it down needs to be able to see that.
 */
export function useOrgJobPostings(orgId: string | null | undefined, enabled = true): {
  published: Map<string, JobOpening>;
  loading: boolean;
  error: Error | null;
} {
  const [published, setPublished] = useState<Map<string, JobOpening>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const key = orgId || DEFAULT_ORG_KEY;

  useEffect(() => {
    if (!enabled) {
      setPublished(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      query(Collections.jobs, where('orgId', '==', key)),
      (snap) => {
        setPublished(new Map(snap.docs.map((d) => [d.id, { ...d.data(), id: d.id }])));
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err as Error);
        setPublished(new Map());
        setLoading(false);
      },
    );
    return unsub;
  }, [key, enabled]);

  return { published, loading, error };
}
