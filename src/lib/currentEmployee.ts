import { getEmployeeByAuthUid, getEmployeeByEmail, getEmployeeDirectory } from '@/data/employees';
import { resolveAppRole } from '@/lib/accessControl';
import type { UserProfile } from '@/lib/auth';

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getCurrentEmployee(profile: UserProfile | null) {
  if (!profile || resolveAppRole(profile) !== 'Employee') return undefined;

  // The uid link is stamped at sign-in and survives profile edits, so it is
  // tried before the email — which is editable and therefore may no longer
  // be the address this account signs in with.
  const byUid = getEmployeeByAuthUid(profile.uid);
  if (byUid) return byUid;

  const byEmail = getEmployeeByEmail(profile.email);
  if (byEmail) return byEmail;

  const displayName = normalize(profile.displayName || '');
  if (!displayName) return undefined;

  return getEmployeeDirectory().find((employee) => normalize(employee.fullName) === displayName);
}