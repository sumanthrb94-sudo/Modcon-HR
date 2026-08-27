import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarDays } from 'lucide-react';

import { Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui';
import { getHolidayDirectory, holidayYearsCovered } from '@/data/holidays';
import { useHolidayDirectoryRevision } from '@/lib/useHolidayDirectoryRevision';
import { dayOfMonth, formatDate, formatMonthShort, formatMonthYearLong } from '@/lib/utils';

function holidayTone(type: string) {
    if (type === 'National') return 'green' as const;
    if (type === 'Regional') return 'blue' as const;
    return 'amber' as const;
}

export function HolidayCalendarPage() {
    const holidayRevision = useHolidayDirectoryRevision();
    const holidays = useMemo(() => getHolidayDirectory(), [holidayRevision]);

    const byMonth = useMemo(() => {
        const sorted = [...holidays].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const groups: Record<string, typeof holidays> = {};

        sorted.forEach((holiday) => {
            const month = formatMonthYearLong(holiday.date);
            if (!groups[month]) groups[month] = [];
            groups[month].push(holiday);
        });

        return Object.entries(groups);
    }, [holidays]);

    // Derived from the holidays themselves rather than a literal year, which
    // was a second claim about the calendar that could disagree with the list
    // under it — and did, every January.
    const yearsCovered = useMemo(() => holidayYearsCovered(holidays), [holidays]);

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Holiday Calendar"
                subtitle={
                    yearsCovered
                        ? `Complete holiday schedule for ${yearsCovered}`
                        : 'No holidays have been declared yet'
                }
                actions={
                    <Link to="/">
                        <Button variant="secondary" size="sm" icon={<ArrowLeft size={14} />}>
                            Back to Dashboard
                        </Button>
                    </Link>
                }
            />

            <Card>
                <CardHeader
                    title="All Holidays"
                    subtitle={`${holidays.length} listed days`}
                    action={<Badge tone="blue" dot><CalendarDays size={12} /> Company Calendar</Badge>}
                />

                <div className="space-y-5">
                    {/* An empty calendar means nobody has declared any, not
                        that the year has none — and the difference is worth
                        stating, because everything computed against this
                        calendar (leave charges, attendance, pay) is currently
                        being computed against nothing. */}
                    {byMonth.length === 0 && (
                        <p className="text-sm text-ink-400 text-center py-8">
                            No holidays have been declared for this organisation. An administrator
                            adds them in Settings → Holidays; until then, no day is treated as a
                            company holiday when leave is charged or attendance is counted.
                        </p>
                    )}
                    {byMonth.map(([month, monthHolidays]) => (
                        <section key={month}>
                            <h3 className="text-sm font-semibold text-ink-700 mb-2">{month}</h3>
                            <div className="space-y-2">
                                {monthHolidays.map((holiday) => (
                                    <div
                                        key={holiday.id}
                                        className="flex items-center gap-3 rounded-xl border border-ink-100 bg-ink-50 px-3 py-2.5"
                                    >
                                        <div className="h-10 w-10 rounded-xl bg-brand-600 text-white flex flex-col items-center justify-center text-center leading-none shrink-0">
                                            <span className="text-[10px] font-semibold uppercase opacity-80">
                                                {formatMonthShort(holiday.date)}
                                            </span>
                                            <span className="text-lg font-bold">{dayOfMonth(holiday.date)}</span>
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-ink-800">{holiday.name}</p>
                                            <p className="text-xs text-ink-500">{formatDate(holiday.date)}</p>
                                        </div>

                                        <Badge tone={holidayTone(holiday.type)}>{holiday.type}</Badge>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </Card>
        </div>
    );
}
