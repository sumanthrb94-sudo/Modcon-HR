/**
 * Work assigned to an employee, and who is allowed to assign or see it.
 *
 * ## Who may assign
 *
 * The request this was built from named eight kinds of assigner — senior
 * employees, team leads, project managers, direct managers, leadership,
 * executives, supervisors, and clients. Seven of those are the same structural
 * fact wearing different job titles: somebody has people reporting to them.
 * That fact already exists in the reporting tree, so it is what decides here,
 * and no new role had to be invented to hold it:
 *
 *   - anyone with direct reports assigns to anyone beneath them in the tree;
 *   - `full` on the Tasks module (Admin and HR Manager by default) assigns to
 *     anyone in the organisation;
 *   - everyone else assigns to nobody, and still sees their own tasks.
 *
 * A company that organises differently tunes the module in Settings → Roles &
 * Permissions rather than asking for code.
 *
 * The eighth — clients and customers — are not accounts. Every read in this app
 * is scoped to members of an organisation, and letting outsiders sign in is a
 * different and much larger decision than recording who asked for the work. A
 * task therefore carries an optional `requestedBy`, filled in by the internal
 * person raising it. The client sees nothing, because the client is not here.
 *
 * ## Who may see it
 *
 * Its assignee, whoever assigned it, anyone above the assignee in the reporting
 * tree, and the organisation's administrators. That is the same shape as leave,
 * and it rests on the same denormalised `managerChainIds` — `firestore.rules`
 * cannot walk `reportingManagerId`, because the directory it lives in is
 * localStorage and therefore a claim rather than evidence.
 *
 * None of the checks in this file are the boundary. They decide which controls
 * to draw; `firestore.rules` decides what happens.
 */
import { useEffect, useState } from 'react';
import { deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';

import { Collections } from '@/lib/db';
import { getPermissionLevel, resolveAppRole } from '@/lib/accessControl';
import { getCurrentEmployeeRecord } from '@/lib/dataScope';
import { getEmployeeDirectory } from '@/data/employees';
import { DEFAULT_ORG_KEY } from '@/lib/orgScope';
import { nowInstant, todayIso } from '@/lib/today';
import type { UserProfile } from '@/lib/auth';
import type { Employee, Task, TaskPriority, TaskStatus } from '@/types';

export class TaskError extends Error {}

export const TASK_STATUSES: TaskStatus[] = ['Pending', 'In Progress', 'Completed'];
export const TASK_PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High'];

/**
 * The `orgId` stamped on a task.
 *
 * The `'default'` string, never null, for the legacy org — a null is invisible
 * to `where('orgId','==',…)`, which every read here depends on.
 */
export function taskOrgId(profile: UserProfile | null): string {
  return profile?.orgId || DEFAULT_ORG_KEY;
}

/** Everyone above `employeeId` in the reporting tree, nearest manager first. */
export function managerChainFor(employeeId: string, directory: Employee[] = getEmployeeDirectory()): string[] {
  const managerOf = new Map(directory.map((employee) => [employee.id, employee.reportingManagerId ?? null]));
  const chain: string[] = [];
  // Guarded against a cycle in the reporting data (A reports to B reports to
  // A), which is reachable — reporting lines are editable from the profile.
  const seen = new Set<string>([employeeId]);
  let current = managerOf.get(employeeId) ?? null;
  while (current && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current = managerOf.get(current) ?? null;
  }
  return chain;
}

/** Everyone at or beneath `rootId`, excluding the root. */
function subtreeOf(rootId: string, directory: Employee[]): Employee[] {
  const childrenOf = new Map<string, Employee[]>();
  directory.forEach((employee) => {
    const parent = employee.reportingManagerId;
    if (!parent) return;
    const list = childrenOf.get(parent);
    if (list) list.push(employee);
    else childrenOf.set(parent, [employee]);
  });

  const out: Employee[] = [];
  const seen = new Set<string>([rootId]);
  const queue = [...(childrenOf.get(rootId) ?? [])];
  while (queue.length) {
    const next = queue.shift() as Employee;
    if (seen.has(next.id)) continue;
    seen.add(next.id);
    out.push(next);
    queue.push(...(childrenOf.get(next.id) ?? []));
  }
  return out;
}

/** True when this account may assign to anyone in the organisation. */
export function canAssignAnyone(profile: UserProfile | null): boolean {
  return getPermissionLevel('Tasks', resolveAppRole(profile)) === 'full';
}

/**
 * The people this account may assign work to.
 *
 * Org-wide for `full`; otherwise the caller's own reporting subtree, which is
 * what makes a team lead or a supervisor an assigner without a role of their
 * own. Empty for somebody with neither — and an empty list is why the page
 * does not offer the control at all.
 */
export function assignableEmployees(
  profile: UserProfile | null,
  directory: Employee[] = getEmployeeDirectory(),
): Employee[] {
  if (!profile) return [];
  if (canAssignAnyone(profile)) return directory;
  const self = getCurrentEmployeeRecord(profile, directory);
  if (!self) return [];
  return subtreeOf(self.id, directory);
}

/** Whether to offer the assign control. Presentation only — see the file header. */
export function canAssignTasks(profile: UserProfile | null): boolean {
  return assignableEmployees(profile).length > 0;
}

interface TasksResult {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
}

export type TaskScope = 'mine' | 'team';

function sortTasks(tasks: Task[]): Task[] {
  const rank: Record<TaskStatus, number> = { 'In Progress': 0, Pending: 1, Completed: 2 };
  return tasks.slice().sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    // Undated last rather than first: an empty string sorts before every real
    // date, which would put the tasks with no deadline at the top of a list
    // whose whole point is what is due next.
    if (!a.dueDate !== !b.dueDate) return a.dueDate ? -1 : 1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

/**
 * Live tasks for one scope.
 *
 * The query is narrowed to what the caller is allowed to read, which is not a
 * convenience: the rules evaluate a list against every document it returns and
 * fail the whole query if one of them is disallowed, so an over-broad read is
 * denied outright rather than quietly trimmed.
 *
 *   mine  → tasks assigned to me
 *   team  → everyone's, for `full`; otherwise my reports', via the chain
 */
export function useTasks(profile: UserProfile | null, scope: TaskScope): TasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const orgId = taskOrgId(profile);
  const selfId = getCurrentEmployeeRecord(profile)?.id ?? null;
  const orgWide = canAssignAnyone(profile);

  useEffect(() => {
    if (!profile) {
      setTasks([]);
      setLoading(false);
      return;
    }
    // No employee record means no tasks of one's own and no reports — asking
    // for either would be a query the rules refuse.
    if (!selfId && !orgWide) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const constraints = [where('orgId', '==', orgId)];
    if (scope === 'mine') {
      if (!selfId) {
        setTasks([]);
        setLoading(false);
        return;
      }
      constraints.push(where('assigneeId', '==', selfId));
    } else if (!orgWide) {
      constraints.push(where('managerChainIds', 'array-contains', selfId as string));
    }

    setLoading(true);
    // onSnapshot with an error callback rather than db.ts's `subscribe`, which
    // takes none: the rules deploy separately from the app, so a denied
    // listener is a real state and must not leave this stuck loading.
    return onSnapshot(
      query(Collections.tasks, ...constraints),
      (snap) => {
        setTasks(sortTasks(snap.docs.map((d) => ({ ...d.data(), id: d.id }))));
        setLoading(false);
      },
      (err) => {
        setError(err as Error);
        setTasks([]);
        setLoading(false);
      },
    );
  }, [profile, orgId, scope, selfId, orgWide]);

  return { tasks, loading, error };
}

/** Assign work to an employee. */
export async function createTask(
  profile: UserProfile | null,
  params: {
    assigneeId: string;
    title: string;
    details?: string;
    priority?: TaskPriority;
    dueDate?: string;
    requestedBy?: string;
    requestedByCompany?: string;
  },
): Promise<Task> {
  if (!profile) throw new TaskError('Not signed in.');

  const title = params.title.trim();
  if (!title) throw new TaskError('A task needs a title.');
  if (title.length > 200) throw new TaskError('That title is too long.');

  const directory = getEmployeeDirectory();
  const assignee = directory.find((employee) => employee.id === params.assigneeId);
  if (!assignee) throw new TaskError('Pick somebody to assign this to.');
  if (!assignableEmployees(profile, directory).some((employee) => employee.id === assignee.id)) {
    throw new TaskError(`You can only assign work to people who report to you.`);
  }

  const orgId = taskOrgId(profile);
  const self = getCurrentEmployeeRecord(profile, directory);
  // Deterministic enough to be idempotent within a second, and unique across
  // assignees — a random id would be neither, and Date.now() alone collides
  // when two tasks are raised in the same tick.
  const id = `${orgId}__${assignee.id}__${Date.now().toString(36)}`;

  const record: Task = {
    id,
    orgId,
    title,
    details: (params.details ?? '').trim().slice(0, 2000),
    assigneeId: assignee.id,
    assigneeName: assignee.fullName,
    managerChainIds: managerChainFor(assignee.id, directory),
    status: 'Pending',
    priority: params.priority ?? 'Medium',
    dueDate: params.dueDate ?? '',
    assignedByUid: profile.uid,
    assignedByName: self?.fullName || profile.displayName || profile.email,
    createdAt: nowInstant(),
    // Omitted rather than empty when there is no outside requester: Firestore
    // rejects undefined, and an empty string reads as "a client with no name".
    ...(params.requestedBy?.trim() ? { requestedBy: params.requestedBy.trim().slice(0, 120) } : {}),
    ...(params.requestedByCompany?.trim()
      ? { requestedByCompany: params.requestedByCompany.trim().slice(0, 120) }
      : {}),
  };

  await setDoc(doc(Collections.tasks, id), record);
  return record;
}

/**
 * Move a task along.
 *
 * The assignee may do this and nothing else, which is what makes "track their
 * own tasks" mean something they can act on rather than only read.
 */
export async function setTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  await updateDoc(doc(Collections.tasks, taskId), {
    status,
    // Stamped on completion and cleared on reopening, so "when was this done"
    // never survives the task being reopened.
    completedAt: status === 'Completed' ? todayIso() : '',
  });
}

/** Withdraw a task. Its assigner or an org administrator, in the rules too. */
export async function deleteTask(taskId: string): Promise<void> {
  await deleteDoc(doc(Collections.tasks, taskId));
}
