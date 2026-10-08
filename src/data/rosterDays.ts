import { orgScopedKey } from '@/lib/orgScope';
import { ORG_SETTINGS, publishOrgSetting } from '@/lib/orgSettings';

/**
 * Days off HR has rostered for one person on specific dates.
 *
 * The weekly week-off says "every Sunday"; a rotating team — site staff,
 * security, a support desk on shifts — is given its days off a month at a
 * time, and they differ person to person and week to week. Those dates are
 * the same thing as a week-off for every purpose: not a working day, never an
 * absence, never offered for regularization, never charged as leave and
 * never deducted. `isWeekOffFor` in data/employees.ts asks this module, so
 * every one of those questions picks them up at once.
 *
 * Stored per employee as a sorted list of `YYYY-MM-DD`, in `org_settings`
 * like the rest of the organisation's configuration, under the week-off
 * change event so everything that re-renders for a week-off change re-renders
 * for this too.
 */
export type RosteredDaysOff = Record<string, string[]>;

const STORAGE_KEY = ORG_SETTINGS.rosteredDaysOff.storageKey;
const CHANGED_EVENT = ORG_SETTINGS.rosteredDaysOff.changedEvent;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function getRosteredDaysOff(): RosteredDaysOff {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(orgScopedKey(STORAGE_KEY));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: RosteredDaysOff = {};
    for (const [id, dates] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(dates)) continue;
      const clean = dates.filter((d): d is string => typeof d === 'string' && ISO.test(d));
      if (clean.length > 0) out[id] = [...new Set(clean)].sort();
    }
    return out;
  } catch {
    return {};
  }
}

/** True when HR has rostered this person off on this date. */
export function isRosteredOff(employeeId: string | null | undefined, date: string): boolean {
  if (!employeeId) return false;
  return getRosteredDaysOff()[employeeId]?.includes(date.slice(0, 10)) ?? false;
}

/** Resolves once the organisation's copy has caught up — see publishOrgSetting. */
export function saveRosteredDaysOff(value: RosteredDaysOff): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const clean: RosteredDaysOff = {};
  for (const [id, dates] of Object.entries(value)) {
    const list = [...new Set(dates.filter((d) => ISO.test(d)))].sort();
    if (list.length > 0) clean[id] = list;
  }
  window.localStorage.setItem(orgScopedKey(STORAGE_KEY), JSON.stringify(clean));
  window.dispatchEvent(new Event(CHANGED_EVENT));
  return publishOrgSetting(ORG_SETTINGS.rosteredDaysOff, clean);
}

/** Add dates to people's rosters, keeping what each already had. */
export function addRosteredDaysOff(additions: Record<string, string[]>): Promise<boolean> {
  const next = { ...getRosteredDaysOff() };
  for (const [id, dates] of Object.entries(additions)) next[id] = [...(next[id] ?? []), ...dates];
  return saveRosteredDaysOff(next);
}

/** Take one date off one person's roster. */
export function removeRosteredDayOff(employeeId: string, date: string): Promise<boolean> {
  const next = { ...getRosteredDaysOff() };
  next[employeeId] = (next[employeeId] ?? []).filter((d) => d !== date);
  return saveRosteredDaysOff(next);
}
