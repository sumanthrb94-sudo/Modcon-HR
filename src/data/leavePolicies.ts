import type { LeaveType } from '@/types';
import { orgScopedKey } from '@/lib/orgScope';
import { ORG_SETTINGS, publishOrgSetting } from '@/lib/orgSettings';

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
 * The organisation's leave policy.
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
const defaultPolicies: LeavePolicy[] = [
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
 * policy as annual, so they are normalised against the matching default.
 */
function normalizePolicy(policy: LeavePolicy): LeavePolicy {
  const fallback = defaultPolicies.find((p) => p.type === policy.type);
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

export function getLeavePolicies(): LeavePolicy[] {
  const stored = readStoredLeavePolicies();
  return (stored ?? defaultPolicies).map(normalizePolicy);
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
