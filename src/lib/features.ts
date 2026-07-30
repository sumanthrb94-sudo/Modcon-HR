/**
 * Per-organisation feature flags.
 *
 * ## Why this exists
 *
 * There is one Firebase project, one Firestore ruleset, one hosting site and
 * one bundle deployed from `main`. A code change therefore reaches every tenant
 * at once, and no amount of care in the deploy pipeline changes that — there is
 * no per-tenant deploy target and no canary. So "roll this out to one
 * organisation first" cannot be expressed in the deployment; it has to be
 * expressed in **data**. That is what this is: the code ships to everyone, and
 * a flag on the organisation record decides who runs it.
 *
 * See §4.1 of docs/tenant-isolation-spec.md, which states the limit this works
 * around.
 *
 * ## What a flag may and may not gate
 *
 * Flags gate **behaviour** — a new screen, a changed calculation, an alternate
 * workflow. They must never gate **authorization**. Two reasons, and the second
 * is the one that bites:
 *
 *   1. `firestore.rules` is a single global ruleset. A per-tenant rule would
 *      mean tenants running different authorization, which is a security model
 *      nobody can hold in their head or test.
 *   2. The flag lives on a document. Reading it in a rule costs a `get()` per
 *      evaluation, and — worse — makes the answer to "may I read this?" depend
 *      on data an administrator can edit.
 *
 * So the values here are read on the client, for the client's own decisions.
 * Whatever the flag turns on must be safe for every tenant to have reached,
 * because the rules will not stop them.
 *
 * ## Who sets them
 *
 * Super admins, from Organizations. `organizations/{orgId}` is written by super
 * admins only (`firestore.rules`), which is right for a staged rollout: it is a
 * platform decision about who gets a change, not a preference the organisation
 * configures for itself. An org's own configuration is `org_settings` — see
 * src/lib/orgSettings.ts, which is a different thing with different rules.
 */
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getActiveOrgKey, orgScopedKey, resolveOrgKeyForProfile } from '@/lib/orgScope';

export interface FeatureFlag {
  /** Stored key on `organizations/{orgId}.features`. */
  readonly key: string;
  /** What turning it on does — shown to the super admin in Organizations. */
  readonly description: string;
  /** Value for an organisation that has not been given an opinion. */
  readonly defaultValue: boolean;
}

/**
 * Every flag the app knows about.
 *
 * Declared rather than free-form so Organizations can list them with their
 * meaning, and so a flag removed from the code stops being offered. An unknown
 * key stored on an organisation is ignored, which is what makes deleting a
 * finished rollout safe: remove the entry here and the stale document field
 * simply stops being read.
 *
 * Empty is the correct state between rollouts. The mechanism exists so the next
 * change that should not reach every tenant at once has somewhere to go.
 */
export const FEATURE_FLAGS: Record<string, FeatureFlag> = {};

export type FeatureName = string;

const FEATURES_CHANGED_EVENT = 'modcon-hr-org-features-changed';
const FEATURES_CACHE_KEY = 'modcon.hr.orgFeatures';

/**
 * Last known flags for the active org.
 *
 * Cached in localStorage as well as memory so a reload renders the same thing
 * immediately rather than flashing the default and correcting itself once the
 * subscription resolves. The cache is a convenience, never an authority — see
 * the header on what these may gate.
 */
function readCache(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(orgScopedKey(FEATURES_CACHE_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

let current: Record<string, boolean> = readCache();

function setCurrent(next: Record<string, boolean>) {
  current = next;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(orgScopedKey(FEATURES_CACHE_KEY), JSON.stringify(next));
  } catch {
    // Quota or private mode: the in-memory value still stands for this session.
  }
  window.dispatchEvent(new Event(FEATURES_CHANGED_EVENT));
}

/** Coerce the stored map, dropping anything that is not a declared boolean. */
function normalize(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/**
 * Is this flag on for the active organisation?
 *
 * Non-reactive; for components use `useFeature`. Falls back to the declared
 * default, and to `false` for a name that is not declared — an undeclared flag
 * being off means a typo disables a feature rather than silently enabling it.
 */
export function isFeatureEnabled(name: FeatureName): boolean {
  if (name in current) return current[name];
  return FEATURE_FLAGS[name]?.defaultValue ?? false;
}

/** The resolved flags for the active org, declared defaults included. */
export function getOrgFeatures(): Record<string, boolean> {
  const resolved: Record<string, boolean> = {};
  for (const flag of Object.values(FEATURE_FLAGS)) {
    resolved[flag.key] = flag.defaultValue;
  }
  return { ...resolved, ...current };
}

/** Reactive `isFeatureEnabled`. */
export function useFeature(name: FeatureName): boolean {
  const [enabled, setEnabled] = useState(() => isFeatureEnabled(name));
  useEffect(() => {
    const update = () => setEnabled(isFeatureEnabled(name));
    update();
    window.addEventListener(FEATURES_CHANGED_EVENT, update);
    return () => window.removeEventListener(FEATURES_CHANGED_EVENT, update);
  }, [name]);
  return enabled;
}

/**
 * Subscribe the active organisation's flags. Returns an unsubscribe.
 *
 * Called once auth resolves, beside `startOrgSettingsSync`. A missing
 * organisation document is not an error and must not clear the flags to
 * nothing: the legacy 'default' organisation predates the `organizations`
 * collection and has no record at all, so every flag simply sits at its
 * declared default.
 */
export function startOrgFeatureSync(
  profile: { uid?: string; orgId?: string; superAdmin?: boolean } | null | undefined,
): () => void {
  if (typeof window === 'undefined' || !profile) return () => {};
  const orgKey = resolveOrgKeyForProfile(profile);

  return onSnapshot(
    doc(db, 'organizations', orgKey),
    (snap) => {
      setCurrent(snap.exists() ? normalize(snap.data().features) : {});
    },
    (err) => {
      console.warn('[features] could not subscribe to organisation flags:', err);
    },
  );
}

/** The org whose flags are currently cached — for the Organizations UI. */
export function activeFeatureOrgKey(): string {
  return getActiveOrgKey();
}
