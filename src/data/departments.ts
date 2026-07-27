import { employees, departments as employeeDepartments, reassignEmployeeDepartment, EMPLOYEE_DIRECTORY_CHANGED_EVENT } from '@/data/employees';
import { getJobOpenings } from '@/data/recruitment';
import { isMockDataCleared } from '@/lib/mockDataFlag';
import { orgScopedKey } from '@/lib/orgScope';

export interface DepartmentRecord {
  name: string;
  head: string;
  headcount: number;
  /** Effective figure: the admin's override when one is set, else the live count. */
  openRoles: number;
  /**
   * Set only when an admin has deliberately pinned this number. Absent means
   * the department tracks its real job openings.
   *
   * Kept separate from `openRoles` so that editing something else about the
   * department — its head, or its name — cannot quietly freeze a live count
   * into a literal, which is what happened when the two were one field.
   */
  openRolesOverride?: number;
}

/** How a row is persisted: no stored `openRoles` unless it is a legacy row. */
type StoredDepartment = Omit<DepartmentRecord, 'openRoles'> & { openRoles?: number };

const CUSTOM_DEPARTMENTS_STORAGE_KEY = 'modcon.hr.customDepartments';
const REMOVED_DEPARTMENTS_STORAGE_KEY = 'modcon.hr.removedDepartments';
export const DEPARTMENT_DIRECTORY_CHANGED_EVENT = 'modcon-hr-department-directory-changed';

/**
 * Who leads a department, read off the reporting hierarchy instead of a
 * hardcoded name map. The head is the member whose manager sits outside the
 * department, or whose manager is the organisation's own root — that second
 * clause matters because the CEO is filed under a department too, and without
 * it Operations would report the CEO rather than its actual head.
 *
 * Derived so it cannot drift: re-assign someone and the head follows.
 */
function deriveDepartmentHead(department: string): string {
  const members = employees.filter((employee) => employee.department === department);
  if (!members.length) return '—';

  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  const head = members.find((employee) => {
    if (!employee.reportingManagerId) return false;
    const manager = byId.get(employee.reportingManagerId);
    if (!manager) return false;
    return manager.department !== department || !manager.reportingManagerId;
  });

  // Otherwise the most senior person present — someone with no manager at all.
  return head?.fullName ?? members.find((employee) => !employee.reportingManagerId)?.fullName ?? '—';
}

/**
 * Vacancies a department is currently hiring for, summed from real job
 * openings. This used to be the literal [2, 1, 0, 3, 1, 0, 0, 1, 2, 0] keyed
 * by the department's position in the list, which also meant Settings could
 * contradict the Recruitment page's per-department figures.
 */
function deriveDepartmentOpenRoles(department: string): number {
  return getJobOpenings()
    .filter((job) => job.status === 'Open' && job.department === department)
    .reduce((sum, job) => sum + (job.openings || 1), 0);
}

export const departments: string[] = [];

function readCustomDepartments(): StoredDepartment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(orgScopedKey(CUSTOM_DEPARTMENTS_STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredDepartment[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item?.name === 'string')
      .map((item) => (
        // Rows written before overrides were explicit stored the number
        // directly; honour it as the override the admin meant it to be.
        item.openRolesOverride === undefined && typeof item.openRoles === 'number'
          ? { ...item, openRolesOverride: item.openRoles }
          : item
      ));
  } catch {
    return [];
  }
}

function writeCustomDepartments(records: StoredDepartment[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(CUSTOM_DEPARTMENTS_STORAGE_KEY), JSON.stringify(records));
}

function notifyDepartmentDirectoryChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(DEPARTMENT_DIRECTORY_CHANGED_EVENT));
}

/**
 * Built-in departments an org has removed or renamed away from.
 *
 * The ten starting departments come from a fixed list, so deleting one cannot
 * simply drop a stored row — there is nothing to drop. Their names are
 * recorded here instead and filtered out when the base rows are built, the
 * same approach the employee directory uses for deleted seed employees.
 */
function readRemovedDepartments(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(orgScopedKey(REMOVED_DEPARTMENTS_STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeRemovedDepartments(names: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(REMOVED_DEPARTMENTS_STORAGE_KEY), JSON.stringify(names));
}

function getBaseDepartmentRows(): DepartmentRecord[] {
  // A freshly-created org has no relationship to ModCon Builders' 10 fixed
  // department rows/heads — only its own custom-added departments should
  // show until its admin defines their own structure.
  if (isMockDataCleared()) return [];

  const employeeCountByDepartment = employees.reduce<Record<string, number>>((acc, employee) => {
    acc[employee.department] = (acc[employee.department] ?? 0) + 1;
    return acc;
  }, {});

  const removed = new Set(readRemovedDepartments());

  return employeeDepartments
    .filter((name) => !removed.has(name))
    .map((name) => ({
      name,
      head: deriveDepartmentHead(name),
      headcount: employeeCountByDepartment[name] ?? 0,
      openRoles: deriveDepartmentOpenRoles(name),
    }));
}

export function getDepartmentDirectory(): DepartmentRecord[] {
  const baseRows = getBaseDepartmentRows();
  const customRows = readCustomDepartments();
  const combined = new Map<string, DepartmentRecord>();


  const combine = (record: StoredDepartment) => combined.set(record.name, {
    ...record,
    // A head nominated in Settings wins. Left unset, the department falls back
    // to reading its head off the reporting hierarchy, which is what it always
    // did before the field became a choice — so making the field explicit did
    // not turn every existing department's head into a dash.
    head: record.head && record.head !== '—' ? record.head : deriveDepartmentHead(record.name),
    // An override wins; otherwise the department tracks its real openings.
    openRoles: record.openRolesOverride ?? deriveDepartmentOpenRoles(record.name),
  });
  baseRows.forEach(combine);
  customRows.forEach(combine);

  // Headcount is a count of the people actually in the department, for every
  // row. A stored figure on a custom row would go stale the moment somebody
  // joined, left or was reassigned.
  const liveCount = employees.reduce<Record<string, number>>((acc, employee) => {
    acc[employee.department] = (acc[employee.department] ?? 0) + 1;
    return acc;
  }, {});

  return Array.from(combined.values()).map((record) => ({
    ...record,
    headcount: liveCount[record.name] ?? 0,
  }));
}

function syncDepartmentSnapshots() {
  const directory = getDepartmentDirectory();
  departments.splice(0, departments.length, ...directory.map((record) => record.name));
}

export function addDepartmentToDirectory(record: StoredDepartment) {
  const customDepartments = readCustomDepartments().filter((item) => item.name !== record.name);
  writeCustomDepartments([record, ...customDepartments]);
  syncDepartmentSnapshots();
  notifyDepartmentDirectoryChanged();
}

export function updateDepartmentInDirectory(record: StoredDepartment) {
  const customDepartments = readCustomDepartments().filter((item) => item.name !== record.name);
  writeCustomDepartments([record, ...customDepartments]);
  syncDepartmentSnapshots();
  notifyDepartmentDirectoryChanged();
}

export function deleteDepartmentFromDirectory(name: string) {
  writeCustomDepartments(readCustomDepartments().filter((item) => item.name !== name));
  // A built-in has no stored row to drop, so record it as removed instead.
  if (employeeDepartments.includes(name)) {
    writeRemovedDepartments(Array.from(new Set([...readRemovedDepartments(), name])));
  }
  syncDepartmentSnapshots();
  notifyDepartmentDirectoryChanged();
}

/**
 * Rename a department and move its people across. Works for built-in
 * departments as well as added ones: the old name is retired, the new one is
 * stored, and every employee assigned to it follows.
 *
 * Returns how many employee records were reassigned.
 */
export function renameDepartmentInDirectory(oldName: string, newName: string): number {
  if (oldName === newName) return 0;

  const existing = getDepartmentRecord(oldName);
  const moved = reassignEmployeeDepartment(oldName, newName);

  const remaining = readCustomDepartments().filter(
    (item) => item.name !== oldName && item.name !== newName,
  );
  writeCustomDepartments([
    {
      name: newName,
      head: existing?.head ?? '—',
      headcount: moved,
      // Carried across only if the old name actually had one. A rename is not
      // an instruction to start overriding the live count.
      ...(existing?.openRolesOverride !== undefined
        ? { openRolesOverride: existing.openRolesOverride }
        : {}),
    },
    ...remaining,
  ]);

  if (employeeDepartments.includes(oldName)) {
    writeRemovedDepartments(Array.from(new Set([...readRemovedDepartments(), oldName])));
  }

  syncDepartmentSnapshots();
  notifyDepartmentDirectoryChanged();
  return moved;
}

export function getDepartmentRecord(name: string): DepartmentRecord | undefined {
  return getDepartmentDirectory().find((record) => record.name === name);
}

syncDepartmentSnapshots();

if (typeof window !== 'undefined') {
  window.addEventListener(EMPLOYEE_DIRECTORY_CHANGED_EVENT, () => {
    syncDepartmentSnapshots();
    notifyDepartmentDirectoryChanged();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === orgScopedKey(CUSTOM_DEPARTMENTS_STORAGE_KEY)) {
      syncDepartmentSnapshots();
      notifyDepartmentDirectoryChanged();
    }
  });
}