import { getCompanyProfile } from '@/data/companyProfile';
import type { Employee } from '@/types';

/**
 * When this app's attendance record of somebody begins.
 *
 * A company does not start existing the day it signs up. In the office
 * simulation, Sharma Engineering went live on 8 October and every employee's
 * calendar opened on "6 Red Flags … unregularized absences result in Loss of
 * Pay" for the 1st to the 7th, with a Bulk Regularize button offering to raise
 * them — sixteen people, six requests each, landing on two managers in week
 * one, for days that were worked and recorded somewhere else. A day with no
 * record before tracking began is not an absence; it is a day this app was not
 * there for.
 *
 * The record begins at the later of two dates: the organisation's go-live
 * (Settings → Company Profile, or the guided setup), and the person's own
 * joining date — the same reasoning, for somebody who joined mid-month.
 * Payroll is unaffected: it deducts only days explicitly marked Absent, never
 * days with no record at all.
 */
export function getGoLiveDate(): string {
  return getCompanyProfile().goLiveDate;
}

/** The first day this person's attendance is tracked here, or '' for "always". */
export function attendanceTrackedFrom(
  employee: Pick<Employee, 'dateOfJoining'> | null | undefined,
  goLiveDate: string = getGoLiveDate(),
): string {
  const joined = employee?.dateOfJoining ?? '';
  return joined > goLiveDate ? joined : goLiveDate;
}

/** True for a day before this person's attendance was tracked here. */
export function isBeforeAttendanceTracking(
  employee: Pick<Employee, 'dateOfJoining'> | null | undefined,
  date: string,
  goLiveDate: string = getGoLiveDate(),
): boolean {
  const from = attendanceTrackedFrom(employee, goLiveDate);
  return from !== '' && date < from;
}
