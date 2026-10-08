import type { Employee, EmploymentType, Gender } from '@/types';
import type { UserProfile } from '@/lib/auth';
import { addEmployeeToDirectory, getEmployeeDirectory, getNextEmployeeSequence, locations } from '@/data/employees';
import { addDepartmentToDirectory, departments } from '@/data/departments';
import { addLocationToDirectory, normalizeLocation } from '@/data/locations';
import { linkAccountForEmployee } from '@/data/employeeLinks';
import { syncHrRoleForEmployee } from '@/data/roleAssignments';
import { syncManagerChains } from '@/lib/reportingChains';

/**
 * The one way a person is created.
 *
 * It lived inside the Employees page while that page was the only place
 * anybody was hired from. The guided setup imports a whole team from a CSV,
 * and a second copy of this for it would be a second chance to omit the
 * account link — so it moved here, and both call it.
 */

/** The same details, cleaned and typed, ready to become an Employee. */
export interface EmployeeDetails {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  designation: string;
  department: Employee['department'];
  location: string;
  employmentType: EmploymentType;
  gender?: Gender;
  dateOfBirth: string;
  dateOfJoining: string;
  ctc: number;
  reportingManagerId: string | null;
  /** Statutory identifiers, when the source had them — see Employee.pan. */
  pan?: string;
  uan?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
}

export type Notify = (message: string) => void;

/**
 * Make sure a department exists, and return the name to file someone under.
 *
 * Both the hire and a manager created alongside them can name a department
 * that does not exist yet, so this sits outside the dialog — one place,
 * covering both. An existing name matched case-insensitively wins, so typing
 * "design" joins Design instead of standing up a rival.
 */
function ensureDepartment(name: string): string {
  const known = departments.find((item) => item.toLowerCase() === name.toLowerCase());
  if (known) return known;
  addDepartmentToDirectory({ name, head: '—', headcount: 0 });
  return name;
}

/**
 * Declare a location the organisation has not used before.
 *
 * The dropdown's derived half would pick it up anyway once this employee is
 * saved — but only in this browser, and only for as long as somebody is
 * posted there. Declaring it makes it the organisation's, like the
 * department beside it. See data/locations.ts.
 */
function ensureLocation(name: string, notify: Notify): string {
  const location = normalizeLocation(name);
  if (!location) return name;
  const known = locations.find((item) => item.toLowerCase() === location.toLowerCase());
  if (known) return known;
  // The local half of this write is synchronous and has already happened by
  // the time the promise settles, so the list shows the new location either
  // way — which is exactly the problem when the organisation's copy was
  // refused. The next sign-in re-hydrates from Firestore and the location
  // silently disappears, looking like the app never accepted it. Say so.
  void addLocationToDirectory(location).then((published) => {
    if (!published) {
      notify(`"${location}" was saved on this employee, but could not be added to the company's location list. It may disappear from the list later — ask an administrator to add it in Settings → Locations.`);
    }
  });
  return location;
}

/**
 * Bring one person into being from the details a form collected, and put
 * everything that follows from a hire in step with them: the reporting
 * chains, the HR grant, the account link.
 *
 * Shared rather than held in the directory page, because people are now
 * created from two places — Add Employee there, and Add Reporting Manager on
 * a profile. A second copy of this would have been a second chance to omit
 * the account link, which fails closed and silently: without it
 * `firestore.rules` resolves that person's account to no employee, and they
 * read none of their own salary or leave.
 *
 * Nothing here is invented; every value came from the form.
 */
export function createEmployeeFromDetails(
  details: EmployeeDetails,
  { profile, notify }: { profile: UserProfile | null; notify: Notify },
): Employee {
  const directory = getEmployeeDirectory();
  const nextIndex = getNextEmployeeSequence(directory);
  // Somebody known by one name has no last name, and no trailing space either.
  const fullName = [details.firstName, details.lastName].filter(Boolean).join(' ');
  const manager = directory.find((candidate) => candidate.id === details.reportingManagerId);

  const employee: Employee = {
    // The code is HR's to type — the form only suggests one. `id` stays a
    // sequence this app assigns: it keys leave, attendance and the reporting
    // tree, and is not the number the organisation calls anyone by.
    id: `emp-${String(nextIndex).padStart(3, '0')}`,
    employeeCode: details.employeeCode,
    firstName: details.firstName,
    lastName: details.lastName,
    fullName,
    email: details.email,
    phone: details.phone,
    avatar: fullName,
    gender: details.gender,
    dateOfBirth: details.dateOfBirth,
    designation: details.designation,
    department: ensureDepartment(details.department),
    location: ensureLocation(details.location, notify),
    employmentType: details.employmentType,
    status: 'Active',
    dateOfJoining: details.dateOfJoining,
    reportingManagerId: details.reportingManagerId,
    reportingManagerName: manager?.fullName,
    ctc: details.ctc,
    // Address, blood group and marital status are personal details this form
    // does not ask for, so they stay unset and are filled in from Edit
    // Profile. Address was previously the work location restated as though it
    // were a home address.
    skills: [],
    ...(details.pan ? { pan: details.pan } : {}),
    ...(details.uan ? { uan: details.uan } : {}),
    ...(details.bankAccountNumber ? { bankAccountNumber: details.bankAccountNumber } : {}),
    ...(details.bankIfsc ? { bankIfsc: details.bankIfsc } : {}),
  };

  addEmployeeToDirectory(employee);
  // A new joiner under a manager adds a branch to the reporting tree, so the
  // chains stamped on leave documents no longer describe it.
  if (details.reportingManagerId) void syncManagerChains();

  // Someone added to the HR department administers this company, so grant the
  // role now rather than waiting for an admin to remember. The directory write
  // above has already landed and is local; this one is remote and may fail, so
  // it is reported rather than allowed to fail the add.
  void syncHrRoleForEmployee(employee, profile).then((outcome) => {
    if (outcome === 'granted') {
      notify(`${employee.fullName} was added as ${employee.designation} and now has administrator access for this company.`);
    } else if (outcome === 'failed') {
      notify(`${employee.fullName} was added, but granting HR administrator access failed. Set their role from the Admin dashboard.`);
    }
  });

  // If this person already has an account, point it at the record just
  // created. See linkAccountForEmployee, which refuses to guess and reports
  // instead.
  void linkAccountForEmployee({
    employeeId: employee.id,
    email: employee.email,
    orgId: profile?.orgId || undefined,
    linkedBy: profile?.email ?? profile?.uid ?? 'unknown',
  }).then((outcome) => {
    if (outcome.status === 'ambiguous') {
      notify(`${employee.fullName} was added, but ${outcome.count} accounts share ${employee.email}, so none was linked to this record. Link it from the Admin dashboard.`);
    } else if (outcome.status === 'conflict') {
      notify(`${employee.fullName} was added, but the account for ${employee.email} is already linked to another employee record. Repoint it from the Admin dashboard if that is wrong.`);
    } else if (outcome.status === 'failed') {
      notify(`${employee.fullName} was added, but linking their existing account to this record failed. Run the identity backfill from Settings → Database.`);
    }
  });

  return employee;
}
