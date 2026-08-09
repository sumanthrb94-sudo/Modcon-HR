/**
 * Every organisation's subscription, for the one account entitled to see them.
 *
 * Super admins only — `firestore.rules` allows `list` on `/subscriptions` to
 * nobody else, because a list of who has paid is a platform view rather than a
 * tenant one. The `enabled` flag mirrors `useOrganizations`: pass
 * `isSuperAdmin`, so an ordinary account never issues a query the rules will
 * refuse.
 *
 * Not `useCollection` from lib/useFirestore.ts: that injects
 * `where('orgId','==',orgKey)`, which is exactly the filter this must not have.
 */
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type { Subscription } from '@/data/subscription';

export function useSubscriptions(enabled: boolean): {
  byOrgId: Map<string, Subscription>;
  loading: boolean;
} {
  const [byOrgId, setByOrgId] = useState<Map<string, Subscription>>(new Map());
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setByOrgId(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, 'subscriptions'),
      (snap) => {
        const next = new Map<string, Subscription>();
        snap.docs.forEach((d) => next.set(d.id, d.data() as Subscription));
        setByOrgId(next);
        setLoading(false);
      },
      (err) => {
        // Billing state is not an access boundary, so a failed read leaves the
        // page usable and simply shows nothing rather than an error.
        console.warn('[billing] could not list subscriptions.', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [enabled]);

  return { byOrgId, loading };
}
