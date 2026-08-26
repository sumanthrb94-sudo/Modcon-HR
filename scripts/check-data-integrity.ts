/**
 * Cross-module data-integrity check for the fixtures in src/data.
 *
 * WHY THIS EXISTS
 * ---------------
 * Employee `id` is positional (`emp-001`… in seed order) while `employeeCode`
 * is stable (`MC-001`, `MC-010`, …). The two look alike and diverge as soon as
 * the codes skip a number. A batch of cross-module references had been written
 * against the CODE numbering, so they silently resolved to the wrong person:
 * one employee managed themselves, six manager links dangled, and records in
 * assets / performance / leave pointed at someone other than the name stored
 * beside them.
 *
 * That class is close to invisible in review, for two compounding reasons:
 *   1. The UI renders the stored *name*, not the id — so screens look correct
 *      while every id-based join is wrong. The Assign Asset dialog read
 *      "Current Assignee: Karthik Subramaniam" while pre-selecting Sneha Patil.
 *   2. For MC-001..MC-006 the code number and the seed position coincide, so
 *      the senior people at the top of the org chart resolved correctly *by
 *      accident*. Spot-checks passed. Only refs at MC-010 and above were wrong.
 *
 * So this is a machine check, not a review checklist. Run it after touching
 * anything in src/data:
 *
 *   npm run check:data
 *
 * Exits non-zero on failure, so it can gate CI or a pre-commit hook.
 *
 * ADDING A TABLE
 * --------------
 * Add one entry to TABLES below. The checks are driven off that registry
 * rather than a hand-written list of call sites, because the first version of
 * this check covered three tables by hand and missed the leave-approver drift.
 */
import { employees, getEmployee } from '@/data/employees';
// Read through the stores' getters, not the seed arrays beside them. Several
// of these collections became persistentCollection-backed after this check was
// first written, and the exported seed array is now empty (attendance) or gone
// (payslips) — checking it would pass by having nothing to check.
// persistence.ts short-circuits on `typeof window === 'undefined'`, so under
// node these return the canonical seeds.
import { getAttendanceRecords, getRegularizationRequests } from '@/data/attendance';
import { leaveRequests, leaveBalances } from '@/data/leave';
import { getPayslips } from '@/data/payroll';
import { jobOpenings, candidates } from '@/data/recruitment';
import { onboardings } from '@/data/onboarding';
import { goals, reviews } from '@/data/performance';
import { expenseClaims } from '@/data/expenses';
import { assets } from '@/data/assets';
import { tickets } from '@/data/helpdesk';

type Row = Record<string, unknown>;

interface TableSpec {
  /** Name used in failure messages. */
  name: string;
  rows: readonly Row[];
  /** Field holding the row's own identifier, for readable messages. */
  key?: string;
  /** Fields holding an employee id that must resolve to a directory record. */
  employeeIds?: readonly string[];
  /** [idField, nameField] pairs that must describe the same person. */
  pairs?: readonly (readonly [string, string])[];
  /** Fields holding an employee full name that must exist in the directory. */
  employeeNames?: readonly string[];
}

const TABLES: readonly TableSpec[] = [
  {
    name: 'employees',
    rows: employees as unknown as Row[],
    key: 'id',
    employeeIds: ['reportingManagerId'],
    pairs: [['reportingManagerId', 'reportingManagerName']],
  },
  { name: 'attendance', rows: getAttendanceRecords() as unknown as Row[], key: 'id', employeeIds: ['employeeId'] },
  { name: 'regularizations', rows: getRegularizationRequests() as unknown as Row[], key: 'id', employeeIds: ['employeeId'] },
  {
    name: 'leaveRequests',
    rows: leaveRequests as unknown as Row[],
    key: 'id',
    employeeIds: ['employeeId', 'approverId'],
    pairs: [['approverId', 'approverName']],
  },
  { name: 'leaveBalances', rows: leaveBalances as unknown as Row[], employeeIds: ['employeeId'] },
  { name: 'payslips', rows: getPayslips() as unknown as Row[], key: 'id', employeeIds: ['employeeId'] },
  { name: 'jobOpenings', rows: jobOpenings as unknown as Row[], key: 'id', employeeIds: ['hiringManagerId'] },
  {
    name: 'onboarding',
    rows: onboardings as unknown as Row[],
    key: 'id',
    employeeIds: ['employeeId'],
    pairs: [['employeeId', 'employeeName']],
    employeeNames: ['buddy'],
  },
  { name: 'goals', rows: goals as unknown as Row[], key: 'id', employeeIds: ['employeeId'] },
  {
    name: 'reviews',
    rows: reviews as unknown as Row[],
    key: 'id',
    employeeIds: ['employeeId'],
    pairs: [['employeeId', 'employeeName']],
    employeeNames: ['reviewer'],
  },
  { name: 'expenses', rows: expenseClaims as unknown as Row[], key: 'id', employeeIds: ['employeeId'] },
  {
    name: 'assets',
    rows: assets as unknown as Row[],
    key: 'id',
    employeeIds: ['assignedToId'],
    pairs: [['assignedToId', 'assignedToName']],
  },
  { name: 'tickets', rows: tickets as unknown as Row[], key: 'id', employeeIds: ['raisedById'] },
];

const byName = new Map(employees.map((e) => [e.fullName, e.id]));

/**
 * Onboarding legitimately starts before a directory record exists, so these
 * ids are an intentional sentinel rather than drift. Kept narrow on purpose —
 * a loose pattern here would hide real dangling references.
 */
const PRE_HIRE = /^emp-new-\d+$/;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const rowId = (t: TableSpec, r: Row, i: number): string => str(t.key ? r[t.key] : null) ?? `#${i}`;

interface Counts {
  ids: number;
  pairs: number;
  names: number;
  sentinels: number;
}

/**
 * The whole check, returning failure messages rather than printing them, so
 * the self-test below can run this exact code path against corrupted data.
 */
function runChecks(counts?: Counts): string[] {
  const fails: string[] = [];
  const bump = (k: keyof Counts) => {
    if (counts) counts[k] += 1;
  };

  for (const table of TABLES) {
    table.rows.forEach((row, i) => {
      const rid = `${table.name} ${rowId(table, row, i)}`;

      for (const field of table.employeeIds ?? []) {
        const id = str(row[field]);
        if (!id) continue; // nullable by design (unassigned asset, no approver yet)
        if (PRE_HIRE.test(id)) {
          bump('sentinels');
          continue;
        }
        bump('ids');
        if (!getEmployee(id)) fails.push(`${rid}: ${field} "${id}" does not exist in the directory`);
      }

      for (const [idField, nameField] of table.pairs ?? []) {
        const id = str(row[idField]);
        const name = str(row[nameField]);

        // A name with no id is an orphaned reference — nothing can join on it.
        if (!id && name) {
          fails.push(`${rid}: ${nameField} "${name}" is set but ${idField} is empty`);
          continue;
        }
        if (!id || !name || PRE_HIRE.test(id)) continue;

        bump('pairs');
        const actual = getEmployee(id)?.fullName;
        if (actual !== name) {
          fails.push(
            `${rid}: ${idField} "${id}" is "${actual ?? '<missing>'}" but ${nameField} says "${name}"` +
              ` (that name is ${byName.get(name) ?? 'not an employee'})`,
          );
        }
      }

      for (const field of table.employeeNames ?? []) {
        const name = str(row[field]);
        if (!name) continue;
        bump('names');
        if (!byName.has(name)) fails.push(`${rid}: ${field} "${name}" is not a directory employee`);
      }
    });
  }

  // -- manager graph ---------------------------------------------------------
  const roots = employees.filter((e) => !e.reportingManagerId);
  if (roots.length !== 1) {
    fails.push(
      `manager graph: expected exactly 1 root, found ${roots.length} (${roots.map((r) => r.fullName).join(', ')})`,
    );
  }
  for (const e of employees) {
    if (e.reportingManagerId === e.id) fails.push(`manager graph: ${e.fullName} manages themselves`);
  }
  for (const start of employees) {
    const seen = new Set<string>([start.id]);
    let cur = start.reportingManagerId ? getEmployee(start.reportingManagerId) : undefined;
    while (cur) {
      if (seen.has(cur.id)) {
        fails.push(`manager graph: cycle in the chain starting at ${start.fullName}`);
        break;
      }
      seen.add(cur.id);
      cur = cur.reportingManagerId ? getEmployee(cur.reportingManagerId) : undefined;
    }
  }

  // -- other cross-references and key uniqueness -----------------------------
  const jobIds = new Set(jobOpenings.map((j) => j.id));
  for (const c of candidates) {
    if (!jobIds.has(c.jobId)) fails.push(`candidates ${c.id}: jobId "${c.jobId}" does not exist`);
  }
  const dupes = (xs: string[]) => [...new Set(xs.filter((x, i, a) => a.indexOf(x) !== i))];
  const dupIds = dupes(employees.map((e) => e.id));
  if (dupIds.length) fails.push(`employees: duplicate ids ${dupIds.join(', ')}`);
  const dupCodes = dupes(employees.map((e) => e.employeeCode));
  if (dupCodes.length) fails.push(`employees: duplicate employeeCodes ${dupCodes.join(', ')}`);

  return fails;
}

// ---------------------------------------------------------------------------
// Self-test: prove the checker can go red before trusting it when it is green.
//
// A green check nobody has seen fail is not evidence. The probe must be a
// MANAGED employee — an earlier version of this test corrupted the root, which
// has no manager to drift, so it could never have detected anything.
// ---------------------------------------------------------------------------
function selfTest(baseline: number): string | null {
  const probe = employees.find((e) => e.reportingManagerId && e.reportingManagerName);
  if (!probe) return 'no managed employee available to probe';

  const saved = probe.reportingManagerName;
  probe.reportingManagerName = '__injected_drift__';
  const withDrift = runChecks().length;
  probe.reportingManagerName = saved;
  const restored = runChecks().length;

  if (withDrift <= baseline) return `injected drift on "${probe.fullName}" was NOT detected — the check is blind`;
  if (restored !== baseline) return `state not restored after the probe (${restored} vs ${baseline})`;
  return null;
}

// ---------------------------------------------------------------------------
const counts: Counts = { ids: 0, pairs: 0, names: 0, sentinels: 0 };
const failures = runChecks(counts);

console.log('Data integrity — src/data');
console.log(
  `  ${TABLES.length} tables · ${counts.ids} employee-id refs · ${counts.pairs} id/name pairs · ` +
    `${counts.names} name-only refs · ${counts.sentinels} pre-hire sentinels`,
);

const selfTestError = selfTest(failures.length);
if (selfTestError) {
  console.error(`\n  SELF-TEST FAILED: ${selfTestError}`);
  console.error('  Refusing to report a pass from a check that cannot fail.');
  process.exit(2);
}
console.log('  self-test: injected drift detected and reverted — check is live');

if (failures.length > 0) {
  console.error(`\n${failures.length} integrity failure(s):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error('\nIf an id looks "off by a few", suspect code-vs-position drift:');
  console.error("  employeeIdByCode('MC-0NN') resolves a stable code to the positional id.");
  process.exit(1);
}

console.log('\nPASS — no integrity failures.');
