import { employees, departments as employeeDepartments, EMPLOYEE_DIRECTORY_CHANGED_EVENT } from '@/data/employees';
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

const DEFAULT_DEPT_HEADS: Record<string, string> = {
  Engineering: 'Diya Mehta',
  Product: 'Rohan Iyer',
  Design: 'Kavya Menon',
  Sales: 'Vikram Nair',
  Marketing: 'Neha Chopra',
  'Human Resources': 'Ananya Reddy',
  Finance: 'Priya Kapoor',
  Operations: 'Harsh Mehra',
  'Customer Success': 'Gaurav Sinha',
  Legal: 'Shreya Desai',
};

const DEFAULT_DEPT_OPEN_ROLES: Record<string, number> = employeeDepartments.reduce<Record<string, number>>((acc, dept, idx) => {
  acc[dept] = [2, 1, 0, 3, 1, 0, 0, 1, 2, 0][idx] ?? 0;
  return acc;
}, {});

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
    head: DEFAULT_DEPT_HEADS[name] ?? '—',
    headcount: employeeCountByDepartment[name] ?? 0,
    openRoles: DEFAULT_DEPT_OPEN_ROLES[name] ?? 0,
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