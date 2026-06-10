import { useState, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Receipt,
  Clock,
  CheckCircle,
  Wallet,
  Plus,
  ThumbsUp,
  ThumbsDown,
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
import { expenseClaims, expenseByCategory } from '@/data/expenses';
import { employees, getEmployee, getEmployeeName } from '@/data/employees';
import type { ExpenseClaim, ExpenseCategory, ExpenseStatus } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = 'all' | ExpenseStatus;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const CATEGORY_OPTIONS: { label: string; value: string }[] = [
  { label: 'Travel', value: 'Travel' },
  { label: 'Meals', value: 'Meals' },
  { label: 'Accommodation', value: 'Accommodation' },
  { label: 'Software', value: 'Software' },
  { label: 'Office Supplies', value: 'Office Supplies' },
  { label: 'Training', value: 'Training' },
  { label: 'Other', value: 'Other' },
];

const EMPLOYEE_OPTIONS = employees.map((e) => ({
  label: e.fullName,
  value: e.id,
}));

const categoryTone = (cat: ExpenseCategory): 'blue' | 'green' | 'amber' | 'violet' | 'cyan' | 'pink' | 'gray' => {
  const map: Record<ExpenseCategory, 'blue' | 'green' | 'amber' | 'violet' | 'cyan' | 'pink' | 'gray'> = {
    Travel: 'blue',
    Meals: 'green',
    Accommodation: 'amber',
    Software: 'violet',
    'Office Supplies': 'cyan',
    Training: 'pink',
    Other: 'gray',
  };
  return map[cat] ?? 'gray';
};

// ---------------------------------------------------------------------------
// New Claim Modal
// ---------------------------------------------------------------------------

interface NewClaimForm {
  employeeId: string;
  title: string;
  category: string;
  amount: string;
  date: string;
  description: string;
}

const EMPTY_FORM: NewClaimForm = {
  employeeId: '',
  title: '',
  category: '',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  description: '',
};

interface NewClaimModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (claim: ExpenseClaim) => void;
}

function NewClaimModal({ open, onClose, onSubmit }: NewClaimModalProps) {
  const [form, setForm] = useState<NewClaimForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof NewClaimForm, string>>>({});

  const set = (field: keyof NewClaimForm) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  function validate(): boolean {
    const e: Partial<Record<keyof NewClaimForm, string>> = {};
    if (!form.employeeId) e.employeeId = 'Select an employee';
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.category) e.category = 'Select a category';
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      e.amount = 'Enter a valid amount';
    if (!form.date) e.date = 'Date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const now = new Date().toISOString().slice(0, 10);
    const claim: ExpenseClaim = {
      id: `exp-${Date.now()}`,
      employeeId: form.employeeId,
      title: form.title.trim(),
      category: form.category as ExpenseCategory,
      amount: Number(form.amount),
      date: form.date,
      status: 'Submitted',
      submittedOn: now,
      description: form.description.trim(),
    };
    onSubmit(claim);
    setForm(EMPTY_FORM);
    setErrors({});
    onClose();
  }

  function handleClose() {
    setForm(EMPTY_FORM);
    setErrors({});
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New Expense Claim"
      subtitle="Submit a new reimbursement request"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Submit Claim
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Employee */}
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Employee</label>
          <Select
            value={form.employeeId}
            onChange={set('employeeId')}
            options={EMPLOYEE_OPTIONS}
            placeholder="Select employee…"
            className="w-full"
          />
          {errors.employeeId && <p className="text-xs text-rose-600 mt-1">{errors.employeeId}</p>}
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Title</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set('title')(e.target.value)}
            placeholder="e.g. Client Dinner — Acme Corp"
            className="input w-full"
          />
          {errors.title && <p className="text-xs text-rose-600 mt-1">{errors.title}</p>}
        </div>

        {/* Category & Amount */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Category</label>
            <Select
              value={form.category}
              onChange={set('category')}
              options={CATEGORY_OPTIONS}
              placeholder="Category…"
              className="w-full"
            />
            {errors.category && <p className="text-xs text-rose-600 mt-1">{errors.category}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Amount (₹)</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => set('amount')(e.target.value)}
              placeholder="0"
              min={0}
              className="input w-full"
            />
            {errors.amount && <p className="text-xs text-rose-600 mt-1">{errors.amount}</p>}
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Expense Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => set('date')(e.target.value)}
            className="input w-full"
          />
          {errors.date && <p className="text-xs text-rose-600 mt-1">{errors.date}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">
            Description <span className="text-ink-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={form.description}
            onChange={(e) => set('description')(e.target.value)}
            rows={3}
            placeholder="Provide additional details…"
            className="input w-full resize-none"
          />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const STATUS_TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Submitted', label: 'Submitted' },
  { id: 'Approved', label: 'Approved' },
  { id: 'Reimbursed', label: 'Reimbursed' },
  { id: 'Rejected', label: 'Rejected' },
  { id: 'Draft', label: 'Draft' },
];

export function ExpensesPage() {
  const [claims, setClaims] = useState<ExpenseClaim[]>(expenseClaims);
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [search, setSearch] = useState('');
  const [newClaimOpen, setNewClaimOpen] = useState(false);

  // ----- Actions -----
  function handleAddClaim(claim: ExpenseClaim) {
    setClaims((prev) => [claim, ...prev]);
  }

  function handleApprove(id: string) {
    setClaims((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'Approved' as ExpenseStatus } : c)),
    );
  }

  function handleReject(id: string) {
    setClaims((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'Rejected' as ExpenseStatus } : c)),
    );
  }

  // ----- Aggregates -----
  const stats = useMemo(() => {
    const total = claims.length;
    const submittedCount = claims.filter((c) => c.status === 'Submitted').length;
    const submittedAmount = claims
      .filter((c) => c.status === 'Submitted')
      .reduce((s, c) => s + c.amount, 0);
    const approvedThisMonth = claims.filter(
      (c) => c.status === 'Approved' && c.submittedOn.startsWith('2026-05'),
    ).length;
    const reimbursedTotal = claims
      .filter((c) => c.status === 'Reimbursed')
      .reduce((s, c) => s + c.amount, 0);
    return { total, submittedCount, submittedAmount, approvedThisMonth, reimbursedTotal };
  }, [claims]);

  // ----- Chart data -----
  const chartData = useMemo(() => expenseByCategory(claims), [claims]);

  // ----- Tab counts -----
  const tabsWithCounts = useMemo(
    () =>
      STATUS_TABS.map((t) => ({
        ...t,
        count:
          t.id === 'all'
            ? claims.length
            : claims.filter((c) => c.status === t.id).length,
      })),
    [claims],
  );

  // ----- Filtered claims -----
  const filteredClaims = useMemo(() => {
    return claims.filter((c) => {
      const matchesTab = activeTab === 'all' || c.status === activeTab;
      const q = search.toLowerCase();
      const empName = getEmployeeName(c.employeeId).toLowerCase();
      const matchesSearch =
        !q ||
        c.title.toLowerCase().includes(q) ||
        empName.includes(q) ||
        c.category.toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [claims, activeTab, search]);

  // ----- Table columns -----
  const columns: Column<ExpenseClaim>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (c) => {
        const name = getEmployeeName(c.employeeId);
        const emp = getEmployee(c.employeeId);
        return (
          <div className="flex items-center gap-3">
            <Avatar name={name} size="sm" />
            <div>
              <p className="font-medium text-ink-900">{name}</p>
              <p className="text-xs text-ink-400">{emp?.department}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'title',
      header: 'Title',
      render: (c) => (
        <div>
          <p className="font-medium text-ink-800">{c.title}</p>
          {c.description && (
            <p className="text-xs text-ink-400 truncate max-w-xs">{c.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (c) => (
        <Badge tone={categoryTone(c.category)}>{c.category}</Badge>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (c) => (
        <span className="font-semibold text-ink-900">{formatINR(c.amount)}</span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (c) => <span className="text-ink-600">{formatDate(c.date)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <Badge tone={statusTone(c.status)} dot>
          {c.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (c) =>
        c.status === 'Submitted' ? (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<ThumbsUp size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                handleApprove(c.id);
              }}
              className="text-emerald-600 hover:bg-emerald-50"
            >
              Approve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<ThumbsDown size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                handleReject(c.id);
              }}
              className="text-rose-600 hover:bg-rose-50"
            >
              Reject
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Track, approve, and reimburse employee expense claims"
        actions={
          <Button
            icon={<Plus size={16} />}
            variant="primary"
            onClick={() => setNewClaimOpen(true)}
          >
            New Claim
          </Button>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Claims"
          value={stats.total}
          icon={<Receipt size={22} />}
          iconClass="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Pending Approval"
          value={stats.submittedCount}
          icon={<Clock size={22} />}
          iconClass="bg-amber-50 text-amber-600"
          footer={
            <span className="text-ink-400 text-sm">
              {formatINR(stats.submittedAmount, { compact: true })} pending
            </span>
          }
        />
        <StatCard
          label="Approved This Month"
          value={stats.approvedThisMonth}
          icon={<CheckCircle size={22} />}
          iconClass="bg-emerald-50 text-emerald-600"
          delta={8}
          deltaLabel="vs last month"
        />
        <StatCard
          label="Reimbursed (Total)"
          value={formatINR(stats.reimbursedTotal, { compact: true })}
          icon={<Wallet size={22} />}
          iconClass="bg-violet-50 text-violet-600"
        />
      </div>

      {/* Chart + Table layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Donut chart */}
        <Card className="xl:col-span-1">
          <CardHeader title="Expenses by Category" subtitle="All-time distribution" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="total"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={88}
                  paddingAngle={3}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${entry.category}`}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [formatINR(value, { compact: true }), 'Amount']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Summary by category */}
        <Card className="xl:col-span-2">
          <CardHeader title="Category Breakdown" subtitle="Total claimed per category" />
          <div className="divide-y divide-ink-100">
            {chartData.map((row, i) => {
              const grandTotal = chartData.reduce((s, r) => s + r.total, 0);
              const pct = grandTotal ? Math.round((row.total / grandTotal) * 100) : 0;
              return (
                <div key={row.category} className="flex items-center gap-4 py-3">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="text-sm text-ink-700 flex-1">{row.category}</span>
                  <div className="flex-1 bg-ink-100 rounded-full h-1.5 max-w-[120px]">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="text-xs text-ink-400 w-8 text-right">{pct}%</span>
                  <span className="text-sm font-semibold text-ink-900 w-20 text-right">
                    {formatINR(row.total, { compact: true })}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Claims Table */}
      <Card padding={false}>
        <div className="px-5 pt-5">
          <Tabs
            tabs={tabsWithCounts}
            active={activeTab}
            onChange={(id) => setActiveTab(id as TabId)}
          />
        </div>

        <div className="p-5">
          <div className="mb-4">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by employee, title, category…"
              className="max-w-sm"
            />
          </div>
          <Table<ExpenseClaim>
            columns={columns}
            data={filteredClaims}
            keyExtractor={(c) => c.id}
            emptyMessage="No claims found"
          />
        </div>
      </Card>

      {/* New Claim Modal */}
      <NewClaimModal
        open={newClaimOpen}
        onClose={() => setNewClaimOpen(false)}
        onSubmit={handleAddClaim}
      />
    </div>
  );
}
