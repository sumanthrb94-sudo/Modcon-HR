import { ChevronLeft, Clock } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui';
import {
    getRegularizationRequests,
    decideRegularization,
    REGULARIZATIONS_CHANGED_EVENT,
    ATTENDANCE_CHANGED_EVENT,
} from '@/data/attendance';
import { getEmployeeDirectory } from '@/data/employees';
import { useCollectionRevision } from '@/lib/useCollectionRevision';
import { formatDate } from '@/lib/utils';

export function RegularizationsApprovalsPage() {
    const navigate = useNavigate();
    // Decisions used to live in a `useState` map that nothing ever wrote back,
    // so approving here changed this render and nothing else: the decision was
    // gone on refresh and never reached the Attendance queue or the counts that
    // read from it. The store is the single source now, re-read on its event.
    const regularizationRevision = useCollectionRevision(REGULARIZATIONS_CHANGED_EVENT);
    // Entries derived from attendance appear and disappear as records change.
    const attendanceRevision = useCollectionRevision(ATTENDANCE_CHANGED_EVENT);

    function updateRequestStatus(requestId: string, status: 'Approved' | 'Rejected') {
        decideRegularization(requestId, status);
    }

    const pendingRegularizations = useMemo(
        () => getRegularizationRequests()
            .filter((r) => r.status === 'Pending')
            .sort((a, b) => b.date.localeCompare(a.date)),
        [regularizationRevision, attendanceRevision],
    );

    const employees = useMemo(() => getEmployeeDirectory(), [regularizationRevision]);

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Regularizations"
                subtitle={`${pendingRegularizations.length} pending regularization requests`}
                actions={
                    <Button variant="secondary" size="sm" icon={<ChevronLeft size={14} />} onClick={() => navigate('/dashboard/pending-approvals')}>
                        Back to Pending Approvals
                    </Button>
                }
            />

            <Card>
                <CardHeader title="Pending Attendance Regularizations" subtitle="Requests waiting for attendance correction" />
                {pendingRegularizations.length === 0 ? (
                    <p className="text-sm text-ink-400 text-center py-6">No pending regularizations</p>
                ) : (
                    <div className="space-y-3">
                        {pendingRegularizations.map((request) => {
                            const employee = employees.find((e) => e.id === request.employeeId);
                            return (
                                <div key={request.id} className="rounded-xl border border-ink-100 bg-white p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                                            <Clock size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-sm font-semibold text-ink-900">{employee?.fullName ?? request.employeeId}</p>
                                                {/* Only where somebody actually asked for a status. Rows the
                                                    app flagged from the records carry none, and an empty
                                                    badge here read as a blank blue pill. */}
                                                {request.requestedStatus ? (
                                                    <Badge tone="blue">{request.requestedStatus}</Badge>
                                                ) : (
                                                    <Badge tone="gray">Flagged from record</Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-ink-500 mt-1">Attendance date: {formatDate(request.date)}</p>
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
