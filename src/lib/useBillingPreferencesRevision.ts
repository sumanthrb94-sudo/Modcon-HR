import { useEffect, useState } from 'react';

import { BILLING_PREFERENCES_CHANGED_EVENT } from '@/data/billing';

export function useBillingPreferencesRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bumpRevision = () => setRevision((current) => current + 1);

    window.addEventListener(BILLING_PREFERENCES_CHANGED_EVENT, bumpRevision);
    window.addEventListener('storage', bumpRevision);

    return () => {
      window.removeEventListener(BILLING_PREFERENCES_CHANGED_EVENT, bumpRevision);
      window.removeEventListener('storage', bumpRevision);
    };
  }, []);

  return revision;
}
