/**
 * Who a payroll run pays — pure, so `npm run test:unit` reaches it.
 *
 * A run for a month pays the people on roll for that month: joined by its
 * last day, and not resigned. The Payroll page asks this before it previews a
 * run, and refuses to confirm one that would pay nobody.
 */
import type { Employee } from '@/types';

/** The last calendar day of a `YYYY-MM` month, as `YYYY-MM-DD`. */
export function lastDayOf(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
}

export function payeesFor<T extends Pick<Employee, 'status' | 'dateOfJoining'>>(employees: readonly T[], month: string): T[] {
  const end = lastDayOf(month);
  return employees.filter(
    (employee) => employee.status !== 'Resigned' && (!employee.dateOfJoining || employee.dateOfJoining <= end),
  );
}
