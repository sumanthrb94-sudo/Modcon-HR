import { useEffect, useState } from 'react';

import { WEEK_OFF_CHANGED_EVENT } from '@/data/weekOff';

/**
 * Re-render when the organisation's week-off changes.
 *
 * `weekOffOf` reads the policy at call time, so anything that stays mounted
 * while an administrator edits it in Settings — the attendance grid, a
 * profile, the week strip on My Attendance — would otherwise go on drawing the
 * previous week-off. The policy is also hydrated from Firestore after sign-in,
 * so a page opened before that cache catches up needs this even when nobody
 * touches Settings.
 */
export function useWeekOffRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bumpRevision = () => setRevision((current) => current + 1);

    window.addEventListener(WEEK_OFF_CHANGED_EVENT, bumpRevision);
    window.addEventListener('storage', bumpRevision);

    return () => {
      window.removeEventListener(WEEK_OFF_CHANGED_EVENT, bumpRevision);
      window.removeEventListener('storage', bumpRevision);
    };
  }, []);

  return revision;
}
