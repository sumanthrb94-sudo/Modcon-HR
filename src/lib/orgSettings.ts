/**
 * Organisation configuration, stored server-side.
 *
 * Leave policies, the company profile, the holiday calendar, the department
 * list, the permission matrix and the two preference lists were held **only**
 * in localStorage, namespaced per organisation by `orgScopedKey`. Three things
 * followed from that, and only the first is about isolation:
 *
 *   1. The tenant boundary for configuration was a string the client owns, so
 *      it was same-device hygiene rather than an enforced boundary. Everything
 *      else in the app had moved to `orgId` on a Firestore document checked by
 *      `firestore.rules`; this had not.
 *   2. Two administrators of the *same* organisation did not share it. Each
 *      browser held its own copy, so an accrual policy edited on one machine
 *      was invisible on another — and leave accrual is what payroll deductions
 *      are computed from.
 *   3. Settings → Delete Mock Data swept those keys, and they were the only
 *      copy.
 *
 * See G3 in docs/tenant-isolation-spec.md.
 *
 * ## Shape
 *
 * One document per setting per organisation in `org_settings`, keyed
 * `<orgKey>__<setting>`, carrying `orgId` like every other tenant document. The
 * payload is a JSON **string** rather than a structured map: nothing ever
 * queries inside it, and a string sidesteps Firestore's constraints on nested
 * arrays and undefined fields while keeping the value byte-identical to what
 * the localStorage cache holds.
 *
 * ## localStorage is now a cache, not the store
 *
 * The data modules read their value synchronously at module-load time, before
 * React or auth has resolved, so they cannot await a Firestore read. That
 * contract is kept: they still read localStorage. What changed is who writes
 * it — `startOrgSettingsSync` subscribes once auth resolves and hydrates each
 * key from Firestore, dispatching the module's own change event so mounted
 * components re-render. Saves are optimistic: the local write is synchronous
 * and immediate, and the Firestore write follows.
 */
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getActiveOrgKey, orgScopedKey, resolveOrgKeyForProfile } from '@/lib/orgScope';

export interface OrgSetting {
  /** Stable slug; half of the Firestore document id. */
  readonly key: string;
  /** The `modcon.hr.*` localStorage key this setting caches into. */
  readonly storageKey: string;
  /** Window event the owning data module dispatches on change. */
  readonly changedEvent: string;
}

function setting(key: string, storageKey: string, changedEvent: string): OrgSetting {
  return { key, storageKey, changedEvent };
}

/**
 * Every configuration surface that belongs to the organisation rather than to
 * the browser.
 *
 * The literals live here rather than in each data module so the registry and
 * the modules cannot drift — a sync that hydrated a key nothing reads would
 * fail silently and look like it worked. Records (attendance, payroll runs,
 * expenses…) are deliberately absent: they have their own Firestore
 * collections already.
 */
export const ORG_SETTINGS = {
  leavePolicies: setting('leavePolicies', 'modcon.hr.leavePolicies', 'modcon-hr-leave-policies-changed'),
  companyProfile: setting('companyProfile', 'modcon.hr.companyProfile', 'modcon-hr-company-profile-changed'),
  holidays: setting('holidays', 'modcon.hr.holidays', 'modcon-hr-holidays-changed'),
  customDepartments: setting('customDepartments', 'modcon.hr.customDepartments', 'modcon-hr-department-directory-changed'),
  removedDepartments: setting('removedDepartments', 'modcon.hr.removedDepartments', 'modcon-hr-department-directory-changed'),
  // How a monthly gross is split into Basic, HRA and the flat allowances. A
  // company's own policy, not a platform constant — see data/salaryStructure.ts.
  salaryStructure: setting('salaryStructure', 'modcon.hr.salaryStructure', 'modcon-hr-salary-structure-changed'),
  integrations: setting('integrations', 'modcon.hr.integrations', 'modcon-hr-integrations-changed'),
  notificationPreferences: setting('notificationPreferences', 'modcon.hr.notificationPreferences', 'modcon-hr-notification-preferences-changed'),
  // The matrix behind RequireModuleAccess. Server-side storage does not make it
  // an authorization boundary — the rules still decide, and `resolveAppRole`
  // still reads the server-backed profile role — but it stops one browser's
  // devtools edit from being the whole of it. See G5.
  accessControl: setting('accessControl', 'modcon.hr.accessControl.permissions', 'modcon-hr-access-control-changed'),
} as const;

export const ALL_ORG_SETTINGS: OrgSetting[] = Object.values(ORG_SETTINGS);

/** `<orgKey>__<setting>` — the tenant is in the id as well as the field. */
export function orgSettingDocId(orgKey: string, key: string): string {
  return `${orgKey}__${key}`;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Set by `startOrgSettingsSync` so a save can record who made it. */
let currentAuthorUid: string | null = null;

/**
 * Push a setting to Firestore. Fire-and-forget by design.
 *
 * The caller has already written localStorage synchronously, so the UI is
 * correct either way; this is what makes the value outlive the browser and
 * reach the organisation's other administrators. A failure is logged rather
 * than thrown — the rules refuse a non-administrator, which is them working,
 * and a save that threw would make an offline edit look like a lost one.
 *
 * Resolves `true` once the write lands and `false` if it was refused; it never
 * rejects, so the callers that ignore the return keep behaving exactly as they
 * did. A caller that *does* wait on it can tell an admin whether the change has
 * reached the organisation yet — until it has, a reload re-hydrates from the
 * old document and the change is gone.
 */
export function publishOrgSetting(target: OrgSetting, value: unknown): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const orgKey = getActiveOrgKey();
  return setDoc(
    doc(db, 'org_settings', orgSettingDocId(orgKey, target.key)),
    {
      orgId: orgKey,
      key: target.key,
      valueJson: JSON.stringify(value),
      updatedAt: serverTimestamp(),
      ...(currentAuthorUid ? { updatedByUid: currentAuthorUid } : {}),
    },
    { merge: true },
  ).then(() => true).catch((err) => {
    console.warn(`[org-settings] could not publish "${target.key}":`, err);
    return false;
  });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** The raw cached JSON for a setting, or null. Data modules read their own. */
export function readCachedOrgSetting(target: OrgSetting): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(orgScopedKey(target.storageKey));
  } catch {
    return null;
  }
}

/**
 * Subscribe every setting to Firestore for the signed-in profile's org.
 *
 * Returns an unsubscribe. Call once auth resolves; call the returned function
 * before switching organisations. A document that does not exist yet leaves the
 * local value alone — a fresh organisation, or one whose configuration has not
 * been published yet, must not be blanked by a snapshot that simply has nothing
 * to say. `backfillOrgSettings` is what publishes an existing organisation's
 * local configuration the first time.
 */
export function startOrgSettingsSync(
  profile: { uid?: string; orgId?: string; superAdmin?: boolean } | null | undefined,
): () => void {
  if (typeof window === 'undefined' || !profile) return () => {};
  currentAuthorUid = profile.uid ?? null;
  const orgKey = resolveOrgKeyForProfile(profile);

  const unsubs = ALL_ORG_SETTINGS.map((target) =>
    onSnapshot(
      doc(db, 'org_settings', orgSettingDocId(orgKey, target.key)),
      (snap) => {
        if (!snap.exists()) return;
        const incoming = snap.data().valueJson;
        if (typeof incoming !== 'string') return;
        try {
          if (window.localStorage.getItem(orgScopedKey(target.storageKey)) === incoming) return;
          window.localStorage.setItem(orgScopedKey(target.storageKey), incoming);
        } catch {
          // Quota or private mode: the page keeps whatever it already read.
          return;
        }
        // The owning module's own event, so the existing use*Revision hooks
        // re-render without knowing this layer exists.
        window.dispatchEvent(new Event(target.changedEvent));
      },
      (err) => {
        console.warn(`[org-settings] could not subscribe to "${target.key}":`, err);
      },
    ),
  );

  return () => {
    currentAuthorUid = null;
    unsubs.forEach((unsub) => unsub());
  };
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

export interface OrgSettingsBackfillResult {
  key: string;
  action: 'published' | 'already-remote' | 'nothing-local';
  error?: string;
}

/**
 * Publish configuration that exists locally but not yet in Firestore.
 *
 * An organisation using the app before this layer existed holds its whole
 * configuration in one browser. Without this the first save from any *other*
 * machine would win and silently replace it, so the migration is explicit:
 * whoever holds the good copy runs it once.
 *
 * Never overwrites a document that already exists — the remote value is the
 * shared one, and a second admin running this from a stale browser must not
 * clobber it.
 */
export async function backfillOrgSettings(options: {
  dryRun?: boolean;
  onProgress?: (message: string) => void;
} = {}): Promise<OrgSettingsBackfillResult[]> {
  const dryRun = options.dryRun ?? false;
  const log = (message: string) => {
    console.log(`[org-settings-backfill] ${message}`);
    options.onProgress?.(message);
  };
  const orgKey = getActiveOrgKey();
  const results: OrgSettingsBackfillResult[] = [];

  log(dryRun
    ? `Dry run — publishing this browser's configuration for "${orgKey}".`
    : `Publishing this browser's configuration for "${orgKey}".`);

  for (const target of ALL_ORG_SETTINGS) {
    const local = readCachedOrgSetting(target);
    if (local === null) {
      log(`${target.key}: nothing stored locally — leaving the default in place.`);
      results.push({ key: target.key, action: 'nothing-local' });
      continue;
    }
    try {
      const ref = doc(db, 'org_settings', orgSettingDocId(orgKey, target.key));
      const existing = await getDoc(ref);
      if (existing.exists()) {
        log(`${target.key}: already published — left alone.`);
        results.push({ key: target.key, action: 'already-remote' });
        continue;
      }
      if (!dryRun) {
        await setDoc(ref, {
          orgId: orgKey,
          key: target.key,
          // Already a JSON string in the cache; re-stringifying would double-encode.
          valueJson: local,
          updatedAt: serverTimestamp(),
          ...(currentAuthorUid ? { updatedByUid: currentAuthorUid } : {}),
        });
      }
      log(`${target.key}: ${dryRun ? 'would be' : ''} published.`);
      results.push({ key: target.key, action: 'published' });
    } catch (err) {
      const message = String(err);
      log(`⚠️  ${target.key}: ${message}`);
      results.push({ key: target.key, action: 'nothing-local', error: message });
    }
  }

  const published = results.filter((r) => r.action === 'published').length;
  log(dryRun
    ? `Dry run complete — ${published} setting(s) would be published.`
    : `✅ ${published} setting(s) published.`);

  return results;
}
