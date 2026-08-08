/**
 * A month of leave, in two organisations, driven through the app's own modules.
 *
 * The rules suites answer "can one tenant reach another". This one answers the
 * question a customer actually asks: **does the product work for an ordinary
 * month of ordinary use** — ten people, one of them HR, one of them the manager
 * who has to action the requests, from the first application to the month-end
 * balance.
 *
 * Two organisations, populated identically and independently, because a single
 * tenant cannot show whether a figure belongs to the organisation or to the
 * installation.
 *
 * The month is June 2026: 30 days, 22 of them weekdays. Dates are passed
 * explicitly wherever the API accepts one, so the result does not depend on
 * when the simulation is run.
 *
 * **Each organisation's month is observed while that organisation is the active
 * one, and reduced to plain data before the next is loaded.** The active
 * organisation key is global and read at call time (src/lib/orgScope.ts), so a
 * module instance from org A queries org B's namespace the moment B is loaded —
 * which is precisely why switching organisation in the browser is followed by a
 * page reload. Holding two live orgs at once and comparing them would be
 * measuring an arrangement the app never puts itself in.
 *
 * Findings are not implied by silence. Where the app does something worth
 * changing, this file asserts the behaviour **as it is** and names the finding,
 * so the assertion fails the day someone fixes it and the report gets revisited
 * rather than quietly going stale.
 *
 * Run with `npm run test:sim`.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserEnvironment, loadAppFor, storage } from './env.mjs';

installBrowserEnvironment();

/** Calendar days inclusive — the app's own arithmetic (src/pages/leave/index.tsx:188). */
function calendarDays(start, end) {
  const ms = new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`);
  return Math.ceil(ms / 86_400_000) + 1;
}

/** Working days inclusive — what a leave day count arguably ought to mean. */
function workingDays(start, end) {
  let count = 0;
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

const ORGS = [
  { key: 'org-northwind', name: 'Northwind Consulting', domain: 'northwind.test' },
  { key: 'org-sterling', name: 'Sterling Works', domain: 'sterling.test' },
];

/**
 * Ten people: the HR manager, the reporting manager, seven reports, and one
 * person who reports to HR rather than to the manager.
 *
 * HR sits outside the manager's reporting line on purpose — that is the shape
 * src/lib/dataScope.ts is written for, where a manager sees their own subtree
 * *plus* HR, and HR sees everyone.
 *
 * The tenth person (Hari, below) matters more than he looks. An organisation
 * where every single employee reports to the one manager cannot tell a scoped
 * queue from an unscoped one — both return everything. One person outside the
 * line is what makes the difference measurable, and it is the ordinary shape
 * anyway: not everybody reports to engineering.
 */
const STAFF = [
  { first: 'Asha', last: 'Rao', designation: 'Senior Software Engineer' },
  { first: 'Bilal', last: 'Khan', designation: 'Software Engineer' },
  { first: 'Chitra', last: 'Nair', designation: 'Software Engineer' },
  { first: 'Devan', last: 'Pillai', designation: 'QA Engineer' },
  { first: 'Esha', last: 'Gupta', designation: 'DevOps Engineer' },
  { first: 'Farid', last: 'Sheikh', designation: 'Software Engineer' },
  { first: 'Gita', last: 'Menon', designation: 'Business Analyst' },
  { first: 'Hari', last: 'Varma', designation: 'Software Engineer' },
];

const HR_DESIGNATION = 'Head of People';
const MANAGER_DESIGNATION = 'Engineering Manager';

/**
 * The month's leave, one row per application. Deliberately ordinary: a long
 * weekend, a bout of flu, a wedding, a block that spans two weekends, one the
 * manager turns down, and one left undecided so the queue is not empty on the
 * last day.
 */
const APPLICATIONS = [
  { who: 0, type: 'Casual', start: '2026-06-01', end: '2026-06-02', reason: 'Extended weekend.', appliedOn: '2026-05-28', decide: 'Approved' },
  { who: 1, type: 'Sick', start: '2026-06-03', end: '2026-06-05', reason: 'Influenza, doctor advised rest.', appliedOn: '2026-06-03', decide: 'Approved' },
  { who: 2, type: 'Earned', start: '2026-06-08', end: '2026-06-19', reason: 'Wedding in the family.', appliedOn: '2026-06-01', decide: 'Approved' },
  { who: 3, type: 'Casual', start: '2026-06-11', end: '2026-06-11', reason: 'Personal errand.', appliedOn: '2026-06-09', decide: 'Approved' },
  { who: 4, type: 'Sick', start: '2026-06-15', end: '2026-06-16', reason: 'Migraine.', appliedOn: '2026-06-15', decide: 'Approved' },
  { who: 5, type: 'Earned', start: '2026-06-22', end: '2026-06-26', reason: 'Annual holiday.', appliedOn: '2026-06-05', decide: 'Rejected' },
  { who: 6, type: 'Casual', start: '2026-06-25', end: '2026-06-26', reason: 'House move.', appliedOn: '2026-06-18', decide: 'Approved' },
  { who: 7, type: 'Casual', start: '2026-07-02', end: '2026-07-03', reason: 'Family visit.', appliedOn: '2026-06-29', decide: null },
];

/** A UserProfile, as auth.tsx would hand it to the data modules. */
function profileFor(person, role, orgKey) {
  return {
    uid: `uid-${person.id}-${orgKey}`,
    email: person.email,
    displayName: person.fullName,
    photoURL: null,
    role,
    orgId: orgKey,
  };
}

/**
 * Stand an organisation up, run its month, and reduce everything observed to
 * plain data — see the note at the top of the file on why the reduction has to
 * happen before the next organisation is loaded.
 */
async function runMonthFor(org) {
  const app = await loadAppFor(org.key);

  // --- Day 0: the organisation is empty, as a newly provisioned one is. ---
  const startedEmpty = app.isMockDataCleared() && app.getEmployeeDirectory().length === 0;

  // --- HR sets the company profile, naming which titles carry HR. ---
  app.saveCompanyProfile({
    ...app.getCompanyProfile(),
    name: org.name,
    legalName: `${org.name} Pvt Ltd`,
    hrDesignations: [HR_DESIGNATION],
  });

  // --- HR enters the organisation's own holiday calendar. ---
  app.saveHolidayDirectory([
    { id: 'h-ind', name: 'Independence Day', date: '2026-08-13', type: 'National' },
    // Optional holidays stay working days: a restricted holiday is one an
    // employee may take, not one the company closes for.
    { id: 'h-opt', name: 'Local festival', date: '2026-08-12', type: 'Optional' },
  ]);

  // --- HR adds the ten people, exactly as the Employees page does. ---
  function addPerson({ first, last, designation, managerId, doj }) {
    const directory = app.getEmployeeDirectory();
    const seq = app.getNextEmployeeSequence(directory);
    const id = `emp-${String(seq).padStart(3, '0')}`;
    const manager = directory.find((e) => e.id === managerId);
    const person = {
      id,
      employeeCode: `MC-${String(seq).padStart(3, '0')}`,
      firstName: first,
      lastName: last,
      fullName: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${org.domain}`,
      phone: '+91 90000 00000',
      avatar: `${first} ${last}`,
      gender: 'Female',
      dateOfBirth: '1992-01-01',
      designation,
      department: 'Engineering',
      location: 'Bengaluru',
      employmentType: 'Full-time',
      status: 'Active',
      dateOfJoining: doj,
      reportingManagerId: managerId ?? null,
      reportingManagerName: manager?.fullName,
      ctc: 1_800_000,
      skills: [],
    };
    app.addEmployeeToDirectory(person);
    return person;
  }

  // Joined well before the month, so the one-year Earned Leave gate is open.
  const hr = addPerson({ first: 'Priya', last: 'Menon', designation: HR_DESIGNATION, managerId: null, doj: '2022-04-01' });
  const manager = addPerson({ first: 'Rahul', last: 'Iyer', designation: MANAGER_DESIGNATION, managerId: null, doj: '2021-06-01' });
  const staff = STAFF.map((s, i) => addPerson({
    ...s,
    // The last of them reports to HR, not to the engineering manager.
    managerId: i === STAFF.length - 1 ? hr.id : manager.id,
    doj: '2023-04-01',
  }));

  const hrProfile = profileFor(hr, 'hr', org.key);
  const managerProfile = profileFor(manager, 'manager', org.key);
  const employeeProfile = profileFor(staff[0], 'employee', org.key);

  // --- The month: applications, then the manager's decisions. ---
  const applied = [];
  const rejectedApplications = [];
  APPLICATIONS.forEach((application) => {
    const person = staff[application.who];
    const requests = app.getLeaveRequests();
    // The real application path: the same validator and the same day count the
    // Leave page uses, so what the form would accept is what is filed here.
    const check = app.checkLeaveApplication(
      { employee: person, type: application.type, startDate: application.start, endDate: application.end },
      requests,
      application.appliedOn,
    );
    if (check.error) {
      rejectedApplications.push({ who: person.id, start: application.start, error: check.error });
      return;
    }
    const request = {
      id: app.newLeaveRequestId(),
      employeeId: person.id,
      type: application.type,
      startDate: application.start,
      endDate: application.end,
      days: check.days,
      reason: application.reason,
      status: 'Pending',
      appliedOn: application.appliedOn,
      approverId: null,
    };
    app.saveLeaveRequests([request, ...requests]);
    applied.push({ ...request, decide: application.decide, breakdown: check.breakdown });
  });

  // What the manager is told before deciding anything.
  const queueNotification = app.getNotifications(managerProfile).find((n) => n.id === 'n1');
  // The same moment, counted the way LeaveRequestsApprovalsPage counts it now:
  // pending *and* within the viewer's scope.
  const managerScope = app.getVisibleEmployeeIds(managerProfile);
  const pendingVisibleToManagerAtQueueTime = app.getLeaveRequests()
    .filter((r) => r.status === 'Pending' && managerScope.has(r.employeeId)).length;
  const employeeNotificationIds = app.getNotifications(employeeProfile).map((n) => n.id);

  // The manager actions the queue.
  for (const request of applied) {
    if (!request.decide) continue;
    app.updateLeaveRequestStatus(request.id, request.decide, {
      profile: managerProfile,
      employeeId: manager.id,
      name: manager.fullName,
    });
  }

  const finalRequests = app.getLeaveRequests();

  const entitlementsFor = (person, asOf) =>
    app.getEntitlements(person, finalRequests, asOf).map((e) => ({
      type: e.type, granted: e.granted, used: e.used, available: e.available, monthly: e.monthly,
    }));

  return {
    org,
    startedEmpty,
    companyName: app.getCompanyProfile().name,
    hrDesignationRecognised: app.isHrDesignation(HR_DESIGNATION),
    directorySize: app.getEmployeeDirectory().length,
    hrManagerIds: app.getHrManagers(app.getEmployeeDirectory()).map((e) => e.id),
    directReportCount: app.getEmployeeDirectory().filter((e) => e.reportingManagerId === manager.id).length,
    emails: app.getEmployeeDirectory().map((e) => e.email),

    ids: { hr: hr.id, manager: manager.id, staff: staff.map((s) => s.id) },
    applied: applied.map((r) => ({ id: r.id, employeeId: r.employeeId, days: r.days, decide: r.decide, start: r.startDate, end: r.endDate, breakdown: r.breakdown })),
    requests: finalRequests.map((r) => ({ ...r })),

    visible: {
      manager: [...app.getVisibleEmployeeIds(managerProfile)].sort(),
      employee: [...app.getVisibleEmployeeIds(employeeProfile)].sort(),
      hr: [...app.getVisibleEmployeeIds(hrProfile)].sort(),
    },
    queueNotification: queueNotification ? { ...queueNotification } : null,
    pendingVisibleToManagerAtQueueTime,
    employeeNotificationIds,

    pendingCountForManager: app.getPendingCount(managerProfile),
    pendingCountOrgWide: app.getPendingCount(null),
    approvedThisMonth: app.getApprovedThisMonth('2026-06', null),
    approvedThisMonthForManager: app.getApprovedThisMonth('2026-06', managerProfile),
    onLeaveMidMonth: app.getOnLeaveToday('2026-06-16', null).length,
    rejectedApplications,

    entitlements: {
      asha: entitlementsFor(staff[0], '2026-06-30'),
      farid: entitlementsFor(staff[5], '2026-06-30'),
      hari: entitlementsFor(staff[7], '2026-07-31'),
    },

    // The surface HR actually reads: entitlements for every visible employee,
    // which is what the Balances tab is built from now.
    balanceRowsHrCanSee: app.getVisibleEmployees(hrProfile)
      .map((emp) => ({ id: emp.id, rows: app.getEntitlementBalances(emp, finalRequests).length })),

    newId: () => app.newLeaveRequestId(),

    // A working week containing one company holiday.
    holidayAwareCount: app.leaveDayBreakdown('2026-08-10', '2026-08-14'),
    // A Saturday and a Sunday.
    weekendOnlyCheck: app.checkLeaveApplication(
      { employee: staff[0], type: 'Casual', startDate: '2026-06-06', endDate: '2026-06-07' },
      finalRequests, '2026-06-05',
    ),
    // Dates Asha already has approved leave for.
    overlapCheck: app.checkLeaveApplication(
      { employee: staff[0], type: 'Casual', startDate: '2026-06-02', endDate: '2026-06-03' },
      finalRequests, '2026-06-01',
    ),
    // Far more Casual leave than anyone accrues in a year.
    overBalanceCheck: app.checkLeaveApplication(
      { employee: staff[3], type: 'Casual', startDate: '2026-09-01', endDate: '2026-10-30' },
      finalRequests, '2026-08-25',
    ),
    // Last March.
    backdatedCheck: app.checkLeaveApplication(
      { employee: staff[3], type: 'Casual', startDate: '2026-03-02', endDate: '2026-03-03' },
      finalRequests, '2026-06-30',
    ),

    outOfLine: outOfLineOutcome(),
  };

  /**
   * Run last, after every month-end figure above has been read, because it
   * changes them.
   *
   * Hari reports to HR, so his request is outside this manager's line. Nothing
   * stops the manager deciding it: updateLeaveRequestStatus takes a request id
   * and an approver and applies no visibility check, and the queue page hands
   * them the button.
   */
  function outOfLineOutcome() {
    const request = finalRequests.find((r) => r.employeeId === staff[7].id);
    let refusal = null;
    try {
      app.updateLeaveRequestStatus(request.id, 'Approved', {
        profile: managerProfile,
        employeeId: manager.id,
        name: manager.fullName,
      });
    } catch (err) {
      refusal = { name: err.name, message: err.message };
    }
    const after = app.getLeaveRequests().find((r) => r.id === request.id);
    // The employee's own attempt to approve their own leave, for the same reason.
    let selfRefusal = null;
    try {
      app.updateLeaveRequestStatus(request.id, 'Approved', {
        profile: profileFor(staff[7], 'employee', org.key),
        employeeId: staff[7].id,
        name: staff[7].fullName,
      });
    } catch (err) {
      selfRefusal = { name: err.name, message: err.message };
    }
    return {
      requestId: request.id,
      employeeId: request.employeeId,
      refusal,
      selfRefusal,
      statusAfter: after.status,
      approverIdAfter: after.approverId,
    };
  }
}

const results = new Map();

before(async () => {
  for (const org of ORGS) {
    results.set(org.key, await runMonthFor(org));
  }
});

// The org-settings publish touches the Firebase client SDK, which keeps a
// handle open and would hold the process after the last test.
after(() => { setTimeout(() => process.exit(0), 50).unref(); });

const northwind = () => results.get('org-northwind');
const sterling = () => results.get('org-sterling');

// ---------------------------------------------------------------------------
// 1. The month ran, in both organisations, independently
// ---------------------------------------------------------------------------

describe('a month of leave — the flow completes', () => {
  for (const org of ORGS) {
    it(`${org.name}: starts empty, as a newly provisioned organisation does`, () => {
      assert.equal(results.get(org.key).startedEmpty, true);
    });

    it(`${org.name}: ten people, one HR, one manager, seven reports plus one under HR`, () => {
      const r = results.get(org.key);
      assert.equal(r.directorySize, 10);
      assert.deepEqual(r.hrManagerIds, [r.ids.hr]);
      assert.equal(r.directReportCount, 7, 'seven report to the manager; the eighth reports to HR');
      assert.equal(r.hrDesignationRecognised, true);
    });

    it(`${org.name}: every application was filed and decided as intended`, () => {
      const r = results.get(org.key);
      const byId = new Map(r.requests.map((x) => [x.id, x]));
      assert.equal(byId.size, APPLICATIONS.length, 'no request was lost or merged');
      for (const request of r.applied) {
        assert.equal(byId.get(request.id).status, request.decide ?? 'Pending');
      }
    });

    it(`${org.name}: an approval records who approved it`, () => {
      const r = results.get(org.key);
      const approved = r.requests.filter((x) => x.status === 'Approved');
      assert.equal(approved.length, 6);
      for (const request of approved) {
        assert.equal(request.approverId, r.ids.manager);
      }
    });

    it(`${org.name}: a rejection credits nobody`, () => {
      const rejected = results.get(org.key).requests.filter((x) => x.status === 'Rejected');
      assert.equal(rejected.length, 1);
      assert.equal(rejected[0].approverId, null);
      assert.equal(rejected[0].approverName, undefined);
    });

    it(`${org.name}: one request is still pending at month end`, () => {
      assert.equal(results.get(org.key).pendingCountOrgWide, 1);
    });
  }

  it('the two organisations kept entirely separate records', () => {
    const a = northwind();
    const b = sterling();
    assert.notEqual(a.companyName, b.companyName);
    const emailsB = new Set(b.emails);
    for (const email of a.emails) assert.equal(emailsB.has(email), false);
  });

  it('the two organisations reached the same figures from the same month', () => {
    const a = northwind();
    const b = sterling();
    assert.equal(a.pendingCountOrgWide, b.pendingCountOrgWide);
    assert.equal(a.approvedThisMonth, b.approvedThisMonth);
    assert.deepEqual(a.entitlements.asha, b.entitlements.asha);
  });

  it("each organisation's local storage is namespaced to itself", () => {
    const keys = storage.keys().filter((k) => k.startsWith('modcon.hr.'));
    assert.ok(keys.some((k) => k.endsWith('::org:org-northwind')));
    assert.ok(keys.some((k) => k.endsWith('::org:org-sterling')));
    // Only the active-org pointer may sit on a bare, unscoped key.
    assert.deepEqual(keys.filter((k) => !k.includes('::org:')), ['modcon.hr.activeOrgKey']);
  });
});

// ---------------------------------------------------------------------------
// 2. Who is told about the queue, and who may act on it
// ---------------------------------------------------------------------------

describe('a month of leave — the approval queue reaches the right people', () => {
  it('the manager sees their own reporting line, plus HR — and nobody else', () => {
    const r = northwind();
    assert.equal(r.visible.manager.length, 9);
    assert.ok(r.visible.manager.includes(r.ids.manager));
    assert.ok(r.visible.manager.includes(r.ids.hr), 'HR is in scope though HR does not report to them');
    for (const id of r.ids.staff.slice(0, 7)) assert.ok(r.visible.manager.includes(id));
    assert.equal(
      r.visible.manager.includes(r.ids.staff[7]), false,
      'the person who reports to HR is outside this manager\'s scope',
    );
  });

  it('an employee sees only themselves', () => {
    const r = northwind();
    assert.deepEqual(r.visible.employee, [r.ids.staff[0]]);
  });

  it('HR sees the whole organisation', () => {
    assert.equal(northwind().visible.hr.length, 10);
  });

  it('the manager is notified about their own line only', () => {
    const r = northwind();
    assert.equal(r.queueNotification.count, 7, 'seven of the eight applications are theirs');
    assert.equal(r.queueNotification.path, '/dashboard/pending-approvals/leave-requests');
  });

  it('an employee is not notified about approval queues at all', () => {
    assert.equal(northwind().employeeNotificationIds.includes('n1'), false);
  });
});

// ---------------------------------------------------------------------------
// 3. Month-end balances
// ---------------------------------------------------------------------------

describe('a month of leave — balances at month end', () => {
  it('entitlements accrue and net off approved leave', () => {
    const casual = northwind().entitlements.asha.find((e) => e.type === 'Casual');
    assert.ok(casual);
    assert.equal(casual.used, 2, 'the two-day June application is counted');
    assert.equal(casual.available, casual.granted - casual.used);
  });

  it('a rejected request consumes nothing', () => {
    const earned = northwind().entitlements.farid.find((e) => e.type === 'Earned');
    assert.equal(earned.used, 0, 'the declined holiday was not deducted');
  });

  it('a request still pending consumes nothing', () => {
    const casual = northwind().entitlements.hari.find((e) => e.type === 'Casual');
    assert.equal(casual.used, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. The seven findings this simulation first turned up, now fixed
//
// Each of these asserted the broken behaviour when it was written. They assert
// the corrected behaviour now, so the fix cannot silently regress.
// ---------------------------------------------------------------------------

describe('a month of leave — leave is counted in working days', () => {
  it('a block spanning two weekends costs ten days, not twelve', () => {
    // Was `Math.ceil((end - start) / 86400000) + 1`, so 8-19 June was recorded
    // as twelve. The figure is what the entitlement engine deducts and what any
    // payroll deduction is computed from, so it was wrong everywhere at once.
    const block = northwind().applied.find((a) => a.start === '2026-06-08');
    assert.equal(block.days, 10);
    assert.equal(block.breakdown.calendarDays, 12);
    assert.equal(block.breakdown.weekendDays, 2);
    assert.equal(workingDays(block.start, block.end), block.days);
    assert.notEqual(calendarDays(block.start, block.end), block.days);
  });

  it("the organisation's own holidays are excluded too", () => {
    const r = northwind();
    assert.equal(r.holidayAwareCount.days, 4, 'five weekdays, one of them a company holiday');
    assert.equal(r.holidayAwareCount.holidayDays, 1);
  });

  it('a range that is entirely non-working is refused rather than filed as zero', () => {
    assert.match(northwind().weekendOnlyCheck.error, /non-working/);
  });
});

describe('a month of leave — "approved this month" means the month it is taken', () => {
  it('counts the six approvals that fall in June, including the one applied for in May', () => {
    // Was matched on `appliedOn`, so Asha's 1-2 June leave — applied for on
    // 28 May — was reported in May and missing from June.
    const r = northwind();
    const approvedInJune = r.requests.filter(
      (x) => x.status === 'Approved' && x.startDate.startsWith('2026-06'),
    ).length;
    assert.equal(approvedInJune, 6);
    assert.equal(r.approvedThisMonth, 6);
  });
});

describe('a month of leave — balances reach every surface that shows them', () => {
  it('HR sees a balance row for every employee, not for nobody', () => {
    // The Balances tab was driven by `balanceEmployeeIds`, derived from the
    // demo seed, so for a real organisation it listed nobody however many
    // people it had. It reads the entitlement engine now — the same engine
    // that was always computing the right figures.
    const rows = northwind().balanceRowsHrCanSee;
    assert.equal(rows.length, 10, 'one per employee in the organisation');
    for (const row of rows) assert.ok(row.rows > 0, `${row.id} has entitlement rows`);
  });
});

describe('a month of leave — the approval queue is scoped, and so is the decision', () => {
  it('the notification and the queue page now agree', () => {
    // The notification counted the manager's own line; the queue page filtered
    // on status alone and listed the whole organisation, with an Approve
    // button on each. Both are scoped through getVisibleEmployeeIds now.
    const r = northwind();
    assert.equal(r.queueNotification.count, 7);
    assert.equal(r.pendingVisibleToManagerAtQueueTime, 7);
  });

  it('a manager cannot decide leave outside their reporting line', () => {
    // updateLeaveRequestStatus took a request id and an approver and applied no
    // visibility check, so the refusal depended on every page remembering to
    // filter. It refuses at the decision now.
    const r = northwind();
    assert.equal(r.visible.manager.includes(r.outOfLine.employeeId), false);
    assert.equal(r.outOfLine.refusal.name, 'LeaveScopeError');
    assert.match(r.outOfLine.refusal.message, /outside your team/);
    assert.equal(r.outOfLine.statusAfter, 'Pending', 'the request was left alone');
  });

  it('an employee cannot approve their own leave', () => {
    const r = northwind();
    assert.equal(r.outOfLine.selfRefusal.name, 'LeaveScopeError');
    assert.equal(r.outOfLine.statusAfter, 'Pending');
  });

  it('the pending count answers for the viewer who asked', () => {
    const r = northwind();
    assert.equal(r.pendingCountOrgWide, 1, "Hari's, which HR would action");
    assert.equal(r.pendingCountForManager, 0, 'nothing left in this manager\'s line');
  });
});

describe('a month of leave — request ids are unique by construction', () => {
  it('ids do not depend on the length of a list that can shrink', () => {
    // Was `lr-${requests.length + 1}`: delete one request and the next
    // application reuses a live id, and updateLeaveRequestStatus rewrites every
    // match — so one decision would change two people's leave.
    const r = northwind();
    const ids = r.requests.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.ok(id.length > 'lr-000'.length, `${id} is not a sequence number`);

    // The property that matters: an id issued after a deletion still collides
    // with nothing.
    const fresh = Array.from({ length: 50 }, () => northwind().newId());
    assert.equal(new Set([...ids, ...fresh]).size, ids.length + fresh.length);
  });
});

describe('a month of leave — an application is checked before it is filed', () => {
  it('overlapping leave for the same person is refused', () => {
    assert.match(northwind().overlapCheck.error, /already have/);
  });

  it('an application beyond the remaining balance is refused, and says by how much', () => {
    const check = northwind().overBalanceCheck;
    assert.match(check.error, /too many/);
    assert.match(check.error, /Unpaid Leave/);
  });

  it('leave dated far in the past is refused', () => {
    assert.match(northwind().backdatedCheck.error, /in the past/);
  });

  it('nothing in the month itself was refused — the checks do not block ordinary use', () => {
    assert.deepEqual(northwind().rejectedApplications, []);
    assert.deepEqual(sterling().rejectedApplications, []);
  });
});
