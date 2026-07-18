import { ChevronLeft, CheckSquare } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui';
import { onboardings } from '@/data/onboarding';
import { formatDate } from '@/lib/utils';

export function OnboardingTasksApprovalsPage() {
    const navigate = useNavigate();
    const [taskDecisions, setTaskDecisions] = useState<Record<string, 'Open' | 'Approved' | 'Declined'>>({});

    function updateTaskDecision(taskKey: string, decision: 'Approved' | 'Declined') {
        setTaskDecisions((prev) => ({ ...prev, [taskKey]: decision }));
    }

    const pendingTasks = useMemo(
        () => onboardings
            .flatMap((onboarding) => onboarding.tasks
                .filter((task) => task.status !== 'Completed')
                .map((task) => ({
                    taskKey: `${onboarding.id}-${task.id}`,
                    onboardingId: onboarding.id,
                    employeeName: onboarding.employeeName,
                    designation: onboarding.designation,
                    startDate: onboarding.startDate,
                    ...task,
                })))
            .filter((task) => (taskDecisions[task.taskKey] ?? 'Open') === 'Open')
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
        [taskDecisions],
    );

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Onboarding Tasks"
                subtitle={`${pendingTasks.length} open tasks requiring follow-up`}
                actions={
                    <Button variant="secondary" size="sm" icon={<ChevronLeft size={14} />} onClick={() => navigate('/dashboard/pending-approvals')}>
                        Back to Pending Approvals
                    </Button>
                }
            />

            <Card>
                <CardHeader title="Open Onboarding Tasks" subtitle="Pending and in-progress tasks across new joiners" />
                {pendingTasks.length === 0 ? (
                    <p className="text-sm text-ink-400 text-center py-6">No open onboarding tasks</p>
                ) : (
                    <div className="space-y-3">
                        {pendingTasks.map((task) => (
                            <div key={task.taskKey} className="rounded-xl border border-ink-100 bg-white p-4">
                                <div className="flex items-start gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                        <CheckSquare size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-sm font-semibold text-ink-900">{task.title}</p>
                                            <Badge tone={task.status === 'In Progress' ? 'blue' : 'amber'}>{task.status}</Badge>
                                        </div>
                                        <p className="text-xs text-ink-500 mt-1">
                                            {task.employeeName} · {task.designation}
                                        </p>
                                        <p className="text-xs text-ink-500 mt-1">
                                            Due {formatDate(task.dueDate)} · Started {formatDate(task.startDate)} · {task.assignee}
                                        </p>
                                        <div className="flex items-center gap-2 mt-3">
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => updateTaskDecision(task.taskKey, 'Approved')}
                                            >
                                                Approve
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-rose-600 hover:text-rose-700"
                                                onClick={() => updateTaskDecision(task.taskKey, 'Declined')}
                                            >
                                                Decline
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}
