import { useEffect, useState } from 'react';

import { INTEGRATIONS_CHANGED_EVENT } from '@/data/integrations';

export function useIntegrationPreferencesRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bumpRevision = () => setRevision((current) => current + 1);

    window.addEventListener(INTEGRATIONS_CHANGED_EVENT, bumpRevision);
    window.addEventListener('storage', bumpRevision);

    return () => {
      window.removeEventListener(INTEGRATIONS_CHANGED_EVENT, bumpRevision);
      window.removeEventListener('storage', bumpRevision);
    };
  }, []);

  return revision;
}
