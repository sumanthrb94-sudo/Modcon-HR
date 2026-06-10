import type { LeaveRequest, LeaveBalance, LeaveType } from '@/types';

// ---- Leave Requests ---------------------------------------------------------
export const leaveRequests: LeaveRequest[] = [
  {
    id: 'lr-001',
    employeeId: 'emp-009',
    type: 'Casual',
    startDate: '2026-06-08',
    endDate: '2026-06-10',
    days: 3,
    reason: 'Personal family function — attending sister\'s wedding in hometown.',
    status: 'Approved',
    appliedOn: '2026-06-01',
    approverId: 'emp-010',
    approverName: 'Karthik Subramaniam',
  },
  {
    id: 'lr-002',
    employeeId: 'emp-013',
    type: 'Sick',
    startDate: '2026-06-08',
    endDate: '2026-06-12',
    days: 5,
    reason: 'Recovering from dengue fever — doctor advised complete rest.',
    status: 'Approved',
    appliedOn: '2026-06-07',
    approverId: 'emp-010',
    approverName: 'Karthik Subramaniam',
  },
  {
    id: 'lr-003',
    employeeId: 'emp-028',
    type: 'Earned',
    startDate: '2026-06-10',
    endDate: '2026-06-11',
    days: 2,
    reason: 'Planned vacation to Coorg with family.',
    status: 'Approved',
    appliedOn: '2026-06-02',
    approverId: 'emp-004',
    approverName: 'Ananya Reddy',
  },
  {
    id: 'lr-004',
    employeeId: 'emp-005',
    type: 'Casual',
    startDate: '2026-06-08',
    endDate: '2026-06-08',
    days: 1,
    reason: 'Personal errand — bank and legal documentation.',
    status: 'Approved',
    appliedOn: '2026-06-06',
    approverId: 'emp-001',
    approverName: 'Aarav Sharma',
  },
  {
    id: 'lr-005',
    employeeId: 'emp-035',
    type: 'Sick',
    startDate: '2026-06-10',
    endDate: '2026-06-11',
    days: 2,
    reason: 'Severe migraine attack — unable to attend work.',
    status: 'Pending',
    appliedOn: '2026-06-10',
    approverId: null,
  },
  {
    id: 'lr-006',
    employeeId: 'emp-016',
    type: 'Earned',
    startDate: '2026-06-15',
    endDate: '2026-06-18',
    days: 4,
    reason: 'Annual family trip to Goa.',
    status: 'Pending',
    appliedOn: '2026-06-08',
    approverId: null,
  },
  {
    id: 'lr-007',
    employeeId: 'emp-021',
    type: 'Casual',
    startDate: '2026-06-17',
    endDate: '2026-06-17',
    days: 1,
    reason: 'Child\'s school annual day event.',
    status: 'Pending',
    appliedOn: '2026-06-09',
    approverId: null,
  },
  {
    id: 'lr-008',
    employeeId: 'emp-012',
    type: 'Comp Off',
    startDate: '2026-06-19',
    endDate: '2026-06-19',
    days: 1,
    reason: 'Compensatory off for weekend release support on 31 May.',
    status: 'Pending',
    appliedOn: '2026-06-09',
    approverId: null,
  },
  {
    id: 'lr-009',
    employeeId: 'emp-025',
    type: 'Earned',
    startDate: '2026-06-22',
    endDate: '2026-06-26',
    days: 5,
    reason: 'International travel — Europe backpacking trip.',
    status: 'Pending',
    appliedOn: '2026-06-08',
    approverId: null,
  },
  {
    id: 'lr-010',
    employeeId: 'emp-006',
    type: 'Casual',
    startDate: '2026-06-12',
    endDate: '2026-06-12',
    days: 1,
    reason: 'Attending parent-teacher conference at son\'s school.',
    status: 'Approved',
    appliedOn: '2026-06-10',
    approverId: 'emp-001',
    approverName: 'Aarav Sharma',
  },
  {
    id: 'lr-011',
    employeeId: 'emp-033',
    type: 'Sick',
    startDate: '2026-06-03',
    endDate: '2026-06-04',
    days: 2,
    reason: 'Viral fever with doctor consultation.',
    status: 'Approved',
    appliedOn: '2026-06-03',
    approverId: 'emp-030',
    approverName: 'Sanjay Malhotra',
  },
  {
    id: 'lr-012',
    employeeId: 'emp-014',
    type: 'Casual',
    startDate: '2026-05-28',
    endDate: '2026-05-28',
    days: 1,
    reason: 'Property registration appointment.',
    status: 'Rejected',
    appliedOn: '2026-05-26',
    approverId: 'emp-010',
    approverName: 'Karthik Subramaniam',
  },
  {
    id: 'lr-013',
    employeeId: 'emp-029',
    type: 'Earned',
    startDate: '2026-07-01',
    endDate: '2026-07-05',
    days: 5,
    reason: 'Annual leave — visiting family in Kolkata.',
    status: 'Pending',
    appliedOn: '2026-06-10',
    approverId: null,
  },
  {
    id: 'lr-014',
    employeeId: 'emp-022',
    type: 'Casual',
    startDate: '2026-05-30',
    endDate: '2026-05-30',
    days: 1,
    reason: 'Home renovation work requiring personal presence.',
    status: 'Rejected',
    appliedOn: '2026-05-27',
    approverId: 'emp-003',
    approverName: 'Rohan Iyer',
  },
];

// ---- Leave Balances ---------------------------------------------------------
const LEAVE_TYPES: LeaveType[] = ['Casual', 'Sick', 'Earned'];

interface BalanceSeed {
  empId: string;
  casual: [number, number]; // [total, used]
  sick: [number, number];
  earned: [number, number];
}

const balanceSeeds: BalanceSeed[] = [
  { empId: 'emp-001', casual: [12, 2], sick: [10, 0], earned: [21, 5] },
  { empId: 'emp-002', casual: [12, 3], sick: [10, 1], earned: [21, 7] },
  { empId: 'emp-003', casual: [12, 1], sick: [10, 2], earned: [21, 4] },
  { empId: 'emp-004', casual: [12, 4], sick: [10, 1], earned: [21, 6] },
  { empId: 'emp-005', casual: [12, 5], sick: [10, 0], earned: [21, 8] },
  { empId: 'emp-006', casual: [12, 2], sick: [10, 0], earned: [21, 3] },
  { empId: 'emp-009', casual: [12, 5], sick: [10, 0], earned: [21, 2] },
  { empId: 'emp-010', casual: [12, 1], sick: [10, 0], earned: [21, 4] },
  { empId: 'emp-011', casual: [12, 3], sick: [10, 2], earned: [21, 5] },
  { empId: 'emp-012', casual: [12, 2], sick: [10, 1], earned: [21, 3] },
  { empId: 'emp-013', casual: [12, 0], sick: [10, 7], earned: [21, 0] },
  { empId: 'emp-014', casual: [12, 3], sick: [10, 1], earned: [21, 2] },
  { empId: 'emp-015', casual: [6, 1], sick: [5, 0], earned: [7, 0] },
  { empId: 'emp-016', casual: [12, 2], sick: [10, 0], earned: [21, 6] },
  { empId: 'emp-021', casual: [12, 4], sick: [10, 1], earned: [21, 5] },
  { empId: 'emp-022', casual: [12, 2], sick: [10, 0], earned: [21, 3] },
  { empId: 'emp-025', casual: [12, 1], sick: [10, 0], earned: [21, 7] },
  { empId: 'emp-028', casual: [12, 3], sick: [10, 1], earned: [21, 4] },
  { empId: 'emp-029', casual: [12, 2], sick: [10, 0], earned: [21, 5] },
  { empId: 'emp-033', casual: [12, 3], sick: [10, 3], earned: [21, 4] },
  { empId: 'emp-035', casual: [12, 1], sick: [10, 3], earned: [21, 2] },
];

export const leaveBalances: LeaveBalance[] = balanceSeeds.flatMap((s) => [
  { employeeId: s.empId, type: 'Casual' as LeaveType, total: s.casual[0], used: s.casual[1], available: s.casual[0] - s.casual[1] },
  { employeeId: s.empId, type: 'Sick' as LeaveType, total: s.sick[0], used: s.sick[1], available: s.sick[0] - s.sick[1] },
  { employeeId: s.empId, type: 'Earned' as LeaveType, total: s.earned[0], used: s.earned[1], available: s.earned[0] - s.earned[1] },
]);

// Helper: get balances for a specific employee
export function getEmployeeBalances(employeeId: string): LeaveBalance[] {
  return leaveBalances.filter((b) => b.employeeId === employeeId);
}

// Helper: employees who are on approved leave on a given date
export function getOnLeaveToday(date: string): LeaveRequest[] {
  return leaveRequests.filter(
    (r) => r.status === 'Approved' && r.startDate <= date && r.endDate >= date,
  );
}

// Helper: pending count
export function getPendingCount(): number {
  return leaveRequests.filter((r) => r.status === 'Pending').length;
}

// Helper: approved this month
export function getApprovedThisMonth(month = '2026-06'): number {
  return leaveRequests.filter(
    (r) => r.status === 'Approved' && r.appliedOn.startsWith(month),
  ).length;
}

// All unique employee IDs that have balance data (for the Balances tab)
export const balanceEmployeeIds = Array.from(new Set(leaveBalances.map((b) => b.employeeId)));
