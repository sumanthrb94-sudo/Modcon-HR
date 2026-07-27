/**
 * Who can see whose records.
 *
 * Until now every people-data surface — attendance, leave, the directory —
 * showed the whole company to anyone whose role let them open the page. The
 * reporting hierarchy existed on the employee record but nothing consulted it.
 *
 * The rule this implements:
 *
 *   HR Manager  every employee in the organisation, top management included.
 *               HR is the function that must be able to see the CEO's leave
 *               balance, so it is deliberately not bounded by the reporting
 *               tree.
 *
 *   Manager     themselves, everyone beneath them in the reporting tree
 *               (however many levels deep), and the HR Manager — because HR
 *               reports up to them, their records are in scope even though HR
 *               does not sit under them on the org chart.
 *
 *   Admin       every employee. Platform-level administration.
 *
 *   Employee    themselves, and nobody else.
 *
 * This is a visibility rule, not an org-chart change: no employee's
 * `reportingManagerId` is rewritten to express it.
 */
import type { Employee } from '@/types';
import type { UserProfile } from '@/lib/auth';
import { getEmployeeDirectory } from '@/data/employees';
import { isHrDesignation } from '@/data/companyProfile';
import { resolveAppRole } from '@/lib/accessControl';
import { getCurrentEmployee } from '@/lib/currentEmployee';

/**
 * The employee records that represent the HR Manager(s).
 *
 * Anyone holding one of the job titles the company nominated as carrying the
 * HR function (Settings → Company Profile) — the same list that grants them
 * administrator access, so the two cannot disagree about who HR is. A company
 * that has nominated none has no HR Manager, and the Manager scope below simply
 * falls back to its own subtree.
 */
export function getHrManagers(directory: Employee[] = getEmployeeDirectory()): Employee[] {
  return directory.filter((employee) => isHrDesignation(employee.designation));
}

/** Every employee at or beneath `rootId` in the reporting tree, including it. */
function collectSubtree(rootId: string, directory: Employee[]): Set<string> {
  const childrenByManager = new Map<string, Employee[]>();
  directory.forEach((employee) => {
    const managerId = employee.reportingManagerId;
    if (!managerId) return;
    const siblings = childrenByManager.get(managerId);
    if (siblings) siblings.push(employee);
    else childrenByManager.set(managerId, [employee]);
  });

  const seen = new Set<string>();
  // Iterative rather than recursive: a cycle in the reporting data (A reports
  // to B reports to A) would otherwise overflow the stack, and this data is
  // editable from the profile page, so a cycle is reachable.
  const queue = [rootId];
  while (queue.length) {
    const id = queue.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    childrenByManager.get(id)?.forEach((report) => queue.push(report.id));
  }

  return seen;
}

/**
 * The employees `profile` is allowed to see. Returns the full directory for
 * roles that oversee the whole organisation, so callers can use this
 * unconditionally without a role check of their own.
 */
export function getVisibleEmployees(
  profile: UserProfile | null,
  directory: Employee[] = getEmployeeDirectory(),
): Employee[] {
  const role = resolveAppRole(profile);

  if (role === 'Admin' || role === 'HR Manager') return directory;

  const self = getCurrentEmployeeRecord(profile, directory);

  if (role === 'Manager') {
    // An account with no matching directory record has no subtree to show, but
    // is still a manager — give it the HR records only rather than everything.
    const visible = self ? collectSubtree(self.id, directory) : new Set<string>();
    getHrManagers(directory).forEach((manager) => visible.add(manager.id));
    return directory.filter((employee) => visible.has(employee.id));
  }

  return self ? [self] : [];
}

export function getVisibleEmployeeIds(
  profile: UserProfile | null,
  directory: Employee[] = getEmployeeDirectory(),
): Set<string> {
  return new Set(getVisibleEmployees(profile, directory).map((employee) => employee.id));
}

/** True when `profile` may see this specific employee's records. */
export function canViewEmployee(
  profile: UserProfile | null,
  employeeId: string,
  directory: Employee[] = getEmployeeDirectory(),
): boolean {
  return getVisibleEmployeeIds(profile, directory).has(employeeId);
}

/**
 * The signed-in person's own directory record, for any role.
 *
 * `getCurrentEmployee` deliberately returns undefined for non-Employee roles —
 * it backs the self-service pages, where a manager viewing "my payslip" would
 * be meaningless. Scoping needs the record regardless of role, so the same
 * uid-then-email match is applied here without that guard.
 */
function getCurrentEmployeeRecord(
  profile: UserProfile | null,
  directory: Employee[],
): Employee | undefined {
  if (!profile) return undefined;

  const byUid = directory.find((employee) => employee.authUid === profile.uid);
  if (byUid) return byUid;

  const email = profile.email.trim().toLowerCase();
  const byEmail = email
    ? directory.find((employee) => employee.email.trim().toLowerCase() === email)
    : undefined;
  if (byEmail) return byEmail;

  // Employee-role accounts additionally fall back to a display-name match.
  return getCurrentEmployee(profile);
}
