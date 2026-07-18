/**
 * Firestore typed collection references.
 * Import `db` from here to interact with each collection.
 */
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  type CollectionReference,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  Employee,
  AttendanceRecord,
  LeaveRequest,
  LeaveBalance,
  Payslip,
  PayrollRun,
  JobOpening,
  Candidate,
  Onboarding,
  Goal,
  PerformanceReview,
  ExpenseClaim,
  Asset,
  Ticket,
} from '@/types';
import type { RegularizationRequest } from '@/data/attendance';

// ---------------------------------------------------------------------------
// Typed helpers
// ---------------------------------------------------------------------------

function col<T = DocumentData>(path: string) {
  return collection(db, path) as CollectionReference<T>;
}

// ---------------------------------------------------------------------------
// Collection references
// ---------------------------------------------------------------------------

export const Collections = {
  employees: col<Employee>('employees'),
  attendance: col<AttendanceRecord>('attendance'),
  leaveRequests: col<LeaveRequest>('leave_requests'),
  leaveBalances: col<LeaveBalance>('leave_balances'),
  payslips: col<Payslip>('payslips'),
  payrollRuns: col<PayrollRun>('payroll_runs'),
  jobs: col<JobOpening>('jobs'),
  candidates: col<Candidate>('candidates'),
  onboarding: col<Onboarding>('onboarding'),
  goals: col<Goal>('goals'),
  performanceReviews: col<PerformanceReview>('performance_reviews'),
  expenses: col<ExpenseClaim>('expenses'),
  assets: col<Asset>('assets'),
  helpdeskTickets: col<Ticket>('helpdesk_tickets'),
  regularizations: col<RegularizationRequest>('regularizations'),
} as const;

// ---------------------------------------------------------------------------
// Generic CRUD helpers
// ---------------------------------------------------------------------------

/** Fetch all docs from a collection, returning an array with doc IDs merged. */
export async function fetchAll<T extends { id?: string }>(
  colRef: CollectionReference<T>,
  ...constraints: QueryConstraint[]
): Promise<T[]> {
  const q = constraints.length ? query(colRef, ...constraints) : colRef;
  const snap = await getDocs(q as CollectionReference<T>);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as T));
}

/** Fetch a single doc by ID. Returns null if not found. */
export async function fetchOne<T>(
  colRef: CollectionReference<T>,
  id: string,
): Promise<T | null> {
  const snap = await getDoc(doc(colRef, id));
  return snap.exists() ? ({ ...snap.data(), id: snap.id } as T) : null;
}

/** Set a doc with a known ID (creates or overwrites). */
export async function upsert<T extends object>(
  colRef: CollectionReference<T>,
  id: string,
  data: T,
): Promise<void> {
  await setDoc(doc(colRef, id), data);
}

/** Add a new doc (auto-generated ID). Returns the new ID. */
export async function addNew<T extends object>(
  colRef: CollectionReference<T>,
  data: T,
): Promise<string> {
  const ref = await addDoc(colRef, data);
  return ref.id;
}

/** Partially update an existing doc. */
export async function patch<T extends object>(
  colRef: CollectionReference<T>,
  id: string,
  data: Partial<T>,
): Promise<void> {
  await updateDoc(doc(colRef, id), data as DocumentData);
}

/** Delete a doc by ID. */
export async function remove<T>(
  colRef: CollectionReference<T>,
  id: string,
): Promise<void> {
  await deleteDoc(doc(colRef, id));
}

/** Subscribe to a collection in real time. Returns an unsubscribe function. */
export function subscribe<T extends { id?: string }>(
  colRef: CollectionReference<T>,
  callback: (data: T[]) => void,
  ...constraints: QueryConstraint[]
): Unsubscribe {
  const q = constraints.length ? query(colRef, ...constraints) : colRef;
  return onSnapshot(q as CollectionReference<T>, (snap) => {
    callback(snap.docs.map((d) => ({ ...d.data(), id: d.id } as T)));
  });
}

// Re-export query helpers for convenience
export { where, orderBy };
