import { useEffect, useState } from 'react';

import { DEPARTMENT_DIRECTORY_CHANGED_EVENT } from '@/data/departments';

export function useDepartmentDirectoryRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bumpRevision = () => setRevision((current) => current + 1);

    window.addEventListener(DEPARTMENT_DIRECTORY_CHANGED_EVENT, bumpRevision);
    window.addEventListener('storage', bumpRevision);

    return () => {
      window.removeEventListener(DEPARTMENT_DIRECTORY_CHANGED_EVENT, bumpRevision);
      window.removeEventListener('storage', bumpRevision);
    };
  }, []);

  return revision;
}