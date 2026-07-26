// ===========================================================================
// ModCon HR — Reports & Analytics data layer
// Derived from employees + mock time-series data.
// ===========================================================================

import { employees, locations } from './employees';
import { getDepartmentDirectory } from './departments';
import { getCandidates } from './recruitment';
import { getReviews } from './performance';
import { getWeekSummary } from './attendance';
import { todayDate } from '@/lib/today';
import { formatWeekdayShort } from '@/lib/utils';
import { headcountTrend, noticePeriodRate, openPositionsCount } from './dashboard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


function yearsFromDOJ(doj: string): number {
  const d = new Date(doj);
  const ms = todayDate().getTime() - d.getTime();
  return ms / (1000 * 60 * 60 * 24 * 365.25);
}

// ---------------------------------------------------------------------------
// Headcount by department
// ---------------------------------------------------------------------------
export function headcountByDepartment(): { department: string; count: number }[] {
  return getDepartmentDirectory()
    .map((department) => ({ department: department.name, count: department.headcount }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Gender diversity
// ---------------------------------------------------------------------------
export function genderDiversity(): { name: string; value: number }[] {
  const map: Record<string, number> = {};
  employees.forEach((e) => {
    // Someone whose gender nobody recorded is not a category — leave them out
    // rather than charting an "undefined" slice.
    if (!e.gender) return;
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
// 12-month headcount growth — real cumulative joiners, shared with the
// dashboard so both surfaces plot the same series.
// ---------------------------------------------------------------------------
export function headcountGrowth(): { month: string; headcount: number }[] {
  return headcountTrend().map((point) => ({ month: point.month, headcount: point.count }));
}

// ---------------------------------------------------------------------------
// Salary cost by department (monthly)
// ---------------------------------------------------------------------------
export function salaryByDepartment(): { department: string; cost: number }[] {
  return getDepartmentDirectory()
    .map((department) => ({
      department: department.name,
      cost: employees
        .filter((employee) => employee.department === department.name)
        .reduce((sum, employee) => sum + Math.round(employee.ctc / 12), 0),
    }))
    .sort((a, b) => b.cost - a.cost);
}

// ---------------------------------------------------------------------------
// Hiring funnel — counted off the real candidate pipeline. 'Rejected' is a
// terminal state rather than a funnel step, so it is not plotted.
// ---------------------------------------------------------------------------
const FUNNEL_STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired'] as const;

export function hiringFunnel(): { stage: string; count: number }[] {
  const list = getCandidates();
  if (!list.length) return [];
  return FUNNEL_STAGES.map((stage) => ({
    stage,
    count: list.filter((candidate) => candidate.stage === stage).length,
  }));
}

// ---------------------------------------------------------------------------
// Attendance rate — per day across the current week. Only one week of
// attendance is recorded, so this is a daily series rather than the
// multi-week history the page used to imply.
// ---------------------------------------------------------------------------
export function attendanceTrend(): { period: string; rate: number }[] {
  return getWeekSummary()
    .map((day) => {
      const marked = day.Present + day['Work From Home'] + day['On Leave'] + day.Absent + day['Half Day'];
      const attended = day.Present + day['Work From Home'] + day['Half Day'];
      return {
        period: formatWeekdayShort(day.date),
        rate: marked ? Math.round((attended / marked) * 1000) / 10 : 0,
        marked,
      };
    })
    .filter((day) => day.marked > 0)
    .map(({ period, rate }) => ({ period, rate }));
}

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
  if (!employees.length) return 0;
  const sum = employees.reduce((acc, e) => acc + yearsFromDOJ(e.dateOfJoining), 0);
  return Math.round((sum / employees.length) * 10) / 10;
}

export function totalAnnualPayroll(): number {
  return employees.reduce((acc, e) => acc + e.ctc, 0);
}

export function diversityRatio(): number {
  if (!employees.length) return 0;
  const female = employees.filter((e) => e.gender === 'Female').length;
  return Math.round((female / employees.length) * 100);
}

/**
 * Share of the workforce currently serving notice. Employee status carries no
 * audit trail, so a historical attrition rate cannot be reconstructed — this
 * is the same point-in-time figure the dashboard reports, not a trend.
 */
export function currentAttritionRate(): number {
  return noticePeriodRate();
}

export function departmentCount(): number {
  return getDepartmentDirectory().length;
}

export function locationCount(): number {
  return locations.length;
}

export function attendanceSummary(): { avgRate: number; wfhPercent: number } {
  const week = getWeekSummary();
  const marked = week.reduce((acc, d) => acc + d.Present + d['Work From Home'] + d['On Leave'] + d.Absent + d['Half Day'], 0);
  if (!marked) return { avgRate: 0, wfhPercent: 0 };
  const attended = week.reduce((acc, d) => acc + d.Present + d['Work From Home'] + d['Half Day'], 0);
  const wfh = week.reduce((acc, d) => acc + d['Work From Home'], 0);
  return {
    avgRate: Math.round((attended / marked) * 1000) / 10,
    wfhPercent: attended ? Math.round((wfh / attended) * 100) : 0,
  };
}

/**
 * Vacancies, not postings — one job opening can carry several seats. Shares
 * openPositionsCount() so Reports, the dashboard and the Recruitment page
 * (which sums `openings` the same way) cannot drift apart.
 */
export function openRolesCount(): number {
  return openPositionsCount();
}

export function avgTimeToHireDays(): number {
  const hired = getCandidates().filter((c) => c.stage === 'Hired');
  if (!hired.length) return 0;
  const totalDays = hired.reduce((acc, c) => acc + (todayDate().getTime() - new Date(c.appliedOn).getTime()) / (1000 * 60 * 60 * 24), 0);
  return Math.round(totalDays / hired.length);
}

export function performanceSummary(): { completedPercent: number; avgRating: number } {
  const list = getReviews();
  if (!list.length) return { completedPercent: 0, avgRating: 0 };
  const completed = list.filter((r) => r.status === 'Completed');
  const rated = completed.filter((r) => typeof r.rating === 'number');
  const avgRating = rated.length ? rated.reduce((acc, r) => acc + (r.rating ?? 0), 0) / rated.length : 0;
  return {
    completedPercent: Math.round((completed.length / list.length) * 100),
    avgRating: Math.round(avgRating * 10) / 10,
  };
}
