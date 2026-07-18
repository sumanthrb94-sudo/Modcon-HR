import { useMemo, useState } from 'react';
import { Cake, ChevronLeft, Gift, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Avatar, Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui';
import { employees } from '@/data/employees';
import { formatDateShort } from '@/lib/utils';

const TODAY = '2026-06-10';
const TODAY_DATE = new Date(TODAY);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type CelebrationItem = {
    type: 'Birthday' | 'Anniversary';
    name: string;
    dept: string;
    date: string;
    years?: number;
};

export function CelebrationsPage() {
    const navigate = useNavigate();
    const [selectedMonth, setSelectedMonth] = useState<number>(TODAY_DATE.getMonth());

    const groupedCelebrations = useMemo(() => {
        const grouped: Record<number, CelebrationItem[]> = Object.fromEntries(MONTHS.map((_, index) => [index, []]));

        employees.forEach((employee) => {
            const birthdayMonth = new Date(employee.dateOfBirth).getMonth();
            grouped[birthdayMonth].push({
                type: 'Birthday',
                name: employee.fullName,
                dept: employee.department,
                date: employee.dateOfBirth,
            });

            const anniversaryMonth = new Date(employee.dateOfJoining).getMonth();
            const years = TODAY_DATE.getFullYear() - new Date(employee.dateOfJoining).getFullYear();
            grouped[anniversaryMonth].push({
                type: 'Anniversary',
                name: employee.fullName,
                dept: employee.department,
                date: employee.dateOfJoining,
                years,
            });
        });

        for (const monthIndex of Object.keys(grouped).map(Number)) {
            grouped[monthIndex].sort((a, b) => new Date(a.date).getDate() - new Date(b.date).getDate());
        }

        return grouped;
    }, []);

    const monthItems = groupedCelebrations[selectedMonth] ?? [];

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Celebrations Calendar"
                subtitle="Birthdays and work anniversaries for all 12 months"
                actions={
                    <Button variant="secondary" size="sm" icon={<ChevronLeft size={14} />} onClick={() => navigate('/')}>
                        Back to Dashboard
                    </Button>
                }
            />

            <Card>
                <CardHeader title="Browse by Month" subtitle="Open celebrations for any month" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {MONTHS.map((month, index) => {
                        const active = index === selectedMonth;
                        const count = groupedCelebrations[index]?.length ?? 0;
                        return (
                            <button
                                key={month}
                                type="button"
                                onClick={() => setSelectedMonth(index)}
                                className={`rounded-xl border px-3 py-2 text-left transition-colors ${active
                                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                                        : 'border-ink-100 bg-white hover:bg-ink-50 text-ink-700'
                                    }`}
                            >
                                <p className="text-sm font-semibold">{month}</p>
                                <p className="text-xs text-ink-500">{count} items</p>
                            </button>
                        );
                    })}
                </div>
            </Card>

            <Card>
                <CardHeader
                    title={`${MONTHS[selectedMonth]} Celebrations`}
                    subtitle={`${monthItems.length} birthdays and anniversaries`}
                    action={
                        <Badge tone="pink">
                            <Gift size={11} />
                            {MONTHS[selectedMonth]}
                        </Badge>
                    }
                />

                {monthItems.length === 0 ? (
                    <p className="text-sm text-ink-400 text-center py-6">No celebrations this month</p>
                ) : (
                    <div className="space-y-3">
                        {monthItems.map((item, idx) => {
                            const isBirthday = item.type === 'Birthday';
                            return (
                                <div key={`${item.name}-${item.type}-${idx}`} className="flex items-center gap-3 rounded-xl border border-ink-100 p-3">
                                    <Avatar name={item.name} size="sm" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-ink-900 truncate">{item.name}</p>
                                        <p className="text-xs text-ink-500">
                                            {item.dept} · {isBirthday ? `Birthday, ${formatDateShort(item.date)}` : `${item.years}yr Work Anniversary`}
                                        </p>
                                    </div>
                                    <Badge tone={isBirthday ? 'pink' : 'violet'}>
                                        {isBirthday ? <Cake size={11} /> : <Star size={11} />}
                                        {isBirthday ? 'Birthday' : `${item.years}yr`}
                                    </Badge>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
}
