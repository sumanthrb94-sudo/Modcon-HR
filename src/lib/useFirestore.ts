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
import { type CollectionReference, type QueryConstraint } from 'firebase/firestore';
import { subscribe, Collections } from './db';
import type {
    Employee,
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
            (err) => {
                setError(err);
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
