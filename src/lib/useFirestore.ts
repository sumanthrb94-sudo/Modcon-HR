/**
 * React hooks for Firestore real-time data.
 *
 * Each hook subscribes to a Firestore collection and returns
 * { data, loading, error }.
 *
 * Usage:
 *   const { data: employees, loading } = useEmployees();
 */

import { useState, useEffect } from 'react';
import { where, type CollectionReference, type DocumentData, type QueryConstraint } from 'firebase/firestore';
import { subscribe } from './db';
import { Collections } from './db';
import { useAuth } from './auth';
import { resolveOrgKeyForProfile } from './orgScope';
import type {
    Employee,
    EmployeeCompensation,
    LeaveRequest,
    JobOpening,
    Candidate,
    ExpenseClaim,
    Asset,
    Payslip,
    PayrollRun,
    Goal,
    PerformanceReview,
    Onboarding,
    Ticket,
    AttendanceRecord,
    LeaveBalance,
    RegularizationRequest,
    Organization,
} from '@/types';

interface UseCollectionResult<T> {
    data: T[];
    loading: boolean;
    error: Error | null;
}

/**
 * Subscribe to a collection, scoped to the caller's organisation.
 *
 * The `where('orgId','==',orgKey)` filter is not an optimisation — it is what
 * makes the query legal. `firestore.rules` evaluates a list against every
 * document it returns and fails the whole query if any one is disallowed, so an
 * unfiltered read of an org-scoped collection is rejected outright the moment a
 * second tenant has data. Filtering here is the client half of the same rule.
 *
 * Consequence worth knowing: documents written before multi-tenancy carry no
 * `orgId` at all, and Firestore equality filters do not match a missing field,
 * so those records are invisible to every hook here until the backfill has run
 * (src/lib/orgBackfill.ts).
 */
function useCollection<T extends { id?: string }>(
    colRef: CollectionReference<T>,
    ...constraints: QueryConstraint[]
): UseCollectionResult<T> {
    const { profile } = useAuth();
    const orgKey = resolveOrgKeyForProfile(profile);
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        setLoading(true);
        const unsub = subscribe(
            colRef,
            (docs) => {
                setData(docs);
                setLoading(false);
            },
            where('orgId', '==', orgKey),
            ...constraints,
        );
        return unsub;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgKey]);

    return { data, loading, error };
}

// ---------------------------------------------------------------------------
// Per-collection hooks
// ---------------------------------------------------------------------------

export function useEmployees() {
    return useCollection<Employee>(Collections.employees);
}

/** Admin-only: see Collections.employeeCompensation / firestore.rules. */
export function useEmployeeCompensation() {
    return useCollection<EmployeeCompensation>(Collections.employeeCompensation);
}

export function useLeaveRequests() {
    return useCollection<LeaveRequest>(Collections.leaveRequests);
}

export function useJobOpenings() {
    return useCollection<JobOpening>(Collections.jobs);
}

export function useCandidates() {
    return useCollection<Candidate>(Collections.candidates);
}

export function useExpenses() {
    return useCollection<ExpenseClaim>(Collections.expenses);
}

export function useAssets() {
    return useCollection<Asset>(Collections.assets);
}

export function usePayslips() {
    return useCollection<Payslip>(Collections.payslips);
}

export function usePayrollRuns() {
    return useCollection<PayrollRun>(Collections.payrollRuns);
}

export function useGoals() {
    return useCollection<Goal>(Collections.goals);
}

export function usePerformanceReviews() {
    return useCollection<PerformanceReview>(Collections.performanceReviews);
}

export function useOnboarding() {
    return useCollection<Onboarding>(Collections.onboarding);
}

export function useHelpdeskTickets() {
    return useCollection<Ticket>(Collections.helpdeskTickets);
}

export function useAttendance() {
    return useCollection<AttendanceRecord>(Collections.attendance);
}

export function useLeaveBalances() {
    return useCollection<LeaveBalance>(Collections.leaveBalances);
}

export function useRegularizations() {
    return useCollection<RegularizationRequest>(Collections.regularizations);
}

/**
 * Super-admin only: see Collections.organizations / firestore.rules — an
 * unconstrained list query against that collection is denied outright for
 * non-super-admins, so callers outside the Organizations page (e.g. a
 * topbar org switcher visible to everyone) must pass `enabled: isSuperAdmin`
 * to skip subscribing entirely rather than eating a permission error.
 */
export function useOrganizations(enabled: boolean = true) {
    const [data, setData] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!enabled) {
            setData([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const unsub = subscribe(Collections.organizations, (docs) => {
            setData(docs);
            setLoading(false);
        });
        return unsub;
    }, [enabled]);

    return { data, loading, error };
}
