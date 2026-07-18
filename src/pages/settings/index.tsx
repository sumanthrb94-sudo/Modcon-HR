import { useState, type ReactNode } from 'react';
import {
  Building2, Users, CalendarDays, Shield, Bell,
  Plug, CreditCard, ChevronRight, Check, X,
  Plus, Edit2, Zap, ToggleLeft, ToggleRight,
  Slack, Chrome, Package, Code2, Leaf,
  AlertCircle, CheckCircle2, Star, Database,
} from 'lucide-react';
import {
  PageHeader, Card, CardHeader, Badge, Button, Table,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { departments, employees } from '@/data/employees';
import { holidays } from '@/data/common';
import { formatDate, cn } from '@/lib/utils';
import type { BadgeTone } from '@/components/ui';
import { seedFirestore } from '@/lib/seed';

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
  const [saved, setSaved] = useState(false);

  const update = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <SettingsSection title="Company Profile" subtitle="Core organisational information shown across the platform.">
      <Card>
        {/* Logo block */}
        <div className="flex items-center gap-5 pb-6 mb-6 border-b border-ink-100">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-brand-600 to-violet-600 flex items-center justify-center shrink-0 shadow-md">
            <span className="text-white text-2xl font-black tracking-tighter">MC</span>
          </div>
          <div>
            <p className="font-semibold text-ink-900 text-lg">{form.name}</p>
            <p className="text-sm text-ink-500 mt-0.5">{form.industry} · Founded {form.founded}</p>
            <div className="flex gap-2 mt-2">
              <Button variant="secondary" size="sm" icon={<Edit2 size={13} />}>
                Change Logo
              </Button>
              <Button variant="ghost" size="sm">Remove</Button>
            </div>
          </div>
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
}

const DEPT_HEADS: Record<string, string> = {
  Engineering: 'Diya Mehta',
  Product: 'Rohan Iyer',
  Design: 'Kavya Menon',
  Sales: 'Vikram Nair',
  Marketing: 'Neha Chopra',
  'Human Resources': 'Ananya Reddy',
  Finance: 'Priya Kapoor',
  Operations: 'Harsh Mehra',
  'Customer Success': 'Gaurav Sinha',
  Legal: 'Shreya Desai',
};

function DepartmentsSection() {
  const deptRows: DeptRow[] = departments.map((d) => ({
    name: d,
    head: DEPT_HEADS[d] ?? '—',
    headcount: employees.filter((e) => e.department === d).length,
    openRoles: [2, 1, 0, 3, 1, 0, 0, 1, 2, 0][departments.indexOf(d)] ?? 0,
  }));

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
      render: (r) => r.openRoles > 0
        ? <Badge tone="amber">{r.openRoles} open</Badge>
        : <span className="text-ink-400 text-xs">—</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: () => (
        <Button variant="ghost" size="sm" icon={<Edit2 size={13} />}>Edit</Button>
      ),
    },
  ];

  return (
    <SettingsSection title="Departments" subtitle="Manage organisational units, department heads, and open headcount.">
      <Card padding={false}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <p className="text-sm text-ink-500">{deptRows.length} departments configured</p>
          <Button variant="primary" size="sm" icon={<Plus size={14} />}>Add Department</Button>
        </div>
        <Table columns={cols} data={deptRows} keyExtractor={(r) => r.name} />
      </Card>
    </SettingsSection>
  );
}

// ===========================================================================
// Section: Leave Policies
// ===========================================================================
interface LeavePolicy {
  id: string;
  type: string;
  annual: number;
  carryForward: boolean;
  encashment: boolean;
  halfDay: boolean;
  applicable: string;
}

const defaultPolicies: LeavePolicy[] = [
  { id: 'lp1', type: 'Casual Leave', annual: 12, carryForward: false, encashment: false, halfDay: true, applicable: 'All employees' },
  { id: 'lp2', type: 'Sick Leave', annual: 12, carryForward: false, encashment: false, halfDay: true, applicable: 'All employees' },
  { id: 'lp3', type: 'Earned Leave', annual: 18, carryForward: true, encashment: true, halfDay: true, applicable: 'All employees' },
  { id: 'lp4', type: 'Unpaid Leave', annual: 0, carryForward: false, encashment: false, halfDay: false, applicable: 'All employees' },
  { id: 'lp5', type: 'Maternity Leave', annual: 182, carryForward: false, encashment: false, halfDay: false, applicable: 'Female employees' },
  { id: 'lp6', type: 'Paternity Leave', annual: 5, carryForward: false, encashment: false, halfDay: false, applicable: 'Male employees' },
  { id: 'lp7', type: 'Comp Off', annual: 0, carryForward: true, encashment: false, halfDay: false, applicable: 'All employees' },
];

function LeavePolicies() {
  const [policies, setPolicies] = useState(defaultPolicies);

  const toggle = (id: string, key: 'carryForward' | 'encashment' | 'halfDay') => {
    setPolicies((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [key]: !p[key] } : p)),
    );
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
      render: () => <Button variant="ghost" size="sm" icon={<Edit2 size={13} />}>Edit</Button>,
    },
  ];

  return (
    <SettingsSection title="Leave Policies" subtitle="Configure leave types, quotas, and carry-forward rules.">
      <Card padding={false}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <p className="text-sm text-ink-500">Click toggles to update policies</p>
          <Button variant="primary" size="sm" icon={<Plus size={14} />}>Add Leave Type</Button>
        </div>
        <Table columns={cols} data={policies} keyExtractor={(r) => r.id} />
      </Card>
    </SettingsSection>
  );
}

// ===========================================================================
// Section: Roles & Permissions
// ===========================================================================
const ROLES = ['Admin', 'HR Manager', 'Manager', 'Employee'] as const;
type Role = typeof ROLES[number];

const MODULES = [
  'Employee Directory',
  'Attendance',
  'Leave Management',
  'Payroll',
  'Recruitment',
  'Onboarding',
  'Performance',
  'Expenses',
  'Reports & Analytics',
  'Settings',
] as const;
type Module = typeof MODULES[number];

type PermissionLevel = 'full' | 'view' | 'none';

const defaultPerms: Record<Module, Record<Role, PermissionLevel>> = {
  'Employee Directory': { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'view' },
  Attendance:          { Admin: 'full', 'HR Manager': 'full', Manager: 'full', Employee: 'view' },
  'Leave Management':  { Admin: 'full', 'HR Manager': 'full', Manager: 'full', Employee: 'full' },
  Payroll:             { Admin: 'full', 'HR Manager': 'full', Manager: 'none', Employee: 'view' },
  Recruitment:         { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'none' },
  Onboarding:          { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'view' },
  Performance:         { Admin: 'full', 'HR Manager': 'full', Manager: 'full', Employee: 'view' },
  Expenses:            { Admin: 'full', 'HR Manager': 'view', Manager: 'view', Employee: 'full' },
  'Reports & Analytics': { Admin: 'full', 'HR Manager': 'full', Manager: 'view', Employee: 'none' },
  Settings:            { Admin: 'full', 'HR Manager': 'none', Manager: 'none', Employee: 'none' },
};

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
  const [perms, setPerms] = useState(defaultPerms);

  const cycle = (mod: Module, role: Role) => {
    setPerms((prev) => ({
      ...prev,
      [mod]: {
        ...prev[mod],
        [role]: permCycle[prev[mod][role]],
      },
    }));
  };

  const PermIcon = ({ level }: { level: PermissionLevel }) => {
    if (level === 'full') return <CheckCircle2 size={18} className="text-emerald-500" />;
    if (level === 'view') return <AlertCircle size={18} className="text-amber-400" />;
    return <X size={18} className="text-ink-200" />;
  };

  return (
    <SettingsSection title="Roles & Permissions" subtitle="Define what each role can access. Click any cell to cycle: Full → View → None.">
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200">
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wide w-52">Module</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-4 py-3 text-center text-xs font-semibold text-ink-500 uppercase tracking-wide">
                    <div className="flex flex-col items-center gap-1">
                      <span>{r}</span>
                      <Badge
                        tone={r === 'Admin' ? 'violet' : r === 'HR Manager' ? 'blue' : r === 'Manager' ? 'amber' : 'gray'}
                        className="text-[10px] px-2 py-0"
                      >
                        {employees.filter((e) =>
                          r === 'Admin' ? e.designation.includes('CEO') || e.designation.includes('Head of Finance') :
                          r === 'HR Manager' ? e.department === 'Human Resources' :
                          r === 'Manager' ? e.designation.toLowerCase().includes('manager') || e.designation.toLowerCase().includes('vp') || e.designation.toLowerCase().includes('lead') :
                          true
                        ).length} users
                      </Badge>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {MODULES.map((mod) => (
                <tr key={mod} className="hover:bg-ink-50">
                  <td className="px-5 py-3 font-medium text-ink-800">{mod}</td>
                  {ROLES.map((role) => (
                    <td key={role} className="px-4 py-3 text-center">
                      <button
                        title={`${mod} / ${role}: ${perms[mod][role]} — click to change`}
                        onClick={() => cycle(mod, role)}
                        className={cn('inline-flex items-center justify-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors hover:bg-ink-100', permColor[perms[mod][role]])}
                      >
                        <PermIcon level={perms[mod][role]} />
                        <span className="capitalize">{perms[mod][role]}</span>
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-ink-100 flex items-center gap-6 text-xs text-ink-500">
          <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-emerald-500" /> Full access</span>
          <span className="flex items-center gap-1.5"><AlertCircle size={14} className="text-amber-400" /> View only</span>
          <span className="flex items-center gap-1.5"><X size={14} className="text-ink-300" /> No access</span>
        </div>
      </Card>
    </SettingsSection>
  );
}

// ===========================================================================
// Section: Holidays
// ===========================================================================
function HolidaysSection() {
  const typeTone: Record<string, BadgeTone> = {
    National: 'green',
    Regional: 'amber',
    Optional: 'blue',
  };

  const cols: Column<typeof holidays[0]>[] = [
    { key: 'name', header: 'Holiday', render: (r) => <span className="font-medium text-ink-900">{r.name}</span> },
    { key: 'date', header: 'Date', render: (r) => <span className="text-ink-600">{formatDate(r.date)}</span> },
    {
      key: 'day',
      header: 'Day',
      render: (r) => (
        <span className="text-ink-500">
          {new Date(r.date).toLocaleDateString('en-IN', { weekday: 'long' })}
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
      render: () => <Button variant="ghost" size="sm" icon={<Edit2 size={13} />}>Edit</Button>,
    },
  ];

  return (
    <SettingsSection title="Holidays" subtitle="Manage the holiday calendar visible to all employees.">
      <Card padding={false}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div className="flex items-center gap-4">
            <p className="text-sm text-ink-500">{holidays.length} holidays — FY 2026</p>
            <div className="flex gap-2">
              <Badge tone="green">National</Badge>
              <Badge tone="amber">Regional</Badge>
              <Badge tone="blue">Optional</Badge>
            </div>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />}>Add Holiday</Button>
        </div>
        <Table columns={cols} data={holidays} keyExtractor={(r) => r.id} />
      </Card>
    </SettingsSection>
  );
}

// ===========================================================================
// Section: Notifications
// ===========================================================================
interface NotifPref {
  id: string;
  category: string;
  label: string;
  description: string;
  email: boolean;
  inApp: boolean;
}

const defaultNotifs: NotifPref[] = [
  { id: 'n1', category: 'Leave', label: 'Leave Request Submitted', description: 'Notify manager when employee submits a leave request', email: true, inApp: true },
  { id: 'n2', category: 'Leave', label: 'Leave Approved / Rejected', description: 'Notify employee when their leave status changes', email: true, inApp: true },
  { id: 'n3', category: 'Payroll', label: 'Payroll Processed', description: 'Notify employees when salary is processed', email: true, inApp: false },
  { id: 'n4', category: 'Payroll', label: 'Payslip Generated', description: 'Send payslip download link to employees', email: true, inApp: true },
  { id: 'n5', category: 'Attendance', label: 'Late Arrival Alert', description: 'Notify manager if employee clocks in after shift start', email: false, inApp: true },
  { id: 'n6', category: 'Attendance', label: 'Absent Without Approval', description: 'Alert HR and manager for unapproved absences', email: true, inApp: true },
  { id: 'n7', category: 'Onboarding', label: 'New Employee Joined', description: 'Broadcast welcome message on new joiner start date', email: true, inApp: true },
  { id: 'n8', category: 'Onboarding', label: 'Task Deadline Reminder', description: 'Remind assignees of pending onboarding tasks', email: false, inApp: true },
  { id: 'n9', category: 'Performance', label: 'Review Cycle Started', description: 'Notify employees when a new performance cycle is initiated', email: true, inApp: true },
  { id: 'n10', category: 'Performance', label: 'Review Due Reminder', description: 'Remind managers to complete overdue reviews', email: true, inApp: true },
  { id: 'n11', category: 'Recruitment', label: 'New Application Received', description: 'Notify hiring manager on new candidate application', email: false, inApp: true },
  { id: 'n12', category: 'Recruitment', label: 'Offer Letter Accepted', description: 'Alert HR team when candidate accepts an offer', email: true, inApp: true },
];

function NotificationsSection() {
  const [notifs, setNotifs] = useState(defaultNotifs);

  const toggle = (id: string, key: 'email' | 'inApp') => {
    setNotifs((prev) =>
      prev.map((n) => (n.id === id ? { ...n, [key]: !n[key] } : n)),
    );
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
  const [integrations, setIntegrations] = useState(defaultIntegrations);

  const toggleConnect = (id: string) => {
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, connected: !i.connected, badge: !i.connected ? 'Connected' : undefined }
          : i,
      ),
    );
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
                        <Button variant="ghost" size="sm" icon={<Edit2 size={13} />}>Configure</Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </SettingsSection>
  );
}

// ===========================================================================
// Section: Billing
// ===========================================================================
function BillingSection() {
  const usedSeats = employees.length;
  const totalSeats = 60;
  const usedPct = Math.round((usedSeats / totalSeats) * 100);

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
      {/* Current plan card */}
      <Card className="mb-5 border-2 border-brand-200 bg-gradient-to-br from-brand-50 to-violet-50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-brand-600 flex items-center justify-center">
              <Star size={22} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-ink-900 text-lg">ModCon HR Pro</span>
                <Badge tone="violet">Active</Badge>
              </div>
              <p className="text-sm text-ink-500">Billed annually · ₹4,999/seat/year</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">Manage Subscription</Button>
            <Button variant="ghost" size="sm">View Invoices</Button>
          </div>
        </div>
      </Card>

      {/* Usage + next invoice */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {/* Seat usage */}
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
                ? 'You\'re nearly at capacity. Upgrade to add more seats.'
                : 'Consider upgrading soon to avoid disruption.'}
            </div>
          )}
          <Button variant="primary" size="sm" className="mt-3">Add Seats</Button>
        </Card>

        {/* Next invoice */}
        <Card>
          <CardHeader title="Next Invoice" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-500">Pro Plan (60 seats)</span>
              <span className="font-semibold">₹2,99,940</span>
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
          <div className="mt-4 pt-4 border-t border-ink-100">
            <Button variant="secondary" size="sm" className="w-full">
              Download Last Invoice
            </Button>
          </div>
        </Card>
      </div>

      {/* Plan comparison */}
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
          <Button variant="primary" icon={<Zap size={15} />}>Upgrade to Enterprise</Button>
        </div>
      </Card>
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

  async function handleSeed() {
    setStatus('running');
    setLogs([]);
    try {
      await seedFirestore((msg) => setLogs((prev) => [...prev, msg]));
      setStatus('done');
    } catch (err) {
      setLogs((prev) => [...prev, `Error: ${String(err)}`]);
      setStatus('error');
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
  const [active, setActive] = useState('company');

  function renderContent() {
    switch (active) {
      case 'company': return <CompanyProfile />;
      case 'departments': return <DepartmentsSection />;
      case 'leave': return <LeavePolicies />;
      case 'roles': return <RolesPermissions />;
      case 'holidays': return <HolidaysSection />;
      case 'notifications': return <NotificationsSection />;
      case 'integrations': return <IntegrationsSection />;
      case 'billing': return <BillingSection />;
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
                  <p className="text-[10px] text-ink-400">Pro Plan · v2.1.0</p>
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
