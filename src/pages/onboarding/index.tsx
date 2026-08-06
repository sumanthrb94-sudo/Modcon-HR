import { useState, useMemo, useCallback, useEffect, type ReactNode } from 'react';
import {
  CheckSquare,
  ClipboardList,
  TrendingUp,
  Users,
  ChevronDown,
  ChevronUp,
  Check,
  Circle,
  Clock,
  Calendar,
  User,
  Tag,
  Plus,
} from 'lucide-react';
import {
  PageHeader,
  StatCard,
  Badge,
  Avatar,
  Card,
  ProgressBar,
  Modal,
  Button,
} from '@/components/ui';
import { formatDate, cn } from '@/lib/utils';
import { getOnboardings, saveOnboardings, standardTaskTemplate } from '@/data/onboarding';
import { getEmployeeDirectory } from '@/data/employees';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { getPermissionLevel, resolveAppRole } from '@/lib/accessControl';
import { useAuth } from '@/lib/auth';
import { orgScopedKey } from '@/lib/orgScope';
import type { Employee, Onboarding, OnboardingTask, TaskStatus } from '@/types';

const ONBOARDING_STATE_STORAGE_KEY = 'modcon.hr.onboarding.state';

function readStoredOnboardings(): Onboarding[] | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(orgScopedKey(ONBOARDING_STATE_STORAGE_KEY));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;

    return parsed as Onboarding[];
  } catch {
    return null;
  }
}

function writeStoredOnboardings(onboardings: Onboarding[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(ONBOARDING_STATE_STORAGE_KEY), JSON.stringify(onboardings));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeProgress(tasks: OnboardingTask[]): number {
  if (!tasks.length) return 0;
  const done = tasks.filter((t) => t.status === 'Completed').length;
  return Math.round((done / tasks.length) * 100);
}

function isCompletedThisMonth(ob: Onboarding): boolean {
  if (ob.progress < 100) return false;
  const now = new Date();
  const start = new Date(ob.startDate);
  return start.getMonth() === now.getMonth() && start.getFullYear() === now.getFullYear();
}

type TaskCategory = OnboardingTask['category'];

const CATEGORY_ORDER: TaskCategory[] = [
  'Documentation',
  'IT Setup',
  'Orientation',
  'Compliance',
  'Training',
];

const CATEGORY_ICONS: Record<TaskCategory, ReactNode> = {
  Documentation: <ClipboardList size={14} />,
  'IT Setup': <CheckSquare size={14} />,
  Orientation: <Users size={14} />,
  Compliance: <Tag size={14} />,
  Training: <TrendingUp size={14} />,
};

const CATEGORY_COLOR: Record<TaskCategory, string> = {
  Documentation: 'bg-blue-50 text-blue-700 border-blue-200',
  'IT Setup': 'bg-violet-50 text-violet-700 border-violet-200',
  Orientation: 'bg-amber-50 text-amber-700 border-amber-200',
  Compliance: 'bg-rose-50 text-rose-700 border-rose-200',
  Training: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function taskStatusIcon(status: TaskStatus) {
  if (status === 'Completed') return <Check size={14} className="text-emerald-600" />;
  if (status === 'In Progress') return <Clock size={14} className="text-amber-500" />;
  return <Circle size={14} className="text-ink-300" />;
}

function progressTone(value: number): 'green' | 'brand' | 'amber' | 'red' {
  if (value >= 100) return 'green';
  if (value >= 60) return 'brand';
  if (value >= 30) return 'amber';
  return 'red';
}

function deptBadgeTone(dept: string) {
  const map: Record<string, 'blue' | 'violet' | 'green' | 'amber' | 'cyan' | 'pink' | 'gray'> = {
    Engineering: 'blue',
    Design: 'violet',
    Sales: 'green',
    Marketing: 'amber',
    Product: 'cyan',
    'Human Resources': 'pink',
    Finance: 'gray',
    Operations: 'gray',
    'Customer Success': 'green',
    Legal: 'amber',
  };
  return map[dept] ?? 'gray';
}

// ---------------------------------------------------------------------------
// Mutable state type
// ---------------------------------------------------------------------------

interface OnboardingState {
  onboardings: Onboarding[];
}

// ---------------------------------------------------------------------------
// Task Row
// ---------------------------------------------------------------------------

interface TaskRowProps {
  task: OnboardingTask;
  onToggle: () => void;
}

function TaskRow({ task, onToggle }: TaskRowProps) {
  const isDone = task.status === 'Completed';
  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors cursor-pointer group',
        isDone ? 'bg-emerald-50/50 hover:bg-emerald-50' : 'hover:bg-ink-50',
      )}
      onClick={onToggle}
    >
      {/* Checkbox */}
      <div
        className={cn(
          'h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
          isDone
            ? 'bg-emerald-500 border-emerald-500'
            : 'border-ink-300 group-hover:border-brand-400',
        )}
      >
        {isDone && <Check size={12} className="text-white" strokeWidth={3} />}
      </div>

      {/* Title */}
      <span
        className={cn(
          'flex-1 text-sm transition-colors',
          isDone ? 'line-through text-ink-400' : 'text-ink-800',
        )}
      >
        {task.title}
      </span>

      {/* Status */}
      <div className="shrink-0">{taskStatusIcon(task.status)}</div>

      {/* Due date */}
      <div className="flex items-center gap-1 text-xs text-ink-400 shrink-0">
        <Calendar size={11} />
        {formatDate(task.dueDate)}
      </div>

      {/* Assignee */}
      <div className="flex items-center gap-1 text-xs text-ink-400 shrink-0">
        <User size={11} />
        {task.assignee}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Checklist (grouped by category)
// ---------------------------------------------------------------------------

interface TaskChecklistProps {
  tasks: OnboardingTask[];
  onToggleTask: (taskId: string) => void;
}

function TaskChecklist({ tasks, onToggleTask }: TaskChecklistProps) {
  const grouped = useMemo(() => {
    const map = new Map<TaskCategory, OnboardingTask[]>();
    CATEGORY_ORDER.forEach((cat) => map.set(cat, []));
    tasks.forEach((t) => {
      const arr = map.get(t.category);
      if (arr) arr.push(t);
    });
    return map;
  }, [tasks]);

  return (
    <div className="space-y-4">
      {CATEGORY_ORDER.map((cat) => {
        const catTasks = grouped.get(cat) ?? [];
        if (!catTasks.length) return null;
        const done = catTasks.filter((t) => t.status === 'Completed').length;
        return (
          <div key={cat}>
            <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 mb-1.5', CATEGORY_COLOR[cat])}>
              {CATEGORY_ICONS[cat]}
              <span className="text-xs font-semibold">{cat}</span>
              <span className="ml-auto text-xs font-bold">{done}/{catTasks.length}</span>
            </div>
            <div className="space-y-0.5">
              {catTasks.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={() => onToggleTask(task.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onboarding Card (expandable inline)
// ---------------------------------------------------------------------------

interface OnboardingCardProps {
  onboarding: Onboarding;
  onToggleTask: (onboardingId: string, taskId: string) => void;
}

function OnboardingCard({ onboarding, onToggleTask }: OnboardingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const progress = onboarding.progress;
  const totalTasks = onboarding.tasks.length;
  const doneTasks = onboarding.tasks.filter((t) => t.status === 'Completed').length;
  const pendingTasks = onboarding.tasks.filter((t) => t.status === 'Pending').length;

  return (
    <>
      <Card className="overflow-hidden" padding={false}>
        {/* Header */}
        <div className="p-5">
          <div className="flex items-start gap-4">
            <Avatar name={onboarding.employeeName} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-ink-900">{onboarding.employeeName}</h3>
                  <p className="text-sm text-ink-500 mt-0.5">{onboarding.designation}</p>
                </div>
                <Badge tone={deptBadgeTone(onboarding.department)}>{onboarding.department}</Badge>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-500">
                <span className="flex items-center gap-1">
                  <Calendar size={11} />
                  Starts {formatDate(onboarding.startDate)}
                </span>
                <span className="flex items-center gap-1">
                  <User size={11} />
                  Buddy: {onboarding.buddy}
                </span>
                <span className="flex items-center gap-1">
                  <CheckSquare size={11} />
                  {doneTasks}/{totalTasks} tasks
                </span>
                {pendingTasks > 0 && (
                  <Badge tone="amber" dot>{pendingTasks} pending</Badge>
                )}
                {progress === 100 && (
                  <Badge tone="green" dot>Completed</Badge>
                )}
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-ink-500">Progress</span>
                  <span className="text-xs font-semibold text-ink-700">{progress}%</span>
                </div>
                <ProgressBar value={progress} tone={progressTone(progress)} size="md" />
              </div>
            </div>
          </div>
        </div>

        {/* Expand / Detail buttons */}
        <div className="px-5 pb-3 flex items-center gap-2 border-t border-ink-100 pt-3">
          <button
            className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Hide tasks' : 'Show tasks'}
          </button>
          <button
            className="ml-auto flex items-center gap-1 text-xs text-ink-400 hover:text-ink-600 transition-colors"
            onClick={() => setDetailOpen(true)}
          >
            View full checklist
          </button>
        </div>

        {/* Inline expanded checklist */}
        {expanded && (
          <div className="border-t border-ink-100 p-5 bg-ink-50/50">
            <TaskChecklist
              tasks={onboarding.tasks}
              onToggleTask={(tid) => onToggleTask(onboarding.id, tid)}
            />
          </div>
        )}
      </Card>

      {/* Full-detail modal */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={`${onboarding.employeeName}'s Onboarding`}
        subtitle={`${onboarding.designation} · ${onboarding.department}`}
        size="lg"
      >
        <div className="space-y-5">
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-ink-400 font-medium uppercase tracking-wide">Start Date</p>
              <p className="text-ink-800 mt-1 font-medium">{formatDate(onboarding.startDate)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-400 font-medium uppercase tracking-wide">Buddy</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Avatar name={onboarding.buddy} size="xs" />
                <span className="text-ink-800 font-medium">{onboarding.buddy}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-ink-400 font-medium uppercase tracking-wide">Progress</p>
              <div className="flex items-center gap-2 mt-1">
                <ProgressBar value={progress} tone={progressTone(progress)} size="sm" className="flex-1" />
                <span className="text-sm font-bold text-ink-800">{progress}%</span>
              </div>
            </div>
          </div>

          {/* Task checklist */}
          <div>
            <p className="text-sm font-semibold text-ink-800 mb-3">
              Tasks — {doneTasks}/{totalTasks} completed
            </p>
            <TaskChecklist
              tasks={onboarding.tasks}
              onToggleTask={(tid) => onToggleTask(onboarding.id, tid)}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function OnboardingPage() {
  // Shared store rather than a page-local copy, so the notification feed and
  // anything else counting outstanding tasks sees the same progress.
  const [onboardings, setOnboardingsState] = useState<Onboarding[]>(() => getOnboardings());

  const setOnboardings = useCallback(
    (updater: (prev: Onboarding[]) => Onboarding[]) => {
      setOnboardingsState((prev) => saveOnboardings(updater(prev)));
    },
    [],
  );

  const handleToggleTask = useCallback((onboardingId: string, taskId: string) => {
    setOnboardings((prev) =>
      prev.map((ob) => {
        if (ob.id !== onboardingId) return ob;
        const newTasks = ob.tasks.map((t): OnboardingTask => {
          if (t.id !== taskId) return t;
          const nextStatus: TaskStatus = t.status === 'Completed' ? 'Pending' : 'Completed';
          return { ...t, status: nextStatus };
        });
        return { ...ob, tasks: newTasks, progress: computeProgress(newTasks) };
      }),
    );
  }, []);

  const { profile } = useAuth();
  const directoryRevision = useEmployeeDirectoryRevision();
  const [startOpen, setStartOpen] = useState(false);
  // HR and Admin. There was no way to start one at all, so the page could only
  // ever show what the seed happened to contain — an organisation that hired
  // somebody had nowhere to say so, and every figure above read 0.
  const canManageOnboarding = getPermissionLevel('Onboarding', resolveAppRole(profile)) === 'full';

  /** Everyone who has no onboarding record yet — the rest are already tracked. */
  const startableEmployees = useMemo(
    () => {
      const tracked = new Set(onboardings.map((ob) => ob.employeeId));
      return getEmployeeDirectory().filter((employee) => !tracked.has(employee.id));
    },
    [onboardings, directoryRevision],
  );

  const handleStartOnboarding = useCallback(
    (employeeId: string, startDate: string, buddy: string) => {
      const employee = getEmployeeDirectory().find((item) => item.id === employeeId);
      if (!employee) return;
      const id = `ob-${employeeId}-${Date.now().toString(36)}`;
      const tasks: OnboardingTask[] = standardTaskTemplate.map((template, index) => ({
        ...template,
        id: `${id}-t${String(index + 1).padStart(2, '0')}`,
        // The template carries no dates — they only mean anything relative to
        // the day somebody actually starts.
        dueDate: startDate,
      }));
      setOnboardings((prev) => [
        {
          id,
          employeeId,
          employeeName: employee.fullName,
          designation: employee.designation,
          department: employee.department,
          startDate,
          buddy,
          progress: computeProgress(tasks),
          tasks,
        },
        ...prev,
      ]);
      setStartOpen(false);
    },
    [setOnboardings],
  );

  const stats = useMemo(() => {
    // `> 0` used to be part of this, so an onboarding whose first task had not
    // been ticked yet counted as nothing at all — a new hire on day one is the
    // clearest case of one in progress, and the card read 0 for exactly the
    // people it exists to track.
    const inProgress = onboardings.filter((o) => o.progress < 100).length;
    const completedThisMonth = onboardings.filter(isCompletedThisMonth).length;
    const tasksPending = onboardings.reduce(
      (sum, o) => sum + o.tasks.filter((t) => t.status === 'Pending').length,
      0,
    );
    const avgCompletion =
      onboardings.length > 0
        ? Math.round(onboardings.reduce((sum, o) => sum + o.progress, 0) / onboardings.length)
        : 0;
    return { inProgress, completedThisMonth, tasksPending, avgCompletion };
  }, [onboardings]);

  return (
    <div>
      <PageHeader
        title="Onboarding"
        subtitle="Track new hire progress, manage tasks, and ensure a smooth first-day experience."
        actions={canManageOnboarding ? (
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setStartOpen(true)}>
            Start Onboarding
          </Button>
        ) : undefined}
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Onboarding In Progress"
          value={stats.inProgress}
          icon={<ClipboardList size={22} />}
          iconClass="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Completed This Month"
          value={stats.completedThisMonth}
          icon={<CheckSquare size={22} />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Tasks Pending"
          value={stats.tasksPending}
          icon={<Circle size={22} />}
          iconClass="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Avg Completion"
          value={`${stats.avgCompletion}%`}
          icon={<TrendingUp size={22} />}
          iconClass="bg-violet-50 text-violet-600"
        />
      </div>

      {/* Onboarding cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {onboardings.map((ob) => (
          <OnboardingCard
            key={ob.id}
            onboarding={ob}
            onToggleTask={handleToggleTask}
          />
        ))}
      </div>

      <StartOnboardingModal
        open={startOpen}
        onClose={() => setStartOpen(false)}
        employees={startableEmployees}
        onStart={handleStartOnboarding}
      />
    </div>
  );
}

/**
 * Begin a checklist for somebody who has joined.
 *
 * The tasks come from `standardTaskTemplate` rather than being typed here: the
 * point of a template is that every hire gets the same start, and a checklist
 * assembled by hand each time is one that quietly differs per hire.
 */
function StartOnboardingModal({
  open,
  onClose,
  employees,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  onStart: (employeeId: string, startDate: string, buddy: string) => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [buddy, setBuddy] = useState('');
  const [error, setError] = useState('');

  function reset() {
    setEmployeeId('');
    setStartDate('');
    setBuddy('');
    setError('');
  }

  function handleStart() {
    if (!employeeId) {
      setError('Pick the person who has joined.');
      return;
    }
    if (!startDate) {
      setError('A start date is what every task in the checklist is dated from.');
      return;
    }
    onStart(employeeId, startDate, buddy.trim() || '—');
    reset();
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Start Onboarding"
      subtitle="Open the standard checklist for a new hire"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button variant="primary" onClick={handleStart}>Start Onboarding</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">New hire</label>
          {/* Anyone not already tracked. Somebody with a checklist open is
              absent rather than disabled — a second one would split their
              progress across two records. */}
          <select
            className="input w-full"
            aria-label="Onboarding employee"
            value={employeeId}
            onChange={(event) => { setEmployeeId(event.target.value); setError(''); }}
          >
            <option value="">Select an employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName} — {employee.designation}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5">Start date</label>
            <input
              className="input w-full"
              type="date"
              aria-label="Onboarding start date"
              value={startDate}
              onChange={(event) => { setStartDate(event.target.value); setError(''); }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5">Buddy</label>
            <input
              className="input w-full"
              aria-label="Onboarding buddy"
              placeholder="Who is showing them around"
              value={buddy}
              onChange={(event) => setBuddy(event.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
