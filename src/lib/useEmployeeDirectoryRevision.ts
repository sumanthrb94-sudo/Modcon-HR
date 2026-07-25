import { useEffect, useState } from 'react';

import { EMPLOYEE_DIRECTORY_CHANGED_EVENT } from '@/data/employees';

export function useEmployeeDirectoryRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bumpRevision = () => setRevision((current) => current + 1);

    window.addEventListener(EMPLOYEE_DIRECTORY_CHANGED_EVENT, bumpRevision);
    window.addEventListener('storage', bumpRevision);

    return () => {
      window.removeEventListener(EMPLOYEE_DIRECTORY_CHANGED_EVENT, bumpRevision);
      window.removeEventListener('storage', bumpRevision);
    };
  }, []);

  return revision;
}