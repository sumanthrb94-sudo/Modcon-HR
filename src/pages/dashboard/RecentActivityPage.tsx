import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Avatar, Button, Card, CardHeader, PageHeader } from '@/components/ui';
import { activityFeed } from '@/data/dashboard';
import { timeAgo } from '@/lib/utils';

export function RecentActivityPage() {
    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Recent Activity"
                subtitle="Complete activity stream across modules"
                actions={
                    <Link to="/">
                        <Button variant="secondary" size="sm" icon={<ArrowLeft size={14} />}>
                            Back to Dashboard
                        </Button>
                    </Link>
                }
            />

            <Card>
                <CardHeader title="Activity Feed" subtitle={`${activityFeed.length} events`} />
                <div className="space-y-4">
                    {activityFeed.map((item) => (
                        <div key={item.id} className="flex items-start gap-3 rounded-xl border border-ink-100 bg-ink-50 px-3 py-3">
                            <Avatar name={item.actor} size="sm" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-ink-700 leading-relaxed">
                                    <span className="font-semibold text-ink-800">{item.actor}</span>
                                    {' '}{item.action}{' '}
                                    <span className="font-medium text-brand-600">{item.subject}</span>
                                </p>
                                <p className="text-xs text-ink-400 mt-1">{timeAgo(item.timestamp)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}
