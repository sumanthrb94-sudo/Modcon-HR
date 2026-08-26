/**
 * Viewer scoping — what the signed-in account is allowed to see.
 *
 * An admin sees the whole company. An employee sees only themselves: their own
 * directory card, their own leave, attendance, payslips, expenses, assets,
 * tickets and reviews. An account with no linked employee record sees nothing
 * and is blocked upstream by RequireAuth.
 *
 * Every page narrows its data through this module rather than filtering inline,
 * so the rule lives in one place. A page that still reaches for
 * `import { employees } from '@/data/employees'` is then the thing to grep for
 * — making the wrong pattern conspicuous is the point.
 *
 * IMPORTANT: this is presentation, not enforcement. It genuinely removes other
 * employees from view while the app reads the static fixtures in src/data, but
 * anything backed by live Firestore must ALSO be scoped in firestore.rules,
 * or an employee can query the collection directly and get everyone.
 */
import { useMemo } from 'react';
import { employees as allEmployees } from '@/data/employees';
import { useAuth } from '@/lib/auth';
import type { Employee } from '@/types';

export interface ViewerScope {
  /** The directory record this viewer acts as, or null when unlinked. */
  employee: Employee | null;
  /** True for admins: no narrowing is applied. */
  canSeeEveryone: boolean;
  /** False when the account has no employee record to scope to. */
  isLinked: boolean;
}

export function useViewerScope(): ViewerScope {
  const { linkedEmployee, canSeeEveryone, isLinked } = useAuth();
  return useMemo(
    () => ({ employee: linkedEmployee, canSeeEveryone, isLinked }),
    [linkedEmployee, canSeeEveryone, isLinked],
  );
}

/**
 * The employees this viewer may see: everyone for an admin, just themselves for
 * an employee, nobody when unlinked.
 *
 * Returns an array rather than a filter callback so call sites are a
 * one-for-one swap for the old module-level `employees` import.
 */
export function useVisibleEmployees(): Employee[] {
  const { employee, canSeeEveryone } = useViewerScope();
  return useMemo(() => {
    if (canSeeEveryone) return allEmployees;
    return employee ? [employee] : [];
  }, [employee, canSeeEveryone]);
}

/** Field names that carry an employee id across the various record types. */
export type OwnerKey = 'employeeId' | 'raisedById' | 'assignedToId' | 'approverId';

/**
 * Narrow any list of records to the ones belonging to this viewer.
 *
 * Admins get the list untouched. An employee gets only rows whose owner field
 * matches their id; an unlinked account gets nothing. Rows whose owner field is
 * absent or null are dropped for a scoped viewer rather than shown — an
 * unattributed record is not "yours", and defaulting the other way would leak.
 */
export function useOwnRecords<T>(rows: readonly T[], key: OwnerKey = 'employeeId'): T[] {
  const { employee, canSeeEveryone } = useViewerScope();
  return useMemo(() => {
    if (canSeeEveryone) return rows as T[];
    if (!employee) return [];
    return (rows as T[]).filter((row) => {
      const owner = (row as Record<string, unknown>)[key];
      return typeof owner === 'string' && owner === employee.id;
    });
  }, [rows, key, employee, canSeeEveryone]);
}

/**
 * Whether this viewer may open a particular employee's record. Used by the
 * detail route so a scoped viewer cannot reach a colleague by typing the URL.
 */
export function useCanViewEmployee(id: string | undefined): boolean {
  const { employee, canSeeEveryone } = useViewerScope();
  if (canSeeEveryone) return true;
  return Boolean(id) && id === employee?.id;
}
