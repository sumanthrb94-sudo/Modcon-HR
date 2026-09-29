// Lead QA Architect Unit Test Suite for Competitor Features
//
// 1. Bulk Approvals Queue (Keka Benchmark)
// 2. 48-Hour SLA Aging & Auto-Escalation Warning (Darwinbox Benchmark)
// 3. Take-Home Ratio Breakdown & Integrity (Rippling Benchmark)
//
// Run: npm run test:unit

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Feature 2: SLA aging calculation logic
export function calculateSlaStatus(requestDate: string, requestHour = '09:00:00Z', referenceTimeMs?: number) {
  const reqTime = new Date(`${requestDate}T${requestHour}`).getTime();
  const now = referenceTimeMs ?? Date.now();
  const diffHours = Math.max(0, Math.round((now - reqTime) / (1000 * 60 * 60)));

  if (diffHours < 24) {
    return { tier: 'normal', tone: 'green', label: '< 24h Normal', diffHours };
  } else if (diffHours <= 48) {
    return { tier: 'warning', tone: 'amber', label: `${diffHours}h Warning`, diffHours };
  } else {
    return { tier: 'escalated', tone: 'rose', label: '> 48h Escalated', diffHours };
  }
}

// Feature 3: Take-Home Pay Ratio logic
export function calculateTakeHomeRatio(grossEarnings: number, netPay: number) {
  if (grossEarnings <= 0) {
    return { takeHomePercent: 0, deductionPercent: 0, isValid: true };
  }
  const takeHomePercent = Math.min(100, Math.max(0, Math.round((netPay / grossEarnings) * 100)));
  const deductionPercent = 100 - takeHomePercent;
  return {
    takeHomePercent,
    deductionPercent,
    isValid: takeHomePercent + deductionPercent === 100,
  };
}

// Feature 1: Bulk Approval Queue batch processing logic
export interface MockRegularization {
  id: string;
  employeeId: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  date: string;
}

export function processBulkRegularizations(
  requests: MockRegularization[],
  selectedIds: string[],
  action: 'Approved' | 'Rejected',
  authorizedEmployeeIds: Set<string>,
): { updatedRequests: MockRegularization[]; successCount: number; ignoredCount: number } {
  let successCount = 0;
  let ignoredCount = 0;
  const selectedSet = new Set(selectedIds);

  const updatedRequests = requests.map((req) => {
    if (selectedSet.has(req.id)) {
      if (req.status === 'Pending' && authorizedEmployeeIds.has(req.employeeId)) {
        successCount++;
        return { ...req, status: action };
      } else {
        ignoredCount++;
      }
    }
    return req;
  });

  return { updatedRequests, successCount, ignoredCount };
}

// ---------------------------------------------------------------------------
// TEST CASES
// ---------------------------------------------------------------------------

test('[Competitor Benchmark - Keka] Bulk Approvals Queue batch processing', () => {
  const sampleRequests: MockRegularization[] = [
    { id: 'reg-1', employeeId: 'emp-101', status: 'Pending', date: '2026-09-10' },
    { id: 'reg-2', employeeId: 'emp-102', status: 'Pending', date: '2026-09-11' },
    { id: 'reg-3', employeeId: 'emp-103', status: 'Approved', date: '2026-09-08' }, // already approved
    { id: 'reg-4', employeeId: 'emp-999', status: 'Pending', date: '2026-09-12' }, // unauthorized employee
  ];

  const authorized = new Set(['emp-101', 'emp-102', 'emp-103']);

  // Batch approve reg-1 and reg-2
  const result1 = processBulkRegularizations(
    sampleRequests,
    ['reg-1', 'reg-2'],
    'Approved',
    authorized,
  );
  assert.equal(result1.successCount, 2);
  assert.equal(result1.ignoredCount, 0);
  assert.equal(result1.updatedRequests.find((r) => r.id === 'reg-1')?.status, 'Approved');
  assert.equal(result1.updatedRequests.find((r) => r.id === 'reg-2')?.status, 'Approved');

  // Batch with mixed valid and invalid targets (reg-3 is already resolved, reg-4 is unauthorized)
  const result2 = processBulkRegularizations(
    sampleRequests,
    ['reg-1', 'reg-3', 'reg-4'],
    'Rejected',
    authorized,
  );
  assert.equal(result2.successCount, 1); // only reg-1 qualifies
  assert.equal(result2.ignoredCount, 2); // reg-3 and reg-4 ignored
  assert.equal(result2.updatedRequests.find((r) => r.id === 'reg-1')?.status, 'Rejected');
  assert.equal(result2.updatedRequests.find((r) => r.id === 'reg-3')?.status, 'Approved'); // stays Approved
  assert.equal(result2.updatedRequests.find((r) => r.id === 'reg-4')?.status, 'Pending'); // stays Pending
});

test('[Competitor Benchmark - Darwinbox] 48-Hour SLA Calculation & Escalation Tiers', () => {
  const fixedNow = new Date('2026-09-25T12:00:00Z').getTime();

  // Case 1: Fresh request (5 hours old -> <24h Normal)
  const slaFresh = calculateSlaStatus('2026-09-25', '07:00:00Z', fixedNow);
  assert.equal(slaFresh.tier, 'normal');
  assert.equal(slaFresh.tone, 'green');
  assert.equal(slaFresh.diffHours, 5);

  // Case 2: 30 hours old -> Warning (24-48h)
  const slaWarning = calculateSlaStatus('2026-09-24', '06:00:00Z', fixedNow);
  assert.equal(slaWarning.tier, 'warning');
  assert.equal(slaWarning.tone, 'amber');
  assert.equal(slaWarning.diffHours, 30);
  assert.equal(slaWarning.label, '30h Warning');

  // Case 3: 72 hours old -> Escalated (>48h)
  const slaBreached = calculateSlaStatus('2026-09-22', '12:00:00Z', fixedNow);
  assert.equal(slaBreached.tier, 'escalated');
  assert.equal(slaBreached.tone, 'rose');
  assert.equal(slaBreached.diffHours, 72);
  assert.equal(slaBreached.label, '> 48h Escalated');
});

test('[Competitor Benchmark - Rippling] Interactive Take-Home Ratio Breakdown', () => {
  // Standard Indian salary structure: CTC ₹1,00,000, Gross ₹1,00,000, Deductions ₹15,000, Net ₹85,000
  const ratio1 = calculateTakeHomeRatio(100000, 85000);
  assert.equal(ratio1.takeHomePercent, 85);
  assert.equal(ratio1.deductionPercent, 15);
  assert.equal(ratio1.isValid, true);

  // High deduction bracket: Gross ₹50,000, Net ₹36,500
  const ratio2 = calculateTakeHomeRatio(50000, 36500);
  assert.equal(ratio2.takeHomePercent, 73);
  assert.equal(ratio2.deductionPercent, 27);
  assert.equal(ratio2.isValid, true);

  // Zero gross safe handling (avoids NaN division)
  const ratioZero = calculateTakeHomeRatio(0, 0);
  assert.equal(ratioZero.takeHomePercent, 0);
  assert.equal(ratioZero.deductionPercent, 0);
  assert.equal(ratioZero.isValid, true);
});
