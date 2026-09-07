/**
 * What is left to set up, derived from what has actually been set up.
 *
 * ## Why this is computed and not stored
 *
 * A checklist that records its own ticks is a checklist that lies. Somebody
 * ticks "holidays configured", a later administrator clears the calendar, and
 * the list still says it is done — while `chargeableLeaveDays` quietly stops
 * excluding any day and payroll deducts for days the company was shut. Every
 * item here asks the same getter the feature itself asks, so "done" cannot
 * disagree with the product. Nothing is written, which also means there is
 * nothing to migrate, nothing to reset, and no per-tenant state to keep in
 * step. Same reasoning as `data/celebrations.ts`.
 *
 * ## Why the list is a registry
 *
 * Adding a setup surface should be one entry here, not a new component. Each
 * task names the page that satisfies it and the consequence of leaving it
 * undone, because "Holidays — not set" tells an administrator nothing about
 * why they should care, and this app has several settings whose default is
 * deliberately *nothing at all* (the holiday calendar, the salary split, the
 * statutory registrations) precisely so that an unmade decision cannot pass
 * for a made one.
 *
 * ## Required versus optional
 *
 * Some of it is genuinely optional — an organisation with one office and no
 * geofencing is not misconfigured — and a checklist that can never reach the
 * end is one people stop opening. Optional tasks are listed, counted
 * separately, and never hold back "you're set up".
 */
import { getCompanyProfile } from '@/data/companyProfile';
import { getDepartmentDirectory } from '@/data/departments';
import { getCustomLocations } from '@/data/locations';
import { getEmployeeDirectory } from '@/data/employees';
import { getHolidayDirectory } from '@/data/holidays';
import { getDeclaredOrganisationWeekOff } from '@/data/weekOff';
import { getLeavePolicies } from '@/data/leavePolicies';
import { getSalaryStructure } from '@/data/salaryStructure';
import { getStatutoryConfig } from '@/data/statutory';
import { getGeofenceConfig } from '@/data/attendanceGeofence';
import { getTodayRecord } from '@/data/attendance';
import type { Employee } from '@/types';

export interface GettingStartedTask {
  id: string;
  title: string;
  /** What goes wrong while this is undone. Not a description of the screen. */
  why: string;
  /** Where it is done. */
  href: string;
  done: boolean;
  /**
   * Optional tasks are real work, not filler — they are just not true of every
   * organisation, so they never stand between one and a finished checklist.
   */
  optional?: boolean;
}

/**
 * The organisation's own setup, for whoever administers it.
 *
 * Order is the order it is worth doing in: who the company is, then the
 * structures people are filed under, then the people, then the rules that
 * decide what they are paid and when they are off.
 */
export function getOrganisationTasks(): GettingStartedTask[] {
  const profile = getCompanyProfile();
  const statutory = getStatutoryConfig();
  const schemesOn = statutory
    ? [
        statutory.epf?.enabled,
        statutory.esi?.enabled,
        statutory.professionalTax?.enabled,
        statutory.incomeTax?.enabled,
      ].some(Boolean)
    : false;

  return [
    {
      id: 'company-profile',
      title: 'Name the company',
      why: 'The legal name and GSTIN appear on payslips and returns. Until they are set those documents carry a blank.',
      href: '/settings?tab=company',
      done: Boolean(profile.name.trim() && profile.legalName.trim()),
    },
    {
      id: 'departments',
      title: 'Declare departments',
      why: 'Everyone is filed under one, and the HR department is what grants an HR designation its administrator access.',
      href: '/settings?tab=departments',
      done: getDepartmentDirectory().length > 0,
    },
    {
      id: 'locations',
      title: 'Declare work locations',
      why: 'An office nobody has declared exists only for as long as somebody is posted to it, and professional tax is worked out per state from these.',
      href: '/settings?tab=locations',
      done: getCustomLocations().length > 0,
    },
    {
      id: 'employees',
      title: 'Add your people',
      why: 'Everything else — attendance, leave, payroll — is about somebody. Give each of them a login from their own profile once they are here.',
      href: '/employees',
      done: getEmployeeDirectory().length > 0,
    },
    {
      id: 'week-off',
      title: 'Set the week off',
      why: 'It decides which day may go unworked without being marked absent. Undeclared, the company falls back to Sunday whether or not that is its day.',
      href: '/settings?tab=weekoff',
      done: getDeclaredOrganisationWeekOff() !== null,
    },
    {
      id: 'holidays',
      title: 'Publish the holiday calendar',
      why: 'No holiday means no day is excluded when leave is charged, and payroll deducts for days the company was shut.',
      href: '/settings?tab=holidays',
      done: getHolidayDirectory().length > 0,
    },
    {
      id: 'leave-policies',
      title: 'Set leave policies',
      why: 'Without them nobody accrues anything, so every leave request is against a balance of zero.',
      href: '/settings?tab=leave',
      done: getLeavePolicies().length > 0,
    },
    {
      id: 'salary-structure',
      title: 'Set the salary structure',
      why: 'How a gross becomes Basic, HRA and allowances. Unset, payslips show the right net pay and no breakdown — and PF is computed on Basic.',
      href: '/settings?tab=salary',
      done: getSalaryStructure() !== null,
    },
    {
      id: 'statutory',
      title: 'Declare payroll compliance',
      why: 'PF, ESI, professional tax and TDS are off until an establishment declares itself covered. Off is correct for some companies and a missed remittance for others.',
      href: '/settings?tab=statutory',
      done: schemesOn,
      optional: true,
    },
    {
      id: 'geofence',
      title: 'Draw attendance locations',
      why: 'Only if check-ins should be judged against where the company works. Run it advisory first — it refuses nobody while you find out what your office actually geolocates as.',
      href: '/settings?tab=geofence',
      done: getGeofenceConfig().mode !== 'off',
      optional: true,
    },
  ];
}

/**
 * What one employee has left to do, which is deliberately short.
 *
 * The first item is the one that matters and the one nobody can fix for
 * themselves: an account an administrator has not linked to an employee record
 * resolves to nobody, and reads none of its own attendance, leave or pay. It
 * fails closed and it fails silently, so it is worth saying out loud on the
 * one screen the person will actually open.
 */
export function getEmployeeTasks(
  employee: Employee | undefined,
  linkedEmployeeId: string | null,
): GettingStartedTask[] {
  const today = employee ? getTodayRecord(employee.id) : undefined;

  return [
    {
      id: 'linked',
      title: 'Connect your account to your record',
      why: 'Until an administrator links them, this app cannot tell which employee you are — so your attendance, leave and payslips are not shown to you.',
      href: '/employees',
      done: Boolean(linkedEmployeeId && employee),
    },
    {
      id: 'profile',
      title: 'Complete your profile',
      why: 'A phone number and date of birth. The date of birth is what the board wishes you a happy birthday from, and payroll needs it for statutory records.',
      href: employee ? `/employees/${employee.id}` : '/employees',
      done: Boolean(employee?.phone?.trim() && employee?.dateOfBirth?.trim()),
    },
    {
      id: 'check-in',
      title: 'Check in for today',
      why: 'A check-in is captured, not typed — it is what your day is measured from, and what a regularization corrects if it goes wrong.',
      href: '/my-attendance',
      done: Boolean(today?.checkIn),
      optional: true,
    },
  ];
}

/** How many of the tasks that actually gate a working organisation are left. */
export function outstandingCount(tasks: GettingStartedTask[]): number {
  return tasks.filter((task) => !task.done && !task.optional).length;
}
