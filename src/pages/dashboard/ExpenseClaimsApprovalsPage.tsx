import { ChevronLeft, IndianRupee } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui';
import { expenseClaims } from '@/data/expenses';
import { employees } from '@/data/employees';
import { formatDate, formatINR } from '@/lib/utils';
import type { ExpenseStatus } from '@/types';

export function ExpenseClaimsApprovalsPage() {
    const navigate = useNavigate();
    const [claimStatuses, setClaimStatuses] = useState<Record<string, ExpenseStatus>>(() =>
        expenseClaims.reduce((acc, claim) => {
            acc[claim.id] = claim.status;
            return acc;
        }, {} as Record<string, ExpenseStatus>),
    );

    function updateClaimStatus(claimId: string, status: 'Approved' | 'Rejected') {
        setClaimStatuses((prev) => ({ ...prev, [claimId]: status }));
    }

    const pendingClaims = useMemo(
        () => expenseClaims
            .filter((c) => claimStatuses[c.id] === 'Submitted')
            .sort((a, b) => new Date(b.submittedOn).getTime() - new Date(a.submittedOn).getTime()),
        [claimStatuses],
    );

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Expense Claims"
                subtitle={`${pendingClaims.length} submitted claims awaiting approval`}
                actions={
                    <Button variant="secondary" size="sm" icon={<ChevronLeft size={14} />} onClick={() => navigate('/dashboard/pending-approvals')}>
                        Back to Pending Approvals
                    </Button>
                }
            />

            <Card>
                <CardHeader title="Pending Expense Claims" subtitle="Only submitted claims are listed" />
                {pendingClaims.length === 0 ? (
                    <p className="text-sm text-ink-400 text-center py-6">No pending expense claims</p>
                ) : (
                    <div className="space-y-3">
                        {pendingClaims.map((claim) => {
                            const employee = employees.find((e) => e.id === claim.employeeId);
                            return (
                                <div key={claim.id} className="rounded-xl border border-ink-100 bg-white p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                                            <IndianRupee size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-sm font-semibold text-ink-900">{claim.title}</p>
                                                <Badge tone="amber">{claim.category}</Badge>
                                            </div>
                                            <p className="text-xs text-ink-500 mt-1">
                                                {employee?.fullName ?? claim.employeeId} · Submitted {formatDate(claim.submittedOn)}
                                            </p>
                                            <p className="text-sm text-ink-700 mt-2">{claim.description}</p>
                                            <div className="flex items-center gap-2 mt-3">
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => updateClaimStatus(claim.id, 'Approved')}
                                                >
                                                    Approve
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-rose-600 hover:text-rose-700"
                                                    onClick={() => updateClaimStatus(claim.id, 'Rejected')}
                                                >
                                                    Decline
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-sm font-semibold text-ink-900">{formatINR(claim.amount)}</p>
                                            <p className="text-xs text-ink-500">Expense date: {formatDate(claim.date)}</p>
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
