import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { todayIso } from '@/lib/today';
import { getActiveOrgKey, orgScopedKey } from '@/lib/orgScope';

export type BillingPlanTier = 'Pro' | 'Enterprise';

export type BillingInvoiceStatus = 'Paid' | 'Pending' | 'Draft';

export interface BillingInvoice {
  id: string;
  date: string;
  amount: number;
  status: BillingInvoiceStatus;
  title: string;
  description: string;
  planTier: BillingPlanTier;
  totalSeats: number;
  billingEmail: string;
  autoRenew: boolean;
}

export interface BillingPreferences {
  planTier: BillingPlanTier;
  totalSeats: number;
  billingEmail: string;
  autoRenew: boolean;
}

const BILLING_PREFERENCES_STORAGE_KEY = 'modcon.hr.billingPreferences';
export const BILLING_PREFERENCES_CHANGED_EVENT = 'modcon-hr-billing-preferences-changed';
const BILLING_INVOICES_STORAGE_KEY = 'modcon.hr.billingInvoices';
export const BILLING_INVOICES_CHANGED_EVENT = 'modcon-hr-billing-invoices-changed';
const BILLING_PREFERENCES_COLLECTION = 'billing_preferences';
const BILLING_INVOICES_COLLECTION = 'billing_invoices';
/**
 * One preferences document per organisation.
 *
 * This was the fixed id `'current'`, shared by every tenant — so the collection
 * was not per-tenant addressable at all, and the second organisation to save its
 * billing preferences overwrote the first's. `writingToMyOrg()` denies that now
 * (the document carried no `orgId` either), which turned a data-corruption bug
 * into a silently-swallowed permission error. Keying by org fixes both.
 */
function billingPreferencesDocId(orgKey: string): string {
  return `prefs__${orgKey}`;
}

const defaultBillingPreferences: BillingPreferences = {
  planTier: 'Pro',
  totalSeats: 60,
  billingEmail: 'finance@modcon.io',
  autoRenew: true,
};

const defaultBillingInvoices: BillingInvoice[] = [
  {
    id: 'INV-2026-06',
    date: '2026-06-01',
    amount: 299940,
    status: 'Paid',
    title: 'Pro Plan Renewal',
    description: 'Annual Pro subscription for 60 seats.',
    planTier: 'Pro',
    totalSeats: 60,
    billingEmail: 'finance@modcon.io',
    autoRenew: true,
  },
  {
    id: 'INV-2026-03',
    date: '2026-03-01',
    amount: 299940,
    status: 'Paid',
    title: 'Pro Plan Renewal',
    description: 'Annual Pro subscription for 60 seats.',
    planTier: 'Pro',
    totalSeats: 60,
    billingEmail: 'finance@modcon.io',
    autoRenew: true,
  },
  {
    id: 'INV-2025-12',
    date: '2025-12-01',
    amount: 279960,
    status: 'Paid',
    title: 'Pro Plan Renewal',
    description: 'Annual Pro subscription for 56 seats.',
    planTier: 'Pro',
    totalSeats: 56,
    billingEmail: 'finance@modcon.io',
    autoRenew: true,
  },
];

function notifyBillingPreferencesChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(BILLING_PREFERENCES_CHANGED_EVENT));
}

function notifyBillingInvoicesChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(BILLING_INVOICES_CHANGED_EVENT));
}

// Both mirrors stamp `orgId`. Without it `writingToMyOrg()` reads the document
// as the default organisation, so every other tenant's save was denied — and
// the default tenant's succeeded but produced a document no org-filtered query
// could ever return (the "permitted but invisible" asymmetry in
// docs/tenant-isolation-spec.md §4.2).
//
// The failure is logged rather than swallowed outright. Local storage still
// stands as the fallback, so nothing is lost, but a save that never reached
// Firestore should not look identical to one that did.
async function mirrorBillingPreferencesToFirestore(preferences: BillingPreferences) {
  const orgKey = getActiveOrgKey();
  try {
    await setDoc(doc(collection(db, BILLING_PREFERENCES_COLLECTION), billingPreferencesDocId(orgKey)), {
      ...preferences,
      orgId: orgKey,
    });
  } catch (err) {
    console.error('[billing] preferences did not reach Firestore; local copy stands.', err);
  }
}

async function mirrorBillingInvoiceToFirestore(invoice: BillingInvoice) {
  const orgKey = getActiveOrgKey();
  try {
    await addDoc(collection(db, BILLING_INVOICES_COLLECTION), { ...invoice, orgId: orgKey });
  } catch (err) {
    console.error('[billing] invoice did not reach Firestore; local copy stands.', err);
  }
}

function readStoredBillingPreferences(): BillingPreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(BILLING_PREFERENCES_STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BillingPreferences>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      planTier: parsed.planTier === 'Enterprise' ? 'Enterprise' : 'Pro',
      totalSeats: Number.isFinite(parsed.totalSeats) ? Math.max(0, Number(parsed.totalSeats)) : defaultBillingPreferences.totalSeats,
      billingEmail: typeof parsed.billingEmail === 'string' && parsed.billingEmail.trim() ? parsed.billingEmail : defaultBillingPreferences.billingEmail,
      autoRenew: typeof parsed.autoRenew === 'boolean' ? parsed.autoRenew : defaultBillingPreferences.autoRenew,
    };
  } catch {
    return null;
  }
}

function createInvoiceId() {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-${timestamp}-${randomSuffix}`;
}

function readStoredBillingInvoices(): BillingInvoice[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(BILLING_INVOICES_STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BillingInvoice>[];
    if (!Array.isArray(parsed)) return null;

    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item): BillingInvoice => ({
        id: typeof item.id === 'string' && item.id.trim() ? item.id : createInvoiceId(),
        date: typeof item.date === 'string' && item.date.trim() ? item.date : todayIso(),
        amount: Number.isFinite(item.amount) ? Math.max(0, Number(item.amount)) : 0,
        status: item.status === 'Pending' || item.status === 'Draft' ? item.status : 'Paid',
        title: typeof item.title === 'string' && item.title.trim() ? item.title : 'Billing Invoice',
        description: typeof item.description === 'string' && item.description.trim() ? item.description : 'Billing activity recorded.',
        planTier: item.planTier === 'Enterprise' ? 'Enterprise' : 'Pro',
        totalSeats: Number.isFinite(item.totalSeats) ? Math.max(0, Number(item.totalSeats)) : defaultBillingPreferences.totalSeats,
        billingEmail: typeof item.billingEmail === 'string' && item.billingEmail.trim() ? item.billingEmail : defaultBillingPreferences.billingEmail,
        autoRenew: typeof item.autoRenew === 'boolean' ? item.autoRenew : defaultBillingPreferences.autoRenew,
      }))
      .sort((left, right) => right.date.localeCompare(left.date));
  } catch {
    return null;
  }
}

export function getBillingPreferences(): BillingPreferences {
  return readStoredBillingPreferences() ?? defaultBillingPreferences;
}

export function saveBillingPreferences(preferences: BillingPreferences) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(BILLING_PREFERENCES_STORAGE_KEY), JSON.stringify(preferences));
  notifyBillingPreferencesChanged();
  void mirrorBillingPreferencesToFirestore(preferences);
}

export function getBillingInvoices(): BillingInvoice[] {
  return readStoredBillingInvoices() ?? defaultBillingInvoices;
}

export function saveBillingInvoices(invoices: BillingInvoice[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(BILLING_INVOICES_STORAGE_KEY), JSON.stringify(invoices));
  notifyBillingInvoicesChanged();
}

export function appendBillingInvoice(invoice: Omit<BillingInvoice, 'id'> & { id?: string }) {
  const nextInvoice: BillingInvoice = {
    id: invoice.id ?? createInvoiceId(),
    ...invoice,
  };
  saveBillingInvoices([nextInvoice, ...getBillingInvoices()]);
  void mirrorBillingInvoiceToFirestore(nextInvoice);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === orgScopedKey(BILLING_PREFERENCES_STORAGE_KEY)) {
      notifyBillingPreferencesChanged();
    }
    if (event.key === orgScopedKey(BILLING_INVOICES_STORAGE_KEY)) {
      notifyBillingInvoicesChanged();
    }
  });
}
