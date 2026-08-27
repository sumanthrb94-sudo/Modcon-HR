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
 * Every day of the week, because which ones an organisation uses is that
 * organisation's decision (Settings → Week Off) rather than the platform's.
 * This was three literals — Sunday, Monday and Tuesday — described as the days
 * "the organisation rosters its week-offs across", which was true of ModCon
 * Builders' demo roster and of nobody else: a company closed on Saturday, or
 * on Friday, could not say so at all, and the compiler was enforcing one
 * tenant's staffing pattern on every other.
 *
 * An employee still takes exactly one of them. Six working days with one off
 * is the week this app's attendance and payroll are built around — see
 * `getWorkingWeekDatesFor` in data/attendance.ts.
 */
export type WeekOffDay =
  | 'Sunday'
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday';

/** Every day a week-off may be set to, in week order. */
export const WEEK_OFF_DAYS: readonly WeekOffDay[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** `Date.getUTCDay()` index for each week-off day. */
export const WEEK_OFF_DAY_INDEX: Readonly<Record<WeekOffDay, number>> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
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
   * The one day a week this person does not work, **when it differs from the
   * organisation's**.
   *
   * Absent means "whatever the organisation's week-off policy says" — it used
   * to mean the literal Sunday, which is why an organisation could not declare
   * one of its own. `weekOffOf` in data/employees.ts is the only thing that
   * should read this field directly; it resolves the person's own day first
   * and the organisation's second. The rest of the week is worked: this is a
   * six-day week, so a person off on Monday works the Sunday.
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
  /**
   * Flat monthly allowances — see MEDICAL_ALLOWANCE / CONVEYANCE_ALLOWANCE in
   * src/data/payroll.ts. Optional because payslip documents written before
   * these existed carry neither, and a stored payslip is never rewritten.
   *
   * `conveyanceAllowance` was briefly named `convenienceAllowance`, between the
   * commit that added it and this one. Nothing reads that key: the only writer
   * of stored payslips is lib/seed.ts, and the readers fall back to 0 for a
   * document that lacks the field, so a payslip seeded in that window shows
   * ₹0 here rather than a wrong figure. Re-seeding restores it.
   */
  medicalAllowance?: number;
  conveyanceAllowance?: number;
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

/**
 * Where an application came in from.
 *
 * Two entry points, one record. 'Website' is the public careers page — a
 * candidate with no account here, and no way to get one before they are hired.
 * 'Internal' is the Apply button inside the app, which is internal mobility:
 * somebody who already works here applying for another role. The two are
 * separated in `firestore.rules`, where the unauthenticated path may only ever
 * write 'Website' and the signed-in path only ever 'Internal'.
 */
export type JobApplicationSource = 'Website' | 'Internal';

/**
 * An application a candidate submitted against a published job opening.
 *
 * Distinct from `Candidate`, which is the recruiter's own record of somebody in
 * the pipeline and lives in the local overlay like the rest of `src/data/*.ts`.
 * An application is written by the applicant, so it lives in Firestore: it has
 * to survive the browser that created it, and every field on it is a claim the
 * writer makes about themselves, which is why the rules pin the ones that are
 * not (`stage`, `source`, `submittedByUid`, the document id).
 *
 * The resume PDF rides inside the document, base64-encoded, for the reason
 * written up in src/lib/handbookStorage.ts — this project has no Cloud Storage
 * bucket, and Storage rules cannot read Firestore to check a role.
 */
export interface JobApplication {
  id: ID;
  orgId: string;
  jobId: ID;
  /** Denormalised so the pipeline reads correctly after a job is deleted. */
  jobTitle: string;
  name: string;
  /** Lowercased. It is part of the document id — see `jobApplicationId`. */
  email: string;
  phone: string;
  currentCompany?: string;
  experienceYears: number;
  coverNote?: string;
  source: JobApplicationSource;
  /** Always 'Applied' on arrival; only an org administrator may move it. */
  stage: CandidateStage;
  appliedOn: string;
  submittedAt: string;
  /** The signed-in applicant, for internal moves. Absent on public ones. */
  submittedByUid?: string;
  resumeFileName: string;
  resumeContentType: string;
  resumeSizeBytes: number;
  resumeContentBase64: string;
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

/**
 * A payslip PDF an administrator uploaded for one employee and one month.
 *
 * Distinct from `Payslip`, which the app *computes* from the employee's CTC and
 * attendance. This is the document payroll actually issued: it is the record of
 * what was paid, so where both exist the uploaded one is what the employee is
 * shown.
 *
 * The id is deterministic — `<orgKey>__<employeeId>__<YYYY-MM>` — so re-uploading
 * a month replaces that month rather than accumulating duplicates nobody can
 * tell apart, and so a single month can be fetched by id without a query.
 *
 * The bytes live in this document for the same reason the handbook's do; see
 * `src/lib/handbookStorage.ts` for why there is no Cloud Storage bucket.
 */
/**
 * One document filed against an employee — the metadata, not the file.
 *
 * Who may file which kind is a rule, not a preference: identity and bank
 * records (`primary`) are submitted by the person they belong to or by HR, and
 * the organisation's own paperwork (`secondary`) by an administrator or HR.
 * That rule is enforced in firestore.rules, which is why these live in
 * Firestore and no longer in localStorage. See src/lib/employeeDocuments.ts.
 *
 * No bytes are stored. The library records that a document was filed, its type
 * and its verification status; the file itself has never been kept, and adding
 * it is the same base64-in-the-document decision written up in
 * src/lib/handbookStorage.ts.
 */
export interface EmployeeDocument {
  /** `<orgId>__<employeeId>__<slug of name>` — one document per name per person. */
  id: ID;
  orgId: string;
  employeeId: ID;
  /** Display name, e.g. "Aadhaar Card". Decides primary vs secondary. */
  name: string;
  /** File kind badge: `PDF`, `ZIP`, … */
  type: string;
  status: DocumentStatus;
  /** `YYYY-MM-DD`. */
  uploaded: string;
  /** Human-readable, e.g. "245 KB". */
  size: string;
  /** Always the caller's own uid — the rules refuse any other value. */
  uploadedByUid: ID;
}

export type DocumentStatus = 'Verified' | 'Pending' | 'Expired';

export interface PayslipDocument {
  id: ID;
  orgId: string;
  employeeId: ID;
  /** Denormalised so the payroll list can label rows without a directory hit. */
  employeeCode: string;
  /** `YYYY-MM`. */
  month: string;
  /** Original upload name, used as the download filename. */
  fileName: string;
  contentType: 'application/pdf';
  sizeBytes: number;
  /** The PDF itself, base64-encoded (no data-URL prefix). */
  contentBase64: string;
  uploadedAt: string;
  /** Always the caller's own uid — the rules refuse any other value. */
  uploadedByUid: ID;
  /** Display only, resolved from the local directory at upload time. */
  uploadedByName: string;
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
