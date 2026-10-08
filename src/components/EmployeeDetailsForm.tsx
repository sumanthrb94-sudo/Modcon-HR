import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Select } from '@/components/ui';
import { departments } from '@/data/departments';
import { isEmployeeCodeTaken, locations, suggestEmployeeCode } from '@/data/employees';
import type { EmployeeDetails } from '@/data/createEmployee';
import { todayIso } from '@/lib/today';
import type { Employee, EmploymentType, Gender } from '@/types';

/**
 * One person's details as a form — the fields, the rules and the draft.
 *
 * It lived inside the Employees page while Add Employee and Add Reporting
 * Manager were its only users. The guided setup asks HR for their own details
 * in exactly these terms, and a second copy of the fields would be a second
 * set of rules about what a person must have before payroll can pay them.
 */

/** One person's details as the form holds them — every field a string. */
export interface EmployeeDetailsDraft {
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



export function emptyDetailsDraft(): EmployeeDetailsDraft {
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

export function validateDetailsDraft(draft: EmployeeDetailsDraft): Record<string, string> {
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

export function toEmployeeDetails(draft: EmployeeDetailsDraft): EmployeeDetails {
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
export function useEmployeeDetailsForm(initial: () => EmployeeDetailsDraft = emptyDetailsDraft) {
  const [draft, setDraft] = useState<EmployeeDetailsDraft>(initial);

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

export type DetailsForm = ReturnType<typeof useEmployeeDetailsForm>;

/**
 * The employee fields themselves. `managerControl` is a slot because the two
 * uses differ there and only there: a hire can name a manager who does not
 * exist yet, a manager can only be given one who already does. It also keeps
 * this presentational — it knows nothing about the directory it would have to
 * read to list candidates.
 */
export function EmployeeDetailsFields({
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
export function SelectOrCreate({
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

/** Sentinel option value, distinct from any plausible department or location. */
export const CREATE_OPTION = '__create__';