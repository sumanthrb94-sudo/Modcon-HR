import type { AttendanceRecord, AttendanceStatus } from '@/types';

// Work week: Mon 2026-06-08 .. Fri 2026-06-12  (today = Wed 2026-06-10)
export const WEEK_DATES = [
  '2026-06-08', // Mon
  '2026-06-09', // Tue
  '2026-06-10', // Wed (today)
  '2026-06-11', // Thu
  '2026-06-12', // Fri
];

// Employee IDs (emp-001 .. emp-035, derived from employees.ts seed order — 35 employees)
const EMP_IDS = [
  'emp-001', 'emp-002', 'emp-003', 'emp-004', 'emp-005', 'emp-006',
  'emp-007', 'emp-008', 'emp-009', 'emp-010', 'emp-011', 'emp-012',
  'emp-013', 'emp-014', 'emp-015', 'emp-016', 'emp-017', 'emp-018',
  'emp-019', 'emp-020', 'emp-021', 'emp-022', 'emp-023', 'emp-024',
  'emp-025', 'emp-026', 'emp-027', 'emp-028', 'emp-029', 'emp-030',
  'emp-031', 'emp-032', 'emp-033', 'emp-034', 'emp-035',
];

// Deterministic per-employee, per-date overrides
type Override = { status: AttendanceStatus; checkIn: string | null; checkOut: string | null; workedHours: number; isLate: boolean };

function override(status: AttendanceStatus, checkIn: string | null, checkOut: string | null, workedHours: number, isLate = false): Override {
  return { status, checkIn, checkOut, workedHours, isLate };
}

const OVERRIDES: Record<string, Record<string, Override>> = {
  'emp-003': {
    '2026-06-09': override('Work From Home', '09:02', '18:10', 9.1),
    '2026-06-10': override('Work From Home', '09:15', '18:00', 8.75),
    '2026-06-11': override('Work From Home', '09:05', '17:55', 8.8),
  },
  'emp-007': {
    '2026-06-08': override('Absent', null, null, 0),
    '2026-06-09': override('Absent', null, null, 0),
  },
  'emp-009': {
    '2026-06-08': override('On Leave', null, null, 0),
    '2026-06-09': override('On Leave', null, null, 0),
    '2026-06-10': override('On Leave', null, null, 0),
  },
  'emp-011': {
    '2026-06-10': override('Half Day', '09:00', '13:30', 4.5),
    '2026-06-11': override('Work From Home', '09:10', '18:05', 8.9),
  },
  'emp-013': {
    '2026-06-08': override('On Leave', null, null, 0),
    '2026-06-09': override('On Leave', null, null, 0),
    '2026-06-10': override('On Leave', null, null, 0),
    '2026-06-11': override('On Leave', null, null, 0),
    '2026-06-12': override('On Leave', null, null, 0),
  },
  'emp-015': {
    '2026-06-08': override('Present', '09:18', '18:00', 8.7, true),
    '2026-06-09': override('Present', '09:22', '18:30', 9.1, true),
    '2026-06-10': override('Present', '09:05', '17:55', 8.8),
  },
  'emp-017': {
    '2026-06-08': override('Work From Home', '08:55', '17:50', 8.9),
    '2026-06-09': override('Work From Home', '09:00', '18:00', 9.0),
    '2026-06-10': override('Work From Home', '09:15', '18:10', 8.9),
    '2026-06-11': override('Work From Home', '09:00', '18:00', 9.0),
    '2026-06-12': override('Work From Home', '09:05', '17:55', 8.8),
  },
  'emp-020': {
    '2026-06-10': override('Present', '09:19', '18:30', 9.1, true),
    '2026-06-11': override('Half Day', '09:00', '13:00', 4.0),
  },
  'emp-022': {
    '2026-06-08': override('Work From Home', '09:00', '18:00', 9.0),
    '2026-06-09': override('Work From Home', '09:05', '18:05', 9.0),
    '2026-06-10': override('Work From Home', '09:00', '18:00', 9.0),
    '2026-06-11': override('Work From Home', '08:55', '17:55', 9.0),
    '2026-06-12': override('Work From Home', '09:10', '18:10', 9.0),
  },
  'emp-025': {
    '2026-06-08': override('Absent', null, null, 0),
    '2026-06-09': override('Present', '09:20', '18:00', 8.6, true),
  },
  'emp-028': {
    '2026-06-10': override('On Leave', null, null, 0),
    '2026-06-11': override('On Leave', null, null, 0),
  },
  'emp-032': {
    '2026-06-08': override('Present', '09:25', '18:00', 8.5, true),
    '2026-06-09': override('Present', '09:17', '18:10', 8.9, true),
    '2026-06-10': override('Present', '09:12', '18:00', 8.8, true),
  },
  'emp-034': {
    '2026-06-08': override('Work From Home', '09:00', '18:00', 9.0),
    '2026-06-09': override('Work From Home', '08:50', '17:50', 9.0),
  },
  'emp-035': {
    '2026-06-10': override('Absent', null, null, 0),
    '2026-06-11': override('Absent', null, null, 0),
  },
};

// Standard check-in/check-out patterns
const STANDARD_CHECKINS = ['08:55', '09:00', '09:02', '09:05', '09:08', '08:58', '09:01', '09:03'];
const STANDARD_CHECKOUTS = ['18:00', '18:05', '18:10', '17:55', '18:15', '18:00', '17:50', '18:20'];
const STANDARD_HOURS = [8.5, 8.7, 8.9, 9.0, 9.1, 8.6, 8.8, 9.2];

function getCheckInOut(empIdx: number, dateIdx: number): { checkIn: string; checkOut: string; workedHours: number } {
  const seed = (empIdx * 7 + dateIdx * 3) % STANDARD_CHECKINS.length;
  return {
    checkIn: STANDARD_CHECKINS[seed],
    checkOut: STANDARD_CHECKOUTS[seed],
    workedHours: STANDARD_HOURS[seed],
  };
}

let recId = 0;
export const attendanceRecords: AttendanceRecord[] = [];

EMP_IDS.forEach((empId, empIdx) => {
  WEEK_DATES.forEach((date, dateIdx) => {
    const ov = OVERRIDES[empId]?.[date];
    if (ov) {
      recId++;
      attendanceRecords.push({
        id: `att-${String(recId).padStart(4, '0')}`,
        employeeId: empId,
        date,
        status: ov.status,
        checkIn: ov.checkIn,
        checkOut: ov.checkOut,
        workedHours: ov.workedHours,
        shift: 'General (09:00 – 18:00)',
        isLate: ov.isLate,
      });
    } else {
      // Default: Present
      recId++;
      const { checkIn, checkOut, workedHours } = getCheckInOut(empIdx, dateIdx);
      attendanceRecords.push({
        id: `att-${String(recId).padStart(4, '0')}`,
        employeeId: empId,
        date,
        status: 'Present',
        checkIn,
        checkOut,
        workedHours,
        shift: 'General (09:00 – 18:00)',
        isLate: false,
      });
    }
  });
});

// ---- Regularization Requests ------------------------------------------------
export interface RegularizationRequest {
  id: string;
  employeeId: string;
  date: string;
  reason: string;
  requestedStatus: AttendanceStatus;
  status: 'Pending' | 'Approved' | 'Rejected';
}

export const regularizationRequests: RegularizationRequest[] = [
  {
    id: 'reg-001',
    employeeId: 'emp-007',
    date: '2026-06-08',
    reason: 'System outage prevented check-in recording, was working from client site.',
    requestedStatus: 'Work From Home',
    status: 'Pending',
  },
  {
    id: 'reg-002',
    employeeId: 'emp-025',
    date: '2026-06-08',
    reason: 'Attended off-site conference, forgot to mark attendance.',
    requestedStatus: 'Present',
    status: 'Pending',
  },
  {
    id: 'reg-003',
    employeeId: 'emp-032',
    date: '2026-06-08',
    reason: 'Biometric device malfunction at entry gate.',
    requestedStatus: 'Present',
    status: 'Approved',
  },
  {
    id: 'reg-004',
    employeeId: 'emp-015',
    date: '2026-06-08',
    reason: 'Late due to metro breakdown, was in office by 09:18.',
    requestedStatus: 'Present',
    status: 'Approved',
  },
  {
    id: 'reg-005',
    employeeId: 'emp-035',
    date: '2026-06-10',
    reason: "Medical emergency — submitted doctor's note.",
    requestedStatus: 'On Leave',
    status: 'Pending',
  },
];

// ---- Aggregate helpers ------------------------------------------------------
export function getRecordsByDate(date: string): AttendanceRecord[] {
  return attendanceRecords.filter((r) => r.date === date);
}

export function getWeekSummary(): Array<{ date: string; Present: number; 'Work From Home': number; 'On Leave': number; Absent: number; 'Half Day': number }> {
  return WEEK_DATES.map((date) => {
    const records = getRecordsByDate(date);
    return {
      date,
      Present: records.filter((r) => r.status === 'Present').length,
      'Work From Home': records.filter((r) => r.status === 'Work From Home').length,
      'On Leave': records.filter((r) => r.status === 'On Leave').length,
      Absent: records.filter((r) => r.status === 'Absent').length,
      'Half Day': records.filter((r) => r.status === 'Half Day').length,
    };
  });
}
