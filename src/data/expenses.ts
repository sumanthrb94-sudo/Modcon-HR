import type { ExpenseClaim, ExpenseCategory, ExpenseStatus } from '@/types';
import { isMockDataCleared } from '@/lib/mockDataFlag';
import { persistentCollection } from '@/data/persistence';

// ---------------------------------------------------------------------------
// Seed data — 16 claims spread across employees & categories
// ---------------------------------------------------------------------------

interface Seed {
  id: string;
  employeeId: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  status: ExpenseStatus;
  submittedOn: string;
  description: string;
  receiptImage?: string;
}

const seeds: Seed[] = [
  {
    id: 'exp-001',
    employeeId: 'emp-001',
    title: 'Delhi Strategy Summit',
    category: 'Travel',
    amount: 18500,
    date: '2026-05-04',
    status: 'Reimbursed',
    submittedOn: '2026-05-05',
    description: 'Return flight Bengaluru–Delhi for Q2 leadership summit.',
    receiptImage: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="%23f8fafc"/><rect x="20" y="20" width="260" height="360" rx="8" fill="white" stroke="%23cbd5e1" stroke-width="2"/><text x="150" y="60" font-family="monospace" font-size="18" font-weight="bold" text-anchor="middle" fill="%230f172a">TAX INVOICE</text><text x="40" y="100" font-family="monospace" font-size="12" fill="%23334155">Date: 2026-05-04</text><text x="40" y="120" font-family="monospace" font-size="12" fill="%23334155">Receipt No: TX-84920</text><line x1="40" y1="140" x2="260" y2="140" stroke="%23cbd5e1" stroke-dasharray="4"/><text x="40" y="170" font-family="monospace" font-size="12" font-weight="bold" fill="%23334155">Description</text><text x="260" y="170" font-family="monospace" font-size="12" font-weight="bold" text-anchor="end" fill="%23334155">Amount</text><text x="40" y="200" font-family="monospace" font-size="12" fill="%23475569">Cab Fare (BLR-Delhi)</text><text x="260" y="200" font-family="monospace" font-size="12" text-anchor="end" fill="%23475569">₹18,500.00</text><line x1="40" y1="240" x2="260" y2="240" stroke="%23cbd5e1"/><text x="40" y="270" font-family="monospace" font-size="14" font-weight="bold" fill="%230f172a">TOTAL</text><text x="260" y="270" font-family="monospace" font-size="14" font-weight="bold" text-anchor="end" fill="%230f172a">₹18,500.00</text><text x="150" y="340" font-family="monospace" font-size="10" fill="%2394a3b8" text-anchor="middle">Thank you for traveling with us!</text></svg>',
  },
  {
    id: 'exp-002',
    employeeId: 'emp-002',
    title: 'AWS re:Invent Conference',
    category: 'Training',
    amount: 42000,
    date: '2026-04-22',
    status: 'Approved',
    submittedOn: '2026-04-25',
    description: 'Conference registration + 3-night hotel stay in Hyderabad.',
  },
  {
    id: 'exp-003',
    employeeId: 'emp-005',
    title: 'Client Dinner — TechCorp',
    category: 'Meals',
    amount: 7200,
    date: '2026-05-14',
    status: 'Reimbursed',
    submittedOn: '2026-05-15',
    description: 'Business dinner with TechCorp procurement team (6 people).',
  },
  {
    id: 'exp-004',
    employeeId: 'emp-010',
    title: 'GitHub Copilot Business',
    category: 'Software',
    amount: 5600,
    date: '2026-05-01',
    status: 'Reimbursed',
    submittedOn: '2026-05-02',
    description: 'Annual GitHub Copilot Business seats (4 devs, 1 month).',
    receiptImage: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="%23f8fafc"/><rect x="20" y="20" width="260" height="360" rx="8" fill="white" stroke="%23cbd5e1" stroke-width="2"/><text x="150" y="60" font-family="monospace" font-size="18" font-weight="bold" text-anchor="middle" fill="%230f172a">AWS INVOICE</text><text x="40" y="100" font-family="monospace" font-size="12" fill="%23334155">Date: 2026-05-01</text><text x="40" y="120" font-family="monospace" font-size="12" fill="%23334155">Inv No: AWS-99381</text><line x1="40" y1="140" x2="260" y2="140" stroke="%23cbd5e1" stroke-dasharray="4"/><text x="40" y="170" font-family="monospace" font-size="12" font-weight="bold" fill="%23334155">Service</text><text x="260" y="170" font-family="monospace" font-size="12" font-weight="bold" text-anchor="end" fill="%23334155">Amount</text><text x="40" y="200" font-family="monospace" font-size="12" fill="%23475569">Copilot Business Seats</text><text x="260" y="200" font-family="monospace" font-size="12" text-anchor="end" fill="%23475569">₹5,600.00</text><line x1="40" y1="240" x2="260" y2="240" stroke="%23cbd5e1"/><text x="40" y="270" font-family="monospace" font-size="14" font-weight="bold" fill="%230f172a">TOTAL PAID</text><text x="260" y="270" font-family="monospace" font-size="14" font-weight="bold" text-anchor="end" fill="%230f172a">₹5,600.00</text><text x="150" y="340" font-family="monospace" font-size="10" fill="%2394a3b8" text-anchor="middle">Amazon Web Services India</text></svg>',
  },
  {
    id: 'exp-005',
    employeeId: 'emp-011',
    title: 'React Summit Workshop',
    category: 'Training',
    amount: 12000,
    date: '2026-05-10',
    status: 'Approved',
    submittedOn: '2026-05-12',
    description: 'Online React Summit workshop ticket + materials.',
  },
  {
    id: 'exp-006',
    employeeId: 'emp-020',
    title: 'Mumbai–Bengaluru Travel',
    category: 'Travel',
    amount: 6800,
    date: '2026-05-18',
    status: 'Submitted',
    submittedOn: '2026-05-19',
    description: 'Train ticket + local cab for cross-office sprint.',
  },
  {
    id: 'exp-007',
    employeeId: 'emp-030',
    title: 'Sales Team Lunch',
    category: 'Meals',
    amount: 4500,
    date: '2026-05-07',
    status: 'Reimbursed',
    submittedOn: '2026-05-08',
    description: 'Monthly sales team lunch — 8 members.',
  },
  {
    id: 'exp-008',
    employeeId: 'emp-022',
    title: 'Figma Professional Upgrade',
    category: 'Software',
    amount: 9800,
    date: '2026-05-01',
    status: 'Approved',
    submittedOn: '2026-05-03',
    description: 'Annual Figma Professional plan for the design team.',
  },
  {
    id: 'exp-009',
    employeeId: 'emp-040',
    title: 'Marketing Conference — Pune',
    category: 'Accommodation',
    amount: 11200,
    date: '2026-05-20',
    status: 'Submitted',
    submittedOn: '2026-05-22',
    description: '2-night hotel stay for Content Marketing World conference.',
  },
  {
    id: 'exp-010',
    employeeId: 'emp-006',
    title: 'Printer Cartridges & Stationery',
    category: 'Office Supplies',
    amount: 3200,
    date: '2026-05-06',
    status: 'Reimbursed',
    submittedOn: '2026-05-07',
    description: 'Office printer cartridges and miscellaneous stationery.',
  },
  {
    id: 'exp-011',
    employeeId: 'emp-025',
    title: 'HR Tech Summit Registration',
    category: 'Training',
    amount: 8500,
    date: '2026-05-15',
    status: 'Submitted',
    submittedOn: '2026-05-16',
    description: 'Conference pass for HR Tech Summit 2026.',
  },
  {
    id: 'exp-012',
    employeeId: 'emp-014',
    title: 'Grafana Cloud Subscription',
    category: 'Software',
    amount: 4200,
    date: '2026-05-01',
    status: 'Approved',
    submittedOn: '2026-05-02',
    description: 'Monthly Grafana Cloud Pro plan for monitoring dashboards.',
  },
  {
    id: 'exp-013',
    employeeId: 'emp-032',
    title: 'Client Onboarding Dinner',
    category: 'Meals',
    amount: 5800,
    date: '2026-05-25',
    status: 'Submitted',
    submittedOn: '2026-05-26',
    description: 'Welcome dinner for new enterprise client onboarding.',
  },
  {
    id: 'exp-014',
    employeeId: 'emp-035',
    title: 'Legal Database Subscription',
    category: 'Software',
    amount: 15000,
    date: '2026-04-30',
    status: 'Rejected',
    submittedOn: '2026-05-01',
    description: 'Annual Manupatra subscription — rejected; to be billed via company account.',
  },
  {
    id: 'exp-015',
    employeeId: 'emp-003',
    title: 'Whiteboard & Markers',
    category: 'Office Supplies',
    amount: 2800,
    date: '2026-05-13',
    status: 'Reimbursed',
    submittedOn: '2026-05-14',
    description: 'Glass whiteboard for Mumbai product war-room.',
  },
  {
    id: 'exp-016',
    employeeId: 'emp-030',
    title: 'Vendor Coordination Cab',
    category: 'Travel',
    amount: 1800,
    date: '2026-05-28',
    status: 'Draft',
    submittedOn: '2026-05-29',
    description: 'Cab fare for vendor site visit in Bengaluru.',
  },
  {
    id: 'exp-017',
    employeeId: 'emp-038',
    title: 'Team Lunch with QA Squad',
    category: 'Meals',
    amount: 2450,
    date: '2026-06-14',
    status: 'Reimbursed',
    submittedOn: '2026-06-15',
    description: 'Sprint closure team lunch with QA and frontend engineers.',
  },
  {
    id: 'exp-018',
    employeeId: 'emp-038',
    title: 'Developer Conference Ticket',
    category: 'Training',
    amount: 7800,
    date: '2026-07-05',
    status: 'Submitted',
    submittedOn: '2026-07-06',
    description: 'Frontend developer conference pass for React and performance sessions.',
  },
  {
    id: 'exp-019',
    employeeId: 'emp-038',
    title: 'Cloud IDE Monthly Subscription',
    category: 'Software',
    amount: 1599,
    date: '2026-07-10',
    status: 'Approved',
    submittedOn: '2026-07-11',
    description: 'Cloud IDE subscription used for pair programming and code review sessions.',
  },
];

export const expenseClaims: ExpenseClaim[] = isMockDataCleared() ? [] : seeds;

// ---------------------------------------------------------------------------
// Chart helper — total amount by category
// ---------------------------------------------------------------------------

export function expenseByCategory(claims: ExpenseClaim[] = expenseClaims): Array<{ category: string; total: number }> {
  const map = new Map<string, number>();
  claims.forEach((c) => {
    map.set(c.category, (map.get(c.category) ?? 0) + c.amount);
  });
  return Array.from(map.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

// ---- Persistence ------------------------------------------------------------
// `expenseClaims` above is the seed. Every change a user made to it lived in React
// state alone and was lost on the next refresh.
const expenseStore = persistentCollection<ExpenseClaim>(
  'modcon.hr.expenseClaims',
  'modcon-hr-expenses-changed',
  () => expenseClaims,
  'expenseClaims',
);

export const EXPENSES_CHANGED_EVENT = expenseStore.changedEvent;
export const getExpenseClaims = () => expenseStore.get();
export const saveExpenseClaims = (next: ExpenseClaim[]) => expenseStore.save(next);
