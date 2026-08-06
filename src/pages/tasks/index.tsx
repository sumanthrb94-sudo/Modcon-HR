import { useMemo, useState } from 'react';
import { ListChecks, Plus, Trash2, CircleDot, CheckCircle2, Clock } from 'lucide-react';

import {
  PageHeader, Card, Badge, Button, Table, Modal, StatCard, Select, Tabs,
  SearchInput, EmptyState, type Column,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { getCurrentEmployeeRecord } from '@/lib/dataScope';
import { formatDate } from '@/lib/utils';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TaskError,
  assignableEmployees,
  canAssignAnyone,
  canAssignTasks,
  createTask,
  deleteTask,
  setTaskStatus,
  useTasks,
} from '@/lib/tasks';
import type { Task, TaskPriority, TaskStatus } from '@/types';

/**
 * Work assigned to people, and what became of it.
 *
 * Two views, because they answer different questions and are read by different
 * people. "My tasks" is what I have been asked to do and the only place I can
 * move it along — every employee has this, which is what "track their own
 * tasks" means. "Team tasks" is what I have handed out and where it has got to:
 * my own reports for a lead, the whole organisation for HR and Admin.
 *
 * Who may assign, and to whom, is src/lib/tasks.ts; what is actually enforced
 * is the `tasks` block in firestore.rules. This page only draws the controls.
 */
function statusTone(status: TaskStatus): 'green' | 'blue' | 'amber' {
  if (status === 'Completed') return 'green';
  if (status === 'In Progress') return 'blue';
  return 'amber';
}

function priorityTone(priority: TaskPriority): 'red' | 'amber' | 'gray' {
  if (priority === 'High') return 'red';
  if (priority === 'Medium') return 'amber';
  return 'gray';
}

export function TasksPage() {
  const { profile } = useAuth();
  const directoryRevision = useEmployeeDirectoryRevision();
  const [tab, setTab] = useState<'mine' | 'team'>('mine');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);

  const mine = useTasks(profile, 'mine');
  const team = useTasks(profile, 'team');
  const active = tab === 'mine' ? mine : team;

  const canAssign = useMemo(() => canAssignTasks(profile), [profile, directoryRevision]);
  const selfId = useMemo(() => getCurrentEmployeeRecord(profile)?.id, [profile, directoryRevision]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return active.tasks.filter((task) => {
      const matchesSearch =
        !query ||
        task.title.toLowerCase().includes(query) ||
        task.assigneeName.toLowerCase().includes(query) ||
        (task.requestedByCompany ?? '').toLowerCase().includes(query);
      return matchesSearch && (!statusFilter || task.status === statusFilter);
    });
  }, [active.tasks, search, statusFilter]);

  // Counted from what I have been asked to do, not from the team view: the
  // headline numbers on a page everyone can open should mean the same thing
  // for everyone who opens it.
  const openCount = mine.tasks.filter((task) => task.status !== 'Completed').length;
  const inProgress = mine.tasks.filter((task) => task.status === 'In Progress').length;
  const doneCount = mine.tasks.filter((task) => task.status === 'Completed').length;
  const overdue = mine.tasks.filter(
    (task) => task.status !== 'Completed' && task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10),
  ).length;

  const columns: Column<Task>[] = [
    {
      key: 'title',
      header: 'Task',
      render: (task) => (
        <div data-testid="task-row" data-task-title={task.title}>
          <p className="font-medium text-ink-900 text-sm">{task.title}</p>
          <p className="text-xs text-ink-400">
            {task.assigneeName}
            {task.requestedBy || task.requestedByCompany ? (
              // Named on the row rather than buried in the detail: the point of
              // recording who asked is that the person doing the work knows.
              <span className="text-ink-500">
                {' · for '}
                {[task.requestedBy, task.requestedByCompany].filter(Boolean).join(', ')}
              </span>
            ) : null}
          </p>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (task) => <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>,
    },
    {
      key: 'due',
      header: 'Due',
      render: (task) => (
        <span className="text-sm text-ink-600">{task.dueDate ? formatDate(task.dueDate) : '—'}</span>
      ),
    },
    {
      key: 'assignedBy',
      header: 'Assigned by',
      render: (task) => <span className="text-sm text-ink-600">{task.assignedByName}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (task) =>
        // The assignee is the only person offered the control, matching the
        // rules: everyone else sees where it has got to.
        task.assigneeId === selfId ? (
          <select
            className="input !py-1 !text-xs w-32"
            aria-label={`Status of ${task.title}`}
            value={task.status}
            onChange={(event) => void setTaskStatus(task.id, event.target.value as TaskStatus)}
          >
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        ) : (
          <Badge tone={statusTone(task.status)}>{task.status}</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (task) =>
        task.assignedByUid === profile?.uid || canAssignAnyone(profile) ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={13} />}
            onClick={() => void deleteTask(task.id)}
            title="Withdraw this task"
          >
            Withdraw
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tasks"
        subtitle="Work assigned to people, and where it has got to."
        actions={
          canAssign ? (
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAssignOpen(true)}>
              Assign Task
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open" value={openCount} icon={<ListChecks size={22} />} iconClass="bg-brand-50 text-brand-600" />
        <StatCard label="In Progress" value={inProgress} icon={<CircleDot size={22} />} iconClass="bg-blue-50 text-blue-600" />
        <StatCard label="Completed" value={doneCount} icon={<CheckCircle2 size={22} />} iconClass="bg-emerald-50 text-emerald-600" />
        <StatCard label="Overdue" value={overdue} icon={<Clock size={22} />} iconClass="bg-amber-50 text-amber-600" />
      </div>

      <Card padding={false}>
        <div className="px-5 pt-4">
          <Tabs
            tabs={[
              { id: 'mine', label: 'My Tasks', count: mine.tasks.length },
              { id: 'team', label: canAssignAnyone(profile) ? 'All Tasks' : 'Team Tasks', count: team.tasks.length },
            ]}
            active={tab}
            onChange={(next) => setTab(next as 'mine' | 'team')}
          />
        </div>
        <div className="p-5">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <SearchInput value={search} onChange={setSearch} placeholder="Search tasks…" className="flex-1 max-w-xs" />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={[{ label: 'All statuses', value: '' }, ...TASK_STATUSES.map((s) => ({ label: s, value: s }))]}
              placeholder="All statuses"
              className="w-44"
            />
          </div>

          {/* The rules deploy separately from the app, so a refused listener is
              a real state — an empty list would otherwise read as "no work",
              which is a different and more reassuring thing. */}
          {active.error && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
              These tasks could not be loaded. Your account may not have access to them.
            </p>
          )}

          {!active.loading && visible.length === 0 && !active.error ? (
            <EmptyState
              icon={<ListChecks size={24} />}
              title={tab === 'mine' ? 'Nothing assigned to you' : 'Nothing assigned yet'}
              description={
                tab === 'mine'
                  ? 'Work assigned to you will appear here, and this is where you move it along.'
                  : canAssign
                    ? 'Assign a task and it will show up here.'
                    : 'You will see work here once somebody who reports to you has some.'
              }
            />
          ) : (
            <Table columns={columns} data={visible} keyExtractor={(task) => task.id} />
          )}
        </div>
      </Card>

      <AssignTaskModal open={assignOpen} onClose={() => setAssignOpen(false)} />
    </div>
  );
}

function AssignTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const directoryRevision = useEmployeeDirectoryRevision();
  const [assigneeId, setAssigneeId] = useState('');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [requestedByCompany, setRequestedByCompany] = useState('');
  const [error, setError] = useState('');

  const options = useMemo(() => assignableEmployees(profile), [profile, directoryRevision]);

  function reset() {
    setAssigneeId('');
    setTitle('');
    setDetails('');
    setPriority('Medium');
    setDueDate('');
    setRequestedBy('');
    setRequestedByCompany('');
    setError('');
  }

  async function handleSave() {
    try {
      await createTask(profile, {
        assigneeId,
        title,
        details,
        priority,
        dueDate,
        requestedBy,
        requestedByCompany,
      });
    } catch (err) {
      // Includes permission-denied from firestore.rules, which is the check
      // that actually decides — the filtered dropdown is the page being polite.
      setError(
        err instanceof TaskError
          ? err.message
          : 'That assignment was refused. You may only assign work to people who report to you.',
      );
      return;
    }
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Assign Task"
      subtitle="Give somebody a piece of work and a date for it"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button variant="primary" onClick={() => void handleSave()}>Assign Task</Button>
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
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Assign to</label>
          {/* Only people this account may assign to. The list being short is
              the rule showing through, not a bug. */}
          <select
            className="input w-full"
            aria-label="Task assignee"
            value={assigneeId}
            onChange={(event) => { setAssigneeId(event.target.value); setError(''); }}
          >
            <option value="">Select an employee</option>
            {options.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName} — {employee.designation}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Task</label>
          <input
            className="input w-full"
            aria-label="Task title"
            placeholder="What needs doing"
            value={title}
            onChange={(event) => { setTitle(event.target.value); setError(''); }}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5">Details</label>
          <textarea
            className="input w-full"
            rows={3}
            aria-label="Task details"
            placeholder="Anything the person needs to know"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5">Priority</label>
            <select
              className="input w-full"
              aria-label="Task priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
            >
              {TASK_PRIORITIES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5">Due date</label>
            <input
              className="input w-full"
              type="date"
              aria-label="Task due date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
        </div>

        {/* Clients and customers have no accounts here — see src/lib/tasks.ts.
            Recording who asked is what makes the work traceable without letting
            an outsider read into the organisation. */}
        <div className="rounded-xl border border-ink-100 p-4">
          <p className="text-xs font-semibold text-ink-600 mb-1">Requested by a client or customer?</p>
          <p className="text-xs text-ink-400 mb-3">
            Optional. Recorded on the task so whoever does the work knows who asked. Clients do not
            sign in and see nothing in this app.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              className="input w-full"
              aria-label="Requested by name"
              placeholder="Contact name"
              value={requestedBy}
              onChange={(event) => setRequestedBy(event.target.value)}
            />
            <input
              className="input w-full"
              aria-label="Requested by company"
              placeholder="Company"
              value={requestedByCompany}
              onChange={(event) => setRequestedByCompany(event.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
