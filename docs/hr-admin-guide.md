# ModCon HR — HR & administrator guide

For the people who set the organisation up and run it: **HR Manager** and **Administrator** (they hold the same module access; an HR Manager is confined to their own organisation and can never create organisations or grant the Admin role). Employees and managers: see the [user guide](user-guide.md).

## 1. First day

Your organisation is created by the platform's Super Admin, who gives you a temporary password.

- **Copy the credentials rather than retyping them** — the dialog has Copy buttons for the email and the password. A mistyped password reports as `auth/invalid-credential`, the same message a nonexistent account gets.
- If the handoff is lost, the Super Admin can send a Firebase password-reset link (Organizations → Reset password). The temporary password is shown once and never stored.
- Your first account is provisioned as **HR Manager**: it administers your organisation. Other administrators get the `hr` role through **Admin → Create account**; the app never grants `admin` that way.

A new organisation is on a **trial** (see [§9](#9-trial-and-billing)).

### The Getting started checklist

The rocket button in the top bar opens **Getting started**. Each item links to where it is done and ticks itself when the data exists:

1. Name the company — Settings → Company Profile
2. Declare departments
3. Declare work locations
4. Add your people — People & Documents
5. Set the week off
6. Set working hours — Settings → Shifts
7. Publish the holiday calendar
8. Set leave policies
9. Set the salary structure
10. Declare payroll compliance
11. Draw attendance locations (optional)

**A new organisation starts empty on purpose.** There is no default holiday calendar, salary split, shift or statutory scheme, because a plausible default is indistinguishable from a decision your organisation made — and holidays, shifts and the salary split decide people's leave and pay. Wherever something is not set up, the screen says so and says what that means (for example "no day is excluded when leave is charged").

The one exception is the **week off**: every date has to resolve to worked or not, so an undeclared organisation falls back to Sunday and Settings says you have not chosen it.

## 2. Settings reference

Settings has sixteen tabs. Changes are saved to your organisation's shared configuration, so every administrator sees them.

| Tab | What it controls |
| --- | --- |
| Company Profile | Name, legal and contact details, and which job titles count as HR (see [§6](#6-who-is-hr)) |
| Departments | Departments and their heads. New ones can also be added from Add Employee |
| Locations | Work locations. Declared ones can be renamed (moving everyone posted there) or withdrawn once empty; places that only exist because somebody's record names them cannot be edited |
| Leave Policies | Quotas per type: monthly accrual (resets 1 April) or annual grant, tenure gates, carry-forward, encashment, half-day. Plus **custom entitlements for individual employees** by CSV |
| Salary Structure | How a monthly gross splits into Basic, HRA, Medical, Conveyance and Special Allowance. Plus **custom splits for individual employees** by CSV |
| Payroll Compliance | PF, ESI, professional tax and TDS — all off until you declare them |
| Shifts | Working hours and grace; per-employee shifts and overrides |
| Week Off | The day the company is closed. A person's own week-off overrides it |
| Attendance Locations | Geofence sites, the mode (off / advisory / enforced) and exemptions |
| Progress Check-ins | Cadence and channels |
| Roles & Permissions | The module-by-role access matrix |
| Holidays | The holiday calendar |
| Notifications | Which alerts are on, in-app and email |
| Integrations | Third-party connections |
| Billing | Plan, trial and requests to continue |
| Database | Seeding and the identity backfill |

### Leave policies and individual exceptions

- Policies are the quota of **paid** leave. Beyond it a request is still accepted but the extra days are loss of pay.
- **Custom entitlements** (CSV) change how many days or when they start, for named people only. Rows that cannot be used are reported, never silently dropped. Uploads merge: a file about three people changes only those three. Removing an exception returns the person to the organisation's policy.
- Balances for people on an exception show a **Custom entitlement** badge.

### Salary structure

Special Allowance is never typed — it is the remainder, so the components always add up to the monthly gross. Gross is CTC ÷ 12 and net is gross less unpaid absence; neither depends on the split, so payroll is correct even before you set one. An individual split is a CSV row with **all four figures**; a partial row is refused. A custom split does not follow later changes to the organisation's structure.

### Roles & Permissions

The matrix has three levels per module and role: **full**, **view**, **none**. Some cells are fixed (shown locked) because the server enforces them — for example Documents, Reports (HR and Admin only) and a Manager's own payslips. See the [reference](reference.md#roles-and-permissions) for defaults.

## 3. People

**People & Documents → Add Employee** takes the details in one form, including annual CTC, department, location and reporting manager. Both department and location offer "+ Add new…", which also declares them for the next administrator.

- **Reporting manager**: pick from the live directory, or **+ Add new reporting manager…** to create them in full (they are an employee too). Nobody is created until you press Save.
- **Employee code**: suggested automatically; a manager created alongside cannot share the hire's code.
- **Linking an account**: an employee can only read their own pay and leave once their sign-in account is linked to their record. Add Employee links an account that already carries the work email; **Admin → Create account** links the other way round. If neither matched exactly one account, the link is reported for you to resolve. **Settings → Database → identity backfill** links accounts that predate the link.
- **Edit Profile** (HR/Admin only) also holds annual CTC, PAN, UAN and "Tax withheld elsewhere this year" (a previous employer's tax, or months before go-live). The week-off picker leads with *Follow organisation* — leave it there unless someone genuinely has their own day.

## 4. Attendance

### Working hours and lateness

Nobody is measured as late until you declare working hours. Both Late Arrivals cards read "Not measured" until then. A late flag is stamped at check-in, so declaring a shift applies from that moment, not to past days.

### Attendance locations (geofencing)

Settings → Attendance Locations draws the places check-in is accepted from. **Start in advisory mode**: it captures and judges every check-in and refuses nobody, so the review queue fills with exactly the evidence enforcement would have acted on. `off` (the default) captures nothing.

- Each check-in and check-out is filed as a stamp **its own author cannot edit**.
- The system cannot prove coordinates are true — a rooted phone can fake them. "Falsified" is a human finding you record on the stamp, never the system's inference.
- **Exempt** people whose work is not at a fixed place (site engineers, field staff); nothing is captured for them.
- Employees must be given notice that location is processed — a legal requirement for you, not a setting.

### Regularizations and marking attendance

Regularizations that **change a day** are decided by HR or an administrator; managers decide only the entries the app flagged. Approving moves the day to the requested status (times are left as they were). **Mark Attendance** is offered to HR and administrators only: nobody else's day is written except by you, because the day is what payroll deducts.

## 5. Leave approvals

You can decide leave and expense claims **organisation-wide**; managers decide their reporting line. Nobody decides their own request — your own leave goes to your manager or another administrator. Every request from an employee with no reporting manager lands on you, so keep reporting managers filled in. Every decision is stamped with who and when, and the person who asked is told in their bell and on their dashboard.

## 6. Who is HR

Appointing an employee to an HR job title grants them the `hr` role (administrator for your organisation); removing it revokes. Which titles count is a list on the company profile, matched **exactly** — never by finding "HR" inside a title. **Both the title and the department must agree**, and the picker only offers titles held in the HR department. A role change reaches the person's open session without a sign-out.

## 7. Documents and bank details

- **Verifying** employee documents is yours (HR or administrator). Once you verify a compulsory document (Aadhaar, PAN, bank details) the employee can no longer replace it; they ask you, and you can.
- **Bank Account** card on each employee's Documents tab: the employee submits, you **Verify** or **Reject** (with a reason shown to them). You see the full account number to check it against a cancelled cheque; the employee sees it masked. You can enter or correct details yourself, which saves them as verified by you. Only the employee and HR/administrators can read them — not managers.
- The **Handbook** (Documents) is published by you in versions; every role can read the current one.
- Uploaded files ride in the Firestore document, base64-encoded, capped at about 720 KB (handbook, payslips, resumes) — no storage bucket is provisioned.

## 8. Payroll

### Running a month

**Payroll → Run payroll**:

- Offers the current month back to April, or six months back, whichever reaches further (never more than twelve). Stopping at April keeps a catch-up inside one financial year.
- Who is paid for a month: everyone who **joined by the month's last day** and is not Resigned.
- A run for nobody **cannot be confirmed**.
- **A second run for the same month is a top-up**: "Pay employees missing from this run" pays only people with no payslip yet. Nobody is ever paid twice for one month.
- Before you confirm, the dialog lists **loss of pay carried over from earlier months** — leave or regularization approved after a month was paid. It is charged to the next payslip as an arrears row so you can check it against its source.

"Paid" means a payslip was issued, and nothing else.

### Payslips

- **Computed** from CTC and attendance — a statement of what is owed.
- **Uploaded** by you (**Payroll → Upload payslips**, one document per person per month; re-uploading corrects the month). Bulk upload matches PDFs to people by the **employee code in the filename** and shows the match list before writing; files that match nobody are listed, never dropped. Employees see the uploaded PDF in preference to the computed one.
- You also see your own pay: **Finance & Payslips** has two tabs for HR and administrators, *Organisation payroll* and *My payslips*.

### Statutory compliance

Settings → Payroll Compliance. Rates for PF, ESI, professional tax and TDS ship with the app; **establishment registrations do not**, so every scheme is off until you declare it, and a scheme will not switch on without an establishment code (or a TAN for TDS).

- PF is computed on the PF-liable wage (Basic), ESI and professional tax on gross, TDS on the projected year. EPS is capped at ₹15,000 whatever the establishment chooses.
- **`employerShareInCtc`** is the one setting that changes what somebody is paid: whether the employer's PF sits inside or on top of the CTC. Both arrangements are ordinary, so it is a declared choice.
- TDS is spread over the months that **remain** and credits what earlier payslips withheld; a mid-year joiner is taxed on the months they work.
- Professional tax slabs are editable and each states when it was last checked; a location with no state mapped deducts nothing.
- The page shows when each rate was last checked against the law. A rate that has moved produces a payslip that looks right, so check the date.
- The **Code on Wages** floor is reported as a finding with the shortfall; it is never auto-corrected.
- An organisation that declares nothing gets exactly gross minus unpaid absence.

### Statutory returns

**Payroll → Statutory returns**:

- The **ECR** (EPFO) is a text file you upload to the portal exactly as downloaded. Rows that cannot be filed are listed, never dropped — a member missing from an ECR is a contribution not remitted.
- The **TDS output is not a return.** It is the deductee-wise schedule (PAN, amount paid, tax withheld, by month) that goes into the return you prepare in the department's utility. Nothing generated in a browser is the filed return.
- Returns are built from what payroll computes **now**, not from stored payslips.

ModCon HR prepares and calculates; it does not file or remit. Retain filing acknowledgements and bank confirmations yourself.

## 9. Trial and billing

New organisations start on a trial; its price is recorded on the organisation when it signs up. The countdown banner stays quiet until the last few days. After the trial there is a grace period, then a **lock**: payroll, the directory, approvals, settings and recruitment stop, while **reading and everyone's own data never stops**. The lock is a commercial gate, not a security boundary, and it fails open — if the subscription cannot be read, you are not locked out.

There is **no payment in the app**. The request form in **Settings → Billing** sends the platform a request; the Super Admin records a payment or a complimentary term and the state changes. Employees never see your trial — only the lock notice.

## 10. Recruitment and the careers page

Job openings in Recruitment are local until you press **Publish**, which copies the opening to the public careers page at `/careers/<your-org-key>`. Drafts are never published implicitly. Candidates apply without an account (one application per email address per role; a second attempt is refused, not overwritten). Hiring managers advance candidates only for their own jobs. Resumes are PDFs up to about 720 KB.

## 11. Support

**Support** is HR's line to the platform: open a thread, the Super Admin replies. Employees and managers raise questions with you through Helpdesk, not here.

## 12. Things to watch

- **Reporting managers**: keep them set; otherwise every request lands on HR.
- **Account links**: an unlinked employee account reads none of its own salary or leave and cannot check in. If someone says their data is "empty", check the link first.
- **Time zones**: birthdays and work anniversaries are compared in IST.
- **Decisions made before 12 October 2026 carry no date or decider** (the stamp did not exist) and are not shown in employees' Recent updates.
- **Loss of pay** is settled on approval, first approved first paid.
- **Known gaps**: ESI coverage is tested monthly rather than held for the April/October contribution period (stated in the UI); the onboarding queue's Approve/Decline buttons only hide a task until reload.
