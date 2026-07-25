import { useEffect, useState } from 'react';

import { NOTIFICATION_PREFERENCES_CHANGED_EVENT } from '@/data/notificationPreferences';

export function useNotificationPreferencesRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bumpRevision = () => setRevision((current) => current + 1);

    window.addEventListener(NOTIFICATION_PREFERENCES_CHANGED_EVENT, bumpRevision);
    window.addEventListener('storage', bumpRevision);

    return () => {
      window.removeEventListener(NOTIFICATION_PREFERENCES_CHANGED_EVENT, bumpRevision);
      window.removeEventListener('storage', bumpRevision);
    };
  }, []);

  return revision;
}
