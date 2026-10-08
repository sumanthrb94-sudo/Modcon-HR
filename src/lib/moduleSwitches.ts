/**
 * Which optional modules an organisation uses.
 *
 * ModCon HR is for teams of ten to a hundred, and most of them need five
 * things: their people, attendance, leave, payroll and payslips, and a
 * noticeboard. Recruitment pipelines, appraisal cycles, asset registers and a
 * ticket desk are real needs for some of them and clutter for the rest — a
 * sidebar of eighteen entries is the first thing that makes a small company's
 * HR person feel they bought software for somebody bigger.
 *
 * So the core is always on and everything else is a switch, off for a new
 * organisation and turned on in Settings → Modules (or by the industry chosen
 * in the guided setup). The demo organisation keeps everything on, gated by
 * `isMockDataCleared()` exactly like its seed data, so the demo still shows
 * the whole product.
 *
 * A switch is not a permission. The permission matrix says *who* may open a
 * module; this says whether the organisation has the module at all, and
 * `canAccessModule` asks both — so the nav, the route guards and anything else
 * that asks cannot disagree.
 */
import type { AppModule } from '@/lib/accessControl';
import { ORG_SETTINGS, publishOrgSetting } from '@/lib/orgSettings';
import { orgScopedKey } from '@/lib/orgScope';
import { isMockDataCleared } from '@/lib/mockDataFlag';

export const OPTIONAL_MODULES = [
  'Recruitment',
  'Onboarding',
  'Performance',
  'Expenses',
  'Assets',
  'Helpdesk',
  'Reports & Analytics',
  'Documents',
] as const satisfies readonly AppModule[];
export type OptionalModule = typeof OPTIONAL_MODULES[number];

/** What each switch adds, in the words Settings and the setup use. */
export const MODULE_DESCRIPTIONS: Record<OptionalModule, { label: string; detail: string }> = {
  Recruitment: { label: 'Hiring', detail: 'Post openings, a public careers page, and a candidate pipeline.' },
  Onboarding: { label: 'Onboarding checklists', detail: 'A task list for each new joiner.' },
  Performance: { label: 'Goals and reviews', detail: 'Goals and review ratings for each person.' },
  Expenses: { label: 'Expense claims', detail: 'Employees claim expenses with a receipt; managers approve.' },
  Assets: { label: 'Company assets', detail: 'Laptops, phones and other equipment, and who has them.' },
  Helpdesk: { label: 'HR helpdesk', detail: 'Employees raise a ticket with HR.' },
  'Reports & Analytics': { label: 'Reports', detail: 'Headcount, tenure and attendance charts.' },
  Documents: { label: 'Handbook', detail: 'Publish the employee handbook for everyone to read.' },
};

const STORAGE_KEY = ORG_SETTINGS.enabledModules.storageKey;
const CHANGED_EVENT = ORG_SETTINGS.enabledModules.changedEvent;

export function isOptionalModule(module: AppModule): module is OptionalModule {
  return (OPTIONAL_MODULES as readonly string[]).includes(module);
}

/** The organisation's switched-on modules; `null` when it has never chosen. */
function storedEnabledModules(): OptionalModule[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((m): m is OptionalModule => typeof m === 'string' && isOptionalModule(m as AppModule));
  } catch {
    return null;
  }
}

/**
 * Switched on for this organisation. An organisation that has never chosen
 * gets the core alone — except the demo one, which shows everything.
 */
export function getEnabledModules(): OptionalModule[] {
  const stored = storedEnabledModules();
  if (stored) return stored;
  return isMockDataCleared() ? [] : [...OPTIONAL_MODULES];
}

export function isModuleEnabled(module: AppModule): boolean {
  if (!isOptionalModule(module)) return true;
  return getEnabledModules().includes(module);
}

/** Resolves once the organisation's copy has caught up — see publishOrgSetting. */
export function saveEnabledModules(modules: readonly OptionalModule[]): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const clean = OPTIONAL_MODULES.filter((m) => modules.includes(m));
  window.localStorage.setItem(orgScopedKey(STORAGE_KEY), JSON.stringify(clean));
  window.dispatchEvent(new Event(CHANGED_EVENT));
  return publishOrgSetting(ORG_SETTINGS.enabledModules, clean);
}
