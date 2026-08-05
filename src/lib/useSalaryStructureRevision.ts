import { useEffect, useState } from 'react';

import { SALARY_STRUCTURE_CHANGED_EVENT } from '@/data/salaryStructure';

/**
 * Re-render when the organisation's salary split changes.
 *
 * Needed by every surface that shows a breakdown, because those components stay
 * mounted while an administrator edits Settings in another tab — and because
 * `startOrgSettingsSync` hydrates the cache from Firestore after sign-in, which
 * is a change nobody on this machine made.
 */
export function useSalaryStructureRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bumpRevision = () => setRevision((current) => current + 1);

    window.addEventListener(SALARY_STRUCTURE_CHANGED_EVENT, bumpRevision);
    window.addEventListener('storage', bumpRevision);

    return () => {
      window.removeEventListener(SALARY_STRUCTURE_CHANGED_EVENT, bumpRevision);
      window.removeEventListener('storage', bumpRevision);
    };
  }, []);

  return revision;
}
