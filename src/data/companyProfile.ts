import { orgScopedKey } from '@/lib/orgScope';
import { isMockDataCleared } from '@/lib/mockDataFlag';

/**
 * Company-level settings the organisation owns.
 *
 * Every field here used to be a literal in the Settings page's `useState`
 * initialiser — "ModCon Technologies Pvt Ltd", a Bengaluru address, a GSTIN —
 * rendered for whichever company happened to be signed in, and thrown away on
 * reload because Save only flashed a confirmation. A second organisation on the
 * same deployment saw ModCon's registration numbers as its own.
 *
 * So the shape is defined here and the values are not: a company that has not
 * filled its profile in has empty fields, which is the truthful state.
 */
export interface CompanyProfile {
  name: string;
  legalName: string;
  industry: string;
  founded: string;
  hq: string;
  website: string;
  gstin: string;
  cin: string;
  supportEmail: string;
  phone: string;
  /**
   * Which department carries the HR function. Read rather than assumed because
   * departments are renameable org data (see data/departments.ts) — "Human
   * Resources" is what the demo org happens to call it, not a fixed name. Used
   * by lib/dataScope.ts to work out whose records an HR Manager oversees.
   */
  hrDepartment: string;
}

const COMPANY_PROFILE_STORAGE_KEY = 'modcon.hr.companyProfile';
export const COMPANY_PROFILE_CHANGED_EVENT = 'modcon-hr-company-profile-changed';

const emptyCompanyProfile: CompanyProfile = {
  name: '',
  legalName: '',
  industry: '',
  founded: '',
  hq: '',
  website: '',
  gstin: '',
  cin: '',
  supportEmail: '',
  phone: '',
  hrDepartment: '',
};

/**
 * The demo organisation's own details. These belong to ModCon Builders and are
 * seeded only for the default org, alongside the rest of the demo dataset — a
 * newly created organisation starts from `emptyCompanyProfile` instead of
 * inheriting somebody else's registration numbers.
 */
const demoCompanyProfile: CompanyProfile = {
  name: 'ModCon Technologies Pvt Ltd',
  legalName: 'ModCon Technologies Private Limited',
  industry: 'SaaS / HR Tech',
  founded: '2019',
  hq: 'Bengaluru, Karnataka',
  website: 'https://modcon.io',
  gstin: '29AACCM1234F1Z5',
  cin: 'U72900KA2019PTC12345',
  supportEmail: 'hr@modcon.io',
  phone: '+91 80 4567 8900',
  hrDepartment: 'Human Resources',
};

function notifyCompanyProfileChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(COMPANY_PROFILE_CHANGED_EVENT));
}

function defaultCompanyProfile(): CompanyProfile {
  return isMockDataCleared() ? { ...emptyCompanyProfile } : { ...demoCompanyProfile };
}

export function getCompanyProfile(): CompanyProfile {
  if (typeof window === 'undefined') return defaultCompanyProfile();
  try {
    const raw = window.localStorage.getItem(orgScopedKey(COMPANY_PROFILE_STORAGE_KEY));
    if (!raw) return defaultCompanyProfile();
    const parsed = JSON.parse(raw) as Partial<CompanyProfile>;
    if (!parsed || typeof parsed !== 'object') return defaultCompanyProfile();
    // Merged over the empty shape, not the demo one: a company that cleared a
    // field meant to clear it, and must not have ModCon's value restored.
    return { ...emptyCompanyProfile, ...parsed };
  } catch {
    return defaultCompanyProfile();
  }
}

export function saveCompanyProfile(profile: CompanyProfile) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(COMPANY_PROFILE_STORAGE_KEY), JSON.stringify(profile));
  notifyCompanyProfileChanged();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === orgScopedKey(COMPANY_PROFILE_STORAGE_KEY)) {
      notifyCompanyProfileChanged();
    }
  });
}
