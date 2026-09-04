/**
 * Re-render when the signed-in account's employee link is hydrated or changes.
 *
 * The link is read synchronously from a localStorage cache
 * (`getLinkedEmployeeId`), and on the first sign-in in a browser that cache is
 * empty until the Firestore subscription's first snapshot lands. A component
 * that resolved "who am I" during that window and never looked again would
 * hold the fallback answer — the directory's email match — for the life of the
 * page, which is exactly the disagreement the link exists to settle.
 *
 * It also carries the other direction: an administrator unlinking an account
 * mid-session, which is supposed to take that employee's own records away from
 * it there and then rather than at the next reload.
 */
import { useCollectionRevision } from '@/lib/useCollectionRevision';
import { EMPLOYEE_LINK_CHANGED_EVENT } from '@/data/employeeLinks';

export function useMyEmployeeLinkRevision(): number {
  return useCollectionRevision(EMPLOYEE_LINK_CHANGED_EVENT);
}
