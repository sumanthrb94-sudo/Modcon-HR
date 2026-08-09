# Billing — ₹5,000 per organisation per month, via Razorpay

One price for one organisation: **₹5,000 per month**, plus 18% GST, whatever the
headcount. Not per seat — a customer's bill should not change because they hired
somebody, and a flat price is the one they can predict.

| | |
|---|---|
| Plan id | `modcon-hr-standard-monthly` |
| Price | ₹5,000/month (`PLAN_PRICE_PAISE = 500_000`) |
| Tax | 18% GST → ₹5,900 total |
| Billed to | the organisation, keyed by `orgId` |
| Trial | 14 days |
| Promotional | any organisation, set by a super admin — free, no expiry |
| Grace period | 7 days past `currentPeriodEnd` before access is withheld |

Everything above lives in one place: [`src/data/subscription.ts`](../src/data/subscription.ts).
Change the price there and the sidebar, the billing panel and the invoice all
follow.

**Amounts are integer paise everywhere.** Razorpay takes paise, and rupee floats
do not survive arithmetic — twelve months of ₹5,900 has to come to exactly
₹70,800, and it does in paise.

---

## What is built, and what is not

**Built and tested:**

- the plan, the GST arithmetic, the promotional state and the access states
  (`tests/simulation/subscription.test.mjs`, 27 assertions);
- the `subscriptions/{orgId}` collection and its rules, with **33 assertions**
  in `tests/rules/subscription.rules.test.mjs` that no role in the product —
  employee, manager, HR, or platform admin — can create, extend, activate,
  delete or grant a promotion on its own subscription;
- the Firestore→localStorage sync, the `useSubscription` hook, the billing
  panel, and the sidebar state.

**Not built: the server.** Razorpay's client half cannot complete a payment on
its own, and this repository is a static SPA on Firebase Hosting with no
backend. Until the two endpoints and the webhook below exist,
`billingConfigured()` returns false and the billing panel says plainly that
payments are not connected rather than showing a Pay button that fails at the
last step.

---

## Promotional organisations — the ones we do not charge

A super admin can put any organisation on a **promotion**: it keeps every
feature and is never billed. Use it for a pilot, a partner, or an organisation
of our own.

Organizations → **Billing** on the row. Granting one asks for a reason, which is
kept on the record (`promotionNote`) so a year later somebody can tell a pilot
from a favour.

It is a **subscription status**, not a flag somewhere else, and that is
deliberate: "does this organisation owe us anything" is one question, and
answering it in two places is how a promotional tenant ends up being chased for
payment by whichever surface did not get the memo. Being one status means the
billing panel, the sidebar, the Organizations column and `accessState` all agree
without any of them knowing about promotions specifically.

Two properties worth keeping:

- **A promotion does not expire.** `accessState` short-circuits on the status
  *before* it compares anything to a date. A promotional record carries no real
  period, so without that short-circuit a free tenant would be locked out by
  arithmetic about a date it never had. There is a test pinning exactly this.
- **`priceForSubscription` returns zero, GST included** — no supply, no tax. Any
  surface quoting a price should use it rather than `priceFor`, or a
  complimentary tenant is shown a bill it will never receive.

**Ending a promotion leaves the organisation `none`, not `active`.** Ending it
collects no money, so claiming they are paid up would be a bill nobody sent.

Granting one is the only subscription write a human makes; everything else on
that record comes from the webhook. It is super-admin only, enforced by the same
rule that stops an organisation marking itself paid — they are the same write.
Seven rules assertions cover it, including that an HR admin, a manager, an
employee and a platform admin all fail to hand themselves a free plan.

**The webhook must not overwrite a promotion.** A promotional organisation has
no Razorpay subscription so no event should arrive for it, but the handler
should skip any record already in this state rather than "correcting" it on the
first stray event.

---

## ModCon's own organisation

It is created **exactly like any other**: Organizations → Create Organization,
name it, give it an administrator email. It gets its own `orgId`, its own HR
administrator, its own employees, its own isolated data — nothing about it is
special-cased in code, and it is billed by the same machinery as a customer.

Then set it **Promotional**, with a note saying so. That is the whole of it.

Two things follow from there being no special case:

- The super admin account is still not a member of it. Being the platform
  administrator and being an employee of an organisation are different things;
  to work inside ModCon's own organisation, switch into it from the top-bar
  picker like any other.
- The legacy `default` organisation is **not** ModCon's organisation. It is
  where data written before multi-tenancy lives (see
  [tenant-isolation-spec.md](tenant-isolation-spec.md)). Creating a real ModCon
  organisation does not migrate it, and it should not be confused for one.

---

## Who pays, and who does not

**Every sub-organisation pays for itself. The super admin pays nothing.**

A super admin is the platform operator: they administer every organisation and
belong to none, so they have no organisation of their own, no employee record,
and no subscription. `isBillableAccount(profile)` is false for them — and false
for any account not attached to an organisation, which is not a customer either.

What that means in the product:

| Surface | Super admin sees |
|---|---|
| Settings → Billing | "Platform administrator", plus the read-only status of whichever organisation they have switched into, and a link to Organizations |
| Sidebar billing card | nothing — "Not subscribed" there would be a statement about nobody |
| Organizations | a **Subscription** column: every organisation's status, price and period, which is the platform view of who has paid |

`startSubscriptionSync` keys on the *active* organisation rather than
`profile.orgId`, so a super admin who switches into a tenant sees that tenant's
billing state. It used to bail on an account with no `orgId`, which left
whatever the previous session had cached on screen.

The rules already permit exactly this and nothing more: a super admin may `get`
any subscription and `list` them all; everybody else may `get` only their own
organisation's and `list` none.

---

## Why the client cannot mark an organisation paid

The subscription record is the one thing in this system a tenant must not
control. Every other thing an organisation owns, it edits; this one states
whether it has paid us, and an organisation that could write it would write
`active`.

So `firestore.rules` gives `/subscriptions/{orgId}`:

```
allow get:    isSuperAdmin() || orgId == myOrgKey()
allow list:   isSuperAdmin()
allow create, update, delete: isSuperAdmin()
```

The webhook writes with the **Admin SDK**, which bypasses rules entirely, so
there is nothing to allow for it. `src/data/subscription.ts` deliberately
exports no writer at all — only `cacheSubscription`, which is called from the
Firestore snapshot listener. There is no function a page could reach for.

**Signature verification is the whole security boundary.** It is an HMAC over
the Razorpay key secret; a client that verified it would be checking its own
arithmetic. It must happen on the server, against a secret the browser never
sees.

---

## The server half

Deploy as Firebase Functions (or any trusted server) and set
`VITE_BILLING_API_BASE` to its base URL and `VITE_RAZORPAY_KEY_ID` to the
publishable key id. **The secret is never a `VITE_` variable** — anything with
that prefix is inlined into the bundle.

### `POST /createSubscription`

Authenticated with the caller's Firebase ID token.

1. Verify the token. **Derive `orgId` from the verified `users/{uid}` document,
   never from the request body** — an orgId in a body is a claim, not a fact.
2. Refuse unless that user's role is `hr` or `admin`. An employee should not be
   able to start a charge against their employer.
3. Create (or reuse) a Razorpay customer for the organisation.
4. Create a subscription against the `modcon-hr-standard-monthly` plan.
5. Return `{ subscriptionId }`.

### `POST /verifyPayment`

Takes the Checkout handler payload. Verify
`hmac_sha256(razorpay_payment_id + '|' + razorpay_subscription_id, key_secret)`
equals `razorpay_signature`. This is a fast-path confirmation for the UI —
**it is not what marks the organisation paid.** Return 200/400 and nothing else.

### `POST /razorpayWebhook` — the one that matters

Verify `X-Razorpay-Signature` against the **webhook** secret (a different secret
from the key secret) over the **raw** body. A framework that has already parsed
the JSON has changed the bytes and the HMAC will not match.

Then, with the Admin SDK, write `subscriptions/{orgId}` — `orgId` read from
`notes.orgId`, which `startSubscriptionCheckout` puts on the subscription:

| Event | Write |
|---|---|
| `subscription.activated` | `status: 'active'`, period dates |
| `subscription.charged` | `status: 'active'`, roll the period forward, `lastPaymentId`, `lastPaymentAt` |
| `subscription.pending` / `payment.failed` | `status: 'past_due'`, `lastFailureReason` |
| `subscription.halted` | `status: 'past_due'` |
| `subscription.cancelled` | `status: 'cancelled'` — leave `currentPeriodEnd` alone, so the customer keeps the period they paid for |
| `subscription.completed` | `status: 'cancelled'` |

Make it **idempotent**: Razorpay retries, and a replayed `subscription.charged`
must not roll the period forward twice. Key on the event id.

Reply 200 quickly. A slow handler gets retried, and a retry storm on a billing
endpoint is its own problem.

---

## Why billing is not in `firestore.rules`

No rule anywhere consults a subscription, deliberately.

- **A lapsed payment is a commercial matter, not a security one.** Locking a
  company out of its own employee records over a failed card is not a decision
  this ruleset should be making — and `accessState` gives a 7-day grace period
  precisely so it does not happen on the morning a card expires.
- **It would cost a `get()` on every single evaluation**, on every read of every
  collection.
- It is the same argument as the feature flags in
  [tenant-isolation-spec.md](tenant-isolation-spec.md) §4.1 constraint 2: what a
  flag turns on must be safe for every tenant to have reached, because the rules
  will not stop them.

Enforcement, when it is wanted, belongs in the UI (`accessState` already returns
`blocked` with a reason) or in the server endpoints — not in the data layer.

---

## Going live

1. Create the plan in the Razorpay dashboard at ₹5,000/month and set its id to
   `modcon-hr-standard-monthly`, or change `PLAN.id` to match.
2. Deploy the three endpoints with `RAZORPAY_KEY_SECRET` and
   `RAZORPAY_WEBHOOK_SECRET` in the function config — never in the client build.
3. Register the webhook and subscribe to the events in the table above.
4. Set `VITE_RAZORPAY_KEY_ID` and `VITE_BILLING_API_BASE`, and rebuild.
5. Test in Razorpay test mode end to end, including a **failed** payment and a
   **replayed** webhook.
6. For each existing organisation, seed `subscriptions/{orgId}` as a super
   admin — otherwise every current customer reads as "not subscribed" the
   moment this ships. `trialSubscription(orgId)` is the shape to write.

Step 6 is the one that is easy to forget and visible to every existing customer
at once.
