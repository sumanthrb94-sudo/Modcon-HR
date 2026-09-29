// ===========================================================================
// Lead QA Architect Unit Tests: Cozy Daily Briefing & Team Leave Overlap
// ===========================================================================
// Covers:
// 1. Team Leave Overlap Detection & Cross-Department Isolation (BambooHR/Keka benchmark)
// 2. Overlap Days Calculation & Boundary Conditions
// 3. Intelligent Time-of-Day Greeting & Persona Defaults (HiBob benchmark)
//
// Run: npm run test:unit
// ===========================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Core logic for team leave overlap isolation
export interface MockColleague {
  id: string;
  name: string;
  department: string;
}

export interface MockLeave {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  status: 'Approved' | 'Pending' | 'Rejected';
  type: string;
}

export function detectTeamLeaveOverlaps(
  applicantId: string,
  applicantDept: string,
  startDate: string,
  endDate: string,
  colleagues: MockColleague[],
  allLeaves: MockLeave[],
) {
  if (!startDate || !endDate || startDate > endDate || !applicantDept) return [];

  const peerIdsInDept = new Set(
    colleagues
      .filter((c) => c.department === applicantDept && c.id !== applicantId)
      .map((c) => c.id),
  );

  const overlaps = [];

  for (const leave of allLeaves) {
    if (!peerIdsInDept.has(leave.employeeId)) continue;
    if (leave.status !== 'Approved' && leave.status !== 'Pending') continue;

    // Overlap: leave starts on or before application end AND ends on or after application start
    if (leave.startDate <= endDate && leave.endDate >= startDate) {
      const peer = colleagues.find((c) => c.id === leave.employeeId);
      const maxStart = leave.startDate > startDate ? leave.startDate : startDate;
      const minEnd = leave.endDate < endDate ? leave.endDate : endDate;
      const msDiff = new Date(minEnd).getTime() - new Date(maxStart).getTime();
      const overlapDays = Math.max(1, Math.round(msDiff / (1000 * 60 * 60 * 24)) + 1);

      overlaps.push({
        leaveId: leave.id,
        employeeName: peer?.name ?? 'Colleague',
        department: applicantDept,
        type: leave.type,
        overlapDays,
      });
    }
  }

  return overlaps;
}

// Time-of-day greeting resolver
export function resolveCozyGreeting(hour: number, name = 'there') {
  if (hour < 12) {
    return { text: `Good morning, ${name}`, period: 'morning' };
  } else if (hour < 17) {
    return { text: `Good afternoon, ${name}`, period: 'afternoon' };
  } else {
    return { text: `Good evening, ${name}`, period: 'evening' };
  }
}

// ---------------------------------------------------------------------------
// TEST CASES
// ---------------------------------------------------------------------------

test('[Team Overlap - Overlap Detection] identifies colleagues on leave during same window', () => {
  const colleagues: MockColleague[] = [
    { id: 'emp-1', name: 'Karthik Reddy', department: 'Engineering' },
    { id: 'emp-2', name: 'Meera Iyer', department: 'Engineering' },
    { id: 'emp-3', name: 'Rahul Mehta', department: 'Finance' },
  ];

  const leaves: MockLeave[] = [
    { id: 'l-1', employeeId: 'emp-2', startDate: '2026-09-10', endDate: '2026-09-12', status: 'Approved', type: 'Casual' },
    { id: 'l-2', employeeId: 'emp-3', startDate: '2026-09-11', endDate: '2026-09-15', status: 'Approved', type: 'Sick' },
  ];

  // emp-1 in Engineering applies for Sep 11 to Sep 13
  const overlaps = detectTeamLeaveOverlaps(
    'emp-1',
    'Engineering',
    '2026-09-11',
    '2026-09-13',
    colleagues,
    leaves,
  );

  // emp-2 overlaps (Sep 11 to Sep 12 = 2 days overlap)
  assert.equal(overlaps.length, 1);
  assert.equal(overlaps[0].employeeName, 'Meera Iyer');
  assert.equal(overlaps[0].department, 'Engineering');
  assert.equal(overlaps[0].overlapDays, 2);

  // emp-3 from Finance is NOT included (department isolation)
  assert.equal(overlaps.some((o) => o.employeeName === 'Rahul Mehta'), false);
});

test('[Team Overlap - Department Isolation] ignores leaves in other departments', () => {
  const colleagues: MockColleague[] = [
    { id: 'emp-10', name: 'Priya Nair', department: 'HR' },
    { id: 'emp-20', name: 'Sanjay Kumar', department: 'Design' },
  ];

  const leaves: MockLeave[] = [
    { id: 'l-20', employeeId: 'emp-20', startDate: '2026-09-01', endDate: '2026-09-05', status: 'Approved', type: 'Casual' },
  ];

  const overlaps = detectTeamLeaveOverlaps(
    'emp-10',
    'HR',
    '2026-09-01',
    '2026-09-05',
    colleagues,
    leaves,
  );

  assert.equal(overlaps.length, 0); // HR has no overlapping colleagues
});

test('[Team Overlap - Boundary Conditions] single-day overlap on edge dates', () => {
  const colleagues: MockColleague[] = [
    { id: 'emp-1', name: 'Karthik', department: 'Engineering' },
    { id: 'emp-2', name: 'Meera', department: 'Engineering' },
  ];

  const leaves: MockLeave[] = [
    { id: 'l-1', employeeId: 'emp-2', startDate: '2026-09-15', endDate: '2026-09-18', status: 'Pending', type: 'Earned' },
  ];

  // Starts exactly on the day colleague's leave ends (Sep 18)
  const edgeOverlap = detectTeamLeaveOverlaps(
    'emp-1',
    'Engineering',
    '2026-09-18',
    '2026-09-20',
    colleagues,
    leaves,
  );

  assert.equal(edgeOverlap.length, 1);
  assert.equal(edgeOverlap[0].overlapDays, 1);

  // Outside colleague window (Sep 19 to Sep 22)
  const noOverlap = detectTeamLeaveOverlaps(
    'emp-1',
    'Engineering',
    '2026-09-19',
    '2026-09-22',
    colleagues,
    leaves,
  );
  assert.equal(noOverlap.length, 0);
});

test('[Cozy Greeting - Time of Day] accurately selects morning, afternoon, and evening', () => {
  // Morning (hour < 12)
  const morning = resolveCozyGreeting(9, 'Karthik');
  assert.equal(morning.period, 'morning');
  assert.equal(morning.text, 'Good morning, Karthik');

  // Afternoon (12 <= hour < 17)
  const afternoon = resolveCozyGreeting(14, 'Meera');
  assert.equal(afternoon.period, 'afternoon');
  assert.equal(afternoon.text, 'Good afternoon, Meera');

  // Evening (hour >= 17)
  const evening = resolveCozyGreeting(19, 'Rahul');
  assert.equal(evening.period, 'evening');
  assert.equal(evening.text, 'Good evening, Rahul');
});
