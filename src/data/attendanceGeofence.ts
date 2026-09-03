/**
 * Where the organisation accepts attendance from.
 *
 * The storage half of geofenced attendance: the `org_settings` registry, the
 * localStorage cache read synchronously at module-load time, and the change
 * event both settings publish on. The arithmetic lives in
 * data/geofenceRules.ts, which imports nothing and is unit tested.
 *
 * There is **no default fence and no demo fence**, and that is deliberate for
 * the same reason the holiday calendar and the salary split have no default:
 * a plausible one is indistinguishable from a decision the organisation made,
 * and here the consequence of an invented fence is that people are marked
 * absent — or refused a check-in — at a place nobody chose. A fresh
 * organisation has `mode: 'off'` and nothing happens until HR draws a fence.
 *
 * See docs/geofenced-attendance-spec.md.
 */
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getActiveOrgKey, orgScopedKey } from '@/lib/orgScope';
import { ORG_SETTINGS, publishOrgSetting } from '@/lib/orgSettings';
import {
  EMPTY_GEOFENCE_CONFIG,
  normalizeExemptions,
  normalizeGeofenceConfig,
  type GeofenceConfig,
  type GeofenceExemptions,
  type GeofenceSite,
} from '@/data/geofenceRules';

const STORAGE_KEY = ORG_SETTINGS.attendanceGeofence.storageKey;
const EXEMPTIONS_STORAGE_KEY = ORG_SETTINGS.geofenceExemptions.storageKey;

/**
 * Both settings publish on this. The fence and who is exempt from it are the
 * same fact from two ends, and a surface that re-rendered for only one of them
 * would show the two disagreeing.
 */
export const ATTENDANCE_GEOFENCE_CHANGED_EVENT = ORG_SETTINGS.attendanceGeofence.changedEvent;

function notifyChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ATTENDANCE_GEOFENCE_CHANGED_EVENT));
}

function readJson(storageKey: string): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(storageKey));
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/**
 * The organisation's geofencing configuration.
 *
 * Read at call time, never captured at module load: an administrator can move
 * a fence in Settings, and the cache is hydrated from Firestore after sign-in.
 * Anything that stays mounted subscribes with `useAttendanceGeofenceRevision`.
 */
export function getGeofenceConfig(): GeofenceConfig {
  const stored = readJson(STORAGE_KEY);
  return stored ? normalizeGeofenceConfig(stored) : EMPTY_GEOFENCE_CONFIG;
}

/** Employees the fence does not apply to. Sparse; absent means "subject to it". */
export function getGeofenceExemptions(): GeofenceExemptions {
  return normalizeExemptions(readJson(EXEMPTIONS_STORAGE_KEY));
}

/** Is this employee outside the fence's reach? */
export function isExemptFromGeofence(employeeId: string | null | undefined): boolean {
  if (!employeeId) return false;
  return Object.prototype.hasOwnProperty.call(getGeofenceExemptions(), employeeId);
}

/**
 * The fence configuration as one employee experiences it.
 *
 * What every caller actually wants: an exempt employee is not "the
 * organisation's config plus a flag", they are simply not fenced, and pushing
 * that distinction to each call site is how one surface ends up capturing the
 * position of somebody the organisation decided not to track.
 */
export function getGeofenceConfigFor(employeeId: string | null | undefined): {
  config: GeofenceConfig;
  exempt: boolean;
} {
  return { config: getGeofenceConfig(), exempt: isExemptFromGeofence(employeeId) };
}

/**
 * The fence in the shape `firestore.rules` can read.
 *
 * The settings copy is a JSON *string* — that is what the org-settings
 * registry stores, deliberately, because nothing queries inside one. Rules
 * have no JSON parser, so a rule cannot check a stamp against that copy at
 * all. This projection exists for `withinClaimedSite` in firestore.rules and
 * for nothing else: the app never reads it back, so the two copies cannot
 * drift into disagreeing about what the app *shows*. What they can drift on is
 * what the server will *accept*, and that fails closed — a stale or missing
 * projection refuses `inside` claims rather than granting them, and an
 * administrator fixes it by saving the fence again.
 *
 * Keyed by site id rather than held as an array because a rule has to look one
 * up by the `siteId` a stamp claims, and rules cannot search a list.
 */
async function publishGeofenceProjection(config: GeofenceConfig): Promise<void> {
  const orgKey = getActiveOrgKey();
  if (!orgKey) return;

  const sites: Record<string, {
    lat: number;
    lng: number;
    radiusMetres: number;
    metresPerDegreeLng: number;
  }> = {};
  for (const site of config.sites) {
    sites[site.id] = {
      lat: site.lat,
      lng: site.lng,
      radiusMetres: site.radiusMetres,
      metresPerDegreeLng: site.metresPerDegreeLng,
    };
  }

  try {
    await setDoc(
      doc(db, 'attendance_geofences', orgKey),
      { orgId: orgKey, mode: config.mode, maxAccuracyMetres: config.maxAccuracyMetres, sites },
      { merge: false },
    );
  } catch (err) {
    // Non-fatal, and visibly so: the settings copy has already saved, so the
    // app behaves as configured while the server goes on refusing `inside`
    // claims until this lands. Settings surfaces that state rather than
    // leaving an administrator to wonder why nobody can check in.
    console.warn('[attendance-geofence] could not publish the rules projection:', err);
  }
}

/**
 * Save the whole configuration.
 *
 * Writes both copies: the org-settings one the app reads, and the structured
 * projection the rules read. Resolves once the organisation's settings copy
 * has caught up.
 */
export async function saveGeofenceConfig(config: GeofenceConfig): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const normalized = normalizeGeofenceConfig(config);
  window.localStorage.setItem(orgScopedKey(STORAGE_KEY), JSON.stringify(normalized));
  notifyChanged();
  const [published] = await Promise.all([
    publishOrgSetting(ORG_SETTINGS.attendanceGeofence, normalized),
    publishGeofenceProjection(normalized),
  ]);
  return published;
}

/** Add or replace one site, keeping the rest of the configuration as it stands. */
export function upsertGeofenceSite(site: GeofenceSite): Promise<boolean> {
  const current = getGeofenceConfig();
  const sites = current.sites.some((item) => item.id === site.id)
    ? current.sites.map((item) => (item.id === site.id ? site : item))
    : [...current.sites, site];
  return saveGeofenceConfig({ ...current, sites });
}

/**
 * Withdraw a site.
 *
 * Stamps that referenced it keep their `siteId` and their recorded distance:
 * a stamp is what was true on the day, and rewriting history because an office
 * closed would erase the evidence the feature exists to hold.
 */
export function removeGeofenceSite(siteId: string): Promise<boolean> {
  const current = getGeofenceConfig();
  return saveGeofenceConfig({ ...current, sites: current.sites.filter((s) => s.id !== siteId) });
}

/** Switch what the organisation does with a stamp that fails the fence. */
export function setGeofenceMode(mode: GeofenceConfig['mode']): Promise<boolean> {
  return saveGeofenceConfig({ ...getGeofenceConfig(), mode });
}

/** Exempt an employee, with the reason that will be shown beside their name. */
export function exemptEmployeeFromGeofence(employeeId: string, reason: string): Promise<boolean> {
  if (typeof window === 'undefined' || !employeeId) return Promise.resolve(false);
  const next: GeofenceExemptions = {
    ...getGeofenceExemptions(),
    [employeeId]: { reason: reason.trim().slice(0, 200) },
  };
  window.localStorage.setItem(orgScopedKey(EXEMPTIONS_STORAGE_KEY), JSON.stringify(next));
  notifyChanged();
  return publishOrgSetting(ORG_SETTINGS.geofenceExemptions, next);
}

/** Put an employee back under the fence. */
export function removeGeofenceExemption(employeeId: string): Promise<boolean> {
  if (typeof window === 'undefined' || !employeeId) return Promise.resolve(false);
  const next = { ...getGeofenceExemptions() };
  delete next[employeeId];
  window.localStorage.setItem(orgScopedKey(EXEMPTIONS_STORAGE_KEY), JSON.stringify(next));
  notifyChanged();
  return publishOrgSetting(ORG_SETTINGS.geofenceExemptions, next);
}

/** A stable id for a newly drawn site. */
export function newSiteId(): string {
  return `site-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (
      event.key === orgScopedKey(STORAGE_KEY) ||
      event.key === orgScopedKey(EXEMPTIONS_STORAGE_KEY)
    ) {
      notifyChanged();
    }
  });
}
