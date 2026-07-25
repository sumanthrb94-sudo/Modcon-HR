import { useEffect, useState } from 'react';

import { ACCESS_CONTROL_CHANGED_EVENT } from '@/lib/accessControl';

export function useAccessControlRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bump = () => setRevision((current) => current + 1);

    window.addEventListener(ACCESS_CONTROL_CHANGED_EVENT, bump);
    window.addEventListener('storage', bump);

    return () => {
      window.removeEventListener(ACCESS_CONTROL_CHANGED_EVENT, bump);
      window.removeEventListener('storage', bump);
    };
  }, []);

  return revision;
}
