/**
 * Keeps the local subscription cache in step with Firestore.
 *
 * Same shape as `startOrgSettingsSync` in lib/orgSettings.ts: subscribe at
 * sign-in, write what the server says into the localStorage cache the data
 * module reads synchronously, and never push the other way. The client has no
 * writer for this collection at all — see data/subscription.ts on why.
 */
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type { UserProfile } from './auth';
import { cacheSubscription, type Subscription } from '@/data/subscription';

export const SUBSCRIPTIONS_COLLECTION = 'subscriptions';

/**
 * Subscribe to this organisation's subscription record.
 *
 * Returns a teardown. A super admin has no `orgId` of their own, so there is
 * nothing to subscribe to — they read subscriptions per organisation from the
 * Organizations page instead.
 */
export function startSubscriptionSync(profile: UserProfile | null): () => void {
  const orgId = profile?.orgId;
  if (!orgId) return () => {};

  return onSnapshot(
    doc(db, SUBSCRIPTIONS_COLLECTION, orgId),
    (snap) => {
      // A missing document is a real answer — the organisation has never been
      // subscribed — and is cached as such rather than left showing whatever
      // the last session saw.
      cacheSubscription(snap.exists() ? (snap.data() as Subscription) : null);
    },
    (err) => {
      // Denied or offline. The cache stands: billing state is not an access
      // control boundary, so a failed read must not lock a paying customer out
      // of their own HR system.
      console.warn('[billing] subscription sync unavailable; cached state stands.', err);
    },
  );
}
