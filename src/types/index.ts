// ===========================================================================
// ModCon HR — Shared domain model
// All feature modules import their types from here to stay consistent.
// ===========================================================================

export type ID = string;

export type EmploymentType = 'Full-time' | 'Part-time' | 'Contract' | 'Intern';
export type EmployeeStatus = 'Active' | 'On Leave' | 'Probation' | 'Notice Period' | 'Resigned';
export type Gender = 'Male' | 'Female' | 'Other';

/**
 * The days a week-off may fall on.
 *
 * Deliberately three literals rather than every weekday: the organisation
 * rosters its week-offs across Sunday, Monday and Tuesday only, and an
 * employee takes exactly one of them. Widening this is a policy decision — it
 * changes which days the attendance grid can leave unworked — so it belongs
 * here where the compiler enforces it, not as a free string.
 */
export type WeekOffDay = 'Sunday' | 'Monday' | 'Tuesday';

/** Every week-off the organisation offers, in week order. */
export const WEEK_OFF_DAYS: readonly WeekOffDay[] = ['Sunday', 'Monday', 'Tuesday'] as const;

/** `Date.getUTCDay()` index for each week-off day. */
export const WEEK_OFF_DAY_INDEX: Readonly<Record<WeekOffDay, number>> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
};

export interface Employee {
  id: ID;
  employeeCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  /**
   * Firebase Auth uid of the account that signs in as this person, stamped the
   * first time they are matched to this record. `email` is editable from the
   * profile but is also how an account is first matched to it, so matching on
   * the email alone would cut someone off from their own profile the moment
   * they changed it. The uid never changes, so the link survives the edit.
   */
  authUid?: string;
  phone: string;
  avatar: string; // initials-based avatar uses fullName; this is a color seed
  /**
   * Absent when nobody has recorded it — a record can be created before every
   * personal detail is known, and guessing one is worse than showing it is
   * missing. The same reasoning as bloodGroup and maritalStatus below.
   */
  gender?: Gender;
  dateOfBirth: string; // ISO; '' when not recorded
  designation: string;
  department: Department;
  location: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  dateOfJoining: string; // ISO
  reportingManagerId: ID | null;
  reportingManagerName?: string;
  ctc: number; // annual cost to company (INR)
  /**
   * The one day a week this person does not work.
   *
   * Absent means Sunday — see `weekOffOf` in data/employees.ts, which is the
   * only thing that should read this field directly. The rest of the week is
   * worked: this is a six-day week, so Saturday is a working day for everyone
   * and Sunday is one for anyone whose week-off is Monday or Tuesday.
   */
  weekOff?: WeekOffDay;
  bloodGroup?: string;
  maritalStatus?: 'Single' | 'Married';
  address?: string;
  skills?: string[];
}

// `ctc` lives on `Employee` above for the in-app mock/demo dataset, which is
// never security-sensitive (synthetic data already shipped in the client
// bundle). For the Firestore-backed path, compensation is written to its own
// `employee_compensation` collection (see src/lib/seed.ts and
// firestore.rules) so the broadly-readable `employees` collection doesn't
// carry real salary data once this app is pointed at real employees.
export interface EmployeeCompensation {
  id?: ID; // Firestore doc id — always set equal to employeeId
  employeeId: ID;
  ctc: number;
}

/**
 * Departments are organisation data, not a fixed vocabulary — an org can add,
 * rename and remove them from Settings. The ten names in
 * `src/data/employees.ts` are the demo org's starting set, not the allowed
 * set, so this deliberately is not a union of those literals.
 */
export type Department = string;

// ---- Attendance ----------------------------------------------------------
export type AttendanceStatus =
  | 'Present'
  | 'Absent'
  | 'Half Day'
  | 'On Leave'
  | 'Holiday'
  | 'Weekend'
  | 'Work From Home';

export interface AttendanceRecord {
  id: ID;
  employeeId: ID;
  date: string; // ISO date
  status: AttendanceStatus;
  checkIn: string | null; // HH:mm
  checkOut: string | null; // HH:mm
  /**
   * The exact instants the employee checked in and out, when the record was
   * made by them doing so rather than by an administrator entering times.
   * `checkIn`/`checkOut` above stay the display value; these carry the
   * precision that `HH:mm` throws away, so worked hours are measured rather
   * than inferred from two rounded strings.
   */
  checkInAt?: string;
  checkOutAt?: string;
  workedHours: number;
  shift: string;
  isLate: boolean;
}

// ---- Leave ---------------------------------------------------------------
export type LeaveType = 'Casual' | 'Sick' | 'Earned' | 'Unpaid' | 'Maternity' | 'Paternity' | 'Comp Off';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface LeaveRequest {
  id: ID;
  employeeId: ID;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  appliedOn: string;
  approverId: ID | null;
  approverName?: string;
}

export interface LeaveBalance {
  id?: string; // composite: employeeId_type
  employeeId: ID;
  type: LeaveType;
  total: number;
  used: number;
  available: number;
}

// ---- Payroll -------------------------------------------------------------
export type PayrollRunStatus = 'Draft' | 'Processing' | 'Completed' | 'Paid';

export interface Payslip {
  id: ID;
  employeeId: ID;
  month: string; // e.g. "2026-05"
  basic: number;
  hra: number;
  specialAllowance: number;
  bonus: number;
  pf: number; // deduction
  tax: number; // deduction
  otherDeductions: number;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  status: PayrollRunStatus;
}

export interface PayrollRun {
  id: ID;
  month: string;
  status: PayrollRunStatus;
  employeeCount: number;
  grossTotal: number;
  netTotal: number;
  processedOn: string | null;
}

// ---- Recruitment ---------------------------------------------------------
export type JobStatus = 'Open' | 'On Hold' | 'Closed' | 'Draft';
export type CandidateStage =
  | 'Applied'
  | 'Screening'
  | 'Interview'
  | 'Offer'
  | 'Hired'
  | 'Rejected';

export interface JobOpening {
  id: ID;
  title: string;
  department: Department;
  location: string;
  type: EmploymentType;
  status: JobStatus;
  openings: number;
  applicants: number;
  postedOn: string;
  hiringManagerId: ID;
  description?: string;
  experience: string;
}

export interface Candidate {
  id: ID;
  name: string;
  email: string;
  phone: string;
  jobId: ID;
  jobTitle: string;
  stage: CandidateStage;
  appliedOn: string;
  rating: number; // 1-5
  source: string;
  currentCompany?: string;
  experienceYears: number;
}

// ---- Onboarding ----------------------------------------------------------
export type TaskStatus = 'Pending' | 'In Progress' | 'Completed';

export interface OnboardingTask {
  id: ID;
  title: string;
  category: 'Documentation' | 'IT Setup' | 'Orientation' | 'Compliance' | 'Training';
  status: TaskStatus;
  dueDate: string;
  assignee: string;
}

export interface Onboarding {
  id: ID;
  employeeId: ID;
  employeeName: string;
  designation: string;
  department: Department;
  startDate: string;
  buddy: string;
  progress: number; // 0-100
  tasks: OnboardingTask[];
}

// ---- Performance ---------------------------------------------------------
export type GoalStatus = 'On Track' | 'At Risk' | 'Behind' | 'Completed';
export type ReviewStatus = 'Not Started' | 'Self Review' | 'Manager Review' | 'Calibration' | 'Completed';

export interface Goal {
  id: ID;
  employeeId: ID;
  title: string;
  category: string;
  cycle: string;
  progress: number; // 0-100
  status: GoalStatus;
  dueDate: string;
  weight: number;
  reviewer: string;
}

export interface PerformanceReview {
  id: ID;
  employeeId: ID;
  employeeName: string;
  cycle: string;
  reviewer: string;
  status: ReviewStatus;
  rating: number | null; // 1-5
  dueDate: string;
}

// ---- Expenses ------------------------------------------------------------
export type ExpenseStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Reimbursed';
export type ExpenseCategory = 'Travel' | 'Meals' | 'Accommodation' | 'Software' | 'Office Supplies' | 'Training' | 'Other';

export interface ExpenseClaim {
  id: ID;
  employeeId: ID;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  status: ExpenseStatus;
  submittedOn: string;
  description: string;
  receiptImage?: string;
}

// ---- Assets --------------------------------------------------------------
export type AssetStatus = 'Assigned' | 'Available' | 'In Repair' | 'Retired';
export type AssetCategory = 'Laptop' | 'Monitor' | 'Phone' | 'Accessories' | 'Furniture' | 'Software License';

export interface Asset {
  id: ID;
  assetCode: string;
  name: string;
  category: AssetCategory;
  status: AssetStatus;
  assignedToId: ID | null;
  assignedToName?: string;
  purchaseDate: string;
  value: number;
  serialNumber: string;
}

// ---- Helpdesk ------------------------------------------------------------
export type TicketStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface Ticket {
  id: ID;
  ticketCode: string;
  subject: string;
  category: string;
  raisedById: ID;
  status: TicketStatus;
  priority: TicketPriority;
  createdOn: string;
  assignedTo: string;
}

// ---- Announcements / common ----------------------------------------------
export interface Announcement {
  id: ID;
  title: string;
  body: string;
  category: 'Policy' | 'Event' | 'Celebration' | 'General';
  date: string;
  author: string;
}

export interface Holiday {
  id: ID;
  name: string;
  date: string;
  type: 'National' | 'Regional' | 'Optional';
}

// ---- Regularization / Attendance -----------------------------------------------
export interface RegularizationRequest {
  id: ID;
  employeeId: ID;
  date: string;
  reason: string;
  /**
   * What the employee is asking the day to become. `null` on entries the app
   * flagged from the attendance records rather than a person raising them —
   * what someone *wants* a day changed to is an intention, and only the person
   * whose day it is has one.
   */
  requestedStatus: AttendanceStatus | null;
  status: 'Pending' | 'Approved' | 'Rejected';
}

// ---- Employee handbook (document management) ------------------------------------
// One org-wide handbook: HR publishes versions, every signed-in user reads the
// current one. Versions are immutable and append-only — superseding a handbook
// is publishing a new version and repointing `HandbookPointer`, never editing
// or deleting what came before, so the audit trail cannot be rewritten and a
// bad upload is reverted by pointing back at the previous version.
export interface HandbookVersion {
  id: ID;
  /** `null` for the default/legacy org, matching `users.orgId`. */
  orgId: string | null;
  /** 1-based, monotonic within an org. */
  version: number;
  /** Original upload name, used as the download filename. */
  fileName: string;
  contentType: 'application/pdf';
  sizeBytes: number;
  /**
   * The PDF itself, base64-encoded (no data-URL prefix).
   *
   * See `src/lib/handbookStorage.ts` — the binary lives in the version document
   * because this project has no Cloud Storage bucket provisioned. Firestore's
   * 1 MiB document ceiling is what bounds `HANDBOOK_MAX_BYTES`.
   */
  contentBase64: string;
  uploadedAt: string;
  /** Always the caller's own uid — the rules refuse any other value. */
  uploadedByUid: ID;
  /** Display only, resolved from the local directory at upload time. */
  uploadedByName: string;
  uploadedByEmployeeId: ID | null;
  /** Optional "what changed" note. */
  notes: string;
}

/** One per org: which version is currently published. */
export interface HandbookPointer {
  id?: ID; // the org key — `default` for the legacy org
  orgId: string | null;
  currentVersionId: ID;
  currentVersion: number;
  updatedAt: string;
  updatedByUid: ID;
}

// ---- Organizations (multi-tenant, super-admin managed) --------------------------
export interface Organization {
  id?: ID; // Firestore-assigned on create; always present once fetched
  name: string;
  adminEmail: string;
  adminUid?: string;
  createdBy: ID; // super admin uid
  createdAt?: unknown;
  /**
   * Per-organisation feature flags: which tenants a change has been rolled out
   * to. Absent means every flag sits at its declared default. Set by super
   * admins only — see src/lib/features.ts for what a flag may gate, and why it
   * is behaviour and never authorization.
   */
  features?: Record<string, boolean>;
}
