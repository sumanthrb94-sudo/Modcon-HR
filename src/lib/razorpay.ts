/**
 * Razorpay Checkout, for the ₹5,000/month per-organisation subscription.
 *
 * ## What this file can and cannot do
 *
 * Checkout is the browser half of a two-halves integration. The other half —
 * creating the subscription, and verifying the webhook signature that actually
 * marks an organisation paid — needs the Razorpay **key secret**, and a secret
 * shipped in a Vite bundle is not a secret. So this file:
 *
 *   - opens Checkout against a `subscription_id` the server created;
 *   - hands the payment result back to the server to verify;
 *   - never writes the subscription record itself.
 *
 * The organisation becomes paid when the `subscription.charged` webhook reaches
 * the server and it writes `subscriptions/{orgId}` with admin credentials. That
 * ordering is the whole security model: a client that could mark itself paid
 * would, and `firestore.rules` refuses the write regardless of what this file
 * does. The endpoints and the webhook handler are specified in
 * docs/billing-razorpay.md.
 *
 * ## Until the server exists
 *
 * `VITE_RAZORPAY_KEY_ID` and `VITE_BILLING_API_BASE` are unset in every build
 * today, and `billingConfigured()` reports false. The billing page uses that to
 * say plainly that payments are not connected yet, rather than presenting a Pay
 * button that fails at the last step.
 */
import { PLAN, priceFor } from '@/data/subscription';

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

/** Publishable key. Safe to ship — the secret is the one that is not. */
const KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined;
/** Base URL of the billing endpoints (Cloud Functions, or any trusted server). */
const API_BASE = import.meta.env.VITE_BILLING_API_BASE as string | undefined;

export function billingConfigured(): boolean {
  return Boolean(KEY_ID && API_BASE);
}

export interface CheckoutContact {
  orgId: string;
  organisationName: string;
  email: string;
  name?: string;
  contact?: string;
}

export class BillingNotConfiguredError extends Error {
  constructor() {
    super('Online payment is not connected for this deployment yet.');
    this.name = 'BillingNotConfiguredError';
  }
}

/** Loads Checkout once, and resolves when `window.Razorpay` is available. */
function loadCheckout(): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('No document.'));
  if ((window as unknown as { Razorpay?: unknown }).Razorpay) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Could not load Razorpay Checkout.')));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout.'));
    document.head.appendChild(script);
  });
}

async function postJson<T>(path: string, body: unknown, idToken: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // The server derives the organisation from the verified token, never
      // from the body — an orgId in a request body is a claim, not a fact.
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Billing request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

interface RazorpayHandlerResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id?: string;
  razorpay_signature: string;
}

/**
 * Start (or renew) this organisation's subscription.
 *
 * Resolves once the payment has been handed to the server for verification.
 * **That is not the same as the organisation being marked paid** — the record
 * is written by the webhook, so the caller should wait for the subscription
 * snapshot to change rather than assume success from this resolving.
 */
export async function startSubscriptionCheckout(
  contact: CheckoutContact,
  idToken: string,
): Promise<{ paymentId: string }> {
  if (!billingConfigured()) throw new BillingNotConfiguredError();

  const { subscriptionId } = await postJson<{ subscriptionId: string }>(
    '/createSubscription',
    { planId: PLAN.id },
    idToken,
  );

  await loadCheckout();
  const price = priceFor(1);

  return new Promise((resolve, reject) => {
    const Razorpay = (window as unknown as { Razorpay: new (options: unknown) => { open(): void; on(event: string, cb: (e: unknown) => void): void } }).Razorpay;

    const checkout = new Razorpay({
      key: KEY_ID,
      subscription_id: subscriptionId,
      name: 'ModCon HR',
      description: PLAN.description,
      // Display only. The amount actually charged is the one on the plan the
      // server created; sending it from here would be a figure the client chose.
      amount: price.totalPaise,
      currency: PLAN.currency,
      prefill: { name: contact.name, email: contact.email, contact: contact.contact },
      notes: { orgId: contact.orgId, organisation: contact.organisationName },
      theme: { color: '#4f46e5' },
      handler: (response: RazorpayHandlerResponse) => {
        // Verification is the server's: the signature is an HMAC over the
        // secret, so a client that checked it would be checking its own
        // arithmetic.
        postJson('/verifyPayment', response, idToken)
          .then(() => resolve({ paymentId: response.razorpay_payment_id }))
          .catch(reject);
      },
      modal: {
        ondismiss: () => reject(new Error('Payment was cancelled.')),
      },
    });

    checkout.on('payment.failed', (event: unknown) => {
      const description = (event as { error?: { description?: string } })?.error?.description;
      reject(new Error(description ?? 'The payment failed.'));
    });

    checkout.open();
  });
}
