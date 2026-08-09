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
import { resolveOrgKeyForProfile } from './orgScope';

export const SUBSCRIPTIONS_COLLECTION = 'subscriptions';

/**
 * Subscribe to the subscription record of the organisation this session is
 * working in.
 *
 * Keyed on the *active* organisation rather than `profile.orgId`, so a super
 * admin who has switched into a tenant sees that tenant's billing state. They
 * have no `orgId` of their own — they are the platform operator, not a
 * customer — and this used to bail on that, leaving whatever the last session
 * happened to cache on screen.
 *
 * Reading another organisation's record is legitimate here: `firestore.rules`
 * lets a super admin read any of them, and lets nobody else read one that is
 * not their own.
 */
export function startSubscriptionSync(profile: UserProfile | null): () => void {
  if (!profile) return () => {};
  const orgId = resolveOrgKeyForProfile(profile);
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
