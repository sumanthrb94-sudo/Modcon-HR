import { useState, useMemo, useEffect } from 'react';
import {
  Target,
  Star,
  ClipboardList,
  TrendingUp,
  Award,
  Plus,
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
  Modal,
  Button,
} from '@/components/ui';
import { goals, reviews, ratingDistribution, getGoals, getReviews, GOALS_CHANGED_EVENT, REVIEWS_CHANGED_EVENT, saveGoals, updateGoalProgress, updateGoalStatus, updateReviewCycleByEmployee, updateReviewerByEmployee, updateReviewStatus, updateReviewRating } from '@/data/performance';
import { getEmployeeName, employees } from '@/data/employees';
import type { Goal, PerformanceReview, GoalStatus, ReviewStatus } from '@/types';
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
const goalColumnsWithEdit = (
  onEditProgress: (id: string, p: number) => void,
  onEditStatus: (id: string, s: GoalStatus) => void,
  editingId: string | null,
  editingStatus: GoalStatus,
  setEditingStatus: (s: GoalStatus) => void,
  setEditingGoalId: (id: string | null) => void,
  hoverGoalId: string | null,
  setHoverGoalId: (id: string | null) => void,
  hoverProgress: number | null,
  setHoverProgress: (p: number | null) => void
): Column<Goal>[] => [
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
      <div
        className="w-32 cursor-pointer group relative"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const newProgress = Math.round((x / rect.width) * 100);
          const clamped = Math.max(0, Math.min(100, newProgress));
          onEditProgress(row.id, clamped);
          setHoverGoalId(null);
          setHoverProgress(null);
        }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const progress = Math.round((x / rect.width) * 100);
          const clamped = Math.max(0, Math.min(100, progress));
          setHoverGoalId(row.id);
          setHoverProgress(clamped);
        }}
        onMouseLeave={() => {
          setHoverGoalId(null);
          setHoverProgress(null);
        }}
        title="Click on the progress bar to adjust"
      >
        <ProgressBar value={row.progress} tone={progressTone(row.progress)} size="sm" showLabel />
        {hoverGoalId === row.id && hoverProgress !== null && (
          <div className="absolute -top-7 left-0 px-2 py-1 bg-ink-900 text-white text-xs font-semibold rounded whitespace-nowrap pointer-events-none">
            {hoverProgress}%
          </div>
        )}
        <div className="absolute -bottom-5 left-0 px-1 text-ink-400 text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
          Click to set
        </div>
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
    render: (row) =>
      editingId === row.id ? (
        <div className="flex items-center gap-1">
          <Select
            value={editingStatus}
            onChange={(v) => setEditingStatus(v as GoalStatus)}
            options={[
              { label: 'On Track', value: 'On Track' },
              { label: 'At Risk', value: 'At Risk' },
              { label: 'Behind', value: 'Behind' },
              { label: 'Completed', value: 'Completed' },
            ]}
            className="w-32"
          />
          <button
            className="text-xs text-brand-600 hover:text-brand-700 font-semibold"
            onClick={() => onEditStatus(row.id, editingStatus)}
          >
            ✓
          </button>
        </div>
      ) : (
        <Badge
          tone={goalStatusTone(row.status)}
          dot
          className="cursor-pointer hover:shadow-sm"
          onClick={() => {
            setEditingStatus(row.status);
            setEditingGoalId(row.id);
          }}
        >
          {row.status}
        </Badge>
      ),
  },
];

const reviewColumnsWithEdit = (
  onEditStatus: (id: string, status: ReviewStatus) => void,
  onEditRating: (id: string, rating: number | null) => void,
  editingId: string | null,
  editingStatus: ReviewStatus,
  editingRating: number | null,
  setEditingStatus: (s: ReviewStatus) => void,
  setEditingRating: (r: number | null) => void,
  setEditingReviewId: (id: string | null) => void
): Column<PerformanceReview>[] => [
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
    render: (row) =>
      editingId === row.id ? (
        <div className="flex items-center gap-2">
          <Select
            value={editingStatus}
            onChange={(v) => setEditingStatus(v as ReviewStatus)}
            options={[
              { label: 'Not Started', value: 'Not Started' },
              { label: 'Self Review', value: 'Self Review' },
              { label: 'Manager Review', value: 'Manager Review' },
              { label: 'Calibration', value: 'Calibration' },
              { label: 'Completed', value: 'Completed' },
            ]}
            className="w-32"
          />
          <button
            onClick={() => {
              onEditStatus(row.id, editingStatus);
              setEditingReviewId(null);
            }}
            className="text-ink-600 hover:text-ink-800"
          >
            ✓
          </button>
        </div>
      ) : (
        <div
          onClick={() => {
            setEditingStatus(row.status as ReviewStatus);
            setEditingReviewId(row.id);
          }}
          className="cursor-pointer"
        >
          <Badge tone={statusTone(row.status)} dot>
            {row.status}
          </Badge>
        </div>
      ),
  },
  {
    key: 'rating',
    header: 'Rating',
    render: (row) =>
      editingId === row.id ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            max="5"
            value={editingRating ?? ''}
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value) : null;
              if (val === null || (val >= 0 && val <= 5)) setEditingRating(val);
            }}
            className="input w-12"
          />
          <button
            onClick={() => {
              onEditRating(row.id, editingRating);
              setEditingReviewId(null);
            }}
            className="text-ink-600 hover:text-ink-800"
          >
            ✓
          </button>
        </div>
      ) : (
        <div
          onClick={() => {
            setEditingRating(row.rating);
            setEditingReviewId(row.id);
          }}
          className="cursor-pointer"
        >
          <StarRating rating={row.rating} />
        </div>
      ),
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
  const [goalList, setGoalList] = useState<typeof goals>(() => getGoals());
  const [reviewList, setReviewList] = useState<typeof reviews>(() => getReviews());
  const [goalSearch, setGoalSearch] = useState('');
  const [goalStatusFilter, setGoalStatusFilter] = useState('');
  const [reviewStatusFilter, setReviewStatusFilter] = useState('');

  // Create Goal Modal
  const [createGoalOpen, setCreateGoalOpen] = useState(false);
  const [formEmpId, setFormEmpId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('Business');
  const [formCycle, setFormCycle] = useState('H1 2026');
  const [formDueDate, setFormDueDate] = useState('');
  const [formWeight, setFormWeight] = useState('25');
  const [formReviewer, setFormReviewer] = useState('Aarav Sharma');
  const [formError, setFormError] = useState('');

  // Edit Goal inline
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<GoalStatus>('On Track');

  // Edit Review inline
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editingReviewStatus, setEditingReviewStatus] = useState<ReviewStatus>('Not Started');
  const [editingReviewRating, setEditingReviewRating] = useState<number | null>(null);

  // Hover progress for goals
  const [hoverGoalId, setHoverGoalId] = useState<string | null>(null);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);

  useEffect(() => {
    function handleGoalsChanged() {
      setGoalList(getGoals());
    }
    function handleReviewsChanged() {
      setReviewList(getReviews());
    }

    window.addEventListener(GOALS_CHANGED_EVENT, handleGoalsChanged);
    window.addEventListener(REVIEWS_CHANGED_EVENT, handleReviewsChanged);
    return () => {
      window.removeEventListener(GOALS_CHANGED_EVENT, handleGoalsChanged);
      window.removeEventListener(REVIEWS_CHANGED_EVENT, handleReviewsChanged);
    };
  }, []);

  function handleCreateGoal() {
    if (!formEmpId || !formTitle.trim() || !formDueDate) {
      setFormError('Please fill all required fields.');
      return;
    }
    const weight = parseInt(formWeight, 10);
    if (weight < 1 || weight > 100) {
      setFormError('Weight must be between 1 and 100.');
      return;
    }

    const newGoal: Goal = {
      id: `goal-${String(goalList.length + 1).padStart(3, '0')}`,
      employeeId: formEmpId,
      title: formTitle.trim(),
      category: formCategory,
      cycle: formCycle,
      progress: 0,
      status: 'On Track',
      dueDate: formDueDate,
      weight,
      reviewer: formReviewer,
    };
    const updated = [newGoal, ...getGoals()];
    saveGoals(updated);
    setGoalList(updated);
    // Update review cycle and reviewer to match goal
    updateReviewCycleByEmployee(formEmpId, formCycle);
    updateReviewerByEmployee(formEmpId, formReviewer);
    setCreateGoalOpen(false);
    setFormEmpId('');
    setFormTitle('');
    setFormCategory('Business');
    setFormCycle('H1 2026');
    setFormDueDate('');
    setFormWeight('25');
    setFormReviewer('Aarav Sharma');
    setFormError('');
  }

  function handleUpdateGoalProgress(goalId: string, newProgress: number) {
    updateGoalProgress(goalId, newProgress);
    setEditingGoalId(null);
  }

  function handleUpdateGoalStatus(goalId: string, newStatus: GoalStatus) {
    updateGoalStatus(goalId, newStatus);
    setEditingGoalId(null);
  }

  function handleUpdateReviewStatus(reviewId: string, newStatus: ReviewStatus) {
    updateReviewStatus(reviewId, newStatus);
    setEditingReviewId(null);
  }

  function handleUpdateReviewRating(reviewId: string, newRating: number | null) {
    updateReviewRating(reviewId, newRating);
    setEditingReviewId(null);
  }

  // Stat card aggregates
  const activeGoals = useMemo(() => goalList.filter((g) => g.status !== 'Completed').length, [goalList]);
  const avgProgress = useMemo(() => {
    if (!goalList.length) return 0;
    return Math.round(goalList.reduce((s, g) => s + g.progress, 0) / goalList.length);
  }, [goalList]);
  const reviewsInProgress = useMemo(
    () => reviewList.filter((r) => r.status !== 'Not Started' && r.status !== 'Completed').length,
    [reviewList],
  );
  const avgRating = useMemo(() => {
    const rated = reviewList.filter((r) => r.rating !== null);
    if (!rated.length) return 0;
    return (rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length).toFixed(1);
  }, [reviewList]);

  // Filtered goals
  const filteredGoals = useMemo(() => {
    return goalList.filter((g) => {
      const name = getEmployeeName(g.employeeId).toLowerCase();
      const matchSearch =
        !goalSearch ||
        g.title.toLowerCase().includes(goalSearch.toLowerCase()) ||
        name.includes(goalSearch.toLowerCase());
      const matchStatus = !goalStatusFilter || g.status === goalStatusFilter;
      return matchSearch && matchStatus;
    });
  }, [goalList, goalSearch, goalStatusFilter]);

  // Filtered reviews
  const filteredReviews = useMemo(() => {
    return reviewList.filter((r) => !reviewStatusFilter || r.status === reviewStatusFilter);
  }, [reviewList, reviewStatusFilter]);

  // Insights data
  const ratingDist = useMemo(() => ratingDistribution(reviewList), [reviewList]);
  const goalStatusData = useMemo(() => {
    const map: Partial<Record<GoalStatus, number>> = {};
    goalList.forEach((g) => {
      map[g.status] = (map[g.status] ?? 0) + 1;
    });
    return (Object.entries(map) as [GoalStatus, number][]).map(([name, value]) => ({ name, value }));
  }, [goalList]);

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
    { id: 'goals', label: 'Goals & OKRs', count: goalList.length },
    { id: 'reviews', label: 'Reviews', count: reviewList.length },
    { id: 'insights', label: 'Insights' },
  ];

  return (
    <div>
      <PageHeader
        title="Performance"
        subtitle="Track goals, performance reviews and ratings across the organisation."
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setCreateGoalOpen(true)}
          >
            Create Goal
          </Button>
        }
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
              columns={goalColumnsWithEdit(handleUpdateGoalProgress, handleUpdateGoalStatus, editingGoalId, editingStatus, setEditingStatus, setEditingGoalId, hoverGoalId, setHoverGoalId, hoverProgress, setHoverProgress)}
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
              columns={reviewColumnsWithEdit(handleUpdateReviewStatus, handleUpdateReviewRating, editingReviewId, editingReviewStatus, editingReviewRating, setEditingReviewStatus, setEditingReviewRating, setEditingReviewId)}
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

      {/* Create Goal Modal */}
      <Modal
        open={createGoalOpen}
        onClose={() => {
          setCreateGoalOpen(false);
          setFormError('');
        }}
        title="Create Goal"
        subtitle="Add a new goal or OKR for an employee"
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateGoalOpen(false);
                setFormError('');
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateGoal} icon={<Plus size={15} />}>
              Create Goal
            </Button>
          </>
        }
      >
        {formError && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
            {formError}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="label">
              Employee <span className="text-rose-500">*</span>
            </label>
            <Select
              className="mt-1"
              value={formEmpId}
              onChange={setFormEmpId}
              options={employees.map((e) => ({ label: e.fullName, value: e.id }))}
              placeholder="Select employee"
            />
          </div>
          <div>
            <label className="label">
              Goal Title <span className="text-rose-500">*</span>
            </label>
            <input
              className="input mt-1"
              placeholder="e.g. Ship 5 new features by Q4"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <Select
                className="mt-1"
                value={formCategory}
                onChange={setFormCategory}
                options={[
                  { label: 'Business', value: 'Business' },
                  { label: 'Technical', value: 'Technical' },
                  { label: 'Personal Growth', value: 'Personal Growth' },
                ]}
              />
            </div>
            <div>
              <label className="label">Cycle</label>
              <Select
                className="mt-1"
                value={formCycle}
                onChange={setFormCycle}
                options={[
                  { label: 'H1 2026', value: 'H1 2026' },
                  { label: 'H2 2026', value: 'H2 2026' },
                  { label: 'H1 2027', value: 'H1 2027' },
                  { label: 'H2 2027', value: 'H2 2027' },
                ]}
              />
            </div>
          </div>
          <div>
            <label className="label">
              Due Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              className="input mt-1"
              value={formDueDate}
              onChange={(e) => setFormDueDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Weight (%)</label>
            <input
              type="number"
              min="1"
              max="100"
              className="input mt-1"
              value={formWeight}
              onChange={(e) => setFormWeight(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Reviewer</label>
            <Select
              className="mt-1"
              value={formReviewer}
              onChange={setFormReviewer}
              options={employees.map((e) => ({ label: e.fullName, value: e.fullName }))}
              placeholder="Select reviewer"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
