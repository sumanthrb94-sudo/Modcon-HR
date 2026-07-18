import { ChevronLeft, CalendarOff, IndianRupee, Clock, CheckSquare, AlertTriangle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui';
import { pendingApprovals } from '@/data/dashboard';

const APPROVAL_ICONS: Record<string, JSX.Element> = {
    'Leave Requests': <CalendarOff size={18} />,
    'Expense Claims': <IndianRupee size={18} />,
    Regularizations: <Clock size={18} />,
    'Onboarding Tasks': <CheckSquare size={18} />,
};

const APPROVAL_ROUTES: Record<string, string> = {
    'Leave Requests': '/dashboard/pending-approvals/leave-requests',
    'Expense Claims': '/dashboard/pending-approvals/expense-claims',
    Regularizations: '/dashboard/pending-approvals/regularizations',
    'Onboarding Tasks': '/dashboard/pending-approvals/onboarding-tasks',
};

export function PendingApprovalsPage() {
    const navigate = useNavigate();

    const total = pendingApprovals.reduce((sum, item) => sum + item.count, 0);
    const urgentTotal = pendingApprovals.reduce((sum, item) => sum + item.urgentCount, 0);

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Pending Approvals"
                subtitle={`${total} total items across workflows`}
                actions={
                    <Button variant="secondary" size="sm" icon={<ChevronLeft size={14} />} onClick={() => navigate('/')}>
                        Back to Dashboard
                    </Button>
                }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                    <CardHeader title="Total Pending" />
                    <p className="text-3xl font-bold text-ink-900">{total}</p>
                </Card>
                <Card>
                    <CardHeader title="Urgent Items" />
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={18} className="text-rose-500" />
                        <p className="text-3xl font-bold text-rose-600">{urgentTotal}</p>
                    </div>
                </Card>
            </div>

            <Card>
                <CardHeader title="Approval Queue" subtitle="Open each workflow from this consolidated view" />
                <div className="space-y-3">
                    {pendingApprovals.map((item) => (
                        <Link
                            key={item.type}
                            to={APPROVAL_ROUTES[item.type] ?? '/dashboard/pending-approvals'}
                            className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-4 cursor-pointer hover:bg-ink-50 transition-colors"
                        >
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${item.bgClass} ${item.colorClass}`}>
                                {APPROVAL_ICONS[item.type]}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-ink-900">{item.type}</p>
                                <p className="text-xs text-ink-500">{item.count} pending items</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {item.urgentCount > 0 && <Badge tone="red">{item.urgentCount} urgent</Badge>}
                                <Badge tone="blue">{item.count} total</Badge>
                            </div>
                        </Link>
                    ))}
                </div>
            </Card>
        </div>
    );
}
