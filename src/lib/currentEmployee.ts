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
import {
  addEmployeeToDirectory,
  getEmployeeByAuthUid,
  getEmployeeByEmail,
  getEmployeeDirectory,
  linkEmployeeToAuthAccount,
} from '@/data/employees';
import { getLinkedEmployeeId } from '@/data/employeeLinks';
import { resolveAppRole } from '@/lib/accessControl';
import type { UserProfile } from '@/lib/auth';
import type { Employee } from '@/types';

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getCurrentEmployee(profile: UserProfile | null) {
  if (!profile || resolveAppRole(profile) !== 'Employee') return undefined;
  return resolveEmployeeForAccount(profile, getEmployeeDirectory());
}

/**
 * Ensure an organization administrator or HR manager has an active employee
 * profile in the directory so they can punch in, record personal attendance,
 * and manage their own leave balances and requests.
 */
export function ensureAdminEmployeeRecord(
  profile: UserProfile,
  directory: Employee[] = getEmployeeDirectory(),
): Employee {
  const byEmail = directory.find((e) => e.email.toLowerCase() === profile.email.toLowerCase());
  if (byEmail) {
    if (!byEmail.authUid && profile.uid) {
      linkEmployeeToAuthAccount(byEmail.id, profile.uid);
    }
    return byEmail;
  }

  const rawName = profile.displayName?.trim() || profile.email.split('@')[0] || 'Admin';
  const nameParts = rawName.split(/\s+/);
  const firstName = nameParts[0] || 'Admin';
  const lastName = nameParts.slice(1).join(' ') || (profile.role === 'admin' ? 'Administrator' : 'HR');
  const fullName = profile.displayName?.trim() || `${firstName} ${lastName}`;
  const code = profile.role === 'admin' ? 'ADM-001' : 'HR-001';
  const id = `emp-${code.toLowerCase()}-${profile.uid ? profile.uid.slice(0, 6) : '01'}`;

  const adminEmployee: Employee = {
    id,
    employeeCode: code,
    firstName,
    lastName,
    fullName,
    email: profile.email,
    authUid: profile.uid,
    phone: '',
    avatar: fullName,
    gender: 'Female',
    dateOfBirth: '1992-05-15',
    designation: profile.role === 'admin' ? 'HR Administrator' : 'HR Manager',
    department: 'Human Resources',
    location: 'Headquarters',
    employmentType: 'Full-time',
    status: 'Active',
    dateOfJoining: '2023-01-01',
    reportingManagerId: null,
    ctc: 3600000,
    skills: ['People Operations', 'HR Administration', 'Talent Strategy'],
  };

  try {
    addEmployeeToDirectory(adminEmployee);
    if (profile.uid) {
      linkEmployeeToAuthAccount(adminEmployee.id, profile.uid);
    }
  } catch {
    // Graceful fallback in read-only test environments
  }
  return adminEmployee;
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
): Employee | undefined {
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
  if (displayName) {
    const byName = directory.find((employee) => normalize(employee.fullName) === displayName);
    if (byName) return byName;
  }

  // If this account is an administrator or HR manager and has no employee record yet,
  // ensure an active employee record exists so they can punch in, track attendance,
  // and manage their personal workspace.
  if (profile.role === 'admin' || profile.role === 'hr' || profile.superAdmin) {
    return ensureAdminEmployeeRecord(profile, directory);
  }

  return undefined;
}