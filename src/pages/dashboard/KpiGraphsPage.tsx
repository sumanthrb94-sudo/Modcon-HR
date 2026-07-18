import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, Briefcase, CalendarCheck, CalendarOff, Clock, TrendingUp, Users } from 'lucide-react';

import { Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui';
import { employees } from '@/data/employees';

const TODAY = '2026-06-10';

interface KpiMetric {
    label: string;
    value: number;
    delta: number;
    color: string;
    icon: JSX.Element;
    unit?: 'count' | 'percent' | 'years';
    deltaLabel: string;
}

function roundByUnit(value: number, unit: KpiMetric['unit']) {
    if (unit === 'percent' || unit === 'years') return Number(value.toFixed(1));
    return Math.round(value);
}

function formatValue(value: number, unit: KpiMetric['unit']) {
    if (unit === 'percent') return `${value.toFixed(1)}%`;
    if (unit === 'years') return `${value.toFixed(1)} yrs`;
    return `${Math.round(value)}`;
}

function getPreviousValue(current: number, delta: number, unit: KpiMetric['unit']) {
    const ratio = 1 + delta / 100;
    const previous = ratio === 0 ? current : current / ratio;
    return roundByUnit(previous, unit);
}

export function KpiGraphsPage() {
    const stats = useMemo(() => {
        const total = employees.length;
        const active = employees.filter((e) => e.status === 'Active').length;
        const onLeave = employees.filter((e) => e.status === 'On Leave').length;
        const notice = employees.filter((e) => e.status === 'Notice Period').length;

        const presentToday = Math.round(active * 0.87);
        const openPositions = 8;
        const attritionRate = parseFloat(((notice / total) * 100 * 4).toFixed(1));
        const avgTenure = parseFloat(
            (
                employees.reduce((acc, e) => {
                    const ms = new Date(TODAY).getTime() - new Date(e.dateOfJoining).getTime();
                    return acc + ms / (1000 * 60 * 60 * 24 * 365);
                }, 0) / total
            ).toFixed(1),
        );

        return {
            total,
            presentToday,
            onLeaveCardValue: onLeave + 2,
            openPositions,
            attritionRate,
            avgTenure,
        };
    }, []);

    const metrics = useMemo<KpiMetric[]>(
        () => [
            {
                label: 'Total Employees',
                value: stats.total,
                delta: 5.3,
                color: '#3366ff',
                icon: <Users size={16} />,
                unit: 'count',
                deltaLabel: 'vs last quarter',
            },
            {
                label: 'Present Today',
                value: stats.presentToday,
                delta: 2.1,
                color: '#10b981',
                icon: <CalendarCheck size={16} />,
                unit: 'count',
                deltaLabel: 'vs yesterday',
            },
            {
                label: 'On Leave',
                value: stats.onLeaveCardValue,
                delta: -1,
                color: '#8b5cf6',
                icon: <CalendarOff size={16} />,
                unit: 'count',
                deltaLabel: 'vs last week',
            },
            {
                label: 'Open Positions',
                value: stats.openPositions,
                delta: 14.3,
                color: '#f59e0b',
                icon: <Briefcase size={16} />,
                unit: 'count',
                deltaLabel: 'vs last month',
            },
            {
                label: 'Attrition Rate',
                value: stats.attritionRate,
                delta: -0.8,
                color: '#f43f5e',
                icon: <TrendingUp size={16} />,
                unit: 'percent',
                deltaLabel: 'vs last quarter',
            },
            {
                label: 'Avg. Tenure',
                value: stats.avgTenure,
                delta: 3.2,
                color: '#06b6d4',
                icon: <Clock size={16} />,
                unit: 'years',
                deltaLabel: 'vs last year',
            },
        ],
        [stats],
    );

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="KPI Graphs"
                subtitle="Separate graphs for dashboard KPI cards"
                actions={
                    <Link to="/">
                        <Button variant="secondary" size="sm" icon={<ArrowLeft size={14} />}>
                            Back to Dashboard
                        </Button>
                    </Link>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {metrics.map((metric) => {
                    const previous = getPreviousValue(metric.value, metric.delta, metric.unit);
                    const current = roundByUnit(metric.value, metric.unit);
                    const chartData = [
                        { period: 'Previous', value: previous },
                        { period: 'Current', value: current },
                    ];

                    return (
                        <Card key={metric.label}>
                            <CardHeader
                                title={metric.label}
                                subtitle={`Current: ${formatValue(current, metric.unit)} · ${metric.deltaLabel}`}
                                action={<Badge tone={metric.delta >= 0 ? 'green' : 'red'}>{metric.delta > 0 ? '+' : ''}{metric.delta}%</Badge>}
                            />

                            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink-600">
                                <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${metric.color}1A`, color: metric.color }}>
                                    {metric.icon}
                                </span>
                                <span>
                                    Previous: {formatValue(previous, metric.unit)}
                                </span>
                            </div>

                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        formatter={(value: number) => [formatValue(Number(value), metric.unit), metric.label]}
                                        contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 12 }}
                                    />
                                    <Bar dataKey="value" fill={metric.color} radius={[8, 8, 0, 0]} maxBarSize={52} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
