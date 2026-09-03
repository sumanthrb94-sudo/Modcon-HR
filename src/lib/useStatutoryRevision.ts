import { useEffect, useState } from 'react';

import { STATUTORY_CHANGED_EVENT } from '@/data/statutory';

/**
 * Re-render when the organisation's statutory registrations change.
 *
 * `getStatutoryConfig` reads at call time, so anything that stays mounted while
 * an administrator switches EPF on in Settings — a payslip, the payroll run
 * table, Finance — would otherwise go on showing pay computed without it. The
 * configuration is also hydrated from Firestore after sign-in, so a page opened
 * before that cache catches up needs this even when nobody touches Settings.
 *
 * The per-employee tax elections publish on the same event, the same reason
 * every other pair in the registry does: a payslip showing one person's regime
 * beside a deduction computed under the other is two statements about their pay
 * that disagree.
 */
export function useStatutoryRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bumpRevision = () => setRevision((current) => current + 1);

    window.addEventListener(STATUTORY_CHANGED_EVENT, bumpRevision);
    window.addEventListener('storage', bumpRevision);

    return () => {
      window.removeEventListener(STATUTORY_CHANGED_EVENT, bumpRevision);
      window.removeEventListener('storage', bumpRevision);
    };
  }, []);

  return revision;
}
