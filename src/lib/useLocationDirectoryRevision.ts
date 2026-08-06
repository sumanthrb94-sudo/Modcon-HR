import { useEffect, useState } from 'react';

import { LOCATION_DIRECTORY_CHANGED_EVENT } from '@/data/locations';

/**
 * Re-render when the organisation's declared locations change.
 *
 * Needed by anything that stays mounted while the list is edited — Settings
 * itself, and any form holding a location dropdown open — and because
 * `startOrgSettingsSync` hydrates the list from Firestore after sign-in, which
 * is a change nobody on this machine made.
 */
export function useLocationDirectoryRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bump = () => setRevision((current) => current + 1);
    window.addEventListener(LOCATION_DIRECTORY_CHANGED_EVENT, bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener(LOCATION_DIRECTORY_CHANGED_EVENT, bump);
      window.removeEventListener('storage', bump);
    };
  }, []);

  return revision;
}
