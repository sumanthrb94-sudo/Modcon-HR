import { useEffect, useState } from 'react';

import { LEAVE_REQUESTS_CHANGED_EVENT } from '@/data/leave';
import { CANDIDATES_CHANGED_EVENT, JOB_OPENINGS_CHANGED_EVENT } from '@/data/recruitment';
import { REVIEWS_CHANGED_EVENT } from '@/data/performance';

/**
 * Bumps whenever any record set the dashboard derives its cards from changes.
 * The directory/department/holiday directories have their own hooks; this
 * covers the approval-queue and recruitment/performance sources so stat cards
 * stay in step with the underlying records instead of going stale.
 */
export function useDashboardDataRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bumpRevision = () => setRevision((current) => current + 1);
    const events = [
      LEAVE_REQUESTS_CHANGED_EVENT,
      JOB_OPENINGS_CHANGED_EVENT,
      CANDIDATES_CHANGED_EVENT,
      REVIEWS_CHANGED_EVENT,
      'storage',
    ];

    events.forEach((event) => window.addEventListener(event, bumpRevision));
    return () => events.forEach((event) => window.removeEventListener(event, bumpRevision));
  }, []);

  return revision;
}
