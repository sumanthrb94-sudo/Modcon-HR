/**
 * How an organisation splits a monthly gross into salary components.
 *
 * These were four literals in `buildPayslipComponents` — Basic 50%, HRA 25%,
 * two flat ₹1,492 allowances — which made them the same for every tenant on the
 * deployment. They are not the same: the split is a company's own policy, set
 * by whatever its payroll and its statutory advice say, and one organisation's
 * ratios appearing on another's payslips is the compensation equivalent of
 * showing them somebody else's registration number.
 *
 * So the shape lives here and the values belong to the organisation, stored in
 * `org_settings` like the leave policies and the company profile. The defaults
 * below are only what an organisation starts from, not what it is stuck with.
 *
 * Special Allowance is deliberately absent: it is the remainder, computed in
 * `buildPayslipComponents` so the components always sum to the monthly gross
 * exactly. A configurable percentage for it would be a fifth number that has to
 * agree with the other four, and it would eventually not.
 */
import { orgScopedKey } from '@/lib/orgScope';
import { ORG_SETTINGS, publishOrgSetting } from '@/lib/orgSettings';
import { isMockDataCleared } from '@/lib/mockDataFlag';

export interface SalaryStructure {
  /** Share of the monthly gross paid as Basic, 0–100. */
  basicPercent: number;
  /** Share of the monthly gross paid as HRA, 0–100. */
  hraPercent: number;
  /** Flat monthly rupee amount — does not scale with salary. */
  medicalAllowance: number;
  /** Flat monthly rupee amount — the travel allowance. */
  conveyanceAllowance: number;
}

const STORAGE_KEY = ORG_SETTINGS.salaryStructure.storageKey;
export const SALARY_STRUCTURE_CHANGED_EVENT = ORG_SETTINGS.salaryStructure.changedEvent;

/**
 * ModCon Builders' own split — part of the demo dataset, not a platform default.
 *
 * It is shown for the demo organisation and for nobody else. There is no
 * fallback structure for a real organisation that has not set one: a company
 * shown a plausible-looking Basic 50% it never agreed to would read it as its
 * own policy, and payslips would be handed out on somebody else's numbers.
 * Unset is unset — every surface says so and asks an administrator to set it.
 *
 * Same reasoning, and the same `isMockDataCleared()` gate, as
 * `demoCompanyProfile` in data/companyProfile.ts.
 */
const DEMO_SALARY_STRUCTURE: SalaryStructure = {
  basicPercent: 50,
  hraPercent: 25,
  medicalAllowance: 1492,
  conveyanceAllowance: 1492,
};

function notifyChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SALARY_STRUCTURE_CHANGED_EVENT));
}

/** A finite, non-negative number, or the fallback. Rejects NaN and Infinity. */
function number(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

/**
 * Bring any stored value into a shape payroll can compute with.
 *
 * The percentages are capped at 100 each *and* at 100 together: Basic 80 + HRA
 * 40 would otherwise leave the flat allowances and Special Allowance to be
 * carved out of a gross that has already been overspent, and the components
 * would stop summing to the monthly figure. HRA yields, because Basic is the
 * one statutory deductions are computed from.
 */
export function normalizeSalaryStructure(value: unknown): SalaryStructure | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<SalaryStructure>;
  // Zero, not a borrowed figure, for a field that is missing or unusable: a
  // stored structure is always written whole by the form, so a gap here is a
  // hand-edited or half-migrated document, and "0% Basic" is at least visibly
  // wrong where "50% Basic" would pass for a policy somebody chose.
  const basicPercent = number(raw.basicPercent, 0, 100);
  const hraPercent = Math.min(number(raw.hraPercent, 0, 100), 100 - basicPercent);
  return {
    basicPercent,
    hraPercent,
    medicalAllowance: Math.round(number(raw.medicalAllowance, 0)),
    conveyanceAllowance: Math.round(number(raw.conveyanceAllowance, 0)),
  };
}

/**
 * This organisation's split, or `null` when it has not set one.
 *
 * Null is a state the callers must handle rather than paper over: every surface
 * that shows a breakdown says the structure is not set and points at Settings,
 * because the alternative — quietly using a platform default — tells a company
 * its salaries are split in a way nobody there agreed to.
 *
 * Read synchronously from the localStorage cache, like every other setting —
 * `buildPayslipComponents` is called during render and cannot await Firestore.
 * `startOrgSettingsSync` is what keeps the cache current across machines.
 */
export function getSalaryStructure(): SalaryStructure | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(STORAGE_KEY));
    // No stored value at all: the demo organisation gets the demo split, every
    // other organisation gets nothing until its own administrator sets one.
    if (!raw) return isMockDataCleared() ? null : { ...DEMO_SALARY_STRUCTURE };
    // A stored `null` is an organisation that deliberately cleared its
    // structure, and must not fall back to the demo one.
    return normalizeSalaryStructure(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** True when this organisation has a split to show. */
export function hasSalaryStructure(): boolean {
  return getSalaryStructure() !== null;
}

/**
 * Store this organisation's split, or clear it with `null`.
 *
 * Resolves once the organisation's copy has caught up — see publishOrgSetting.
 */
export function saveSalaryStructure(structure: SalaryStructure | null): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const normalized = structure === null ? null : normalizeSalaryStructure(structure);
  // Written rather than removed even when null: an absent key means "nothing
  // stored", which the demo organisation reads as its demo split. Clearing has
  // to be able to say "cleared".
  window.localStorage.setItem(orgScopedKey(STORAGE_KEY), JSON.stringify(normalized));
  notifyChanged();
  return publishOrgSetting(ORG_SETTINGS.salaryStructure, normalized);
}

export interface SalarySplit {
  basic: number;
  hra: number;
  medicalAllowance: number;
  conveyanceAllowance: number;
  /** The remainder — what is left after the four components above. */
  specialAllowance: number;
}

/**
 * Split one month's gross into its components under `structure`.
 *
 * The single definition of the arithmetic: `buildPayslipComponents` computes a
 * payslip with it and Settings previews an unsaved change with it. Written out
 * twice, the preview would eventually promise a split the payslip does not pay.
 *
 * The flat allowances are capped by what is left after Basic and HRA. Without
 * that cap a low enough gross gives a negative Special Allowance and a
 * breakdown that no longer sums to the month's pay — and where that threshold
 * falls moves with the organisation's own percentages, so it cannot be a rule
 * about one particular pair of numbers.
 */
export function splitMonthlyGross(
  monthly: number,
  structure: SalaryStructure | null = getSalaryStructure(),
): SalarySplit | null {
  const safe = normalizeSalaryStructure(structure);
  // No structure, no split. Returning zeros would render a breakdown claiming
  // the whole salary is Special Allowance, which is a statement, not a blank.
  if (!safe) return null;
  const basic = Math.round(monthly * (safe.basicPercent / 100));
  const hra = Math.round(monthly * (safe.hraPercent / 100));
  const afterPercentages = Math.max(0, monthly - basic - hra);
  const medicalAllowance = Math.min(safe.medicalAllowance, afterPercentages);
  const conveyanceAllowance = Math.min(
    safe.conveyanceAllowance,
    afterPercentages - medicalAllowance,
  );
  return {
    basic,
    hra,
    medicalAllowance,
    conveyanceAllowance,
    // The remainder, so the components always sum to the monthly gross exactly —
    // including the rupee or two that rounding Basic and HRA leaves behind.
    specialAllowance: afterPercentages - medicalAllowance - conveyanceAllowance,
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === orgScopedKey(STORAGE_KEY)) notifyChanged();
  });
}
