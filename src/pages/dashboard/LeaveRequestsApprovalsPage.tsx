import { ChevronLeft, CalendarOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui';
import { getLeaveRequests, LEAVE_REQUESTS_CHANGED_EVENT, updateLeaveRequestStatus } from '@/data/leave';
import { getEmployeeDirectory } from '@/data/employees';
import { useAuth } from '@/lib/auth';
import { getCurrentEmployee } from '@/lib/currentEmployee';
import { getVisibleEmployeeIds } from '@/lib/dataScope';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { formatDate } from '@/lib/utils';

export function LeaveRequestsApprovalsPage() {
    const navigate = useNavigate();
    const { profile } = useAuth();
    const currentEmployee = getCurrentEmployee(profile);
    const [leaveRequests, setLeaveRequests] = useState(() => getLeaveRequests());
    const [decisionError, setDecisionError] = useState('');
    const directoryRevision = useEmployeeDirectoryRevision();

    useEffect(() => {
        function handleLeaveRequestsChanged() {
            setLeaveRequests(getLeaveRequests());
        }

        window.addEventListener(LEAVE_REQUESTS_CHANGED_EVENT, handleLeaveRequestsChanged);
        return () => window.removeEventListener(LEAVE_REQUESTS_CHANGED_EVENT, handleLeaveRequestsChanged);
    }, []);

    function updateRequestStatus(requestId: string, nextStatus: 'Approved' | 'Rejected') {
        try {
            // Record whoever is signed in, not a fixed name. This previously
            // credited 'Ananya Reddy' with every approval in the system.
            setLeaveRequests(updateLeaveRequestStatus(requestId, nextStatus, {
                profile,
                employeeId: currentEmployee?.id ?? null,
                name: currentEmployee?.fullName ?? profile?.displayName ?? profile?.email ?? 'Unknown approver',
            }));
            setDecisionError('');
        } catch (err) {
            setDecisionError(err instanceof Error ? err.message : 'That decision could not be recorded.');
        }
    }

    // Scoped to this viewer's own reporting line, as the Leave page and the
    // notification count already were. This page filtered on status alone, so
    // it listed every pending request in the organisation and offered Approve
    // on each — the badge in the menu said "3 awaiting approval" and the page
    // it linked to showed nine. See lib/dataScope.ts.
    const visibleEmployeeIds = useMemo(
        () => getVisibleEmployeeIds(profile),
        [profile, directoryRevision],
    );

    const pendingRequests = useMemo(
        () => leaveRequests
            .filter((r) => r.status === 'Pending' && visibleEmployeeIds.has(r.employeeId))
            .sort((a, b) => new Date(b.appliedOn).getTime() - new Date(a.appliedOn).getTime()),
        [leaveRequests, visibleEmployeeIds],
    );

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Leave Requests"
                subtitle={`${pendingRequests.length} pending requests`}
                actions={
                    <Button variant="secondary" size="sm" icon={<ChevronLeft size={14} />} onClick={() => navigate('/dashboard/pending-approvals')}>
                        Back to Pending Approvals
                    </Button>
                }
            />

            <Card>
                <CardHeader title="Pending Leave Approval Queue" subtitle="Requests from your team waiting for approval" />
                {decisionError && (
                    <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
                        {decisionError}
                    </div>
                )}
                {pendingRequests.length === 0 ? (
                    <p className="text-sm text-ink-400 text-center py-6">No pending leave requests</p>
                ) : (
                    <div className="space-y-3">
                        {pendingRequests.map((request) => {
                            // The live directory, not the seed export: an
                            // organisation whose people were added in-app has
                            // an empty seed, so every row rendered its raw
                            // employee id instead of a name.
                            const employee = getEmployeeDirectory().find((e) => e.id === request.employeeId);
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
