import type { Employee, Department, EmploymentType, EmployeeStatus, Gender, WeekOffDay } from '@/types';
import { WEEK_OFF_DAY_INDEX } from '@/types';
import { isMockDataCleared } from '@/lib/mockDataFlag';
import { orgScopedKey } from '@/lib/orgScope';
import { mergeLocations, LOCATION_DIRECTORY_CHANGED_EVENT } from '@/data/locations';

// ---------------------------------------------------------------------------
// Master employee directory — the single source of truth for people data.
// Every other module (attendance, leave, payroll, etc.) references these IDs.
// ---------------------------------------------------------------------------

interface Seed {
  code: string;
  first: string;
  last: string;
  email?: string;
  gender: Gender;
  designation: string;
  department: Department;
  location: string;
  type: EmploymentType;
  status: EmployeeStatus;
  doj: string;
  dob: string;
  managerId: string | null;
  ctc: number;
  skills: string[];
  /**
   * Rostered week-off. Absent means Sunday, which is most of the company.
   *
   * Set explicitly per person rather than computed from the array index. The
   * index trick is what put blood groups and marital statuses on people by
   * seat number (see buildEmployeeDirectory below) — and unlike those, a
   * week-off is a real rota an HR team publishes, so it should read as one:
   * the customer-facing teams below cover the weekend and take their day in
   * the week instead.
   */
  weekOff?: WeekOffDay;
  // Personal details an HR system only knows once someone supplies them.
  // Optional, and absent unless a seed actually carries one — they used to be
  // manufactured from the seed's array position (see buildEmployeeDirectory).
  phone?: string;
  bloodGroup?: string;
  maritalStatus?: 'Single' | 'Married';
  address?: string;
}

const seeds: Seed[] = [
  // Leadership
  { code: 'MC-001', first: 'Aarav', last: 'Sharma', gender: 'Male', designation: 'Chief Executive Officer', department: 'Operations', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2019-03-01', dob: '1982-06-12', managerId: null, ctc: 9600000, skills: ['Leadership', 'Strategy', 'Fundraising'], weekOff: 'Monday' },
  { code: 'MC-002', first: 'Diya', last: 'Mehta', gender: 'Female', designation: 'VP of Engineering', department: 'Engineering', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2019-07-15', dob: '1985-02-20', managerId: 'emp-001', ctc: 7200000, skills: ['Architecture', 'Team Building', 'Cloud'] },
  { code: 'MC-003', first: 'Rohan', last: 'Iyer', gender: 'Male', designation: 'VP of Product', department: 'Product', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2020-01-10', dob: '1986-11-05', managerId: 'emp-001', ctc: 6800000, skills: ['Product Strategy', 'Roadmapping'] },
  { code: 'MC-004', first: 'Ananya', last: 'Reddy', gender: 'Female', designation: 'Head of People', department: 'Human Resources', location: 'Hyderabad', type: 'Full-time', status: 'Active', doj: '2020-02-01', dob: '1987-09-18', managerId: 'emp-001', ctc: 5400000, skills: ['HR Strategy', 'Culture', 'Hiring'] },
  { code: 'MC-005', first: 'Vikram', last: 'Nair', gender: 'Male', designation: 'VP of Sales', department: 'Sales', location: 'Delhi', type: 'Full-time', status: 'Active', doj: '2020-05-20', dob: '1984-04-22', managerId: 'emp-001', ctc: 6600000, skills: ['Enterprise Sales', 'GTM'], weekOff: 'Monday' },
  { code: 'MC-006', first: 'Priya', last: 'Kapoor', gender: 'Female', designation: 'Head of Finance', department: 'Finance', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2020-06-15', dob: '1983-12-30', managerId: 'emp-001', ctc: 6200000, skills: ['FP&A', 'Compliance'] },

  // Engineering
  { code: 'MC-010', first: 'Karthik', last: 'Subramaniam', gender: 'Male', designation: 'Engineering Manager', department: 'Engineering', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2020-08-01', dob: '1988-07-14', managerId: 'emp-002', ctc: 4800000, skills: ['Backend', 'Distributed Systems', 'Go'] },
  { code: 'MC-011', first: 'Sneha', last: 'Patil', gender: 'Female', designation: 'Senior Software Engineer', department: 'Engineering', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2021-02-10', dob: '1991-03-08', managerId: 'emp-010', ctc: 3600000, skills: ['React', 'TypeScript', 'Node'] },
  { code: 'MC-012', first: 'Arjun', last: 'Verma', gender: 'Male', designation: 'Software Engineer', department: 'Engineering', location: 'Pune', type: 'Full-time', status: 'Active', doj: '2022-06-01', dob: '1995-10-25', managerId: 'emp-010', ctc: 2400000, skills: ['Java', 'Spring', 'Kafka'] },
  { code: 'MC-013', first: 'Meera', last: 'Krishnan', gender: 'Female', designation: 'Senior Software Engineer', department: 'Engineering', location: 'Bengaluru', type: 'Full-time', status: 'On Leave', doj: '2021-04-12', dob: '1990-08-19', managerId: 'emp-010', ctc: 3800000, skills: ['Python', 'ML', 'AWS'] },
  { code: 'MC-014', first: 'Rahul', last: 'Deshpande', gender: 'Male', designation: 'DevOps Engineer', department: 'Engineering', location: 'Pune', type: 'Full-time', status: 'Active', doj: '2022-01-17', dob: '1993-05-30', managerId: 'emp-010', ctc: 2800000, skills: ['Kubernetes', 'Terraform', 'CI/CD'] },
  { code: 'MC-015', first: 'Ishaan', last: 'Gupta', gender: 'Male', designation: 'Software Engineer Intern', department: 'Engineering', location: 'Bengaluru', type: 'Intern', status: 'Probation', doj: '2026-01-05', dob: '2002-11-11', managerId: 'emp-010', ctc: 600000, skills: ['React', 'CSS'] },
  { code: 'MC-016', first: 'Tara', last: 'Joshi', gender: 'Female', designation: 'QA Engineer', department: 'Engineering', location: 'Pune', type: 'Full-time', status: 'Active', doj: '2021-09-20', dob: '1992-02-14', managerId: 'emp-010', ctc: 2200000, skills: ['Automation', 'Cypress', 'QA'] },

  // Product & Design
  { code: 'MC-020', first: 'Nisha', last: 'Bhatt', gender: 'Female', designation: 'Senior Product Manager', department: 'Product', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2021-03-15', dob: '1989-06-27', managerId: 'emp-003', ctc: 4200000, skills: ['Analytics', 'Discovery', 'SQL'] },
  { code: 'MC-021', first: 'Aditya', last: 'Rao', gender: 'Male', designation: 'Product Manager', department: 'Product', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2022-08-01', dob: '1992-09-09', managerId: 'emp-003', ctc: 3200000, skills: ['Roadmap', 'A/B Testing'] },
  { code: 'MC-022', first: 'Kavya', last: 'Menon', gender: 'Female', designation: 'Lead Product Designer', department: 'Design', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2021-01-25', dob: '1990-12-03', managerId: 'emp-003', ctc: 3800000, skills: ['Figma', 'Design Systems', 'UX'] },
  { code: 'MC-023', first: 'Dev', last: 'Saxena', gender: 'Male', designation: 'Product Designer', department: 'Design', location: 'Remote', type: 'Full-time', status: 'Active', doj: '2022-11-10', dob: '1994-07-21', managerId: 'emp-022', ctc: 2600000, skills: ['UI', 'Prototyping', 'Illustration'] },

  // Sales
  { code: 'MC-030', first: 'Sanjay', last: 'Malhotra', gender: 'Male', designation: 'Sales Manager', department: 'Sales', location: 'Delhi', type: 'Full-time', status: 'Active', doj: '2021-02-01', dob: '1987-01-15', managerId: 'emp-005', ctc: 3600000, skills: ['Negotiation', 'CRM'], weekOff: 'Monday' },
  { code: 'MC-031', first: 'Pooja', last: 'Agarwal', gender: 'Female', designation: 'Account Executive', department: 'Sales', location: 'Delhi', type: 'Full-time', status: 'Active', doj: '2022-04-18', dob: '1993-08-08', managerId: 'emp-030', ctc: 2400000, skills: ['Closing', 'Demos'], weekOff: 'Tuesday' },
  { code: 'MC-032', first: 'Rishi', last: 'Khanna', gender: 'Male', designation: 'Sales Development Rep', department: 'Sales', location: 'Gurugram', type: 'Full-time', status: 'Notice Period', doj: '2023-01-09', dob: '1996-03-19', managerId: 'emp-030', ctc: 1800000, skills: ['Prospecting', 'Outreach'], weekOff: 'Monday' },
  { code: 'MC-033', first: 'Anjali', last: 'Singh', gender: 'Female', designation: 'Account Executive', department: 'Sales', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2022-07-22', dob: '1992-11-28', managerId: 'emp-030', ctc: 2500000, skills: ['Enterprise', 'Upsell'], weekOff: 'Tuesday' },

  // Marketing
  { code: 'MC-040', first: 'Neha', last: 'Chopra', gender: 'Female', designation: 'Marketing Manager', department: 'Marketing', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2021-06-01', dob: '1990-04-04', managerId: 'emp-001', ctc: 3400000, skills: ['Brand', 'Content', 'SEO'] },
  { code: 'MC-041', first: 'Varun', last: 'Pillai', gender: 'Male', designation: 'Content Strategist', department: 'Marketing', location: 'Remote', type: 'Full-time', status: 'Active', doj: '2022-09-12', dob: '1994-02-17', managerId: 'emp-040', ctc: 2000000, skills: ['Copywriting', 'Storytelling'] },
  { code: 'MC-042', first: 'Simran', last: 'Kaur', gender: 'Female', designation: 'Performance Marketer', department: 'Marketing', location: 'Bengaluru', type: 'Contract', status: 'Active', doj: '2023-03-01', dob: '1995-09-23', managerId: 'emp-040', ctc: 1900000, skills: ['Paid Ads', 'Analytics'] },

  // HR
  { code: 'MC-050', first: 'Ritu', last: 'Bansal', gender: 'Female', designation: 'HR Business Partner', department: 'Human Resources', location: 'Hyderabad', type: 'Full-time', status: 'Active', doj: '2021-05-10', dob: '1989-10-10', managerId: 'emp-004', ctc: 3000000, skills: ['Employee Relations', 'Policy'] },
  { code: 'MC-051', first: 'Amit', last: 'Trivedi', gender: 'Male', designation: 'Talent Acquisition Lead', department: 'Human Resources', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2021-08-16', dob: '1988-12-12', managerId: 'emp-004', ctc: 3200000, skills: ['Recruiting', 'Sourcing'] },
  { code: 'MC-052', first: 'Sara', last: 'Khan', gender: 'Female', designation: 'HR Executive', department: 'Human Resources', location: 'Hyderabad', type: 'Full-time', status: 'Active', doj: '2023-02-20', dob: '1997-06-06', managerId: 'emp-025', ctc: 1600000, skills: ['Onboarding', 'Payroll Ops'] },

  // Finance & Ops
  { code: 'MC-060', first: 'Manish', last: 'Goyal', gender: 'Male', designation: 'Financial Analyst', department: 'Finance', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2021-11-08', dob: '1991-07-07', managerId: 'emp-006', ctc: 2400000, skills: ['Modeling', 'Excel'] },
  { code: 'MC-061', first: 'Divya', last: 'Pandey', gender: 'Female', designation: 'Accountant', department: 'Finance', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2022-03-14', dob: '1993-01-29', managerId: 'emp-006', ctc: 1700000, skills: ['Accounting', 'GST'] },
  { code: 'MC-062', first: 'Harsh', last: 'Mehra', gender: 'Male', designation: 'Operations Manager', department: 'Operations', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2021-07-19', dob: '1989-05-16', managerId: 'emp-001', ctc: 3400000, skills: ['Process', 'Vendor Mgmt'], weekOff: 'Tuesday' },
  { code: 'MC-063', first: 'Lakshmi', last: 'Venkat', gender: 'Female', designation: 'Office Administrator', department: 'Operations', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2022-05-03', dob: '1990-03-25', managerId: 'emp-030', ctc: 1400000, skills: ['Admin', 'Facilities'], weekOff: 'Monday' },

  // Customer Success
  { code: 'MC-070', first: 'Gaurav', last: 'Sinha', gender: 'Male', designation: 'Customer Success Manager', department: 'Customer Success', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2021-10-11', dob: '1990-08-30', managerId: 'emp-001', ctc: 3000000, skills: ['Retention', 'Onboarding'], weekOff: 'Monday' },
  { code: 'MC-071', first: 'Ayesha', last: 'Sheikh', gender: 'Female', designation: 'Support Specialist', department: 'Customer Success', location: 'Remote', type: 'Full-time', status: 'Active', doj: '2022-12-05', dob: '1996-04-13', managerId: 'emp-032', ctc: 1500000, skills: ['Support', 'Zendesk'], weekOff: 'Tuesday' },
  { code: 'MC-072', first: 'Nikhil', last: 'Bose', gender: 'Male', designation: 'Implementation Specialist', department: 'Customer Success', location: 'Kolkata', type: 'Full-time', status: 'Active', doj: '2023-04-24', dob: '1994-11-02', managerId: 'emp-032', ctc: 1800000, skills: ['Integrations', 'Training'], weekOff: 'Monday' },

  // Legal
  { code: 'MC-080', first: 'Shreya', last: 'Desai', gender: 'Female', designation: 'Legal Counsel', department: 'Legal', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2022-02-28', dob: '1988-09-21', managerId: 'emp-001', ctc: 4000000, skills: ['Contracts', 'Compliance'] },
  { code: 'MC-081', first: 'Nandini', last: 'Rao', gender: 'Female', designation: 'Legal Associate', department: 'Legal', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2023-08-14', dob: '1994-05-09', managerId: 'emp-035', ctc: 2200000, skills: ['Contracts', 'Documentation', 'Compliance'] },
  { code: 'MC-082', first: 'Kabir', last: 'Mishra', gender: 'Male', designation: 'Legal Associate', department: 'Legal', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2024-01-08', dob: '1995-04-16', managerId: 'emp-036', ctc: 2100000, skills: ['Compliance', 'Policy', 'Contracts'] },

  // Demo employee accounts used for login walkthroughs
  { code: 'MC-090', first: 'Riya', last: 'Sharma', email: 'riya.sharma@modconhr.test', gender: 'Female', designation: 'Software Engineer', department: 'Engineering', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2022-09-05', dob: '1996-07-18', managerId: 'emp-010', ctc: 2600000, skills: ['React', 'TypeScript', 'Frontend'] },
  { code: 'MC-091', first: 'Arjun', last: 'Mehta', email: 'arjun.mehta@modconhr.test', gender: 'Male', designation: 'Operations Analyst', department: 'Operations', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2023-01-16', dob: '1995-02-11', managerId: 'emp-030', ctc: 2200000, skills: ['Reporting', 'Process Improvement'], weekOff: 'Tuesday' },
  { code: 'MC-092', first: 'Priya', last: 'Nair', email: 'priya.nair@modconhr.test', gender: 'Female', designation: 'Accountant', department: 'Finance', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2022-11-21', dob: '1994-10-06', managerId: 'emp-006', ctc: 2400000, skills: ['Accounting', 'Reconciliation'] },
  { code: 'MC-093', first: 'Karan', last: 'Verma', email: 'karan.verma@modconhr.test', gender: 'Male', designation: 'Customer Support Specialist', department: 'Customer Success', location: 'Remote', type: 'Full-time', status: 'Active', doj: '2023-04-03', dob: '1997-01-27', managerId: 'emp-032', ctc: 1800000, skills: ['Support', 'Communication'], weekOff: 'Tuesday' },
  { code: 'MC-094', first: 'Neha', last: 'Gupta', email: 'neha.gupta@modconhr.test', gender: 'Female', designation: 'HR Executive', department: 'Human Resources', location: 'Hyderabad', type: 'Full-time', status: 'Active', doj: '2023-06-12', dob: '1996-12-14', managerId: 'emp-004', ctc: 1900000, skills: ['Onboarding', 'People Ops'] },
];

function buildEmployeeDirectory(source: Seed[]): Employee[] {
  return source.map((s, idx) => {
    const id = `emp-${String(idx + 1).padStart(3, '0')}`;
    return {
      id,
      employeeCode: s.code,
      firstName: s.first,
      lastName: s.last,
      fullName: `${s.first} ${s.last}`,
      // Derived from the person's actual name, matching the corporate
      // convention — unlike the fields below, this follows from real data.
      email: s.email ?? `${s.first.toLowerCase()}.${s.last.toLowerCase()}@modcon.com`,
      phone: s.phone ?? '',
      avatar: `${s.first} ${s.last}`,
      gender: s.gender,
      dateOfBirth: s.dob,
      designation: s.designation,
      department: s.department,
      location: s.location,
      employmentType: s.type,
      status: s.status,
      dateOfJoining: s.doj,
      reportingManagerId: s.managerId,
      ctc: s.ctc,
      // Previously manufactured from the array index: blood group was
      // ['O+','A+','B+','AB+','O-'][idx % 5] and marital status was
      // idx % 3 === 0 ? 'Married' : 'Single', so a person's medical and
      // personal details were decided by where they sat in the seed list.
      // Address was the work location restated as if it were a home address.
      // All three are now absent unless supplied, and editable in the profile.
      bloodGroup: s.bloodGroup,
      maritalStatus: s.maritalStatus,
      address: s.address,
      skills: s.skills,
      weekOff: s.weekOff,
    };
  });
}

/**
 * The day this person does not work.
 *
 * Everything that asks "is this employee off today" goes through here rather
 * than reading `employee.weekOff`, so the Sunday default lives in one place.
 * The field is optional because most of the company never needed a row of its
 * own to say "Sunday", and because records created before week-offs existed
 * carry nothing — those people are not off every day of the week, they are off
 * on Sunday like everyone else.
 */
export function weekOffOf(employee: Pick<Employee, 'weekOff'> | null | undefined): WeekOffDay {
  return employee?.weekOff ?? 'Sunday';
}

/**
 * True when `isoDate` is this employee's week-off.
 *
 * The day index is read in UTC, matching how `YYYY-MM-DD` record dates parse
 * everywhere else in the app (see lib/today.ts) — `getDay()` would answer in
 * the viewer's zone and put the week-off on the wrong date for anyone west of
 * IST.
 */
export function isWeekOffFor(
  employee: Pick<Employee, 'weekOff'> | null | undefined,
  isoDate: string,
): boolean {
  return new Date(isoDate).getUTCDay() === WEEK_OFF_DAY_INDEX[weekOffOf(employee)];
}

const CUSTOM_EMPLOYEE_STORAGE_KEY = 'modcon.hr.customEmployees';
const DELETED_EMPLOYEE_STORAGE_KEY = 'modcon.hr.deletedEmployees';
export const EMPLOYEE_DIRECTORY_CHANGED_EVENT = 'modcon-hr-directory-changed';

export const employees: Employee[] = [];
export const locations: string[] = [];

function readCustomEmployees(): Employee[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(orgScopedKey(CUSTOM_EMPLOYEE_STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Employee[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCustomEmployees(items: Employee[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(CUSTOM_EMPLOYEE_STORAGE_KEY), JSON.stringify(items));
}

function readDeletedEmployeeIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(orgScopedKey(DELETED_EMPLOYEE_STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeDeletedEmployeeIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(DELETED_EMPLOYEE_STORAGE_KEY), JSON.stringify(ids));
}

function notifyEmployeeDirectoryChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EMPLOYEE_DIRECTORY_CHANGED_EVENT));
}

export function getEmployeeDirectory(): Employee[] {
  const deletedIds = new Set(readDeletedEmployeeIds());
  const seedEmployees = isMockDataCleared() ? [] : buildEmployeeDirectory(seeds);
  const combined = [...seedEmployees, ...readCustomEmployees()]
    .filter((employee) => !deletedIds.has(employee.id));
  const byEmployeeId = new Map<string, Employee>();
  combined.forEach((employee) => {
    byEmployeeId.set(employee.id, employee);
  });

  const directory = Array.from(byEmployeeId.values());
  const byId = new Map(directory.map((employee) => [employee.id, employee]));
  directory.forEach((employee) => {
    employee.reportingManagerName = employee.reportingManagerId
      ? byId.get(employee.reportingManagerId)?.fullName
      : undefined;
  });

  return directory;
}

function syncDirectorySnapshots() {
  const directory = getEmployeeDirectory();
  employees.splice(0, employees.length, ...directory);

  // Declared locations first, then wherever people actually work. Derived alone
  // meant a location existed only in the browser that invented it, and vanished
  // with the last employee posted there — see data/locations.ts.
  const merged = mergeLocations(directory.map((employee) => employee.location));
  locations.splice(0, locations.length, ...merged);
}

export function getNextEmployeeSequence(directory: Employee[] = getEmployeeDirectory()): number {
  return directory.reduce((max, employee) => {
    const match = Number.parseInt(employee.id.replace('emp-', ''), 10);
    return Number.isFinite(match) ? Math.max(max, match) : max;
  }, 0) + 1;
}

/**
 * The code the next hire would get if nobody typed one.
 *
 * A suggestion, not the answer: an employee code is the organisation's own
 * numbering — it names people on payslip filenames and on both CSV uploads —
 * so HR types it. This only saves them typing the obvious one.
 *
 * `ahead` looks further down that numbering, for a dialog holding two people
 * who do not exist yet: a hire and a manager being created alongside them
 * would otherwise both open on the same suggested code.
 */
export function suggestEmployeeCode(directory: Employee[] = getEmployeeDirectory(), ahead = 0): string {
  return `MC-${String(getNextEmployeeSequence(directory) + ahead).padStart(3, '0')}`;
}

/** Codes compare on their characters, not their punctuation: `MC-090` = `mc090`. */
function squashCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

/**
 * Is this code already somebody else's?
 *
 * Payroll matches uploaded payslips, salary splits and leave entitlements to
 * people by this code, and every one of those matchers ignores punctuation and
 * case — so `mc-090` is not a free code while `MC-090` exists. It is the same
 * person twice, and an upload naming them is refused as ambiguous rather than
 * applied to one of the two.
 */
/**
 * Are these two the same code?
 *
 * `isEmployeeCodeTaken` answers the same question against people who exist.
 * Two codes typed into one dialog — a hire, and a manager being created
 * alongside them — are both unsaved, so neither is in the directory yet and
 * that check passes for both. They still must not collide, and they compare
 * the way every code does: on characters, not punctuation or case.
 */
export function sameEmployeeCode(a: string, b: string): boolean {
  const left = squashCode(a);
  return left.length > 0 && left === squashCode(b);
}

export function isEmployeeCodeTaken(code: string, exceptEmployeeId?: string): boolean {
  const wanted = squashCode(code);
  if (!wanted) return false;
  return getEmployeeDirectory().some(
    (employee) => employee.id !== exceptEmployeeId && squashCode(employee.employeeCode ?? '') === wanted,
  );
}

export function addEmployeeToDirectory(employee: Employee) {
  const customEmployees = readCustomEmployees().filter((item) => item.id !== employee.id);
  const deletedEmployeeIds = readDeletedEmployeeIds().filter((id) => id !== employee.id);
  writeCustomEmployees([employee, ...customEmployees]);
  writeDeletedEmployeeIds(deletedEmployeeIds);
  syncDirectorySnapshots();
  notifyEmployeeDirectoryChanged();
}

export function updateEmployeeInDirectory(employee: Employee) {
  // An edit form has no reason to know about the auth link, so carry it over
  // rather than letting a payload built from form fields drop it.
  const existing = getEmployeeDirectory().find((item) => item.id === employee.id);
  const record: Employee = !employee.authUid && existing?.authUid
    ? { ...employee, authUid: existing.authUid }
    : employee;

  const customEmployees = readCustomEmployees().filter((item) => item.id !== employee.id);
  const deletedEmployeeIds = readDeletedEmployeeIds().filter((id) => id !== employee.id);
  writeCustomEmployees([record, ...customEmployees]);
  writeDeletedEmployeeIds(deletedEmployeeIds);
  syncDirectorySnapshots();
  notifyEmployeeDirectoryChanged();
}

export function deleteEmployeeFromDirectory(employeeId: string) {
  const customEmployees = readCustomEmployees().filter((item) => item.id !== employeeId);
  const deletedEmployeeIds = Array.from(new Set([...readDeletedEmployeeIds(), employeeId]));
  writeCustomEmployees(customEmployees);
  writeDeletedEmployeeIds(deletedEmployeeIds);
  syncDirectorySnapshots();
  notifyEmployeeDirectoryChanged();
}

/**
 * Move everyone in one department to another, in a single write.
 *
 * Renaming a department has to bring its people with it, or they end up
 * assigned to a department that no longer exists. Seed employees are
 * materialised as custom overrides here, since the seed array itself is
 * immutable — that is the same mechanism an individual edit already uses.
 *
 * Returns how many records moved.
 */
export function reassignEmployeeDepartment(fromDepartment: string, toDepartment: string): number {
  const affected = getEmployeeDirectory().filter((employee) => employee.department === fromDepartment);
  if (!affected.length) return 0;

  const movedIds = new Set(affected.map((employee) => employee.id));
  const untouched = readCustomEmployees().filter((employee) => !movedIds.has(employee.id));
  const moved = affected.map((employee) => ({ ...employee, department: toDepartment }));

  writeCustomEmployees([...moved, ...untouched]);
  syncDirectorySnapshots();
  notifyEmployeeDirectoryChanged();
  return moved.length;
}

/**
 * Move everyone posted at one location to another. Returns how many moved.
 *
 * The location counterpart of reassignEmployeeDepartment, and it exists for the
 * same reason: renaming a place must not leave the people in it pointing at a
 * name the organisation no longer offers, which reads on their profile as a
 * location the form insists does not exist.
 */
export function reassignEmployeeLocation(fromLocation: string, toLocation: string): number {
  const affected = getEmployeeDirectory().filter((employee) => employee.location === fromLocation);
  if (!affected.length) return 0;

  const movedIds = new Set(affected.map((employee) => employee.id));
  const untouched = readCustomEmployees().filter((employee) => !movedIds.has(employee.id));
  const moved = affected.map((employee) => ({ ...employee, location: toLocation }));

  writeCustomEmployees([...moved, ...untouched]);
  syncDirectorySnapshots();
  notifyEmployeeDirectoryChanged();
  return moved.length;
}

export const getEmployee = (id: string): Employee | undefined => getEmployeeDirectory().find((employee) => employee.id === id);

export const getEmployeeByEmail = (email: string): Employee | undefined =>
  getEmployeeDirectory().find((employee) => employee.email.toLowerCase() === email.toLowerCase());

export const getEmployeeByAuthUid = (uid: string): Employee | undefined =>
  getEmployeeDirectory().find((employee) => employee.authUid === uid);

/**
 * Record which directory record a signed-in account belongs to.
 *
 * Called once per sign-in, while the account's email still matches the record.
 * From then on the person is found by uid, so editing the work email on the
 * profile no longer orphans them from it.
 *
 * A uid maps to exactly one person: if it was previously stamped on a
 * different record, that stamp is cleared, or both records would claim the
 * same account and the winner would depend on directory order.
 */
export function linkEmployeeToAuthAccount(employeeId: string, uid: string) {
  const directory = getEmployeeDirectory();
  const target = directory.find((employee) => employee.id === employeeId);
  if (!target || target.authUid === uid) return;

  const stale = directory.filter((employee) => employee.authUid === uid && employee.id !== employeeId);
  const touched = [...stale.map((employee) => ({ ...employee, authUid: undefined })), { ...target, authUid: uid }];
  const touchedIds = new Set(touched.map((employee) => employee.id));

  writeCustomEmployees([...touched, ...readCustomEmployees().filter((item) => !touchedIds.has(item.id))]);
  syncDirectorySnapshots();
  notifyEmployeeDirectoryChanged();
}

export const getEmployeeName = (id: string): string => getEmployeeDirectory().find((employee) => employee.id === id)?.fullName ?? 'Unknown';

export const departments: Department[] = [
  'Engineering',
  'Product',
  'Design',
  'Sales',
  'Marketing',
  'Human Resources',
  'Finance',
  'Operations',
  'Customer Success',
  'Legal',
];

syncDirectorySnapshots();

if (typeof window !== 'undefined') {
  window.addEventListener(EMPLOYEE_DIRECTORY_CHANGED_EVENT, syncDirectorySnapshots);
  window.addEventListener('storage', (event) => {
    if (event.key === orgScopedKey(CUSTOM_EMPLOYEE_STORAGE_KEY) || event.key === orgScopedKey(DELETED_EMPLOYEE_STORAGE_KEY)) {
      syncDirectorySnapshots();
    }
  });

  // The `locations` snapshot is half declared configuration, so it goes stale
  // when that half changes — including at sign-in, when startOrgSettingsSync
  // hydrates the organisation's list from Firestore into a cache this module
  // already read at import time.
  window.addEventListener(LOCATION_DIRECTORY_CHANGED_EVENT, () => {
    syncDirectorySnapshots();
    notifyEmployeeDirectoryChanged();
  });
}
