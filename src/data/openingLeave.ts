import { orgScopedKey } from '@/lib/orgScope';
import { ORG_SETTINGS, publishOrgSetting } from '@/lib/orgSettings';
import { financialYearOf } from '@/lib/financialYear';
import { todayIso } from '@/lib/today';

/**
 * Leave taken this financial year before the organisation started using this
 * app, per employee and type. Uploaded in Settings → Leave Policies; read by
 * `getApplicableEntitlements`, which counts it as used. See
 * data/openingLeaveCsv.ts for why the figure is days taken.
 *
 * Stored with the financial year it belongs to, so it stops counting on
 * 1 April rather than being subtracted from next year's balance as well.
 */
export interface OpeningLeaveTaken {
  /** The financial year's starting calendar year: 2026 for FY 2026-27. */
  financialYear: number;
  byEmployee: Record<string, Record<string, number>>;
}

const STORAGE_KEY = ORG_SETTINGS.openingLeaveTaken.storageKey;
const CHANGED_EVENT = ORG_SETTINGS.openingLeaveTaken.changedEvent;

export function getOpeningLeaveTaken(): OpeningLeaveTaken | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OpeningLeaveTaken>;
    if (typeof parsed?.financialYear !== 'number' || !parsed.byEmployee || typeof parsed.byEmployee !== 'object') {
      return null;
    }
    return { financialYear: parsed.financialYear, byEmployee: parsed.byEmployee };
  } catch {
    return null;
  }
}

/** Days of `typeKey` this person took before go-live, in the year of `asOf`. */
export function openingLeaveTakenFor(employeeId: string, typeKey: string, asOf: string = todayIso()): number {
  const stored = getOpeningLeaveTaken();
  if (!stored || stored.financialYear !== financialYearOf(asOf)) return 0;
  const days = stored.byEmployee[employeeId]?.[typeKey];
  return typeof days === 'number' && Number.isFinite(days) && days > 0 ? days : 0;
}

/** Resolves once the organisation's copy has caught up — see publishOrgSetting. */
export function saveOpeningLeaveTaken(value: OpeningLeaveTaken | null): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const stored = value ?? { financialYear: financialYearOf(), byEmployee: {} };
  window.localStorage.setItem(orgScopedKey(STORAGE_KEY), JSON.stringify(stored));
  window.dispatchEvent(new Event(CHANGED_EVENT));
  return publishOrgSetting(ORG_SETTINGS.openingLeaveTaken, stored);
}
