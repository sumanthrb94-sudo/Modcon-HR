import { useEffect, useState } from 'react';

import { ATTENDANCE_GEOFENCE_CHANGED_EVENT } from '@/data/attendanceGeofence';

/**
 * Re-render when the organisation's attendance geofence changes.
 *
 * `getGeofenceConfig` reads at call time, so anything that stays mounted while
 * an administrator moves a fence in Settings — the check-in panel, the Settings
 * list itself, the review queue — would otherwise go on drawing the previous
 * one. The configuration is also hydrated from Firestore after sign-in, so a
 * page opened before that cache catches up needs this even when nobody touches
 * Settings.
 *
 * The exemption list publishes on the same event: somebody ceasing to be
 * subject to the fence has to reach the check-in panel exactly as a moved fence
 * does.
 */
export function useAttendanceGeofenceRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bumpRevision = () => setRevision((current) => current + 1);

    window.addEventListener(ATTENDANCE_GEOFENCE_CHANGED_EVENT, bumpRevision);
    window.addEventListener('storage', bumpRevision);

    return () => {
      window.removeEventListener(ATTENDANCE_GEOFENCE_CHANGED_EVENT, bumpRevision);
      window.removeEventListener('storage', bumpRevision);
    };
  }, []);

  return revision;
}
