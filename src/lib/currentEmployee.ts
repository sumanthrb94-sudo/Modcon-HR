/**
 * Which employee record the signed-in account is — for the surfaces that only
 * ask about an Employee-role account's own data.
 *
 * The order below is the whole of it, and the first step is the one that
 * matters: `employee_links/{uid}` is an administrator-authored document and it
 * is what `myEmployeeId()` in firestore.rules resolves. Everything after it is
 * the client matching itself against a directory that lives in localStorage —
 * a claim, not evidence. Both existed; only the second was consulted, so the
 * UI could act as one person while every server write was judged as another.
 * A check-in stamp is refused by `isSelf`, a payslip cannot be read, and none
 * of it says why.
 *
 * The fallbacks stay because an account with no link is ordinary — accounts
 * predate the link, and the identity backfill in Settings → Database is how
 * they get one — and answering "nobody" for all of them would take people's
 * own leave and attendance away from them. What the fallbacks cannot do is
 * override an administrator: where a link exists it decides, including when it
 * names a record this directory does not hold, which is `undefined` rather
 * than a guess.
 */
import { getEmployeeByAuthUid, getEmployeeByEmail, getEmployeeDirectory } from '@/data/employees';
import { getLinkedEmployeeId } from '@/data/employeeLinks';
import { resolveAppRole } from '@/lib/accessControl';
import type { UserProfile } from '@/lib/auth';

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getCurrentEmployee(profile: UserProfile | null) {
  if (!profile || resolveAppRole(profile) !== 'Employee') return undefined;
  return resolveEmployeeForAccount(profile, getEmployeeDirectory());
}

/**
 * The resolution itself, role-independent — `getCurrentEmployeeRecord` in
 * lib/dataScope.ts is the same question asked about any role, and two copies
 * of this order is two chances for the surfaces to disagree about who somebody
 * is.
 */
export function resolveEmployeeForAccount(
  profile: UserProfile | null,
  directory = getEmployeeDirectory(),
) {
  if (!profile) return undefined;

  // What an administrator said, and what the server will act on.
  const linkedId = getLinkedEmployeeId(profile.uid);
  if (linkedId) return directory.find((employee) => employee.id === linkedId);

  // The uid stamp is written at sign-in when the address matched, and survives
  // profile edits, so it is tried before the email — which is editable and may
  // no longer be the address this account signs in with.
  const byUid = getEmployeeByAuthUid(profile.uid, directory);
  if (byUid) return byUid;

  const byEmail = getEmployeeByEmail(profile.email, directory);
  if (byEmail) return byEmail;

  const displayName = normalize(profile.displayName || '');
  if (!displayName) return undefined;

  return directory.find((employee) => normalize(employee.fullName) === displayName);
}