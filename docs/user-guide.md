# ModCon HR — user guide

For employees and managers. HR and administrators: see the [HR & admin guide](hr-admin-guide.md).

Sign in at **modcon-hr.vercel.app** with the work email and password your administrator gave you. There is no self-registration: an administrator creates your account. If you forget your password, use **Forgot Password?** on the sign-in page.

Your session lasts as long as the browser tab: a reload keeps you signed in, but opening the app in a new tab, or after closing the browser, asks you to sign in again.

Your account is tied to your employee record by an administrator. If your dashboard says **Profile not linked**, ask HR to link your account — until they do, your own leave, attendance and payslips cannot be shown.

## What you see depends on your role

| | Employee | Manager | HR Manager / Admin |
| --- | --- | --- | --- |
| Dashboard, People & Documents, My Attendance, Leave, Expenses, Helpdesk, Documents, The Board | yes | yes | yes |
| Finance & Payslips (your own pay) | yes | yes | yes |
| Approvals (your team's leave, claims, regularizations) | — | yes | yes (everyone) |
| Attendance (team view) | — | yes | yes |
| Payroll, Reports, Settings, Admin, Support | — | — | yes |

The sidebar only lists what you can open. Exact access is in the [reference](reference.md#roles-and-permissions).

## The dashboard

The dashboard opens with a briefing card: your check-in status, **Team Pulse** (who in your department has checked in or is on leave today), an action digest, and the next holiday.

- **Team Pulse** counts you as part of your department. It says "N of M checked in today" from real attendance records, never an assumed "everyone is available".
- **Recent updates** lists decisions on *your* requests from the last 30 days — leave, expense claims and regularizations — with who decided and when. New ones are marked **New**; opening one marks it read.
- The tiles below the briefing open what they count: My Leave Requests and My Pending Leaves go to Leave, Expense Claims to Expenses, Open Tickets to Helpdesk.

### The bell

The bell shows decisions on your own requests ("Leave approved · Casual · 11 Nov – 12 Nov · 2 days · by Aarav Sharma"), then — if you approve things — the queues waiting for you. The count on the bell equals what the queue it opens lists. Read/unread state is remembered per device.

You can switch these notifications on or off with your administrator's **Settings → Notifications** (they are organisation-wide).

## Attendance

**Check in and out** on **My Attendance**. The page shows your calendar for the month; each day is Present, Absent, Half Day, Work From Home, On Leave, a holiday or your week-off.

- If your organisation has declared **working hours**, a check-in after the shift start plus grace is marked late. If it has not, nobody is measured as late and the cards read "Not measured".
- If your organisation has drawn **attendance locations**, your phone's position is captured at check-in and check-out and compared with them. In *advisory* mode nobody is refused; in *enforced* mode a check-in far from every location is. Some people (site engineers, field staff) are exempt and nothing is captured for them.
- **Forgot to check out?** Yesterday's open record shows as a missing check-out on your calendar. Raise a regularization for that day.

### Regularization

Use **Request Regularization** when your record for a day is wrong (missed punch, worked from home, on-site meeting).

1. Pick the day and the status you are asking for (Present, WFH, Half Day, On Leave) and write a reason.
2. When days on the month's calendar need attention, **Request Regularization** opens one form for *all* of them ("Regularize All N Days"). Each date is a chip with an × — remove the days you do not mean before submitting. With nothing flagged it opens for today.
3. Your request goes to whoever decides it. Anything that **changes the day** is decided by HR or an administrator; managers decide only the entries the app flagged itself.
4. The result appears in your bell and in Recent updates, and — if approved — the day itself changes.

Your own week-off is never flagged for regularization.

## Leave

Open **Leave** to see your balances, apply, and track requests.

- **Balances** are derived from your organisation's leave policy, your joining date and today: some types accrue monthly (and reset on 1 April), others are granted annually. If HR agreed something different for you, the card says **Custom entitlement**.
- **Apply Leave**: choose type and dates (past dates are allowed — leave is often applied after the fact), add a reason, submit. The dialog checks your balance and the rules for that type.
- **Beyond your quota is loss of pay, not a refusal.** If you ask for more days than you have, the dialog says so ("2 paid, 3 loss of pay") and submits. The unpaid days are the request's last working days and are deducted from the month they fall in, once the request is approved.
- **Unpaid Leave** is loss of pay in full.
- **Comp Off** is earned: each day this financial year that you worked on your week-off or a declared holiday adds a day (half a day for under four hours).
- Holidays and your week-off are not charged against a leave request.
- Your manager (or anyone above them) decides, and so do HR and administrators. Nobody decides their own request.

## Expenses

**Expenses → New Claim**: title, category, amount, date, an optional description and receipt image (PNG/JPG up to 5 MB). The claim goes to your manager and HR. Status moves Submitted → Approved or Rejected → Reimbursed. You are told in the bell when it is decided.

## Helpdesk

**Helpdesk** is for questions to your own HR. Raise a ticket with a priority and follow its thread.

## Finance & Payslips

**Finance & Payslips** is your own pay. If HR has uploaded the payslip PDF for a month, that PDF is shown and downloadable. If not, you see an **estimate** computed from your CTC and attendance, labelled "Estimated this month … not yet paid" — an estimate is never presented as paid. "Paid" means a payslip was issued.

Payslip amounts print as "Rs." in the PDF.

## People & Documents

Everyone can browse the directory (name, team, contact). Your own profile has tabs for details, compensation (yours only), **Documents**, and **Time Off**.

### Documents and bank details

On your profile's **Documents** tab:

- **Primary (compulsory) documents** — Aadhaar Card, PAN Card, Bank Account Details — are uploaded by you (or by HR). Secondary documents are the company's paperwork, filed by HR or an administrator.
- A newly uploaded document is **Pending**; HR or an administrator marks it **Verified**.
- **Once HR has verified a compulsory document you cannot replace it.** It disappears from your upload list; to change it, ask HR.
- **Bank Account** card: enter the account holder name, account number (typed twice — paste is blocked on the second field) and IFSC. It arrives as Pending; HR verifies or rejects it with a reason. Once verified you cannot edit it — contact HR. Only you and HR can see your bank details; a manager or colleague cannot.

## The Board

**The Board** is the organisation's noticeboard: announcements, replies and emoji reactions. Birthdays and work anniversaries appear automatically; the composer can pre-fill a greeting, so the wish is a real post from you. You can react as yourself only.

## For managers

**Approvals** lists the requests *you may decide*: leave and expense claims for people in your reporting line (direct reports and everyone below them), regularizations the app flagged, and onboarding tasks.

- You never decide your own request or anyone outside your line. If your account is not linked to an employee record you decide nothing, and the page says so.
- A request that **changes an attendance day** is HR's, not yours.
- The count on the Approvals card, the bell and the queue are the same number.
- **Attendance** shows your team's day; **Performance** is available to you; Recruitment, Onboarding, Assets, Helpdesk and Expenses are view-only unless the organisation changed that.
- Payroll, Reports and Settings are not available to managers.

If a queue looks too short, it is because the rest belongs to someone else's line or to HR.
