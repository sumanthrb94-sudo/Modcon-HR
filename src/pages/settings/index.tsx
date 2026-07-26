import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Building2, Users, CalendarDays, Shield, Bell,
  Plug, CreditCard, ChevronRight, Check, X,
  Plus, Edit2, Zap, ToggleLeft, ToggleRight,
  Slack, Chrome, Package, Code2, Leaf,
  AlertCircle, CheckCircle2, Star, Database, Trash2,
} from 'lucide-react';
import {
  PageHeader, Card, CardHeader, Badge, Button, Table, Modal,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { Select } from '@/components/ui';
import { employees } from '@/data/employees';
import { getDepartmentDirectory, addDepartmentToDirectory, updateDepartmentInDirectory, deleteDepartmentFromDirectory, renameDepartmentInDirectory, getDepartmentRecord } from '@/data/departments';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { useDepartmentDirectoryRevision } from '@/lib/useDepartmentDirectoryRevision';
import { getLeavePolicies, saveLeavePolicies, type LeavePolicy } from '@/data/leavePolicies';
import { useLeavePoliciesRevision } from '@/lib/useLeavePoliciesRevision';
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
import { cn, formatDate, formatWeekdayLong } from '@/lib/utils';
import type { BadgeTone } from '@/components/ui';
import { seedFirestore, purgeSeededFirestoreData } from '@/lib/seed';
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
  return (
    <div>
      <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      <input
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
function SettingsSection({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ===========================================================================
// Section: Company Profile
// ===========================================================================
function CompanyProfile() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({
    name: 'ModCon Technologies Pvt Ltd',
    legalName: 'ModCon Technologies Private Limited',
    industry: 'SaaS / HR Tech',
    founded: '2019',
    hq: 'Bengaluru, Karnataka',
    website: 'https://modcon.io',
    gstin: '29AACCM1234F1Z5',
    cin: 'U72900KA2019PTC12345',
    employeeCount: String(employees.length),
    supportEmail: 'hr@modcon.io',
    phone: '+91 80 4567 8900',
  });
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedLogo = window.localStorage.getItem(orgScopedKey(COMPANY_LOGO_STORAGE_KEY));
      if (storedLogo) setLogoDataUrl(storedLogo);
    } catch {
      // Ignore storage errors and fall back to the default logo.
    }
  }, []);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      employeeCount: String(employees.length),
    }));
  }, [employees.length]);

  const update = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
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
    <SettingsSection title="Company Profile" subtitle="Core organisational information shown across the platform.">
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
            <p className="font-semibold text-ink-900 text-lg">{form.name}</p>
            <p className="text-sm text-ink-500 mt-0.5">{form.industry} · Founded {form.founded}</p>
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
          <Field label="Employee Count" value={form.employeeCount} onChange={update('employeeCount')} disabled />
          <Field label="Support Email" value={form.supportEmail} onChange={update('supportEmail')} type="email" />
          <Field label="Contact Phone" value={form.phone} onChange={update('phone')} />
        </div>

        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-ink-100">
          <Button variant="primary" onClick={handleSave} icon={saved ? <CheckCircle2 size={15} /> : undefined}>
            {saved ? 'Saved!' : 'Save Changes'}
          </Button>
          <Button variant="ghost">Discard</Button>
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

function DepartmentsSection() {
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

    addDepartmentToDirectory({
      name,
      head: head || '—',
      headcount: headcountValue,
      ...(newDeptTracksOpenRoles ? {} : { openRolesOverride: openRolesValue }),
    });
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

    updateDepartmentInDirectory({
      name,
      head: head || '—',
      headcount: headcountValue,
      ...(editingDeptTracksOpenRoles ? {} : { openRolesOverride: openRolesValue }),
    });
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
    deleteDepartmentFromDirectory(row.name);
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
    <SettingsSection title="Departments" subtitle="Manage organisational units, department heads, and open headcount.">
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
          <Field
            label="Department Head"
            value={newDeptHead}
            onChange={(v) => {
              setNewDeptHead(v);
              setAddError('');
            }}
            hint="Optional"
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
          <Field
            label="Department Head"
            value={editingDeptHead}
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
  const [editingApplicable, setEditingApplicable] = useState('All employees');
  const [editingCarryForward, setEditingCarryForward] = useState(false);
  const [editingEncashment, setEditingEncashment] = useState(false);
  const [editingHalfDay, setEditingHalfDay] = useState(true);
  const [newType, setNewType] = useState('');
  const [newAnnual, setNewAnnual] = useState('12');
  const [newApplicable, setNewApplicable] = useState('All employees');
  const [newCarryForward, setNewCarryForward] = useState(false);
  const [newEncashment, setNewEncashment] = useState(false);
  const [newHalfDay, setNewHalfDay] = useState(true);
  const [addError, setAddError] = useState('');
  const [editError, setEditError] = useState('');

  useEffect(() => {
    setPolicies(getLeavePolicies());
  }, [leavePoliciesRevision]);

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
      annual: annualQuota,
      carryForward: newCarryForward,
      encashment: newEncashment,
      halfDay: newHalfDay,
      applicable: newApplicable.trim() || 'All employees',
    };
    const updated = [...policies, next];
    saveLeavePolicies(updated);
    setPolicies(updated);
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
            annual: annualQuota,
            applicable: editingApplicable.trim() || 'All employees',
            carryForward: editingCarryForward,
            encashment: editingEncashment,
            halfDay: editingHalfDay,
          }
        : policy
    ));
    saveLeavePolicies(updated);
    setPolicies(updated);
    setEditOpen(false);
    resetEditForm();
  }

  const toggle = (id: string, key: 'carryForward' | 'encashment' | 'halfDay') => {
    const updated = policies.map((policy) => (policy.id === id ? { ...policy, [key]: !policy[key] } : policy));
    saveLeavePolicies(updated);
    setPolicies(updated);
  };

  const cols: Column<LeavePolicy>[] = [
    {
      key: 'type',
      header: 'Leave Type',
      render: (r) => <span className="font-medium text-ink-900">{r.type}</span>,
    },
    {
      key: 'annual',
      header: 'Annual Quota',
      align: 'center',
      render: (r) => (
        <span className="font-semibold text-ink-800">
          {r.annual === 0 ? 'Unlimited' : `${r.annual} days`}
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
      render: (r) => <Button variant="ghost" size="sm" icon={<Edit2 size={13} />} onClick={() => openEditPolicy(r)}>Edit</Button>,
    },
  ];

  return (
    <SettingsSection title="Leave Policies" subtitle="Configure leave types, quotas, and carry-forward rules.">
      <Card padding={false}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <p className="text-sm text-ink-500">Click toggles to update policies</p>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add Leave Type</Button>
        </div>
        <Table columns={cols} data={policies} keyExtractor={(r) => r.id} />
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
    savePermissionMatrix(updated);
    setPerms(updated);
  };

  const resetToDefaults = () => {
    savePermissionMatrix(defaultPermissions);
    setPerms(defaultPermissions);
  };

  const cycleHint = 'Define what each role can access. Click any cell to cycle: Full -> View -> None.';

  const roleUserCount = (role: AppRole) => employees.filter((employee) =>
    role === 'Admin'
      ? employee.designation.includes('CEO') || employee.designation.includes('Head of Finance')
      : role === 'HR Manager'
        ? employee.department === 'Human Resources'
        : role === 'Manager'
          ? employee.designation.toLowerCase().includes('manager')
            || employee.designation.toLowerCase().includes('vp')
            || employee.designation.toLowerCase().includes('lead')
          : true,
  ).length;

  return (
    <SettingsSection title="Roles & Permissions" subtitle={cycleHint}>
      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <p>
          Only <strong>Admin</strong> and <strong>Employee</strong> can currently be assigned to a real
          account (see the Admin dashboard&apos;s Role column). <strong>HR Manager</strong> and{' '}
          <strong>Manager</strong> permissions configured below are not yet enforced for any signed-in
          user — the &quot;users&quot; counts shown are an estimate based on job title/department, not an
          active assignment.
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
                    <div className="flex flex-col items-center gap-1">
                      <span>{role}</span>
                      <Badge
                        tone={role === 'Admin' ? 'violet' : role === 'HR Manager' ? 'blue' : role === 'Manager' ? 'amber' : 'gray'}
                        className="text-[10px] px-2 py-0"
                      >
                        {roleUserCount(role)} users
                      </Badge>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {APP_MODULES.map((module) => (
                <tr key={module} className="hover:bg-ink-50">
                  <td className="px-5 py-3 font-medium text-ink-800">{module}</td>
                  {APP_ROLES.map((role) => (
                    <td key={role} className="px-4 py-3 text-center">
                      <button
                        title={`${module} / ${role}: ${perms[module][role]} - click to change`}
                        onClick={() => cycle(module, role)}
                        className={cn('inline-flex items-center justify-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors hover:bg-ink-100', permColor[perms[module][role]])}
                      >
                        <PermIcon level={perms[module][role]} />
                        <span className="capitalize">{perms[module][role]}</span>
                      </button>
                    </td>
                  ))}
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
    saveHolidayDirectory(updatedRows);
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
    saveHolidayDirectory(updatedRows);
    setHolidayRows(updatedRows);
    setEditOpen(false);
    resetEditForm();
  }

  function handleDeleteHoliday(holiday: Holiday) {
    const confirmed = window.confirm(`Delete ${holiday.name} (${formatDate(holiday.date)})?`);
    if (!confirmed) return;

    const updatedRows = holidayRows.filter((row) => row.id !== holiday.id);
    saveHolidayDirectory(updatedRows);
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
    <SettingsSection title="Holidays" subtitle="Manage the holiday calendar visible to all employees.">
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
  const notificationRevision = useNotificationPreferencesRevision();
  const [notifs, setNotifs] = useState<NotificationPreference[]>(() => getNotificationPreferences());

  useEffect(() => {
    setNotifs(getNotificationPreferences());
  }, [notificationRevision]);

  const toggle = (id: string, key: 'email' | 'inApp') => {
    const updated = notifs.map((notif) => (notif.id === id ? { ...notif, [key]: !notif[key] } : notif));
    saveNotificationPreferences(updated);
    setNotifs(updated);
  };

  const categories = Array.from(new Set(notifs.map((n) => n.category)));

  return (
    <SettingsSection title="Notification Preferences" subtitle="Control which events trigger email and in-app notifications.">
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
    saveIntegrationPreferences(updated.map(({ id: integrationId, connected, badge }) => ({ id: integrationId, connected, badge })));
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
    saveIntegrationPreferences(updated.map(({ id: integrationId, connected, badge }) => ({ id: integrationId, connected, badge })));
    setIntegrations(updated);
    setConfigureOpen(false);
    setEditingIntegration(null);
    setConfigLabel('');
    setConfigError('');
  };

  const categories = Array.from(new Set(integrations.map((i) => i.category)));

  return (
    <SettingsSection title="Integrations" subtitle="Connect ModCon HR with your existing tools and data sources.">
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

  async function handleSeed() {
    setStatus('running');
    setLogs([]);
    try {
      await seedFirestore((msg) => setLogs((prev) => [...prev, msg]));
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
    setResetStatus('running');
    setResetLogs([]);
    try {
      // Firestore's employees/jobs/payroll/expenses collections aren't
      // org-scoped — they still belong solely to the default/legacy org.
      // A non-default org (created via super-admin Organizations) doesn't
      // own that data, so purging it here would destroy someone else's real
      // records. Only the default org's admin can trigger the Firestore purge;
      // every org still gets its own local-overlay reset.
      if (getActiveOrgKey() === DEFAULT_ORG_KEY) {
        await purgeSeededFirestoreData((msg) => setResetLogs((prev) => [...prev, msg]));
      } else {
        setResetLogs((prev) => [...prev, 'Skipped Firestore purge — this organization does not own the shared Firestore collections.']);
      }
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

  return (
    <SettingsSection
      title="Firestore Database"
      subtitle="Seed Firestore with the built-in mock data. Safe to re-run — existing documents are overwritten."
    >
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

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'company', label: 'Company Profile', icon: <Building2 size={17} />, description: 'Brand, legal & contact info' },
  { id: 'departments', label: 'Departments', icon: <Users size={17} />, description: 'Org structure & heads' },
  { id: 'leave', label: 'Leave Policies', icon: <CalendarDays size={17} />, description: 'Quotas & carry-forward' },
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
      case 'leave': return <LeavePolicies />;
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
