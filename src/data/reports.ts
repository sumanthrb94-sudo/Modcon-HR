// ===========================================================================
// ModCon HR — Reports & Analytics data layer
// Derived from employees + mock time-series data.
// ===========================================================================

import { employees } from './employees';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TODAY = new Date('2026-06-10');

function yearsFromDOJ(doj: string): number {
  const d = new Date(doj);
  const ms = TODAY.getTime() - d.getTime();
  return ms / (1000 * 60 * 60 * 24 * 365.25);
}

// ---------------------------------------------------------------------------
// Headcount by department
// ---------------------------------------------------------------------------
export function headcountByDepartment(): { department: string; count: number }[] {
  const map: Record<string, number> = {};
  employees.forEach((e) => {
    map[e.department] = (map[e.department] ?? 0) + 1;
  });
  return Object.entries(map)
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Gender diversity
// ---------------------------------------------------------------------------
export function genderDiversity(): { name: string; value: number }[] {
  const map: Record<string, number> = {};
  employees.forEach((e) => {
    map[e.gender] = (map[e.gender] ?? 0) + 1;
  });
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

// ---------------------------------------------------------------------------
// Tenure distribution
// ---------------------------------------------------------------------------
export function tenureDistribution(): { bucket: string; count: number }[] {
  const buckets = { '<1 yr': 0, '1–2 yrs': 0, '2–3 yrs': 0, '3+ yrs': 0 };
  employees.forEach((e) => {
    const yr = yearsFromDOJ(e.dateOfJoining);
    if (yr < 1) buckets['<1 yr']++;
    else if (yr < 2) buckets['1–2 yrs']++;
    else if (yr < 3) buckets['2–3 yrs']++;
    else buckets['3+ yrs']++;
  });
  return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
}

// ---------------------------------------------------------------------------
// 12-month attrition trend (mock)
// ---------------------------------------------------------------------------
export const attritionTrend: { month: string; attrition: number }[] = [
  { month: 'Jul 25', attrition: 2.1 },
  { month: 'Aug 25', attrition: 1.8 },
  { month: 'Sep 25', attrition: 3.2 },
  { month: 'Oct 25', attrition: 2.5 },
  { month: 'Nov 25', attrition: 2.0 },
  { month: 'Dec 25', attrition: 1.5 },
  { month: 'Jan 26', attrition: 2.8 },
  { month: 'Feb 26', attrition: 3.5 },
  { month: 'Mar 26', attrition: 2.2 },
  { month: 'Apr 26', attrition: 1.9 },
  { month: 'May 26', attrition: 2.4 },
  { month: 'Jun 26', attrition: 2.1 },
];

// ---------------------------------------------------------------------------
// 12-month headcount growth (mock, seeded from real count)
// ---------------------------------------------------------------------------
const currentCount = employees.length;
export const headcountGrowth: { month: string; headcount: number }[] = [
  { month: 'Jul 25', headcount: currentCount - 11 },
  { month: 'Aug 25', headcount: currentCount - 9 },
  { month: 'Sep 25', headcount: currentCount - 8 },
  { month: 'Oct 25', headcount: currentCount - 7 },
  { month: 'Nov 25', headcount: currentCount - 6 },
  { month: 'Dec 25', headcount: currentCount - 5 },
  { month: 'Jan 26', headcount: currentCount - 4 },
  { month: 'Feb 26', headcount: currentCount - 3 },
  { month: 'Mar 26', headcount: currentCount - 3 },
  { month: 'Apr 26', headcount: currentCount - 2 },
  { month: 'May 26', headcount: currentCount - 1 },
  { month: 'Jun 26', headcount: currentCount },
];

// ---------------------------------------------------------------------------
// Salary cost by department (monthly)
// ---------------------------------------------------------------------------
export function salaryByDepartment(): { department: string; cost: number }[] {
  const map: Record<string, number> = {};
  employees.forEach((e) => {
    map[e.department] = (map[e.department] ?? 0) + Math.round(e.ctc / 12);
  });
  return Object.entries(map)
    .map(([department, cost]) => ({ department, cost }))
    .sort((a, b) => b.cost - a.cost);
}

// ---------------------------------------------------------------------------
// Hiring funnel (mock)
// ---------------------------------------------------------------------------
export const hiringFunnel: { stage: string; count: number }[] = [
  { stage: 'Applied', count: 312 },
  { stage: 'Screening', count: 124 },
  { stage: 'Interview', count: 68 },
  { stage: 'Offer', count: 22 },
  { stage: 'Hired', count: 15 },
];

// ---------------------------------------------------------------------------
// Attendance rate — weekly mock
// ---------------------------------------------------------------------------
export const attendanceTrend: { period: string; rate: number }[] = [
  { period: 'W1 May', rate: 92.4 },
  { period: 'W2 May', rate: 89.7 },
  { period: 'W3 May', rate: 94.1 },
  { period: 'W4 May', rate: 91.8 },
  { period: 'W1 Jun', rate: 93.5 },
  { period: 'W2 Jun', rate: 90.2 },
];

// ---------------------------------------------------------------------------
// Employment type split
// ---------------------------------------------------------------------------
export function employmentTypeSplit(): { name: string; value: number }[] {
  const map: Record<string, number> = {};
  employees.forEach((e) => {
    map[e.employmentType] = (map[e.employmentType] ?? 0) + 1;
  });
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

// ---------------------------------------------------------------------------
// Derived KPIs
// ---------------------------------------------------------------------------
export function totalHeadcount(): number {
  return employees.length;
}

export function activeHeadcount(): number {
  return employees.filter((e) => e.status === 'Active').length;
}

export function avgTenureYears(): number {
  const sum = employees.reduce((acc, e) => acc + yearsFromDOJ(e.dateOfJoining), 0);
  return Math.round((sum / employees.length) * 10) / 10;
}

export function totalAnnualPayroll(): number {
  return employees.reduce((acc, e) => acc + e.ctc, 0);
}

export function diversityRatio(): number {
  const female = employees.filter((e) => e.gender === 'Female').length;
  return Math.round((female / employees.length) * 100);
}

export function currentAttritionRate(): number {
  return attritionTrend[attritionTrend.length - 1].attrition;
}
