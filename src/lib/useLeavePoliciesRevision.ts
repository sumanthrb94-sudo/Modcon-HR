import { useEffect, useState } from 'react';

import { LEAVE_POLICIES_CHANGED_EVENT } from '@/data/leavePolicies';

export function useLeavePoliciesRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bumpRevision = () => setRevision((current) => current + 1);

    window.addEventListener(LEAVE_POLICIES_CHANGED_EVENT, bumpRevision);
    window.addEventListener('storage', bumpRevision);

    return () => {
      window.removeEventListener(LEAVE_POLICIES_CHANGED_EVENT, bumpRevision);
      window.removeEventListener('storage', bumpRevision);
    };
  }, []);

  return revision;
}
