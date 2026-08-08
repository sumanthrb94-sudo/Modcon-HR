import type { LeaveType } from '@/types';
import { orgScopedKey } from '@/lib/orgScope';
import { ORG_SETTINGS, publishOrgSetting } from '@/lib/orgSettings';
import { isMockDataCleared } from '@/lib/mockDataFlag';

export type LeaveAccrual = 'monthly' | 'annual';

export interface LeavePolicy {
  id: string;
  type: string;
  /**
   * Days granted per financial year for an `annual` policy.
   *
   * For a `monthly` policy this is the derived yearly total (12 x
   * monthlyAccrual) and is **not** shown to employees — see
   * `isMonthlyPolicy`. Keeping the field populated means the annual figure is
   * still available for payroll and reporting without a second source of truth.
   */
  annual: number;
  /**
   * How entitlement is granted. `monthly` accrues on the first of each month
   * and accumulates across the financial year; `annual` is granted in full at
   * the start of the year.
   */
  accrual: LeaveAccrual;
  /** Days granted per month. Only meaningful when accrual is 'monthly'. */
  monthlyAccrual: number;
  /**
   * Unused days survive into the next month. Only meaningful for monthly
   * accrual, and always bounded by the financial year — see
   * `carryForwardBeyondYear` for the separate question of surviving the
   * year-end.
   */
  carryForward: boolean;
  /**
   * Unused days survive the financial year rollover. False means the balance
   * resets on 1 April however much was left.
   */
  carryForwardBeyondYear: boolean;
  encashment: boolean;
  halfDay: boolean;
  /** Completed months of service before the entitlement applies. 0 = from day one. */
  minTenureMonths: number;
  applicable: string;
}

/** True when this policy grants days month by month rather than yearly. */
export function isMonthlyPolicy(policy: LeavePolicy): boolean {
  return policy.accrual === 'monthly';
}

// Both come from the org-settings registry so the Firestore sync hydrates the
// same key this module reads, and dispatches the event it listens for.
const LEAVE_POLICIES_STORAGE_KEY = ORG_SETTINGS.leavePolicies.storageKey;
export const LEAVE_POLICIES_CHANGED_EVENT = ORG_SETTINGS.leavePolicies.changedEvent;

/**
 * ModCon Builders' own leave policy — part of the demo dataset, not a platform
 * default.
 *
 * It is shown for the demo organisation and for nobody else. Another company's
 * employees are not on Casual 1/month and Earned 15/year because this app was
 * built with a builder's policy in it: leave is negotiated, statutory in part,
 * and different at every organisation. Handed out unasked it reads as the
 * company's own policy, is offered in Apply Leave, and is what LOP deductions
 * come off — a quota nobody there granted, deducted from real pay.
 *
 * Same reasoning and the same `isMockDataCleared()` gate as
 * `DEMO_SALARY_STRUCTURE` in data/salaryStructure.ts and `demoCompanyProfile`.
 *
 * Casual and Sick accrue one day per month and accumulate across the financial
 * year, so an unused January day is still there in February. They do not
 * survive 1 April: `carryForwardBeyondYear: false` is what resets the balance
 * each year.
 *
 * Earned Leave is 15 days a year and only for employees past twelve completed
 * months of service, which is what `minTenureMonths: 12` expresses. It is
 * granted annually rather than accrued, so a qualifying employee has the whole
 * entitlement from the start of the year.
 */
const DEMO_LEAVE_POLICIES: LeavePolicy[] = [
  { id: 'lp1', type: 'Casual Leave', annual: 12, accrual: 'monthly', monthlyAccrual: 1, carryForward: true, carryForwardBeyondYear: false, encashment: false, halfDay: true, minTenureMonths: 0, applicable: 'All employees' },
  { id: 'lp2', type: 'Sick Leave', annual: 12, accrual: 'monthly', monthlyAccrual: 1, carryForward: true, carryForwardBeyondYear: false, encashment: false, halfDay: true, minTenureMonths: 0, applicable: 'All employees' },
  { id: 'lp3', type: 'Earned Leave', annual: 15, accrual: 'annual', monthlyAccrual: 0, carryForward: true, carryForwardBeyondYear: true, encashment: true, halfDay: true, minTenureMonths: 12, applicable: 'Employees with over 1 year of service' },
  { id: 'lp4', type: 'Unpaid Leave', annual: 0, accrual: 'annual', monthlyAccrual: 0, carryForward: false, carryForwardBeyondYear: false, encashment: false, halfDay: false, minTenureMonths: 0, applicable: 'All employees' },
  { id: 'lp5', type: 'Maternity Leave', annual: 182, accrual: 'annual', monthlyAccrual: 0, carryForward: false, carryForwardBeyondYear: false, encashment: false, halfDay: false, minTenureMonths: 0, applicable: 'Female employees' },
  { id: 'lp6', type: 'Paternity Leave', annual: 5, accrual: 'annual', monthlyAccrual: 0, carryForward: false, carryForwardBeyondYear: false, encashment: false, halfDay: false, minTenureMonths: 0, applicable: 'Male employees' },
  { id: 'lp7', type: 'Comp Off', annual: 0, accrual: 'annual', monthlyAccrual: 0, carryForward: true, carryForwardBeyondYear: false, encashment: false, halfDay: false, minTenureMonths: 0, applicable: 'All employees' },
];

function readStoredLeavePolicies(): LeavePolicy[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(LEAVE_POLICIES_STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LeavePolicy[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredLeavePolicies(policies: LeavePolicy[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(LEAVE_POLICIES_STORAGE_KEY), JSON.stringify(policies));
}

function notifyLeavePoliciesChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(LEAVE_POLICIES_CHANGED_EVENT));
}

/**
 * Policies saved before monthly accrual existed carry none of the new fields.
 * Reading them raw would render `undefined` days and silently treat every
 * policy as annual, so they are normalised against the matching demo policy —
 * those records predate multi-org support, so the demo's figures are the ones
 * they were written beside. A type it does not name falls back to zero.
 */
function normalizePolicy(policy: LeavePolicy): LeavePolicy {
  const fallback = DEMO_LEAVE_POLICIES.find((p) => p.type === policy.type);
  const accrual: LeaveAccrual = policy.accrual ?? fallback?.accrual ?? 'annual';
  const monthlyAccrual = policy.monthlyAccrual ?? fallback?.monthlyAccrual ?? 0;
  return {
    ...policy,
    accrual,
    monthlyAccrual,
    // A monthly policy's annual figure is derived, never stored independently:
    // two sources for the same number drift.
    annual: accrual === 'monthly' ? monthlyAccrual * 12 : policy.annual ?? fallback?.annual ?? 0,
    carryForward: policy.carryForward ?? fallback?.carryForward ?? false,
    carryForwardBeyondYear:
      policy.carryForwardBeyondYear ?? fallback?.carryForwardBeyondYear ?? false,
    minTenureMonths: policy.minTenureMonths ?? fallback?.minTenureMonths ?? 0,
  };
}

/**
 * The organisation's leave policy, or an empty list when it has not set one.
 *
 * Empty is a state the callers must handle rather than paper over — Apply Leave
 * says the type is not part of your organisation's policy, and the balances show
 * nothing — because the alternative is telling a company its people accrue days
 * that nobody there granted. A stored empty array is an organisation that
 * deliberately removed every type, and stays empty.
 */
export function getLeavePolicies(): LeavePolicy[] {
  const stored = readStoredLeavePolicies();
  // Nothing stored at all: the demo organisation gets the demo policy, every
  // other organisation gets nothing until its own administrator sets one.
  const policies = stored ?? (isMockDataCleared() ? [] : DEMO_LEAVE_POLICIES);
  return policies.map(normalizePolicy);
}

/** The ids the demo policy is seeded with. Nothing else ever mints one. */
const DEMO_POLICY_IDS = new Map(DEMO_LEAVE_POLICIES.map((policy) => [policy.id, policy.type]));

/**
 * The types in this organisation's list that came from ModCon Builders' demo
 * policy rather than from anybody here.
 *
 * Gating `getLeavePolicies()` stops the demo policy being *offered* to another
 * organisation, but it cannot un-write the copies already saved: while the
 * inherited list was on screen, one toggle in Settings persisted all seven types
 * as that organisation's own — and a saved policy is indistinguishable from a
 * chosen one to every surface downstream.
 *
 * Identified by **id**, because that is the one thing an organisation cannot
 * have produced. `lp1`..`lp7` are seeded literals; a type added here is
 * `lp<timestamp>` and one uploaded is `lp-<slug>`. The type name has to agree
 * too, so a coincidence cannot make a company's own policy look borrowed. The
 * figures deliberately do not: the likeliest shape of this is a list where
 * somebody flipped one carry-forward switch, which is what saved it.
 *
 * Empty for the demo organisation — that list is not inherited, it is theirs.
 */
export function inheritedDemoPolicies(
  policies: LeavePolicy[] = getLeavePolicies(),
): LeavePolicy[] {
  if (!isMockDataCleared()) return [];
  return policies.filter(carriesDemoIdentity);
}

/** True when this record still carries a seeded demo id under its own name. */
function carriesDemoIdentity(policy: LeavePolicy): boolean {
  return DEMO_POLICY_IDS.get(policy.id) === policy.type;
}

/**
 * The policy governing a leave type (`'Casual'`, not `'Casual Leave'`).
 *
 * Given an employee id, the policy **that employee** is on: their own quota
 * where one has been uploaded for them, the organisation's otherwise.
 */
export function getPolicyForType(type: string, employeeId?: string): LeavePolicy | undefined {
  return getLeavePoliciesFor(employeeId).find((p) => normalizeLeaveTypeValue(p.type) === type);
}

/**
 * Persist the policy list. The local write is synchronous and immediate; the
 * returned promise resolves once the organisation's Firestore copy has caught
 * up (`false` if that write was refused). Callers that do not care can ignore
 * it — it never rejects.
 */
export function saveLeavePolicies(policies: LeavePolicy[]): Promise<boolean> {
  writeStoredLeavePolicies(policies);
  notifyLeavePoliciesChanged();
  // The organisation's copy. Accrual policy is what LOP deductions are computed
  // from, so it belonging to one browser was never right — see lib/orgSettings.
  return publishOrgSetting(ORG_SETTINGS.leavePolicies, policies);
}

export function normalizeLeaveTypeValue(type: string): LeaveType {
  const clean = type.trim();
  if (!clean) return 'Casual';
  if (clean.endsWith(' Leave')) {
    return clean.slice(0, -6).trim() as LeaveType;
  }
  return clean as LeaveType;
}

// ---------------------------------------------------------------------------
// Upload — the organisation's own policy
// ---------------------------------------------------------------------------

/** The columns the organisation-wide upload expects, in order. */
export const LEAVE_POLICY_CSV_HEADER =
  'leave_type,accrual,days,min_tenure_months,carry_forward,encashment,half_day,applicable';

export interface LeavePolicyCsvRow {
  policy: LeavePolicy;
  /** True when the organisation already grants this type — the row updates it. */
  replaces: boolean;
  /** 1-based line in the uploaded file, for the review list. */
  line: number;
}

export interface LeavePolicyCsvRetained {
  policy: LeavePolicy;
  /** Why it survived a file that does not mention it. */
  reason: string;
}

export interface LeavePolicyCsvUpload {
  /** The list that would be saved: the file's types, then anything retained. */
  policies: LeavePolicy[];
  rows: LeavePolicyCsvRow[];
  retained: LeavePolicyCsvRetained[];
  unmatched: LeavePolicyCsvMiss[];
}

/** `yes`/`no` in any of the spellings a spreadsheet writes them. */
function parseBooleanCell(value: string): boolean | null {
  const clean = value.trim().toLowerCase();
  if (clean === '' || clean === 'no' || clean === 'n' || clean === 'false' || clean === '0') return false;
  if (clean === 'yes' || clean === 'y' || clean === 'true' || clean === '1') return true;
  return null;
}

function parseAccrualCell(value: string): LeaveAccrual | null {
  const clean = value.trim().toLowerCase();
  if (clean === 'monthly' || clean === 'month') return 'monthly';
  if (clean === 'annual' || clean === 'annually' || clean === 'yearly' || clean === 'year') return 'annual';
  return null;
}

/**
 * Everything after the nth comma, as typed.
 *
 * The last column is free text and may contain commas of its own, so it is read
 * off the raw line rather than rejoined from the trimmed cells — `join(',')`
 * gives back "All employees,including interns", losing the space somebody typed.
 */
function tailAfterColumns(line: string, columns: number): string {
  let index = -1;
  for (let i = 0; i < columns; i += 1) {
    index = line.indexOf(',', index + 1);
    if (index === -1) return '';
  }
  return line.slice(index + 1).trim();
}

function policyIdFor(type: string): string {
  const slug = type.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `lp-${slug || 'type'}`;
}

/**
 * Read an uploaded CSV into the organisation's own leave policy.
 *
 * The file is the whole policy, not a patch: a type the organisation grants and
 * the file omits is being withdrawn. Nothing is written from here — the caller
 * shows the lists and HR applies them.
 *
 * A row that cannot be used is **reported**, never dropped, for the same reason
 * the per-employee upload reports one: a line silently ignored looks exactly
 * like a line applied, while the type it named goes on granting the old figure.
 *
 * `undeletableTypes` names the types leave has actually been taken under. Those
 * are **retained** rather than withdrawn, because the requests carry the type by
 * name and entitlement is derived by walking the policies — removing one would
 * leave approved leave with no policy to be measured against, exactly as
 * deleting it from the table is refused for. They are listed, so a file that did
 * not mention them does not quietly appear to have removed them.
 */
export function parseLeavePolicyCsv(
  text: string,
  existing: LeavePolicy[] = getLeavePolicies(),
  undeletableTypes: string[] = [],
): LeavePolicyCsvUpload {
  const byType = new Map<string, LeavePolicy>();
  for (const policy of existing) {
    byType.set(normalizeLeaveTypeValue(policy.type).toLowerCase(), policy);
  }
  const protectedTypes = new Set(
    undeletableTypes.map((type) => normalizeLeaveTypeValue(type).toLowerCase()),
  );

  const rows: LeavePolicyCsvRow[] = [];
  const unmatched: LeavePolicyCsvMiss[] = [];
  const claimed = new Map<string, number>(); // normalized type -> the line that took it

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === '') return;
    const cells = trimmed.split(',').map((cell) => cell.trim());
    const first = (cells[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');
    // The header, in whatever case or spacing the spreadsheet wrote it. Skipped
    // rather than reported: it is not a row anybody expected to be applied.
    if (first === 'leavetype' || first === 'type') return;

    if (cells.length < 7) {
      unmatched.push({ line, text: trimmed, reason: 'Needs at least seven columns' });
      return;
    }

    const type = cells[0] ?? '';
    if (!type) {
      unmatched.push({ line, text: trimmed, reason: 'No leave type' });
      return;
    }
    const key = normalizeLeaveTypeValue(type).toLowerCase();
    const already = claimed.get(key);
    if (already !== undefined) {
      unmatched.push({ line, text: trimmed, reason: `${type} is already set on line ${already}` });
      return;
    }

    const accrual = parseAccrualCell(cells[1] ?? '');
    if (!accrual) {
      unmatched.push({ line, text: trimmed, reason: 'Accrual must be monthly or annual' });
      return;
    }

    const daysCell = (cells[2] ?? '').replace(/\s/g, '');
    const days = daysCell === '' ? NaN : Number(daysCell);
    if (!Number.isFinite(days) || days < 0) {
      unmatched.push({
        line,
        text: trimmed,
        reason: accrual === 'monthly'
          ? 'Days must be a number — how many days accrue each month'
          : 'Days must be a number — how many days are granted for the year',
      });
      return;
    }

    const tenureCell = (cells[3] ?? '').replace(/\s/g, '');
    const minTenureMonths = tenureCell === '' ? 0 : Number(tenureCell);
    if (!Number.isFinite(minTenureMonths) || minTenureMonths < 0) {
      unmatched.push({ line, text: trimmed, reason: 'Minimum service must be a number of months' });
      return;
    }

    const flags = [cells[4], cells[5], cells[6]].map((cell) => parseBooleanCell(cell ?? ''));
    if (flags.some((flag) => flag === null)) {
      unmatched.push({
        line,
        text: trimmed,
        reason: 'Carry forward, encashment and half-day must each be yes or no',
      });
      return;
    }
    const [carryForward, encashment, halfDay] = flags as boolean[];

    const applicable = tailAfterColumns(trimmed, 7) || 'All employees';

    const current = byType.get(key);
    // A type this organisation states in its own file is its own, so it sheds an
    // id inherited from the demo policy — otherwise remediating by upload leaves
    // the list still answering to `inheritedDemoPolicies` forever.
    const keepId = current !== undefined
      && !(isMockDataCleared() && carriesDemoIdentity(current));
    claimed.set(key, line);
    rows.push({
      // The id is otherwise kept where the type already exists: it is what the
      // table's edit and delete buttons address, and re-minting it on every
      // upload would make each save look like a different policy.
      policy: normalizePolicy({
        id: keepId ? current.id : policyIdFor(type),
        type,
        accrual,
        annual: accrual === 'monthly' ? days * 12 : days,
        monthlyAccrual: accrual === 'monthly' ? days : 0,
        carryForward,
        // Monthly accrual carries within the year by construction; surviving the
        // year-end is the separate question, and takes the same answer the Add
        // Leave Type form gives it rather than asking for an eighth column.
        carryForwardBeyondYear: accrual === 'monthly' ? false : carryForward,
        encashment,
        halfDay,
        minTenureMonths: Math.round(minTenureMonths),
        applicable,
      }),
      replaces: current !== undefined,
      line,
    });
  });

  const uploaded = new Set(
    rows.map((row) => normalizeLeaveTypeValue(row.policy.type).toLowerCase()),
  );
  const retained: LeavePolicyCsvRetained[] = [];
  for (const policy of existing) {
    const key = normalizeLeaveTypeValue(policy.type).toLowerCase();
    if (uploaded.has(key) || !protectedTypes.has(key)) continue;
    retained.push({
      policy,
      reason: 'leave has been taken under this type, so it is kept rather than withdrawn',
    });
  }

  return {
    policies: [...rows.map((row) => row.policy), ...retained.map((entry) => entry.policy)],
    rows,
    retained,
    unmatched,
  };
}

// ---------------------------------------------------------------------------
// Per-employee leave policies
// ---------------------------------------------------------------------------

/**
 * One person's departure from the organisation's policy for one leave type.
 *
 * Sparse on purpose, at both levels. An absent field is the organisation's own
 * value, so an employee granted 21 days of Earned Leave keeps the organisation's
 * tenure gate, its carry-forward rule and its half-day rule — a full copy of the
 * policy per person would freeze all of those at whatever they were on the day
 * the file was uploaded, and the next change in Settings would silently miss
 * everybody with an exception.
 *
 * Which fields may differ is deliberately narrow: how many days, and when they
 * start. Whether a type carries forward, encashes or allows half a day is the
 * organisation's policy for that type, not a term of one person's employment,
 * and an employee is never offered a leave *type* the organisation does not
 * grant — the type list stays the organisation's.
 */
export interface LeavePolicyOverride {
  /** Days granted per financial year. Only meaningful for an annual policy. */
  annual?: number;
  /** Days granted per month. Only meaningful for a monthly policy. */
  monthlyAccrual?: number;
  /** Completed months of service before the entitlement applies. 0 = day one. */
  minTenureMonths?: number;
}

/** employee id → normalized leave type (`'Casual'`) → what differs for them. */
export type EmployeeLeavePolicies = Record<string, Record<string, LeavePolicyOverride>>;

const EMPLOYEE_POLICIES_STORAGE_KEY = ORG_SETTINGS.employeeLeavePolicies.storageKey;

/** A finite, non-negative number, or undefined. Rejects NaN and Infinity. */
function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

/**
 * Bring a stored override into a shape entitlement can compute with, or drop it.
 *
 * `null` for an override that says nothing usable — an empty object would be an
 * exception recorded against someone which changes none of their days, and it
 * would show up in Settings as a custom policy that is not one.
 */
export function normalizeLeavePolicyOverride(value: unknown): LeavePolicyOverride | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<LeavePolicyOverride>;
  const override: LeavePolicyOverride = {};
  const annual = optionalNumber(raw.annual);
  const monthlyAccrual = optionalNumber(raw.monthlyAccrual);
  const minTenureMonths = optionalNumber(raw.minTenureMonths);
  if (annual !== undefined) override.annual = annual;
  if (monthlyAccrual !== undefined) override.monthlyAccrual = monthlyAccrual;
  if (minTenureMonths !== undefined) override.minTenureMonths = Math.round(minTenureMonths);
  return Object.keys(override).length > 0 ? override : null;
}

/** Every stored per-employee policy, normalized. `{}` when there are none. */
export function getEmployeeLeavePolicies(): EmployeeLeavePolicies {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(orgScopedKey(EMPLOYEE_POLICIES_STORAGE_KEY));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: EmployeeLeavePolicies = {};
    for (const [employeeId, byType] of Object.entries(parsed as Record<string, unknown>)) {
      if (!byType || typeof byType !== 'object') continue;
      const overrides: Record<string, LeavePolicyOverride> = {};
      for (const [type, value] of Object.entries(byType as Record<string, unknown>)) {
        const override = normalizeLeavePolicyOverride(value);
        // An entry that normalizes to nothing is dropped rather than kept empty:
        // "nothing recorded for this person and type" falls back to the
        // organisation's policy, which is the honest reading of an unusable one.
        if (override) overrides[normalizeLeaveTypeValue(type)] = override;
      }
      if (Object.keys(overrides).length > 0) out[employeeId] = overrides;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The organisation's policy for one type with one person's exception applied.
 *
 * A monthly policy's yearly figure stays derived — `monthlyAccrual * 12`, the
 * same invariant `normalizePolicy` keeps — so an employee accruing two days a
 * month cannot end up with a stored annual figure that disagrees with it.
 */
function applyOverride(policy: LeavePolicy, override: LeavePolicyOverride): LeavePolicy {
  const monthly = isMonthlyPolicy(policy);
  const monthlyAccrual = monthly && override.monthlyAccrual !== undefined
    ? override.monthlyAccrual
    : policy.monthlyAccrual;
  return {
    ...policy,
    monthlyAccrual,
    annual: monthly ? monthlyAccrual * 12 : override.annual ?? policy.annual,
    minTenureMonths: override.minTenureMonths ?? policy.minTenureMonths,
  };
}

/**
 * The leave policies **this employee** is on.
 *
 * The one function entitlement should ask. `getLeavePolicies()` still answers
 * "what does this organisation grant by default", which is what Settings edits
 * and what everyone without an exception is on.
 *
 * Always the organisation's full list, in the organisation's order: an exception
 * changes an employee's numbers, never which types exist for them. Called with
 * no id — a surface with no particular employee in view — it is exactly
 * `getLeavePolicies()`.
 */
export function getLeavePoliciesFor(employeeId?: string): LeavePolicy[] {
  const policies = getLeavePolicies();
  if (!employeeId) return policies;
  const overrides = getEmployeeLeavePolicies()[employeeId];
  if (!overrides) return policies;
  return policies.map((policy) => {
    const override = overrides[normalizeLeaveTypeValue(policy.type)];
    return override ? applyOverride(policy, override) : policy;
  });
}

/** True when this employee is on something other than the organisation's policy. */
export function hasEmployeeLeavePolicy(employeeId: string): boolean {
  return employeeId in getEmployeeLeavePolicies();
}

/** Replace the whole map. Resolves once the organisation's copy has caught up. */
export function saveEmployeeLeavePolicies(
  policies: EmployeeLeavePolicies,
): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const normalized: EmployeeLeavePolicies = {};
  for (const [employeeId, byType] of Object.entries(policies)) {
    const overrides: Record<string, LeavePolicyOverride> = {};
    for (const [type, value] of Object.entries(byType)) {
      const override = normalizeLeavePolicyOverride(value);
      if (override) overrides[normalizeLeaveTypeValue(type)] = override;
    }
    if (Object.keys(overrides).length > 0) normalized[employeeId] = overrides;
  }
  window.localStorage.setItem(
    orgScopedKey(EMPLOYEE_POLICIES_STORAGE_KEY),
    JSON.stringify(normalized),
  );
  notifyLeavePoliciesChanged();
  return publishOrgSetting(ORG_SETTINGS.employeeLeavePolicies, normalized);
}

/**
 * Set one person's policy, or with `null` put them back on the organisation's.
 *
 * Reads the current map and writes it whole — the setting is one document, so
 * there is no partial write to make. Two administrators editing different people
 * at the same moment is last-write-wins, exactly as the policy list itself is.
 */
export function setEmployeeLeavePolicy(
  employeeId: string,
  overrides: Record<string, LeavePolicyOverride> | null,
): Promise<boolean> {
  const next = { ...getEmployeeLeavePolicies() };
  if (overrides === null) delete next[employeeId];
  else next[employeeId] = overrides;
  return saveEmployeeLeavePolicies(next);
}

/** One line describing what an exception changes, for the review and the list. */
export function describeLeavePolicyOverride(
  type: string,
  override: LeavePolicyOverride,
): string {
  const parts: string[] = [];
  if (override.monthlyAccrual !== undefined) {
    parts.push(`${override.monthlyAccrual} day${override.monthlyAccrual === 1 ? '' : 's'}/month`);
  }
  if (override.annual !== undefined) {
    parts.push(`${override.annual} day${override.annual === 1 ? '' : 's'}/year`);
  }
  if (override.minTenureMonths !== undefined) {
    parts.push(
      override.minTenureMonths === 0
        ? 'from day one'
        : `after ${override.minTenureMonths} month${override.minTenureMonths === 1 ? '' : 's'} of service`,
    );
  }
  return `${type}: ${parts.join(' · ')}`;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/** One employee identified by code, so the parser needs no directory module. */
export interface LeavePolicyCsvSubject {
  id: string;
  employeeCode: string;
  fullName: string;
}

export interface LeavePolicyCsvMatch {
  employee: LeavePolicyCsvSubject;
  /** The type as the organisation names it, e.g. `'Casual Leave'`. */
  policyType: string;
  /** The key it is stored under, e.g. `'Casual'`. */
  typeKey: string;
  override: LeavePolicyOverride;
  /** True when this person already has an exception for this type. */
  replaces: boolean;
  /** 1-based line in the uploaded file, for the review list. */
  line: number;
}

export interface LeavePolicyCsvMiss {
  line: number;
  text: string;
  reason: string;
}

export interface LeavePolicyCsvResult {
  matched: LeavePolicyCsvMatch[];
  unmatched: LeavePolicyCsvMiss[];
}

/** The header the template offers and the parser skips if it is present. */
export const EMPLOYEE_LEAVE_POLICY_CSV_HEADER =
  'employee_code,leave_type,annual_days,monthly_accrual,min_tenure_months';

/** Codes compare on their characters, not their punctuation: `MC-090` = `mc090`. */
function squashCode(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseNumberCell(value: string): number | null | undefined {
  // Blank means "leave the organisation's value alone", which is the common case
  // for two of the three columns — a monthly policy has no annual figure to set
  // and an annual one has no monthly accrual.
  const cleaned = value.replace(/\s/g, '');
  if (cleaned === '') return undefined;
  const parsed = Number(cleaned);
  // null is "present and unusable", which is reported; undefined is "absent".
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Read an uploaded CSV into per-employee leave policies.
 *
 * Nothing is written from here — the caller shows the two lists and HR applies
 * them. A row that cannot be used is **reported**, never skipped: a line
 * silently dropped looks exactly like a line applied, and the person it named
 * keeps accruing on the organisation's quota while the upload appears to have
 * covered them.
 *
 * A row is refused rather than reinterpreted when it sets the wrong figure for
 * how the type accrues — an annual quota against a policy that grants a day a
 * month, or the reverse. Converting one into the other (12 a year → 1 a month)
 * would be this module inventing an accrual pattern nobody typed, and the two
 * are not the same promise: a day a month is not available in April.
 */
export function parseEmployeeLeavePolicyCsv(
  text: string,
  employees: LeavePolicyCsvSubject[],
  policies: LeavePolicy[] = getLeavePolicies(),
  existing: EmployeeLeavePolicies = {},
): LeavePolicyCsvResult {
  const byCode = new Map<string, LeavePolicyCsvSubject>();
  for (const employee of employees) {
    const code = squashCode(employee.employeeCode ?? '');
    if (code) byCode.set(code, employee);
  }
  // Both `Casual` and `Casual Leave` name the same policy, so the lookup is on
  // the normalized value — the same key the overrides are stored under.
  const byType = new Map<string, LeavePolicy>();
  for (const policy of policies) {
    byType.set(normalizeLeaveTypeValue(policy.type).toLowerCase(), policy);
  }

  const matched: LeavePolicyCsvMatch[] = [];
  const unmatched: LeavePolicyCsvMiss[] = [];
  const claimed = new Map<string, number>(); // `${employeeId}::${typeKey}` -> line

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === '') return;
    const cells = trimmed.split(',').map((cell) => cell.trim());
    const code = squashCode(cells[0] ?? '');
    // The header, in whatever case or spacing the spreadsheet wrote it. Skipped
    // rather than reported: it is not a row anybody expected to be applied.
    if (code === 'employeecode' || code === 'employeeid') return;

    if (cells.length < 5) {
      unmatched.push({ line, text: trimmed, reason: 'Needs five columns' });
      return;
    }

    const employee = code ? byCode.get(code) : undefined;
    if (!employee) {
      unmatched.push({
        line,
        text: trimmed,
        reason: code ? `No employee with code ${cells[0]}` : 'No employee code',
      });
      return;
    }

    const policy = byType.get(normalizeLeaveTypeValue(cells[1] ?? '').toLowerCase());
    if (!policy || !cells[1]) {
      unmatched.push({
        line,
        text: trimmed,
        reason: cells[1]
          ? `${cells[1]} is not a leave type this organisation grants`
          : 'No leave type',
      });
      return;
    }
    const typeKey = normalizeLeaveTypeValue(policy.type);

    const claim = `${employee.id}::${typeKey}`;
    const already = claimed.get(claim);
    if (already !== undefined) {
      unmatched.push({
        line,
        text: trimmed,
        reason: `${employee.employeeCode} · ${policy.type} is already set on line ${already}`,
      });
      return;
    }

    const values = cells.slice(2, 5).map(parseNumberCell);
    if (values.some((value) => value === null)) {
      unmatched.push({
        line,
        text: trimmed,
        reason: 'Annual days, monthly accrual and minimum tenure must be numbers',
      });
      return;
    }
    const [annual, monthlyAccrual, minTenureMonths] = values as (number | undefined)[];

    if (values.some((value) => value !== undefined && (value as number) < 0)) {
      unmatched.push({ line, text: trimmed, reason: 'Days cannot be negative' });
      return;
    }

    const monthly = isMonthlyPolicy(policy);
    if (monthly && annual !== undefined) {
      unmatched.push({
        line,
        text: trimmed,
        reason: `${policy.type} accrues month by month — set monthly_accrual, not annual_days`,
      });
      return;
    }
    if (!monthly && monthlyAccrual !== undefined) {
      unmatched.push({
        line,
        text: trimmed,
        reason: `${policy.type} is granted for the year — set annual_days, not monthly_accrual`,
      });
      return;
    }

    const override = normalizeLeavePolicyOverride({ annual, monthlyAccrual, minTenureMonths });
    if (!override) {
      unmatched.push({
        line,
        text: trimmed,
        reason: 'Nothing to change — every figure on this row is blank',
      });
      return;
    }

    claimed.set(claim, line);
    matched.push({
      employee,
      policyType: policy.type,
      typeKey,
      override,
      replaces: typeKey in (existing[employee.id] ?? {}),
      line,
    });
  });

  return { matched, unmatched };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (
      event.key === orgScopedKey(LEAVE_POLICIES_STORAGE_KEY) ||
      event.key === orgScopedKey(EMPLOYEE_POLICIES_STORAGE_KEY)
    ) {
      notifyLeavePoliciesChanged();
    }
  });
}
