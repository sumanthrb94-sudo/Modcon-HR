import { useEffect, useState } from 'react';

import { HOLIDAYS_CHANGED_EVENT } from '@/data/holidays';

export function useHolidayDirectoryRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bumpRevision = () => setRevision((current) => current + 1);

    window.addEventListener(HOLIDAYS_CHANGED_EVENT, bumpRevision);
    window.addEventListener('storage', bumpRevision);

    return () => {
      window.removeEventListener(HOLIDAYS_CHANGED_EVENT, bumpRevision);
      window.removeEventListener('storage', bumpRevision);
    };
  }, []);

  return revision;
}
