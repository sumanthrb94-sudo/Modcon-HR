import { useEffect, useState } from 'react';

import { COMPANY_PROFILE_CHANGED_EVENT } from '@/data/companyProfile';

export function useCompanyProfileRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bumpRevision = () => setRevision((current) => current + 1);

    window.addEventListener(COMPANY_PROFILE_CHANGED_EVENT, bumpRevision);
    window.addEventListener('storage', bumpRevision);

    return () => {
      window.removeEventListener(COMPANY_PROFILE_CHANGED_EVENT, bumpRevision);
      window.removeEventListener('storage', bumpRevision);
    };
  }, []);

  return revision;
}
