import { ChevronLeft, Megaphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui';
import { announcements } from '@/data/common';
import { formatDate, timeAgo } from '@/lib/utils';

function annTone(category: string) {
    if (category === 'Policy') return 'amber' as const;
    if (category === 'Event') return 'blue' as const;
    if (category === 'Celebration') return 'green' as const;
    return 'gray' as const;
}

export function AnnouncementsPage() {
    const navigate = useNavigate();

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="All Announcements"
                subtitle="Full announcement content with complete details"
                actions={
                    <Button variant="secondary" size="sm" icon={<ChevronLeft size={14} />} onClick={() => navigate('/')}>
                        Back to Dashboard
                    </Button>
                }
            />

            <Card>
                <CardHeader title="Announcements Feed" subtitle={`${announcements.length} published posts`} />
                <div className="space-y-4">
                    {announcements.map((ann) => (
                        <article key={ann.id} className="rounded-xl border border-ink-100 bg-white p-4">
                            <div className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0 mt-0.5">
                                    <Megaphone size={16} className="text-brand-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <h3 className="text-base font-semibold text-ink-900">{ann.title}</h3>
                                        <Badge tone={annTone(ann.category)}>{ann.category}</Badge>
                                    </div>
                                    <p className="text-xs text-ink-500 mb-2">
                                        {formatDate(ann.date)} · {timeAgo(ann.date)} · {ann.author}
                                    </p>
                                    <p className="text-sm text-ink-700 leading-relaxed">{ann.body}</p>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            </Card>
        </div>
    );
}
