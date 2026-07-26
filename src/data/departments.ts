import { employees, departments as employeeDepartments, EMPLOYEE_DIRECTORY_CHANGED_EVENT } from '@/data/employees';
import { getJobOpenings } from '@/data/recruitment';
import { isMockDataCleared } from '@/lib/mockDataFlag';
import { orgScopedKey } from '@/lib/orgScope';

export interface DepartmentRecord {
  name: string;
  head: string;
  headcount: number;
  openRoles: number;
}

const CUSTOM_DEPARTMENTS_STORAGE_KEY = 'modcon.hr.customDepartments';
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

function readCustomDepartments(): DepartmentRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(orgScopedKey(CUSTOM_DEPARTMENTS_STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DepartmentRecord[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item?.name === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeCustomDepartments(records: DepartmentRecord[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(CUSTOM_DEPARTMENTS_STORAGE_KEY), JSON.stringify(records));
}

function notifyDepartmentDirectoryChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(DEPARTMENT_DIRECTORY_CHANGED_EVENT));
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

  return employeeDepartments.map((name) => ({
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

  baseRows.forEach((record) => combined.set(record.name, record));
  customRows.forEach((record) => combined.set(record.name, record));

  return Array.from(combined.values());
}

function syncDepartmentSnapshots() {
  const directory = getDepartmentDirectory();
  departments.splice(0, departments.length, ...directory.map((record) => record.name));
}

export function addDepartmentToDirectory(record: DepartmentRecord) {
  const customDepartments = readCustomDepartments().filter((item) => item.name !== record.name);
  writeCustomDepartments([record, ...customDepartments]);
  syncDepartmentSnapshots();
  notifyDepartmentDirectoryChanged();
}

export function updateDepartmentInDirectory(record: DepartmentRecord) {
  const customDepartments = readCustomDepartments().filter((item) => item.name !== record.name);
  writeCustomDepartments([record, ...customDepartments]);
  syncDepartmentSnapshots();
  notifyDepartmentDirectoryChanged();
}

export function deleteDepartmentFromDirectory(name: string) {
  const customDepartments = readCustomDepartments().filter((item) => item.name !== name);
  writeCustomDepartments(customDepartments);
  syncDepartmentSnapshots();
  notifyDepartmentDirectoryChanged();
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