import { ChevronLeft, CalendarOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui';
import { leaveRequests } from '@/data/leave';
import { employees } from '@/data/employees';
import { formatDate } from '@/lib/utils';
import type { LeaveStatus } from '@/types';

export function LeaveRequestsApprovalsPage() {
    const navigate = useNavigate();
    const [requestStatuses, setRequestStatuses] = useState<Record<string, LeaveStatus>>(() =>
        leaveRequests.reduce((acc, request) => {
            acc[request.id] = request.status;
            return acc;
        }, {} as Record<string, LeaveStatus>),
    );

    function updateRequestStatus(requestId: string, nextStatus: 'Approved' | 'Rejected') {
        setRequestStatuses((prev) => ({ ...prev, [requestId]: nextStatus }));
    }

    const pendingRequests = useMemo(
        () => leaveRequests
            .filter((r) => requestStatuses[r.id] === 'Pending')
            .sort((a, b) => new Date(b.appliedOn).getTime() - new Date(a.appliedOn).getTime()),
        [requestStatuses],
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
                <CardHeader title="Pending Leave Approval Queue" subtitle="Only requests waiting for approval" />
                {pendingRequests.length === 0 ? (
                    <p className="text-sm text-ink-400 text-center py-6">No pending leave requests</p>
                ) : (
                    <div className="space-y-3">
                        {pendingRequests.map((request) => {
                            const employee = employees.find((e) => e.id === request.employeeId);
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
