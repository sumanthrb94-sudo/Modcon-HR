/**
 * This organisation's subscription, and what to say about it today.
 *
 * Re-reads on the cache event that `subscriptionSync` dispatches, so a webhook
 * landing while someone is looking at the billing page updates it without a
 * reload — which matters, because paying is exactly the moment a customer is
 * watching that screen.
 */
import { useEffect, useState } from 'react';
import {
  accessState,
  readCachedSubscription,
  SUBSCRIPTION_CHANGED_EVENT,
  type AccessState,
  type Subscription,
} from '@/data/subscription';

export function useSubscription(): { subscription: Subscription | null; access: AccessState } {
  const [subscription, setSubscription] = useState<Subscription | null>(() => readCachedSubscription());

  useEffect(() => {
    function refresh() {
      setSubscription(readCachedSubscription());
    }
    window.addEventListener(SUBSCRIPTION_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(SUBSCRIPTION_CHANGED_EVENT, refresh);
  }, []);

  return { subscription, access: accessState(subscription) };
}
