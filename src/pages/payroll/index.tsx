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
  DollarSign,
  Users,
  TrendingUp,
  CalendarClock,
  Play,
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
import { payslips, payrollRuns, salaryByDepartment } from '@/data/payroll';
import { employees, departments, getEmployee } from '@/data/employees';
import type { Payslip, PayrollRun } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthLabel(m: string): string {
  const [yr, mo] = m.split('-');
  const date = new Date(Number(yr), Number(mo) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
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
            {[
              { label: 'Provident Fund (12%)', value: payslip.pf },
              { label: 'Income Tax (TDS)', value: payslip.tax },
              { label: 'Other Deductions', value: payslip.otherDeductions },
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
          <p className="mt-0.5">Paid on {payslip.status === 'Paid' ? '31 May 2026' : '—'}</p>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const DEPT_OPTIONS = [
  { label: 'All Departments', value: '' },
  ...departments.map((d) => ({ label: d, value: d })),
];

export function PayrollPage() {
  const [activeTab, setActiveTab] = useState<string>('runs');
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  // ----- Aggregates -----
  const totalNetPay = useMemo(() => payslips.reduce((s, p) => s + p.netPay, 0), []);
  const avgCTC = useMemo(() => {
    const total = employees.reduce((s, e) => s + e.ctc, 0);
    return Math.round(total / employees.length);
  }, []);

  // ----- Chart data -----
  const chartData = useMemo(
    () =>
      salaryByDepartment().map((d) => ({
        ...d,
        display: d.department.length > 10 ? d.department.slice(0, 8) + '…' : d.department,
        totalLakh: parseFloat((d.total / 100000).toFixed(2)),
      })),
    [],
  );

  // ----- Filtered payslips -----
  const filteredPayslips = useMemo(() => {
    return payslips.filter((p) => {
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
  }, [search, deptFilter]);

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
  ];

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="Manage salary disbursements, payslips, and compensation analytics"
        actions={
          <Button icon={<Play size={16} />} variant="primary">
            Run Payroll
          </Button>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Monthly Payroll Cost"
          value={formatINR(totalNetPay, { compact: true })}
          icon={<DollarSign size={22} />}
          iconClass="bg-emerald-50 text-emerald-600"
          delta={2.4}
          deltaLabel="vs last month"
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
          delta={5.1}
          deltaLabel="year on year"
        />
        <StatCard
          label="Next Pay Date"
          value="30 Jun 2026"
          icon={<CalendarClock size={22} />}
          iconClass="bg-amber-50 text-amber-600"
          footer={<span className="text-ink-400 text-sm">20 days away</span>}
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
              { id: 'runs', label: 'Payroll Runs', count: payrollRuns.length },
              { id: 'payslips', label: 'Payslips', count: payslips.length },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {activeTab === 'runs' && (
          <div className="p-5">
            <Table<PayrollRun>
              columns={runColumns}
              data={payrollRuns}
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
                options={DEPT_OPTIONS}
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
    </div>
  );
}
