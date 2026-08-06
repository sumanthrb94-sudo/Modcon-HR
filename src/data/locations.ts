/**
 * The organisation's work locations.
 *
 * These used to be derived and nothing else: `syncDirectorySnapshots` in
 * data/employees.ts collected the distinct `location` of everyone in the
 * directory, and that list was what every dropdown offered. It reads as though
 * it works — an administrator picks "+ Add new location", types one, saves the
 * employee, and there it is in the list.
 *
 * It is not there for anyone else. The employee directory is localStorage
 * (see data/employees.ts), so a location invented that way exists in exactly
 * one browser: the colleague in the next chair opens the same form and is
 * offered the old list. And because the list is a projection of who works
 * where, the location disappears the moment its last employee is deleted or
 * moved — an office is not a property of the people in it.
 *
 * So an added location is stored as organisation configuration, like the
 * departments beside it in the same form, and the list the app shows is the
 * union of the two: what the organisation has declared, plus wherever its
 * people already work. The derived half stays because it is what keeps the
 * demo dataset and any pre-existing records offering sensible values without a
 * migration.
 */
import { orgScopedKey } from '@/lib/orgScope';
import { ORG_SETTINGS, publishOrgSetting } from '@/lib/orgSettings';

const STORAGE_KEY = ORG_SETTINGS.customLocations.storageKey;
export const LOCATION_DIRECTORY_CHANGED_EVENT = ORG_SETTINGS.customLocations.changedEvent;

function notifyChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(LOCATION_DIRECTORY_CHANGED_EVENT));
}

/** Trimmed, collapsed and capped. A location is a place name, not a paragraph. */
export function normalizeLocation(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
}

/** Locations this organisation has declared, in the order they were added. */
export function getCustomLocations(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(orgScopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .map(normalizeLocation)
      .filter((name) => name !== '' && !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()));
  } catch {
    return [];
  }
}

/**
 * Declare a location for the organisation.
 *
 * Idempotent and case-insensitive on the way in: "Chennai" and "chennai" are
 * one place, and a list offering both is a list that will eventually have half
 * the office in each. Resolves once the organisation's copy has caught up —
 * see publishOrgSetting.
 */
export function addLocationToDirectory(name: string): Promise<boolean> {
  const location = normalizeLocation(name);
  if (typeof window === 'undefined' || !location) return Promise.resolve(false);

  const existing = getCustomLocations();
  if (existing.some((item) => item.toLowerCase() === location.toLowerCase())) {
    return Promise.resolve(true);
  }

  const next = [...existing, location];
  window.localStorage.setItem(orgScopedKey(STORAGE_KEY), JSON.stringify(next));
  notifyChanged();
  return publishOrgSetting(ORG_SETTINGS.customLocations, next);
}

/**
 * Withdraw a declared location.
 *
 * Only ever removes it from the declared list. A location somebody actually
 * works in keeps appearing, because the derived half still reports it — and
 * hiding a place while people are posted there would leave their own records
 * showing a location the form says does not exist.
 */
export function removeLocationFromDirectory(name: string): Promise<boolean> {
  const location = normalizeLocation(name);
  if (typeof window === 'undefined' || !location) return Promise.resolve(false);

  const next = getCustomLocations().filter((item) => item.toLowerCase() !== location.toLowerCase());
  window.localStorage.setItem(orgScopedKey(STORAGE_KEY), JSON.stringify(next));
  notifyChanged();
  return publishOrgSetting(ORG_SETTINGS.customLocations, next);
}

/**
 * Every location the organisation offers: declared, plus wherever people work.
 *
 * `derived` is passed in rather than imported so this module does not depend on
 * the employee directory — data/employees.ts is what calls this, and importing
 * it back would be a cycle.
 */
export function mergeLocations(derived: string[]): string[] {
  const seen = new Set<string>();
  return [...getCustomLocations(), ...derived]
    .map(normalizeLocation)
    .filter((name) => name !== '' && !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === orgScopedKey(STORAGE_KEY)) notifyChanged();
  });
}
