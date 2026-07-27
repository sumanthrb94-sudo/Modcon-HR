import { orgScopedKey } from '@/lib/orgScope';

export interface IntegrationPreference {
  id: string;
  connected: boolean;
  badge?: string;
}

const INTEGRATIONS_STORAGE_KEY = 'modcon.hr.integrations';
export const INTEGRATIONS_CHANGED_EVENT = 'modcon-hr-integrations-changed';

const defaultIntegrations: IntegrationPreference[] = [
  { id: 'slack', connected: true, badge: 'Connected' },
  { id: 'google', connected: true, badge: 'Connected' },
  { id: 'razorpay', connected: false },
  { id: 'zoho', connected: false },
  { id: 'bamboo', connected: false },
  { id: 'github', connected: true, badge: 'Connected' },
];

function notifyIntegrationsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(INTEGRATIONS_CHANGED_EVENT));
}

function readStoredIntegrations(): IntegrationPreference[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(INTEGRATIONS_STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IntegrationPreference[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getIntegrationPreferences(): IntegrationPreference[] {
  const stored = readStoredIntegrations();
  return stored ? stored : defaultIntegrations;
}

export function saveIntegrationPreferences(integrations: IntegrationPreference[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(INTEGRATIONS_STORAGE_KEY), JSON.stringify(integrations));
  notifyIntegrationsChanged();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === orgScopedKey(INTEGRATIONS_STORAGE_KEY)) {
      notifyIntegrationsChanged();
    }
  });
}
