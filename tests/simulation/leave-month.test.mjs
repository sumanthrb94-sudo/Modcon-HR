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
  APPLICATIONS.forEach((application) => {
    const person = staff[application.who];
    const requests = app.getLeaveRequests();
    // Constructed the way src/pages/leave/index.tsx:186-201 constructs it,
    // including its id scheme and its day count — both are findings below.
    const request = {
      id: `lr-${String(requests.length + 1).padStart(3, '0')}`,
      employeeId: person.id,
      type: application.type,
      startDate: application.start,
      endDate: application.end,
      days: calendarDays(application.start, application.end),
      reason: application.reason,
      status: 'Pending',
      appliedOn: application.appliedOn,
      approverId: null,
    };
    app.saveLeaveRequests([request, ...requests]);
    applied.push({ ...request, decide: application.decide });
  });

  // What the manager is told before deciding anything.
  const queueNotification = app.getNotifications(managerProfile).find((n) => n.id === 'n1');
  // The same moment, counted the way LeaveRequestsApprovalsPage counts it:
  // status alone, no viewer.
  const pendingAtQueueTime = app.getLeaveRequests().filter((r) => r.status === 'Pending').length;
  const employeeNotificationIds = app.getNotifications(employeeProfile).map((n) => n.id);

  // The manager actions the queue.
  for (const request of applied) {
    if (!request.decide) continue;
    app.updateLeaveRequestStatus(request.id, request.decide, {
      approverId: manager.id,
      approverName: manager.fullName,
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
    applied: applied.map((r) => ({ id: r.id, employeeId: r.employeeId, days: r.days, decide: r.decide, start: r.startDate, end: r.endDate })),
    requests: finalRequests.map((r) => ({ ...r })),

    visible: {
      manager: [...app.getVisibleEmployeeIds(managerProfile)].sort(),
      employee: [...app.getVisibleEmployeeIds(employeeProfile)].sort(),
      hr: [...app.getVisibleEmployeeIds(hrProfile)].sort(),
    },
    queueNotification: queueNotification ? { ...queueNotification } : null,
    pendingAtQueueTime,
    employeeNotificationIds,

    pendingCount: app.getPendingCount(),
    approvedThisMonth: app.getApprovedThisMonth('2026-06'),
    onLeaveMidMonth: app.getOnLeaveToday('2026-06-16').length,

    entitlements: {
      asha: entitlementsFor(staff[0], '2026-06-30'),
      farid: entitlementsFor(staff[5], '2026-06-30'),
      hari: entitlementsFor(staff[7], '2026-07-31'),
    },

    // The two seed-derived surfaces, observed rather than assumed.
    balanceEmployeeIds: [...app.balanceEmployeeIds],
    seedBalancesForAsha: app.getEmployeeBalances(staff[0].id, finalRequests),

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
    app.updateLeaveRequestStatus(request.id, 'Approved', {
      approverId: manager.id,
      approverName: manager.fullName,
    });
    const after = app.getLeaveRequests().find((r) => r.id === request.id);
    return {
      requestId: request.id,
      employeeId: request.employeeId,
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
      assert.equal(results.get(org.key).pendingCount, 1);
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
    assert.equal(a.pendingCount, b.pendingCount);
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
// 4. Findings — asserted as they behave today, so a fix breaks the assertion
// ---------------------------------------------------------------------------

describe('a month of leave — findings, pinned as current behaviour', () => {
  it('FINDING leave is counted in calendar days, so weekends are deducted', () => {
    // Chitra's 8–19 June block is ten working days across two weekends. The
    // app records twelve, because src/pages/leave/index.tsx:186-188 subtracts
    // two dates. `src/data/holidays.ts` exists and is not consulted either, so
    // a public holiday inside a block is deducted as leave as well.
    const r = northwind();
    const block = r.applied.find((a) => a.start === '2026-06-08');
    assert.equal(block.days, 12, 'recorded as calendar days');
    assert.equal(workingDays(block.start, block.end), 10, 'ten working days in reality');
    assert.notEqual(block.days, workingDays(block.start, block.end));
  });

  it('FINDING "approved this month" counts when it was applied for, not when it is taken', () => {
    // Six approved requests fall in June. getApprovedThisMonth matches on
    // `appliedOn`, so Asha's 1–2 June leave — applied for on 28 May — is
    // reported in May's figure and missing from June's.
    const r = northwind();
    const approvedInJune = r.requests.filter(
      (x) => x.status === 'Approved' && x.startDate.startsWith('2026-06'),
    ).length;
    assert.equal(approvedInJune, 6);
    assert.equal(r.approvedThisMonth, 5, 'one approval is filed under the wrong month');
  });

  it('FINDING a new organisation has no seed balances, so two surfaces show nothing', () => {
    // `leaveBalances` is built from a seed array that is empty for any
    // organisation but the demo one (isMockDataCleared). Two consequences:
    //
    //   balanceEmployeeIds  drives the Leave page's Balances tab for HR and
    //                       managers (src/pages/leave/index.tsx:321) — so it
    //                       lists nobody, for ever, however many people the
    //                       organisation has.
    //   getEmployeeBalances backs the dashboard's own-balance card
    //                       (src/pages/dashboard/index.tsx:119) and the
    //                       employee detail page — so both render empty.
    //
    // The entitlement engine computes the right figures for the same people
    // (asserted above); nothing routes them to these two surfaces.
    const r = northwind();
    assert.deepEqual(r.balanceEmployeeIds, [], 'no employee has a seed balance row');
    assert.deepEqual(r.seedBalancesForAsha, [], 'though her entitlement is computed correctly');
    assert.ok(r.entitlements.asha.length > 0, 'the entitlement engine does know about her');
  });

  it('FINDING the manager is notified about 7 requests and sent to a page listing 8', () => {
    // The notification counts what dataScope says is theirs
    // (src/data/notifications.ts:61). The page it links to,
    // LeaveRequestsApprovalsPage, imports no scoping at all — it filters on
    // `status === 'Pending'` and nothing else — so it lists every request in
    // the organisation, Hari's included, and offers Approve on each.
    const r = northwind();
    assert.equal(r.queueNotification.count, 7, 'the notification counts their own line');
    assert.equal(r.pendingAtQueueTime, 8, 'the page it links to counts the organisation');
    assert.notEqual(
      r.queueNotification.count, r.pendingAtQueueTime,
      'they disagree by exactly the out-of-line request',
    );

    // And at month end the divergence is total: the only request left is one
    // this manager is not supposed to see, so the badge reads zero while the
    // page reads one.
    const pendingAtMonthEnd = r.requests.filter((x) => x.status === 'Pending');
    const minePendingAtMonthEnd = pendingAtMonthEnd.filter(
      (x) => r.visible.manager.includes(x.employeeId),
    );
    assert.equal(pendingAtMonthEnd.length, 1);
    assert.equal(minePendingAtMonthEnd.length, 0);
  });

  it('FINDING nothing stops a manager approving leave outside their reporting line', () => {
    // updateLeaveRequestStatus takes a request id and an approver and applies
    // no visibility check (src/data/leave.ts:259). Hari reports to HR, is
    // absent from this manager's scope — and the manager's approval lands
    // anyway, stamped with their name.
    const r = northwind();
    assert.equal(r.visible.manager.includes(r.outOfLine.employeeId), false);
    assert.equal(r.outOfLine.statusAfter, 'Approved');
    assert.equal(r.outOfLine.approverIdAfter, r.ids.manager);
  });

  it('FINDING the organisation-wide pending count is reported to whoever asks', () => {
    // getPendingCount() takes no viewer and applies no dataScope filter, so
    // every surface built on it reports the whole organisation's queue
    // regardless of who is looking.
    assert.equal(northwind().pendingCount, 1, 'Hari\'s, which this manager cannot see');
  });

  it('FINDING request ids are derived from the list length, so they can collide', () => {
    // `lr-${requests.length + 1}` (src/pages/leave/index.tsx:187). Ids are
    // unique across this month only because nothing was ever deleted. Remove
    // one request and the next application reuses a live id — and
    // updateLeaveRequestStatus maps over every match, so one decision would
    // change two requests.
    const r = northwind();
    const ids = r.requests.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, 'unique today');

    const afterDeletion = r.requests.filter((x) => x.id !== 'lr-004');
    const nextId = `lr-${String(afterDeletion.length + 1).padStart(3, '0')}`;
    assert.ok(
      afterDeletion.some((x) => x.id === nextId),
      `the next id issued would be ${nextId}, which is already in use`,
    );
  });
});
