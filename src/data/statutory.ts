/**
 * The organisation's statutory registrations, and each employee's tax election.
 *
 * The storage half of the statutory payroll feature; the arithmetic is in
 * data/statutoryRules.ts, which imports nothing so it can be unit tested. The
 * split is the same one shifts and geofencing already use, and for the same
 * reason: money arithmetic nobody can run in a second is money arithmetic
 * nobody checks.
 *
 * ## Why nothing is on by default
 *
 * 12% EPF is not a company's opinion, it is the Act, so the *rates* ship
 * (`INDIA_STATUTORY_RATES`). Whether a scheme applies is a different question:
 * registration under EPF, ESI, professional tax and TDS depends on headcount,
 * on the state, and on what the business does. An app that assumed it would
 * either deduct money from people it should not, or quietly under-deduct and
 * leave the employer holding the liability.
 *
 * So an organisation that has declared nothing behaves exactly as this app
 * behaved before this module existed: gross is CTC ÷ 12, net is that minus
 * unpaid absence, and no statutory line appears on the payslip. Every surface
 * says the schemes are not configured rather than showing a column of zeroes,
 * which is the same discipline the salary structure and holiday calendar keep.
 *
 * ## Read at call time
 *
 * `getStatutoryConfig()` reads the localStorage cache synchronously, like every
 * other setting — `buildPayslipComponents` is called during render and cannot
 * await Firestore. Never capture it at module load; anything that stays mounted
 * subscribes with `useStatutoryRevision`.
 */
import { orgScopedKey } from '@/lib/orgScope';
import { ORG_SETTINGS, publishOrgSetting } from '@/lib/orgSettings';
import {
  INDIA_STATUTORY_RATES,
  NO_STATUTORY_CONFIG,
  REFERENCE_PROFESSIONAL_TAX,
  type ProfessionalTaxSchedule,
  type StatutoryConfig,
  type TaxRegime,
} from '@/data/statutoryRules';

const STORAGE_KEY = ORG_SETTINGS.statutoryConfig.storageKey;
const ELECTIONS_KEY = ORG_SETTINGS.employeeTaxElections.storageKey;
export const STATUTORY_CHANGED_EVENT = ORG_SETTINGS.statutoryConfig.changedEvent;

export { INDIA_STATUTORY_RATES, NO_STATUTORY_CONFIG, REFERENCE_PROFESSIONAL_TAX };
export type { ProfessionalTaxSchedule, StatutoryConfig, TaxRegime };

function notifyChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(STATUTORY_CHANGED_EVENT));
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** A trimmed string, capped so a pasted document cannot become a code. */
function code(value: unknown, max = 40): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Bring a stored professional-tax schedule into a shape the arithmetic can use.
 *
 * Slabs are sorted by their ceiling with the open-ended band last, because
 * `professionalTax` takes the first band the gross fits and an unsorted table
 * would charge whatever happened to be written first. A table with no
 * open-ended band is left as it is: somebody who wrote a top band with a
 * ceiling meant it, and inventing one would put a deduction on a salary the
 * organisation's own table says nothing about.
 */
export function normalizeProfessionalTaxSchedule(value: unknown): ProfessionalTaxSchedule | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ProfessionalTaxSchedule>;
  const state = code(raw.state, 60);
  if (!state) return null;

  const slabs = (Array.isArray(raw.slabs) ? raw.slabs : [])
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const slab = entry as { upTo?: unknown; amount?: unknown };
      const amount = finiteNumber(slab.amount);
      if (amount === null) return null;
      const upTo = slab.upTo === null || slab.upTo === undefined ? null : finiteNumber(slab.upTo);
      // `undefined` from a bad figure is not the same as an intended `null`,
      // and treating it as "and above" would move a mistyped band to the top.
      if (upTo === undefined) return null;
      return { upTo, amount: Math.round(amount) };
    })
    .filter((slab): slab is { upTo: number | null; amount: number } => slab !== null)
    .sort((a, b) => (a.upTo ?? Number.POSITIVE_INFINITY) - (b.upTo ?? Number.POSITIVE_INFINITY));

  if (slabs.length === 0) return null;

  const february = finiteNumber(raw.februaryAmount);
  return {
    state,
    slabs,
    ...(february === null ? {} : { februaryAmount: Math.round(february) }),
    checkedAgainst: code(raw.checkedAgainst, 10) || 'unknown',
  };
}

/** location name -> state name, both trimmed; entries missing either dropped. */
function normalizeStateMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [location, state] of Object.entries(value as Record<string, unknown>)) {
    const key = code(location, 80);
    const name = code(state, 60);
    if (key && name) out[key] = name;
  }
  return out;
}

/** Bring any stored value into a config payroll can compute with. */
export function normalizeStatutoryConfig(value: unknown): StatutoryConfig | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<StatutoryConfig>;
  const epf = (raw.epf ?? {}) as Partial<StatutoryConfig['epf']>;
  const esi = (raw.esi ?? {}) as Partial<StatutoryConfig['esi']>;
  const pt = (raw.professionalTax ?? {}) as Partial<StatutoryConfig['professionalTax']>;
  const it = (raw.incomeTax ?? {}) as Partial<StatutoryConfig['incomeTax']>;

  const schedules = (Array.isArray(pt.schedules) ? pt.schedules : [])
    .map(normalizeProfessionalTaxSchedule)
    .filter((schedule): schedule is ProfessionalTaxSchedule => schedule !== null);

  return {
    epf: {
      // A scheme is only ever on when there is somewhere to remit to. An
      // establishment code is the one field that cannot be inferred, so its
      // absence turns the scheme off rather than leaving a deduction with no
      // destination — which is worse than not deducting.
      enabled: boolean(epf.enabled, false) && code(epf.establishmentCode) !== '',
      establishmentCode: code(epf.establishmentCode),
      restrictToWageCeiling: boolean(epf.restrictToWageCeiling, true),
      employerShareInCtc: boolean(epf.employerShareInCtc, true),
    },
    esi: {
      enabled: boolean(esi.enabled, false) && code(esi.establishmentCode) !== '',
      establishmentCode: code(esi.establishmentCode),
    },
    professionalTax: {
      enabled: boolean(pt.enabled, false) && schedules.length > 0,
      schedules,
      stateByLocation: normalizeStateMap(pt.stateByLocation),
    },
    incomeTax: {
      enabled: boolean(it.enabled, false) && code(it.tan) !== '',
      tan: code(it.tan, 12).toUpperCase(),
      defaultRegime: it.defaultRegime === 'old' ? 'old' : 'new',
    },
    enforceWageFloor: boolean(raw.enforceWageFloor, true),
  };
}

/**
 * This organisation's declared registrations, or `null` when it has declared
 * nothing at all.
 *
 * Null and `NO_STATUTORY_CONFIG` are both "nothing is withheld", and they are
 * still different: null is an organisation nobody has set up, which Settings
 * prompts about; the empty config is one whose administrator looked at the
 * page and turned everything off. `statutoryConfigOrNone()` is what payroll
 * asks, because it does not care which.
 */
export function getStatutoryConfig(): StatutoryConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(STORAGE_KEY));
    if (!raw) return null;
    return normalizeStatutoryConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** The config, or an all-off one. What payroll computes against. */
export function statutoryConfigOrNone(): StatutoryConfig {
  return getStatutoryConfig() ?? NO_STATUTORY_CONFIG;
}

/** True when this organisation has any statutory scheme switched on. */
export function hasStatutoryScheme(config: StatutoryConfig | null = getStatutoryConfig()): boolean {
  if (!config) return false;
  return (
    config.epf.enabled ||
    config.esi.enabled ||
    config.professionalTax.enabled ||
    config.incomeTax.enabled
  );
}

/** Store this organisation's registrations, or clear them with `null`. */
export function saveStatutoryConfig(config: StatutoryConfig | null): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const normalized = config === null ? null : normalizeStatutoryConfig(config);
  window.localStorage.setItem(orgScopedKey(STORAGE_KEY), JSON.stringify(normalized));
  notifyChanged();
  return publishOrgSetting(ORG_SETTINGS.statutoryConfig, normalized);
}

/**
 * The schedule for one state, from what the organisation has declared.
 *
 * Matched case-insensitively on the name, because a work location's state is
 * typed by whoever created the location and "karnataka" is the same state as
 * "Karnataka". Null when the organisation has no table for it, which deducts
 * nothing rather than falling back to another state's slabs — professional tax
 * is levied by the state somebody works in, and any other state's figure is
 * simply a wrong deduction.
 */
export function professionalTaxScheduleFor(
  state: string,
  config: StatutoryConfig | null = getStatutoryConfig(),
): ProfessionalTaxSchedule | null {
  if (!config?.professionalTax.enabled || !state) return null;
  const wanted = state.trim().toLowerCase();
  return config.professionalTax.schedules.find((s) => s.state.toLowerCase() === wanted) ?? null;
}

/**
 * The schedule for the state a work location is in.
 *
 * What payroll actually asks, since an employee record carries a location and
 * not a state. Null for a location the organisation has not mapped — see the
 * note on `stateByLocation`: deducting another state's figure because this one
 * is unmapped is worse than deducting nothing, and Settings lists the unmapped
 * locations so the gap is visible.
 */
export function professionalTaxScheduleForLocation(
  location: string,
  config: StatutoryConfig | null = getStatutoryConfig(),
): ProfessionalTaxSchedule | null {
  if (!config?.professionalTax.enabled || !location) return null;
  const state = config.professionalTax.stateByLocation[location.trim()];
  return state ? professionalTaxScheduleFor(state, config) : null;
}

// ---------------------------------------------------------------------------
// Per-employee tax election
// ---------------------------------------------------------------------------

/**
 * What one employee has told payroll about their own tax.
 *
 * Sparse and narrow, the same shape as the per-employee leave and salary
 * exceptions: only what belongs to the person. The slabs, the standard
 * deduction and the rebate stay the organisation's — that is to say, the
 * country's — because those are not terms anybody negotiates.
 */
export interface TaxElection {
  /** Absent means they have not elected, and the organisation's default applies. */
  readonly regime?: TaxRegime;
  /**
   * Chapter VI-A and the rest, declared for the year. Old regime only.
   *
   * Held as one figure rather than as 80C, 80D, HRA and the rest because this
   * app has no investment-proof workflow to collect them separately, and a form
   * with eight boxes nobody validates is not more accurate than one box, it
   * just looks it.
   */
  readonly declaredDeductions?: number;
  /** Tax already withheld this financial year, so a mid-year change corrects. */
  readonly taxDeductedSoFar?: number;
  /** Raises the ESI coverage threshold. Recorded by HR, not self-declared. */
  readonly hasDisability?: boolean;
  /** Excluded from EPF as an existing exempt member. */
  readonly pfExempt?: boolean;
}

export type EmployeeTaxElections = Record<string, TaxElection>;

function normalizeElection(value: unknown): TaxElection | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<TaxElection>;
  const declared = finiteNumber(raw.declaredDeductions);
  const deducted = finiteNumber(raw.taxDeductedSoFar);
  const election: TaxElection = {
    ...(raw.regime === 'old' || raw.regime === 'new' ? { regime: raw.regime } : {}),
    ...(declared === null ? {} : { declaredDeductions: Math.round(declared) }),
    ...(deducted === null ? {} : { taxDeductedSoFar: Math.round(deducted) }),
    ...(raw.hasDisability === true ? { hasDisability: true } : {}),
    ...(raw.pfExempt === true ? { pfExempt: true } : {}),
  };
  // An entry that says nothing is not an entry. Kept, it would show up in
  // Settings as a person with an exception nobody can see the content of.
  return Object.keys(election).length === 0 ? null : election;
}

export function normalizeTaxElections(value: unknown): EmployeeTaxElections {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: EmployeeTaxElections = {};
  for (const [employeeId, raw] of Object.entries(value as Record<string, unknown>)) {
    const election = normalizeElection(raw);
    if (election) out[employeeId] = election;
  }
  return out;
}

export function getTaxElections(): EmployeeTaxElections {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(orgScopedKey(ELECTIONS_KEY));
    return raw ? normalizeTaxElections(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** One person's election, or an empty one. */
export function getTaxElectionFor(employeeId: string): TaxElection {
  return getTaxElections()[employeeId] ?? {};
}

/**
 * The regime one employee is actually taxed under.
 *
 * Their own election where they have made one, the organisation's default
 * otherwise. The default is not "old" for anybody who has not chosen: the new
 * regime applies by law where nothing is elected, and an employer who has not
 * collected the election has not collected the investment declarations the old
 * regime needs either.
 */
export function taxRegimeFor(
  employeeId: string,
  config: StatutoryConfig | null = getStatutoryConfig(),
): TaxRegime {
  return getTaxElectionFor(employeeId).regime ?? config?.incomeTax.defaultRegime ?? 'new';
}

/**
 * Merge elections in, keeping the ones this write says nothing about.
 *
 * A file about three people is a statement about those three. Removing an
 * election is passing `null` for that id, which puts them back on the
 * organisation's default rather than on nothing.
 */
export function saveTaxElections(
  changes: Record<string, TaxElection | null>,
): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const merged: EmployeeTaxElections = { ...getTaxElections() };
  for (const [employeeId, election] of Object.entries(changes)) {
    const normalized = election === null ? null : normalizeElection(election);
    if (normalized) merged[employeeId] = normalized;
    else delete merged[employeeId];
  }
  window.localStorage.setItem(orgScopedKey(ELECTIONS_KEY), JSON.stringify(merged));
  notifyChanged();
  return publishOrgSetting(ORG_SETTINGS.employeeTaxElections, merged);
}
