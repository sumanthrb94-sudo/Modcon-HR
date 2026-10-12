/**
 * Which of their own updates (data/myUpdates.ts) a person has opened.
 *
 * Per account, per browser, in localStorage — a convenience about what has
 * been read, never a fact about the request, which is why it can live here
 * rather than in Firestore. Lost storage only means old updates show as new
 * again; the decision itself is on the record.
 */
import { useEffect, useState } from 'react';

const KEY = (uid: string) => `modcon.hr.seenUpdates.${uid}`;
export const SEEN_UPDATES_CHANGED_EVENT = 'modcon-hr-seen-updates-changed';

export function getSeenUpdates(uid: string | null | undefined): Set<string> {
  if (!uid || typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(KEY(uid));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function markUpdatesSeen(uid: string | null | undefined, ids: string[]): void {
  if (!uid || typeof window === 'undefined' || ids.length === 0) return;
  const seen = getSeenUpdates(uid);
  ids.forEach((id) => seen.add(id));
  try {
    // Bounded: only the most recent few hundred matter, since updates expire.
    window.localStorage.setItem(KEY(uid), JSON.stringify([...seen].slice(-300)));
  } catch {
    /* storage full or blocked: the update simply shows as unread again */
  }
  window.dispatchEvent(new Event(SEEN_UPDATES_CHANGED_EVENT));
}

/** Re-renders when this browser marks something seen. */
export function useSeenUpdatesRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const bump = () => setRevision((r) => r + 1);
    window.addEventListener(SEEN_UPDATES_CHANGED_EVENT, bump);
    return () => window.removeEventListener(SEEN_UPDATES_CHANGED_EVENT, bump);
  }, []);
  return revision;
}
