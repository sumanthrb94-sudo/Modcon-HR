# Modcon HR launch readiness

This is the release gate for a customer pilot or production promotion. A checked item must have evidence attached to the release ticket; checking a box from memory is not evidence.

## Automated release gate

- [ ] Use Node 20 or 22. Firebase Tools does not support Node 24.
- [ ] `npm ci`
- [ ] `npm run verify:launch`
- [ ] `npm run test:rules`
- [ ] `E2E_BROWSERS=chromium npm run test:e2e -- --project=app --project=org-settings`
- [ ] `npm run rules:verify` confirms production rules match `firestore.rules`.
- [ ] No build contains `VITE_ENABLE_E2E_ACCOUNTS=true`.
- [ ] Deploy Firestore rules before application code when both change.

## Product and payroll

- [ ] Public copy describes payroll preparation and calculation, not filing or remittance.
- [ ] Customer has reviewed salary structure, statutory applicability, effective dates, and state-specific settings.
- [ ] The payroll approver can trace attendance, leave, corrections, earnings, deductions, and final net pay.
- [ ] Prepared-by and approved-by identities are retained for the payroll run.
- [ ] Filing acknowledgements and bank confirmations are retained outside generated worksheets or exports.

## Data and security

- [ ] Every shared mutable entity uses Firestore as the canonical store; localStorage is only a cache or non-sensitive preference.
- [ ] A two-browser test proves shared data converges.
- [ ] A rejected write rolls back and produces a visible failure banner.
- [ ] Employee, manager, HR, admin, and super-admin permissions have been exercised in rules tests and E2E.
- [ ] Cross-tenant reads and writes are refused.
- [ ] Production Firebase, Vercel, and support accounts require MFA.
- [ ] A restore from backup has been tested in a non-production project.

## Operations

- [ ] `VITE_OBSERVABILITY_ENDPOINT` points to an approved error-ingestion endpoint.
- [ ] `VITE_APP_RELEASE` is set to the deployed commit or release identifier.
- [ ] Uptime, authentication-error, write-failure, quota, and deployment alerts have owners.
- [ ] Incident severity, escalation contacts, customer communications, and rollback steps are documented.
- [ ] Data export, tenant closure, retention, and backup expiry have been rehearsed.

## Legal and customer approval

- [ ] Qualified counsel approved Privacy, Terms, DPA, retention, subprocessors, and breach procedures.
- [ ] A qualified Indian payroll professional approved product claims and supported statutory calculations.
- [ ] Customer provided required employee notices for attendance location processing.
- [ ] Support hours, response targets, maintenance windows, and exclusions are in the customer agreement.

## Pilot exit criteria

- [ ] Five to ten target organisations completed assisted onboarding.
- [ ] Time to first employee record and first approved leave are measured.
- [ ] No unresolved cross-tenant or salary/document access defect exists.
- [ ] No unexplained payroll variance exists.
- [ ] Save failures, cross-browser drift, support volume, and payroll-preparation time meet the agreed targets.

The public policy pages in the application are deliberately marked as drafts until counsel approves them. Remove that notice only after approval and record the approved version and effective date.
