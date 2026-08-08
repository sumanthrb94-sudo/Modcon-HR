/**
 * What an organisation pays to use ModCon HR.
 *
 * One price, one organisation: **₹5,000 per month, flat**, however many
 * employees are on the roster. That is a deliberate departure from the seat
 * model in data/billing.ts, which priced a Pro/Enterprise tier per seat — a
 * tenant's bill should not change because they hired someone, and a flat price
 * is the one a customer can predict.
 *
 * ## Where the record lives, and why it is not org_settings
 *
 * Everything else an organisation configures lives in `org_settings`, which its
 * own administrators write. A subscription is the opposite: it is a statement
 * about whether that organisation has paid, and an organisation that could
 * write its own would simply write `active`. So it lives in its own collection,
 * readable by the organisation and writable only by a super admin or the
 * payment webhook running with admin credentials — see `firestore.rules`
 * `/subscriptions/{orgId}` and docs/billing-razorpay.md.
 *
 * localStorage is a read-through cache so the sidebar and the billing page can
 * render synchronously at module-load time, exactly as the org settings cache
 * does. It is never the authority: a cached `active` that Firestore disagrees
 * with is replaced on the next snapshot.
 *
 * ## Amounts are in paise
 *
 * Razorpay takes amounts as integer paise, and rupee floats do not survive
 * arithmetic — ₹5,000 + 18% is 5900 exactly in paise and 5899.999999999999 in
 * rupees if you are unlucky. Everything here is `…Paise`; format at the edge.
 */
import type { UserProfile } from '@/lib/auth';
import { orgScopedKey } from '@/lib/orgScope';
import { todayIso } from '@/lib/today';

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/** ₹5,000 per organisation per month, before tax. */
export const PLAN_PRICE_PAISE = 500_000;

/** GST on SaaS in India. The company's own GSTIN is on the company profile. */
export const GST_RATE = 0.18;

export const PLAN = {
  id: 'modcon-hr-standard-monthly',
  name: 'ModCon HR — Standard',
  /** What the customer is told, in words, so one string does not drift from another. */
  description: '₹5,000 per month per organisation. Unlimited employees.',
  pricePaise: PLAN_PRICE_PAISE,
  interval: 'monthly' as const,
  currency: 'INR' as const,
} as const;

export interface PriceBreakdown {
  basePaise: number;
  gstPaise: number;
  totalPaise: number;
}

/** The bill for one billing period. Rounded to the paise, half up. */
export function priceFor(periods = 1): PriceBreakdown {
  const basePaise = PLAN_PRICE_PAISE * Math.max(1, Math.floor(periods));
  const gstPaise = Math.round(basePaise * GST_RATE);
  return { basePaise, gstPaise, totalPaise: basePaise + gstPaise };
}

/** Paise to a displayable `₹5,000.00`. */
export function formatPaise(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(paise / 100);
}

// ---------------------------------------------------------------------------
// The subscription record
// ---------------------------------------------------------------------------

/**
 * `trialing` and `active` are the two states that grant access.
 *
 * `past_due` deliberately does not lock the organisation out on its own — see
 * `accessState` below for what happens and when.
 */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'none';

export interface Subscription {
  orgId: string;
  status: SubscriptionStatus;
  /** ISO date the current paid (or trial) period began. */
  currentPeriodStart: string;
  /** ISO date it ends. Access is evaluated against this, not against a flag. */
  currentPeriodEnd: string;
  pricePaise: number;
  /** Razorpay's ids, when the subscription was created through it. */
  razorpaySubscriptionId?: string;
  razorpayCustomerId?: string;
  /** The most recent successful payment, for the receipt. */
  lastPaymentId?: string;
  lastPaymentAt?: string;
  /** Set by the webhook when a charge fails, so the UI can say what happened. */
  lastFailureReason?: string;
  updatedAt?: string;
}

const SUBSCRIPTION_CACHE_KEY = 'modcon.hr.subscription';

/** Days after `currentPeriodEnd` before a lapsed subscription blocks access. */
export const GRACE_PERIOD_DAYS = 7;

export function trialSubscription(orgId: string, startedOn = todayIso()): Subscription {
  return {
    orgId,
    status: 'trialing',
    currentPeriodStart: startedOn,
    currentPeriodEnd: addDays(startedOn, 14),
    pricePaise: PLAN_PRICE_PAISE,
  };
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export type AccessState =
  /** Paid, or in trial. Nothing to say. */
  | { kind: 'ok'; subscription: Subscription }
  /** Still usable, but the customer needs to act. */
  | { kind: 'warn'; subscription: Subscription; message: string; daysLeft: number }
  /** Past the grace period. */
  | { kind: 'blocked'; subscription: Subscription | null; message: string };

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
}

/**
 * What to tell this organisation about its subscription today.
 *
 * Evaluated from the period end rather than from `status` alone, because a
 * status is only as fresh as the last webhook that wrote it: an organisation
 * whose card failed silently would read `active` for ever if nothing compared
 * it to a date.
 *
 * Nothing here *enforces* anything. Access control that matters is in
 * firestore.rules, and a client-side check is a courtesy to a paying customer,
 * not a lock — see docs/billing-razorpay.md on why billing state is not a rules
 * predicate.
 */
export function accessState(
  subscription: Subscription | null,
  asOf: string = todayIso(),
): AccessState {
  if (!subscription || subscription.status === 'none') {
    return { kind: 'blocked', subscription, message: 'This organisation has no active subscription.' };
  }

  const daysLeft = daysBetween(asOf, subscription.currentPeriodEnd);

  if (subscription.status === 'cancelled') {
    return daysLeft >= 0
      ? {
          kind: 'warn',
          subscription,
          daysLeft,
          message: `Your subscription is cancelled and access ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
        }
      : { kind: 'blocked', subscription, message: 'Your subscription has ended.' };
  }

  if (daysLeft < -GRACE_PERIOD_DAYS) {
    return {
      kind: 'blocked',
      subscription,
      message: `Payment is ${Math.abs(daysLeft)} days overdue. Renew to restore access.`,
    };
  }

  if (daysLeft < 0) {
    return {
      kind: 'warn',
      subscription,
      daysLeft,
      message:
        `Payment is overdue. Access continues for ${GRACE_PERIOD_DAYS + daysLeft} more day` +
        `${GRACE_PERIOD_DAYS + daysLeft === 1 ? '' : 's'}.`,
    };
  }

  if (subscription.status === 'past_due') {
    return { kind: 'warn', subscription, daysLeft, message: 'The last payment did not go through.' };
  }

  if (subscription.status === 'trialing') {
    return {
      kind: 'warn',
      subscription,
      daysLeft,
      message: `Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
    };
  }

  if (daysLeft <= 3) {
    return {
      kind: 'warn',
      subscription,
      daysLeft,
      message: `Your subscription renews in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
    };
  }

  return { kind: 'ok', subscription };
}

// ---------------------------------------------------------------------------
// The local cache
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_CHANGED_EVENT = 'modcon-hr-subscription-changed';

export function readCachedSubscription(): Subscription | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(SUBSCRIPTION_CACHE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Subscription;
    return parsed && typeof parsed === 'object' && typeof parsed.status === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Replace the cache from a Firestore snapshot.
 *
 * Only ever called with what the server said. There is no `saveSubscription`
 * that a page could reach: the client cannot make itself paid, and offering a
 * writer here would be the first step towards it.
 */
export function cacheSubscription(subscription: Subscription | null) {
  if (typeof window === 'undefined') return;
  try {
    if (subscription) {
      window.localStorage.setItem(orgScopedKey(SUBSCRIPTION_CACHE_KEY), JSON.stringify(subscription));
    } else {
      window.localStorage.removeItem(orgScopedKey(SUBSCRIPTION_CACHE_KEY));
    }
  } catch {
    // Private mode. The in-memory value the caller holds still stands.
  }
  window.dispatchEvent(new Event(SUBSCRIPTION_CHANGED_EVENT));
}

/** The organisation whose subscription this viewer's session is about. */
export function billableOrgId(profile: UserProfile | null | undefined): string | null {
  return profile?.orgId ?? null;
}
