import { DEFAULT_ORG_KEY, getActiveOrgKey, orgScopedKey } from './orgScope';

const MOCK_DATA_CLEARED_BASE_KEY = 'modcon.hr.mockDataCleared';

/**
 * When set, the built-in seed roster (src/data/employees.ts and every other
 * gated data module) is excluded — only locally-added records remain.
 * Checked once at module-load time by each data module's getter, so toggling
 * it only takes effect after a page reload.
 *
 * The default is org-aware: the default/legacy org (no explicit choice made
 * yet) keeps showing its seed data exactly as before this feature existed.
 * Any other organization — freshly created by a super admin — defaults to
 * cleared/empty until its own admin explicitly seeds it, since it has no
 * relationship to ModCon Builders' demo dataset.
 */
export function isMockDataCleared(): boolean {
  if (typeof window === 'undefined') return getActiveOrgKey() !== DEFAULT_ORG_KEY;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(MOCK_DATA_CLEARED_BASE_KEY));
    if (raw === '1') return true;
    if (raw === '0') return false;
    return getActiveOrgKey() !== DEFAULT_ORG_KEY;
  } catch {
    return getActiveOrgKey() !== DEFAULT_ORG_KEY;
  }
}

export function setMockDataCleared(cleared: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(MOCK_DATA_CLEARED_BASE_KEY), cleared ? '1' : '0');
}
