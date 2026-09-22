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
    EmployeeCompensation,
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
    Organization,
    HandbookVersion,
    HandbookPointer,
    PayslipDocument,
    EmployeeDocument,
    JobApplication,
    AttendanceStamp,
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
    // Compensation lives separately from `employees` so the broadly-readable
    // directory collection never carries salary data — see EmployeeCompensation.
    employeeCompensation: col<EmployeeCompensation>('employee_compensation'),
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
    organizations: col<Organization>('organizations'),
    // Employee handbook: append-only versions, plus one current-version
    // pointer per org keyed by org id. See src/lib/handbook.ts.
    handbookVersions: col<HandbookVersion>('handbook_versions'),
    handbook: col<HandbookPointer>('handbook'),
    // Payslip PDFs uploaded by an administrator — the issued document, as
    // opposed to the `payslips` figures the app computes. See
    // src/lib/payslipDocuments.ts.
    payslipDocuments: col<PayslipDocument>('payslip_documents'),
    // Documents filed against an employee. In Firestore rather than
    // localStorage because who may file which kind is a rule, and a rule needs
    // a server to refuse the write. See src/lib/employeeDocuments.ts.
    employeeDocuments: col<EmployeeDocument>('employee_documents'),
    // Applications submitted against a published job opening. The only
    // collection in this file an unauthenticated caller can write to — a
    // candidate applying from the public careers page has no account here.
    // See src/lib/jobApplications.ts and the rules block of the same name.
    jobApplications: col<JobApplication>('job_applications'),
    // Where each check-in and check-out was captured. Separate from the
    // localStorage attendance overlay on purpose: a stamp is evidence, and
    // evidence its own author can edit is not evidence. See
    // src/lib/attendanceStamps.ts.
    attendanceStamps: col<AttendanceStamp>('attendance_stamps'),
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
/**
 * Drop keys whose value is `undefined`, recursively.
 *
 * Firestore rejects `undefined` outright — `setDoc` throws
 * "Unsupported field value: undefined (found in field X)" rather than storing
 * a null or omitting the key. TypeScript cannot save you here: an optional
 * field (`receiptImage?: string`) is typed exactly the same whether it is
 * absent or explicitly `undefined`, and object spread produces the second.
 *
 * So the whole family of optional fields on every collection is one dropped
 * value away from a write that always fails. It surfaced as an expense claim
 * with no receipt retrying a doomed `setDoc` and logging on every attempt,
 * which reads as a permissions or network problem and is neither.
 *
 * Stripped here rather than at each call site because there is no call site
 * where sending `undefined` is what the caller meant. A deliberate erasure is
 * `deleteField()` through `patch`, which is a different thing and still works.
 */
function withoutUndefined<T>(value: T): T {
    if (Array.isArray(value)) return value.map(withoutUndefined) as unknown as T;
    // Dates, Timestamps, FieldValues and the rest are values, not shapes to walk.
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
        return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v !== undefined) out[k] = withoutUndefined(v);
    }
    return out as T;
}

export async function upsert<T extends object>(
    colRef: CollectionReference<T>,
    id: string,
    data: T,
): Promise<void> {
    await setDoc(doc(colRef, id), withoutUndefined(data));
}

/** Add a new doc (auto-generated ID). Returns the new ID. */
export async function addNew<T extends object>(
    colRef: CollectionReference<T>,
    data: T,
): Promise<string> {
    const ref = await addDoc(colRef, withoutUndefined(data));
    return ref.id;
}

/** Partially update an existing doc. */
export async function patch<T extends object>(
    colRef: CollectionReference<T>,
    id: string,
    data: Partial<T>,
): Promise<void> {
    await updateDoc(doc(colRef, id), withoutUndefined(data) as DocumentData);
}

/** Delete a doc by ID. */
export async function remove<T>(
    colRef: CollectionReference<T>,
    id: string,
): Promise<void> {
    await deleteDoc(doc(colRef, id));
}

/**
 * Subscribe to a collection in real time. Returns an unsubscribe function.
 *
 * `onError` matters in practice: without it a failed listen — most commonly a
 * security-rules rejection, which is the expected outcome of an org-scoped
 * query that forgot its `orgId` filter — is swallowed, the success callback
 * never fires, and any UI gated on a `loading` flag spins forever with no
 * indication why.
 */
export function subscribe<T extends { id?: string }>(
    colRef: CollectionReference<T>,
    callback: (data: T[]) => void,
    onError?: (error: Error) => void,
    ...constraints: QueryConstraint[]
): Unsubscribe {
    const q = constraints.length ? query(colRef, ...constraints) : colRef;
    return onSnapshot(
        q as CollectionReference<T>,
        (snap) => {
            callback(snap.docs.map((d) => ({ ...d.data(), id: d.id } as T)));
        },
        (error) => {
            console.error(`[db] snapshot listener failed for ${colRef.path}:`, error);
            onError?.(error);
        },
    );
}

// Re-export query helpers for convenience
export { where, orderBy };
