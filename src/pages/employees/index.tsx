import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
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
import { employees, getEmployee, departments, locations } from '@/data/employees';
import type { Employee, EmployeeStatus, EmploymentType } from '@/types';
import { cn, formatINR, formatDate, pct } from '@/lib/utils';
import { OrgChart } from './OrgChart';
import { EmployeeCard } from './EmployeeCard';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

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

// ---------------------------------------------------------------------------
// Add Employee Modal
// ---------------------------------------------------------------------------
interface NewEmployeePayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  designation: string;
  department: Employee['department'];
  location: string;
  employmentType: EmploymentType;
  dateOfJoining: string;
  ctc: number;
  reportingManagerId: string | null;
}

function AddEmployeeModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (payload: NewEmployeePayload) => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState<Employee['department']>('Engineering');
  const [location, setLocation] = useState(locations[0] ?? 'Bengaluru');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('Full-time');
  const [dateOfJoining, setDateOfJoining] = useState('');
  const [ctc, setCtc] = useState('');
  const [reportingManagerId, setReportingManagerId] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    const cleanEmail = email.trim();
    const annualCtc = Number(ctc);

    if (!firstName.trim()) errors.firstName = 'First name is required.';
    if (!lastName.trim()) errors.lastName = 'Last name is required.';
    if (!cleanEmail) {
      errors.email = 'Work email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      errors.email = 'Enter a valid email address.';
    }
    if (!designation.trim()) errors.designation = 'Designation is required.';
    if (!dateOfJoining) errors.dateOfJoining = 'Date of joining is required.';
    if (!ctc.trim()) {
      errors.ctc = 'Annual CTC is required.';
    } else if (Number.isNaN(annualCtc) || annualCtc <= 0) {
      errors.ctc = 'Annual CTC must be greater than 0.';
    }

    return errors;
  }, [firstName, lastName, email, designation, dateOfJoining, ctc]);

  const hasErrors = Object.keys(validationErrors).length > 0;

  function resetForm() {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setDesignation('');
    setDepartment('Engineering');
    setLocation(locations[0] ?? 'Bengaluru');
    setEmploymentType('Full-time');
    setDateOfJoining('');
    setCtc('');
    setReportingManagerId('');
    setSubmitAttempted(false);
  }

  function handleSave() {
    setSubmitAttempted(true);
    if (hasErrors) return;

    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanDesignation = designation.trim();
    const annualCtc = Number(ctc);

    onSave({
      firstName: cleanFirstName,
      lastName: cleanLastName,
      email: cleanEmail,
      phone: phone.trim(),
      designation: cleanDesignation,
      department,
      location,
      employmentType,
      dateOfJoining,
      ctc: annualCtc,
      reportingManagerId: reportingManagerId || null,
    });
    resetForm();
    onClose();
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add New Employee"
      subtitle="Fill in the details to create a new employee profile"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>Save Employee</Button>
        </>
      }
    >
      <div className="space-y-5">
        {submitAttempted && hasErrors && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Please fix the highlighted fields before saving.
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5">First Name</label>
            <input className="input w-full" placeholder="Enter first name" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            {submitAttempted && validationErrors.firstName && <p className="mt-1 text-xs text-red-600">{validationErrors.firstName}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5">Last Name</label>
            <input className="input w-full" placeholder="Enter last name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
            {submitAttempted && validationErrors.lastName && <p className="mt-1 text-xs text-red-600">{validationErrors.lastName}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5">Work Email</label>
            <input className="input w-full" type="email" placeholder="name@modcon.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            {submitAttempted && validationErrors.email && <p className="mt-1 text-xs text-red-600">{validationErrors.email}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5">Phone</label>
            <input className="input w-full" placeholder="+91 XXXXX XXXXX" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5">Designation</label>
            <input className="input w-full" placeholder="Job title" value={designation} onChange={(event) => setDesignation(event.target.value)} />
            {submitAttempted && validationErrors.designation && <p className="mt-1 text-xs text-red-600">{validationErrors.designation}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5">Department</label>
            <select className="input w-full" value={department} onChange={(event) => setDepartment(event.target.value as Employee['department'])}>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5">Location</label>
            <select className="input w-full" value={location} onChange={(event) => setLocation(event.target.value)}>
              {locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5">Employment Type</label>
            <select className="input w-full" value={employmentType} onChange={(event) => setEmploymentType(event.target.value as EmploymentType)}>
              {(['Full-time', 'Part-time', 'Contract', 'Intern'] as EmploymentType[]).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5">Date of Joining</label>
            <input className="input w-full" type="date" value={dateOfJoining} onChange={(event) => setDateOfJoining(event.target.value)} />
            {submitAttempted && validationErrors.dateOfJoining && <p className="mt-1 text-xs text-red-600">{validationErrors.dateOfJoining}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5">Annual CTC (₹)</label>
            <input className="input w-full" type="number" placeholder="e.g. 2400000" value={ctc} onChange={(event) => setCtc(event.target.value)} />
            {submitAttempted && validationErrors.ctc && <p className="mt-1 text-xs text-red-600">{validationErrors.ctc}</p>}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Reporting Manager</label>
          <select className="input w-full" value={reportingManagerId} onChange={(event) => setReportingManagerId(event.target.value)}>
            <option value="">Select reporting manager</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName} — {e.designation}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// EmployeesPage
// ---------------------------------------------------------------------------
type ViewMode = 'grid' | 'list';
type DirectoryTab = 'directory' | 'orgchart';

export function EmployeesPage() {
  const navigate = useNavigate();
  const [employeeList, setEmployeeList] = useState<Employee[]>(employees);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [activeTab, setActiveTab] = useState<DirectoryTab>('directory');
  const [addModalOpen, setAddModalOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employeeList.filter((e) => {
      if (q && !e.fullName.toLowerCase().includes(q) && !e.designation.toLowerCase().includes(q) && !e.email.toLowerCase().includes(q) && !e.employeeCode.toLowerCase().includes(q)) return false;
      if (deptFilter && e.department !== deptFilter) return false;
      if (locationFilter && e.location !== locationFilter) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      if (typeFilter && e.employmentType !== typeFilter) return false;
      return true;
    });
  }, [employeeList, search, deptFilter, locationFilter, statusFilter, typeFilter]);

  const totalCount = employeeList.length;
  const activeCount = employeeList.filter((e) => e.status === 'Active').length;
  const probationNotice = employeeList.filter((e) => e.status === 'Probation' || e.status === 'Notice Period').length;
  const deptCount = new Set(employeeList.map((e) => e.department)).size;

  function handleAddEmployee(payload: NewEmployeePayload) {
    setEmployeeList((prev) => {
      const nextIndex = prev.length + 1;
      const nextId = `emp-${String(nextIndex).padStart(3, '0')}`;
      const employeeCode = `MC-${String(nextIndex).padStart(3, '0')}`;
      const manager = payload.reportingManagerId ? prev.find((e) => e.id === payload.reportingManagerId) : undefined;
      const nextEmployee: Employee = {
        id: nextId,
        employeeCode,
        firstName: payload.firstName,
        lastName: payload.lastName,
        fullName: `${payload.firstName} ${payload.lastName}`,
        email: payload.email,
        phone: payload.phone || 'N/A',
        avatar: `${payload.firstName} ${payload.lastName}`,
        gender: 'Other',
        dateOfBirth: '2000-01-01',
        designation: payload.designation,
        department: payload.department,
        location: payload.location,
        employmentType: payload.employmentType,
        status: 'Active',
        dateOfJoining: payload.dateOfJoining,
        reportingManagerId: payload.reportingManagerId,
        reportingManagerName: manager?.fullName,
        ctc: payload.ctc,
        maritalStatus: 'Single',
        address: `${payload.location}, India`,
        skills: [],
      };
      return [nextEmployee, ...prev];
    });
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
    { id: 'orgchart', label: 'Org Chart' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        subtitle={`${totalCount} people across ${deptCount} departments`}
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setAddModalOpen(true)}
          >
            Add Employee
          </Button>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {activeTab === 'orgchart' ? (
        <Card>
          <CardHeader title="Organisation Chart" subtitle="Company hierarchy from CEO down" />
          <OrgChart employees={employeeList} />
        </Card>
      ) : (
        <>
          {/* Toolbar */}
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

          {/* Results count */}
          {(search || deptFilter || locationFilter || statusFilter || typeFilter) && (
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
          ) : viewMode === 'grid' ? (
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

      <AddEmployeeModal open={addModalOpen} onClose={() => setAddModalOpen(false)} onSave={handleAddEmployee} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// InfoRow helper for detail page
// ---------------------------------------------------------------------------
function InfoRow({ label, value }: { label: string; value: string | undefined | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-ink-800">{value ?? '—'}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------
function OverviewTab({ emp }: { emp: Employee }) {
  return (
    <div className="space-y-5">
      {/* Personal Info */}
      <Card>
        <CardHeader title="Personal Information" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
          <InfoRow label="Date of Birth" value={formatDate(emp.dateOfBirth)} />
          <InfoRow label="Gender" value={emp.gender} />
          <InfoRow label="Blood Group" value={emp.bloodGroup} />
          <InfoRow label="Marital Status" value={emp.maritalStatus} />
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
          <InfoRow label="Designation" value={emp.designation} />
          <InfoRow label="Department" value={emp.department} />
          <InfoRow label="Location" value={emp.location} />
          <InfoRow label="Employment Type" value={emp.employmentType} />
          <InfoRow label="Status" value={emp.status} />
          <InfoRow label="Date of Joining" value={formatDate(emp.dateOfJoining)} />
          <InfoRow label="Reporting Manager" value={emp.reportingManagerName ?? 'None'} />
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
function TeamTab({ emp }: { emp: Employee }) {
  const navigate = useNavigate();
  const manager = emp.reportingManagerId ? getEmployee(emp.reportingManagerId) : null;
  const directReports = employees.filter((e) => e.reportingManagerId === emp.id);

  return (
    <div className="space-y-5">
      {/* Manager */}
      {manager && (
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
const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b'];

function CompensationTab({ emp }: { emp: Employee }) {
  const annual = emp.ctc;
  const monthly = Math.round(annual / 12);
  const basic = Math.round(monthly * 0.4);
  const hra = Math.round(monthly * 0.2);
  const special = monthly - basic - hra;

  const breakdown = [
    { label: 'Basic Salary', amount: basic, pct: 40, color: 'text-indigo-600' },
    { label: 'HRA', amount: hra, pct: 20, color: 'text-emerald-600' },
    { label: 'Special Allowance', amount: special, pct: 40, color: 'text-amber-600' },
  ];

  const pieData = [
    { name: 'Basic', value: basic },
    { name: 'HRA', value: hra },
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
            <p className="text-sm text-ink-400 mt-1">Monthly gross: <span className="font-semibold text-ink-700">{formatINR(monthly)}</span></p>
          </div>
          <div className="flex items-center gap-3 sm:ml-auto">
            <Badge tone="green">Active Package</Badge>
            <Badge tone="blue">{emp.employmentType}</Badge>
          </div>
        </div>
      </Card>

      {/* Breakdown + Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Monthly Breakdown" />
          <div className="space-y-4">
            {breakdown.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-ink-700">{item.label}</span>
                  <span className={cn('text-sm font-semibold', item.color)}>{formatINR(item.amount)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ProgressBar value={item.pct} tone={item.label === 'Basic Salary' ? 'brand' : item.label === 'HRA' ? 'green' : 'amber'} />
                  <span className="text-xs text-ink-400 w-10 text-right">{item.pct}%</span>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents Tab
// ---------------------------------------------------------------------------
type DocStatus = 'Verified' | 'Pending' | 'Expired';

interface MockDoc {
  name: string;
  type: string;
  status: DocStatus;
  uploaded: string;
  size: string;
}

const MOCK_DOCS: MockDoc[] = [
  { name: 'Offer Letter', type: 'PDF', status: 'Verified', uploaded: '2021-01-15', size: '245 KB' },
  { name: 'Employment Contract', type: 'PDF', status: 'Verified', uploaded: '2021-01-18', size: '512 KB' },
  { name: 'Aadhaar Card', type: 'PDF', status: 'Verified', uploaded: '2021-02-01', size: '180 KB' },
  { name: 'PAN Card', type: 'PDF', status: 'Verified', uploaded: '2021-02-01', size: '95 KB' },
  { name: 'Bank Account Details', type: 'PDF', status: 'Verified', uploaded: '2021-02-05', size: '120 KB' },
  { name: 'Educational Certificates', type: 'ZIP', status: 'Pending', uploaded: '2021-02-10', size: '2.1 MB' },
  { name: 'Previous Relieving Letter', type: 'PDF', status: 'Verified', uploaded: '2021-02-10', size: '310 KB' },
  { name: 'Medical Insurance Form', type: 'PDF', status: 'Expired', uploaded: '2022-04-01', size: '88 KB' },
];

function docStatusTone(s: DocStatus): 'green' | 'amber' | 'red' {
  if (s === 'Verified') return 'green';
  if (s === 'Pending') return 'amber';
  return 'red';
}

function DocumentsTab() {
  const docIcon = (type: string) =>
    type === 'ZIP' ? <Award size={14} className="text-amber-500" /> : <FileText size={14} className="text-brand-500" />;

  const docColumns: Column<MockDoc>[] = [
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
      render: (d) => <Badge tone={docStatusTone(d.status)} dot>{d.status}</Badge>,
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

  return (
    <Card padding={false}>
      <div className="p-5 border-b border-ink-100">
        <CardHeader title="Employee Documents" subtitle="Uploaded verification documents and contracts" />
      </div>
      <Table columns={docColumns} data={MOCK_DOCS} keyExtractor={(d) => d.name} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Time Off Tab
// ---------------------------------------------------------------------------
interface LeaveBalanceRow {
  type: string;
  total: number;
  used: number;
  available: number;
  tone: 'green' | 'amber' | 'brand';
}

const LEAVE_BALANCES: LeaveBalanceRow[] = [
  { type: 'Casual Leave', total: 12, used: 5, available: 7, tone: 'brand' },
  { type: 'Sick Leave', total: 12, used: 3, available: 9, tone: 'amber' },
  { type: 'Earned Leave', total: 21, used: 8, available: 13, tone: 'green' },
  { type: 'Comp Off', total: 4, used: 2, available: 2, tone: 'brand' },
];

function TimeOffTab() {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Leave Balances" subtitle="Current year (Jan – Dec 2026)" />
        <div className="space-y-5">
          {LEAVE_BALANCES.map((lb) => (
            <div key={lb.type}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-ink-800">{lb.type}</span>
                <div className="flex items-center gap-4 text-xs text-ink-500">
                  <span><span className="font-semibold text-ink-700">{lb.used}</span> used</span>
                  <span><span className="font-semibold text-emerald-600">{lb.available}</span> remaining</span>
                  <span>of {lb.total} days</span>
                </div>
              </div>
              <ProgressBar value={pct(lb.used, lb.total)} tone={lb.tone} showLabel />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Recent Leave Activity" />
        <div className="space-y-3">
          {[
            { type: 'Casual Leave', dates: '23 May – 24 May 2026', days: 2, status: 'Approved' },
            { type: 'Sick Leave', dates: '10 Apr – 10 Apr 2026', days: 1, status: 'Approved' },
            { type: 'Earned Leave', dates: '01 Mar – 05 Mar 2026', days: 5, status: 'Approved' },
            { type: 'Casual Leave', dates: '14 Jan – 15 Jan 2026', days: 2, status: 'Rejected' },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-ink-50 last:border-0">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50">
                  <Calendar size={14} className="text-brand-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-800">{item.type}</p>
                  <p className="text-xs text-ink-400">{item.dates} · {item.days} day{item.days !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <Badge tone={statusTone(item.status)} dot>{item.status}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmployeeDetailPage
// ---------------------------------------------------------------------------
type DetailTab = 'overview' | 'team' | 'compensation' | 'documents' | 'timeoff';

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [profileOverrides, setProfileOverrides] = useState<Record<string, Partial<Employee>>>({});

  const [messageOpen, setMessageOpen] = useState(false);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messageError, setMessageError] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editDepartment, setEditDepartment] = useState<Employee['department']>(departments[0] as Employee['department']);
  const [editLocation, setEditLocation] = useState(locations[0] ?? 'Bengaluru');
  const [editEmploymentType, setEditEmploymentType] = useState<EmploymentType>('Full-time');
  const [editStatus, setEditStatus] = useState<EmployeeStatus>('Active');
  const [editError, setEditError] = useState('');

  const baseEmp = id ? getEmployee(id) : undefined;
  const emp = useMemo(() => {
    if (!baseEmp) return undefined;
    const override = profileOverrides[baseEmp.id];
    if (!override) return baseEmp;

    const merged = { ...baseEmp, ...override } as Employee;
    merged.fullName = `${merged.firstName} ${merged.lastName}`.trim();
    return merged;
  }, [baseEmp, profileOverrides]);

  useEffect(() => {
    if (!emp) return;
    setMessageSubject(`Hello ${emp.firstName}`);
    setMessageBody('');
    setMessageError('');
    setEditError('');
  }, [emp?.id]);

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

  function openEditProfile() {
    if (!emp) return;
    setEditFirstName(emp.firstName);
    setEditLastName(emp.lastName);
    setEditEmail(emp.email);
    setEditPhone(emp.phone);
    setEditDesignation(emp.designation);
    setEditDepartment(emp.department);
    setEditLocation(emp.location);
    setEditEmploymentType(emp.employmentType);
    setEditStatus(emp.status);
    setEditError('');
    setEditOpen(true);
  }

  function handleSaveProfile() {
    if (!emp) return;

    const firstName = editFirstName.trim();
    const lastName = editLastName.trim();
    const email = editEmail.trim().toLowerCase();
    const designation = editDesignation.trim();

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

    setProfileOverrides((prev) => ({
      ...prev,
      [emp.id]: {
        ...prev[emp.id],
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`.trim(),
        email,
        phone: editPhone.trim(),
        designation,
        department: editDepartment,
        location: editLocation,
        employmentType: editEmploymentType,
        status: editStatus,
      },
    }));

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

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'team', label: 'Team', count: directReports.length },
    { id: 'compensation', label: 'Compensation' },
    { id: 'documents', label: 'Documents' },
    { id: 'timeoff', label: 'Time Off' },
  ];

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <button
        onClick={() => navigate('/employees')}
        className="inline-flex items-center gap-2 text-sm text-ink-500 hover:text-ink-900 font-medium transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Employees
      </button>

      {/* Profile Header */}
      <Card>
        <div className="flex flex-col md:flex-row gap-6">
          {/* Avatar + basic info */}
          <div className="flex items-start gap-5">
            <div className="relative">
              <Avatar name={emp.fullName} size="xl" />
              <span
                className={cn(
                  'absolute -bottom-1 -right-1 h-4 w-4 rounded-full ring-2 ring-white',
                  emp.status === 'Active' ? 'bg-emerald-400' : emp.status === 'On Leave' ? 'bg-violet-400' : 'bg-amber-400'
                )}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-ink-900">{emp.fullName}</h2>
                <Badge tone={statusTone(emp.status)} dot>{emp.status}</Badge>
              </div>
              <p className="text-base text-ink-600 font-medium">{emp.designation}</p>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-ink-500">
                <span className="flex items-center gap-1"><Building2 size={13} />{emp.department}</span>
                <span className="text-ink-300">·</span>
                <span className="flex items-center gap-1"><MapPin size={13} />{emp.location}</span>
                <span className="text-ink-300">·</span>
                <span className="font-mono text-xs bg-ink-100 px-2 py-0.5 rounded">{emp.employeeCode}</span>
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-3">
                <a href={`mailto:${emp.email}`} className="flex items-center gap-1.5 text-xs text-ink-600 hover:text-brand-700 transition-colors">
                  <Mail size={13} className="text-ink-400" />
                  {emp.email}
                </a>
                <a href={`tel:${emp.phone}`} className="flex items-center gap-1.5 text-xs text-ink-600 hover:text-brand-700 transition-colors">
                  <Phone size={13} className="text-ink-400" />
                  {emp.phone}
                </a>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex md:flex-col items-start gap-2 md:ml-auto shrink-0">
            <Button variant="secondary" size="sm" icon={<MessageSquare size={14} />} onClick={openMessageModal}>Message</Button>
            <Button variant="secondary" size="sm" icon={<Edit2 size={14} />} onClick={openEditProfile}>Edit Profile</Button>
          </div>
        </div>

        {/* Quick stat chips */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-5 border-t border-ink-100">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Tenure</span>
            <span className="text-sm font-semibold text-ink-800">{tenure}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Employment Type</span>
            <span className="text-sm font-semibold text-ink-800">{emp.employmentType}</span>
          </div>
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
        </div>
      </Card>

      {/* Tabs */}
      <Tabs tabs={tabs} active={activeTab} onChange={(id) => setActiveTab(id as DetailTab)} />

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab emp={emp} />}
      {activeTab === 'team' && <TeamTab emp={emp} />}
      {activeTab === 'compensation' && <CompensationTab emp={emp} />}
      {activeTab === 'documents' && <DocumentsTab />}
      {activeTab === 'timeoff' && <TimeOffTab />}

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
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Department</label>
            <Select
              value={editDepartment}
              onChange={(value) => setEditDepartment(value as Employee['department'])}
              options={departments.map((department) => ({ label: department, value: department }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Location</label>
            <Select
              value={editLocation}
              onChange={setEditLocation}
              options={locations.map((location) => ({ label: location, value: location }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Employment Type</label>
            <Select
              value={editEmploymentType}
              onChange={(value) => setEditEmploymentType(value as EmploymentType)}
              options={(['Full-time', 'Part-time', 'Contract', 'Intern'] as EmploymentType[]).map((type) => ({ label: type, value: type }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Status</label>
            <Select
              value={editStatus}
              onChange={(value) => setEditStatus(value as EmployeeStatus)}
              options={(['Active', 'On Leave', 'Probation', 'Notice Period', 'Resigned'] as EmployeeStatus[]).map((status) => ({ label: status, value: status }))}
            />
          </div>
          {editError && <p className="md:col-span-2 text-sm text-rose-600">{editError}</p>}
        </div>
      </Modal>
    </div>
  );
}
