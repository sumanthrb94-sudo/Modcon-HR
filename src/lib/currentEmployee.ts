import { getEmployeeByEmail, getEmployeeDirectory } from '@/data/employees';
import { resolveAppRole } from '@/lib/accessControl';
import type { UserProfile } from '@/lib/auth';

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getCurrentEmployee(profile: UserProfile | null) {
  if (!profile || resolveAppRole(profile) !== 'Employee') return undefined;

  const byEmail = getEmployeeByEmail(profile.email);
  if (byEmail) return byEmail;

  const displayName = normalize(profile.displayName || '');
  if (!displayName) return undefined;

  return getEmployeeDirectory().find((employee) => normalize(employee.fullName) === displayName);
}