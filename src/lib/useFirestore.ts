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
import { type CollectionReference, type DocumentData, type QueryConstraint } from 'firebase/firestore';
import { subscribe } from './db';
import { Collections } from './db';
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

function useCollection<T extends { id?: string }>(
    colRef: CollectionReference<T>,
    ...constraints: QueryConstraint[]
): UseCollectionResult<T> {
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const unsub = subscribe(
            colRef,
            (docs) => {
                setData(docs);
                setLoading(false);
            },
            ...constraints,
        );
        return unsub;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
