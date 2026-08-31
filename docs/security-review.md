# Security review — August 2026

A review of the common classes, applied to the whole application rather than to
one branch's diff. Checklists used, all public:

- [OWASP Web Security Testing Guide](https://github.com/OWASP/wstg) — the reference
- [OWASP Cheat Sheet Series](https://github.com/OWASP/CheatSheetSeries)
- [0xRadi/OWASP-Web-Checklist](https://github.com/0xRadi/OWASP-Web-Checklist) — the concise pass
- [MahdiMashrur/Awesome-Application-Security-Checklist](https://github.com/MahdiMashrur/Awesome-Application-Security-Checklist)
- `npm audit` for dependencies

Tenant isolation is reviewed separately and in far more depth in
[tenant-isolation-spec.md](tenant-isolation-spec.md), backed by 905 rules
assertions. This document covers everything else.

---

## Fixed in this pass

### S1 — Production served no security headers at all *(highest impact here)*

`vercel.json` carried `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy` and `Permissions-Policy`. **`firebase.json` carried none** —
and Firebase Hosting is what actually serves `modcon-hr.web.app`
(`.github/workflows/firebase-hosting.yml` deploys there on every push to
`main`). Vercel is not the production path, so in practice the application was
served with no clickjacking defence, no MIME-sniffing defence, no referrer
policy and no HSTS.

An HR system that renders salary and payslips is a worthwhile clickjacking
target, and `X-Frame-Options` is a one-line fix.

Now set on `**` in `firebase.json`, and **verified served** against the Firebase
Hosting emulator rather than assumed:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` |
| `Content-Security-Policy-Report-Only` | see below |

**The CSP is Report-Only, deliberately.** A wrong CSP takes the application
down for every customer at once, and the honest position is that it cannot be
verified from here: the E2E suite runs against `vite preview`, which does not
apply `firebase.json` headers, and this sandbox cannot reach the deployed host.
Report-Only gives real violation reports from real sessions with no risk of an
outage.

`payment=(self "https://checkout.razorpay.com")` is already correct for the
Razorpay integration, so enforcing later will not break checkout.

**To promote it to enforcing:** deploy, watch violation reports for a full
billing cycle (the payment path is the least-exercised and the most likely to
trip it), then rename the header to `Content-Security-Policy`.

### S2 — DOMPurify XSS advisory in a production dependency

`GHSA-55q2-fjhq-7xh7` — an in-place hook removal leaves a detached subtree
executable. Reached transitively through `jspdf`, which the payslip and report
exports use. Patched to `dompurify@3.4.14` via `npm audit fix`.

### S3 — Temporary passwords were generated with a modulo bias

`src/lib/organizations.ts` and `src/lib/accountInvites.ts` each carried their
own copy of:

```ts
chars[randomValue % chars.length]
```

The alphabet is 62 characters and 2³² is not a multiple of 62, so the first
`2³² mod 62` characters were very slightly likelier than the rest. The bias is
tiny and not a practical break of a 14-character password — it is fixed because
"slightly biased" is not a property anyone should have to reason about in a
credential path, and rejection sampling costs one cheap loop.

Now one implementation in [`src/lib/tempPassword.ts`](../src/lib/tempPassword.ts)
with rejection sampling and a 12-character floor. A credential generator is the
last thing that should exist twice.

### S4 — The sign-in form confirmed which email addresses have accounts

`auth/user-not-found` returned *"No account found with that email"*, while a
wrong password returned *"Incorrect email or password."* The difference answers
a question the person asking is not entitled to have answered.

It matters more here than on a typical product: there is **no
self-registration** (see [tenant-isolation-spec.md](tenant-isolation-spec.md)
G8), so holding an account means somebody decided you should. The set of
addresses with accounts is therefore a meaningful target list — and assembling
it needed nothing but the login form.

Every bad-credential code now returns the same sentence. Rate limiting
(`auth/too-many-requests`) still reports separately, because "you are locked out
for a while" is not a fact about who exists.

---

## Assessed, not reachable — no change made

### react-router open redirect and SSR hydration advisories

`npm audit` reports two moderate advisories against `react-router` 6.0.0–7.17.0.
The fix is `react-router-dom@7.18.3`, a major version bump. Before taking a
breaking upgrade under time pressure, both were checked for reachability:

- **`deserializeErrors()` SSR hydration (`GHSA-337j-9hxr-rhxg`)** — not
  applicable. `grep` for `hydrateRoot`, `StaticRouter`, `renderToString` and
  `createStaticHandler` across `src/` returns nothing. This is a pure
  client-side SPA.
- **Open redirect via backslash in `<Link>`/`useNavigate` (`GHSA-wrjc-x8rr-h8h6`)** —
  not reachable. Every navigation target in the codebase was enumerated: they
  are string literals (`/employees`, `/settings?tab=billing`), interpolations of
  internal record ids (`/employees/${employee.id}`), or values from static
  configuration (`item.path` from `src/lib/nav.ts`, `action.to` from the
  dashboard's own array). **No navigation target is attacker-controlled.**

**Still worth doing, on its own branch**: the upgrade should happen where it can
be regression-tested properly, not bundled into a security pass. Reachability
today is not a reason to stay on a vulnerable version indefinitely — it is a
reason not to rush the upgrade.

---

## Checked and clean

| Class | Finding |
|---|---|
| **XSS sinks** | No `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `document.write`, `eval` or `new Function` anywhere in `src/`. React's default escaping is doing the work. |
| **Secrets in the bundle** | Only the Firebase web `apiKey`, which is a public client identifier by design. No private keys, no secrets. The three `VITE_` variables are a feature flag and two publishable Razorpay/API values — the Razorpay **key secret** is never a `VITE_` variable, which `src/lib/razorpay.ts` states explicitly. |
| **Sensitive logging** | No token, password, credential or `idToken` reaches `console.*`. |
| **Reverse tabnabbing** | No `target="_blank"` without `rel`. |
| **Open redirect via `location`** | Two assignments, both static: `ErrorBoundary` → `/`, and a `mailto:` built from a directory record. |
| **File upload** | The handbook upload validates content type (`application/pdf`) and size (720 KB) client-side, **and again in `firestore.rules`** — type, size, base64 length, uploader identity and filename limits. Validated in both places, which is the only arrangement that counts. |
| **Payment integrity** | Signature verification is server-side only; the client exports no subscription writer at all; 33 rules assertions confirm no role can mark itself paid or grant itself a free plan. |
| **Authorization** | 905 rules assertions across four suites. Separate document. |

---

## Accepted risks, stated rather than buried

1. **Salary and PII live in `localStorage`.** `modcon.hr.payslips`,
   `modcon.hr.customEmployees` (with CTC) and `modcon.hr.documentLibrary` are
   org-scoped browser storage. Any XSS on the origin reads all of it. The
   architecture is documented in `CLAUDE.md`; the mitigations are that there are
   no XSS sinks in the codebase and the CSP above raises the bar further. Moving
   this data server-side is the real fix and is already on the list for a
   different reason — the directory needs to be server-authoritative for
   multi-device support.
2. **Firebase's default password policy is six characters.** Applies to accounts
   after the holder changes their temporary password. Tightening it is a console
   setting (Firebase Auth password policy), not a code change.
3. **No account lockout of our own.** We rely on Firebase's
   `auth/too-many-requests` throttling.

---

## Reproducing this review

```bash
npm audit --omit=dev                    # production dependencies only
npm run test:rules                      # 905 authorization assertions
npm run test:sim                        # 64 domain assertions
npx firebase-tools@13 emulators:start --only hosting
curl -sS -D - -o /dev/null http://127.0.0.1:5000/   # confirm headers actually serve
```

The last one matters: headers configured are not headers served, and
`firebase.json` having them while `vercel.json` also has them is exactly the
kind of arrangement that hides which file production is reading.
