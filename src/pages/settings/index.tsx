import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Building2, Users, CalendarDays, Shield, Bell,
  Plug, CreditCard, ChevronRight, Check, X,
  Plus, Edit2, Zap, ToggleLeft, ToggleRight,
  Slack, Chrome, Package, Code2, Leaf,
  AlertCircle, AlertTriangle, CheckCircle2, Star, Database, Trash2, Wallet, MapPin,
  Upload, Download, RefreshCw,
} from 'lucide-react';
import {
  PageHeader, Card, CardHeader, Badge, Button, Table, Modal,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { Select } from '@/components/ui';
import { employees } from '@/data/employees';
import { HR_DEPARTMENT, getCompanyProfile, isHrDepartment, saveCompanyProfile, type CompanyProfile as CompanyProfileRecord } from '@/data/companyProfile';
import { getDepartmentDirectory, addDepartmentToDirectory, updateDepartmentInDirectory, deleteDepartmentFromDirectory, renameDepartmentInDirectory, getDepartmentRecord } from '@/data/departments';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { useDepartmentDirectoryRevision } from '@/lib/useDepartmentDirectoryRevision';
import {
  getLeavePolicies,
  saveLeavePolicies,
  isMonthlyPolicy,
  normalizeLeaveTypeValue,
  describeLeavePolicyOverride,
  getEmployeeLeavePolicies,
  saveEmployeeLeavePolicies,
  setEmployeeLeavePolicy,
  parseEmployeeLeavePolicyCsv,
  EMPLOYEE_LEAVE_POLICY_CSV_HEADER,
  parseLeavePolicyCsv,
  LEAVE_POLICY_CSV_HEADER,
  inheritedDemoPolicies,
  type LeavePolicy,
  type LeaveAccrual,
  type LeavePolicyCsvResult,
  type LeavePolicyCsvUpload,
} from '@/data/leavePolicies';
import { getLeaveRequests } from '@/data/leave';
import {
  addLocationToDirectory,
  buildLocationDirectory,
  normalizeLocation,
  removeLocationFromDirectory,
  renameLocationInDirectory,
  type LocationRecord,
} from '@/data/locations';
import { getEmployeeDirectory, reassignEmployeeLocation } from '@/data/employees';
import { useLocationDirectoryRevision } from '@/lib/useLocationDirectoryRevision';
import { useLeavePoliciesRevision } from '@/lib/useLeavePoliciesRevision';
import {
  getSalaryStructure,
  saveSalaryStructure,
  splitMonthlyGross,
  getEmployeeSalaryStructures,
  saveEmployeeSalaryStructures,
  setEmployeeSalaryStructure,
  parseEmployeeSalaryStructureCsv,
  EMPLOYEE_SALARY_STRUCTURE_CSV_HEADER,
  parseSalaryStructureCsv,
  SALARY_STRUCTURE_CSV_HEADER,
  type SalaryStructure,
  type SalaryStructureCsvResult,
} from '@/data/salaryStructure';
import { useSalaryStructureRevision } from '@/lib/useSalaryStructureRevision';
import {
  APP_MODULES,
  APP_ROLES,
  defaultPermissions,
  type AppModule,
  type AppRole,
  type PermissionLevel,
  type PermissionMatrix,
  savePermissionMatrix,
  getPermissionMatrix,
  isModuleExcluded,
  pinnedPermission,
} from '@/lib/accessControl';
import { useAccessControlRevision } from '@/lib/useAccessControlRevision';
import { getHolidayDirectory, saveHolidayDirectory } from '@/data/holidays';
import { useHolidayDirectoryRevision } from '@/lib/useHolidayDirectoryRevision';
import { getIntegrationPreferences, saveIntegrationPreferences } from '@/data/integrations';
import { useIntegrationPreferencesRevision } from '@/lib/useIntegrationPreferencesRevision';
import { getNotificationPreferences, saveNotificationPreferences, type NotificationPreference } from '@/data/notificationPreferences';
import { useNotificationPreferencesRevision } from '@/lib/useNotificationPreferencesRevision';
import {
  appendBillingInvoice,
  getBillingInvoices,
  getBillingPreferences,
  saveBillingPreferences,
  type BillingInvoice,
  type BillingPlanTier,
} from '@/data/billing';
import { useBillingPreferencesRevision } from '@/lib/useBillingPreferencesRevision';
import { useBillingInvoicesRevision } from '@/lib/useBillingInvoicesRevision';
import { cn, formatDate, formatINR, formatWeekdayLong } from '@/lib/utils';
import type { BadgeTone } from '@/components/ui';
import { seedFirestore, purgeSeededFirestoreData } from '@/lib/seed';
import { backfillOrgIds } from '@/lib/orgBackfill';
import { backfillOrgSettings } from '@/lib/orgSettings';
import { backfillEmployeeLinks, backfillManagerChains } from '@/lib/accessBackfill';
import { useAuth } from '@/lib/auth';
import { setMockDataCleared } from '@/lib/mockDataFlag';
import { belongsToActiveOrg, getActiveOrgKey, orgScopedKey, DEFAULT_ORG_KEY } from '@/lib/orgScope';
import type { Holiday } from '@/types';
import { todayIso } from '@/lib/today';

const COMPANY_LOGO_STORAGE_KEY = 'modcon.hr.companyLogo';

// ===========================================================================
// Tiny reusable primitives (settings-local)
// ===========================================================================

/** Labeled text field */
function Field({
  label, value, onChange, type = 'text', hint, disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  disabled?: boolean;
}) {
  // Associated explicitly. The label was a bare <label> next to the input,
  // neither wrapping it nor carrying htmlFor, so the input had no accessible
  // name at all: a screen reader announced "edit text", and nothing could
  // address these fields by their label.
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'input w-full',
          disabled && 'bg-ink-50 cursor-not-allowed text-ink-400',
        )}
      />
      {hint && <p className="text-xs text-ink-400 mt-1">{hint}</p>}
    </div>
  );
}

/** Toggle switch */
function Toggle({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      {(label || description) && (
        <div>
          {label && <p className="text-sm font-medium text-ink-800">{label}</p>}
          {description && <p className="text-xs text-ink-400 mt-0.5">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
          checked ? 'bg-brand-600' : 'bg-ink-200',
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}

/** Section container */
function SettingsSection({ title, subtitle, action, children }: {
  title: string;
  subtitle?: string;
  /** Rendered opposite the title — where each section reports its save state. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
          {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

type SaveState = 'idle' | 'saving' | 'saved' | 'local-only';

/**
 * Report whether a configuration change has reached the organisation.
 *
 * Every setting on this page is written to localStorage synchronously and
 * published to Firestore afterwards, fire-and-forget (see lib/orgSettings). The
 * write cannot be made instant — but leaving it invisible is what let an
 * administrator delete a leave type, reload immediately, and watch it come
 * back, because the page was torn down with the publish still queued. So each
 * section says what it is doing: "Saving…" while the write is in flight, and a
 * standing warning when it was refused.
 *
 * A refusal is not "saved locally instead": Firestore rolls the rejected write
 * back, the rollback arrives as a snapshot, and startOrgSettingsSync hydrates
 * localStorage from the organisation's unchanged copy — so the edit is undone
 * on this machine too, seconds after it was made. The warning says the change
 * did not reach the organisation, which is the part that matters, and does not
 * promise a local copy that will not survive.
 */
function useSaveIndicator() {
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Hand it whatever the save function returned. */
  function track(published: Promise<boolean>) {
    setState('saving');
    window.clearTimeout(timer.current);
    void published.then((landed) => {
      setState(landed ? 'saved' : 'local-only');
      // Only the happy path fades; a refusal stands until the next save, so it
      // does not scroll past unnoticed.
      if (landed) timer.current = window.setTimeout(() => setState('idle'), 2_000);
    });
  }

  return { state, track };
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  if (state === 'saving') return <span className="text-sm text-ink-500 whitespace-nowrap">Saving…</span>;
  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1 text-sm text-emerald-600 whitespace-nowrap">
        <Check size={14} /> Saved
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-sm text-amber-700">
      <AlertCircle size={14} className="shrink-0" /> Not saved to your organisation
    </span>
  );
}

// ===========================================================================
// Section: Company Profile
// ===========================================================================
function CompanyProfile() {
  const save = useSaveIndicator();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const directoryRevision = useEmployeeDirectoryRevision();
  // Read from the company's own record rather than starting every organisation
  // on ModCon's name, address and registration numbers.
  const [form, setForm] = useState<CompanyProfileRecord>(() => getCompanyProfile());
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Every distinct title held **in the HR department**, plus any the company
  // has already nominated that nobody currently holds.
  //
  // The department filter is the point: this list used to be every title in the
  // company, so "Application Developer" was offered as a designation that
  // carries the HR function, and ticking it would have handed that engineer
  // every employee's salary. Nominating a title is a statement about the people
  // team, not about a string.
  //
  // Already-nominated titles stay listed even when nobody in HR holds them —
  // including ones nominated before this was fixed. Dropping them would
  // silently deselect them on the next save, and a title that should not be
  // there is one somebody has to be able to see in order to untick. It confers
  // nothing on its own now: `carriesHrFunction` also checks the department.
  const designationOptions = useMemo(() => {
    const inHrDepartment = employees
      .filter((employee) => isHrDepartment(employee.department))
      .map((employee) => employee.designation)
      .filter(Boolean);
    return Array.from(new Set([...inHrDepartment, ...form.hrDesignations])).sort((a, b) => a.localeCompare(b));
  }, [directoryRevision, form.hrDesignations]);

  /** Nominated, but held by nobody in the HR department — so it grants nothing. */
  function isInertDesignation(designation: string) {
    return !employees.some(
      (employee) =>
        isHrDepartment(employee.department) &&
        employee.designation.trim().toLowerCase() === designation.trim().toLowerCase(),
    );
  }

  function toggleHrDesignation(designation: string) {
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    setForm((current) => ({
      ...current,
      hrDesignations: current.hrDesignations.some((item) => same(item, designation))
        ? current.hrDesignations.filter((item) => !same(item, designation))
        : [...current.hrDesignations, designation],
    }));
    setDirty(true);
    setSaved(false);
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedLogo = window.localStorage.getItem(orgScopedKey(COMPANY_LOGO_STORAGE_KEY));
      if (storedLogo) setLogoDataUrl(storedLogo);
    } catch {
      // Ignore storage errors and fall back to the default logo.
    }
  }, []);

  const update = (k: keyof CompanyProfileRecord) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
    setSaved(false);
  };

  // Save used to flash "Saved!" and discard the edit — every field reverted on
  // the next page load. It now writes to the company's own org-scoped record.
  function handleSave() {
    save.track(saveCompanyProfile(form));
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function handleDiscard() {
    setForm(getCompanyProfile());
    setDirty(false);
    setSaved(false);
  }

  function handlePickLogo() {
    fileInputRef.current?.click();
  }

  function handleLogoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const nextLogo = typeof reader.result === 'string' ? reader.result : '';
      setLogoDataUrl(nextLogo);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(orgScopedKey(COMPANY_LOGO_STORAGE_KEY), nextLogo);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  function handleRemoveLogo() {
    setLogoDataUrl('');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(orgScopedKey(COMPANY_LOGO_STORAGE_KEY));
    }
  }

  return (
    <SettingsSection
      title="Company Profile"
      subtitle="Core organisational information shown across the platform."
      action={<SaveIndicator state={save.state} />}
    >
      <Card>
        {/* Logo block */}
        <div className="flex items-center gap-5 pb-6 mb-6 border-b border-ink-100">
          <div className="h-20 w-20 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-violet-600 flex items-center justify-center shrink-0 shadow-md">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt="Company logo" className="h-full w-full object-cover" />
            ) : (
              <span className="text-white text-2xl font-black tracking-tighter">MC</span>
            )}
          </div>
          <div>
            <p className="font-semibold text-ink-900 text-lg">{form.name || 'Unnamed company'}</p>
            <p className="text-sm text-ink-500 mt-0.5">
              {[form.industry, form.founded ? `Founded ${form.founded}` : ''].filter(Boolean).join(' · ')
                || 'Add your company details below'}
            </p>
            <div className="flex gap-2 mt-2">
              <Button variant="secondary" size="sm" icon={<Edit2 size={13} />} onClick={handlePickLogo}>
                Change Logo
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Trash2 size={13} />}
                onClick={handleRemoveLogo}
                disabled={!logoDataUrl}
                className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
              >
                Remove
              </Button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoSelected}
          />
        </div>

        {/* Form grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Company Name" value={form.name} onChange={update('name')} />
          <Field label="Legal Name" value={form.legalName} onChange={update('legalName')} />
          <Field label="Industry" value={form.industry} onChange={update('industry')} />
          <Field label="Founded Year" value={form.founded} onChange={update('founded')} />
          <Field label="Headquarters" value={form.hq} onChange={update('hq')} />
          <Field label="Website" value={form.website} onChange={update('website')} type="url" />
          <Field label="GSTIN" value={form.gstin} onChange={update('gstin')} />
          <Field label="CIN" value={form.cin} onChange={update('cin')} />
          {/* Counted from the directory, never typed — it was already read-only
              but is now derived at render rather than mirrored into form state. */}
          <Field label="Employee Count" value={String(employees.length)} onChange={() => {}} disabled />
          <Field label="Support Email" value={form.supportEmail} onChange={update('supportEmail')} type="email" />
          <Field label="Contact Phone" value={form.phone} onChange={update('phone')} />
        </div>

        {/* Chosen from the titles actually in use rather than typed: a
            mistyped designation would silently stop conferring access, and
            matching "HR" inside a title would confer it on unrelated roles. */}
        <div className="mt-6 pt-5 border-t border-ink-100">
          <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">
            HR Designations
          </label>
          <p className="text-xs text-ink-400 mb-3">
            Job titles in {HR_DEPARTMENT} that carry the HR function. Anyone in that department
            appointed to one of these administers this organisation and can see every
            employee&apos;s records, including top management. A title held outside{' '}
            {HR_DEPARTMENT} confers nothing.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-auto rounded-lg border border-ink-100 p-3">
            {designationOptions.map((designation) => {
              const checked = form.hrDesignations.some(
                (item) => item.trim().toLowerCase() === designation.trim().toLowerCase(),
              );
              return (
                <label key={designation} className="flex items-start gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    onChange={() => toggleHrDesignation(designation)}
                  />
                  <span>
                    {designation}
                    {isInertDesignation(designation) && (
                      <span className="block text-xs text-ink-400">Nobody in {HR_DEPARTMENT} holds this — it grants nothing</span>
                    )}
                  </span>
                </label>
              );
            })}
            {designationOptions.length === 0 ? (
              <p className="text-sm text-ink-400">
                Nobody is recorded in {HR_DEPARTMENT} yet, so there are no titles to nominate. Add
                someone to that department first — a title held anywhere else does not carry the HR
                function.
              </p>
            ) : null}
          </div>
          {form.hrDesignations.length === 0 ? (
            <p className="text-xs text-amber-700 mt-2">
              None selected — nobody will be granted HR administrator access automatically.
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-ink-100">
          <Button variant="primary" onClick={handleSave} icon={saved ? <CheckCircle2 size={15} /> : undefined}>
            {saved ? 'Saved!' : 'Save Changes'}
          </Button>
          <Button variant="ghost" onClick={handleDiscard} disabled={!dirty}>Discard</Button>
        </div>
      </Card>
    </SettingsSection>
  );
}

// ===========================================================================
// Section: Departments
// ===========================================================================
interface DeptRow {
  name: string;
  head: string;
  headcount: number;
  openRoles: number;
  openRolesOverride?: number;
}

/**
 * Picks a department head from the people actually on the books.
 *
 * This was a free-text box, so the head was whatever string someone typed — it
 * could name a person who had left, or nobody at all, and it never had to match
 * a directory record. Choosing from the directory means the head is always a
 * real, current employee, which is what lets lib/dataScope.ts resolve the HR
 * Manager from it.
 *
 * The department's own members are offered first because the head usually comes
 * from within, but anyone may be picked — a new department has no members yet.
 */
function DepartmentHeadSelect({
  value, onChange, department, hint,
}: {
  value: string;
  onChange: (v: string) => void;
  department?: string;
  hint?: string;
}) {
  const directoryRevision = useEmployeeDirectoryRevision();

  const { insiders, others } = useMemo(() => {
    // "Resigned" people are off the books; offering them as a head would be
    // re-creating the stale-name problem this select exists to remove.
    const candidates = employees
      .filter((employee) => employee.status !== 'Resigned')
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
    return {
      insiders: department ? candidates.filter((e) => e.department === department) : [],
      others: department ? candidates.filter((e) => e.department !== department) : candidates,
    };
  }, [department, directoryRevision]);

  const label = (employee: typeof employees[number]) => `${employee.fullName} · ${employee.designation}`;
  // A stored head who is no longer in the directory would otherwise vanish
  // silently from the select, making it look as though none was ever set.
  const isKnown = !value || [...insiders, ...others].some((e) => e.fullName === value);

  return (
    <div>
      <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">
        Department Head
      </label>
      <select className="input w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not set</option>
        {!isKnown ? <option value={value}>{value} (no longer in the directory)</option> : null}
        {insiders.length ? (
          <optgroup label={`In ${department}`}>
            {insiders.map((employee) => (
              <option key={employee.id} value={employee.fullName}>{label(employee)}</option>
            ))}
          </optgroup>
        ) : null}
        {others.length ? (
          <optgroup label={insiders.length ? 'Other departments' : 'All employees'}>
            {others.map((employee) => (
              <option key={employee.id} value={employee.fullName}>{label(employee)}</option>
            ))}
          </optgroup>
        ) : null}
      </select>
      {hint && <p className="text-xs text-ink-400 mt-1">{hint}</p>}
    </div>
  );
}

function DepartmentsSection() {
  const save = useSaveIndicator();
  const departmentRevision = useDepartmentDirectoryRevision();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingDeptOriginalName, setEditingDeptOriginalName] = useState('');
  const [editingDeptName, setEditingDeptName] = useState('');
  const [editingDeptHead, setEditingDeptHead] = useState('');
  const [editingDeptHeadcount, setEditingDeptHeadcount] = useState('0');
  const [editingDeptOpenRoles, setEditingDeptOpenRoles] = useState('0');
  const [editingDeptTracksOpenRoles, setEditingDeptTracksOpenRoles] = useState(true);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptHead, setNewDeptHead] = useState('');
  const [newDeptHeadcount, setNewDeptHeadcount] = useState('0');
  const [newDeptOpenRoles, setNewDeptOpenRoles] = useState('0');
  const [newDeptTracksOpenRoles, setNewDeptTracksOpenRoles] = useState(true);
  const [addError, setAddError] = useState('');
  const [editError, setEditError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState('');

  const deptRows: DeptRow[] = useMemo(() => getDepartmentDirectory(), [departmentRevision]);

  function resetAddForm() {
    setNewDeptName('');
    setNewDeptHead('');
    setNewDeptHeadcount('0');
    setNewDeptOpenRoles('0');
    setNewDeptTracksOpenRoles(true);
    setAddError('');
  }

  function resetEditForm() {
    setEditingDeptOriginalName('');
    setEditingDeptName('');
    setEditingDeptHead('');
    setEditingDeptHeadcount('0');
    setEditingDeptOpenRoles('0');
    setEditingDeptTracksOpenRoles(true);
    setEditError('');
  }

  function openEditDepartment(row: DeptRow) {
    setEditingDeptOriginalName(row.name);
    setEditingDeptName(row.name);
    setEditingDeptHead(row.head === '—' ? '' : row.head);
    setEditingDeptHeadcount(String(row.headcount));
    setEditingDeptOpenRoles(String(row.openRoles));
    setEditingDeptTracksOpenRoles(row.openRolesOverride === undefined);
    setEditError('');
    setEditOpen(true);
  }

  function handleAddDepartment() {
    const name = newDeptName.trim();
    const head = newDeptHead.trim();
    const headcountValue = Number(newDeptHeadcount);
    const openRolesValue = Number(newDeptOpenRoles);

    if (!name) {
      setAddError('Department name is required.');
      return;
    }
    if (deptRows.some((department) => department.name.toLowerCase() === name.toLowerCase())) {
      setAddError('A department with this name already exists.');
      return;
    }
    if (Number.isNaN(headcountValue) || headcountValue < 0) {
      setAddError('Headcount must be 0 or more.');
      return;
    }
    if (!newDeptTracksOpenRoles && (Number.isNaN(openRolesValue) || openRolesValue < 0)) {
      setAddError('Open roles must be 0 or more.');
      return;
    }

    save.track(addDepartmentToDirectory({
      name,
      head: head || '—',
      headcount: headcountValue,
      ...(newDeptTracksOpenRoles ? {} : { openRolesOverride: openRolesValue }),
    }));
    setAddOpen(false);
    resetAddForm();
  }

  function handleUpdateDepartment() {
    const name = editingDeptName.trim();
    const head = editingDeptHead.trim();
    const openRolesValue = Number(editingDeptOpenRoles);

    if (!name) {
      setEditError('Department name is required.');
      return;
    }
    const headcountValue = Number(editingDeptHeadcount);
    if (!editingDeptTracksOpenRoles && (Number.isNaN(openRolesValue) || openRolesValue < 0)) {
      setEditError('Open roles must be 0 or more.');
      return;
    }
    if (Number.isNaN(headcountValue) || headcountValue < 0) {
      setEditError('Headcount must be 0 or more.');
      return;
    }

    const renaming = name !== editingDeptOriginalName;
    if (renaming && deptRows.some((department) => department.name.toLowerCase() === name.toLowerCase())) {
      setEditError('A department with this name already exists.');
      return;
    }

    if (renaming) {
      // Moves the department's people across as part of the rename.
      renameDepartmentInDirectory(editingDeptOriginalName, name);
    }

    save.track(updateDepartmentInDirectory({
      name,
      head: head || '—',
      headcount: headcountValue,
      ...(editingDeptTracksOpenRoles ? {} : { openRolesOverride: openRolesValue }),
    }));
    setEditOpen(false);
    resetEditForm();
  }

  function handleDeleteDepartment(row: DeptRow) {
    // Removing a department that still has people would leave them pointing at
    // something that no longer exists, so require them to be moved first.
    if (row.headcount > 0) {
      setDeleteBlocked(
        `${row.name} still has ${row.headcount} employee${row.headcount === 1 ? '' : 's'}. `
        + 'Reassign them to another department before deleting it.',
      );
      return;
    }
    save.track(deleteDepartmentFromDirectory(row.name));
    setDeleteBlocked('');
  }

  const cols: Column<DeptRow>[] = [
    {
      key: 'name',
      header: 'Department',
      render: (r) => (
        <span className="font-medium text-ink-900">{r.name}</span>
      ),
    },
    {
      key: 'head',
      header: 'Department Head',
      render: (r) => (
        <span className="text-ink-600">{r.head}</span>
      ),
    },
    {
      key: 'headcount',
      header: 'Headcount',
      align: 'center',
      render: (r) => (
        <span className="font-semibold text-ink-800">{r.headcount}</span>
      ),
    },
    {
      key: 'openRoles',
      header: 'Open Roles',
      align: 'center',
      render: (r) => (
        <div className="flex items-center justify-center gap-1.5">
          {r.openRoles > 0
            ? <Badge tone="amber">{r.openRoles} open</Badge>
            : <span className="text-ink-400 text-xs">—</span>}
          {r.openRolesOverride !== undefined && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wide text-ink-400"
              title="Set manually — not tracking live job openings"
            >
              manual
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" icon={<Edit2 size={13} />} onClick={() => openEditDepartment(r)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={13} />}
            onClick={() => handleDeleteDepartment(r)}
            title={r.headcount > 0 ? 'Reassign this department\'s employees before deleting it' : 'Delete department'}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <SettingsSection
      title="Departments"
      subtitle="Manage organisational units, department heads, and open headcount."
      action={<SaveIndicator state={save.state} />}
    >
      <Card padding={false}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <p className="text-sm text-ink-500">{deptRows.length} departments configured</p>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add Department</Button>
        </div>
        {deleteBlocked && (
          <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">{deleteBlocked}</p>
          </div>
        )}
        <Table columns={cols} data={deptRows} keyExtractor={(r) => r.name} />
      </Card>

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          resetAddForm();
        }}
        title="Add Department"
        subtitle="Create a new organisational unit"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAddOpen(false);
                resetAddForm();
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddDepartment}>Save Department</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Department Name"
            value={newDeptName}
            onChange={(v) => {
              setNewDeptName(v);
              setAddError('');
            }}
          />
          <DepartmentHeadSelect
            value={newDeptHead}
            onChange={(v) => {
              setNewDeptHead(v);
              setAddError('');
            }}
            hint="Optional — pick from current employees."
          />
          <Field
            label="Headcount"
            type="number"
            value={newDeptHeadcount}
            onChange={(v) => {
              setNewDeptHeadcount(v);
              setAddError('');
            }}
          />
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide">Open Roles</label>
            <Select
              value={newDeptTracksOpenRoles ? 'track' : 'manual'}
              onChange={(value) => setNewDeptTracksOpenRoles(value === 'track')}
              options={[
                { label: 'Track live job openings', value: 'track' },
                { label: 'Set manually', value: 'manual' },
              ]}
            />
            {newDeptTracksOpenRoles ? (
              <p className="text-xs text-ink-400">
                Counts open job openings for this department, so it stays in step with Recruitment.
              </p>
            ) : (
              <Field
                label=""
                type="number"
                value={newDeptOpenRoles}
                onChange={(v) => {
                  setNewDeptOpenRoles(v);
                  setAddError('');
                }}
              />
            )}
          </div>
          {addError && <p className="text-sm text-rose-600">{addError}</p>}
        </div>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          resetEditForm();
        }}
        title="Edit Department"
        subtitle="Update the department head and open roles"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setEditOpen(false);
                resetEditForm();
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUpdateDepartment}>Save Changes</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Department Name"
            value={editingDeptName}
            onChange={setEditingDeptName}
            hint="Renaming moves everyone in this department to the new name."
          />
          <DepartmentHeadSelect
            value={editingDeptHead}
            department={editingDeptOriginalName}
            onChange={(v) => {
              setEditingDeptHead(v);
              setEditError('');
            }}
          />
          <Field
            label="Headcount"
            type="number"
            value={editingDeptHeadcount}
            onChange={(v) => {
              setEditingDeptHeadcount(v);
              setEditError('');
            }}
          />
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide">Open Roles</label>
            <Select
              value={editingDeptTracksOpenRoles ? 'track' : 'manual'}
              onChange={(value) => setEditingDeptTracksOpenRoles(value === 'track')}
              options={[
                { label: 'Track live job openings', value: 'track' },
                { label: 'Set manually', value: 'manual' },
              ]}
            />
            {editingDeptTracksOpenRoles ? (
              <p className="text-xs text-ink-400">
                Counts open job openings for this department, so it stays in step with Recruitment.
              </p>
            ) : (
              <Field
                label=""
                type="number"
                value={editingDeptOpenRoles}
                onChange={(v) => {
                  setEditingDeptOpenRoles(v);
                  setEditError('');
                }}
              />
            )}
          </div>
          {editError && <p className="text-sm text-rose-600">{editError}</p>}
        </div>
      </Modal>
    </SettingsSection>
  );
}

// ===========================================================================
// Section: Leave Policies
// ===========================================================================

function LeavePolicies() {
  const leavePoliciesRevision = useLeavePoliciesRevision();
  const [policies, setPolicies] = useState<LeavePolicy[]>(() => getLeavePolicies());
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState('');
  const [editingType, setEditingType] = useState('');
  const [editingAnnual, setEditingAnnual] = useState('12');
  const [editingAccrual, setEditingAccrual] = useState<LeaveAccrual>('monthly');
  const [editingMonthlyAccrual, setEditingMonthlyAccrual] = useState('1');
  const [editingMinTenure, setEditingMinTenure] = useState('0');
  const [editingApplicable, setEditingApplicable] = useState('All employees');
  const [editingCarryForward, setEditingCarryForward] = useState(false);
  const [editingEncashment, setEditingEncashment] = useState(false);
  const [editingHalfDay, setEditingHalfDay] = useState(true);
  const [newType, setNewType] = useState('');
  const [newAnnual, setNewAnnual] = useState('12');
  const [newApplicable, setNewApplicable] = useState('All employees');
  const [newCarryForward, setNewCarryForward] = useState(false);
  const [newAccrual, setNewAccrual] = useState<LeaveAccrual>('monthly');
  const [newMonthlyAccrual, setNewMonthlyAccrual] = useState(1);
  const [newMinTenureMonths, setNewMinTenureMonths] = useState(0);
  const [newEncashment, setNewEncashment] = useState(false);
  const [newHalfDay, setNewHalfDay] = useState(true);
  const [addError, setAddError] = useState('');
  const [editError, setEditError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState('');
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [upload, setUpload] = useState<LeavePolicyCsvUpload | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadApplied, setUploadApplied] = useState<number | null>(null);
  const save = useSaveIndicator();

  useEffect(() => {
    setPolicies(getLeavePolicies());
  }, [leavePoliciesRevision]);

  function persist(updated: LeavePolicy[]) {
    setPolicies(updated);
    save.track(saveLeavePolicies(updated));
  }

  function resetAddForm() {
    setNewType('');
    setNewAnnual('12');
    setNewApplicable('All employees');
    setNewCarryForward(false);
    setNewEncashment(false);
    setNewHalfDay(true);
    setAddError('');
  }

  function resetEditForm() {
    setEditingPolicyId('');
    setEditingType('');
    setEditingAnnual('12');
    setEditingAccrual('monthly');
    setEditingMonthlyAccrual('1');
    setEditingMinTenure('0');
    setEditingApplicable('All employees');
    setEditingCarryForward(false);
    setEditingEncashment(false);
    setEditingHalfDay(true);
    setEditError('');
  }

  function openEditPolicy(policy: LeavePolicy) {
    setEditingPolicyId(policy.id);
    setEditingType(policy.type);
    setEditingAnnual(String(policy.annual));
    setEditingAccrual(policy.accrual);
    setEditingMonthlyAccrual(String(policy.monthlyAccrual));
    setEditingMinTenure(String(policy.minTenureMonths));
    setEditingApplicable(policy.applicable);
    setEditingCarryForward(policy.carryForward);
    setEditingEncashment(policy.encashment);
    setEditingHalfDay(policy.halfDay);
    setEditError('');
    setEditOpen(true);
  }

  function handleAddLeaveType() {
    const leaveType = newType.trim();
    const annualQuota = Number(newAnnual);

    if (!leaveType) {
      setAddError('Leave type name is required.');
      return;
    }
    if (policies.some((p) => p.type.toLowerCase() === leaveType.toLowerCase())) {
      setAddError('This leave type already exists.');
      return;
    }
    if (!Number.isFinite(annualQuota) || annualQuota < 0) {
      setAddError('Annual quota must be 0 or more.');
      return;
    }

    const next: LeavePolicy = {
      id: `lp${Date.now()}`,
      type: leaveType,
      annual: newAccrual === 'monthly' ? newMonthlyAccrual * 12 : annualQuota,
      accrual: newAccrual,
      monthlyAccrual: newAccrual === 'monthly' ? newMonthlyAccrual : 0,
      carryForward: newCarryForward,
      // Monthly accrual carries within the year by construction; surviving the
      // year-end is the separate switch, and defaults off to match the policy.
      carryForwardBeyondYear: newAccrual === 'monthly' ? false : newCarryForward,
      encashment: newEncashment,
      halfDay: newHalfDay,
      minTenureMonths: newMinTenureMonths,
      applicable: newApplicable.trim() || 'All employees',
    };
    const updated = [...policies, next];
    persist(updated);
    setAddOpen(false);
    resetAddForm();
  }

  function handleUpdateLeaveType() {
    const leaveType = editingType.trim();
    const annualQuota = Number(editingAnnual);

    if (!leaveType) {
      setEditError('Leave type name is required.');
      return;
    }
    if (!Number.isFinite(annualQuota) || annualQuota < 0) {
      setEditError('Annual quota must be 0 or more.');
      return;
    }

    const updated = policies.map((policy) => (
      policy.id === editingPolicyId
        ? {
            ...policy,
            type: leaveType,
            // A monthly policy's yearly figure is always derived, never typed —
            // see normalizePolicy in data/leavePolicies.ts.
            annual: editingAccrual === 'monthly'
              ? Number(editingMonthlyAccrual) * 12
              : annualQuota,
            accrual: editingAccrual,
            monthlyAccrual: editingAccrual === 'monthly' ? Number(editingMonthlyAccrual) : 0,
            minTenureMonths: Math.max(0, Number(editingMinTenure) || 0),
            applicable: editingApplicable.trim() || 'All employees',
            carryForward: editingCarryForward,
            encashment: editingEncashment,
            halfDay: editingHalfDay,
          }
        : policy
    ));
    persist(updated);
    setEditOpen(false);
    resetEditForm();
  }

  const toggle = (id: string, key: 'carryForward' | 'encashment' | 'halfDay') => {
    const updated = policies.map((policy) => (policy.id === id ? { ...policy, [key]: !policy[key] } : policy));
    persist(updated);
  };

  /**
   * Remove a leave type from the organisation's policy.
   *
   * There was no way to do this at all: a type added by mistake — or by a test
   * run, since the E2E suite writes to the same shared document — stayed in the
   * organisation's configuration for good, offered in Apply Leave to everyone.
   *
   * A type people have actually taken leave under is a different matter. Those
   * requests carry the type by name, and entitlement is derived by walking the
   * policies, so deleting it would leave approved leave with no policy to be
   * measured against — the days would vanish from every balance while the
   * request rows kept claiming them. So that case is refused rather than
   * cascaded, the same way a department with people in it is.
   */
  function handleDeletePolicy(policy: LeavePolicy) {
    const type = normalizeLeaveTypeValue(policy.type);
    const recorded = getLeaveRequests().filter((request) => request.type === type).length;
    if (recorded > 0) {
      setDeleteBlocked(
        `${policy.type} has ${recorded} leave request${recorded === 1 ? '' : 's'} recorded against it. `
        + 'Those would be left with no policy to measure them against, so this type cannot be deleted.',
      );
      return;
    }
    const updated = policies.filter((p) => p.id !== policy.id);
    persist(updated);
    setDeleteBlocked('');
  }

  /**
   * Remove the types this organisation never chose.
   *
   * A type leave has already been taken under is kept even here — the requests
   * carry it by name and would be left with no policy to be measured against,
   * which is the same reason a single delete is refused. Those are named rather
   * than passed over: a partial clearance that looks total is how somebody
   * concludes the inherited quota is gone when it is still accruing.
   */
  function handleClearInherited() {
    const recorded = new Set(getLeaveRequests().map((request) => request.type));
    const inherited = new Set(inheritedDemoPolicies(policies).map((policy) => policy.id));
    const kept = policies.filter(
      (policy) => !inherited.has(policy.id) || recorded.has(normalizeLeaveTypeValue(policy.type)),
    );
    const blocked = policies.filter(
      (policy) => inherited.has(policy.id) && recorded.has(normalizeLeaveTypeValue(policy.type)),
    );
    persist(kept);
    setDeleteBlocked(
      blocked.length === 0
        ? ''
        : `${blocked.map((policy) => policy.type).join(', ')} ${blocked.length === 1 ? 'was' : 'were'} kept: `
          + 'leave has already been taken under them, and removing them would leave those requests '
          + 'with no policy to be measured against. Edit the figures instead.',
    );
  }

  function resetUpload() {
    setUpload(null);
    setUploadName('');
    setUploadError('');
    if (uploadInput.current) uploadInput.current.value = '';
  }

  /**
   * Read a policy file. The file is the organisation's whole policy, so a type
   * it omits is being withdrawn — except the ones leave has actually been taken
   * under, which the parser retains for the same reason `handleDeletePolicy`
   * refuses to remove them.
   */
  async function handlePolicyFile(file: File | undefined) {
    setUploadApplied(null);
    setUploadError('');
    if (!file) { resetUpload(); return; }
    try {
      const text = await file.text();
      setUploadName(file.name);
      const recorded = new Set(getLeaveRequests().map((request) => request.type));
      setUpload(parseLeavePolicyCsv(text, getLeavePolicies(), [...recorded]));
    } catch {
      resetUpload();
      setUploadError('That file could not be read. Save it as CSV and try again.');
    }
  }

  function handleApplyUpload() {
    if (!upload || upload.rows.length === 0) return;
    setUploadApplied(upload.rows.length);
    // The one save path the table's own edits take, so every balance, accrual
    // and payroll deduction in the organisation follows the file immediately.
    persist(upload.policies);
    resetUpload();
  }

  function handlePolicyTemplate() {
    // The organisation's current policy, written out — so the file HR edits
    // starts from what is in force rather than from an invented example.
    const rows = policies.map((policy) => [
      policy.type,
      policy.accrual,
      isMonthlyPolicy(policy) ? policy.monthlyAccrual : policy.annual,
      policy.minTenureMonths,
      policy.carryForward ? 'yes' : 'no',
      policy.encashment ? 'yes' : 'no',
      policy.halfDay ? 'yes' : 'no',
      policy.applicable,
    ].join(','));
    const blob = new Blob([[LEAVE_POLICY_CSV_HEADER, ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'leave-policy.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  // Types still carrying the demo policy's identity. Empty for the demo
  // organisation, whose list is its own, and for anyone who never inherited one.
  const inherited = useMemo(() => inheritedDemoPolicies(policies), [policies]);

  const cols: Column<LeavePolicy>[] = [
    {
      key: 'type',
      header: 'Leave Type',
      render: (r) => <span className="font-medium text-ink-900">{r.type}</span>,
    },
    {
      key: 'annual',
      header: 'Entitlement',
      // Monthly policies deliberately never show an annual figure — the
      // organisation grants Casual and Sick a month at a time, and displaying
      // "12 days a year" invites someone to take twelve in April.
      render: (r: LeavePolicy) => (
        <span className="text-ink-700">
          {isMonthlyPolicy(r)
            ? `${r.monthlyAccrual} day${r.monthlyAccrual === 1 ? '' : 's'}/month`
            : r.annual === 0 ? 'Unlimited' : `${r.annual} days/year`}
        </span>
      ),
    },
    {
      key: 'applicable',
      header: 'Applicable To',
      render: (r) => <span className="text-ink-500 text-xs">{r.applicable}</span>,
    },
    {
      key: 'carryForward',
      header: 'Carry Forward',
      align: 'center',
      render: (r) => (
        <button onClick={() => toggle(r.id, 'carryForward')} className="flex justify-center w-full">
          {r.carryForward
            ? <ToggleRight size={22} className="text-brand-600" />
            : <ToggleLeft size={22} className="text-ink-300" />}
        </button>
      ),
    },
    {
      key: 'encashment',
      header: 'Encashment',
      align: 'center',
      render: (r) => (
        <button onClick={() => toggle(r.id, 'encashment')} className="flex justify-center w-full">
          {r.encashment
            ? <ToggleRight size={22} className="text-brand-600" />
            : <ToggleLeft size={22} className="text-ink-300" />}
        </button>
      ),
    },
    {
      key: 'halfDay',
      header: 'Half-Day',
      align: 'center',
      render: (r) => (
        <button onClick={() => toggle(r.id, 'halfDay')} className="flex justify-center w-full">
          {r.halfDay
            ? <ToggleRight size={22} className="text-brand-600" />
            : <ToggleLeft size={22} className="text-ink-300" />}
        </button>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" icon={<Edit2 size={13} />} onClick={() => openEditPolicy(r)}>Edit</Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={13} />}
            onClick={() => handleDeletePolicy(r)}
            title={`Delete ${r.type}`}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <SettingsSection
      title="Leave Policies"
      subtitle="Configure leave types, quotas, and carry-forward rules."
      action={<SaveIndicator state={save.state} />}
    >
      <Card padding={false}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <p className="text-sm text-ink-500">Click toggles to update policies</p>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add Leave Type</Button>
        </div>
        {deleteBlocked && (
          <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">{deleteBlocked}</p>
          </div>
        )}
        {/* Types saved here before the demo policy stopped being offered to
            other organisations. Gating the read cannot un-write them, and a
            saved policy is indistinguishable from a chosen one downstream — so
            the only honest thing is to say which ones nobody here chose and let
            an administrator decide. Never removed automatically: by now this
            organisation may well have edited them into its own. */}
        {inherited.length > 0 && (
          <div
            className="mx-4 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"
            data-testid="leave-policies-inherited"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="min-w-0">
                <p className="text-sm text-amber-800">
                  <strong>{inherited.length}</strong> of these leave{' '}
                  {inherited.length === 1 ? 'type' : 'types'} —{' '}
                  {inherited.map((policy) => policy.type).join(', ')} — came from ModCon HR's demo
                  organisation rather than from anyone here. Earlier versions offered them to every
                  organisation, and saving any change to this page kept them.
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  Keep them if they match what you actually grant — editing one makes it yours.
                  Otherwise remove them and set your own policy; nobody's balance survives a type
                  that is withdrawn.
                </p>
                <div className="mt-2">
                  <Button variant="secondary" size="sm" onClick={handleClearInherited}>
                    Remove {inherited.length} inherited {inherited.length === 1 ? 'type' : 'types'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* An organisation that has set nothing, said plainly. An empty table
            reads as a page that failed to load; this is a state, and it is the
            one every organisation starts in. */}
        {policies.length === 0 && (
          <div
            className="mx-4 mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
            data-testid="leave-policies-unset"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            Your organisation has not set a leave policy. Until it does, nobody accrues leave and
            no type can be applied for — add one above, or upload the whole policy below.
          </div>
        )}
        <Table columns={cols} data={policies} keyExtractor={(r) => r.id} />
      </Card>

      {/* Upload the whole policy at once. The table above edits one type at a
          time, which is the wrong shape for the case this exists for: a company
          arriving with its leave policy already written down, or revising all of
          it at once. Nothing is written until HR has seen what each row does. */}
      <Card className="mt-6">
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Upload the organisation's policy</h3>
            <p className="mt-1 text-sm text-ink-500">
              One row per leave type. This replaces the list above, so a type the file leaves out is
              withdrawn — except any that leave has already been taken under, which are kept and
              listed. Everyone in the organisation accrues on what you save here, apart from the
              individual exceptions below.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5" htmlFor="leave-policy-upload">
                Leave policy CSV
              </label>
              <input
                id="leave-policy-upload"
                ref={uploadInput}
                type="file"
                accept=".csv,text/csv"
                className="input w-full"
                aria-label="Organisation leave policy CSV"
                onChange={(event) => { void handlePolicyFile(event.target.files?.[0]); }}
              />
              <p className="mt-1 text-xs text-ink-400">
                Columns: <span className="font-mono">{LEAVE_POLICY_CSV_HEADER}</span>
              </p>
            </div>
            <div className="flex items-end">
              <Button variant="secondary" onClick={handlePolicyTemplate}>
                <Download size={14} /> Download current policy
              </Button>
            </div>
          </div>

          {uploadError && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {uploadError}
            </div>
          )}

          {uploadApplied !== null && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
              {uploadApplied} leave type{uploadApplied === 1 ? '' : 's'} saved as your organisation's
              policy.
            </div>
          )}

          {upload && (
            <div className="space-y-3">
              <div className="rounded-xl border border-ink-100" data-testid="leave-policy-upload-rows">
                <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2 text-xs font-semibold text-ink-600">
                  <span>From {uploadName}</span>
                  <span data-testid="leave-policy-upload-count">{upload.rows.length}</span>
                </div>
                {upload.rows.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-ink-400">
                    No row in this file states a leave type this app can apply.
                  </p>
                ) : (
                  <ul className="divide-y divide-ink-50">
                    {upload.rows.map((row) => (
                      <li
                        key={row.policy.id}
                        className="flex items-center gap-3 px-4 py-2.5"
                        data-testid="leave-policy-upload-row"
                        data-leave-type={row.policy.type}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">{row.policy.type}</p>
                          <p className="truncate text-xs text-ink-400">
                            {isMonthlyPolicy(row.policy)
                              ? `${row.policy.monthlyAccrual} day${row.policy.monthlyAccrual === 1 ? '' : 's'}/month`
                              : `${row.policy.annual} day${row.policy.annual === 1 ? '' : 's'}/year`}
                            {' · '}
                            {row.policy.minTenureMonths === 0
                              ? 'from day one'
                              : `after ${row.policy.minTenureMonths} months of service`}
                            {' · '}{row.policy.applicable}
                          </p>
                        </div>
                        <span className="ml-auto shrink-0 text-xs">
                          {row.replaces ? (
                            <span className="inline-flex items-center gap-1 text-amber-700">
                              <RefreshCw size={12} /> updates existing
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 size={12} /> new
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* A type the file omits but that cannot be withdrawn. Said out
                  loud: silence here would look like the file had removed it. */}
              {upload.retained.length > 0 && (
                <div className="rounded-xl border border-ink-200 bg-ink-50/50">
                  <div className="flex items-center gap-2 border-b border-ink-200 px-4 py-2 text-xs font-semibold text-ink-600">
                    <AlertCircle size={13} />
                    Kept — not in this file
                    <span className="ml-auto" data-testid="leave-policy-upload-retained-count">
                      {upload.retained.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-ink-100">
                    {upload.retained.map((entry) => (
                      <li key={entry.policy.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                        <span className="font-medium text-ink-800">{entry.policy.type}</span>
                        <span className="ml-auto text-xs text-ink-500">{entry.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Listed, never dropped: a row silently ignored looks exactly
                  like a row applied, and the type it named keeps its old quota. */}
              {upload.unmatched.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50">
                  <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-2 text-xs font-semibold text-amber-800">
                    <AlertTriangle size={13} />
                    Not applied
                    <span className="ml-auto" data-testid="leave-policy-upload-unmatched-count">
                      {upload.unmatched.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-amber-100">
                    {upload.unmatched.map((miss) => (
                      <li key={miss.line} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                        <span className="shrink-0 text-xs text-amber-700">Line {miss.line}</span>
                        <span className="truncate font-mono text-xs text-ink-800">{miss.text}</span>
                        <span className="ml-auto shrink-0 text-xs text-amber-800">{miss.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button variant="primary" onClick={handleApplyUpload} disabled={upload.rows.length === 0}>
                  <Upload size={14} /> Save {upload.rows.length} leave type
                  {upload.rows.length === 1 ? '' : 's'}
                </Button>
                <Button variant="secondary" onClick={resetUpload}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          resetAddForm();
        }}
        title="Add Leave Type"
        subtitle="Create a leave policy with quota and applicability"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAddOpen(false);
                resetAddForm();
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddLeaveType}>Save Leave Type</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Leave Type"
            value={newType}
            onChange={(v) => {
              setNewType(v);
              setAddError('');
            }}
          />
          <Field
            label="Annual Quota"
            type="number"
            value={newAnnual}
            onChange={(v) => {
              setNewAnnual(v);
              setAddError('');
            }}
            hint="Use 0 for unlimited"
            disabled={newAccrual === 'monthly'}
          />
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Accrual</label>
            <Select
              ariaLabel="Accrual"
              value={newAccrual}
              onChange={(v) => setNewAccrual(v as LeaveAccrual)}
              options={[
                { label: 'Monthly — accrues each month, resets 1 April', value: 'monthly' },
                { label: 'Annual — granted in full each year', value: 'annual' },
              ]}
            />
          </div>
          {newAccrual === 'monthly' && (
            <Field
              label="Days per month"
              type="number"
              value={String(newMonthlyAccrual)}
              onChange={(v) => setNewMonthlyAccrual(Math.max(0, Number(v) || 0))}
              hint="Unused days carry into the next month, within the financial year"
            />
          )}
          <Field
            label="Minimum service (months)"
            type="number"
            value={String(newMinTenureMonths)}
            onChange={(v) => setNewMinTenureMonths(Math.max(0, Number(v) || 0))}
            hint="0 applies from day one; 12 means after a year of service"
          />
          <Field
            label="Applicable To"
            value={newApplicable}
            onChange={(v) => {
              setNewApplicable(v);
              setAddError('');
            }}
          />

          <div className="rounded-xl border border-ink-100 px-3 py-1">
            <Toggle checked={newCarryForward} onChange={setNewCarryForward} label="Allow Carry Forward" />
            <Toggle checked={newEncashment} onChange={setNewEncashment} label="Allow Encashment" />
            <Toggle checked={newHalfDay} onChange={setNewHalfDay} label="Allow Half-Day" />
          </div>

          {addError && <p className="text-sm text-rose-600">{addError}</p>}
        </div>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          resetEditForm();
        }}
        title="Edit Leave Type"
        subtitle="Update the leave quota and rules"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setEditOpen(false);
                resetEditForm();
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUpdateLeaveType}>Save Changes</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Leave Type"
            value={editingType}
            onChange={(v) => {
              setEditingType(v);
              setEditError('');
            }}
          />
          <Field
            label="Annual Quota"
            type="number"
            disabled={editingAccrual === 'monthly'}
            value={editingAnnual}
            onChange={(v) => {
              setEditingAnnual(v);
              setEditError('');
            }}
            hint="Use 0 for unlimited"
          />
          <Field
            label="Applicable To"
            value={editingApplicable}
            onChange={(v) => {
              setEditingApplicable(v);
              setEditError('');
            }}
          />

          <div className="rounded-xl border border-ink-100 px-3 py-1">
            <Toggle checked={editingCarryForward} onChange={setEditingCarryForward} label="Allow Carry Forward" />
            <Toggle checked={editingEncashment} onChange={setEditingEncashment} label="Allow Encashment" />
            <Toggle checked={editingHalfDay} onChange={setEditingHalfDay} label="Allow Half-Day" />
          </div>

          {editError && <p className="text-sm text-rose-600">{editError}</p>}
        </div>
      </Modal>
    </SettingsSection>
  );
}

// ===========================================================================
// Section: Per-employee leave policies
// ===========================================================================
/**
 * Upload the people whose entitlement is not the organisation's own.
 *
 * A CSV rather than a form per person: the reason to have this at all is a list
 * of exceptions that arrived from an offer letter or a settlement — twenty
 * people on a negotiated Earned Leave, a cohort of interns on half the casual
 * quota — and typing them back in one at a time is how they end up wrong.
 * Nothing is written until HR has seen which row went to whom, what it replaces,
 * and which rows could not be used.
 *
 * The heading deliberately avoids the words "leave policies": Playwright matches
 * an accessible name by substring, and a second heading containing that phrase
 * makes the section above it ambiguous to every spec that opens it.
 */
function EmployeeLeavePoliciesSection() {
  const save = useSaveIndicator();
  // Both the exceptions and the organisation's list are behind this event, so an
  // incoming hydration from Firestore re-renders what is shown here.
  const revision = useLeavePoliciesRevision();
  const directoryRevision = useEmployeeDirectoryRevision();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<LeavePolicyCsvResult | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const [readError, setReadError] = useState('');

  const overrides = useMemo(() => getEmployeeLeavePolicies(), [revision]);
  const policies = useMemo(() => getLeavePolicies(), [revision]);
  const directory = useMemo(() => getEmployeeDirectory(), [directoryRevision]);
  const byId = useMemo(() => new Map(directory.map((emp) => [emp.id, emp])), [directory]);

  function reset() {
    setResult(null);
    setFileName('');
    setReadError('');
    if (fileInput.current) fileInput.current.value = '';
  }

  async function handleFile(file: File | undefined) {
    setApplied(null);
    setReadError('');
    if (!file) { reset(); return; }
    try {
      const text = await file.text();
      setFileName(file.name);
      setResult(parseEmployeeLeavePolicyCsv(
        text,
        getEmployeeDirectory(),
        getLeavePolicies(),
        getEmployeeLeavePolicies(),
      ));
    } catch {
      reset();
      setReadError('That file could not be read. Save it as CSV and try again.');
    }
  }

  function handleApply() {
    if (!result || result.matched.length === 0) return;
    // Merged at both levels, not replaced: a file covering three people is a
    // statement about those three, and a row about their Earned Leave says
    // nothing about the Casual Leave exception they already have.
    const next = { ...getEmployeeLeavePolicies() };
    for (const match of result.matched) {
      next[match.employee.id] = { ...next[match.employee.id], [match.typeKey]: match.override };
    }
    setApplied(result.matched.length);
    save.track(saveEmployeeLeavePolicies(next));
    reset();
  }

  function handleRemove(employeeId: string) {
    setApplied(null);
    // Back onto the organisation's policy, not onto nothing.
    save.track(setEmployeeLeavePolicy(employeeId, null));
  }

  function handleTemplate() {
    // Prefilled from the organisation's own policy for each type, so the figure
    // in the file is the one being departed from rather than an invented one.
    // Only the column that type actually accrues by is filled: an annual figure
    // against a monthly policy is a row the parser refuses, and a template must
    // not hand out rows that cannot be applied.
    const code = directory[0]?.employeeCode ?? 'MC-001';
    const rows = policies.slice(0, 3).map((policy) => (
      isMonthlyPolicy(policy)
        ? `${code},${policy.type},,${policy.monthlyAccrual},${policy.minTenureMonths}`
        : `${code},${policy.type},${policy.annual},,${policy.minTenureMonths}`
    ));
    const blob = new Blob([[EMPLOYEE_LEAVE_POLICY_CSV_HEADER, ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'employee-leave-policies.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  const entries = Object.entries(overrides);

  return (
    <SettingsSection
      title="Custom entitlements for individual employees"
      subtitle="Anyone whose leave quota is not the organisation's own"
      action={<SaveIndicator state={save.state} />}
    >
      <Card>
        <div className="space-y-5">
          <p className="text-sm text-ink-500">
            Upload a CSV of exceptions. Each row is one person and one leave type, matched by
            employee code; everyone not listed keeps accruing on the policy above. A blank cell
            leaves the organisation's figure alone, so a row can change the quota without touching
            the tenure gate. Nothing is saved until you have seen the match list.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5" htmlFor="leave-policy-csv">
                Entitlements CSV
              </label>
              <input
                id="leave-policy-csv"
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="input w-full"
                aria-label="Employee leave entitlements CSV"
                onChange={(event) => { void handleFile(event.target.files?.[0]); }}
              />
              <p className="mt-1 text-xs text-ink-400">
                Columns: <span className="font-mono">{EMPLOYEE_LEAVE_POLICY_CSV_HEADER}</span>
              </p>
            </div>
            <div className="flex items-end">
              <Button variant="secondary" onClick={handleTemplate}>
                <Download size={14} /> Download template
              </Button>
            </div>
          </div>

          {readError && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {readError}
            </div>
          )}

          {applied !== null && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
              {applied} custom entitlement{applied === 1 ? '' : 's'} saved for your organisation.
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="rounded-xl border border-ink-100" data-testid="leave-policy-csv-matched">
                <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2 text-xs font-semibold text-ink-600">
                  <span>From {fileName} — matched to an employee</span>
                  <span data-testid="leave-policy-csv-matched-count">{result.matched.length}</span>
                </div>
                {result.matched.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-ink-400">
                    No row in this file names both an employee code this organisation uses and a
                    leave type it grants.
                  </p>
                ) : (
                  <ul className="divide-y divide-ink-50">
                    {result.matched.map((match) => (
                      <li
                        key={`${match.employee.id}-${match.typeKey}`}
                        className="flex items-center gap-3 px-4 py-2.5"
                        data-testid="leave-policy-csv-match"
                        data-employee-code={match.employee.employeeCode}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">
                            {match.employee.fullName}
                          </p>
                          <p className="truncate text-xs text-ink-400">
                            {match.employee.employeeCode} ·{' '}
                            {describeLeavePolicyOverride(match.policyType, match.override)}
                          </p>
                        </div>
                        <span className="ml-auto shrink-0 text-xs">
                          {match.replaces ? (
                            <span className="inline-flex items-center gap-1 text-amber-700">
                              <RefreshCw size={12} /> replaces existing
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 size={12} /> new
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Listed, never dropped: a row silently ignored looks exactly like
                  a row applied, and the person it named keeps the org's quota. */}
              {result.unmatched.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50">
                  <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-2 text-xs font-semibold text-amber-800">
                    <AlertTriangle size={13} />
                    Not applied
                    <span className="ml-auto" data-testid="leave-policy-csv-unmatched-count">
                      {result.unmatched.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-amber-100">
                    {result.unmatched.map((miss) => (
                      <li key={miss.line} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                        <span className="shrink-0 text-xs text-amber-700">Line {miss.line}</span>
                        <span className="truncate font-mono text-xs text-ink-800">{miss.text}</span>
                        <span className="ml-auto shrink-0 text-xs text-amber-800">{miss.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button variant="primary" onClick={handleApply} disabled={result.matched.length === 0}>
                  <Upload size={14} /> Save {result.matched.length} entitlement
                  {result.matched.length === 1 ? '' : 's'}
                </Button>
                <Button variant="secondary" onClick={reset}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-ink-100" data-testid="leave-policy-overrides">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2 text-xs font-semibold text-ink-600">
              <span>Employees on their own entitlement</span>
              <span data-testid="leave-policy-override-count">{entries.length}</span>
            </div>
            {entries.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-400">
                Nobody yet — everyone accrues on the organisation's policy.
              </p>
            ) : (
              <ul className="divide-y divide-ink-50">
                {entries.map(([employeeId, byType]) => {
                  const employee = byId.get(employeeId);
                  const name = employee ? employee.fullName : employeeId;
                  return (
                    <li
                      key={employeeId}
                      className="flex items-start gap-3 px-4 py-2.5"
                      data-testid="leave-policy-override"
                      data-employee-id={employeeId}
                    >
                      <div className="min-w-0">
                        {/* An id rather than a name when the record has been
                            deleted: the exception is still stored and still
                            removable, and hiding it would strand it. */}
                        <p className="truncate text-sm font-medium text-ink-900">{name}</p>
                        <p className="text-xs text-ink-400">
                          {employee ? `${employee.employeeCode} · ` : 'No employee record · '}
                          {Object.entries(byType)
                            .map(([type, override]) => describeLeavePolicyOverride(type, override))
                            .join(' · ')}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="ml-auto shrink-0 rounded-lg p-1.5 text-ink-400 hover:bg-ink-50 hover:text-rose-600"
                        aria-label={`Remove custom entitlement for ${name}`}
                        onClick={() => handleRemove(employeeId)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Card>
    </SettingsSection>
  );
}

// ===========================================================================
// Section: Roles & Permissions
// ===========================================================================
const permColor: Record<PermissionLevel, string> = {
  full: 'text-emerald-600',
  view: 'text-amber-500',
  none: 'text-ink-300',
};

const permCycle: Record<PermissionLevel, PermissionLevel> = {
  full: 'view',
  view: 'none',
  none: 'full',
};

function RolesPermissions() {
  const save = useSaveIndicator();
  const permissionsRevision = useAccessControlRevision();
  const [perms, setPerms] = useState<PermissionMatrix>(() => getPermissionMatrix());

  useEffect(() => {
    setPerms(getPermissionMatrix());
  }, [permissionsRevision]);

  const cycle = (mod: AppModule, role: AppRole) => {
    const updated: PermissionMatrix = {
      ...perms,
      [mod]: {
        ...perms[mod],
        [role]: permCycle[perms[mod][role]],
      },
    };
    save.track(savePermissionMatrix(updated));
    setPerms(updated);
  };

  const resetToDefaults = () => {
    save.track(savePermissionMatrix(defaultPermissions));
    setPerms(defaultPermissions);
  };

  const cycleHint = 'Define what each role can access. Click any cell to cycle: Full -> View -> None.';

  return (
    <SettingsSection
      title="Roles & Permissions"
      subtitle={cycleHint}
      action={<SaveIndicator state={save.state} />}
    >
      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        {/* Was an amber warning that HR Manager and Manager "are not yet
            enforced for any signed-in user", alongside per-role user counts
            guessed from job titles — 'CEO' or 'Head of Finance' in a
            designation was counted as an Admin. All four roles are assignable
            now, so the warning is gone and so is the guess: an accurate count
            lives on the Admin dashboard, which reads the actual assignments. */}
        <p>
          All four roles can be assigned to a real account from the{' '}
          <strong>Admin dashboard</strong>. An <strong>HR Manager</strong> administers their own
          organisation and cannot grant the Admin role.
        </p>
      </div>
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200">
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wide w-52">Module</th>
                {APP_ROLES.map((role) => (
                  <th key={role} className="px-4 py-3 text-center text-xs font-semibold text-ink-500 uppercase tracking-wide">
                    <span>{role}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {APP_MODULES.map((module) => (
                <tr key={module} className="hover:bg-ink-50">
                  <td className="px-5 py-3 font-medium text-ink-800">{module}</td>
                  {APP_ROLES.map((role) => {
                    // Two kinds of cell cannot be configured, and they read
                    // differently. An excluded pair is not a permission anyone
                    // can grant (MODULE_ROLE_EXCLUSIONS) and shows as "n/a". A
                    // pinned pair has a real level the app fixes
                    // (PINNED_PERMISSIONS) and shows that level.
                    //
                    // Both are locked because both are overridden on read:
                    // cycling them would appear to work and then silently
                    // revert, which is what the pinned cells used to do.
                    const excluded = isModuleExcluded(module, role);
                    const pinned = pinnedPermission(module, role);
                    const locked = excluded || pinned !== undefined;
                    const title = excluded
                      ? `${module} is not available to ${role}`
                      : pinned !== undefined
                        ? `${module} / ${role} is fixed at ${pinned} and cannot be changed`
                        : `${module} / ${role}: ${perms[module][role]} - click to change`;
                    return (
                      <td key={role} className="px-4 py-3 text-center">
                        <button
                          disabled={locked}
                          title={title}
                          onClick={() => cycle(module, role)}
                          className={cn(
                            'inline-flex items-center justify-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors',
                            locked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-ink-100',
                            permColor[perms[module][role]],
                          )}
                        >
                          <PermIcon level={perms[module][role]} />
                          <span className="capitalize">{excluded ? 'n/a' : perms[module][role]}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-ink-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-xs text-ink-500">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-emerald-500" /> Full access</span>
            <span className="flex items-center gap-1.5"><AlertCircle size={14} className="text-amber-400" /> View only</span>
            <span className="flex items-center gap-1.5"><X size={14} className="text-ink-300" /> No access</span>
          </div>
          <Button variant="secondary" size="sm" onClick={resetToDefaults}>Reset Defaults</Button>
        </div>
      </Card>
    </SettingsSection>
  );
}

const PermIcon = ({ level }: { level: PermissionLevel }) => {
  if (level === 'full') return <CheckCircle2 size={18} className="text-emerald-500" />;
  if (level === 'view') return <AlertCircle size={18} className="text-amber-400" />;
  return <X size={18} className="text-ink-200" />;
};

// ===========================================================================
// Section: Holidays
// ===========================================================================
function HolidaysSection() {
  const save = useSaveIndicator();
  const holidayRevision = useHolidayDirectoryRevision();
  const [holidayRows, setHolidayRows] = useState<Holiday[]>(() => getHolidayDirectory());
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingHolidayId, setEditingHolidayId] = useState('');
  const [editingHolidayName, setEditingHolidayName] = useState('');
  const [editingHolidayDate, setEditingHolidayDate] = useState('');
  const [editingHolidayType, setEditingHolidayType] = useState<Holiday['type']>('National');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState(() => todayIso());
  const [newHolidayType, setNewHolidayType] = useState<Holiday['type']>('National');
  const [addError, setAddError] = useState('');
  const [editError, setEditError] = useState('');

  useEffect(() => {
    setHolidayRows(getHolidayDirectory());
  }, [holidayRevision]);

  const typeTone: Record<string, BadgeTone> = {
    National: 'green',
    Regional: 'amber',
    Optional: 'blue',
  };

  const holidayTypeOptions = [
    { label: 'National', value: 'National' },
    { label: 'Regional', value: 'Regional' },
    { label: 'Optional', value: 'Optional' },
  ];

  function resetAddForm() {
    setNewHolidayName('');
    setNewHolidayDate(todayIso());
    setNewHolidayType('National');
    setAddError('');
  }

  function resetEditForm() {
    setEditingHolidayId('');
    setEditingHolidayName('');
    setEditingHolidayDate('');
    setEditingHolidayType('National');
    setEditError('');
  }

  function openEditHoliday(holiday: Holiday) {
    setEditingHolidayId(holiday.id);
    setEditingHolidayName(holiday.name);
    setEditingHolidayDate(holiday.date);
    setEditingHolidayType(holiday.type);
    setEditError('');
    setEditOpen(true);
  }

  function handleAddHoliday() {
    const name = newHolidayName.trim();
    const date = newHolidayDate.trim();
    const type = newHolidayType;

    if (!name) {
      setAddError('Holiday name is required.');
      return;
    }
    if (!date) {
      setAddError('Holiday date is required.');
      return;
    }
    if (holidayRows.some((holiday) => holiday.name.toLowerCase() === name.toLowerCase() && holiday.date === date)) {
      setAddError('This holiday already exists on that date.');
      return;
    }

    const id = `h${Date.now()}`;
    const updatedRows = [...holidayRows, { id, name, date, type }];
    save.track(saveHolidayDirectory(updatedRows));
    setHolidayRows(updatedRows);
    setAddOpen(false);
    resetAddForm();
  }

  function handleUpdateHoliday() {
    const name = editingHolidayName.trim();
    const date = editingHolidayDate.trim();
    const type = editingHolidayType;

    if (!name) {
      setEditError('Holiday name is required.');
      return;
    }
    if (!date) {
      setEditError('Holiday date is required.');
      return;
    }
    if (holidayRows.some((holiday) => holiday.id !== editingHolidayId && holiday.name.toLowerCase() === name.toLowerCase() && holiday.date === date)) {
      setEditError('Another holiday already exists on that date.');
      return;
    }

    const updatedRows = holidayRows.map((holiday) => (
      holiday.id === editingHolidayId
        ? { ...holiday, name, date, type }
        : holiday
    ));
    save.track(saveHolidayDirectory(updatedRows));
    setHolidayRows(updatedRows);
    setEditOpen(false);
    resetEditForm();
  }

  function handleDeleteHoliday(holiday: Holiday) {
    const confirmed = window.confirm(`Delete ${holiday.name} (${formatDate(holiday.date)})?`);
    if (!confirmed) return;

    const updatedRows = holidayRows.filter((row) => row.id !== holiday.id);
    save.track(saveHolidayDirectory(updatedRows));
    setHolidayRows(updatedRows);
  }

  const cols: Column<Holiday>[] = [
    { key: 'name', header: 'Holiday', render: (r) => <span className="font-medium text-ink-900">{r.name}</span> },
    { key: 'date', header: 'Date', render: (r) => <span className="text-ink-600">{formatDate(r.date)}</span> },
    {
      key: 'day',
      header: 'Day',
      render: (r) => (
        <span className="text-ink-500">
          {formatWeekdayLong(r.date)}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (r) => <Badge tone={typeTone[r.type] ?? 'gray'}>{r.type}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" icon={<Edit2 size={13} />} onClick={() => openEditHoliday(r)}>Edit</Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={13} />}
            className="text-rose-600 hover:bg-rose-50"
            onClick={() => handleDeleteHoliday(r)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <SettingsSection
      title="Holidays"
      subtitle="Manage the holiday calendar visible to all employees."
      action={<SaveIndicator state={save.state} />}
    >
      <Card padding={false}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div className="flex items-center gap-4">
            <p className="text-sm text-ink-500">{holidayRows.length} holidays — FY 2026</p>
            <div className="flex gap-2">
              <Badge tone="green">National</Badge>
              <Badge tone="amber">Regional</Badge>
              <Badge tone="blue">Optional</Badge>
            </div>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add Holiday</Button>
        </div>
        <Table columns={cols} data={holidayRows} keyExtractor={(r) => r.id} />
      </Card>

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          resetAddForm();
        }}
        title="Add Holiday"
        subtitle="Add a new holiday to the calendar"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAddOpen(false);
                resetAddForm();
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddHoliday}>Save Holiday</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Holiday Name"
            value={newHolidayName}
            onChange={(v) => {
              setNewHolidayName(v);
              setAddError('');
            }}
          />
          <Field
            label="Date"
            type="date"
            value={newHolidayDate}
            onChange={(v) => {
              setNewHolidayDate(v);
              setAddError('');
            }}
          />
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Type</label>
            <Select
              value={newHolidayType}
              onChange={(v) => {
                setNewHolidayType(v as Holiday['type']);
                setAddError('');
              }}
              options={holidayTypeOptions}
            />
          </div>
          {addError && <p className="text-sm text-rose-600">{addError}</p>}
        </div>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          resetEditForm();
        }}
        title="Edit Holiday"
        subtitle="Update the selected holiday"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setEditOpen(false);
                resetEditForm();
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUpdateHoliday}>Save Changes</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Holiday Name"
            value={editingHolidayName}
            onChange={(v) => {
              setEditingHolidayName(v);
              setEditError('');
            }}
          />
          <Field
            label="Date"
            type="date"
            value={editingHolidayDate}
            onChange={(v) => {
              setEditingHolidayDate(v);
              setEditError('');
            }}
          />
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Type</label>
            <Select
              value={editingHolidayType}
              onChange={(v) => {
                setEditingHolidayType(v as Holiday['type']);
                setEditError('');
              }}
              options={holidayTypeOptions}
            />
          </div>
          {editError && <p className="text-sm text-rose-600">{editError}</p>}
        </div>
      </Modal>
    </SettingsSection>
  );
}

// ===========================================================================
// Section: Notifications
// ===========================================================================
function NotificationsSection() {
  const save = useSaveIndicator();
  const notificationRevision = useNotificationPreferencesRevision();
  const [notifs, setNotifs] = useState<NotificationPreference[]>(() => getNotificationPreferences());

  useEffect(() => {
    setNotifs(getNotificationPreferences());
  }, [notificationRevision]);

  const toggle = (id: string, key: 'email' | 'inApp') => {
    const updated = notifs.map((notif) => (notif.id === id ? { ...notif, [key]: !notif[key] } : notif));
    save.track(saveNotificationPreferences(updated));
    setNotifs(updated);
  };

  const categories = Array.from(new Set(notifs.map((n) => n.category)));

  return (
    <SettingsSection
      title="Notification Preferences"
      subtitle="Control which events trigger email and in-app notifications."
      action={<SaveIndicator state={save.state} />}
    >
      <Card padding={false}>
        {/* Header row */}
        <div className="grid grid-cols-[1fr_80px_80px] px-5 py-3 border-b border-ink-100 text-xs font-semibold text-ink-500 uppercase tracking-wide">
          <span>Notification</span>
          <span className="text-center">Email</span>
          <span className="text-center">In-App</span>
        </div>
        {categories.map((cat) => (
          <div key={cat}>
            <div className="px-5 py-2 bg-ink-50 border-b border-ink-100">
              <span className="text-xs font-bold text-ink-500 uppercase tracking-wider">{cat}</span>
            </div>
            {notifs.filter((n) => n.category === cat).map((n) => (
              <div
                key={n.id}
                className="grid grid-cols-[1fr_80px_80px] items-center px-5 py-3.5 border-b border-ink-100 last:border-0 hover:bg-ink-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink-800">{n.label}</p>
                  <p className="text-xs text-ink-400 mt-0.5">{n.description}</p>
                </div>
                <div className="flex justify-center">
                  <button
                    onClick={() => toggle(n.id, 'email')}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                      n.email ? 'bg-brand-600' : 'bg-ink-200',
                    )}
                  >
                    <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition duration-200', n.email ? 'translate-x-4' : 'translate-x-0')} />
                  </button>
                </div>
                <div className="flex justify-center">
                  <button
                    onClick={() => toggle(n.id, 'inApp')}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                      n.inApp ? 'bg-brand-600' : 'bg-ink-200',
                    )}
                  >
                    <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition duration-200', n.inApp ? 'translate-x-4' : 'translate-x-0')} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </Card>
    </SettingsSection>
  );
}

// ===========================================================================
// Section: Integrations
// ===========================================================================
interface Integration {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  iconBg: string;
  category: string;
  connected: boolean;
  badge?: string;
}

const defaultIntegrations: Integration[] = [
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send HR notifications, leave alerts, and announcements directly to Slack channels.',
    icon: <Slack size={22} />,
    iconBg: 'bg-[#4A154B] text-white',
    category: 'Communication',
    connected: true,
    badge: 'Connected',
  },
  {
    id: 'google',
    name: 'Google Workspace',
    description: 'Sync employee directory with Google accounts and enable SSO login.',
    icon: <Chrome size={22} />,
    iconBg: 'bg-blue-50 text-blue-600',
    category: 'Identity & SSO',
    connected: true,
    badge: 'Connected',
  },
  {
    id: 'razorpay',
    name: 'Razorpay Payroll',
    description: 'Automate salary disbursements, reimbursements, and compliance filings.',
    icon: <Package size={22} />,
    iconBg: 'bg-[#072654] text-white',
    category: 'Payroll',
    connected: false,
  },
  {
    id: 'zoho',
    name: 'Zoho People',
    description: 'Bi-directional sync of employee records with Zoho People for legacy support.',
    icon: <Leaf size={22} />,
    iconBg: 'bg-red-50 text-red-600',
    category: 'HR Tools',
    connected: false,
  },
  {
    id: 'bamboo',
    name: 'BambooHR',
    description: 'Migrate employee data and performance records from BambooHR seamlessly.',
    icon: <Zap size={22} />,
    iconBg: 'bg-green-50 text-green-600',
    category: 'HR Tools',
    connected: false,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Pull engineering contributions data for performance review context.',
    icon: <Code2 size={22} />,
    iconBg: 'bg-ink-900 text-white',
    category: 'Dev Tools',
    connected: true,
    badge: 'Connected',
  },
];

function IntegrationsSection() {
  const save = useSaveIndicator();
  const integrationRevision = useIntegrationPreferencesRevision();
  const [integrations, setIntegrations] = useState(defaultIntegrations);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);
  const [configLabel, setConfigLabel] = useState('');
  const [configError, setConfigError] = useState('');

  useEffect(() => {
    const preferenceById = new Map(getIntegrationPreferences().map((integration) => [integration.id, integration]));
    setIntegrations(
      defaultIntegrations.map((integration) => {
        const preference = preferenceById.get(integration.id);
        return {
          ...integration,
          connected: preference?.connected ?? integration.connected,
          badge: preference?.badge ?? (preference?.connected ?? integration.connected ? 'Connected' : undefined),
        };
      }),
    );
  }, [integrationRevision]);

  const toggleConnect = (id: string) => {
    const updated = integrations.map((integration) => (
      integration.id === id
        ? { ...integration, connected: !integration.connected, badge: !integration.connected ? 'Connected' : undefined }
        : integration
    ));
    save.track(saveIntegrationPreferences(updated.map(({ id: integrationId, connected, badge }) => ({ id: integrationId, connected, badge }))));
    setIntegrations(updated);
  };

  const openConfigure = (integration: Integration) => {
    setEditingIntegration(integration);
    setConfigLabel(integration.badge ?? (integration.connected ? 'Connected' : 'Not connected'));
    setConfigError('');
    setConfigureOpen(true);
  };

  const saveConfigure = () => {
    if (!editingIntegration) return;
    const nextLabel = configLabel.trim();
    if (!nextLabel) {
      setConfigError('Display label is required.');
      return;
    }

    const updated = integrations.map((integration) => (
      integration.id === editingIntegration.id
        ? { ...integration, badge: nextLabel }
        : integration
    ));
    save.track(saveIntegrationPreferences(updated.map(({ id: integrationId, connected, badge }) => ({ id: integrationId, connected, badge }))));
    setIntegrations(updated);
    setConfigureOpen(false);
    setEditingIntegration(null);
    setConfigLabel('');
    setConfigError('');
  };

  const categories = Array.from(new Set(integrations.map((i) => i.category)));

  return (
    <SettingsSection
      title="Integrations"
      subtitle="Connect ModCon HR with your existing tools and data sources."
      action={<SaveIndicator state={save.state} />}
    >
      {categories.map((cat) => (
        <div key={cat} className="mb-6">
          <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-3">{cat}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {integrations.filter((i) => i.category === cat).map((integ) => (
              <Card key={integ.id} className="hover:shadow-card-hover transition-shadow">
                <div className="flex items-start gap-4">
                  <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center shrink-0', integ.iconBg)}>
                    {integ.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-ink-900 text-sm">{integ.name}</span>
                      {integ.connected && (
                        <Badge tone="green" dot>Connected</Badge>
                      )}
                    </div>
                    <p className="text-xs text-ink-500 leading-relaxed mb-3">{integ.description}</p>
                    <div className="flex gap-2">
                      <Button
                        variant={integ.connected ? 'ghost' : 'secondary'}
                        size="sm"
                        onClick={() => toggleConnect(integ.id)}
                        icon={integ.connected ? <X size={13} /> : <Plug size={13} />}
                      >
                        {integ.connected ? 'Disconnect' : 'Connect'}
                      </Button>
                      {integ.connected && (
                        <Button variant="ghost" size="sm" icon={<Edit2 size={13} />} onClick={() => openConfigure(integ)}>Configure</Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}

      <Modal
        open={configureOpen}
        onClose={() => {
          setConfigureOpen(false);
          setEditingIntegration(null);
          setConfigLabel('');
          setConfigError('');
        }}
        title="Configure Integration"
        subtitle={editingIntegration ? `Adjust settings for ${editingIntegration.name}` : 'Adjust integration settings'}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setConfigureOpen(false);
                setEditingIntegration(null);
                setConfigLabel('');
                setConfigError('');
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={saveConfigure}>Save Changes</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Display Label"
            value={configLabel}
            onChange={(v) => {
              setConfigLabel(v);
              setConfigError('');
            }}
            hint="Shown as the integration badge in this demo"
          />
          {configError && <p className="text-sm text-rose-600">{configError}</p>}
        </div>
      </Modal>
    </SettingsSection>
  );
}

// ===========================================================================
// Section: Billing
// ===========================================================================
function BillingSection({ upgradeRequestToken = 0 }: { upgradeRequestToken?: number }) {
  const billingRevision = useBillingPreferencesRevision();
  const invoiceRevision = useBillingInvoicesRevision();
  const [planTier, setPlanTier] = useState<BillingPlanTier>(() => getBillingPreferences().planTier);
  const [totalSeats, setTotalSeats] = useState(() => getBillingPreferences().totalSeats);
  const [manageOpen, setManageOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [addSeatsOpen, setAddSeatsOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [billingEmail, setBillingEmail] = useState(() => getBillingPreferences().billingEmail);
  const [autoRenew, setAutoRenew] = useState(() => getBillingPreferences().autoRenew);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [addSeatsValue, setAddSeatsValue] = useState('5');
  const [addSeatsError, setAddSeatsError] = useState('');
  const [actionNotice, setActionNotice] = useState('');

  useEffect(() => {
    const preferences = getBillingPreferences();
    setPlanTier(preferences.planTier);
    setTotalSeats(preferences.totalSeats);
    setBillingEmail(preferences.billingEmail);
    setAutoRenew(preferences.autoRenew);
  }, [billingRevision]);

  const invoices = getBillingInvoices();
  void invoiceRevision;

  useEffect(() => {
    if (!selectedInvoiceId && invoices.length > 0) {
      setSelectedInvoiceId(invoices[0].id);
    }
  }, [invoices, selectedInvoiceId]);

  const usedSeats = employees.length;
  const usedPct = Math.round((usedSeats / totalSeats) * 100);
  const isEnterprise = planTier === 'Enterprise';

  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? invoices[0] ?? null;
  const pricePerSeat = 4999;
  const latestInvoice = invoices[0] ?? null;

  function formatAmount(amount: number) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function createInvoiceDetails(invoice: BillingInvoice) {
    return [
      'ModCon HR Invoice',
      `Invoice ID: ${invoice.id}`,
      `Date: ${formatDate(invoice.date)}`,
      `Title: ${invoice.title}`,
      `Description: ${invoice.description}`,
      `Plan: ${invoice.planTier}`,
      `Seats: ${invoice.totalSeats}`,
      `Billing Email: ${invoice.billingEmail}`,
      `Auto-renew: ${invoice.autoRenew ? 'Enabled' : 'Disabled'}`,
      `Amount: ${formatAmount(invoice.amount)}`,
      `Status: ${invoice.status}`,
    ].join('\n');
  }

  function downloadInvoice(invoiceId: string) {
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice) return;

    const fileText = createInvoiceDetails(invoice);

    const blob = new Blob([fileText], { type: 'text/plain;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = `${invoice.id}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(downloadUrl);

    setActionNotice(`Downloaded invoice ${invoice.id}.`);
  }

  function handleSaveSubscription() {
    if (!billingEmail.trim()) {
      return;
    }
    saveBillingPreferences({
      planTier,
      totalSeats,
      billingEmail: billingEmail.trim(),
      autoRenew,
    });
    setManageOpen(false);
    setActionNotice('Subscription details updated successfully.');
  }

  function handleAddSeats() {
    const seats = Number(addSeatsValue);
    if (!Number.isFinite(seats) || seats <= 0) {
      setAddSeatsError('Please enter a valid number of seats to add.');
      return;
    }

    const nextSeats = totalSeats + seats;
    setTotalSeats(nextSeats);
    saveBillingPreferences({
      planTier,
      totalSeats: nextSeats,
      billingEmail,
      autoRenew,
    });
    appendBillingInvoice({
      date: todayIso(),
      amount: seats * pricePerSeat,
      status: 'Paid',
      title: 'Additional Seats Added',
      description: `${seats} seat${seats > 1 ? 's' : ''} added to the plan.`,
      planTier,
      totalSeats: nextSeats,
      billingEmail,
      autoRenew,
    });
    setAddSeatsOpen(false);
    setAddSeatsValue('5');
    setAddSeatsError('');
    setActionNotice(`${seats} seat${seats > 1 ? 's' : ''} added to your plan.`);
  }

  function handleUpgradeEnterprise() {
    const nextSeats = Math.max(totalSeats, 500);
    setPlanTier('Enterprise');
    setTotalSeats(nextSeats);
    saveBillingPreferences({
      planTier: 'Enterprise',
      totalSeats: nextSeats,
      billingEmail,
      autoRenew,
    });
    appendBillingInvoice({
      date: todayIso(),
      amount: nextSeats * pricePerSeat,
      status: 'Paid',
      title: 'Enterprise Upgrade',
      description: 'Plan upgraded to Enterprise with expanded seat capacity.',
      planTier: 'Enterprise',
      totalSeats: nextSeats,
      billingEmail,
      autoRenew,
    });
    setUpgradeOpen(false);
    setActionNotice('Enterprise upgrade initiated. Our team will contact you shortly.');
  }

  useEffect(() => {
    if (upgradeRequestToken > 0 && !isEnterprise) {
      setUpgradeOpen(true);
    }
  }, [upgradeRequestToken, isEnterprise]);

  const planFeatures = [
    { feature: 'Employees (seats)', starter: '10', pro: '60', enterprise: 'Unlimited' },
    { feature: 'All HR modules', starter: false, pro: true, enterprise: true },
    { feature: 'Advanced Reports', starter: false, pro: true, enterprise: true },
    { feature: 'AI Insights', starter: false, pro: false, enterprise: true },
    { feature: 'Custom workflows', starter: false, pro: true, enterprise: true },
    { feature: 'SSO / SAML', starter: false, pro: false, enterprise: true },
    { feature: 'Priority support', starter: false, pro: false, enterprise: true },
    { feature: 'Dedicated CSM', starter: false, pro: false, enterprise: true },
  ];

  return (
    <SettingsSection title="Billing & Plan" subtitle="Manage your subscription, seats, and invoices.">
      <Card className="mb-5 border-2 border-brand-200 bg-gradient-to-br from-brand-50 to-violet-50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-brand-600 flex items-center justify-center">
              <Star size={22} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-ink-900 text-lg">{`ModCon HR ${planTier}`}</span>
                <Badge tone="violet">Active</Badge>
              </div>
              <p className="text-sm text-ink-500">
                {isEnterprise ? 'Enterprise plan with expanded seat capacity' : 'Billed annually · ₹4,999/seat/year'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setManageOpen(true)}>Manage Subscription</Button>
            <Button variant="ghost" size="sm" onClick={() => setInvoiceOpen(true)}>View Invoices</Button>
          </div>
        </div>
      </Card>

      {actionNotice && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {actionNotice}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <Card className="md:col-span-2">
          <CardHeader title="Seat Usage" subtitle={`${usedSeats} of ${totalSeats} seats used`} />
          <div className="relative h-4 bg-ink-100 rounded-full overflow-hidden mb-2">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-700',
                usedPct > 85 ? 'bg-rose-500' : usedPct > 70 ? 'bg-amber-500' : 'bg-brand-600',
              )}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-ink-500 mb-4">
            <span>{usedSeats} used</span>
            <span className={cn('font-semibold', usedPct > 85 ? 'text-rose-600' : 'text-ink-600')}>
              {totalSeats - usedSeats} remaining
            </span>
          </div>
          {usedPct > 70 && (
            <div className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-xs',
              usedPct > 85 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700',
            )}>
              <AlertCircle size={14} />
              {usedPct > 85
                ? isEnterprise
                  ? 'Seat usage is high. Consider adding more buffer seats.'
                  : 'You\'re nearly at capacity. Upgrade to add more seats.'
                : isEnterprise
                  ? 'Usage is growing steadily across your organisation.'
                  : 'Consider upgrading soon to avoid disruption.'}
            </div>
          )}
          <Button variant="primary" size="sm" className="mt-3" onClick={() => setAddSeatsOpen(true)}>Add Seats</Button>
        </Card>

        <Card>
          <CardHeader title="Next Invoice" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-500">
                {isEnterprise ? 'Enterprise Plan' : `Pro Plan (${totalSeats} seats)`}
              </span>
              <span className="font-semibold">{formatAmount(299940)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">Due date</span>
              <span className="font-semibold">01 Jan 2027</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">Payment method</span>
              <span className="font-semibold">•••• 4242</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-ink-100 space-y-2">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => {
                if (latestInvoice) {
                  setSelectedInvoiceId(latestInvoice.id);
                }
                setInvoiceOpen(true);
              }}
            >
              View Invoice Details
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => latestInvoice && downloadInvoice(latestInvoice.id)}
              disabled={!latestInvoice}
            >
              Download Last Invoice
            </Button>
          </div>
        </Card>
      </div>

      <Card padding={false}>
        <div className="px-5 py-4 border-b border-ink-100">
          <h3 className="text-base font-semibold text-ink-900">Plan Comparison</h3>
          <p className="text-sm text-ink-500 mt-0.5">Your current plan is highlighted</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200">
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wide">Feature</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500 uppercase tracking-wide">Starter</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-brand-600 uppercase tracking-wide bg-brand-50">
                  Pro ✓
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-violet-600 uppercase tracking-wide">Enterprise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {planFeatures.map((row) => (
                <tr key={row.feature} className="hover:bg-ink-50">
                  <td className="px-5 py-3 font-medium text-ink-800">{row.feature}</td>
                  <td className="px-4 py-3 text-center">
                    {typeof row.starter === 'string'
                      ? <span className="text-ink-600">{row.starter}</span>
                      : row.starter
                        ? <Check size={16} className="text-emerald-500 mx-auto" />
                        : <X size={16} className="text-ink-300 mx-auto" />}
                  </td>
                  <td className="px-4 py-3 text-center bg-brand-50">
                    {typeof row.pro === 'string'
                      ? <span className="font-semibold text-brand-700">{row.pro}</span>
                      : row.pro
                        ? <Check size={16} className="text-brand-600 mx-auto" />
                        : <X size={16} className="text-ink-300 mx-auto" />}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {typeof row.enterprise === 'string'
                      ? <span className="text-violet-700 font-semibold">{row.enterprise}</span>
                      : row.enterprise
                        ? <Check size={16} className="text-violet-500 mx-auto" />
                        : <X size={16} className="text-ink-300 mx-auto" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 border-t border-ink-100">
          <Button
            variant="primary"
            icon={<Zap size={15} />}
            onClick={() => setUpgradeOpen(true)}
            disabled={isEnterprise}
          >
            {isEnterprise ? 'Enterprise Active' : 'Upgrade to Enterprise'}
          </Button>
        </div>
      </Card>

      <Modal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        title="Manage Subscription"
        subtitle="Update billing contact and renewal preferences"
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setManageOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSaveSubscription}>Save Changes</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Field label="Billing Contact Email" type="email" value={billingEmail} onChange={setBillingEmail} />
          <div className="rounded-xl border border-ink-100 px-3 py-1">
            <Toggle
              checked={autoRenew}
              onChange={setAutoRenew}
              label="Auto-renew subscription"
              description="Renew plan automatically on billing date"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        title="Invoices"
        subtitle="View and download recent invoices"
        size="lg"
        footer={(
          <Button variant="secondary" onClick={() => setInvoiceOpen(false)}>Close</Button>
        )}
      >
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            {invoices.map((invoice) => {
              const isSelected = invoice.id === selectedInvoice?.id;
              return (
                <button
                  key={invoice.id}
                  type="button"
                  onClick={() => setSelectedInvoiceId(invoice.id)}
                  className={cn(
                    'w-full rounded-xl border p-3 text-left transition-colors',
                    isSelected ? 'border-brand-300 bg-brand-50' : 'border-ink-100 hover:bg-ink-50',
                  )}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink-800">{invoice.title}</p>
                      <p className="text-xs text-ink-500">{invoice.id} · {formatDate(invoice.date)} · {invoice.status}</p>
                    </div>
                    <span className="text-sm font-semibold text-ink-800">{formatAmount(invoice.amount)}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="rounded-xl border border-ink-100 bg-ink-50 p-4">
            {selectedInvoice ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-ink-800">{selectedInvoice.title}</p>
                  <p className="text-xs text-ink-500">{selectedInvoice.id}</p>
                </div>
                <div className="space-y-2 text-sm text-ink-600">
                  <p>{selectedInvoice.description}</p>
                  <p>Plan: {selectedInvoice.planTier}</p>
                  <p>Seats: {selectedInvoice.totalSeats}</p>
                  <p>Billing: {selectedInvoice.billingEmail}</p>
                  <p>Auto-renew: {selectedInvoice.autoRenew ? 'Enabled' : 'Disabled'}</p>
                  <p>Status: {selectedInvoice.status}</p>
                  <p className="font-semibold text-ink-800">Amount: {formatAmount(selectedInvoice.amount)}</p>
                </div>
                <Button variant="primary" className="w-full" onClick={() => downloadInvoice(selectedInvoice.id)}>
                  Download Selected Invoice
                </Button>
              </div>
            ) : (
              <p className="text-sm text-ink-500">No invoices available.</p>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={addSeatsOpen}
        onClose={() => {
          setAddSeatsOpen(false);
          setAddSeatsError('');
          setAddSeatsValue('5');
        }}
        title="Add Seats"
        subtitle="Increase your seat capacity immediately"
        size="sm"
        footer={(
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAddSeatsOpen(false);
                setAddSeatsError('');
                setAddSeatsValue('5');
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddSeats}>Add Seats</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Field
            label="Seats to Add"
            type="number"
            value={addSeatsValue}
            onChange={(value) => {
              setAddSeatsValue(value);
              setAddSeatsError('');
            }}
            hint="Seats are provisioned instantly for your workspace"
          />
          {addSeatsError && <p className="text-sm text-rose-600">{addSeatsError}</p>}
        </div>
      </Modal>

      <Modal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Upgrade to Enterprise"
        subtitle="Unlock higher seat capacity, SSO, AI insights, and priority support"
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setUpgradeOpen(false)}>Not Now</Button>
            <Button variant="primary" onClick={handleUpgradeEnterprise}>Confirm Upgrade</Button>
          </>
        )}
      >
        <div className="space-y-2 text-sm text-ink-600">
          <p>Enterprise upgrade requests are activated by our billing team.</p>
          <p>You will receive a confirmation email at {billingEmail}.</p>
        </div>
      </Modal>
    </SettingsSection>
  );
}

// ===========================================================================
// Nav definitions
// ===========================================================================
// ===========================================================================
// Section: Database
// ===========================================================================
function DatabaseSection() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStatus, setResetStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [resetLogs, setResetLogs] = useState<string[]>([]);
  const [backfillStatus, setBackfillStatus] = useState<'idle' | 'running' | 'dry-run' | 'done' | 'error'>('idle');
  const [backfillLogs, setBackfillLogs] = useState<string[]>([]);
  const [accessStatus, setAccessStatus] = useState<'idle' | 'running' | 'dry-run' | 'done' | 'error'>('idle');
  const [accessLogs, setAccessLogs] = useState<string[]>([]);
  const { profile, isAdmin } = useAuth();

  // Authorized on the server-backed role, not on the permission matrix that
  // routed the caller here.
  //
  // `RequireModuleAccess` gates /settings on the `Settings` row of that matrix,
  // and the matrix lives in localStorage (src/lib/accessControl.ts) — a value
  // the client owns, and one `enforceRequiredPermissions` does not pin for this
  // row. So reaching this section is not evidence of anything. The Firestore
  // half of every operation below is checked by the rules and fails for a
  // non-administrator, but `handleResetMockData` also sweeps localStorage, and
  // that half has no server to refuse it: an employee who granted themselves
  // the module in devtools could wipe their organisation's entire local
  // overlay. `profile.role` comes from a Firestore document only an
  // administrator can write. See G5 in docs/tenant-isolation-spec.md.
  const isOrgAdmin = isAdmin || profile?.role === 'hr';

  // Links accounts to employee records and refreshes the reporting chains on
  // leave documents. Both grant access the rules currently withhold — they fail
  // closed — so both are dry-run first, like the orgId backfill above.
  async function handleAccessBackfill(dryRun: boolean) {
    setAccessStatus('running');
    setAccessLogs([]);
    const onProgress = (msg: string) => setAccessLogs((prev) => [...prev, msg]);
    try {
      await backfillEmployeeLinks({
        orgKey: getActiveOrgKey(),
        dryRun,
        linkedBy: profile?.uid ?? 'backfill',
        onProgress,
      });
      onProgress('---');
      await backfillManagerChains({ orgKey: getActiveOrgKey(), dryRun, onProgress });
      setAccessStatus(dryRun ? 'dry-run' : 'done');
    } catch (err) {
      onProgress(`Error: ${String(err)}`);
      setAccessStatus('error');
    }
  }

  // Two-stage on purpose: this writes to every tenant collection in the
  // database, so the count is shown before anything is changed. Same shape as
  // Organizations -> "Review admin roles".
  async function handleBackfill(dryRun: boolean) {
    setBackfillStatus('running');
    setBackfillLogs([]);
    try {
      const onProgress = (msg: string) => setBackfillLogs((prev) => [...prev, msg]);
      await backfillOrgIds({ orgKey: getActiveOrgKey(), dryRun, onProgress });
      onProgress('---');
      // Configuration held only in this browser. An organisation that used the
      // app before org_settings existed has its leave policies and company
      // profile in localStorage and nowhere else; this publishes them once,
      // and never overwrites a document another administrator already
      // published. See G3 in docs/tenant-isolation-spec.md.
      await backfillOrgSettings({ dryRun, onProgress });
      setBackfillStatus(dryRun ? 'dry-run' : 'done');
    } catch (err) {
      setBackfillLogs((prev) => [...prev, `Error: ${String(err)}`]);
      setBackfillStatus('error');
    }
  }

  async function handleSeed() {
    setStatus('running');
    setLogs([]);
    try {
      // Seeded into the active organisation, so a company seeding a demo
              // dataset gets its own copy rather than writing into the shared
              // default-org records.
              await seedFirestore((msg) => setLogs((prev) => [...prev, msg]), getActiveOrgKey());
      // Seeding is the natural "undo" for a prior Delete Mock Data — lift the
      // local suppression flag so the static seed layer renders again too
      // (takes effect on next reload, same as the flag itself).
      setMockDataCleared(false);
      setStatus('done');
    } catch (err) {
      setLogs((prev) => [...prev, `Error: ${String(err)}`]);
      setStatus('error');
    }
  }

  async function handleResetMockData() {
    // Re-checked here and not only at the render above: this is the one
    // operation whose second half (the localStorage sweep) has no server to
    // refuse it.
    if (!isOrgAdmin) return;
    setResetStatus('running');
    setResetLogs([]);
    try {
      // The purge is org-scoped now (see batchDeleteCollection in lib/seed.ts),
      // so every organisation can clear its own Firestore data. It previously
      // deleted the collections wholesale, which is why it had to be limited to
      // the default org: one company's reset took every tenant's data with it.
      // Records predating multi-tenancy carry no orgId and match no filter, so
      // they are left untouched until the backfill has stamped them.
      await purgeSeededFirestoreData(
        (msg) => setResetLogs((prev) => [...prev, msg]),
        getActiveOrgKey(),
      );
      const keysToRemove = Object.keys(window.localStorage).filter(
        (key) => key.startsWith('modcon.hr.') && belongsToActiveOrg(key),
      );
      keysToRemove.forEach((key) => window.localStorage.removeItem(key));
      // Set after the sweep above so it isn't immediately deleted by it —
      // this is what makes the static seed layer (Employees, Attendance,
      // Leave, etc.) actually render empty after reload, not just Firestore.
      setMockDataCleared(true);
      setResetStatus('done');
      window.location.reload();
    } catch (err) {
      setResetLogs((prev) => [...prev, `Error: ${String(err)}`]);
      setResetStatus('error');
    }
  }

  if (!isOrgAdmin) {
    return (
      <SettingsSection
        title="Firestore Database"
        subtitle="Seeding, backfills and data reset are restricted to administrators."
      >
        <Card>
          <p className="text-sm text-ink-500">
            These operations write to and delete this organisation&rsquo;s records. They are
            available to an Admin or HR Manager only.
          </p>
        </Card>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="Firestore Database"
      subtitle="Seed Firestore with the built-in mock data. Safe to re-run — existing documents are overwritten."
    >
      <Card className="mb-4">
        <CardHeader
          title="Backfill employee access mapping"
          subtitle="Links accounts to employee records, and refreshes reporting chains on leave"
        />
        <div className="space-y-4">
          <p className="text-sm text-ink-500">
            Employees read their own payslips and leave through an
            administrator-authored <code>employee_links</code> record, and managers read their
            reports&rsquo; leave through the reporting chain stored on each leave document. Both
            fail closed: without them nobody sees their own salary and no manager sees their
            team&rsquo;s leave. Accounts are matched to employee records <strong>by email, and only
            when exactly one employee carries that address</strong> — anything ambiguous is skipped
            and listed rather than guessed.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              icon={<Database size={15} />}
              onClick={() => handleAccessBackfill(true)}
              disabled={accessStatus === 'running'}
            >
              {accessStatus === 'running' ? 'Scanning…' : 'Dry run'}
            </Button>
            <Button
              variant="primary"
              icon={<Database size={15} />}
              onClick={() => handleAccessBackfill(false)}
              disabled={accessStatus === 'running' || accessStatus === 'idle'}
              title={accessStatus === 'idle' ? 'Run the dry run first' : undefined}
            >
              Apply mapping
            </Button>
          </div>
          {accessLogs.length > 0 && (
            <pre className="max-h-56 overflow-auto rounded-lg bg-ink-900 p-3 text-xs text-ink-100">
              {accessLogs.join('\n')}
            </pre>
          )}
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="Backfill organization IDs"
          subtitle="Assigns documents written before multi-tenancy to this organization"
        />
        <div className="space-y-4">
          <p className="text-sm text-ink-500">
            Records created before organization scoping carry no <code>orgId</code>. The security
            rules still treat them as the default organization, so nothing is exposed — but
            Firestore equality filters never match a missing field, so those documents drop out of
            every org-scoped query until they are stamped. Run the dry run first; it changes
            nothing and reports the count.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              icon={<Database size={15} />}
              onClick={() => handleBackfill(true)}
              disabled={backfillStatus === 'running'}
            >
              {backfillStatus === 'running' ? 'Scanning…' : 'Dry run'}
            </Button>
            <Button
              variant="primary"
              icon={<Database size={15} />}
              onClick={() => handleBackfill(false)}
              disabled={backfillStatus === 'running' || backfillStatus === 'idle'}
              title={backfillStatus === 'idle' ? 'Run the dry run first' : undefined}
            >
              Apply backfill
            </Button>
          </div>
          {backfillLogs.length > 0 && (
            <pre className="max-h-56 overflow-auto rounded-lg bg-ink-900 p-3 text-xs text-ink-100">
              {backfillLogs.join('\n')}
            </pre>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Seed Collections" subtitle="Pushes all static mock data into Firestore in bulk" />
        <div className="space-y-4">
          <p className="text-sm text-ink-500">
            Collections: <span className="font-medium text-ink-700">employees, attendance, leave, payroll, recruitment, onboarding, performance, expenses, assets, helpdesk</span>
          </p>
          <Button
            variant="primary"
            icon={<Database size={15} />}
            onClick={handleSeed}
            disabled={status === 'running'}
          >
            {status === 'running' ? 'Seeding…' : status === 'done' ? 'Seed Again' : 'Seed Firestore'}
          </Button>
          {logs.length > 0 && (
            <div className="rounded-lg bg-ink-950 text-emerald-400 font-mono text-xs p-4 space-y-1 max-h-64 overflow-y-auto">
              {logs.map((log, i) => (
                <p key={i}>{log}</p>
              ))}
            </div>
          )}
          {status === 'done' && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
              <CheckCircle2 size={16} />
              All collections seeded successfully.
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-2 text-sm text-rose-600 font-medium">
              <AlertCircle size={16} />
              Seeding failed. Check the console for details.
            </div>
          )}
        </div>
      </Card>

      <Card className="border-rose-200">
        <CardHeader title="Danger Zone" subtitle="Delete all mock data — Firestore, local overrides, and the built-in seed roster" />
        <div className="space-y-4">
          <p className="text-sm text-ink-500">
            Deletes every document in the Firestore collections Seed Firestore populates, clears every browser-local
            mock overlay (all <span className="font-mono text-xs text-ink-600">modcon.hr.*</span> localStorage keys),
            and — unlike a plain overlay reset — also suppresses the hardcoded seed roster itself (employees,
            attendance, leave, recruitment, onboarding, performance, expenses, assets, helpdesk, regularizations;
            payroll figures derive from employees and empty out automatically), so Employees, Leave, Payroll, and
            the other feature pages actually go empty too, not just Firestore. Requires an admin-signed-in account
            for the Firestore half — enforced by firestore.rules. Click Seed Firestore above to restore everything
            (reload after seeding to see the seed roster reappear in the app).
          </p>
          <Button
            variant="danger"
            icon={<Trash2 size={15} />}
            onClick={() => setResetOpen(true)}
            disabled={resetStatus === 'running'}
          >
            {resetStatus === 'running' ? 'Deleting…' : 'Delete Mock Data'}
          </Button>
          {resetLogs.length > 0 && (
            <div className="rounded-lg bg-ink-950 text-emerald-400 font-mono text-xs p-4 space-y-1 max-h-64 overflow-y-auto">
              {resetLogs.map((log, i) => (
                <p key={i}>{log}</p>
              ))}
            </div>
          )}
          {resetStatus === 'error' && (
            <div className="flex items-center gap-2 text-sm text-rose-600 font-medium">
              <AlertCircle size={16} />
              Delete failed partway through. Check the log above — this is usually a permissions error if you're not signed in as an admin.
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Delete all mock data?"
        subtitle="This deletes Firestore documents and local overrides — it cannot be undone"
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                setResetOpen(false);
                void handleResetMockData();
              }}
            >
              Delete & Reload
            </Button>
          </>
        )}
      >
        <p className="text-sm text-ink-600">
          This permanently deletes every document in the seeded Firestore collections, removes every locally
          added/edited/deleted record in this browser, and suppresses the built-in seed roster so this browser
          shows an empty Employees, Leave, Payroll, Recruitment, Onboarding, Performance, Expenses, Assets, and
          Helpdesk — then reloads. Anyone else viewing this app against the same Firestore project also loses
          that Firestore data. Click Seed Firestore afterward to bring everything back.
        </p>
      </Modal>
    </SettingsSection>
  );
}

// ===========================================================================
// Section: Locations
// ===========================================================================
/**
 * The places this organisation works from.
 *
 * A location arrives here one of two ways: declared, by somebody adding it —
 * here or in Add Employee — or inferred, because an employee record says
 * somebody works there. Only a declared one can be renamed or withdrawn. An
 * inferred one has no record of its own to edit, and it stops being offered on
 * its own once the last person posted there moves; withdrawing it would mean
 * hiding a place people are actually in, which shows on their profile as a
 * location the form insists does not exist.
 */
function LocationsSection() {
  const save = useSaveIndicator();
  const directoryRevision = useEmployeeDirectoryRevision();
  const locationRevision = useLocationDirectoryRevision();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [originalName, setOriginalName] = useState('');
  const [editingName, setEditingName] = useState('');
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [editError, setEditError] = useState('');
  const [notice, setNotice] = useState('');

  const rows: LocationRecord[] = useMemo(
    () => buildLocationDirectory(getEmployeeDirectory().map((employee) => employee.location)),
    [directoryRevision, locationRevision],
  );

  function clashes(name: string, except = '') {
    return rows.some(
      (row) => row.name.toLowerCase() === name.toLowerCase() && row.name.toLowerCase() !== except.toLowerCase(),
    );
  }

  function handleAdd() {
    const name = normalizeLocation(newName);
    if (!name) {
      setAddError('Location name is required.');
      return;
    }
    if (clashes(name)) {
      setAddError('This organisation already has a location with that name.');
      return;
    }
    save.track(addLocationToDirectory(name));
    setAddOpen(false);
    setNewName('');
    setAddError('');
    setNotice('');
  }

  function handleRename() {
    const name = normalizeLocation(editingName);
    if (!name) {
      setEditError('Location name is required.');
      return;
    }
    if (clashes(name, originalName)) {
      setEditError('This organisation already has a location with that name.');
      return;
    }
    // The employees move with it — see renameLocationInDirectory.
    const { moved, published } = renameLocationInDirectory(originalName, name, reassignEmployeeLocation);
    save.track(published);
    setEditOpen(false);
    setEditError('');
    setNotice(
      moved > 0
        ? `Renamed to ${name}, and moved ${moved} ${moved === 1 ? 'person' : 'people'} with it.`
        : `Renamed to ${name}.`,
    );
  }

  function handleRemove(row: LocationRecord) {
    if (row.headcount > 0) {
      setNotice(`${row.headcount} ${row.headcount === 1 ? 'person is' : 'people are'} posted at ${row.name}. Move them somewhere else before withdrawing it.`);
      return;
    }
    setNotice('');
    save.track(removeLocationFromDirectory(row.name));
  }

  const cols: Column<LocationRecord>[] = [
    {
      key: 'name',
      header: 'Location',
      render: (r) => (
        <span className="flex items-center gap-2 font-medium text-ink-900">
          <MapPin size={13} className="text-ink-400" />
          {r.name}
        </span>
      ),
    },
    {
      key: 'people',
      header: 'People',
      render: (r) => <span className="text-sm text-ink-600">{r.headcount}</span>,
    },
    {
      key: 'source',
      header: 'Source',
      render: (r) => (
        <Badge tone={r.declared ? 'blue' : 'gray'}>{r.declared ? 'Declared' : 'In use'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          {/* An inferred location has no declaration to edit. Offering the
              buttons and refusing on click would be worse than not offering
              them — the row already says which kind it is. */}
          {r.declared ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={<Edit2 size={13} />}
                onClick={() => {
                  setOriginalName(r.name);
                  setEditingName(r.name);
                  setEditError('');
                  setEditOpen(true);
                }}
              >
                Rename
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={13} />}
                onClick={() => handleRemove(r)}
                title={r.headcount > 0 ? 'Move this location\'s people before withdrawing it' : 'Withdraw location'}
              >
                Withdraw
              </Button>
            </>
          ) : (
            <span className="text-xs text-ink-400">From an employee record</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <SettingsSection
      title="Locations"
      subtitle="The places this organisation works from, offered wherever someone picks a location."
      action={<SaveIndicator state={save.state} />}
    >
      <Card padding={false}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <p className="text-sm text-ink-500">{rows.length} locations offered</p>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add Location</Button>
        </div>
        {notice && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2" role="status">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">{notice}</p>
          </div>
        )}
        <Table columns={cols} data={rows} keyExtractor={(r) => r.name} emptyMessage="No locations yet" />
      </Card>

      <Modal
        open={addOpen}
        onClose={() => { setAddOpen(false); setNewName(''); setAddError(''); }}
        title="Add Location"
        subtitle="Offer a new place to work from"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAddOpen(false); setNewName(''); setAddError(''); }}>Cancel</Button>
            <Button variant="primary" onClick={handleAdd}>Add Location</Button>
          </>
        }
      >
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-ink-600" htmlFor="new-location">Location name</label>
          <input
            id="new-location"
            className="input w-full"
            aria-label="New location name"
            placeholder="e.g. Chennai"
            value={newName}
            onChange={(event) => { setNewName(event.target.value); setAddError(''); }}
          />
          {addError && <p className="text-xs text-red-600">{addError}</p>}
        </div>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditError(''); }}
        title="Rename Location"
        subtitle="Everyone posted here moves with it"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setEditOpen(false); setEditError(''); }}>Cancel</Button>
            <Button variant="primary" onClick={handleRename}>Save Location</Button>
          </>
        }
      >
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-ink-600" htmlFor="edit-location">Location name</label>
          <input
            id="edit-location"
            className="input w-full"
            aria-label="Location name"
            value={editingName}
            onChange={(event) => { setEditingName(event.target.value); setEditError(''); }}
          />
          {editError && <p className="text-xs text-red-600">{editError}</p>}
        </div>
      </Modal>
    </SettingsSection>
  );
}

// ===========================================================================
// Section: Salary Structure
// ===========================================================================
/** The gross a preview is worked out against — an example, not anyone's salary. */
const SAMPLE_MONTHLY_GROSS = 100_000;

/** The form holds strings so "not set" can be an empty field rather than a zero. */
type SalaryStructureForm = Record<keyof SalaryStructure, string>;

const FORM_FIELDS: Array<keyof SalaryStructure> = [
  'basicPercent',
  'hraPercent',
  'medicalAllowance',
  'conveyanceAllowance',
];

function toForm(structure: SalaryStructure | null): SalaryStructureForm {
  return {
    basicPercent: structure ? String(structure.basicPercent) : '',
    hraPercent: structure ? String(structure.hraPercent) : '',
    medicalAllowance: structure ? String(structure.medicalAllowance) : '',
    conveyanceAllowance: structure ? String(structure.conveyanceAllowance) : '',
  };
}

function SalaryStructureSection() {
  const save = useSaveIndicator();
  // Re-read when the organisation's copy arrives from Firestore, so an
  // administrator does not edit a form seeded from a stale cache.
  const revision = useSalaryStructureRevision();
  // Strings, not numbers: an organisation that has set nothing shows four empty
  // fields. Seeding them with a plausible 50 / 25 / 1492 would be handing this
  // company a policy it never chose and letting it save it by accident.
  const [form, setForm] = useState<SalaryStructureForm>(() => toForm(getSalaryStructure()));
  const [dirty, setDirty] = useState(false);
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const [uploadNote, setUploadNote] = useState('');
  const [uploadError, setUploadError] = useState('');
  const configured = getSalaryStructure() !== null;

  useEffect(() => {
    // A local edit in progress wins over an incoming hydration; overwriting it
    // would throw away typing the administrator has not saved yet.
    if (!dirty) setForm(toForm(getSalaryStructure()));
  }, [revision, dirty]);

  const complete = FORM_FIELDS.every((field) => form[field].trim() !== '');
  const parsed: SalaryStructure = {
    basicPercent: Number(form.basicPercent) || 0,
    hraPercent: Number(form.hraPercent) || 0,
    medicalAllowance: Number(form.medicalAllowance) || 0,
    conveyanceAllowance: Number(form.conveyanceAllowance) || 0,
  };
  const percentTotal = parsed.basicPercent + parsed.hraPercent;
  const overspent = percentTotal > 100;
  // `min={0}` on a bare input is not enforced outside form validation, and
  // `Number('-10') || 0` keeps the -10. Caught here rather than left to
  // normalizeSalaryStructure, which clamps a negative to 0 on save: that turned
  // a typo into a saved structure the administrator never typed, under a
  // preview row still captioned "-10% of gross".
  const negative = FORM_FIELDS.some((field) => parsed[field] < 0);
  const invalid = overspent || negative;
  // The same function payroll computes a payslip with, so the preview cannot
  // promise a split the payslip does not pay.
  const preview = complete && !invalid ? splitMonthlyGross(SAMPLE_MONTHLY_GROSS, parsed) : null;

  function set(key: keyof SalaryStructureForm, value: string) {
    setDirty(true);
    setUploadNote('');
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Read a split out of a file into the form.
   *
   * The file fills the fields rather than saving them: the preview below is the
   * review step, computed with the same function payroll pays on, and Save
   * Structure is the one place this organisation's split is written. An upload
   * that applied itself would put a consultant's spreadsheet onto every payslip
   * without anybody at the company having seen what it pays.
   */
  async function handleStructureFile(file: File | undefined) {
    setUploadNote('');
    setUploadError('');
    if (!file) {
      if (uploadInput.current) uploadInput.current.value = '';
      return;
    }
    try {
      const text = await file.text();
      const result = parseSalaryStructureCsv(text);
      if (!result.structure) {
        setUploadError(
          result.line === null ? result.error : `Line ${result.line}: ${result.error}`,
        );
        return;
      }
      setDirty(true);
      setForm(toForm(result.structure));
      setUploadNote(`Loaded from ${file.name}. Check the example below, then save it.`);
    } catch {
      setUploadError('That file could not be read. Save it as CSV and try again.');
    } finally {
      if (uploadInput.current) uploadInput.current.value = '';
    }
  }

  function handleTemplate() {
    // The organisation's own figures where it has some, so the file HR edits
    // starts from what is in force; the header alone where it has none, rather
    // than an invented split that could be saved unchanged.
    const current = getSalaryStructure();
    const rows = current
      ? [[current.basicPercent, current.hraPercent, current.medicalAllowance, current.conveyanceAllowance].join(',')]
      : [];
    const blob = new Blob([[SALARY_STRUCTURE_CSV_HEADER, ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'salary-structure.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleSave() {
    if (invalid || !complete) return;
    setDirty(false);
    setUploadNote('');
    save.track(saveSalaryStructure(parsed));
  }

  function handleClear() {
    setDirty(false);
    setUploadNote('');
    setUploadError('');
    setForm(toForm(null));
    // Cleared, not reset to a default: every breakdown in the organisation goes
    // back to saying the structure is not set.
    save.track(saveSalaryStructure(null));
  }

  const rows = preview
    ? [
        { label: 'Basic Salary', value: preview.basic, hint: `${parsed.basicPercent}% of gross` },
        { label: 'HRA', value: preview.hra, hint: `${parsed.hraPercent}% of gross` },
        { label: 'Medical Allowance', value: preview.medicalAllowance, hint: 'flat' },
        { label: 'Conveyance Allowance', value: preview.conveyanceAllowance, hint: 'flat' },
        { label: 'Special Allowance', value: preview.specialAllowance, hint: 'the remainder' },
      ]
    : [];

  return (
    <SettingsSection
      title="Salary Structure"
      subtitle="How this organisation splits a monthly gross into salary components"
      action={<SaveIndicator state={save.state} />}
    >
      <Card>
        <div className="space-y-6">
          <p className="text-sm text-ink-500">
            These apply to every payslip and compensation breakdown in your organisation, and to
            nobody else's. Special Allowance is not set here: it is whatever remains, so the
            components always add up to the month's gross exactly.
          </p>

          {!configured && (
            <div
              className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
              data-testid="salary-structure-unset"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              Your organisation has not set a salary structure. Until it does, no payslip or
              compensation page shows a component breakdown — gross and net pay are unaffected.
            </div>
          )}

          {/* Upload the four figures rather than typing them. The company's
              split usually arrives from payroll or an advisor as a sheet, and
              re-keying it is how a percentage ends up one digit out. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5" htmlFor="salary-structure-upload">
                Salary structure CSV
              </label>
              <input
                id="salary-structure-upload"
                ref={uploadInput}
                type="file"
                accept=".csv,text/csv"
                className="input w-full"
                aria-label="Organisation salary structure CSV"
                onChange={(event) => { void handleStructureFile(event.target.files?.[0]); }}
              />
              <p className="mt-1 text-xs text-ink-400">
                One row. Columns: <span className="font-mono">{SALARY_STRUCTURE_CSV_HEADER}</span>
              </p>
            </div>
            <div className="flex items-end">
              <Button variant="secondary" onClick={handleTemplate}>
                <Download size={14} /> Download current structure
              </Button>
            </div>
          </div>

          {uploadError && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {uploadError}
            </div>
          )}

          {uploadNote && (
            <div
              className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800"
              role="status"
              data-testid="salary-structure-uploaded"
            >
              {uploadNote}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5" htmlFor="salary-basic">
                Basic Salary (% of gross)
              </label>
              <input
                id="salary-basic"
                type="number"
                min={0}
                max={100}
                className="input w-full"
                aria-label="Basic percent"
                value={form.basicPercent}
                onChange={(event) => set('basicPercent', event.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5" htmlFor="salary-hra">
                HRA (% of gross)
              </label>
              <input
                id="salary-hra"
                type="number"
                min={0}
                max={100}
                className="input w-full"
                aria-label="HRA percent"
                value={form.hraPercent}
                onChange={(event) => set('hraPercent', event.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5" htmlFor="salary-medical">
                Medical Allowance (₹ per month)
              </label>
              <input
                id="salary-medical"
                type="number"
                min={0}
                className="input w-full"
                aria-label="Medical allowance"
                value={form.medicalAllowance}
                onChange={(event) => set('medicalAllowance', event.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5" htmlFor="salary-conveyance">
                Conveyance Allowance (₹ per month)
              </label>
              <input
                id="salary-conveyance"
                type="number"
                min={0}
                className="input w-full"
                aria-label="Conveyance allowance"
                value={form.conveyanceAllowance}
                onChange={(event) => set('conveyanceAllowance', event.target.value)}
              />
            </div>
          </div>

          {overspent && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              Basic and HRA come to {percentTotal}% of the gross. Together they cannot exceed 100%,
              or there is nothing left for the allowances.
            </div>
          )}

          {negative && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              Percentages and allowances cannot be negative. A salary component is an amount paid,
              not one taken back.
            </div>
          )}

          {/* The preview exists only once all four fields are filled: a partial
              form has no split to show, and inventing one from the blanks would
              be the default this page exists to avoid. */}
          {rows.length > 0 ? (
            <div className="rounded-xl border border-ink-100" data-testid="salary-structure-preview">
              <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2 text-xs font-semibold text-ink-600">
                <span>Example — a monthly gross of {formatINR(SAMPLE_MONTHLY_GROSS)}</span>
                <span>{formatINR(rows.reduce((sum, row) => sum + row.value, 0))}</span>
              </div>
              <ul className="divide-y divide-ink-50">
                {rows.map((row) => (
                  <li key={row.label} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="text-ink-700">{row.label}</span>
                    <span className="text-xs text-ink-400">{row.hint}</span>
                    <span className="ml-auto font-medium text-ink-900">{formatINR(row.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-ink-200 px-4 py-5 text-center text-sm text-ink-400">
              Fill in all four fields to see what they would pay on a{' '}
              {formatINR(SAMPLE_MONTHLY_GROSS)} monthly gross.
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={handleSave} disabled={invalid || !complete}>
              Save Structure
            </Button>
            {configured && (
              <Button variant="secondary" onClick={handleClear}>
                Clear structure
              </Button>
            )}
          </div>
        </div>
      </Card>
    </SettingsSection>
  );
}

// ===========================================================================
// Section: Per-employee salary structures
// ===========================================================================
/**
 * Upload the people whose split is not the organisation's own.
 *
 * A CSV rather than a form per person, for the same reason the leave exceptions
 * are one: the list arrives from offer letters or a revision cycle covering
 * dozens of people at once, and typing them back in one at a time is how they
 * end up wrong. Nothing is written until HR has seen which row went to whom,
 * what it replaces, and which rows could not be used.
 *
 * Unlike a leave exception, a row here carries the **whole** split — all four
 * figures, every time. Three of somebody's own numbers beside one of the
 * company's is a structure nobody negotiated; see EmployeeSalaryStructures.
 *
 * The heading avoids the words "salary structure": Playwright matches an
 * accessible name by substring, and a second heading containing that phrase
 * makes the section above it ambiguous to every spec that opens it.
 */
function describeStructure(structure: SalaryStructure): string {
  return [
    `${structure.basicPercent}% basic`,
    `${structure.hraPercent}% HRA`,
    `${formatINR(structure.medicalAllowance)} medical`,
    `${formatINR(structure.conveyanceAllowance)} conveyance`,
  ].join(' · ');
}

function EmployeeSalaryStructuresSection() {
  const save = useSaveIndicator();
  // Both the individual structures and the organisation's own are behind this
  // event, so an incoming hydration from Firestore re-renders what is shown.
  const revision = useSalaryStructureRevision();
  const directoryRevision = useEmployeeDirectoryRevision();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<SalaryStructureCsvResult | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const [readError, setReadError] = useState('');

  const structures = useMemo(() => getEmployeeSalaryStructures(), [revision]);
  const orgStructure = useMemo(() => getSalaryStructure(), [revision]);
  const directory = useMemo(() => getEmployeeDirectory(), [directoryRevision]);
  const byId = useMemo(() => new Map(directory.map((emp) => [emp.id, emp])), [directory]);

  function reset() {
    setResult(null);
    setFileName('');
    setReadError('');
    if (fileInput.current) fileInput.current.value = '';
  }

  async function handleFile(file: File | undefined) {
    setApplied(null);
    setReadError('');
    if (!file) { reset(); return; }
    try {
      const text = await file.text();
      setFileName(file.name);
      setResult(parseEmployeeSalaryStructureCsv(
        text,
        getEmployeeDirectory(),
        getEmployeeSalaryStructures(),
      ));
    } catch {
      reset();
      setReadError('That file could not be read. Save it as CSV and try again.');
    }
  }

  function handleApply() {
    if (!result || result.matched.length === 0) return;
    // Merged, not replaced: a file covering three people is a statement about
    // those three and says nothing about anyone already on their own structure.
    const next = { ...getEmployeeSalaryStructures() };
    for (const match of result.matched) next[match.employee.id] = match.structure;
    setApplied(result.matched.length);
    save.track(saveEmployeeSalaryStructures(next));
    reset();
  }

  function handleRemove(employeeId: string) {
    setApplied(null);
    // Back onto the organisation's structure, not onto nothing.
    save.track(setEmployeeSalaryStructure(employeeId, null));
  }

  function handleTemplate() {
    // Prefilled from the organisation's own split, so the figures in the file
    // are the ones being departed from rather than invented ones. Zeroes when
    // the organisation has not set one — a template cannot hand out a default
    // this app deliberately does not have.
    const code = directory[0]?.employeeCode ?? 'MC-001';
    const base = orgStructure ?? {
      basicPercent: 0, hraPercent: 0, medicalAllowance: 0, conveyanceAllowance: 0,
    };
    const row = [
      code,
      base.basicPercent,
      base.hraPercent,
      base.medicalAllowance,
      base.conveyanceAllowance,
    ].join(',');
    const blob = new Blob([[EMPLOYEE_SALARY_STRUCTURE_CSV_HEADER, row].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'employee-salary-structures.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  const entries = Object.entries(structures);

  return (
    <SettingsSection
      title="Custom splits for individual employees"
      subtitle="Anyone whose salary is divided differently from the organisation's own"
      action={<SaveIndicator state={save.state} />}
    >
      <Card>
        <div className="space-y-5">
          <p className="text-sm text-ink-500">
            Upload a CSV of exceptions. Each row is one person, matched by employee code, and
            carries the whole split — all four figures, every time. Everyone not listed is paid on
            the structure above. Gross and net pay are unaffected either way: only how the month's
            pay is divided into components changes. Nothing is saved until you have seen the match
            list.
          </p>

          {!orgStructure && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              Your organisation has not set a structure of its own. Anyone you upload here gets a
              component breakdown; everyone else keeps showing "not set".
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5" htmlFor="salary-structure-csv">
                Salary structures CSV
              </label>
              <input
                id="salary-structure-csv"
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="input w-full"
                aria-label="Employee salary structures CSV"
                onChange={(event) => { void handleFile(event.target.files?.[0]); }}
              />
              <p className="mt-1 text-xs text-ink-400">
                Columns: <span className="font-mono">{EMPLOYEE_SALARY_STRUCTURE_CSV_HEADER}</span>
              </p>
            </div>
            <div className="flex items-end">
              <Button variant="secondary" onClick={handleTemplate}>
                <Download size={14} /> Download template
              </Button>
            </div>
          </div>

          {readError && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {readError}
            </div>
          )}

          {applied !== null && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
              {applied} custom salary structure{applied === 1 ? '' : 's'} saved for your organisation.
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="rounded-xl border border-ink-100" data-testid="salary-structure-csv-matched">
                <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2 text-xs font-semibold text-ink-600">
                  <span>From {fileName} — matched to an employee</span>
                  <span data-testid="salary-structure-csv-matched-count">{result.matched.length}</span>
                </div>
                {result.matched.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-ink-400">
                    No row in this file names an employee code this organisation uses, with a
                    complete split beside it.
                  </p>
                ) : (
                  <ul className="divide-y divide-ink-50">
                    {result.matched.map((match) => (
                      <li
                        key={match.employee.id}
                        className="flex items-center gap-3 px-4 py-2.5"
                        data-testid="salary-structure-csv-match"
                        data-employee-code={match.employee.employeeCode}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">
                            {match.employee.fullName}
                          </p>
                          <p className="truncate text-xs text-ink-400">
                            {match.employee.employeeCode} · {describeStructure(match.structure)}
                          </p>
                        </div>
                        <span className="ml-auto shrink-0 text-xs">
                          {match.replaces ? (
                            <span className="inline-flex items-center gap-1 text-amber-700">
                              <RefreshCw size={12} /> replaces existing
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 size={12} /> new
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Listed, never dropped: a row silently ignored looks exactly like
                  a row applied, and the person it named goes on being paid on
                  the organisation's split. */}
              {result.unmatched.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50">
                  <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-2 text-xs font-semibold text-amber-800">
                    <AlertTriangle size={13} />
                    Not applied
                    <span className="ml-auto" data-testid="salary-structure-csv-unmatched-count">
                      {result.unmatched.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-amber-100">
                    {result.unmatched.map((miss) => (
                      <li key={miss.line} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                        <span className="shrink-0 text-xs text-amber-700">Line {miss.line}</span>
                        <span className="truncate font-mono text-xs text-ink-800">{miss.text}</span>
                        <span className="ml-auto shrink-0 text-xs text-amber-800">{miss.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button variant="primary" onClick={handleApply} disabled={result.matched.length === 0}>
                  <Upload size={14} /> Save {result.matched.length} structure
                  {result.matched.length === 1 ? '' : 's'}
                </Button>
                <Button variant="secondary" onClick={reset}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-ink-100" data-testid="employee-salary-structures">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2 text-xs font-semibold text-ink-600">
              <span>Employees on their own structure</span>
              <span data-testid="employee-salary-structure-count">{entries.length}</span>
            </div>
            {entries.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-400">
                Nobody yet — everyone is paid on the organisation's structure.
              </p>
            ) : (
              <ul className="divide-y divide-ink-50">
                {entries.map(([employeeId, structure]) => {
                  const employee = byId.get(employeeId);
                  const name = employee ? employee.fullName : employeeId;
                  return (
                    <li
                      key={employeeId}
                      className="flex items-start gap-3 px-4 py-2.5"
                      data-testid="employee-salary-structure"
                      data-employee-id={employeeId}
                    >
                      <div className="min-w-0">
                        {/* An id rather than a name when the record has been
                            deleted: the structure is still stored and still
                            removable, and hiding it would strand it. */}
                        <p className="truncate text-sm font-medium text-ink-900">{name}</p>
                        <p className="text-xs text-ink-400">
                          {employee ? `${employee.employeeCode} · ` : 'No employee record · '}
                          {describeStructure(structure)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="ml-auto shrink-0 rounded-lg p-1.5 text-ink-400 hover:bg-ink-50 hover:text-rose-600"
                        aria-label={`Remove custom salary structure for ${name}`}
                        onClick={() => handleRemove(employeeId)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Card>
    </SettingsSection>
  );
}

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'company', label: 'Company Profile', icon: <Building2 size={17} />, description: 'Brand, legal & contact info' },
  { id: 'departments', label: 'Departments', icon: <Users size={17} />, description: 'Org structure & heads' },
  { id: 'locations', label: 'Locations', icon: <MapPin size={17} />, description: 'Where the company works' },
  { id: 'leave', label: 'Leave Policies', icon: <CalendarDays size={17} />, description: 'Quotas & carry-forward' },
  { id: 'salary', label: 'Salary Structure', icon: <Wallet size={17} />, description: 'Basic, HRA & allowances' },
  { id: 'roles', label: 'Roles & Permissions', icon: <Shield size={17} />, description: 'Access control matrix' },
  { id: 'holidays', label: 'Holidays', icon: <CalendarDays size={17} />, description: 'Holiday calendar' },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={17} />, description: 'Alert preferences' },
  { id: 'integrations', label: 'Integrations', icon: <Plug size={17} />, description: 'Third-party connections' },
  { id: 'billing', label: 'Billing', icon: <CreditCard size={17} />, description: 'Plan & payments' },
  { id: 'database', label: 'Database', icon: <Database size={17} />, description: 'Firestore seed & config' },
];

// ===========================================================================
// Main page
// ===========================================================================
export function SettingsPage() {
  const location = useLocation();
  useEmployeeDirectoryRevision();
  const billingRevision = useBillingPreferencesRevision();
  const billingPreferences = getBillingPreferences();
  const [active, setActive] = useState('company');
  const [billingUpgradeRequestToken, setBillingUpgradeRequestToken] = useState(0);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const queryTab = query.get('tab');
    const queryAction = query.get('action');

    if (queryTab && NAV_ITEMS.some((item) => item.id === queryTab)) {
      setActive(queryTab);
    }

    if (queryAction === 'upgrade-plan') {
      setActive('billing');
      setBillingUpgradeRequestToken((prev) => prev + 1);
    }

    const state = location.state as { settingsTab?: string; billingAction?: string } | null;
    if (!state) return;

    if (state.settingsTab && NAV_ITEMS.some((item) => item.id === state.settingsTab)) {
      setActive(state.settingsTab);
    }

    if (state.billingAction === 'upgrade-plan') {
      setActive('billing');
      setBillingUpgradeRequestToken((prev) => prev + 1);
    }
  }, [location.search, location.state]);
  void billingRevision;

  function renderContent() {
    switch (active) {
      case 'company': return <CompanyProfile />;
      case 'departments': return <DepartmentsSection />;
      case 'locations': return <LocationsSection />;
      case 'leave': return (
        <>
          <LeavePolicies />
          <EmployeeLeavePoliciesSection />
        </>
      );
      case 'salary': return (
        <>
          <SalaryStructureSection />
          <EmployeeSalaryStructuresSection />
        </>
      );
      case 'roles': return <RolesPermissions />;
      case 'holidays': return <HolidaysSection />;
      case 'notifications': return <NotificationsSection />;
      case 'integrations': return <IntegrationsSection />;
      case 'billing': return <BillingSection upgradeRequestToken={billingUpgradeRequestToken} />;
      case 'database': return <DatabaseSection />;
      default: return null;
    }
  }

  const current = NAV_ITEMS.find((n) => n.id === active);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage your workspace, policies, and platform configuration"
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="green" dot>All systems operational</Badge>
          </div>
        }
      />

      <div className="flex gap-6 items-start">
        {/* Left nav */}
        <aside className="w-56 shrink-0 sticky top-6">
          <Card padding={false}>
            <nav className="py-2">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors rounded-none',
                    active === item.id
                      ? 'bg-brand-50 text-brand-700 border-r-2 border-brand-600'
                      : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                  )}
                >
                  <span className={cn('shrink-0', active === item.id ? 'text-brand-600' : 'text-ink-400')}>
                    {item.icon}
                  </span>
                  <div className="min-w-0">
                    <p className={cn('text-sm font-medium truncate', active === item.id ? 'text-brand-700' : 'text-ink-800')}>
                      {item.label}
                    </p>
                    <p className="text-xs text-ink-400 truncate">{item.description}</p>
                  </div>
                  {active === item.id && (
                    <ChevronRight size={14} className="ml-auto shrink-0 text-brand-500" />
                  )}
                </button>
              ))}
            </nav>
            {/* Footer info */}
            <div className="border-t border-ink-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-600 to-violet-600 flex items-center justify-center">
                  <span className="text-white text-xs font-black">MC</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink-800 truncate">ModCon HR</p>
                  <p className="text-[10px] text-ink-400">
                    {billingPreferences.planTier} Plan · {billingPreferences.planTier === 'Enterprise' ? 'Unlimited seats' : `${billingPreferences.totalSeats} seats`}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </aside>

        {/* Right content */}
        <main className="flex-1 min-w-0">
          {/* Breadcrumb strip */}
          {current && (
            <div className="flex items-center gap-2 text-sm text-ink-500 mb-5">
              <span className="text-ink-400">Settings</span>
              <ChevronRight size={14} className="text-ink-300" />
              <span className="font-medium text-ink-800">{current.label}</span>
            </div>
          )}
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
