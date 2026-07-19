import type { Goal, GoalStatus, PerformanceReview, ReviewStatus } from '@/types';

const GOALS_STORAGE_KEY = 'modcon.hr.goals';
export const GOALS_CHANGED_EVENT = 'modcon-hr-goals-changed';

const REVIEWS_STORAGE_KEY = 'modcon.hr.reviews';
export const REVIEWS_CHANGED_EVENT = 'modcon-hr-reviews-changed';

export const goals: Goal[] = [
  // Engineering
  {
    id: 'goal-001',
    employeeId: 'emp-002',
    title: 'Migrate monolith to microservices architecture',
    category: 'Technical',
    cycle: 'H2 2026',
    progress: 72,
    status: 'On Track',
    dueDate: '2026-09-30',
    weight: 30,
    reviewer: 'Aarav Sharma',
  },
  {
    id: 'goal-002',
    employeeId: 'emp-007',
    title: 'Reduce system downtime to < 0.1% monthly',
    category: 'Technical',
    cycle: 'H2 2026',
    progress: 85,
    status: 'On Track',
    dueDate: '2026-12-31',
    weight: 25,
    reviewer: 'Diya Mehta',
  },
  {
    id: 'goal-003',
    employeeId: 'emp-008',
    title: 'Ship 3 major feature releases in H1 2026',
    category: 'Business',
    cycle: 'H1 2026',
    progress: 67,
    status: 'On Track',
    dueDate: '2026-06-30',
    weight: 35,
    reviewer: 'Diya Mehta',
  },
  {
    id: 'goal-004',
    employeeId: 'emp-011',
    title: 'Complete AWS Solutions Architect certification',
    category: 'Personal Growth',
    cycle: 'H1 2026',
    progress: 45,
    status: 'At Risk',
    dueDate: '2026-06-15',
    weight: 15,
    reviewer: 'Karthik Subramaniam',
  },
  {
    id: 'goal-005',
    employeeId: 'emp-010',
    title: 'Improve code review turnaround to < 24 hrs',
    category: 'Technical',
    cycle: 'H1 2026',
    progress: 90,
    status: 'Completed',
    dueDate: '2026-03-31',
    weight: 20,
    reviewer: 'Karthik Subramaniam',
  },
  // Product
  {
    id: 'goal-006',
    employeeId: 'emp-017',
    title: 'Define and launch Q2 product roadmap',
    category: 'Business',
    cycle: 'H1 2026',
    progress: 100,
    status: 'Completed',
    dueDate: '2026-04-15',
    weight: 40,
    reviewer: 'Rohan Iyer',
  },
  {
    id: 'goal-007',
    employeeId: 'emp-018',
    title: 'Increase NPS score from 32 to 45',
    category: 'Business',
    cycle: 'H2 2026',
    progress: 55,
    status: 'At Risk',
    dueDate: '2026-12-31',
    weight: 30,
    reviewer: 'Rohan Iyer',
  },
  {
    id: 'goal-008',
    employeeId: 'emp-019',
    title: 'Build and ship new design system v2',
    category: 'Technical',
    cycle: 'H2 2026',
    progress: 38,
    status: 'Behind',
    dueDate: '2026-07-31',
    weight: 35,
    reviewer: 'Rohan Iyer',
  },
  // Sales
  {
    id: 'goal-009',
    employeeId: 'emp-005',
    title: 'Close ₹8 Cr ARR in H1 2026',
    category: 'Business',
    cycle: 'H1 2026',
    progress: 61,
    status: 'On Track',
    dueDate: '2026-06-30',
    weight: 50,
    reviewer: 'Vikram Nair',
  },
  {
    id: 'goal-010',
    employeeId: 'emp-022',
    title: 'Onboard 15 new enterprise accounts',
    category: 'Business',
    cycle: 'H2 2026',
    progress: 53,
    status: 'On Track',
    dueDate: '2026-09-30',
    weight: 40,
    reviewer: 'Vikram Nair',
  },
  {
    id: 'goal-011',
    employeeId: 'emp-023',
    title: 'Expand into 2 new verticals (BFSI & Healthcare)',
    category: 'Business',
    cycle: 'H2 2026',
    progress: 20,
    status: 'Behind',
    dueDate: '2026-12-31',
    weight: 35,
    reviewer: 'Sanjay Malhotra',
  },
  // HR
  {
    id: 'goal-012',
    employeeId: 'emp-004',
    title: 'Reduce voluntary attrition to < 8%',
    category: 'Business',
    cycle: 'H2 2026',
    progress: 78,
    status: 'On Track',
    dueDate: '2026-12-31',
    weight: 30,
    reviewer: 'Aarav Sharma',
  },
  {
    id: 'goal-013',
    employeeId: 'emp-033',
    title: 'Complete SHRM-CP professional certification',
    category: 'Personal Growth',
    cycle: 'H2 2026',
    progress: 60,
    status: 'On Track',
    dueDate: '2026-08-31',
    weight: 20,
    reviewer: 'Ananya Reddy',
  },
  // Marketing
  {
    id: 'goal-014',
    employeeId: 'emp-027',
    title: 'Generate 500 qualified inbound leads per month',
    category: 'Business',
    cycle: 'H2 2026',
    progress: 42,
    status: 'At Risk',
    dueDate: '2026-12-31',
    weight: 40,
    reviewer: 'Aarav Sharma',
  },
  // Finance
  {
    id: 'goal-015',
    employeeId: 'emp-006',
    title: 'Implement new FP&A reporting framework',
    category: 'Technical',
    cycle: 'H1 2026',
    progress: 95,
    status: 'Completed',
    dueDate: '2026-05-31',
    weight: 25,
    reviewer: 'Priya Kapoor',
  },
  {
    id: 'goal-016',
    employeeId: 'emp-037',
    title: 'Automate monthly payroll reconciliation',
    category: 'Technical',
    cycle: 'H2 2026',
    progress: 30,
    status: 'Behind',
    dueDate: '2026-07-31',
    weight: 30,
    reviewer: 'Priya Kapoor',
  },
  // Leadership
  {
    id: 'goal-017',
    employeeId: 'emp-001',
    title: 'Raise Series B funding round by Q3 2026',
    category: 'Business',
    cycle: 'H2 2026',
    progress: 50,
    status: 'On Track',
    dueDate: '2026-09-30',
    weight: 50,
    reviewer: 'Aarav Sharma',
  },
  {
    id: 'goal-018',
    employeeId: 'emp-002',
    title: 'Mentor 3 engineers to Senior role by year-end',
    category: 'Personal Growth',
    cycle: 'H2 2026',
    progress: 66,
    status: 'On Track',
    dueDate: '2026-12-31',
    weight: 20,
    reviewer: 'Diya Mehta',
  },
];

export const reviews: PerformanceReview[] = [
  {
    id: 'rev-001',
    employeeId: 'emp-008',
    employeeName: 'Karthik Subramaniam',
    cycle: 'H1 2026',
    reviewer: 'Diya Mehta',
    status: 'Completed',
    rating: 4,
    dueDate: '2026-06-30',
  },
  {
    id: 'rev-002',
    employeeId: 'emp-009',
    employeeName: 'Sneha Patil',
    cycle: 'H1 2026',
    reviewer: 'Karthik Subramaniam',
    status: 'Manager Review',
    rating: null,
    dueDate: '2026-06-30',
  },
  {
    id: 'rev-003',
    employeeId: 'emp-010',
    employeeName: 'Arjun Verma',
    cycle: 'H1 2026',
    reviewer: 'Karthik Subramaniam',
    status: 'Self Review',
    rating: null,
    dueDate: '2026-06-30',
  },
  {
    id: 'rev-004',
    employeeId: 'emp-017',
    employeeName: 'Nisha Bhatt',
    cycle: 'H1 2026',
    reviewer: 'Rohan Iyer',
    status: 'Completed',
    rating: 5,
    dueDate: '2026-06-30',
  },
  {
    id: 'rev-005',
    employeeId: 'emp-018',
    employeeName: 'Aditya Rao',
    cycle: 'H1 2026',
    reviewer: 'Rohan Iyer',
    status: 'Calibration',
    rating: 3,
    dueDate: '2026-06-30',
  },
  {
    id: 'rev-006',
    employeeId: 'emp-022',
    employeeName: 'Sanjay Malhotra',
    cycle: 'H1 2026',
    reviewer: 'Vikram Nair',
    status: 'Completed',
    rating: 4,
    dueDate: '2026-06-30',
  },
  {
    id: 'rev-007',
    employeeId: 'emp-023',
    employeeName: 'Pooja Agarwal',
    cycle: 'H1 2026',
    reviewer: 'Sanjay Malhotra',
    status: 'Manager Review',
    rating: null,
    dueDate: '2026-06-30',
  },
  {
    id: 'rev-008',
    employeeId: 'emp-027',
    employeeName: 'Neha Chopra',
    cycle: 'H1 2026',
    reviewer: 'Aarav Sharma',
    status: 'Completed',
    rating: 3,
    dueDate: '2026-06-30',
  },
  {
    id: 'rev-009',
    employeeId: 'emp-033',
    employeeName: 'Ritu Bansal',
    cycle: 'H1 2026',
    reviewer: 'Ananya Reddy',
    status: 'Self Review',
    rating: null,
    dueDate: '2026-06-30',
  },
  {
    id: 'rev-010',
    employeeId: 'emp-004',
    employeeName: 'Ananya Reddy',
    cycle: 'H1 2026',
    reviewer: 'Aarav Sharma',
    status: 'Completed',
    rating: 5,
    dueDate: '2026-06-30',
  },
  {
    id: 'rev-011',
    employeeId: 'emp-037',
    employeeName: 'Manish Goyal',
    cycle: 'H1 2026',
    reviewer: 'Priya Kapoor',
    status: 'Not Started',
    rating: null,
    dueDate: '2026-06-30',
  },
  {
    id: 'rev-012',
    employeeId: 'emp-038',
    employeeName: 'Divya Pandey',
    cycle: 'H1 2026',
    reviewer: 'Priya Kapoor',
    status: 'Not Started',
    rating: null,
    dueDate: '2026-06-30',
  },
  {
    id: 'rev-013',
    employeeId: 'emp-002',
    employeeName: 'Diya Mehta',
    cycle: 'H1 2026',
    reviewer: 'Aarav Sharma',
    status: 'Completed',
    rating: 4,
    dueDate: '2026-06-30',
  },
  {
    id: 'rev-014',
    employeeId: 'emp-019',
    employeeName: 'Kavya Menon',
    cycle: 'H1 2026',
    reviewer: 'Rohan Iyer',
    status: 'Calibration',
    rating: 4,
    dueDate: '2026-06-30',
  },
];

// ---- Storage & Event Persistence ----

function readStoredGoals(): Goal[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(GOALS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Goal[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredGoals(items: Goal[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(items));
}

function notifyGoalsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(GOALS_CHANGED_EVENT));
}

function readStoredReviews(): PerformanceReview[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(REVIEWS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PerformanceReview[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredReviews(items: PerformanceReview[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(items));
}

function notifyReviewsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(REVIEWS_CHANGED_EVENT));
}

// ---- Getters ----

export function getGoals(): Goal[] {
  return readStoredGoals() ?? goals;
}

export function saveGoals(items: Goal[]) {
  writeStoredGoals(items);
  notifyGoalsChanged();
}

// Calculate recommended status based on progress and due date
function getRecommendedStatus(goal: Goal): GoalStatus {
  const { progress, dueDate } = goal;
  
  // If goal is completed
  if (progress >= 100) {
    return 'Completed';
  }
  
  // Calculate expected progress based on timeline
  const now = new Date();
  const due = new Date(dueDate);
  const goalCreated = new Date('2026-01-01'); // Assume goals start at beginning of year
  
  const totalTime = due.getTime() - goalCreated.getTime();
  const elapsedTime = now.getTime() - goalCreated.getTime();
  
  // If we're past the due date
  if (now > due) {
    return progress >= 90 ? 'Completed' : 'Behind';
  }
  
  // Calculate expected progress ratio
  const timeProgress = Math.min(1, elapsedTime / totalTime);
  const expectedProgress = timeProgress * 100;
  
  // Calculate variance between actual and expected
  const variance = progress - expectedProgress;
  
  // Determine status based on variance
  if (variance >= -5) {
    return 'On Track';
  } else if (variance >= -15) {
    return 'At Risk';
  } else {
    return 'Behind';
  }
}

export function updateGoalProgress(goalId: string, progress: number) {
  const goals = getGoals();
  const clamped = Math.min(100, Math.max(0, progress));
  const updated = goals.map((g) => {
    if (g.id === goalId) {
      const newGoal = { ...g, progress: clamped };
      // Auto-update status based on new progress
      newGoal.status = getRecommendedStatus(newGoal);
      return newGoal;
    }
    return g;
  });
  saveGoals(updated);
  return updated;
}

export function updateGoalStatus(goalId: string, status: GoalStatus) {
  const updated = getGoals().map((g) => (g.id === goalId ? { ...g, status } : g));
  saveGoals(updated);
  return updated;
}

export function getReviews(): PerformanceReview[] {
  return readStoredReviews() ?? reviews;
}

export function saveReviews(items: PerformanceReview[]) {
  writeStoredReviews(items);
  notifyReviewsChanged();
}

export function updateReviewStatus(reviewId: string, status: ReviewStatus) {
  const updated = getReviews().map((r) => (r.id === reviewId ? { ...r, status } : r));
  saveReviews(updated);
  return updated;
}

export function updateReviewRating(reviewId: string, rating: number | null) {
  const updated = getReviews().map((r) => (r.id === reviewId ? { ...r, rating } : r));
  saveReviews(updated);
  return updated;
}

export function updateReviewCycleByEmployee(employeeId: string, cycle: string) {
  const updated = getReviews().map((r) => (r.employeeId === employeeId ? { ...r, cycle } : r));
  saveReviews(updated);
  return updated;
}

export function updateReviewerByEmployee(employeeId: string, reviewer: string) {
  const updated = getReviews().map((r) => (r.employeeId === employeeId ? { ...r, reviewer } : r));
  saveReviews(updated);
  return updated;
}

// ---- Insights ----

export function ratingDistribution(reviewList?: PerformanceReview[]): { rating: string; count: number }[] {
  const list = reviewList ?? reviews;
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  list.forEach((r) => {
    if (r.rating !== null) counts[r.rating]++;
  });
  return [1, 2, 3, 4, 5].map((r) => ({ rating: `${r} Star${r > 1 ? 's' : ''}`, count: counts[r] }));
}
