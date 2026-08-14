import { ChevronLeft, CalendarOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui';
import { getLeaveRequests, LEAVE_REQUESTS_CHANGED_EVENT, updateLeaveRequestStatus } from '@/data/leave';
import { backdatedByDays } from '@/data/leaveApplication';
import { employees } from '@/data/employees';
import { useAuth } from '@/lib/auth';
import { getApprovableEmployeeIds, getCurrentEmployeeRecord } from '@/lib/dataScope';
import { getCurrentEmployee } from '@/lib/currentEmployee';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { formatDate } from '@/lib/utils';

export function LeaveRequestsApprovalsPage() {
    const navigate = useNavigate();
    const { profile } = useAuth();
    const currentEmployee = getCurrentEmployee(profile);
    const directoryRevision = useEmployeeDirectoryRevision();
    const [leaveRequests, setLeaveRequests] = useState(() => getLeaveRequests());
    const [decisionNotice, setDecisionNotice] = useState<string | null>(null);

    useEffect(() => {
        function handleLeaveRequestsChanged() {
            setLeaveRequests(getLeaveRequests());
        }

        window.addEventListener(LEAVE_REQUESTS_CHANGED_EVENT, handleLeaveRequestsChanged);
        return () => window.removeEventListener(LEAVE_REQUESTS_CHANGED_EVENT, handleLeaveRequestsChanged);
    }, []);

    function updateRequestStatus(requestId: string, nextStatus: 'Approved' | 'Rejected') {
        const result = updateLeaveRequestStatus(requestId, nextStatus, {
            profile,
            // Record whoever is signed in, not a fixed name. This previously
            // credited 'Ananya Reddy' with every approval in the system.
            approverId: currentEmployee?.id ?? null,
            approverName: currentEmployee?.fullName ?? profile?.displayName ?? profile?.email ?? 'Unknown approver',
        });
        setDecisionNotice(result.ok ? null : result.reason);
        setLeaveRequests(result.requests);
    }

    // Whose leave this account may decide: the people beneath it in the
    // reporting tree, whatever its role. The queue used to be every pending
    // request in the company regardless of who was reading it, so anyone who
    // could open the page was offered Approve on the leave of people they have
    // no authority over — and on their own. See lib/dataScope.ts.
    const approvableEmployeeIds = useMemo(
        () => getApprovableEmployeeIds(profile),
        [profile, directoryRevision],
    );

    const pendingRequests = useMemo(
        () => leaveRequests
            .filter((r) => r.status === 'Pending' && approvableEmployeeIds.has(r.employeeId))
            .sort((a, b) => new Date(b.appliedOn).getTime() - new Date(a.appliedOn).getTime()),
        [leaveRequests, approvableEmployeeIds],
    );

    // An empty queue has three quite different causes, and only one of them is
    // "nothing to do". An account that was never linked to an employee record
    // has no reporting line the app can see, which is fixable — but only by
    // somebody who is told about it.
    const emptyReason = useMemo(() => {
        if (approvableEmployeeIds.size > 0) return 'No pending leave requests from your team';
        if (getCurrentEmployeeRecord(profile)) {
            return 'Nobody reports to you, so there are no leave requests for you to decide';
        }
        return 'This app has not been told which employee record your account belongs to, so it cannot tell who reports to you. An administrator can link it from Settings → Database.';
    }, [approvableEmployeeIds, profile, directoryRevision]);

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Leave Requests"
                subtitle={`${pendingRequests.length} pending requests you can decide`}
                actions={
                    <Button variant="secondary" size="sm" icon={<ChevronLeft size={14} />} onClick={() => navigate('/dashboard/pending-approvals')}>
                        Back to Pending Approvals
                    </Button>
                }
            />

            {decisionNotice && (
                <div
                    role="status"
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                >
                    {decisionNotice}
                </div>
            )}

            <Card>
                <CardHeader title="Pending Leave Approval Queue" subtitle="Requests from your reporting line, waiting on you" />
                {pendingRequests.length === 0 ? (
                    <p className="text-sm text-ink-400 text-center py-6">{emptyReason}</p>
                ) : (
                    <div className="space-y-3">
                        {pendingRequests.map((request) => {
                            const employee = employees.find((e) => e.id === request.employeeId);
                            // Leave may be dated before it is applied for. Two
                            // requests reading "5 – 7 August, 3 days" are a plan
                            // and an absence already taken, and the dates alone
                            // cannot tell them apart — the decision is different,
                            // so the difference is stated rather than left to be
                            // worked out from the Applied line underneath.
                            const backdated = backdatedByDays(request.startDate, request.appliedOn);
                            return (
                                <div key={request.id} className="rounded-xl border border-ink-100 bg-white p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <CalendarOff size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-sm font-semibold text-ink-900">{employee?.fullName ?? request.employeeId}</p>
                                                <Badge tone="violet">{request.type}</Badge>
                                                {backdated > 0 && (
                                                    <Badge tone="amber">
                                                        Backdated {backdated} day{backdated === 1 ? '' : 's'}
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-ink-500 mt-1">
                                                {formatDate(request.startDate)} to {formatDate(request.endDate)} · {request.days} day(s)
                                            </p>
                                            <p className="text-xs text-ink-500 mt-1">Applied on {formatDate(request.appliedOn)}</p>
                                            <p className="text-sm text-ink-700 mt-2 leading-relaxed">{request.reason}</p>
                                            <div className="flex items-center gap-2 mt-3">
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => updateRequestStatus(request.id, 'Approved')}
                                                >
                                                    Approve
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-rose-600 hover:text-rose-700"
                                                    onClick={() => updateRequestStatus(request.id, 'Rejected')}
                                                >
                                                    Decline
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
}
