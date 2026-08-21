# Pricing and go-to-market — an honest analysis

*Written August 2026. Competitor prices were checked against public pricing
pages and comparison sites at that date; sources are listed at the end. CAC
figures are modelled with stated assumptions, not measured — we have no
customers yet, so anyone quoting a precise CAC for us is guessing.*

---

## The question

> Give the application away at ₹500 per month for any number of employees in any
> number of organisations, for at least a year, to get users fast. We currently
> have a ₹5,000 per month plan.

## The short answer

**The instinct is right; the lever is wrong, and one clause in it is
dangerous.**

Cutting the price is not what stands between us and customers. Three things do,
and none of them is fixed by ₹500:

1. **There is already a free competitor with more product than us.**
2. **We do not yet have the thing Indian SMBs actually buy HR software for.**
3. **At ₹500 a month, a single support call per customer per month costs more
   than the customer pays.**

What I would do instead is at the end. It still uses ₹500 — but as a
time-boxed, prepaid, per-organisation founding offer rather than a list price.

---

## 1. The clause that will hurt: "any number of organisations"

This is the most important sentence in this document.

If one buyer can run **unlimited organisations** for ₹500/month, then a payroll
consultant, a CA firm, or a staffing agency buys **one** subscription and serves
fifty client companies with it. Our revenue per end-company becomes ₹10/month.

That is not a discount. That is handing the product to resellers for free, and
they will be the *first* people to find the offer, because they are the ones
actively looking for HR software all day.

Worse, it is very hard to undo. Those fifty companies are now live on the
platform under someone else's account. Re-pricing them later means telling an
intermediary their cost is going up 50×.

**Whatever we do on price, the unit must stay one organisation.** The product is
already built this way — `subscriptions/{orgId}`, one record per tenant — and we
should not undo that in commercial terms.

If we want the consultant channel (we do — see §6), the right shape is a
**partner rate per organisation**, e.g. ₹300/org/month when they bring ten or
more. They still make money on volume; we still get paid per company served.

---

## 2. "Cheapest" is not an available position — the floor is already zero

| Product | Entry price | What you get |
|---|---|---|
| **Kredily** | **₹0/month, unlimited employees, no expiry** | HR, attendance, leave, payroll **plus PF, ESI, Professional Tax, TDS, Form 16, Form 24Q, PF ECR** |
| **greytHR** | **₹0 up to 25 employees** | Core HR + payroll; Essential ≈ ₹2,495/mo + ₹45/employee above 50 |
| **Zoho People** | ₹48/user/month (annual, 5-user minimum) | HR suite; ≈ ₹960/mo for 20 people |
| **Keka** | ₹6,999/month up to 100 employees (Foundation) | Full HRMS; ₹25k–75k one-time implementation |
| **ModCon HR (list)** | ₹5,000/month, unlimited employees | HR, attendance, leave, demo payroll — **no statutory filing** |

Read the top row again. Kredily is **free, for unlimited employees, forever**,
and it does the statutory compliance we do not. They monetise bank salary
payouts and filing services instead of the software.

So the position "we are the cheap one" is occupied by ₹0. Discounting from
₹5,000 to ₹500 does not take that position; it just moves us from "expensive
versus free" to "less expensive versus free". A buyer comparing us to Kredily is
not weighing ₹500 against ₹0 — they are weighing ₹500-and-fewer-features against
₹0-and-more.

**Price is not our problem. Reason-to-switch is.**

---

## 3. We do not yet sell the thing they are buying

Indian SMBs do not buy HR software to look at headcount charts. They buy it **so
they do not get fined**, and so salary goes out on the 1st without the founder
doing it by hand.

Here is our entire payroll implementation today:

- `src/data/payroll.ts` — **234 lines**
- `computeTax(grossAnnual)` — one simplified slab function
- a `pf` figure on the payslip

There is no ESI, no state-wise Professional Tax, no PF ECR file, no Form 24Q, no
Form 16 generation, no challans, and no bank payout file. `grep` for those terms
across `src/` returns a handful of *labels on a demo payslip*.

That is the moat every incumbent is standing behind, and it is the reason a
20-person company pays anybody anything. Contribution rates and wage ceilings
change; someone has to track them and be accountable when a filing is wrong.

Until that exists, **both** prices are hard to defend — ₹5,000 *and* ₹500 —
because the honest comparison is against free-and-more-complete.

The corollary is the good news: the compliance engine is the single highest-value
thing we could build next, and it is worth more than any pricing change.

---

## 4. The unit economics of ₹500

**Infrastructure is not the constraint.** A 50-person organisation using the app
daily costs us roughly ₹30–150/month in Firestore reads, writes and hosting. At
₹500 that is still a 70–90% gross margin. Fine.

**Human time is the constraint, and it is brutal.**

At ₹500/month, if your own time is worth ₹1,000/hour, then **one 30-minute
support call per customer per month consumes 100% of that customer's revenue.**
Two calls and you are paying for the privilege.

Payroll software generates support calls. Every month. Around the 1st.

Compare:

| | ₹500/mo | ₹5,000/mo |
|---|---|---|
| Annual revenue per org | ₹6,000 | ₹60,000 |
| Orgs needed for ₹1 crore ARR | **1,667** | **167** |
| Support time affordable per org/month (at ₹1,000/hr) | **30 min** | **5 hours** |
| Orgs one person can plausibly support | ~150–250 | ~150–250 |

The last row is the one that matters. **Support capacity does not scale with
price.** At ₹500 we need 1,667 organisations to reach a crore — roughly seven
people doing support. At ₹5,000 we need 167, which one person can carry.

₹500 does not get us to cash faster. It gets us to *an unfundable support
burden* faster.

### CAC and payback

Global benchmarks put SMB SaaS CAC at **$200–$700** (₹17,000–₹60,000) with a
median payback of 8–12 months for SMB. India is cheaper, but not free — and
"HR software" keywords are bid up by Keka, Zoho, Darwinbox and greytHR, all
funded.

Modelled, with assumptions stated:

| Channel | Realistic CAC per org | Payback at ₹500 | Payback at ₹5,000 | Volume ceiling |
|---|---|---|---|---|
| **CA / payroll consultant partnerships** | ₹500–2,000 | 1–4 months | <1 month | High — one firm = 20–100 orgs |
| Founder-led outbound (calls, LinkedIn, local) | ₹2,000–5,000 | 4–10 months | ~1 month | Low — your hours |
| Content / SEO on compliance queries | ₹500–1,500 (compounds; slow) | 1–3 months | <1 month | Medium, 6–12 month lag |
| Referral from existing customers | ₹300–1,000 | <2 months | <1 month | Needs customers first |
| **Paid search / Meta ads** | **₹8,000–20,000** | **16–40 months** | 2–4 months | High but unaffordable at ₹500 |

*Assumptions: CAC includes the sales/marketing time cost at ₹1,000/hour; payback
is gross-margin months, ignoring churn.*

Read the bottom row: **at ₹500 with paid ads, payback is longer than the
customer is likely to stay.** SMB churn at low price points runs 3–5% monthly —
an average life of 20–30 months, so LTV ≈ ₹9,000–15,000. A ₹15,000 CAC is a
losing trade. At ₹5,000/month the same ad spend pays back in a quarter.

**₹500 pricing forces us into exactly the channels that don't scale, and locks
us out of the one that does.**

---

## 5. Why the incumbents can charge what they charge

Not because they are MNCs. Because of four things we could also have:

1. **They carry the liability.** If a TDS deduction or PF filing is wrong, they
   fix it. That is insurance, and it is priced in. It is also why buyers will pay
   ₹7,000/month rather than use free software — the fine is bigger.
2. **Switching is genuinely expensive and time-locked.** Moving payroll
   mid-year breaks Form 16 continuity and year-to-date figures. Implementation
   fees of ₹25,000–75,000 are real work: data migration, policy configuration,
   parallel payroll runs. **This is why April is effectively the only month
   Indian payroll changes hands.**
3. **They pay for acquisition and price accordingly.** CAC rises roughly 10× from
   SMB to enterprise. Their price is downstream of their sales cost, not their
   software cost.
4. **Someone tracks the statutory treadmill.** Rates, ceilings and filing formats
   change. That is a permanent salaried job, not a feature.

Point 2 is the most actionable thing in this document. **Today is August.
The next window when Indian companies actually switch payroll is 1 April 2027.**
That is roughly seven months to build compliance and line up the channel — and
if we spend those seven months discounting instead of building, we arrive at the
one window that matters with the same product and less revenue per customer.

---

## 6. What I would actually do

### Pricing: keep the anchor, time-box the offer, never lose the per-org unit

- **List price stays ₹5,000/organisation/month.** It is the anchor, it is what
  renewals refer back to, and it is defensible *once compliance ships*.
- **"Founding 100": ₹500/organisation/month, billed ₹6,000 annually in
  advance, locked for 12 months.** Capped at 100 organisations, publicly
  counted.
  - Annual prepay is the "cash heavy" answer: 100 × ₹6,000 = **₹6 lakh in the
    door**, not ₹50,000/month dribbling in.
  - The cap and the count create the urgency that a permanent low price
    destroys.
  - **Per organisation**, always. A group with three companies buys three.
- **Publish the renewal price now: ₹2,000/org/month for founding members,
  for life.** A 10× cliff at month 13 guarantees mass churn exactly when we
  need references. Deciding this on day one is much cheaper than negotiating it
  a hundred times in year two.
- **Partner rate: ₹300/org/month at ten or more organisations**, for CAs and
  payroll consultants. This is the honest version of "unlimited organisations" —
  they get volume economics, we still get paid per company.

### Sequence, given the April window

| When | Focus |
|---|---|
| **Aug–Oct 2026** | Build the compliance engine: PF, ESI, PT, TDS, Form 16, 24Q, ECR. Nothing else matters as much. Also finish the payment server and make the employee directory server-authoritative — both are open (see the readiness report). |
| **Nov–Dec 2026** | Founding 100 opens. Founder-led sales only. Recruit 5–10 CA/consultant partners — they plan client switches in this window. |
| **Jan–Mar 2027** | Onboarding and data migration for April go-live. This is the work that wins April, and it is unglamorous: taking their Excel and their last Form 16 and making the numbers match. |
| **1 Apr 2027** | Go-live for the cohort. Their first correct payroll run is the reference that sells the next hundred. |
| **Apr 2027+** | Now paid acquisition makes sense — at list price, with references, in the segment where CAC pays back in a quarter. |

### Acquisition, in priority order

1. **CA firms and payroll consultants.** Each already has 20–100 SMB clients and
   is trusted on exactly the question we are answering. One relationship is
   worth more than a thousand ad clicks. Lowest CAC available to us by a wide
   margin.
2. **Founder-led outbound into one vertical, in one city.** 20–200 employee
   companies. Not "everyone who has an employee" — a segment narrow enough that
   a reference in it is worth something.
3. **Content on the long-tail compliance questions** people actually search:
   PF ECR format, Form 24Q due dates, PT slabs by state. Slow, compounds, near
   zero marginal cost, and it reaches the buyer at the moment of pain.
4. **Paid ads — later.** Only at list price, only with references.

### One assumption worth challenging

> "This software is necessary for everyone that needs an employee."

Necessary is not the same as *will pay*. Most Indian companies under 20 people
run payroll on a spreadsheet and their CA, and are reasonably happy. That is
precisely why Kredily is free — willingness to pay at the bottom of the market
is genuinely near zero, and the money is in payouts and filings, not in software
seats.

The companies that *will* pay are the ones where the founder has stopped doing
payroll personally: roughly **20 to 200 employees**, usually multi-state, usually
after a compliance scare. That is a far smaller market than "everyone with an
employee" — and a much easier one to sell to.

---

## Sources

Competitor pricing checked August 2026. Several of these are comparison sites
operated by competing vendors (notably `hrone.cloud`), so their framing of rivals
should be read with that in mind; the primary vendor pages are the reliable ones.

- Kredily — free plan and paid tiers: https://kredily.com/pricing/ and https://kredily.com/payroll-software/
- greytHR — pricing calculator: https://www.greythr.com/pricing-calculator/ ; plan summaries: https://www.itforsme.in/pricing/greythr-india/
- Zoho People — India pricing: https://www.itforsme.in/pricing/zoho-people-india/
- Keka — pricing summaries: https://www.itforsme.in/pricing/keka-india and https://hrone.cloud/blog/keka-pricing-india/
- SMB SaaS CAC benchmarks: https://www.saasultra.com/saas-cac-benchmarks/
- CAC payback benchmarks: https://optif.ai/learn/questions/cac-payback-period-benchmark/
- HRIS switching and implementation costs: https://hrtechsaas.com/blog/hris-switching-costs-mid-market-guide/
- Indian payroll statutory scope (PF/ESI/PT/TDS/Form 16): https://ledgers.cloud/in/payroll-compliance
