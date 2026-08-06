import { orgScopedKey } from '@/lib/orgScope';
import { ORG_SETTINGS, publishOrgSetting } from '@/lib/orgSettings';
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
   * Job titles that carry the HR function. Someone appointed to one of these
   * administers this organisation (see data/roleAssignments.ts) and oversees
   * every employee's records (see lib/dataScope.ts).
   *
   * A configured list rather than a pattern match on the title: "HR" as a
   * substring appears in words that have nothing to do with the function —
   * a Threat Analyst would have been handed administrator access. Matching is
   * exact, case- and whitespace-insensitive.
   */
  hrDesignations: string[];
}

const COMPANY_PROFILE_STORAGE_KEY = ORG_SETTINGS.companyProfile.storageKey;
export const COMPANY_PROFILE_CHANGED_EVENT = ORG_SETTINGS.companyProfile.changedEvent;

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
  hrDesignations: [],
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
  hrDesignations: ['Head of People', 'HR Business Partner', 'HR Executive', 'Talent Acquisition Lead'],
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
    return {
      ...emptyCompanyProfile,
      ...parsed,
      // Guards against a record written before this was a list, and against a
      // hand-edited value of the wrong shape — callers iterate it.
      hrDesignations: Array.isArray(parsed.hrDesignations)
        ? parsed.hrDesignations.filter((item): item is string => typeof item === 'string')
        : [],
    };
  } catch {
    return defaultCompanyProfile();
  }
}

/** Resolves once the organisation's copy has caught up — see publishOrgSetting. */
export function saveCompanyProfile(profile: CompanyProfile): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  window.localStorage.setItem(orgScopedKey(COMPANY_PROFILE_STORAGE_KEY), JSON.stringify(profile));
  notifyCompanyProfileChanged();
  // hrDesignations decides who administers this organisation, so this is the
  // last piece of configuration that should have lived in one browser.
  return publishOrgSetting(ORG_SETTINGS.companyProfile, profile);
}

function normalizeName(value: string) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The department whose people may carry the HR function.
 *
 * Nominating a job title is not on its own enough to make somebody an
 * administrator, because a title is not unique to a department: an
 * organisation whose engineering team happens to share a title with its people
 * team would hand that engineer every employee's salary. Both have to agree.
 *
 * Matched exactly against the department's name, so an organisation that
 * renames this department stops granting the role rather than granting it to
 * the wrong people — failing closed is the only safe direction for a control
 * that confers administrator access. Settings → Company Profile says so when
 * the department is not there.
 */
export const HR_DEPARTMENT = 'Human Resources';

/** True when this is the department that carries the HR function. */
export function isHrDepartment(department: string): boolean {
  return normalizeName(department) === normalizeName(HR_DEPARTMENT);
}

/**
 * True when this job title is one the company nominated as carrying the HR
 * function.
 *
 * Compared exactly rather than by substring, and normalised for case and
 * spacing so "hr executive" and "HR  Executive" are the same appointment.
 *
 * The title alone does **not** decide who administers the organisation — see
 * `carriesHrFunction`. This answers the narrower question the Settings
 * checkboxes ask, which is whether a title is on the nominated list.
 */
export function isHrDesignation(designation: string): boolean {
  const target = normalizeName(designation ?? '');
  if (!target) return false;
  return getCompanyProfile().hrDesignations.some((item) => normalizeName(item) === target);
}

/**
 * True when this employee carries the HR function: a nominated title, held in
 * the HR department.
 *
 * The single answer to "is this person HR", used both by the grant
 * (data/roleAssignments.ts) and by what HR can see (lib/dataScope.ts), so
 * access and visibility cannot disagree about who HR is.
 */
export function carriesHrFunction(employee: { designation?: string; department?: string }): boolean {
  return isHrDepartment(employee.department ?? '') && isHrDesignation(employee.designation ?? '');
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === orgScopedKey(COMPANY_PROFILE_STORAGE_KEY)) {
      notifyCompanyProfileChanged();
    }
  });
}
