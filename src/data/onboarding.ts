import type { Onboarding, OnboardingTask } from '@/types';

// ---------------------------------------------------------------------------
// Helper — compute progress from tasks
// ---------------------------------------------------------------------------

function computeProgress(tasks: OnboardingTask[]): number {
  if (!tasks.length) return 0;
  const done = tasks.filter((t) => t.status === 'Completed').length;
  return Math.round((done / tasks.length) * 100);
}

// ---------------------------------------------------------------------------
// Standard task template (clone & adjust dates per hire)
// ---------------------------------------------------------------------------

export const standardTaskTemplate: Omit<OnboardingTask, 'id'>[] = [
  // Documentation
  { title: 'Submit signed offer letter', category: 'Documentation', status: 'Pending', dueDate: '', assignee: 'HR Executive' },
  { title: 'Upload ID proofs & address verification', category: 'Documentation', status: 'Pending', dueDate: '', assignee: 'HR Executive' },
  { title: 'Complete background check form', category: 'Documentation', status: 'Pending', dueDate: '', assignee: 'HR Executive' },
  // IT Setup
  { title: 'Provision laptop & accessories', category: 'IT Setup', status: 'Pending', dueDate: '', assignee: 'IT Admin' },
  { title: 'Create corporate email & accounts', category: 'IT Setup', status: 'Pending', dueDate: '', assignee: 'IT Admin' },
  { title: 'Set up VPN & security tools', category: 'IT Setup', status: 'Pending', dueDate: '', assignee: 'IT Admin' },
  // Orientation
  { title: 'Company & culture orientation session', category: 'Orientation', status: 'Pending', dueDate: '', assignee: 'Head of People' },
  { title: 'Team introduction and buddy pairing', category: 'Orientation', status: 'Pending', dueDate: '', assignee: 'Buddy' },
  { title: 'Meet key stakeholders (cross-functional)', category: 'Orientation', status: 'Pending', dueDate: '', assignee: 'Manager' },
  // Compliance
  { title: 'Complete POSH training', category: 'Compliance', status: 'Pending', dueDate: '', assignee: 'HR Business Partner' },
  { title: 'Review and sign Code of Conduct', category: 'Compliance', status: 'Pending', dueDate: '', assignee: 'HR Business Partner' },
  // Training
  { title: 'Product demo & overview walkthrough', category: 'Training', status: 'Pending', dueDate: '', assignee: 'Manager' },
  { title: 'Complete role-specific onboarding module', category: 'Training', status: 'Pending', dueDate: '', assignee: 'Manager' },
  { title: '30-day check-in with manager', category: 'Training', status: 'Pending', dueDate: '', assignee: 'Manager' },
];

// ---------------------------------------------------------------------------
// Onboarding records
// ---------------------------------------------------------------------------

const raw: Omit<Onboarding, 'progress'>[] = [
  {
    id: 'ob-001',
    employeeId: 'emp-015', // Ishaan Gupta — intern already in employees
    employeeName: 'Ishaan Gupta',
    designation: 'Software Engineer Intern',
    department: 'Engineering',
    startDate: '2026-06-16',
    buddy: 'Sneha Patil',
    tasks: [
      { id: 'ob-001-t01', title: 'Submit signed offer letter', category: 'Documentation', status: 'Completed', dueDate: '2026-06-13', assignee: 'HR Executive' },
      { id: 'ob-001-t02', title: 'Upload ID proofs & address verification', category: 'Documentation', status: 'Completed', dueDate: '2026-06-13', assignee: 'HR Executive' },
      { id: 'ob-001-t03', title: 'Complete background check form', category: 'Documentation', status: 'Completed', dueDate: '2026-06-14', assignee: 'HR Executive' },
      { id: 'ob-001-t04', title: 'Provision laptop & accessories', category: 'IT Setup', status: 'Completed', dueDate: '2026-06-15', assignee: 'IT Admin' },
      { id: 'ob-001-t05', title: 'Create corporate email & accounts', category: 'IT Setup', status: 'Completed', dueDate: '2026-06-15', assignee: 'IT Admin' },
      { id: 'ob-001-t06', title: 'Set up VPN & security tools', category: 'IT Setup', status: 'In Progress', dueDate: '2026-06-16', assignee: 'IT Admin' },
      { id: 'ob-001-t07', title: 'Company & culture orientation session', category: 'Orientation', status: 'Pending', dueDate: '2026-06-17', assignee: 'Head of People' },
      { id: 'ob-001-t08', title: 'Team introduction and buddy pairing', category: 'Orientation', status: 'Pending', dueDate: '2026-06-17', assignee: 'Buddy' },
      { id: 'ob-001-t09', title: 'Meet key stakeholders (cross-functional)', category: 'Orientation', status: 'Pending', dueDate: '2026-06-20', assignee: 'Manager' },
      { id: 'ob-001-t10', title: 'Complete POSH training', category: 'Compliance', status: 'Pending', dueDate: '2026-06-23', assignee: 'HR Business Partner' },
      { id: 'ob-001-t11', title: 'Review and sign Code of Conduct', category: 'Compliance', status: 'Pending', dueDate: '2026-06-23', assignee: 'HR Business Partner' },
      { id: 'ob-001-t12', title: 'Product demo & overview walkthrough', category: 'Training', status: 'Pending', dueDate: '2026-06-24', assignee: 'Manager' },
      { id: 'ob-001-t13', title: 'Complete role-specific onboarding module', category: 'Training', status: 'Pending', dueDate: '2026-06-30', assignee: 'Manager' },
      { id: 'ob-001-t14', title: '30-day check-in with manager', category: 'Training', status: 'Pending', dueDate: '2026-07-16', assignee: 'Manager' },
    ],
  },
  {
    id: 'ob-002',
    employeeId: 'emp-new-001',
    employeeName: 'Pooja Sethi',
    designation: 'Product Designer',
    department: 'Design',
    startDate: '2026-06-23',
    buddy: 'Dev Saxena',
    tasks: [
      { id: 'ob-002-t01', title: 'Submit signed offer letter', category: 'Documentation', status: 'Completed', dueDate: '2026-06-19', assignee: 'HR Executive' },
      { id: 'ob-002-t02', title: 'Upload ID proofs & address verification', category: 'Documentation', status: 'Completed', dueDate: '2026-06-19', assignee: 'HR Executive' },
      { id: 'ob-002-t03', title: 'Complete background check form', category: 'Documentation', status: 'Completed', dueDate: '2026-06-20', assignee: 'HR Executive' },
      { id: 'ob-002-t04', title: 'Provision laptop & accessories', category: 'IT Setup', status: 'Completed', dueDate: '2026-06-22', assignee: 'IT Admin' },
      { id: 'ob-002-t05', title: 'Create corporate email & accounts', category: 'IT Setup', status: 'Pending', dueDate: '2026-06-23', assignee: 'IT Admin' },
      { id: 'ob-002-t06', title: 'Set up VPN & security tools', category: 'IT Setup', status: 'Pending', dueDate: '2026-06-23', assignee: 'IT Admin' },
      { id: 'ob-002-t07', title: 'Company & culture orientation session', category: 'Orientation', status: 'Pending', dueDate: '2026-06-24', assignee: 'Head of People' },
      { id: 'ob-002-t08', title: 'Team introduction and buddy pairing', category: 'Orientation', status: 'Pending', dueDate: '2026-06-24', assignee: 'Buddy' },
      { id: 'ob-002-t09', title: 'Meet key stakeholders (cross-functional)', category: 'Orientation', status: 'Pending', dueDate: '2026-06-27', assignee: 'Manager' },
      { id: 'ob-002-t10', title: 'Complete POSH training', category: 'Compliance', status: 'Pending', dueDate: '2026-07-01', assignee: 'HR Business Partner' },
      { id: 'ob-002-t11', title: 'Review and sign Code of Conduct', category: 'Compliance', status: 'Pending', dueDate: '2026-07-01', assignee: 'HR Business Partner' },
      { id: 'ob-002-t12', title: 'Product demo & overview walkthrough', category: 'Training', status: 'Pending', dueDate: '2026-07-02', assignee: 'Manager' },
      { id: 'ob-002-t13', title: 'Complete role-specific onboarding module', category: 'Training', status: 'Pending', dueDate: '2026-07-07', assignee: 'Manager' },
      { id: 'ob-002-t14', title: '30-day check-in with manager', category: 'Training', status: 'Pending', dueDate: '2026-07-23', assignee: 'Manager' },
    ],
  },
  {
    id: 'ob-003',
    employeeId: 'emp-new-002',
    employeeName: 'Vivek Srivastava',
    designation: 'Account Executive – Enterprise',
    department: 'Sales',
    startDate: '2026-06-02',
    buddy: 'Pooja Agarwal',
    tasks: [
      { id: 'ob-003-t01', title: 'Submit signed offer letter', category: 'Documentation', status: 'Completed', dueDate: '2026-05-29', assignee: 'HR Executive' },
      { id: 'ob-003-t02', title: 'Upload ID proofs & address verification', category: 'Documentation', status: 'Completed', dueDate: '2026-05-29', assignee: 'HR Executive' },
      { id: 'ob-003-t03', title: 'Complete background check form', category: 'Documentation', status: 'Completed', dueDate: '2026-05-30', assignee: 'HR Executive' },
      { id: 'ob-003-t04', title: 'Provision laptop & accessories', category: 'IT Setup', status: 'Completed', dueDate: '2026-06-01', assignee: 'IT Admin' },
      { id: 'ob-003-t05', title: 'Create corporate email & accounts', category: 'IT Setup', status: 'Completed', dueDate: '2026-06-01', assignee: 'IT Admin' },
      { id: 'ob-003-t06', title: 'Set up VPN & security tools', category: 'IT Setup', status: 'Completed', dueDate: '2026-06-02', assignee: 'IT Admin' },
      { id: 'ob-003-t07', title: 'Company & culture orientation session', category: 'Orientation', status: 'Completed', dueDate: '2026-06-03', assignee: 'Head of People' },
      { id: 'ob-003-t08', title: 'Team introduction and buddy pairing', category: 'Orientation', status: 'Completed', dueDate: '2026-06-03', assignee: 'Buddy' },
      { id: 'ob-003-t09', title: 'Meet key stakeholders (cross-functional)', category: 'Orientation', status: 'Completed', dueDate: '2026-06-06', assignee: 'Manager' },
      { id: 'ob-003-t10', title: 'Complete POSH training', category: 'Compliance', status: 'Completed', dueDate: '2026-06-10', assignee: 'HR Business Partner' },
      { id: 'ob-003-t11', title: 'Review and sign Code of Conduct', category: 'Compliance', status: 'Completed', dueDate: '2026-06-10', assignee: 'HR Business Partner' },
      { id: 'ob-003-t12', title: 'Product demo & overview walkthrough', category: 'Training', status: 'Completed', dueDate: '2026-06-11', assignee: 'Manager' },
      { id: 'ob-003-t13', title: 'Complete role-specific onboarding module', category: 'Training', status: 'In Progress', dueDate: '2026-06-16', assignee: 'Manager' },
      { id: 'ob-003-t14', title: '30-day check-in with manager', category: 'Training', status: 'Pending', dueDate: '2026-07-02', assignee: 'Manager' },
    ],
  },
  {
    id: 'ob-004',
    employeeId: 'emp-new-003',
    employeeName: 'Leela Krishnaswamy',
    designation: 'Customer Success Manager',
    department: 'Customer Success',
    startDate: '2026-05-05',
    buddy: 'Gaurav Sinha',
    tasks: [
      { id: 'ob-004-t01', title: 'Submit signed offer letter', category: 'Documentation', status: 'Completed', dueDate: '2026-04-30', assignee: 'HR Executive' },
      { id: 'ob-004-t02', title: 'Upload ID proofs & address verification', category: 'Documentation', status: 'Completed', dueDate: '2026-04-30', assignee: 'HR Executive' },
      { id: 'ob-004-t03', title: 'Complete background check form', category: 'Documentation', status: 'Completed', dueDate: '2026-05-01', assignee: 'HR Executive' },
      { id: 'ob-004-t04', title: 'Provision laptop & accessories', category: 'IT Setup', status: 'Completed', dueDate: '2026-05-04', assignee: 'IT Admin' },
      { id: 'ob-004-t05', title: 'Create corporate email & accounts', category: 'IT Setup', status: 'Completed', dueDate: '2026-05-04', assignee: 'IT Admin' },
      { id: 'ob-004-t06', title: 'Set up VPN & security tools', category: 'IT Setup', status: 'Completed', dueDate: '2026-05-05', assignee: 'IT Admin' },
      { id: 'ob-004-t07', title: 'Company & culture orientation session', category: 'Orientation', status: 'Completed', dueDate: '2026-05-06', assignee: 'Head of People' },
      { id: 'ob-004-t08', title: 'Team introduction and buddy pairing', category: 'Orientation', status: 'Completed', dueDate: '2026-05-06', assignee: 'Buddy' },
      { id: 'ob-004-t09', title: 'Meet key stakeholders (cross-functional)', category: 'Orientation', status: 'Completed', dueDate: '2026-05-09', assignee: 'Manager' },
      { id: 'ob-004-t10', title: 'Complete POSH training', category: 'Compliance', status: 'Completed', dueDate: '2026-05-13', assignee: 'HR Business Partner' },
      { id: 'ob-004-t11', title: 'Review and sign Code of Conduct', category: 'Compliance', status: 'Completed', dueDate: '2026-05-13', assignee: 'HR Business Partner' },
      { id: 'ob-004-t12', title: 'Product demo & overview walkthrough', category: 'Training', status: 'Completed', dueDate: '2026-05-14', assignee: 'Manager' },
      { id: 'ob-004-t13', title: 'Complete role-specific onboarding module', category: 'Training', status: 'Completed', dueDate: '2026-05-20', assignee: 'Manager' },
      { id: 'ob-004-t14', title: '30-day check-in with manager', category: 'Training', status: 'Completed', dueDate: '2026-06-05', assignee: 'Manager' },
    ],
  },
  {
    id: 'ob-005',
    employeeId: 'emp-new-004',
    employeeName: 'Nandan Rao',
    designation: 'Senior Product Manager',
    department: 'Product',
    startDate: '2026-06-30',
    buddy: 'Nisha Bhatt',
    tasks: [
      { id: 'ob-005-t01', title: 'Submit signed offer letter', category: 'Documentation', status: 'Completed', dueDate: '2026-06-25', assignee: 'HR Executive' },
      { id: 'ob-005-t02', title: 'Upload ID proofs & address verification', category: 'Documentation', status: 'Pending', dueDate: '2026-06-26', assignee: 'HR Executive' },
      { id: 'ob-005-t03', title: 'Complete background check form', category: 'Documentation', status: 'Pending', dueDate: '2026-06-27', assignee: 'HR Executive' },
      { id: 'ob-005-t04', title: 'Provision laptop & accessories', category: 'IT Setup', status: 'Pending', dueDate: '2026-06-29', assignee: 'IT Admin' },
      { id: 'ob-005-t05', title: 'Create corporate email & accounts', category: 'IT Setup', status: 'Pending', dueDate: '2026-06-29', assignee: 'IT Admin' },
      { id: 'ob-005-t06', title: 'Set up VPN & security tools', category: 'IT Setup', status: 'Pending', dueDate: '2026-06-30', assignee: 'IT Admin' },
      { id: 'ob-005-t07', title: 'Company & culture orientation session', category: 'Orientation', status: 'Pending', dueDate: '2026-07-01', assignee: 'Head of People' },
      { id: 'ob-005-t08', title: 'Team introduction and buddy pairing', category: 'Orientation', status: 'Pending', dueDate: '2026-07-01', assignee: 'Buddy' },
      { id: 'ob-005-t09', title: 'Meet key stakeholders (cross-functional)', category: 'Orientation', status: 'Pending', dueDate: '2026-07-04', assignee: 'Manager' },
      { id: 'ob-005-t10', title: 'Complete POSH training', category: 'Compliance', status: 'Pending', dueDate: '2026-07-08', assignee: 'HR Business Partner' },
      { id: 'ob-005-t11', title: 'Review and sign Code of Conduct', category: 'Compliance', status: 'Pending', dueDate: '2026-07-08', assignee: 'HR Business Partner' },
      { id: 'ob-005-t12', title: 'Product demo & overview walkthrough', category: 'Training', status: 'Pending', dueDate: '2026-07-09', assignee: 'Manager' },
      { id: 'ob-005-t13', title: 'Complete role-specific onboarding module', category: 'Training', status: 'Pending', dueDate: '2026-07-14', assignee: 'Manager' },
      { id: 'ob-005-t14', title: '30-day check-in with manager', category: 'Training', status: 'Pending', dueDate: '2026-07-30', assignee: 'Manager' },
    ],
  },
];

export const onboardings: Onboarding[] = raw.map((o) => ({
  ...o,
  progress: computeProgress(o.tasks),
}));
