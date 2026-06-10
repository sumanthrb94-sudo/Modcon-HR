import { useState, useMemo } from 'react';
import {
  Target,
  Star,
  ClipboardList,
  TrendingUp,
  Award,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  statusTone,
  PageHeader,
  StatCard,
  Table,
  type Column,
  ProgressBar,
  Tabs,
  SearchInput,
  Select,
  Card,
  CardHeader,
} from '@/components/ui';
import { goals, reviews, ratingDistribution } from '@/data/performance';
import { getEmployeeName } from '@/data/employees';
import type { Goal, PerformanceReview, GoalStatus } from '@/types';
import { formatDate } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function goalStatusTone(status: GoalStatus) {
  if (status === 'On Track' || status === 'Completed') return statusTone(status);
  if (status === 'At Risk') return 'amber' as const;
  if (status === 'Behind') return 'red' as const;
  return 'gray' as const;
}

function progressTone(pct: number): 'green' | 'amber' | 'red' | 'brand' {
  if (pct >= 80) return 'green';
  if (pct >= 50) return 'brand';
  if (pct >= 30) return 'amber';
  return 'red';
}

function StarRating({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-ink-400 text-sm">—</span>;
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={14}
          className={s <= rating ? 'text-amber-400 fill-amber-400' : 'text-ink-200 fill-ink-200'}
        />
      ))}
      <span className="ml-1 text-xs font-semibold text-ink-600">{rating}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Goal Status Donut data
// ---------------------------------------------------------------------------
const DONUT_COLORS: Record<GoalStatus, string> = {
  'On Track': '#10b981',
  Completed: '#6366f1',
  'At Risk': '#f59e0b',
  Behind: '#f43f5e',
};

const BAR_COLOR = '#6366f1';

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------
const goalColumns: Column<Goal>[] = [
  {
    key: 'owner',
    header: 'Owner',
    render: (row) => {
      const name = getEmployeeName(row.employeeId);
      return (
        <div className="flex items-center gap-2">
          <Avatar name={name} size="sm" />
          <span className="font-medium text-ink-800">{name}</span>
        </div>
      );
    },
  },
  {
    key: 'title',
    header: 'Goal',
    render: (row) => (
      <span className="max-w-xs block truncate text-ink-700" title={row.title}>
        {row.title}
      </span>
    ),
    className: 'max-w-xs',
  },
  {
    key: 'category',
    header: 'Category',
    render: (row) => (
      <Badge tone={row.category === 'Business' ? 'blue' : row.category === 'Technical' ? 'violet' : 'cyan'}>
        {row.category}
      </Badge>
    ),
  },
  {
    key: 'weight',
    header: 'Weight',
    align: 'center',
    render: (row) => <span className="text-sm font-semibold text-ink-600">{row.weight}%</span>,
  },
  {
    key: 'progress',
    header: 'Progress',
    render: (row) => (
      <div className="w-32">
        <ProgressBar value={row.progress} tone={progressTone(row.progress)} size="sm" showLabel />
      </div>
    ),
  },
  {
    key: 'dueDate',
    header: 'Due Date',
    render: (row) => <span className="text-ink-500 text-sm">{formatDate(row.dueDate)}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <Badge tone={goalStatusTone(row.status)} dot>
        {row.status}
      </Badge>
    ),
  },
];

const reviewColumns: Column<PerformanceReview>[] = [
  {
    key: 'employee',
    header: 'Employee',
    render: (row) => (
      <div className="flex items-center gap-2">
        <Avatar name={row.employeeName} size="sm" />
        <span className="font-medium text-ink-800">{row.employeeName}</span>
      </div>
    ),
  },
  {
    key: 'cycle',
    header: 'Cycle',
    render: (row) => <span className="text-sm text-ink-600">{row.cycle}</span>,
  },
  {
    key: 'reviewer',
    header: 'Reviewer',
    render: (row) => (
      <div className="flex items-center gap-2">
        <Avatar name={row.reviewer} size="sm" />
        <span className="text-sm text-ink-600">{row.reviewer}</span>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <Badge tone={statusTone(row.status)} dot>
        {row.status}
      </Badge>
    ),
  },
  {
    key: 'rating',
    header: 'Rating',
    render: (row) => <StarRating rating={row.rating} />,
  },
  {
    key: 'dueDate',
    header: 'Due Date',
    render: (row) => <span className="text-ink-500 text-sm">{formatDate(row.dueDate)}</span>,
  },
];

// ---------------------------------------------------------------------------
// PerformancePage
// ---------------------------------------------------------------------------
export function PerformancePage() {
  const [tab, setTab] = useState('goals');
  const [goalSearch, setGoalSearch] = useState('');
  const [goalStatusFilter, setGoalStatusFilter] = useState('');
  const [reviewStatusFilter, setReviewStatusFilter] = useState('');

  // Stat card aggregates
  const activeGoals = useMemo(() => goals.filter((g) => g.status !== 'Completed').length, []);
  const avgProgress = useMemo(() => {
    if (!goals.length) return 0;
    return Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length);
  }, []);
  const reviewsInProgress = useMemo(
    () => reviews.filter((r) => r.status !== 'Not Started' && r.status !== 'Completed').length,
    [],
  );
  const avgRating = useMemo(() => {
    const rated = reviews.filter((r) => r.rating !== null);
    if (!rated.length) return 0;
    return (rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length).toFixed(1);
  }, []);

  // Filtered goals
  const filteredGoals = useMemo(() => {
    return goals.filter((g) => {
      const name = getEmployeeName(g.employeeId).toLowerCase();
      const matchSearch =
        !goalSearch ||
        g.title.toLowerCase().includes(goalSearch.toLowerCase()) ||
        name.includes(goalSearch.toLowerCase());
      const matchStatus = !goalStatusFilter || g.status === goalStatusFilter;
      return matchSearch && matchStatus;
    });
  }, [goalSearch, goalStatusFilter]);

  // Filtered reviews
  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => !reviewStatusFilter || r.status === reviewStatusFilter);
  }, [reviewStatusFilter]);

  // Insights data
  const ratingDist = useMemo(() => ratingDistribution(), []);
  const goalStatusData = useMemo(() => {
    const map: Partial<Record<GoalStatus, number>> = {};
    goals.forEach((g) => {
      map[g.status] = (map[g.status] ?? 0) + 1;
    });
    return (Object.entries(map) as [GoalStatus, number][]).map(([name, value]) => ({ name, value }));
  }, []);

  const goalStatusOptions: { label: string; value: string }[] = [
    { label: 'All Statuses', value: '' },
    { label: 'On Track', value: 'On Track' },
    { label: 'At Risk', value: 'At Risk' },
    { label: 'Behind', value: 'Behind' },
    { label: 'Completed', value: 'Completed' },
  ];

  const reviewStatusOptions: { label: string; value: string }[] = [
    { label: 'All Statuses', value: '' },
    { label: 'Not Started', value: 'Not Started' },
    { label: 'Self Review', value: 'Self Review' },
    { label: 'Manager Review', value: 'Manager Review' },
    { label: 'Calibration', value: 'Calibration' },
    { label: 'Completed', value: 'Completed' },
  ];

  const tabList = [
    { id: 'goals', label: 'Goals & OKRs', count: goals.length },
    { id: 'reviews', label: 'Reviews', count: reviews.length },
    { id: 'insights', label: 'Insights' },
  ];

  return (
    <div>
      <PageHeader
        title="Performance"
        subtitle="Track goals, performance reviews and ratings across the organisation."
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Active Goals"
          value={activeGoals}
          icon={<Target size={22} />}
          iconClass="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Avg Goal Progress"
          value={`${avgProgress}%`}
          icon={<TrendingUp size={22} />}
          iconClass="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Reviews In Progress"
          value={reviewsInProgress}
          icon={<ClipboardList size={22} />}
          iconClass="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Avg Rating"
          value={avgRating}
          icon={<Award size={22} />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
      </div>

      {/* Tabs */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 pt-4">
          <Tabs tabs={tabList} active={tab} onChange={setTab} />
        </div>

        {/* Goals & OKRs */}
        {tab === 'goals' && (
          <div className="p-5">
            <div className="flex flex-wrap gap-3 mb-4">
              <SearchInput
                value={goalSearch}
                onChange={setGoalSearch}
                placeholder="Search goals or owners…"
                className="w-64"
              />
              <Select
                value={goalStatusFilter}
                onChange={setGoalStatusFilter}
                options={goalStatusOptions}
                className="w-44"
              />
            </div>
            <Table
              columns={goalColumns}
              data={filteredGoals}
              keyExtractor={(r) => r.id}
              emptyMessage="No goals match your filters."
            />
          </div>
        )}

        {/* Reviews */}
        {tab === 'reviews' && (
          <div className="p-5">
            <div className="flex flex-wrap gap-3 mb-4">
              <Select
                value={reviewStatusFilter}
                onChange={setReviewStatusFilter}
                options={reviewStatusOptions}
                className="w-52"
              />
            </div>
            <Table
              columns={reviewColumns}
              data={filteredReviews}
              keyExtractor={(r) => r.id}
              emptyMessage="No reviews match your filter."
            />
          </div>
        )}

        {/* Insights */}
        {tab === 'insights' && (
          <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Rating Distribution Bar Chart */}
            <Card>
              <CardHeader title="Rating Distribution" subtitle="Completed reviews this cycle" />
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={ratingDist} barSize={36}>
                  <XAxis dataKey="rating" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', fontSize: '13px' }}
                    cursor={{ fill: '#f1f5f9' }}
                  />
                  <Bar dataKey="count" fill={BAR_COLOR} radius={[4, 4, 0, 0]} name="Employees" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Goal Status Donut */}
            <Card>
              <CardHeader title="Goal Status Breakdown" subtitle="All active & completed goals" />
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={goalStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {goalStatusData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={DONUT_COLORS[entry.name as GoalStatus] ?? '#94a3b8'}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '13px' }} />
                  <Legend
                    iconType="circle"
                    iconSize={10}
                    wrapperStyle={{ fontSize: '13px', paddingTop: '8px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            {/* Quick summary table */}
            <Card className="lg:col-span-2">
              <CardHeader title="Cycle Summary" subtitle="H1 2026 at a glance" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {goalStatusData.map((d) => (
                  <div key={d.name} className="rounded-xl bg-ink-50 p-4 text-center">
                    <p className="text-2xl font-bold text-ink-900">{d.value}</p>
                    <p className="text-sm text-ink-500 mt-1">{d.name}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
