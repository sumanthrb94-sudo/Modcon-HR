import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  IndianRupee,
  Users,
  TrendingUp,
  CalendarClock,
  Play,
  Upload,
  Download,
} from 'lucide-react';
import {
  PageHeader,
  Button,
  StatCard,
  Card,
  CardHeader,
  Tabs,
  Table,
  type Column,
  Badge,
  Modal,
  SearchInput,
  Select,
  Avatar,
} from '@/components/ui';
import { statusTone } from '@/components/ui';
import { formatINR, formatDate } from '@/lib/utils';
import { buildPayslip, salaryByDepartment, getPayrollRuns, savePayrollRuns, getPayslips, savePayslips } from '@/data/payroll';
import { employees, getEmployee } from '@/data/employees';
import { departments } from '@/data/departments';
import { currentMonthIso, todayDate } from '@/lib/today';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { useDepartmentDirectoryRevision } from '@/lib/useDepartmentDirectoryRevision';
import { useAuth } from '@/lib/auth';
import {
  canUploadPayslips,
  payslipBlobUrl,
  payslipDocId,
  payslipOrgId,
  usePayslipDocuments,
} from '@/lib/payslipDocuments';
import { PayslipUploadModal } from './PayslipUploadModal';
import type { Payslip, PayrollRun, PayslipDocument } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthLabel(m: string): string {
  const [yr, mo] = m.split('-');
  const date = new Date(Number(yr), Number(mo) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

/**
 * Save an uploaded payslip to disk.
 *
 * The object URL is revoked on the next tick rather than immediately: revoking
 * before the browser has started the download cancels it, and holding it for
 * the life of the tab leaks the whole PDF per click.
 */
export function downloadPayslipDocument(document: PayslipDocument) {
  const url = payslipBlobUrl(document.contentBase64);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = document.fileName;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Pay day for a "YYYY-MM" run — the last day of that month. */
function payDateFor(month: string): string {
  const [yr, mo] = month.split('-').map(Number);
  return new Date(Date.UTC(yr, mo, 0)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Payslip Modal
// ---------------------------------------------------------------------------

interface PayslipModalProps {
  payslip: Payslip | null;
  onClose: () => void;
}

function PayslipModal({ payslip, onClose }: PayslipModalProps) {
  if (!payslip) return null;
  const emp = getEmployee(payslip.employeeId);
  const empName = emp?.fullName ?? 'Unknown';

  return (
    <Modal
      open={!!payslip}
      onClose={onClose}
      title="Payslip"
      subtitle={`${empName} — ${monthLabel(payslip.month)}`}
      size="lg"
    >
      {/* Header strip */}
      <div className="flex items-center gap-4 pb-5 border-b border-ink-100 mb-5">
        <Avatar name={empName} size="lg" />
        <div>
          <p className="font-semibold text-ink-900 text-base">{empName}</p>
          <p className="text-sm text-ink-500">{emp?.designation}</p>
          <p className="text-sm text-ink-500">{emp?.department} · {emp?.employeeCode}</p>
        </div>
        <Badge tone={statusTone(payslip.status)} className="ml-auto">
          {payslip.status}
        </Badge>
      </div>

      {/* Two-column earnings vs deductions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
        {/* Earnings */}
        <div>
          <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-3">Earnings</p>
          <div className="space-y-2.5">
            {[
              { label: 'Basic Salary', value: payslip.basic },
              { label: 'House Rent Allowance', value: payslip.hra },
              { label: 'Special Allowance', value: payslip.specialAllowance },
              { label: 'Bonus', value: payslip.bonus },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-sm text-ink-600">{row.label}</span>
                <span className="text-sm font-medium text-ink-900">{formatINR(row.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-ink-200 pt-2 mt-2">
              <span className="text-sm font-semibold text-ink-800">Gross Earnings</span>
              <span className="text-sm font-bold text-emerald-700">{formatINR(payslip.grossEarnings)}</span>
            </div>
          </div>
        </div>

        {/* Deductions */}
        <div>
          <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-3">Deductions</p>
          <div className="space-y-2.5">
            {/* Deductions come exclusively from attendance (see
                buildPayslipComponents), so Provident Fund and TDS are not
                withheld and are not listed — a row reading "PF ₹0" would
                suggest a contribution was calculated and came to nothing. */}
            {[
              { label: 'Loss of Pay (unpaid absence)', value: payslip.otherDeductions },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-sm text-ink-600">{row.label}</span>
                <span className="text-sm font-medium text-rose-700">{formatINR(row.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-ink-200 pt-2 mt-2">
              <span className="text-sm font-semibold text-ink-800">Total Deductions</span>
              <span className="text-sm font-bold text-rose-700">{formatINR(payslip.totalDeductions)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Net Pay highlight */}
      <div className="rounded-xl bg-brand-600 text-white p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-brand-100">Net Pay (Take Home)</p>
          <p className="text-2xl font-bold mt-0.5">{formatINR(payslip.netPay)}</p>
        </div>
        <div className="text-right text-sm text-brand-100">
          <p>{monthLabel(payslip.month)}</p>
          <p className="mt-0.5">Paid on {payslip.status === 'Paid' ? formatDate(payDateFor(payslip.month)) : '—'}</p>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------



export function PayrollPage() {
  const directoryRevision = useEmployeeDirectoryRevision();
  const departmentRevision = useDepartmentDirectoryRevision();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('runs');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  // The PDFs payroll actually issued, keyed by the payslip they document, so
  // the list below can say which months are covered and which are not.
  const { documents: uploadedPayslips } = usePayslipDocuments(profile);
  const uploadedById = useMemo(
    () => new Map(uploadedPayslips.map((document) => [document.id, document])),
    [uploadedPayslips],
  );
  const uploadOrgId = payslipOrgId(profile);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  // Seeded from the store and written through, so a processed run does not
  // revert to Draft on the next refresh.
  const [payrollRunList, setPayrollRunListRaw] = useState(() => getPayrollRuns());
  const setPayrollRunList = (updater: Parameters<typeof setPayrollRunListRaw>[0]) =>
    setPayrollRunListRaw((prev) => savePayrollRuns(typeof updater === 'function' ? (updater as (p: typeof prev) => typeof prev)(prev) : updater));
    const [payslipList, setPayslipListRaw] = useState(() => getPayslips());
  const setPayslipList = (updater: Parameters<typeof setPayslipListRaw>[0]) =>
    setPayslipListRaw((prev) => savePayslips(typeof updater === 'function' ? (updater as (p: typeof prev) => typeof prev)(prev) : updater));

  // Salaries are disbursed on the last day of the month.
  const nextPayDate = useMemo(() => {
    const today = todayDate();
    const lastDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    return lastDay.toISOString().slice(0, 10);
  }, []);
  const daysToPayDate = useMemo(
    () => Math.max(0, Math.round((new Date(nextPayDate).getTime() - todayDate().getTime()) / 86_400_000)),
    [nextPayDate],
  );

  // ----- Aggregates -----
  const totalNetPay = useMemo(() => payslipList.reduce((s, p) => s + p.netPay, 0), [payslipList]);
  const avgCTC = useMemo(() => {
    if (employees.length === 0) return 0;
    const total = employees.reduce((s, e) => s + e.ctc, 0);
    return Math.round(total / employees.length);
  }, [directoryRevision]);

  // ----- Chart data -----
  const chartData = useMemo(
    () =>
      salaryByDepartment().map((d) => ({
        ...d,
        display: d.department.length > 10 ? d.department.slice(0, 8) + '…' : d.department,
        totalLakh: parseFloat((d.total / 100000).toFixed(2)),
      })),
    [directoryRevision, departmentRevision],
  );

  const deptOptions = useMemo(
    () => [
      { label: 'All Departments', value: '' },
      ...departments.map((d) => ({ label: d, value: d })),
    ],
    [departmentRevision],
  );

  const sortedPayrollRuns = useMemo(
    () =>
      payrollRunList
        .slice()
        .sort((left, right) => right.month.localeCompare(left.month)),
    [payrollRunList],
  );

  // ----- Filtered payslips -----
  const filteredPayslips = useMemo(() => {
    return payslipList.filter((p) => {
      const emp = getEmployee(p.employeeId);
      if (!emp) return false;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        emp.fullName.toLowerCase().includes(q) ||
        emp.employeeCode.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q);
      const matchesDept = !deptFilter || emp.department === deptFilter;
      return matchesSearch && matchesDept;
    });
  }, [payslipList, search, deptFilter, directoryRevision]);

  function handleRunPayroll() {
    const alreadyExists = payrollRunList.some((run) => run.month === currentMonthIso());
    if (alreadyExists) {
      setActiveTab('runs');
      return;
    }

    const monthPayslips = employees.map((employee) => buildPayslip(employee, currentMonthIso(), 'Paid'));
    const grossTotal = monthPayslips.reduce((sum, payslip) => sum + payslip.grossEarnings, 0);
    const netTotal = monthPayslips.reduce((sum, payslip) => sum + payslip.netPay, 0);

    const newRun: PayrollRun = {
      id: `pr-${currentMonthIso()}`,
      month: currentMonthIso(),
      status: 'Paid',
      employeeCount: employees.length,
      grossTotal,
      netTotal,
      processedOn: `${currentMonthIso()}-30`,
    };

    setPayrollRunList((prev) => [newRun, ...prev]);
    setPayslipList((prev) => [...monthPayslips, ...prev]);
    setActiveTab('runs');
  }

  // ----- Payroll Runs columns -----
  const runColumns: Column<PayrollRun>[] = [
    {
      key: 'month',
      header: 'Month',
      render: (r) => <span className="font-medium text-ink-900">{monthLabel(r.month)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge tone={statusTone(r.status)} dot>
          {r.status}
        </Badge>
      ),
    },
    {
      key: 'employees',
      header: 'Employees',
      align: 'right',
      render: (r) => r.employeeCount,
    },
    {
      key: 'gross',
      header: 'Gross Payout',
      align: 'right',
      render: (r) => formatINR(r.grossTotal, { compact: true }),
    },
    {
      key: 'net',
      header: 'Net Payout',
      align: 'right',
      render: (r) => (
        <span className="font-semibold text-ink-900">{formatINR(r.netTotal, { compact: true })}</span>
      ),
    },
    {
      key: 'processedOn',
      header: 'Processed On',
      render: (r) => (r.processedOn ? formatDate(r.processedOn) : <span className="text-ink-400">—</span>),
    },
  ];

  // ----- Payslips columns -----
  const payslipColumns: Column<Payslip>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (p) => {
        const emp = getEmployee(p.employeeId);
        return (
          <div className="flex items-center gap-3">
            <Avatar name={emp?.fullName ?? '?'} size="sm" />
            <div>
              <p className="font-medium text-ink-900">{emp?.fullName}</p>
              <p className="text-xs text-ink-400">{emp?.employeeCode}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'department',
      header: 'Department',
      render: (p) => {
        const emp = getEmployee(p.employeeId);
        return <span className="text-ink-600">{emp?.department}</span>;
      },
    },
    {
      key: 'gross',
      header: 'Gross',
      align: 'right',
      render: (p) => formatINR(p.grossEarnings),
    },
    {
      key: 'deductions',
      header: 'Deductions',
      align: 'right',
      render: (p) => <span className="text-rose-600">-{formatINR(p.totalDeductions)}</span>,
    },
    {
      key: 'netPay',
      header: 'Net Pay',
      align: 'right',
      render: (p) => (
        <span className="font-semibold text-emerald-700">{formatINR(p.netPay)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <Badge tone={statusTone(p.status)} dot>
          {p.status}
        </Badge>
      ),
    },
    {
      // The issued PDF, beside the figures the app computed for the same month.
      // A dash here is coverage information, not an error: it says payroll has
      // not uploaded that month's payslip for this person yet.
      key: 'document',
      header: 'Payslip PDF',
      align: 'right',
      render: (p) => {
        const document = uploadedById.get(payslipDocId(uploadOrgId, p.employeeId, p.month));
        if (!document) return <span className="text-ink-300">—</span>;
        return (
          <Button
            variant="secondary"
            size="sm"
            className="px-2.5 py-1 text-[11px]"
            icon={<Download size={12} />}
            onClick={(event) => {
              event.stopPropagation();
              downloadPayslipDocument(document);
            }}
          >
            PDF
          </Button>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="Manage salary disbursements, payslips, and compensation analytics"
        actions={
          <div className="flex items-center gap-2">
            {/* Presentation only — firestore.rules is what refuses the write.
                See the header of src/lib/payslipDocuments.ts. */}
            {canUploadPayslips(profile) && (
              <Button icon={<Upload size={16} />} variant="secondary" onClick={() => setUploadOpen(true)}>
                Upload payslips
              </Button>
            )}
            <Button icon={<Play size={16} />} variant="primary" onClick={handleRunPayroll}>
              Run Payroll
            </Button>
          </div>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Monthly Payroll Cost"
          value={formatINR(totalNetPay, { compact: true })}
          icon={<IndianRupee size={22} />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Employees on Payroll"
          value={employees.length}
          icon={<Users size={22} />}
          iconClass="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Average CTC"
          value={formatINR(avgCTC, { compact: true })}
          icon={<TrendingUp size={22} />}
          iconClass="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Next Pay Date"
          value={formatDate(nextPayDate)}
          icon={<CalendarClock size={22} />}
          iconClass="bg-amber-50 text-amber-600"
          footer={
            <span className="text-ink-400 text-sm">
              {daysToPayDate === 0 ? 'Today' : `${daysToPayDate} day${daysToPayDate === 1 ? '' : 's'} away`}
            </span>
          }
        />
      </div>

      {/* Bar Chart */}
      <Card className="mb-6">
        <CardHeader
          title="Salary Cost by Department"
          subtitle="Monthly gross payroll (₹ Lakhs)"
        />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="display"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `₹${v}L`}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                formatter={(value: number) => [`₹${value.toFixed(2)}L`, 'Monthly Cost']}
                labelFormatter={(label: string) => `Dept: ${label}`}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
              />
              <Bar dataKey="totalLakh" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Tabs */}
      <Card padding={false}>
        <div className="px-5 pt-5">
          <Tabs
            tabs={[
              { id: 'runs', label: 'Payroll Runs', count: payrollRunList.length },
              { id: 'payslips', label: 'Payslips', count: payslipList.length },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {activeTab === 'runs' && (
          <div className="p-5">
            <Table<PayrollRun>
              columns={runColumns}
              data={sortedPayrollRuns}
              keyExtractor={(r) => r.id}
            />
          </div>
        )}

        {activeTab === 'payslips' && (
          <div className="p-5">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search employee…"
                className="flex-1 max-w-xs"
              />
              <Select
                value={deptFilter}
                onChange={setDeptFilter}
                options={deptOptions}
                placeholder="All Departments"
                className="w-52"
              />
            </div>
            <Table<Payslip>
              columns={payslipColumns}
              data={filteredPayslips}
              keyExtractor={(p) => p.id}
              onRowClick={(p) => setSelectedPayslip(p)}
              emptyMessage="No payslips match your filters"
            />
          </div>
        )}
      </Card>

      {/* Payslip Detail Modal */}
      <PayslipModal payslip={selectedPayslip} onClose={() => setSelectedPayslip(null)} />

      <PayslipUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}
