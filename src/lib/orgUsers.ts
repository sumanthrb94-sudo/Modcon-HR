/**
 * The `users` documents of one organisation, read the way the rules allow.
 *
 * The default organisation holds accounts written before multi-tenancy, which
 * carry no `orgId` — and an equality filter matches neither a missing field nor
 * a null one — so its readers asked for the whole collection. That needed the
 * platform-wide `admin` reach the rules no longer give an organisation's own
 * Administrator (only a super admin reads across organisations), so the
 * unfiltered read is tried first and, when refused, the filtered one answers:
 * every account the identity backfill has stamped. An unstamped legacy account
 * is then simply not found, and Settings → Database stamps it.
 */
import { collection, getDocs, query, where, type QuerySnapshot, type DocumentData } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_ORG_KEY } from './orgScope';

export async function getOrgUsers(orgKey: string): Promise<QuerySnapshot<DocumentData>> {
  if (orgKey === DEFAULT_ORG_KEY) {
    try {
      return await getDocs(collection(db, 'users'));
    } catch (err) {
      if ((err as { code?: string })?.code !== 'permission-denied') throw err;
    }
  }
  return getDocs(query(collection(db, 'users'), where('orgId', '==', orgKey)));
}
