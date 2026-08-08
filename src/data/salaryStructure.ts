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
  const basic = Math.min(Math.round(monthly * (safe.basicPercent / 100)), monthly);
  // Capped by what Basic leaves, not just by its own percentage. Rounding the
  // two independently can put them a rupee over the gross whenever they total
  // exactly 100% — Basic 50 / HRA 50 on a gross of ₹8,333 rounds to 4,167 each,
  // which is ₹8,334. Special Allowance cannot absorb that (there is nothing
  // left for it to give back), so the breakdown would show components summing
  // to a rupee more than the gross printed above them. Basic wins the rupee,
  // because it is what statutory deductions are computed from.
  const hra = Math.min(Math.round(monthly * (safe.hraPercent / 100)), monthly - basic);
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

// ---------------------------------------------------------------------------
// Per-employee salary structures
// ---------------------------------------------------------------------------

/**
 * employee id → the split **that person** is paid on.
 *
 * A whole structure per person, not a sparse set of overrides — which is the
 * opposite of how per-employee leave policies work, and deliberately so. The
 * four numbers here are not independent: Basic and HRA are capped against each
 * other, the flat allowances are capped by what those two leave, and Special
 * Allowance is whatever remains. Taking one field from an individual and three
 * from the organisation would produce a split nobody at this company agreed to,
 * and it would move under them the next time Settings was edited. A negotiated
 * compensation structure is agreed whole, so it is stored whole.
 *
 * The cost is worth knowing: an individual's structure does **not** follow a
 * later change to the organisation's. That is what "custom" means here, and the
 * Settings list names everyone it is true of.
 */
export type EmployeeSalaryStructures = Record<string, SalaryStructure>;

const EMPLOYEE_STRUCTURES_STORAGE_KEY = ORG_SETTINGS.employeeSalaryStructures.storageKey;

/** Every stored per-employee structure, normalized. `{}` when there are none. */
export function getEmployeeSalaryStructures(): EmployeeSalaryStructures {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(orgScopedKey(EMPLOYEE_STRUCTURES_STORAGE_KEY));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: EmployeeSalaryStructures = {};
    for (const [employeeId, value] of Object.entries(parsed as Record<string, unknown>)) {
      const structure = normalizeSalaryStructure(value);
      // An entry that normalizes to nothing is dropped rather than kept: "no
      // structure recorded for this person" falls back to the organisation's,
      // which is the honest reading of an unusable one.
      if (structure) out[employeeId] = structure;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The split **this employee** is paid on — their own, or the organisation's.
 *
 * The one function payroll should ask. `getSalaryStructure()` still answers
 * "what does this organisation split a gross on by default", which is what
 * Settings edits and what everyone without a custom structure is paid on.
 *
 * Called with no id — a surface with no particular employee in view, such as the
 * Settings preview — it is exactly `getSalaryStructure()`. Still `null` when
 * neither exists, so every breakdown goes on saying "not set" rather than
 * inventing one.
 */
export function getSalaryStructureFor(employeeId?: string): SalaryStructure | null {
  if (!employeeId) return getSalaryStructure();
  const own = getEmployeeSalaryStructures()[employeeId];
  return own ? { ...own } : getSalaryStructure();
}

/** True when this employee is paid on something other than the organisation's split. */
export function hasEmployeeSalaryStructure(employeeId: string): boolean {
  return employeeId in getEmployeeSalaryStructures();
}

/** Replace the whole map. Resolves once the organisation's copy has caught up. */
export function saveEmployeeSalaryStructures(
  structures: EmployeeSalaryStructures,
): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const normalized: EmployeeSalaryStructures = {};
  for (const [employeeId, value] of Object.entries(structures)) {
    const structure = normalizeSalaryStructure(value);
    if (structure) normalized[employeeId] = structure;
  }
  window.localStorage.setItem(
    orgScopedKey(EMPLOYEE_STRUCTURES_STORAGE_KEY),
    JSON.stringify(normalized),
  );
  notifyChanged();
  return publishOrgSetting(ORG_SETTINGS.employeeSalaryStructures, normalized);
}

/**
 * Set one person's structure, or with `null` put them back on the organisation's.
 *
 * Reads the current map and writes it whole — the setting is one document, so
 * there is no partial write to make. Two administrators editing different people
 * at the same moment is last-write-wins, exactly as the organisation's own
 * structure is.
 */
export function setEmployeeSalaryStructure(
  employeeId: string,
  structure: SalaryStructure | null,
): Promise<boolean> {
  const next = { ...getEmployeeSalaryStructures() };
  if (structure === null) delete next[employeeId];
  else next[employeeId] = structure;
  return saveEmployeeSalaryStructures(next);
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/** One employee identified by code, so the parser needs no directory module. */
export interface SalaryStructureCsvSubject {
  id: string;
  employeeCode: string;
  fullName: string;
}

export interface SalaryStructureCsvMatch {
  employee: SalaryStructureCsvSubject;
  structure: SalaryStructure;
  /** True when this person is already on a custom structure. */
  replaces: boolean;
  /** 1-based line in the uploaded file, for the review list. */
  line: number;
}

export interface SalaryStructureCsvMiss {
  line: number;
  text: string;
  reason: string;
}

export interface SalaryStructureCsvResult {
  matched: SalaryStructureCsvMatch[];
  unmatched: SalaryStructureCsvMiss[];
}

/** The columns the upload expects, in order. Shown on the page, skipped if present. */
export const EMPLOYEE_SALARY_STRUCTURE_CSV_HEADER =
  'employee_code,basic_percent,hra_percent,medical_allowance,conveyance_allowance';

/** Codes compare on their characters, not their punctuation: `MC-090` = `mc090`. */
function squashCode(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Read an uploaded CSV into per-employee salary structures.
 *
 * Nothing is written from here — the caller shows the two lists and HR applies
 * them. A row that cannot be used is **reported**, never skipped: a line
 * silently dropped looks exactly like a line applied, and the person it named
 * goes on being paid on the organisation's split while the upload appears to
 * have covered them.
 *
 * All four figures are required on every row. A partial row is refused rather
 * than completed from the organisation's structure, for the same reason
 * `EmployeeSalaryStructures` is not sparse: three of somebody's own numbers
 * beside one of the company's is a split nobody negotiated.
 */
export function parseEmployeeSalaryStructureCsv(
  text: string,
  employees: SalaryStructureCsvSubject[],
  existing: EmployeeSalaryStructures = {},
): SalaryStructureCsvResult {
  const byCode = new Map<string, SalaryStructureCsvSubject>();
  for (const employee of employees) {
    const code = squashCode(employee.employeeCode ?? '');
    if (code) byCode.set(code, employee);
  }

  const matched: SalaryStructureCsvMatch[] = [];
  const unmatched: SalaryStructureCsvMiss[] = [];
  const claimed = new Map<string, number>(); // employee id -> the line that took them

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

    const already = claimed.get(employee.id);
    if (already !== undefined) {
      unmatched.push({
        line,
        text: trimmed,
        reason: `${employee.employeeCode} is already set on line ${already}`,
      });
      return;
    }

    // Blank is not zero here: every figure is required, and `Number('')` is 0,
    // which would read an empty cell as "pays no HRA" rather than as a gap.
    const values = cells.slice(1, 5).map((cell) => (cell === '' ? NaN : Number(cell)));
    if (values.some((value) => !Number.isFinite(value))) {
      unmatched.push({
        line,
        text: trimmed,
        reason: 'Basic %, HRA %, medical and conveyance must all be numbers',
      });
      return;
    }
    const [basicPercent, hraPercent, medicalAllowance, conveyanceAllowance] = values;

    if (values.some((value) => value < 0)) {
      unmatched.push({
        line,
        text: trimmed,
        reason: 'A salary component is an amount paid, not one taken back',
      });
      return;
    }
    // Refused rather than left to `normalizeSalaryStructure`, which clamps HRA
    // down to whatever Basic leaves: clamping would apply a split this row does
    // not state, under a review list showing figures HR never typed.
    if (basicPercent + hraPercent > 100) {
      unmatched.push({
        line,
        text: trimmed,
        reason: `Basic and HRA come to ${basicPercent + hraPercent}% — together they cannot exceed 100%`,
      });
      return;
    }

    const structure = normalizeSalaryStructure({
      basicPercent,
      hraPercent,
      medicalAllowance,
      conveyanceAllowance,
    });
    if (!structure) {
      unmatched.push({ line, text: trimmed, reason: 'Not a usable salary structure' });
      return;
    }

    claimed.set(employee.id, line);
    matched.push({
      employee,
      structure,
      replaces: employee.id in existing,
      line,
    });
  });

  return { matched, unmatched };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (
      event.key === orgScopedKey(STORAGE_KEY) ||
      event.key === orgScopedKey(EMPLOYEE_STRUCTURES_STORAGE_KEY)
    ) {
      notifyChanged();
    }
  });
}
