// ===========================================================================
// ModCon HR — Shared domain model
// All feature modules import their types from here to stay consistent.
// ===========================================================================

export type ID = string;

export type EmploymentType = 'Full-time' | 'Part-time' | 'Contract' | 'Intern';
export type EmployeeStatus = 'Active' | 'On Leave' | 'Probation' | 'Notice Period' | 'Resigned';
export type Gender = 'Male' | 'Female' | 'Other';

export interface Employee {
  id: ID;
  employeeCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  avatar: string; // initials-based avatar uses fullName; this is a color seed
  gender: Gender;
  dateOfBirth: string; // ISO
  designation: string;
  department: Department;
  location: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  dateOfJoining: string; // ISO
  reportingManagerId: ID | null;
  reportingManagerName?: string;
  ctc: number; // annual cost to company (INR)
  bloodGroup?: string;
  maritalStatus?: 'Single' | 'Married';
  address?: string;
  skills?: string[];
}

export type Department =
  | 'Engineering'
  | 'Product'
  | 'Design'
  | 'Sales'
  | 'Marketing'
  | 'Human Resources'
  | 'Finance'
  | 'Operations'
  | 'Customer Success'
  | 'Legal';

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
  progress: number; // 0-100
  status: GoalStatus;
  dueDate: string;
  weight: number;
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
  requestedStatus: AttendanceStatus;
  status: 'Pending' | 'Approved' | 'Rejected';
}
