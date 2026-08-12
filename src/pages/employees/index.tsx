import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, Link, Navigate } from 'react-router-dom';
import {
  LayoutGrid,
  List,
  Plus,
  Users,
  UserCheck,
  Clock,
  Building2,
  Mail,
  Phone,
  ArrowLeft,
  MessageSquare,
  Edit2,
  Download,
  FileText,
  Award,
  ChevronRight,
  Calendar,
  MapPin,
  User,
  X,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  statusTone,
  Button,
  PageHeader,
  StatCard,
  Table,
  type Column,
  ProgressBar,
  Tabs,
  Modal,
  SearchInput,
  EmptyState,
  Select,
  Card,
  CardHeader,
} from '@/components/ui';
import { employees, getEmployee, getEmployeeDirectory, getNextEmployeeSequence, suggestEmployeeCode, isEmployeeCodeTaken, sameEmployeeCode, addEmployeeToDirectory, deleteEmployeeFromDirectory, locations } from '@/data/employees';
import {
  EmployeeDocumentError,
  canFileDocuments,
  canVerifyDocuments,
  documentCategory,
  fileEmployeeDocument,
  setEmployeeDocumentStatus,
  useEmployeeDocuments,
  type DocumentCategory,
} from '@/lib/employeeDocuments';
import type { EmployeeDocument, DocumentStatus } from '@/types';
import { departments, addDepartmentToDirectory } from '@/data/departments';
import { addLocationToDirectory, normalizeLocation } from '@/data/locations';
import type { Employee, EmployeeStatus, EmploymentType, Gender, WeekOffDay } from '@/types';
import { WEEK_OFF_DAYS } from '@/types';
import { cn, formatINR, formatDate, pct } from '@/lib/utils';
import { OrgChart } from './OrgChart';
import { EmployeeCard } from './EmployeeCard';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { EMPLOYEE_DIRECTORY_CHANGED_EVENT } from '@/data/employees';
import { updateEmployeeInDirectory, weekOffOf } from '@/data/employees';
import { linkAccountForEmployee } from '@/data/employeeLinks';
import { reportingLineChanged, syncManagerChains } from '@/lib/reportingChains';
import { useDepartmentDirectoryRevision } from '@/lib/useDepartmentDirectoryRevision';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { useAuth, type UserProfile } from '@/lib/auth';
import { getCurrentEmployee } from '@/lib/currentEmployee';
import { canViewEmployee, getVisibleEmployees } from '@/lib/dataScope';
import { syncHrRoleForEmployee } from '@/data/roleAssignments';
import { resolveAppRole } from '@/lib/accessControl';
import { orgScopedKey } from '@/lib/orgScope';
import { todayIso } from '@/lib/today';
import { getLeaveRequests } from '@/data/leave';
import { getEntitlements } from '@/data/leaveEntitlements';
import { getLeavePolicies, hasEmployeeLeavePolicy } from '@/data/leavePolicies';
import { financialYearLabel } from '@/lib/financialYear';
import { buildPayslipComponents } from '@/data/payroll';
import { useDashboardDataRevision } from '@/lib/useDashboardDataRevision';
import { useSalaryStructureRevision } from '@/lib/useSalaryStructureRevision';

const EMPLOYEE_PROFILE_PICTURE_STORAGE_KEY = 'modcon.hr.employeeProfilePictures';

function readEmployeeProfilePictures(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(orgScopedKey(EMPLOYEE_PROFILE_PICTURE_STORAGE_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function getEmployeeProfilePicture(employeeId: string): string | null {
  return readEmployeeProfilePictures()[employeeId] ?? null;
}

function writeEmployeeProfilePicture(employeeId: string, imageSrc: string) {
  if (typeof window === 'undefined') return;
  const pictures = readEmployeeProfilePictures();
  window.localStorage.setItem(
    orgScopedKey(EMPLOYEE_PROFILE_PICTURE_STORAGE_KEY),
    JSON.stringify({
      ...pictures,
      [employeeId]: imageSrc,
    }),
  );
}

// ---------------------------------------------------------------------------
// Tenure helper
// ---------------------------------------------------------------------------
function computeTenureFull(dateOfJoining: string): string {
  const doj = new Date(dateOfJoining);
  const now = new Date();
  const diffMs = now.getTime() - doj.getTime();
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const years = Math.floor(totalDays / 365);
  const months = Math.floor((totalDays % 365) / 30);
  if (years === 0) return `${months} month${months !== 1 ? 's' : ''}`;
  if (months === 0) return `${years} year${years !== 1 ? 's' : ''}`;
  return `${years} year${years !== 1 ? 's' : ''} ${months} month${months !== 1 ? 's' : ''}`;
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink-50 p-3 min-w-0">
      <p className="text-ink-400 text-[11px] uppercase tracking-wide">{label}</p>
      <p className="font-medium text-ink-900 mt-1 truncate">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Employee Modal
// ---------------------------------------------------------------------------
/** One person's details as the form holds them — every field a string. */
interface EmployeeDetailsDraft {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  designation: string;
  department: Employee['department'];
  location: string;
  employmentType: EmploymentType;
  /** '' means nobody has said — see the note on Employee.gender. */
  gender: Gender | '';
  dateOfBirth: string;
  dateOfJoining: string;
  ctc: string;
  reportingManagerId: string;
}

/** The same details, cleaned and typed, ready to become an Employee. */
interface EmployeeDetails {
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
}

interface NewEmployeePayload extends EmployeeDetails {
  /**
   * A manager to bring into being alongside this hire, asked for in the same
   * detail as anyone else. Held as data rather than created when it is typed,
   * so abandoning the dialog leaves nobody behind — the same rule the
   * new-department field follows.
   */
  newManager: EmployeeDetails | null;
}

function emptyDetailsDraft(): EmployeeDetailsDraft {
  return {
    // Pre-filled with the code this hire would have been given automatically,
    // so HR types one only when their numbering differs — but it is a value in
    // the form like any other, and theirs to overwrite.
    employeeCode: suggestEmployeeCode(),
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    designation: '',
    // Default to whatever the org's first department actually is. Naming one
    // here would survive that department being renamed or deleted in Settings,
    // leaving the form defaulted to a department its own dropdown cannot offer.
    department: departments[0] ?? '',
    location: locations[0] ?? '',
    employmentType: 'Full-time',
    // Not pre-selected: a gender nobody chose is not a gender they have.
    gender: '',
    dateOfBirth: '',
    dateOfJoining: '',
    ctc: '',
    reportingManagerId: '',
  };
}

function validateDetailsDraft(draft: EmployeeDetailsDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const cleanCode = draft.employeeCode.trim();
  const cleanEmail = draft.email.trim();
  const annualCtc = Number(draft.ctc);

  if (!cleanCode) {
    errors.employeeCode = 'Employee code is required.';
  } else if (isEmployeeCodeTaken(cleanCode)) {
    // Two people on one code is not a duplicate row, it is an ambiguity every
    // upload that matches on the code has to refuse — payslips, salary splits
    // and leave entitlements all name people this way.
    errors.employeeCode = 'Another employee already has this code.';
  }
  if (!draft.firstName.trim()) errors.firstName = 'First name is required.';
  if (!draft.lastName.trim()) errors.lastName = 'Last name is required.';
  if (!cleanEmail) {
    errors.email = 'Work email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    errors.email = 'Enter a valid email address.';
  }
  if (!draft.designation.trim()) errors.designation = 'Designation is required.';
  // Both can be typed rather than only picked, so both can arrive blank.
  if (!draft.department.trim()) errors.department = 'Department is required.';
  if (!draft.location.trim()) errors.location = 'Location is required.';
  if (!draft.dateOfBirth) {
    errors.dateOfBirth = 'Date of birth is required.';
  } else if (draft.dateOfBirth > todayIso()) {
    errors.dateOfBirth = 'Date of birth cannot be in the future.';
  }
  if (!draft.dateOfJoining) errors.dateOfJoining = 'Date of joining is required.';
  if (!draft.ctc.trim()) {
    errors.ctc = 'Annual CTC is required.';
  } else if (Number.isNaN(annualCtc) || annualCtc <= 0) {
    errors.ctc = 'Annual CTC must be greater than 0.';
  }

  return errors;
}

function toEmployeeDetails(draft: EmployeeDetailsDraft): EmployeeDetails {
  return {
    employeeCode: draft.employeeCode.trim(),
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    email: draft.email.trim().toLowerCase(),
    phone: draft.phone.trim(),
    designation: draft.designation.trim(),
    department: draft.department.trim(),
    location: draft.location.trim(),
    employmentType: draft.employmentType,
    gender: draft.gender || undefined,
    dateOfBirth: draft.dateOfBirth,
    dateOfJoining: draft.dateOfJoining,
    ctc: Number(draft.ctc),
    reportingManagerId: draft.reportingManagerId || null,
  };
}

/**
 * State and rules for one person's details.
 *
 * Kept apart from the dialog so the fields and the rules that govern them sit
 * together, rather than being spread through the markup that renders them.
 */
function useEmployeeDetailsForm() {
  const [draft, setDraft] = useState<EmployeeDetailsDraft>(emptyDetailsDraft);

  function set<K extends keyof EmployeeDetailsDraft>(key: K, value: EmployeeDetailsDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const errors = useMemo(() => validateDetailsDraft(draft), [draft]);

  return {
    draft,
    set,
    errors,
    hasErrors: Object.keys(errors).length > 0,
    reset: () => setDraft(emptyDetailsDraft()),
  };
}

type DetailsForm = ReturnType<typeof useEmployeeDetailsForm>;

/**
 * The employee fields themselves. `managerControl` is a slot because the two
 * uses differ there and only there: a hire can name a manager who does not
 * exist yet, a manager can only be given one who already does. It also keeps
 * this presentational — it knows nothing about the directory it would have to
 * read to list candidates.
 */
function EmployeeDetailsFields({
  form,
  showErrors,
  fieldPrefix,
  managerControl,
  canEditEmployeeCode,
}: {
  form: DetailsForm;
  showErrors: boolean;
  /** Prefixes each field's accessible name, since the visible labels are not
   *  associated with their inputs by id. */
  fieldPrefix: string;
  managerControl: ReactNode;
  /** HR numbers this company's people; everyone else is shown what the code
   *  will be, so the form still says which record is about to be created. */
  canEditEmployeeCode: boolean;
}) {
  const { draft, set, errors } = form;
  const error = (key: string) =>
    showErrors && errors[key] ? <p className="mt-1 text-xs text-red-600">{errors[key]}</p> : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Employee Code</label>
          {canEditEmployeeCode ? (
            <input
              className="input w-full font-mono"
              aria-label={`${fieldPrefix} code`}
              placeholder="e.g. MC-090"
              value={draft.employeeCode}
              onChange={(event) => set('employeeCode', event.target.value)}
            />
          ) : (
            <p className="input w-full font-mono bg-ink-50 text-ink-500">{draft.employeeCode}</p>
          )}
          {error('employeeCode')}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">First Name</label>
          <input
            className="input w-full"
            aria-label={`${fieldPrefix} first name`}
            placeholder="Enter first name"
            value={draft.firstName}
            onChange={(event) => set('firstName', event.target.value)}
          />
          {error('firstName')}
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Last Name</label>
          <input
            className="input w-full"
            aria-label={`${fieldPrefix} last name`}
            placeholder="Enter last name"
            value={draft.lastName}
            onChange={(event) => set('lastName', event.target.value)}
          />
          {error('lastName')}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Work Email</label>
          <input
            className="input w-full"
            type="email"
            aria-label={`${fieldPrefix} email`}
            placeholder="name@modcon.com"
            value={draft.email}
            onChange={(event) => set('email', event.target.value)}
          />
          {error('email')}
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Phone</label>
          <input
            className="input w-full"
            aria-label={`${fieldPrefix} phone`}
            placeholder="+91 XXXXX XXXXX"
            value={draft.phone}
            onChange={(event) => set('phone', event.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Designation</label>
          <input
            className="input w-full"
            aria-label={`${fieldPrefix} designation`}
            placeholder="Job title"
            value={draft.designation}
            onChange={(event) => set('designation', event.target.value)}
          />
          {error('designation')}
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Department</label>
          <SelectOrCreate
            label={`${fieldPrefix} department`}
            noun="department"
            value={draft.department}
            onChange={(value) => set('department', value)}
            options={departments}
          />
          {error('department')}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Location</label>
          <SelectOrCreate
            label={`${fieldPrefix} location`}
            noun="location"
            value={draft.location}
            onChange={(value) => set('location', value)}
            options={locations}
          />
          {error('location')}
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Gender</label>
          <select
            className="input w-full"
            aria-label={`${fieldPrefix} gender`}
            value={draft.gender}
            onChange={(event) => set('gender', event.target.value as Gender | '')}
          >
            <option value="">Not recorded</option>
            {(['Male', 'Female', 'Other'] as Gender[]).map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Employment Type</label>
          <select
            className="input w-full"
            aria-label={`${fieldPrefix} employment type`}
            value={draft.employmentType}
            onChange={(event) => set('employmentType', event.target.value as EmploymentType)}
          >
            {(['Full-time', 'Part-time', 'Contract', 'Intern'] as EmploymentType[]).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Date of Birth</label>
          <input
            className="input w-full"
            type="date"
            max={todayIso()}
            aria-label={`${fieldPrefix} date of birth`}
            value={draft.dateOfBirth}
            onChange={(event) => set('dateOfBirth', event.target.value)}
          />
          {error('dateOfBirth')}
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Date of Joining</label>
          <input
            className="input w-full"
            type="date"
            aria-label={`${fieldPrefix} date of joining`}
            value={draft.dateOfJoining}
            onChange={(event) => set('dateOfJoining', event.target.value)}
          />
          {error('dateOfJoining')}
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Annual CTC (₹)</label>
          <input
            className="input w-full"
            type="number"
            aria-label={`${fieldPrefix} ctc`}
            placeholder="e.g. 2400000"
            value={draft.ctc}
            onChange={(event) => set('ctc', event.target.value)}
          />
          {error('ctc')}
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-ink-600 mb-1.5">Reporting Manager</label>
        {managerControl}
      </div>
    </div>
  );
}

/**
 * One person's details, collected in full.
 *
 * Used twice over: as Add Employee on the directory, and as Add Reporting
 * Manager on a profile — a manager is an employee, so the same fields and the
 * same rules apply to both, and one definition is what stops them drifting
 * apart. `allowNewManager` is the only real difference: a hire may name a
 * manager who does not exist yet, and that manager may not, or the form would
 * recurse with nothing to stop it.
 */
function AddEmployeeModal({
  open,
  onClose,
  onSave,
  employeeOptions,
  canEditEmployeeCode,
  allowNewManager = true,
  title = 'Add New Employee',
  subtitle = 'Fill in the details to create a new employee profile',
  saveLabel = 'Save Employee',
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payload: NewEmployeePayload) => void;
  employeeOptions: Employee[];
  canEditEmployeeCode: boolean;
  allowNewManager?: boolean;
  title?: string;
  subtitle?: string;
  saveLabel?: string;
}) {
  const hire = useEmployeeDetailsForm();
  const manager = useEmployeeDetailsForm();
  /** 'manager' swaps the dialog over to filling in the new manager. */
  const [mode, setMode] = useState<'hire' | 'manager'>('hire');
  const [pendingManager, setPendingManager] = useState<EmployeeDetails | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [managerSubmitAttempted, setManagerSubmitAttempted] = useState(false);
  const [managerError, setManagerError] = useState('');

  function resetForm() {
    hire.reset();
    manager.reset();
    setPendingManager(null);
    setMode('hire');
    setSubmitAttempted(false);
    setManagerSubmitAttempted(false);
    setManagerError('');
  }

  function handleSave() {
    setSubmitAttempted(true);
    if (hire.hasErrors) return;

    const namedNewManager = hire.draft.reportingManagerId === PENDING_MANAGER;
    onSave({
      ...toEmployeeDetails(hire.draft),
      // PENDING_MANAGER stands in for somebody who does not exist yet; the
      // parent creates them first and links the two together.
      reportingManagerId: namedNewManager ? null : hire.draft.reportingManagerId || null,
      newManager: namedNewManager ? pendingManager : null,
    });
    resetForm();
    onClose();
  }

  /** Accept the manager as this hire's manager, without creating them yet. */
  function confirmManager() {
    setManagerSubmitAttempted(true);
    setManagerError('');
    if (manager.hasErrors) return;

    const details = toEmployeeDetails(manager.draft);
    // Two people cannot share a work email: it is how a sign-in is matched to
    // a record, so a duplicate would attach one account to the wrong person.
    if (employeeOptions.some((candidate) => candidate.email.toLowerCase() === details.email)) {
      setManagerError('Someone already has that email address.');
      return;
    }
    if (details.email === hire.draft.email.trim().toLowerCase()) {
      setManagerError('The manager cannot share an email with the new hire.');
      return;
    }
    // Both codes are unsaved, so neither is "taken" yet — and both are
    // pre-filled with the same suggestion, which is the collision this dialog
    // is uniquely able to create. Everything that matches a person by their
    // code would then name two people and refuse.
    if (sameEmployeeCode(details.employeeCode, hire.draft.employeeCode)) {
      setManagerError('The manager cannot share an employee code with the new hire.');
      return;
    }

    setPendingManager(details);
    hire.set('reportingManagerId', PENDING_MANAGER);
    setMode('hire');
  }

  function startManager() {
    manager.reset();
    // The manager almost always sits with the person they will manage, so
    // start them there — every field stays editable.
    manager.set('department', hire.draft.department);
    manager.set('location', hire.draft.location);
    // Both drafts open on the same suggested code. Offer the manager the one
    // after it, so the ordinary case needs no correcting.
    manager.set('employeeCode', suggestEmployeeCode(getEmployeeDirectory(), 1));
    setManagerSubmitAttempted(false);
    setManagerError('');
    setMode('manager');
  }

  function cancelManager() {
    setMode('hire');
    setManagerError('');
    setManagerSubmitAttempted(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  const hireManagerControl = (
    <select
      className="input w-full"
      aria-label="Reporting Manager"
      value={hire.draft.reportingManagerId}
      onChange={(event) => {
        if (event.target.value === CREATE_OPTION) {
          startManager();
          return;
        }
        hire.set('reportingManagerId', event.target.value);
      }}
    >
      <option value="">Select reporting manager</option>
      {employeeOptions.map((e) => <option key={e.id} value={e.id}>{e.fullName} — {e.designation}</option>)}
      {pendingManager && (
        <option value={PENDING_MANAGER}>
          {pendingManager.firstName} {pendingManager.lastName} — {pendingManager.designation} (new)
        </option>
      )}
      {allowNewManager && <option value={CREATE_OPTION}>+ Add new reporting manager…</option>}
    </select>
  );

  // No "add new" here: a manager invented for a manager would recurse with
  // nothing to stop it, and one unrecorded person at a time is enough.
  const managerManagerControl = (
    <select
      className="input w-full"
      aria-label="Manager's Reporting Manager"
      value={manager.draft.reportingManagerId}
      onChange={(event) => manager.set('reportingManagerId', event.target.value)}
    >
      <option value="">No manager</option>
      {employeeOptions.map((e) => <option key={e.id} value={e.id}>{e.fullName} — {e.designation}</option>)}
    </select>
  );

  const isManagerMode = mode === 'manager';

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isManagerMode ? 'New Reporting Manager' : title}
      subtitle={isManagerMode
        ? 'The manager is an employee too, so the same details are needed. Nobody is created until you save the hire.'
        : subtitle}
      size="lg"
      footer={isManagerMode ? (
        <>
          <Button variant="secondary" onClick={cancelManager}>Back</Button>
          <Button variant="primary" onClick={confirmManager}>Add manager</Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>{saveLabel}</Button>
        </>
      )}
    >
      {isManagerMode ? (
        <div className="space-y-5">
          {managerSubmitAttempted && manager.hasErrors && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Please fix the highlighted fields before adding this manager.
            </div>
          )}
          {managerError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {managerError}
            </div>
          )}
          <EmployeeDetailsFields
            form={manager}
            showErrors={managerSubmitAttempted}
            fieldPrefix="Manager"
            managerControl={managerManagerControl}
            canEditEmployeeCode={canEditEmployeeCode}
          />
        </div>
      ) : (
        <div className="space-y-5">
          {submitAttempted && hire.hasErrors && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Please fix the highlighted fields before saving.
            </div>
          )}
          <EmployeeDetailsFields
            form={hire}
            showErrors={submitAttempted}
            fieldPrefix="Employee"
            managerControl={hireManagerControl}
            canEditEmployeeCode={canEditEmployeeCode}
          />
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Creating a person
// ---------------------------------------------------------------------------
/** How a surface tells its reader something that happened after the write. */
type Notify = (message: string) => void;

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
function createEmployeeFromDetails(
  details: EmployeeDetails,
  { profile, notify }: { profile: UserProfile | null; notify: Notify },
): Employee {
  const directory = getEmployeeDirectory();
  const nextIndex = getNextEmployeeSequence(directory);
  const fullName = `${details.firstName} ${details.lastName}`;
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

// ---------------------------------------------------------------------------
// EmployeesPage
// ---------------------------------------------------------------------------
type ViewMode = 'grid' | 'list';
type DirectoryTab = 'directory' | 'orgchart';

export function EmployeesPage() {
  const navigate = useNavigate();
  const { profile, isHR, isAdmin } = useAuth();
  /**
   * Who numbers this company's people. HR is the organisation's own
   * administrator here, and the platform `admin` role sits above it — a
   * Manager, who can otherwise open this form, is not either of them.
   */
  const canEditEmployeeCode = isHR || isAdmin;
  const [employeeList, setEmployeeList] = useState<Employee[]>(() => getEmployeeDirectory());
  useDepartmentDirectoryRevision();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [activeTab, setActiveTab] = useState<DirectoryTab>('directory');
  const [addModalOpen, setAddModalOpen] = useState(false);
  // Surfaced when adding or moving someone changes their platform access —
  // a silent role grant is the kind of thing an admin should be told about.
  const [roleNotice, setRoleNotice] = useState<string | null>(null);

  useEffect(() => {
    const syncEmployeeList = () => {
      setEmployeeList(getEmployeeDirectory());
    };

    window.addEventListener(EMPLOYEE_DIRECTORY_CHANGED_EVENT, syncEmployeeList);
    window.addEventListener('storage', syncEmployeeList);

    return () => {
      window.removeEventListener(EMPLOYEE_DIRECTORY_CHANGED_EVENT, syncEmployeeList);
      window.removeEventListener('storage', syncEmployeeList);
    };
  }, []);

  const currentEmployee = useMemo(() => getCurrentEmployee(profile), [profile, employeeList]);
  const isEmployeeSelfView = resolveAppRole(profile) === 'Employee';
  // HR and Admin see the whole company; a manager sees their own reporting line
  // plus HR; an employee sees only themselves. The self-only case used to be
  // handled here inline — it now comes from the same rule as every other role
  // so the directory, attendance and leave cannot disagree about who is
  // visible. See lib/dataScope.ts.
  const visibleEmployeeList = useMemo(
    () => getVisibleEmployees(profile, employeeList),
    [profile, employeeList],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return visibleEmployeeList.filter((e) => {
      if (q && !e.fullName.toLowerCase().includes(q) && !e.designation.toLowerCase().includes(q) && !e.email.toLowerCase().includes(q) && !e.employeeCode.toLowerCase().includes(q)) return false;
      if (deptFilter && e.department !== deptFilter) return false;
      if (locationFilter && e.location !== locationFilter) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      if (typeFilter && e.employmentType !== typeFilter) return false;
      return true;
    });
  }, [visibleEmployeeList, search, deptFilter, locationFilter, statusFilter, typeFilter]);

  const totalCount = visibleEmployeeList.length;
  const activeCount = visibleEmployeeList.filter((e) => e.status === 'Active').length;
  const probationNotice = visibleEmployeeList.filter((e) => e.status === 'Probation' || e.status === 'Notice Period').length;
  const deptCount = new Set(visibleEmployeeList.map((e) => e.department)).size;

  function handleAddEmployee(payload: NewEmployeePayload) {
    const { newManager, ...hire } = payload;
    // A manager typed into the dialog has to exist before anyone can report to
    // them, so they are created first and their id handed to the hire. Each
    // call re-reads the directory, so the hire cannot take the id the manager
    // was just given.
    const manager = newManager ? createEmployeeFromDetails(newManager, { profile, notify: setRoleNotice }) : null;
    createEmployeeFromDetails(
      { ...hire, reportingManagerId: manager ? manager.id : hire.reportingManagerId },
      { profile, notify: setRoleNotice },
    );

    setEmployeeList(getEmployeeDirectory());
    setSearch('');
    setDeptFilter('');
    setLocationFilter('');
    setStatusFilter('');
    setTypeFilter('');
  }

  const listColumns: Column<Employee>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (e) => (
        <div className="flex items-center gap-3">
          <Avatar name={e.fullName} size="sm" />
          <div>
            <p className="font-semibold text-ink-900 text-sm">{e.fullName}</p>
            <p className="text-xs text-ink-400 font-mono">{e.employeeCode}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'designation',
      header: 'Designation',
      render: (e) => <span className="text-ink-700 text-sm">{e.designation}</span>,
    },
    {
      key: 'department',
      header: 'Department',
      render: (e) => <span className="text-ink-600 text-sm">{e.department}</span>,
    },
    {
      key: 'location',
      header: 'Location',
      render: (e) => (
        <div className="flex items-center gap-1 text-ink-600 text-sm">
          <MapPin size={12} className="text-ink-400" />
          {e.location}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (e) => <span className="text-ink-600 text-sm">{e.employmentType}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => <Badge tone={statusTone(e.status)} dot>{e.status}</Badge>,
    },
  ];

  const tabs = [
    { id: 'directory', label: 'Directory' },
    ...(!isEmployeeSelfView ? [{ id: 'orgchart', label: 'Org Chart' }] : []),
  ];

  if (isEmployeeSelfView) {
    return currentEmployee ? (
      <EmployeeProfileExperience employeeId={currentEmployee.id} embeddedSelfView />
    ) : (
      <EmptyState
        icon={<User size={26} />}
        title="Employee not found"
        description="Your employee profile is not available yet."
      />
    );
  }

  return (
    <div className="space-y-6">
      {roleNotice ? (
        <div
          className="flex items-start justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800"
          role="status"
        >
          <span>{roleNotice}</span>
          <button
            type="button"
            onClick={() => setRoleNotice(null)}
            className="shrink-0 text-brand-600 hover:text-brand-800"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      <PageHeader
        title="Employees"
        subtitle={isEmployeeSelfView
          ? (currentEmployee ? 'Your employee record' : 'Your employee profile is not available yet')
          : `${totalCount} people across ${deptCount} departments`}
        actions={!isEmployeeSelfView ? (
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setAddModalOpen(true)}
          >
            Add Employee
          </Button>
        ) : undefined}
      />

      {/* Stat Cards */}
      <div className={`grid gap-4 ${isEmployeeSelfView ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>
        {!isEmployeeSelfView && (
          <>
            <StatCard
              label="Total Employees"
              value={totalCount}
              icon={<Users size={22} />}
              iconClass="bg-brand-50 text-brand-600"
            />
            <StatCard
              label="Active"
              value={activeCount}
              icon={<UserCheck size={22} />}
              iconClass="bg-emerald-50 text-emerald-600"
            />
          </>
        )}
        <StatCard
          label="Probation / Notice"
          value={probationNotice}
          icon={<Clock size={22} />}
          iconClass="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Departments"
          value={deptCount}
          icon={<Building2 size={22} />}
          iconClass="bg-violet-50 text-violet-600"
        />
      </div>

      {/* Tabs */}
      <Tabs
        tabs={tabs}
        active={activeTab}
        onChange={(id) => setActiveTab(id as DirectoryTab)}
      />

      {!isEmployeeSelfView && activeTab === 'orgchart' ? (
        <Card>
          <CardHeader title="Organisation Chart" subtitle="Company hierarchy from CEO down" />
          <OrgChart employees={visibleEmployeeList} />
        </Card>
      ) : (
        <>
          {/* Toolbar */}
          {!isEmployeeSelfView && (
            <div className="flex flex-wrap gap-3 items-center">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search name, role, email, code…"
                className="w-64"
              />
              <Select
                value={deptFilter}
                onChange={setDeptFilter}
                placeholder="All Departments"
                options={departments.map((d) => ({ label: d, value: d }))}
                className="w-44"
              />
              <Select
                value={locationFilter}
                onChange={setLocationFilter}
                placeholder="All Locations"
                options={locations.map((l) => ({ label: l, value: l }))}
                className="w-36"
              />
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                placeholder="All Statuses"
                options={(['Active', 'On Leave', 'Probation', 'Notice Period', 'Resigned'] as EmployeeStatus[]).map((s) => ({ label: s, value: s }))}
                className="w-40"
              />
              <Select
                value={typeFilter}
                onChange={setTypeFilter}
                placeholder="All Types"
                options={(['Full-time', 'Part-time', 'Contract', 'Intern'] as EmploymentType[]).map((t) => ({ label: t, value: t }))}
                className="w-36"
              />
              <div className="ml-auto flex items-center gap-1 border border-ink-200 rounded-lg p-1 bg-white">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn('p-1.5 rounded-md transition-colors', viewMode === 'grid' ? 'bg-brand-600 text-white' : 'text-ink-500 hover:text-ink-800 hover:bg-ink-100')}
                  title="Grid view"
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'bg-brand-600 text-white' : 'text-ink-500 hover:text-ink-800 hover:bg-ink-100')}
                  title="List view"
                >
                  <List size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Results count */}
          {!isEmployeeSelfView && (search || deptFilter || locationFilter || statusFilter || typeFilter) && (
            <p className="text-sm text-ink-500">
              Showing <span className="font-semibold text-ink-800">{filtered.length}</span> of {totalCount} employees
            </p>
          )}

          {/* Grid / List */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Users size={26} />}
              title="No employees found"
              description="Try adjusting your search or filters."
              action={
                <Button variant="secondary" onClick={() => { setSearch(''); setDeptFilter(''); setLocationFilter(''); setStatusFilter(''); setTypeFilter(''); }}>
                  Clear filters
                </Button>
              }
            />
          ) : isEmployeeSelfView ? null : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((e) => <EmployeeCard key={e.id} employee={e} />)}
            </div>
          ) : (
            <Card padding={false}>
              <Table
                columns={listColumns}
                data={filtered}
                keyExtractor={(e) => e.id}
                onRowClick={(e) => navigate(`/employees/${e.id}`)}
              />
            </Card>
          )}
        </>
      )}

      <AddEmployeeModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSave={handleAddEmployee}
        employeeOptions={employeeList}
        canEditEmployeeCode={canEditEmployeeCode}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// InfoRow helper for detail page
// ---------------------------------------------------------------------------
/** Standard ABO/Rh groups — a fixed clinical vocabulary, not per-person data. */
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function InfoRow({ label, value }: { label: string; value: string | undefined | null }) {
  // An unrecorded detail shows as "—". Empty strings count as unrecorded too,
  // otherwise the row renders blank and reads as a rendering fault.
  const hasValue = typeof value === 'string' && value.trim().length > 0;
  return (
    <div>
      <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={cn('text-sm', hasValue ? 'text-ink-800' : 'text-ink-400')}>{hasValue ? value : '—'}</p>
    </div>
  );
}

/**
 * The resting state of an inline-editable value: the value itself, plus a
 * pencil that only appears on hover so a page of them does not read as a form.
 */
function InlineEditTrigger({
  label,
  onActivate,
  className,
  children,
}: {
  label: string;
  onActivate: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      title={`Change ${label.toLowerCase()}`}
      className={cn(
        'group -mx-1 inline-flex items-center gap-1 rounded px-1 text-left transition-colors hover:bg-ink-100',
        className,
      )}
    >
      {children}
      <Edit2 size={11} className="shrink-0 text-ink-400 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

/**
 * A form Select that can also add a value the list does not have yet.
 *
 * Unlike the inline pickers, this lives in a form that saves on a button, so
 * it must not create anything on its own — typing a name only sets the field.
 * Whoever handles the save decides whether the name is new and creates it
 * then, which is what keeps Cancel from leaving a department behind.
 *
 * Adding one is a **button beside the list**, not only an entry buried at the
 * bottom of it. The entry on its own had two problems, and both read as the
 * form refusing to work rather than as a control that had to be hunted for:
 *
 *   - A `<select>` fires no change event when the option picked is the one it
 *     is already showing. An organisation with no locations yet — a company
 *     created after the demo data, or any company after Settings → Delete Mock
 *     Data — was offered a dropdown whose *only* entry was the add-new one, so
 *     opening it and choosing that entry did nothing at all, every time.
 *     Starting in create mode when the list is empty removes the case rather
 *     than working around it. (Playwright's `selectOption` dispatches the event
 *     itself, so location-directory.spec.ts passed throughout.)
 *   - Nothing said what typing a name would do. It is filed for the whole
 *     company on save, so the field now says so.
 */
function SelectOrCreate({
  label,
  noun,
  value,
  options,
  onChange,
  disabled,
}: {
  /** Accessible name — the visible <label> is not associated by id. */
  label: string;
  /** Plain wording for the visible text; falls back to the accessible name. */
  noun?: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const [creating, setCreating] = useState(options.length === 0 && !disabled);
  // What to fall back to if the new value is abandoned.
  const previous = useRef(value);
  const word = noun ?? label.toLowerCase();

  function startCreating() {
    previous.current = value;
    onChange('');
    setCreating(true);
  }

  if (creating) {
    // Cancelling is only offered when there is a list to go back to. With none,
    // it would restore the empty dropdown this mode exists to avoid.
    const canCancel = options.length > 0 || previous.current !== '';
    const cancel = () => {
      onChange(previous.current);
      setCreating(false);
    };

    return (
      <div>
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="text"
            aria-label={`New ${label.toLowerCase()}`}
            placeholder={`Type the new ${word}`}
            className="input w-full"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              // Enter means "that is the name", not "save the employee" — the
              // rest of the form may still be empty. It hands the field back to
              // the dropdown, which lists the typed name as the chosen one.
              if (event.key === 'Enter' && value.trim()) {
                event.preventDefault();
                setCreating(false);
              }
              if (event.key === 'Escape' && canCancel) cancel();
            }}
          />
          {canCancel && (
            <Button variant="secondary" size="sm" onClick={cancel}>Cancel</Button>
          )}
        </div>
        <p className="mt-1 text-xs text-ink-500">
          {`This ${word} is added to the company list when you save.`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        ariaLabel={label}
        className="w-full flex-1 min-w-0"
        value={value}
        disabled={disabled}
        onChange={(next) => {
          if (next === CREATE_OPTION) {
            startCreating();
            return;
          }
          onChange(next);
        }}
        options={[
          // The person's current value survives the org renaming or removing
          // it \u2014 and it is also how a name typed a moment ago stays selected.
          ...(options.includes(value) || !value ? [] : [{ label: value, value }]),
          ...options.map((option) => ({ label: option, value: option })),
          { label: `+ Add new ${label.toLowerCase()}\u2026`, value: CREATE_OPTION },
        ]}
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={startCreating}
        title={`Add a ${word} that is not in the list`}
      >
        {/* The noun is spoken but not shown: two of these sit side by side in
            the form, and "+ New" alone names them both. */}
        + New<span className="sr-only"> {word}</span>
      </Button>
    </div>
  );
}

/** Sentinel manager id standing in for one that has not been created yet. */
const PENDING_MANAGER = '__new_manager__';

/** Sentinel option value, distinct from any plausible department or location. */
const CREATE_OPTION = '__create__';

/**
 * A single-choice value that can be changed where it is read.
 *
 * Department and location are among the details most often corrected after a
 * profile exists, and routing that through the Edit Profile modal is more
 * ceremony than the change is worth. Click the value, pick another, done.
 *
 * Viewers who cannot edit get the plain value with no affordance — a control
 * that looks clickable but refuses to act is worse than no control at all.
 *
 * When `onCreate` is given the list also offers an "add new" option, so a
 * department or location that does not exist yet can be added from here.
 */
function InlineSelect({
  label,
  value,
  options,
  onSave,
  onCreate,
  editable,
  triggerClassName,
  children,
}: {
  label: string;
  value: string;
  options: string[];
  onSave: (next: string) => void;
  /** Supplied when the list can be added to from here; omitted when it cannot. */
  onCreate?: (name: string) => void;
  editable: boolean;
  triggerClassName?: string;
  children?: ReactNode;
}) {
  const [mode, setMode] = useState<'rest' | 'choose' | 'create'>('rest');
  const [draft, setDraft] = useState('');
  const committed = useRef(false);
  // Picking "add new" closes the select, which also fires its blur. Without
  // this the blur would send us back to rest before the text box appeared.
  const openingCreate = useRef(false);

  if (!editable) return <>{children ?? value}</>;

  if (mode === 'create' && onCreate) {
    const commit = () => {
      if (committed.current) return;
      committed.current = true;
      const next = draft.trim();
      setMode('rest');
      if (!next) return;
      // Typing a name that already exists should pick it, not add a second
      // one alongside it under different capitalisation.
      const existing = options.find((option) => option.toLowerCase() === next.toLowerCase());
      if (existing) {
        if (existing !== value) onSave(existing);
        return;
      }
      onCreate(next);
    };

    return (
      <input
        autoFocus
        type="text"
        aria-label={`New ${label.toLowerCase()}`}
        placeholder={`New ${label.toLowerCase()}`}
        className="input w-auto max-w-[16rem] py-0.5 px-2 text-sm"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            committed.current = true;
            setMode('rest');
          }
        }}
      />
    );
  }

  if (mode === 'choose') {
    return (
      <select
        autoFocus
        aria-label={label}
        className="input w-auto max-w-[13rem] py-0.5 px-2 text-sm"
        value={value}
        onChange={(event) => {
          if (event.target.value === CREATE_OPTION) {
            setDraft('');
            committed.current = false;
            openingCreate.current = true;
            setMode('create');
            return;
          }
          if (event.target.value !== value) onSave(event.target.value);
          setMode('rest');
        }}
        onBlur={() => {
          if (openingCreate.current) {
            openingCreate.current = false;
            return;
          }
          setMode('rest');
        }}
        onKeyDown={(event) => { if (event.key === 'Escape') setMode('rest'); }}
      >
        {/* A value the org has since renamed or removed is still this
            person's value. Without this it would be absent from the list,
            the select would show the first option instead, and closing the
            editor untouched would silently reassign them. */}
        {!options.includes(value) && <option value={value}>{value}</option>}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
        {onCreate && <option value={CREATE_OPTION}>+ Add new {label.toLowerCase()}…</option>}
      </select>
    );
  }

  return (
    <InlineEditTrigger label={label} onActivate={() => setMode('choose')} className={triggerClassName}>
      {children ?? value}
    </InlineEditTrigger>
  );
}

/**
 * A free-text value that can be changed where it is read. Enter or clicking
 * away commits; Escape abandons the edit.
 */
function InlineText({
  label,
  value,
  onSave,
  editable,
  triggerClassName,
  children,
}: {
  label: string;
  value: string;
  onSave: (next: string) => void;
  editable: boolean;
  triggerClassName?: string;
  children?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // Enter commits and unmounts the input, which can also fire blur. Without
  // this the same edit would be saved twice.
  const committed = useRef(false);

  if (!editable) return <>{children ?? value}</>;

  if (editing) {
    const commit = () => {
      if (committed.current) return;
      committed.current = true;
      const next = draft.trim();
      // Required field: blank is not a value. Leave the record as it was
      // rather than emptying it, the same way the edit form refuses to save.
      if (next && next !== value) onSave(next);
      setEditing(false);
    };

    return (
      <input
        autoFocus
        type="text"
        aria-label={label}
        className="input w-auto max-w-[16rem] py-0.5 px-2 text-sm"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            committed.current = true;
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <InlineEditTrigger
      label={label}
      onActivate={() => {
        setDraft(value);
        committed.current = false;
        setEditing(true);
      }}
      className={triggerClassName}
    >
      {children ?? value}
    </InlineEditTrigger>
  );
}

/**
 * The reporting manager, with a button beside it for recording one.
 *
 * Deliberately not an `InlineEditTrigger` like the department and location
 * rows around it: those hide their pencil until hover, which is fine for
 * correcting a value that is already there. This row is most often read when
 * the value is *missing*, and somebody with no manager recorded has nobody who
 * can decide their leave at all — `getApprovableEmployeeIds` answers "nobody"
 * for them, by design (see lib/dataScope.ts). The way to fix that has to be
 * visible on the profile rather than hidden behind a hover on a dash or buried
 * in the whole Edit Profile form.
 *
 * The candidate list is passed in already pruned of this person and everyone
 * below them — offering a subordinate would close a cycle the org chart walks.
 */
function ReportingManagerRow({
  managerId,
  managerName,
  options,
  onSave,
  onCreateNew,
  editable,
}: {
  managerId: string | null | undefined;
  managerName: string | undefined;
  options: { label: string; value: string }[];
  /** '' clears it, leaving the employee reporting to nobody. */
  onSave: (managerId: string) => void;
  /** Opens the form that adds a manager who does not work here yet. */
  onCreateNew: () => void;
  editable: boolean;
}) {
  const [choosing, setChoosing] = useState(false);
  const value = managerName ?? 'None';

  if (!editable) return <InfoRow label="Reporting Manager" value={value} />;

  return (
    <div>
      <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-0.5">Reporting Manager</p>
      {choosing ? (
        <div className="flex items-center gap-2">
          <Select
            ariaLabel="Reporting Manager"
            className="w-full flex-1 min-w-0 py-0.5 px-2 text-sm"
            value={managerId ?? ''}
            onChange={(next) => {
              setChoosing(false);
              // Nobody is created here — this hands over to the form that
              // asks for the manager in full, and assigns them on save.
              if (next === CREATE_OPTION) {
                onCreateNew();
                return;
              }
              if (next !== (managerId ?? '')) onSave(next);
            }}
            options={[
              { label: 'No manager', value: '' },
              ...options,
              { label: '+ Add new manager…', value: CREATE_OPTION },
            ]}
          />
          <Button variant="secondary" size="sm" onClick={() => setChoosing(false)}>Cancel</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <p className={cn('text-sm', managerId ? 'text-ink-800' : 'text-ink-400')}>{value}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setChoosing(true)}
            title={managerId ? 'Change who this employee reports to' : 'Record who this employee reports to'}
          >
            {managerId ? 'Change manager' : '+ Add reporting manager'}
          </Button>
        </div>
      )}
      {!managerId && !choosing ? (
        <p className="mt-1 text-xs text-ink-400">Until one is recorded, nobody can approve their leave.</p>
      ) : null}
    </div>
  );
}

/**
 * InfoRow whose value is editable in place. Pass `options` for a fixed set of
 * choices; omit it for free text.
 */
function EditableInfoRow({
  label,
  value,
  options,
  onSave,
  onCreate,
  editable,
}: {
  label: string;
  value: string;
  options?: string[];
  onSave: (next: string) => void;
  onCreate?: (name: string) => void;
  editable: boolean;
}) {
  if (!editable) return <InfoRow label={label} value={value} />;
  return (
    <div>
      <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-0.5">{label}</p>
      <div className="text-sm text-ink-800">
        {options
          ? <InlineSelect label={label} value={value} options={options} onSave={onSave} onCreate={onCreate} editable />
          : <InlineText label={label} value={value} onSave={onSave} editable />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------
function OverviewTab({
  emp,
  profilePicture,
  onUploadProfilePicture,
  profilePictureError,
  canEditJobFields,
  onSaveField,
  onCreateDepartment,
  onCreateLocation,
  managerOptions,
  onSaveReportingManager,
  onCreateReportingManager,
}: {
  emp: Employee;
  profilePicture: string | null;
  onUploadProfilePicture: () => void;
  profilePictureError: string;
  canEditJobFields: boolean;
  onSaveField: (patch: Partial<Employee>) => void;
  onCreateDepartment: (name: string) => void;
  onCreateLocation: (name: string) => void;
  /** Everyone this person could report to, cycles already excluded. */
  managerOptions: { label: string; value: string }[];
  onSaveReportingManager: (managerId: string) => void;
  onCreateReportingManager: () => void;
}) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Photo" subtitle="This photo stays in sync with the profile picture above." />
        <div className="flex flex-col items-center gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={emp.fullName} size="xl" imageSrc={profilePicture} />
            <div>
              <p className="text-sm font-semibold text-ink-900">{emp.fullName}</p>
              <p className="text-xs text-ink-500">Profile photo</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={onUploadProfilePicture}>Upload Profile Pic</Button>
        </div>
        {profilePictureError ? <p className="text-xs font-medium text-rose-600">{profilePictureError}</p> : null}
      </Card>

      {/* Personal Info */}
      <Card>
        <CardHeader title="Personal Information" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
          <InfoRow label="Date of Birth" value={formatDate(emp.dateOfBirth)} />
          <InfoRow label="Gender" value={emp.gender} />
          <InfoRow label="Blood Group" value={emp.bloodGroup} />
          <InfoRow label="Marital Status" value={emp.maritalStatus} />
          <InfoRow label="Week Off" value={weekOffOf(emp)} />
          <InfoRow label="Email" value={emp.email} />
          <InfoRow label="Phone" value={emp.phone} />
          <div className="col-span-2 md:col-span-3">
            <InfoRow label="Address" value={emp.address} />
          </div>
        </div>
      </Card>

      {/* Job Info */}
      <Card>
        <CardHeader title="Job Information" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
          <InfoRow label="Employee Code" value={emp.employeeCode} />
          <EditableInfoRow
            label="Designation"
            value={emp.designation}
            onSave={(designation) => onSaveField({ designation })}
            editable={canEditJobFields}
          />
          <EditableInfoRow
            label="Department"
            value={emp.department}
            options={departments}
            onSave={(department) => onSaveField({ department })}
            onCreate={onCreateDepartment}
            editable={canEditJobFields}
          />
          <EditableInfoRow
            label="Location"
            value={emp.location}
            options={locations}
            onSave={(location) => onSaveField({ location })}
            onCreate={onCreateLocation}
            editable={canEditJobFields}
          />
          <InfoRow label="Employment Type" value={emp.employmentType} />
          <InfoRow label="Status" value={emp.status} />
          <InfoRow label="Date of Joining" value={formatDate(emp.dateOfJoining)} />
          <ReportingManagerRow
            managerId={emp.reportingManagerId}
            managerName={emp.reportingManagerName}
            options={managerOptions}
            onSave={onSaveReportingManager}
            onCreateNew={onCreateReportingManager}
            editable={canEditJobFields}
          />
        </div>
      </Card>

      {/* Skills */}
      {emp.skills && emp.skills.length > 0 && (
        <Card>
          <CardHeader title="Skills" />
          <div className="flex flex-wrap gap-2">
            {emp.skills.map((s) => (
              <span key={s} className="inline-flex items-center rounded-full bg-brand-50 text-brand-700 px-3 py-1 text-xs font-medium border border-brand-100">
                {s}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team Tab
// ---------------------------------------------------------------------------
function TeamTab({ emp, embeddedSelfView = false }: { emp: Employee; embeddedSelfView?: boolean }) {
  const navigate = useNavigate();
  const manager = emp.reportingManagerId ? getEmployee(emp.reportingManagerId) : null;
  const directReports = employees.filter((e) => e.reportingManagerId === emp.id);

  return (
    <div className="space-y-5">
      {/* Manager */}
      {!embeddedSelfView && manager && (
        <Card>
          <CardHeader title="Reporting Manager" />
          <div
            className="flex items-center gap-4 p-4 rounded-xl border border-ink-100 hover:border-brand-200 hover:shadow-sm cursor-pointer transition-all group"
            onClick={() => navigate(`/employees/${manager.id}`)}
          >
            <Avatar name={manager.fullName} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink-900 group-hover:text-brand-700 transition-colors">{manager.fullName}</p>
              <p className="text-sm text-ink-500 mt-0.5">{manager.designation}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-xs text-ink-400">{manager.department}</span>
                <span className="text-ink-200">·</span>
                <span className="text-xs text-ink-400">{manager.location}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={statusTone(manager.status)} dot>{manager.status}</Badge>
              <ChevronRight size={16} className="text-ink-400 group-hover:text-brand-600 transition-colors" />
            </div>
          </div>
        </Card>
      )}

      {/* Direct Reports */}
      <Card>
        <CardHeader
          title="Direct Reports"
          subtitle={directReports.length > 0 ? `${directReports.length} team member${directReports.length !== 1 ? 's' : ''}` : undefined}
        />
        {directReports.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title="No direct reports"
            description="This employee does not manage any team members."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {directReports.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-ink-100 hover:border-brand-200 hover:shadow-sm cursor-pointer transition-all group"
                onClick={() => navigate(`/employees/${r.id}`)}
              >
                <Avatar name={r.fullName} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-ink-900 group-hover:text-brand-700 transition-colors truncate">{r.fullName}</p>
                  <p className="text-xs text-ink-500 truncate mt-0.5">{r.designation}</p>
                </div>
                <Badge tone={statusTone(r.status)} dot>{r.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compensation Tab
// ---------------------------------------------------------------------------
const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#a855f7'];

function CompensationTab({ emp }: { emp: Employee }) {
  // This tab stays mounted while an administrator edits the split in Settings,
  // and the cache is also hydrated from Firestore after sign-in.
  useSalaryStructureRevision();
  const annual = emp.ctc;
  // Reuse payroll's own split rather than restating the 50/25 ratios and the
  // flat allowances here — duplicating them meant this tab could silently
  // disagree with the payslip.
  const {
    monthly, splitConfigured,
    basic, hra, medicalAllowance, conveyanceAllowance, specialAllowance: special,
  } = buildPayslipComponents(emp);

  // Percentages are computed from the amounts, not asserted alongside them.
  // "Special Allowance" was labelled a flat 40% while actually being the
  // rounding remainder.
  const share = (amount: number) => pct(amount, monthly);

  const breakdown: Array<{
    label: string;
    amount: number;
    pct: number;
    color: string;
    tone: 'brand' | 'green' | 'amber' | 'red';
  }> = [
    { label: 'Basic Salary', amount: basic, pct: share(basic), color: 'text-indigo-600', tone: 'brand' },
    { label: 'HRA', amount: hra, pct: share(hra), color: 'text-emerald-600', tone: 'green' },
    { label: 'Medical Allowance', amount: medicalAllowance, pct: share(medicalAllowance), color: 'text-cyan-600', tone: 'brand' },
    { label: 'Conveyance Allowance', amount: conveyanceAllowance, pct: share(conveyanceAllowance), color: 'text-violet-600', tone: 'green' },
    { label: 'Special Allowance', amount: special, pct: share(special), color: 'text-amber-600', tone: 'amber' },
  ];

  const pieData = [
    { name: 'Basic', value: basic },
    { name: 'HRA', value: hra },
    { name: 'Medical', value: medicalAllowance },
    { name: 'Conveyance', value: conveyanceAllowance },
    { name: 'Special', value: special },
  ];

  return (
    <div className="space-y-5">
      {/* CTC Headline */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div>
            <p className="text-sm font-medium text-ink-500 mb-1">Annual CTC</p>
            <p className="text-3xl font-bold text-ink-900">{formatINR(annual)}</p>
            <p className="text-sm text-ink-400 mt-1">Monthly gross: <span className="font-semibold text-ink-700" data-testid="monthly-gross" data-amount={monthly}>{formatINR(monthly)}</span></p>
          </div>
          <div className="flex items-center gap-3 sm:ml-auto">
            <Badge tone="green">Active Package</Badge>
            <Badge tone="blue">{emp.employmentType}</Badge>
          </div>
        </div>
      </Card>

      {/* Breakdown + Chart — only once the organisation has said how it splits
          a salary. Showing a plausible default instead would be telling this
          company its pay is divided in a way nobody here decided. */}
      {!splitConfigured ? (
        <Card>
          <CardHeader title="Monthly Breakdown" />
          <div
            className="rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center"
            data-testid="salary-structure-unset"
          >
            <p className="text-sm text-ink-500">
              Your organisation has not set a salary structure, so this salary cannot be broken
              into components.
            </p>
            <p className="mt-1 text-xs text-ink-400">
              An administrator sets it in Settings → Salary Structure. The gross above and the net
              pay on payslips are unaffected.
            </p>
          </div>
        </Card>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Monthly Breakdown" />
          <div className="space-y-4">
            {breakdown.map((item) => (
              <div
                key={item.label}
                // The figures, unformatted, so tests/e2e/salary-breakdown.spec.ts
                // can check that the components still add up to the monthly gross
                // rather than re-deriving them from "₹1,50,000" strings.
                data-testid="salary-component"
                data-component={item.label}
                data-amount={item.amount}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-ink-700">{item.label}</span>
                  <span className={cn('text-sm font-semibold', item.color)}>{formatINR(item.amount)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Tone travels with the row rather than being re-derived from
                      its label, which silently defaulted every component after
                      HRA to the same amber. */}
                  <ProgressBar value={item.pct} tone={item.tone} />
                  {/* A flat ₹1,492 against a large salary rounds to 0%, which
                      reads as "nothing is paid". It is paid; it is just small. */}
                  <span className="text-xs text-ink-400 w-10 text-right">
                    {item.pct === 0 && item.amount > 0 ? '<1%' : `${item.pct}%`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Pay Split" />
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pieData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatINR(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {pieData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} />
                <span className="text-xs text-ink-600">{d.name}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents Tab
// ---------------------------------------------------------------------------
type DocStatus = DocumentStatus;
type DocRecord = EmployeeDocument;
type DocumentUploadCategory = DocumentCategory;

const PRIMARY_DOCUMENT_OPTIONS = [
  { label: 'Aadhaar Card', value: 'Aadhaar Card' },
  { label: 'PAN Card', value: 'PAN Card' },
  { label: 'Bank Account Details', value: 'Bank Account Details' },
];

function docStatusTone(s: DocStatus): 'green' | 'amber' | 'red' {
  if (s === 'Verified') return 'green';
  if (s === 'Pending') return 'amber';
  return 'red';
}

function DocumentsTab({ employeeId }: { employeeId: string }) {
  const { profile } = useAuth();
  const { documents, error: documentsError } = useEmployeeDocuments(profile, employeeId);
  const canEditStatus = canVerifyDocuments(profile);
  const canUploadPrimary = canFileDocuments(profile, 'primary', employeeId);
  const canUploadSecondary = canFileDocuments(profile, 'secondary', employeeId);
  const primaryDocuments = documents.filter((document) => documentCategory(document.name) === 'primary');
  const secondaryDocuments = documents.filter((document) => documentCategory(document.name) === 'secondary');
  const [uploadCategory, setUploadCategory] = useState<DocumentUploadCategory>('primary');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [primaryDocumentName, setPrimaryDocumentName] = useState('Aadhaar Card');
  const [secondaryDocumentName, setSecondaryDocumentName] = useState('');
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');

  function formatUploadedSize(sizeBytes: number): string {
    if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KB`;
    return `${sizeBytes} B`;
  }

  function detectDocumentType(fileName: string): string {
    const extension = fileName.split('.').pop()?.toUpperCase();
    if (!extension) return 'FILE';
    if (extension === 'PDF' || extension === 'ZIP') return extension;
    return extension;
  }

  function resetUploadForm(category: DocumentUploadCategory) {
    setUploadCategory(category);
    setPrimaryDocumentName('Aadhaar Card');
    setSecondaryDocumentName('');
    setSelectedUploadFile(null);
    setUploadError('');
  }

  function openUploadModal(category: DocumentUploadCategory) {
    resetUploadForm(category);
    setUploadModalOpen(true);
  }

  function closeUploadModal() {
    setUploadModalOpen(false);
    resetUploadForm(uploadCategory);
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedUploadFile(file);
    setUploadError('');

    if (file && uploadCategory === 'secondary' && !secondaryDocumentName.trim()) {
      setSecondaryDocumentName(file.name.replace(/\.[^.]+$/, ''));
    }
  }

  async function handleUploadSubmit() {
    if (!selectedUploadFile) {
      setUploadError('Select a file to upload.');
      return;
    }

    const documentName = uploadCategory === 'primary'
      ? primaryDocumentName
      : secondaryDocumentName.trim();

    if (!documentName) {
      setUploadError(uploadCategory === 'primary'
        ? 'Select a compulsory document type.'
        : 'Enter a document name for the optional submission.');
      return;
    }

    // The id is derived from the name, so re-filing replaces rather than
    // duplicates — no need to hunt for the existing record first.
    try {
      await fileEmployeeDocument(profile, {
        employeeId,
        name: documentName,
        type: detectDocumentType(selectedUploadFile.name),
        uploaded: todayIso(),
        size: formatUploadedSize(selectedUploadFile.size),
      });
    } catch (error) {
      // Includes permission-denied from firestore.rules, which is the check
      // that actually decides — the hidden button is only the page being
      // polite about it.
      setUploadError(
        error instanceof EmployeeDocumentError
          ? error.message
          : 'That upload was refused. You may not file this kind of document for this employee.',
      );
      return;
    }
    setUploadModalOpen(false);
    resetUploadForm(uploadCategory);
  }

  const docIcon = (type: string) =>
    type === 'ZIP' ? <Award size={14} className="text-amber-500" /> : <FileText size={14} className="text-brand-500" />;

  const docColumns: Column<DocRecord>[] = [
    {
      key: 'name',
      header: 'Document',
      render: (d) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100">{docIcon(d.type)}</div>
          <div>
            <p className="text-sm font-medium text-ink-800">{d.name}</p>
            <p className="text-xs text-ink-400">{d.type} · {d.size}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) =>
        canEditStatus ? (
          <select
            className="input !py-1 !text-xs w-32"
            value={d.status}
            onChange={(event) => void setEmployeeDocumentStatus(profile, d.id, event.target.value as DocStatus)}
          >
            <option value="Verified">Verified</option>
            <option value="Pending">Pending</option>
            <option value="Expired">Expired</option>
          </select>
        ) : (
          <Badge tone={docStatusTone(d.status)} dot>
            {d.status}
          </Badge>
        ),
    },
    {
      key: 'uploaded',
      header: 'Uploaded',
      render: (d) => <span className="text-sm text-ink-600">{formatDate(d.uploaded)}</span>,
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: () => (
        <button className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium">
          <Download size={13} />
          Download
        </button>
      ),
    },
  ];

  function renderDocumentSection(
    title: string,
    subtitle: string,
    requirementLabel: string,
    requirementTone: 'red' | 'blue',
    sectionDocuments: DocRecord[],
    emptyMessage: string,
    uploadButtonLabel: string,
    uploadButtonAction: () => void,
    canUpload: boolean,
    /** Who may upload here, shown in place of the button to whoever may not. */
    uploaderNote: string,
  ) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-2 px-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
            <p className="text-xs text-ink-500">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <Badge tone={requirementTone}>{requirementLabel}</Badge>
            {/* Not rendered at all rather than disabled: a greyed-out button
                invites someone to ask why it is greyed out, where a sentence
                naming who does upload here answers it. */}
            {canUpload ? (
              <Button variant="secondary" size="sm" onClick={uploadButtonAction}>
                {uploadButtonLabel}
              </Button>
            ) : (
              <span className="text-xs text-ink-400 max-w-[15rem] sm:text-right">{uploaderNote}</span>
            )}
          </div>
        </div>
        <Table
          columns={docColumns}
          data={sectionDocuments}
          keyExtractor={(d) => d.id}
          emptyMessage={emptyMessage}
        />
      </div>
    );
  }

  return (
    <Card padding={false}>
      <div className="p-5 border-b border-ink-100 space-y-4">
        <CardHeader
          title="Employee Documents"
          subtitle="Primary documents are compulsory. Secondary documents are optional submissions."
        />
      </div>
      <div className="py-5 space-y-6">
        {/* The rules deploy separately from the app, so a refused listener is a
            real state — an empty list would otherwise read as "no documents
            filed", which is a different and reassuring thing. */}
        {documentsError && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
            These documents could not be loaded. Your account may not have access to this
            employee's records.
          </p>
        )}
        {renderDocumentSection(
          'Primary Documents',
          'Aadhaar Card, PAN Card, and Bank Account Details must be submitted.',
          'Compulsory Submission',
          'red',
          primaryDocuments,
          'Primary documents pending upload',
          'Upload Compulsory',
          () => openUploadModal('primary'),
          canUploadPrimary,
          'Uploaded by the employee themselves or by HR.',
        )}
        {renderDocumentSection(
          'Secondary Documents',
          'All documents other than the primary set are optional submissions.',
          'Optional Submission',
          'blue',
          secondaryDocuments,
          'No secondary documents uploaded',
          'Upload Optional',
          () => openUploadModal('secondary'),
          canUploadSecondary,
          'Uploaded by an administrator or by HR.',
        )}
      </div>
      <Modal
        open={uploadModalOpen}
        onClose={closeUploadModal}
        title={uploadCategory === 'primary' ? 'Upload Compulsory Document' : 'Upload Optional Document'}
        subtitle={uploadCategory === 'primary'
          ? 'Submit one of the required primary documents.'
          : 'Optional documents will appear in the secondary submissions table.'}
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={closeUploadModal}>Cancel</Button>
            <Button size="sm" onClick={() => void handleUploadSubmit()}>Upload</Button>
          </>
        )}
      >
        <div className="space-y-4">
          {uploadCategory === 'primary' ? (
            <div className="space-y-1.5">
              <label className="label">Compulsory document type</label>
              <Select
                value={primaryDocumentName}
                onChange={setPrimaryDocumentName}
                options={PRIMARY_DOCUMENT_OPTIONS}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="label">Optional document name</label>
              <input
                className="input"
                value={secondaryDocumentName}
                onChange={(event) => {
                  setSecondaryDocumentName(event.target.value);
                  setUploadError('');
                }}
                placeholder="Enter document name"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="label">Choose file</label>
            <input
              type="file"
              className="input file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700"
              onChange={handleFileSelected}
            />
            {selectedUploadFile ? (
              <p className="text-xs text-ink-500">
                Selected: {selectedUploadFile.name} · {formatUploadedSize(selectedUploadFile.size)}
              </p>
            ) : null}
          </div>

          {uploadError ? <p className="text-sm font-medium text-rose-600">{uploadError}</p> : null}
        </div>
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Time Off Tab
// ---------------------------------------------------------------------------
/**
 * This tab used to render one hardcoded set of balances and four fixed leave
 * events for every employee, so every profile in the directory reported the
 * same time off. Both cards now come from the employee's own records.
 */
function TimeOffTab({ employeeId }: { employeeId: string }) {
  const dataRevision = useDashboardDataRevision();

  const requests = useMemo(() => getLeaveRequests(), [dataRevision]);
  // Derived from the policy, the joining date and today — the same figures the
  // Leave module and the Dashboard card show. The seeded balance rows this used
  // to read are fixed totals that exist for the seed employees and nobody else,
  // so a profile could report a different number from the two other surfaces,
  // or no leave data at all for anyone added since.
  const employee = useMemo(() => getEmployee(employeeId), [employeeId, dataRevision]);
  const balances = useMemo(
    () => (employee ? getEntitlements(employee, requests) : []),
    [employee, requests],
  );
  const history = useMemo(
    () => requests
      .filter((request) => request.employeeId === employeeId)
      .slice()
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .slice(0, 6),
    [requests, employeeId],
  );

  return (
    <div className="space-y-5">
      <Card>
        {/* Leave runs April–March, not January–December: the accrual, the reset
            and the "used" figure are all counted per financial year. */}
        <CardHeader
          title="Leave Balances"
          subtitle={`Accrued so far in ${financialYearLabel()}`}
          // Said out loud: these figures are meant to differ from the policy in
          // Settings for this person, and an unexplained difference reads as a
          // defect in the accrual rather than as the exception it is.
          action={hasEmployeeLeavePolicy(employeeId)
            ? <Badge tone="violet">Custom entitlement</Badge>
            : undefined}
        />
        {balances.length === 0 ? (
          // Two different absences, and only one of them is about this person:
          // an organisation with no policy set accrues nothing for anybody, and
          // the remedy is in Settings rather than on this profile.
          <p className="py-6 text-center text-sm text-ink-400">
            {getLeavePolicies().length === 0
              ? 'Your organisation has not set a leave policy, so nothing accrues yet. An administrator sets it in Settings → Leave Policies.'
              : 'No leave balance has been set up for this employee yet.'}
          </p>
        ) : (
          <div className="space-y-5">
            {balances.map((lb) => {
              // Measured against the year as a whole, not against a granted
              // figure that grows every month — otherwise the bar moves when
              // nothing was taken. Matches the Leave module and the Dashboard.
              const usedPct = pct(lb.used, lb.fullYear);
              return (
                <div
                  key={lb.type}
                  data-testid="leave-balance-row"
                  data-leave-type={lb.type}
                  data-leave-reading={lb.withheldReason ?? `${lb.available}/${lb.granted}`}
                  data-leave-pending={lb.pending}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-ink-800">{lb.type} Leave</span>
                    {lb.withheldReason ? (
                      <span className="text-xs text-ink-400">{lb.withheldReason}</span>
                    ) : (
                      <div className="flex items-center gap-4 text-xs text-ink-500">
                        <span><span className="font-semibold text-ink-700">{lb.used}</span> used</span>
                        {/* The card below lists this employee's pending
                            requests. Without this the two disagreed: a 4-day
                            Pending request showed there and changed nothing
                            here. */}
                        {lb.pending > 0 && (
                          <span><span className="font-semibold text-amber-600">{lb.pending}</span> pending</span>
                        )}
                        {/* `remaining`, not `available`: with a day awaiting
                            approval the three figures must still add up to what
                            has accrued, or the row reads "0 used · 1 pending ·
                            5 remaining of 5". Identical to `available` whenever
                            nothing is pending. */}
                        <span><span className="font-semibold text-emerald-600">{lb.remaining}</span> remaining</span>
                        <span>of {lb.granted} accrued · {lb.fullYear} for the year</span>
                      </div>
                    )}
                  </div>
                  <ProgressBar value={usedPct} tone={usedPct > 75 ? 'amber' : 'brand'} showLabel />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Recent Leave Activity" />
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">No leave requests on record.</p>
        ) : (
          <div className="space-y-3">
            {history.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-ink-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50">
                    <Calendar size={14} className="text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-800">{item.type} Leave</p>
                    <p className="text-xs text-ink-400">
                      {formatDate(item.startDate)} – {formatDate(item.endDate)} · {item.days} day{item.days !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <Badge tone={statusTone(item.status)} dot>{item.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmployeeDetailPage
// ---------------------------------------------------------------------------
type DetailTab = 'overview' | 'team' | 'compensation' | 'documents' | 'timeoff';

function EmployeeProfileExperience({ employeeId, embeddedSelfView = false }: { employeeId: string; embeddedSelfView?: boolean }) {
  const navigate = useNavigate();
  const { profile, isHR, isAdmin } = useAuth();
  const currentEmployee = getCurrentEmployee(profile);
  const loggedInRole = resolveAppRole(profile);
  const isEmployee = loggedInRole === 'Employee';
  /** The same rule as Add Employee — HR administers the organisation here. */
  const canEditEmployeeCode = isHR || isAdmin;

  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const profilePictureInputRef = useRef<HTMLInputElement | null>(null);
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [profilePictureError, setProfilePictureError] = useState('');

  const [messageOpen, setMessageOpen] = useState(false);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messageError, setMessageError] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  /** The form that adds a manager who is not in the directory yet. */
  const [addManagerOpen, setAddManagerOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editDepartment, setEditDepartment] = useState<Employee['department']>(departments[0] as Employee['department']);
  const [editLocation, setEditLocation] = useState(locations[0] ?? '');
  const [editGender, setEditGender] = useState<Gender | ''>('');
  const [editEmploymentType, setEditEmploymentType] = useState<EmploymentType>('Full-time');
  const [editStatus, setEditStatus] = useState<EmployeeStatus>('Active');
  const [editDateOfBirth, setEditDateOfBirth] = useState('');
  const [editBloodGroup, setEditBloodGroup] = useState('');
  const [editMaritalStatus, setEditMaritalStatus] = useState('');
  // Typed as WeekOffDay rather than string: the roster offers exactly three
  // days, and there is no "not recorded" option because every employee has a
  // week-off. Someone with none set is off on Sunday, not off on no day.
  const [editWeekOff, setEditWeekOff] = useState<WeekOffDay>('Sunday');
  const [editAddress, setEditAddress] = useState('');
  const [editReportingManagerId, setEditReportingManagerId] = useState('');
  const [editError, setEditError] = useState('');
  // Told, not silent: a directory edit that changes someone's platform access
  // is worth saying out loud.
  const [accessNotice, setAccessNotice] = useState<string | null>(null);

  // Re-read the directory whenever it changes, so an edit made here — or on
  // another tab — is reflected without a reload. Saving used to repaint only
  // because closing the modal happened to re-render; editing in place has no
  // such side effect to lean on.
  useEmployeeDirectoryRevision();
  // Likewise for the department list behind the picker, so one added here or
  // renamed in Settings shows up without a reload.
  useDepartmentDirectoryRevision();

  const emp = getEmployee(employeeId);
  const isSelfView = emp ? emp.id === currentEmployee?.id : false;
  /** Who may change this person's details — the same rule as Edit Profile. */
  const canEditProfile = isSelfView || !isEmployee;
  /**
   * Job details are stricter than the rest of the profile: the edit form
   * disables designation, department and location for the employee role even
   * on their own profile — nobody moves themselves between departments or
   * promotes themselves. Editing in place has to honour the same rule, or the
   * inline controls would be a way around the restriction.
   */
  const canEditJobFields = !isEmployee;

  /**
   * Keeps platform access in step with the HR department after a directory
   * edit. Moving someone into HR grants administrator access for this company;
   * moving them out withdraws it. Awaiting nothing — the directory write has
   * already succeeded locally and this must not be able to undo it.
   */
  function syncAccess(next: Employee) {
    void syncHrRoleForEmployee(next, profile).then((outcome) => {
      if (outcome === 'granted') {
        setAccessNotice(`${next.fullName} is now ${next.designation} and has administrator access for this company.`);
      } else if (outcome === 'revoked') {
        setAccessNotice(`${next.fullName} no longer holds an HR role; their administrator access has been withdrawn.`);
      } else if (outcome === 'failed') {
        setAccessNotice('The profile was saved, but updating platform access failed. Check their role on the Admin dashboard.');
      }
    });
  }

  /** Persist a single field without going through the full edit form. */
  function saveField(patch: Partial<Employee>) {
    if (!emp) return;
    const next = { ...emp, ...patch };
    updateEmployeeInDirectory(next);
    // Designation and email are the two fields the HR grant keys off.
    if ('designation' in patch || 'email' in patch) syncAccess(next);
  }

  /**
   * Record, change or clear who this person reports to.
   *
   * Kept out of `saveField` rather than folded into it: a reporting line is
   * stamped onto the organisation's leave documents, so a change here has to
   * resync those chains — which a designation or a location change does not.
   */
  function saveReportingManager(managerId: string) {
    if (!emp) return;
    const manager = managerId
      ? getEmployeeDirectory().find((candidate) => candidate.id === managerId)
      : undefined;
    const next: Employee = {
      ...emp,
      reportingManagerId: managerId || null,
      // getEmployeeDirectory() recomputes the name on read; setting it here
      // keeps the record self-consistent in the meantime.
      reportingManagerName: manager?.fullName,
    };

    updateEmployeeInDirectory(next);
    if (reportingLineChanged(emp, next)) void syncManagerChains();
  }

  /**
   * Renumber this person, HR only.
   *
   * Everything that matches a person by their code — uploaded payslips, the
   * salary-split CSV, the leave-entitlement CSV — matches on the code as it is
   * now, so handing one person's code to another would silently redirect all
   * three. A code already in use is refused rather than taken.
   */
  function saveEmployeeCode(next: string) {
    if (!emp) return;
    if (isEmployeeCodeTaken(next, emp.id)) {
      setAccessNotice(`${next} is already another employee's code, so ${emp.fullName} still has ${emp.employeeCode}.`);
      return;
    }
    saveField({ employeeCode: next });
  }

  /**
   * Add a department to the org.
   *
   * Headcount is passed as 0 and the head as "—" because neither is stored
   * data: headcount is recounted from the people actually in the department
   * on every read, and the head is Settings' to record. Leaving open roles
   * unset keeps the new department tracking its real job openings rather
   * than pinning a literal — the same default Settings uses.
   */
  function addDepartment(name: string) {
    addDepartmentToDirectory({ name, head: '—', headcount: 0 });
  }

  /**
   * Add a department and move this person into it, for the inline picker,
   * which saves as soon as a value is chosen. The edit form does these two
   * steps itself so it can create nothing until Save is pressed.
   */
  function createDepartment(name: string) {
    addDepartment(name);
    saveField({ department: name });
  }

  /**
   * Declared for the organisation as well as applied to this person.
   *
   * `locations` was only ever the set of places people actually are, recomputed
   * from the directory — so a new office existed in the browser that typed it
   * and stopped existing once nobody was posted there. Both halves are wrong
   * for a place: it is the company's, and it outlives its current occupants.
   */
  function createLocation(name: string) {
    const location = normalizeLocation(name) || name;
    void addLocationToDirectory(location);
    saveField({ location });
  }

  /**
   * Who this person could report to: anyone in the directory except
   * themselves and anyone already below them. Offering a subordinate would
   * create a reporting cycle, which the org chart walks and would hang on.
   */
  const managerCandidates = useMemo(() => {
    if (!emp) return [] as Employee[];
    const directory = getEmployeeDirectory();

    const blocked = new Set<string>([emp.id]);
    let grew = true;
    while (grew) {
      grew = false;
      directory.forEach((candidate) => {
        const managerId = candidate.reportingManagerId;
        if (managerId && blocked.has(managerId) && !blocked.has(candidate.id)) {
          blocked.add(candidate.id);
          grew = true;
        }
      });
    }

    return directory
      .filter((candidate) => !blocked.has(candidate.id))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [emp]);

  const managerOptions = useMemo(
    () => managerCandidates.map((candidate) => ({
      label: `${candidate.fullName} · ${candidate.designation}`,
      value: candidate.id,
    })),
    [managerCandidates],
  );

  /**
   * Add somebody who does not work here yet, and make them this person's
   * manager.
   *
   * They are created through the same path as any other hire, so they arrive
   * complete — a manager who exists only as a name would show "—" across
   * their own profile and ₹0 in payroll. The assignment is the second step
   * rather than part of the record: the new manager is written first, and
   * only then does this employee point at them.
   */
  function handleCreateReportingManager(payload: NewEmployeePayload) {
    if (!emp) return;
    const { newManager: _unused, ...details } = payload;
    const created = createEmployeeFromDetails(details, { profile, notify: setAccessNotice });
    saveReportingManager(created.id);
    setAccessNotice(`${created.fullName} was added, and ${emp.fullName} now reports to them.`);
  }

  useEffect(() => {
    if (!emp) return;
    setMessageSubject(`Hello ${emp.firstName}`);
    setMessageBody('');
    setMessageError('');
    setEditError('');
    setProfilePicture(getEmployeeProfilePicture(emp.id));
    setProfilePictureError('');
  }, [emp?.id]);

  function openProfilePicturePicker() {
    profilePictureInputRef.current?.click();
  }

  function handleProfilePictureChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!emp || !file) return;

    if (!file.type.startsWith('image/')) {
      setProfilePictureError('Please choose an image file.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setProfilePictureError('Unable to upload profile picture. Please try again.');
        return;
      }

      writeEmployeeProfilePicture(emp.id, result);
      setProfilePicture(result);
      setProfilePictureError('');
    };
    reader.onerror = () => {
      setProfilePictureError('Unable to upload profile picture. Please try again.');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  function openMessageModal() {
    if (!emp) return;
    setMessageSubject(`Hello ${emp.firstName}`);
    setMessageBody('');
    setMessageError('');
    setMessageOpen(true);
  }

  function handleSendMessage() {
    if (!emp) return;
    const subject = messageSubject.trim();
    const body = messageBody.trim();

    if (!body) {
      setMessageError('Please add a message before sending.');
      return;
    }

    const mailto = `mailto:${emp.email}?subject=${encodeURIComponent(subject || `Hello ${emp.firstName}`)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setMessageOpen(false);
  }

  function openDeleteProfile() {
    if (!emp) return;
    setDeleteError('');
    setDeleteOpen(true);
  }

  function handleDeleteProfile() {
    if (!emp) return;
    deleteEmployeeFromDirectory(emp.id);
    // Removing a manager orphans their reports' chains, which would otherwise
    // keep granting a departed employee's account access to their leave.
    void syncManagerChains();
    setDeleteOpen(false);
    navigate(embeddedSelfView ? '/' : '/employees');
  }

  function openEditProfile() {
    if (!emp) return;
    setEditFirstName(emp.firstName);
    setEditLastName(emp.lastName);
    setEditEmail(emp.email);
    setEditPhone(emp.phone);
    setEditDesignation(emp.designation);
    setEditDepartment(emp.department);
    setEditLocation(emp.location);
    setEditGender(emp.gender ?? '');
    setEditEmploymentType(emp.employmentType);
    setEditStatus(emp.status);
    setEditDateOfBirth(emp.dateOfBirth ?? '');
    setEditBloodGroup(emp.bloodGroup ?? '');
    setEditMaritalStatus(emp.maritalStatus ?? '');
    setEditWeekOff(weekOffOf(emp));
    setEditAddress(emp.address ?? '');
    setEditReportingManagerId(emp.reportingManagerId ?? '');
    setEditError('');
    setEditOpen(true);
  }

  function handleSaveProfile() {
    if (!emp) return;

    const firstName = editFirstName.trim();
    const lastName = editLastName.trim();
    const email = editEmail.trim().toLowerCase();
    const designation = editDesignation.trim();
    const department = editDepartment.trim();
    const location = editLocation.trim();

    if (!firstName || !lastName) {
      setEditError('First name and last name are required.');
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEditError('Please enter a valid email address.');
      return;
    }
    if (!designation) {
      setEditError('Designation is required.');
      return;
    }
    // Both can now be typed rather than only picked, so both can arrive blank.
    if (!department) {
      setEditError('Department is required.');
      return;
    }
    if (!location) {
      setEditError('Location is required.');
      return;
    }
    if (editDateOfBirth && editDateOfBirth > todayIso()) {
      setEditError('Date of birth cannot be in the future.');
      return;
    }

    // A department typed rather than picked has to exist before someone is
    // filed under it. Matching an existing name case-insensitively means
    // typing "design" joins Design instead of standing up a rival to it.
    const knownDepartment = departments.find((item) => item.toLowerCase() === department.toLowerCase());
    if (!knownDepartment) addDepartment(department);
    // Locations need no such step: the list is derived from where people are,
    // so assigning this one is what brings it into existence.

    const updatedEmployee: Employee = {
      ...emp,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
      email,
      phone: editPhone.trim(),
      designation,
      department: knownDepartment ?? department,
      location,
      gender: editGender || undefined,
      employmentType: editEmploymentType,
      status: editStatus,
      dateOfBirth: editDateOfBirth,
      // Left undefined rather than stored as '' when blank, so the record
      // says "not recorded" instead of "recorded as empty".
      bloodGroup: editBloodGroup.trim() || undefined,
      maritalStatus: (editMaritalStatus as Employee['maritalStatus']) || undefined,
      // Always written, unlike the optional personal details above: this is a
      // roster the employer sets, so "unset" is not a state it should reach
      // once someone has been through this form.
      weekOff: editWeekOff,
      address: editAddress.trim() || undefined,
      reportingManagerId: editReportingManagerId || null,
      // getEmployeeDirectory() recomputes the name on read; setting it here
      // keeps the record self-consistent in the meantime.
      reportingManagerName: managerOptions.find((option) => option.value === editReportingManagerId)?.label,
    };

    updateEmployeeInDirectory(updatedEmployee);
    // The form can move someone between departments, so access is re-evaluated
    // on every save rather than only when the department field looks changed.
    syncAccess(updatedEmployee);
    // The reporting line is checked rather than re-run unconditionally: this
    // sweeps the organisation's leave documents, and most profile edits do not
    // touch the tree.
    if (reportingLineChanged(emp, updatedEmployee)) void syncManagerChains();

    setEditOpen(false);
  }

  if (!emp) {
    return (
      <EmptyState
        icon={<User size={26} />}
        title="Employee not found"
        description="The employee you are looking for does not exist."
        action={
          <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => navigate('/employees')}>
            Back to Employees
          </Button>
        }
      />
    );
  }

  const directReports = employees.filter((e) => e.reportingManagerId === emp.id);
  const tenure = computeTenureFull(emp.dateOfJoining);
  const showSalaryAndDocs = !isEmployee || isSelfView;
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'team', label: 'Team', count: directReports.length },
    ...(showSalaryAndDocs
      ? [
          { id: 'compensation', label: 'Compensation' },
          { id: 'documents', label: 'Documents' },
        ]
      : []),
    { id: 'timeoff', label: 'Time Off' },
  ];

  return (
    <div className="space-y-6">
      {accessNotice ? (
        <div
          className="flex items-start justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800"
          role="status"
        >
          <span>{accessNotice}</span>
          <button
            type="button"
            onClick={() => setAccessNotice(null)}
            className="shrink-0 text-brand-600 hover:text-brand-800"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      {!embeddedSelfView && (
        <button
          onClick={() => navigate('/employees')}
          className="inline-flex items-center gap-2 text-sm text-ink-500 hover:text-ink-900 font-medium transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Employees
        </button>
      )}

      <Card>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex items-start gap-5">
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div className="relative">
                <Avatar name={emp.fullName} size="xl" imageSrc={profilePicture} />
                <span
                  className={cn(
                    'absolute -bottom-1 -right-1 h-4 w-4 rounded-full ring-2 ring-white',
                    emp.status === 'Active' ? 'bg-emerald-400' : emp.status === 'On Leave' ? 'bg-violet-400' : 'bg-amber-400'
                  )}
                />
              </div>
              <Button variant="ghost" size="sm" onClick={openProfilePicturePicker}>Upload Profile Pic</Button>
              <input
                ref={profilePictureInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleProfilePictureChange}
              />
              {profilePictureError ? <p className="text-center text-xs font-medium text-rose-600">{profilePictureError}</p> : null}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-ink-900">{emp.fullName}</h2>
                <Badge tone={statusTone(emp.status)} dot>{emp.status}</Badge>
              </div>
              <InlineText
                label="Designation"
                value={emp.designation}
                onSave={(designation) => saveField({ designation })}
                editable={canEditJobFields}
              >
                {/* Styling rides on the child, not the trigger: viewers who
                    cannot edit get the child on its own, without the button. */}
                <span className="text-base text-ink-600 font-medium">{emp.designation}</span>
              </InlineText>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-ink-500">
                <InlineSelect
                  label="Department"
                  value={emp.department}
                  options={departments}
                  onSave={(department) => saveField({ department })}
                  onCreate={createDepartment}
                  editable={canEditJobFields}
                >
                  <span className="flex items-center gap-1"><Building2 size={13} />{emp.department}</span>
                </InlineSelect>
                <span className="text-ink-300">·</span>
                <InlineSelect
                  label="Location"
                  value={emp.location}
                  options={locations}
                  onSave={(location) => saveField({ location })}
                  onCreate={createLocation}
                  editable={canEditJobFields}
                >
                  <span className="flex items-center gap-1"><MapPin size={13} />{emp.location}</span>
                </InlineSelect>
                <span className="text-ink-300">·</span>
                <InlineText
                  label="Employee code"
                  value={emp.employeeCode}
                  onSave={saveEmployeeCode}
                  editable={canEditEmployeeCode}
                >
                  <span className="font-mono text-xs bg-ink-100 px-2 py-0.5 rounded">{emp.employeeCode}</span>
                </InlineText>
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-3">
                <a href={`mailto:${emp.email}`} className="flex items-center gap-1.5 text-xs text-ink-600 hover:text-brand-700 transition-colors">
                  <Mail size={13} className="text-ink-400" />
                  {emp.email}
                </a>
                {emp.phone?.trim() ? (
                  <a href={`tel:${emp.phone}`} className="flex items-center gap-1.5 text-xs text-ink-600 hover:text-brand-700 transition-colors">
                    <Phone size={13} className="text-ink-400" />
                    {emp.phone}
                  </a>
                ) : (
                  // No number on file — show the gap rather than an empty tel: link.
                  <span className="flex items-center gap-1.5 text-xs text-ink-400">
                    <Phone size={13} className="text-ink-300" />
                    No phone on file
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex md:flex-col items-start gap-2 md:ml-auto shrink-0">
            {!isSelfView && (
              <Button variant="secondary" size="sm" icon={<MessageSquare size={14} />} onClick={openMessageModal}>
                Message
              </Button>
            )}
            {canEditProfile && (
              <Button variant="secondary" size="sm" icon={<Edit2 size={14} />} onClick={openEditProfile}>
                Edit Profile
              </Button>
            )}
            {!isSelfView && !isEmployee && (
              <Button variant="secondary" size="sm" className="text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={openDeleteProfile}>
                Delete
              </Button>
            )}
          </div>
        </div>

        <div className={`grid gap-3 mt-6 pt-5 border-t border-ink-100 ${embeddedSelfView ? 'grid-cols-1 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-4'}`}>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Tenure</span>
            <span className="text-sm font-semibold text-ink-800">{tenure}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Employment Type</span>
            <span className="text-sm font-semibold text-ink-800">{emp.employmentType}</span>
          </div>
          {embeddedSelfView ? (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Reports To</span>
                {emp.reportingManagerId ? (
                  <Link
                    to={`/employees/${emp.reportingManagerId}`}
                    className="text-sm font-semibold text-brand-700 hover:text-brand-900 transition-colors truncate"
                  >
                    {emp.reportingManagerName}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold text-ink-800">—</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Team Size</span>
                <span className="text-sm font-semibold text-ink-800">
                  {directReports.length} direct report{directReports.length !== 1 ? 's' : ''}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Reports To</span>
                {emp.reportingManagerId ? (
                  <Link
                    to={`/employees/${emp.reportingManagerId}`}
                    className="text-sm font-semibold text-brand-700 hover:text-brand-900 transition-colors truncate"
                  >
                    {emp.reportingManagerName}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold text-ink-800">—</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Team Size</span>
                <span className="text-sm font-semibold text-ink-800">
                  {directReports.length} direct report{directReports.length !== 1 ? 's' : ''}
                </span>
              </div>
            </>
          )}
        </div>
      </Card>

      <Tabs tabs={tabs} active={activeTab} onChange={(id) => setActiveTab(id as DetailTab)} />

      {activeTab === 'overview' && (
        <OverviewTab
          emp={emp}
          profilePicture={profilePicture}
          onUploadProfilePicture={openProfilePicturePicker}
          profilePictureError={profilePictureError}
          canEditJobFields={canEditJobFields}
          onSaveField={saveField}
          onCreateDepartment={createDepartment}
          onCreateLocation={createLocation}
          managerOptions={managerOptions}
          onSaveReportingManager={saveReportingManager}
          onCreateReportingManager={() => setAddManagerOpen(true)}
        />
      )}
      {activeTab === 'team' && <TeamTab emp={emp} embeddedSelfView={embeddedSelfView} />}
      {activeTab === 'compensation' && <CompensationTab emp={emp} />}
      {activeTab === 'documents' && <DocumentsTab employeeId={emp.id} />}
      {activeTab === 'timeoff' && <TimeOffTab employeeId={emp.id} />}

      {/* The manager is offered the people this employee could report to —
          the same cycle-free set as the picker — so the person being created
          cannot end up reporting to somebody who reports to them. */}
      <AddEmployeeModal
        open={addManagerOpen}
        onClose={() => setAddManagerOpen(false)}
        onSave={handleCreateReportingManager}
        employeeOptions={managerCandidates}
        canEditEmployeeCode={canEditEmployeeCode}
        allowNewManager={false}
        title={`Add ${emp.firstName}'s Reporting Manager`}
        subtitle="A manager is an employee too, so the same details are needed. They are added to the directory and become this employee's manager."
        saveLabel="Add manager"
      />

      <Modal
        open={messageOpen}
        onClose={() => {
          setMessageOpen(false);
          setMessageError('');
        }}
        title={`Message ${emp.fullName}`}
        subtitle="Compose an email message"
        size="sm"
        footer={(
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setMessageOpen(false);
                setMessageError('');
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSendMessage}>Send Message</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Subject</label>
            <input
              type="text"
              value={messageSubject}
              onChange={(event) => {
                setMessageSubject(event.target.value);
                setMessageError('');
              }}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Message</label>
            <textarea
              value={messageBody}
              onChange={(event) => {
                setMessageBody(event.target.value);
                setMessageError('');
              }}
              rows={5}
              className="input w-full resize-none"
              placeholder="Write your message"
            />
          </div>
          {messageError && <p className="text-sm text-rose-600">{messageError}</p>}
        </div>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditError('');
        }}
        title="Edit Profile"
        subtitle="Update employee information"
        size="lg"
        footer={(
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setEditOpen(false);
                setEditError('');
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveProfile}>Save Changes</Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">First Name</label>
            <input type="text" value={editFirstName} onChange={(event) => setEditFirstName(event.target.value)} className="input w-full" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Last Name</label>
            <input type="text" value={editLastName} onChange={(event) => setEditLastName(event.target.value)} className="input w-full" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Email</label>
            <input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} className="input w-full" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Phone</label>
            <input type="tel" value={editPhone} onChange={(event) => setEditPhone(event.target.value)} className="input w-full" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Designation</label>
            <input
              type="text"
              value={editDesignation}
              onChange={(event) => setEditDesignation(event.target.value)}
              className="input w-full disabled:bg-ink-50 disabled:text-ink-400"
              disabled={isEmployee}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Department</label>
            <SelectOrCreate
              label="Department"
              value={editDepartment}
              onChange={(value) => setEditDepartment(value as Employee['department'])}
              options={departments}
              disabled={isEmployee}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Location</label>
            <SelectOrCreate
              label="Location"
              value={editLocation}
              onChange={setEditLocation}
              options={locations}
              disabled={isEmployee}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Gender</label>
            <Select
              value={editGender}
              onChange={(value) => setEditGender(value as Gender | '')}
              options={[
                { label: 'Not recorded', value: '' },
                ...(['Male', 'Female', 'Other'] as Gender[]).map((genderOption) => ({ label: genderOption, value: genderOption })),
              ]}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Employment Type</label>
            <Select
              value={editEmploymentType}
              onChange={(value) => setEditEmploymentType(value as EmploymentType)}
              options={(['Full-time', 'Part-time', 'Contract', 'Intern'] as EmploymentType[]).map((type) => ({ label: type, value: type }))}
              disabled={isEmployee}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Date of Birth</label>
            <input
              type="date"
              max={todayIso()}
              value={editDateOfBirth}
              onChange={(event) => setEditDateOfBirth(event.target.value)}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Blood Group</label>
            <Select
              value={editBloodGroup}
              onChange={setEditBloodGroup}
              options={[{ label: 'Not recorded', value: '' }, ...BLOOD_GROUPS.map((group) => ({ label: group, value: group }))]}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Marital Status</label>
            <Select
              value={editMaritalStatus}
              onChange={setEditMaritalStatus}
              options={[
                { label: 'Not recorded', value: '' },
                { label: 'Single', value: 'Single' },
                { label: 'Married', value: 'Married' },
              ]}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Week Off</label>
            <Select
              value={editWeekOff}
              onChange={(value) => setEditWeekOff(value as WeekOffDay)}
              options={WEEK_OFF_DAYS.map((day) => ({ label: day, value: day }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Address</label>
            <input
              type="text"
              value={editAddress}
              onChange={(event) => setEditAddress(event.target.value)}
              placeholder="Not recorded"
              className="input w-full"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Reporting Manager</label>
            <Select
              value={editReportingManagerId}
              onChange={setEditReportingManagerId}
              options={[{ label: 'No manager', value: '' }, ...managerOptions]}
              disabled={isEmployee}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Status</label>
            <Select
              value={editStatus}
              onChange={(value) => setEditStatus(value as EmployeeStatus)}
              options={(['Active', 'On Leave', 'Probation', 'Notice Period', 'Resigned'] as EmployeeStatus[]).map((status) => ({ label: status, value: status }))}
              disabled={isEmployee}
            />
          </div>
          {editError && <p className="md:col-span-2 text-sm text-rose-600">{editError}</p>}
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteError('');
        }}
        title="Delete Profile"
        subtitle={`Remove ${emp.fullName} from the employee directory`}
        size="sm"
        footer={(
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteError('');
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleDeleteProfile}>Delete Profile</Button>
          </>
        )}
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            This will remove the profile from the employee directory and it will no longer open at this route.
          </p>
          {deleteError && <p className="text-sm text-rose-600">{deleteError}</p>}
        </div>
      </Modal>
    </div>
  );
}

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const directoryRevision = useEmployeeDirectoryRevision();

  const currentEmployee = getCurrentEmployee(profile);
  const role = resolveAppRole(profile);
  const isEmployee = role === 'Employee';
  const resolvedEmployeeId = id || (isEmployee ? currentEmployee?.id : undefined);

  // The list was scoped but this route was not, so anyone could read any
  // colleague's full profile — salary band included — by typing the id into the
  // URL. The same rule that filters the directory now guards the record itself.
  const allowed = useMemo(
    () => (resolvedEmployeeId ? canViewEmployee(profile, resolvedEmployeeId) : false),
    [profile, resolvedEmployeeId, directoryRevision],
  );

  if (!resolvedEmployeeId) return null;
  if (!allowed) {
    return (
      <EmptyState
        icon={<Users size={24} />}
        title="Profile not available"
        description="You do not have access to this employee's record."
      />
    );
  }

  return (
    <EmployeeProfileExperience
      employeeId={resolvedEmployeeId}
      embeddedSelfView={resolvedEmployeeId === currentEmployee?.id}
    />
  );
}
