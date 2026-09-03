import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, Briefcase, CalendarCheck, CalendarOff, Clock, TrendingUp, Users } from 'lucide-react';

import { Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui';
import { getEmployeeDirectory } from '@/data/employees';
import {
    attendanceToday, avgTenureTrend, headcountTrend, noticePeriodRate,
    onLeaveToday, openPositionsCount, weeklyAttendanceSeries,
} from '@/data/dashboard';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { useDashboardDataRevision } from '@/lib/useDashboardDataRevision';
import { CHART_GRID, CHART_TICK_FILL, CHART_TOOLTIP_STYLE, chartSeriesColor } from '@/lib/chartTheme';

type Unit = 'count' | 'percent' | 'years';

interface KpiCard {
    label: string;
    current: number;
    unit: Unit;
    color: string;
    icon: ReactNode;
    /** Real recorded history. Empty when no series exists for this metric. */
    series: { period: string; value: number }[];
    seriesLabel: string;
    /** Only set when a period-over-period change is meaningful for the series. */
    showDelta: boolean;
    /** Shown in place of a chart when there is no history to plot. */
    note?: string;
}

function formatValue(value: number, unit: Unit) {
    if (unit === 'percent') return `${value.toFixed(1)}%`;
    if (unit === 'years') return `${value.toFixed(1)} yrs`;
    return `${Math.round(value)}`;
}

export function KpiGraphsPage() {
    const directoryRevision = useEmployeeDirectoryRevision();
    const dataRevision = useDashboardDataRevision();

    const cards = useMemo<KpiCard[]>(() => {
        const directory = getEmployeeDirectory();
        const headcount = headcountTrend();
        const tenure = avgTenureTrend();
        const week = weeklyAttendanceSeries();
        const today = attendanceToday();

        return [
            {
                label: 'Total Employees',
                current: directory.length,
                unit: 'count',
                color: chartSeriesColor(0),
                icon: <Users size={16} />,
                series: headcount.map((point) => ({ period: point.month, value: point.count })),
                seriesLabel: 'Cumulative joiners, last 12 months',
                showDelta: true,
            },
            {
                label: 'Present Today',
                current: today.present,
                unit: 'count',
                color: chartSeriesColor(1),
                icon: <CalendarCheck size={16} />,
                series: week.map((day) => ({ period: day.day, value: day.Present })),
                seriesLabel: 'Marked present, current week',
                // Mon-to-Fri is a within-week shape, not a trend — a delta
                // between the first and last day would not mean anything.
                showDelta: false,
                note: 'No attendance has been marked for this week yet.',
            },
            {
                label: 'On Leave',
                current: onLeaveToday(),
                unit: 'count',
                color: chartSeriesColor(2),
                icon: <CalendarOff size={16} />,
                series: week.map((day) => ({ period: day.day, value: day.Leave })),
                seriesLabel: 'On leave, current week',
                showDelta: false,
                note: 'No attendance has been marked for this week yet.',
            },
            {
                label: 'Open Positions',
                current: openPositionsCount(),
                unit: 'count',
                color: chartSeriesColor(3),
                icon: <Briefcase size={16} />,
                // Job openings carry no history — only their current status.
                series: [],
                seriesLabel: 'Current open roles',
                showDelta: false,
                note: 'Job openings are not versioned, so there is no history to chart.',
            },
            {
                label: 'On Notice',
                current: noticePeriodRate(),
                unit: 'percent',
                color: chartSeriesColor(4),
                icon: <TrendingUp size={16} />,
                // Employee status is a point-in-time field with no audit trail.
                series: [],
                seriesLabel: 'Share of workforce serving notice',
                showDelta: false,
                note: 'Employee status is not versioned, so past rates cannot be reconstructed.',
            },
            {
                label: 'Avg. Tenure',
                current: tenure.length ? tenure[tenure.length - 1].years : 0,
                unit: 'years',
                color: chartSeriesColor(5),
                icon: <Clock size={16} />,
                series: tenure.map((point) => ({ period: point.month, value: point.years })),
                seriesLabel: 'Mean tenure, last 12 months',
                showDelta: true,
            },
        ];
    }, [directoryRevision, dataRevision]);

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="KPI Graphs"
                subtitle="Dashboard KPIs over their recorded history"
                actions={
                    <Link to="/">
                        <Button variant="secondary" size="sm" icon={<ArrowLeft size={14} />}>
                            Back to Dashboard
                        </Button>
                    </Link>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {cards.map((card) => {
                    const hasSeries = card.series.some((point) => point.value > 0);
                    const first = card.series[0]?.value ?? 0;
                    const last = card.series[card.series.length - 1]?.value ?? 0;
                    const change = card.showDelta && hasSeries && first > 0
                        ? Math.round(((last - first) / first) * 1000) / 10
                        : null;

                    return (
                        <Card key={card.label}>
                            <CardHeader
                                title={card.label}
                                subtitle={`${formatValue(card.current, card.unit)} · ${card.seriesLabel}`}
                                action={change !== null ? (
                                    <Badge tone={change >= 0 ? 'green' : 'red'}>
                                        {change > 0 ? '+' : ''}{change}% over 12 months
                                    </Badge>
                                ) : undefined}
                            />

                            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink-600">
                                <span
                                    className="h-7 w-7 rounded-lg flex items-center justify-center"
                                    style={{ backgroundColor: `${card.color}1A`, color: card.color }}
                                >
                                    {card.icon}
                                </span>
                                <span>Current: {formatValue(card.current, card.unit)}</span>
                            </div>

                            {hasSeries ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={card.series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                                        <XAxis dataKey="period" tick={{ fontSize: 11, fill: CHART_TICK_FILL }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: CHART_TICK_FILL }} axisLine={false} tickLine={false} allowDecimals={card.unit !== 'count'} />
                                        <Tooltip
                                            formatter={(value: number) => [formatValue(Number(value), card.unit), card.label]}
                                            contentStyle={CHART_TOOLTIP_STYLE}
                                        />
                                        <Bar dataKey="value" fill={card.color} radius={[8, 8, 0, 0]} maxBarSize={52} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div
                                    className="flex items-center justify-center rounded-xl border border-dashed border-ink-100 px-4 text-center text-sm text-ink-400"
                                    style={{ height: 220 }}
                                >
                                    {card.note ?? 'No history recorded for this metric.'}
                                </div>
                            )}
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
