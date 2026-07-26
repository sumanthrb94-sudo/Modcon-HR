import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Users, TrendingDown, Clock, IndianRupee, Heart,
  BarChart2, Calendar, Briefcase, Award, Activity,
  FileText, Download, ChevronRight, UserCheck,
} from 'lucide-react';
import {
  PageHeader, StatCard, Card, CardHeader, Badge, Button, Select,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import {
  headcountByDepartment,
  genderDiversity,
  tenureDistribution,
  headcountGrowth,
  salaryByDepartment,
  hiringFunnel,
  attendanceTrend,
  employmentTypeSplit,
  totalHeadcount,
  activeHeadcount,
  avgTenureYears,
  totalAnnualPayroll,
  diversityRatio,
  currentAttritionRate,
  departmentCount,
  locationCount,
  attendanceSummary,
  openRolesCount,
  avgTimeToHireDays,
  performanceSummary,
} from '@/data/reports';
import { departments } from '@/data/departments';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { useDepartmentDirectoryRevision } from '@/lib/useDepartmentDirectoryRevision';
import { useDashboardDataRevision } from '@/lib/useDashboardDataRevision';

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------
const PALETTE = {
  brand: '#6366f1',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  indigo: '#4f46e5',
  teal: '#14b8a6',
  pink: '#ec4899',
  orange: '#f97316',
};

const PIE_COLORS = [PALETTE.brand, PALETTE.emerald, PALETTE.amber, PALETTE.rose, PALETTE.violet, PALETTE.cyan];

// ---------------------------------------------------------------------------
// Tiny shared chart wrapper
// ---------------------------------------------------------------------------
function ChartCard({ title, subtitle, children, className }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={subtitle} />
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shown in place of a chart when the underlying records do not exist. Kept
// explicit rather than rendering empty axes, which read as "measured zero".
// ---------------------------------------------------------------------------
function NoData({ message, height = 220 }: { message: string; height?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl border border-dashed border-ink-200 px-4 text-center text-sm text-ink-400"
      style={{ height }}
    >
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom tooltip for recharts
// ---------------------------------------------------------------------------
interface TooltipPayloadItem {
  color?: string;
  name?: string;
  value?: number | string;
}

function CustomTooltip({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  formatter?: (val: number | string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-ink-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-ink-700 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {formatter ? formatter(p.value ?? 0) : p.value}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report library cards
// ---------------------------------------------------------------------------
interface ReportCard {
  icon: React.ReactNode;
  title: string;
  description: string;
  kpis: { label: string; value: string }[];
  color: string;
  bg: string;
  route: string;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export function ReportsPage() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState('ytd');
  const [deptFilter, setDeptFilter] = useState('all');
  const directoryRevision = useEmployeeDirectoryRevision();
  const departmentRevision = useDepartmentDirectoryRevision();
  const dataRevision = useDashboardDataRevision();

  // Compute derived data
  const hcByDept = useMemo(() => headcountByDepartment(), [directoryRevision, departmentRevision]);
  const genderData = useMemo(() => genderDiversity(), [directoryRevision]);
  const tenureData = useMemo(() => tenureDistribution().map((d) => ({ name: d.bucket, count: d.count })), [directoryRevision]);
  const salaryData = useMemo(() => salaryByDepartment().map((d) => ({
    dept: d.department.length > 10 ? d.department.slice(0, 10) + '…' : d.department,
    cost: d.cost,
  })), [directoryRevision, departmentRevision]);
  const empTypeSplit = useMemo(() => employmentTypeSplit(), [directoryRevision]);
  const headcountSeries = useMemo(() => headcountGrowth(), [directoryRevision]);
  const funnelData = useMemo(() => hiringFunnel(), [dataRevision]);
  const attendanceSeries = useMemo(() => attendanceTrend(), [directoryRevision, dataRevision]);

  const headcount = totalHeadcount();
  const active = activeHeadcount();
  const attrition = currentAttritionRate();
  const tenure = avgTenureYears();
  const payroll = totalAnnualPayroll();
  const diversity = diversityRatio();
  const deptCount = departmentCount();
  const locCount = locationCount();
  const attendance = attendanceSummary();
  const openRoles = openRolesCount();
  const avgTTH = avgTimeToHireDays();
  const performance = performanceSummary();

  const deptOptions = [
    { label: 'All Departments', value: 'all' },
    ...departments.map((d) => ({ label: d, value: d })),
  ];

  const dateOptions = [
    { label: 'This Month', value: 'month' },
    { label: 'Last Quarter', value: 'quarter' },
    { label: 'Year to Date', value: 'ytd' },
  ];

  const reportLibrary: ReportCard[] = [
    {
      icon: <Users size={20} />,
      title: 'Headcount Report',
      description: 'Workforce composition, department breakdown, and headcount trends over time.',
      kpis: [{ label: 'Total Employees', value: String(headcount) }, { label: 'Active', value: String(active) }],
      color: 'text-brand-600',
      bg: 'bg-brand-50',
      route: '/employees',
    },
    {
      icon: <Calendar size={20} />,
      title: 'Attendance Report',
      description: 'Daily attendance rates, late arrivals, work-from-home split, and absenteeism.',
      kpis: [{ label: 'Avg Rate', value: `${attendance.avgRate}%` }, { label: 'WFH Days', value: `${attendance.wfhPercent}%` }],
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      route: '/attendance',
    },
    {
      icon: <IndianRupee size={20} />,
      title: 'Payroll Report',
      description: 'Monthly payroll cost, department-wise spend, tax liability, and PF contributions.',
      kpis: [{ label: 'Monthly Cost', value: formatINR(payroll / 12, { compact: true }) }, { label: 'Dept Cost', value: `${deptCount} depts` }],
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      route: '/payroll',
    },
    {
      icon: <Briefcase size={20} />,
      title: 'Recruitment Report',
      description: 'Open positions, offer acceptance rates, time-to-hire, and source effectiveness.',
      kpis: [{ label: 'Open Roles', value: String(openRoles) }, { label: 'Avg TTH', value: `${avgTTH} days` }],
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      route: '/recruitment',
    },
    {
      icon: <Heart size={20} />,
      title: 'DEI Report',
      description: 'Gender diversity, inclusion metrics, pay equity analysis, and representation data.',
      kpis: [{ label: 'Female Ratio', value: `${diversity}%` }, { label: 'Locations', value: String(locCount) }],
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      route: '/employees',
    },
    {
      icon: <Award size={20} />,
      title: 'Performance Report',
      description: 'Review completion rates, rating distributions, goal attainment, and top performers.',
      kpis: [{ label: 'Completed', value: `${performance.completedPercent}%` }, { label: 'Avg Rating', value: `${performance.avgRating}/5` }],
      color: 'text-cyan-600',
      bg: 'bg-cyan-50',
      route: '/performance',
    },
  ];

  function handleExport() {
    const rows = [
      ['Department', 'Headcount'],
      ...hcByDept.map((d) => [d.department, String(d.count)]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `workforce-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Reports & Analytics"
        subtitle="Workforce insights, trends, and HR intelligence at a glance"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={dateRange} onChange={setDateRange} options={dateOptions} className="text-sm" />
            <Select value={deptFilter} onChange={setDeptFilter} options={deptOptions} className="text-sm" />
            <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={handleExport}>
              Export
            </Button>
          </div>
        }
      />

      {/* KPI headline row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          label="Total Headcount"
          value={headcount}
          icon={<Users size={20} />}
          iconClass="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="On Notice"
          value={`${attrition}%`}
          icon={<TrendingDown size={20} />}
          iconClass="bg-rose-50 text-rose-600"
        />
        <StatCard
          label="Avg Tenure"
          value={`${tenure} yrs`}
          icon={<Clock size={20} />}
          iconClass="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Annual Payroll"
          value={formatINR(payroll, { compact: true })}
          icon={<IndianRupee size={20} />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Diversity Ratio"
          value={`${diversity}% F`}
          icon={<UserCheck size={20} />}
          iconClass="bg-violet-50 text-violet-600"
        />
      </div>

      {/* Charts grid — row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Headcount Growth */}
        <ChartCard title="Headcount Growth" subtitle="12-month trajectory, by joining date">
          {headcountSeries.length === 0 ? (
            <NoData message="No employees on record yet." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={headcountSeries} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="hcGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.brand} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={PALETTE.brand} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 'auto']} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="headcount" stroke={PALETTE.brand} fill="url(#hcGrad)" strokeWidth={2} name="Headcount" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Notice-period rate — point in time, no reconstructable history */}
        <ChartCard title="On Notice" subtitle="Share of workforce serving notice">
          <div className="flex flex-col items-center justify-center" style={{ height: 220 }}>
            <p className="text-4xl font-bold text-ink-900">{attrition}%</p>
            <p className="mt-2 max-w-xs text-center text-sm text-ink-400">
              Employee status is not versioned, so past attrition rates cannot be reconstructed.
            </p>
          </div>
        </ChartCard>
      </div>

      {/* Charts grid — row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Headcount by department */}
        <ChartCard title="Headcount by Department" subtitle="Current distribution" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hcByDept} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="department" tick={{ fontSize: 11 }} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" fill={PALETTE.brand} radius={[0, 4, 4, 0]} name="Employees" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Gender diversity donut */}
        <ChartCard title="Gender Diversity">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={genderData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
              >
                {genderData.map((_entry, index) => (
                  <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend iconType="circle" iconSize={10} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts grid — row 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-5">
        {/* Tenure distribution */}
        <ChartCard title="Tenure Distribution">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={tenureData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" fill={PALETTE.violet} radius={[4, 4, 0, 0]} name="Employees" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Employment type */}
        <ChartCard title="Employment Type Split">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={empTypeSplit}
                cx="50%"
                cy="45%"
                innerRadius={45}
                outerRadius={72}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
              >
                {empTypeSplit.map((_entry, index) => (
                  <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Hiring funnel */}
        <ChartCard title="Hiring Funnel" subtitle="Current candidate pipeline">
          {funnelData.length === 0 ? (
            <NoData message="No candidates in the pipeline." height={200} />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={funnelData} layout="vertical" margin={{ top: 0, right: 20, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="stage" tick={{ fontSize: 11 }} width={55} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill={PALETTE.emerald} radius={[0, 4, 4, 0]} name="Candidates" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Attendance rate */}
        <ChartCard title="Attendance Rate" subtitle="Current week, by day">
          {attendanceSeries.length === 0 ? (
            <NoData message="No attendance has been marked yet." height={200} />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={attendanceSeries} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.teal} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={PALETTE.teal} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip formatter={(v) => `${v}%`} />} />
                <Area type="monotone" dataKey="rate" stroke={PALETTE.teal} fill="url(#attGrad)" strokeWidth={2} name="Rate %" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Salary by department */}
      <ChartCard title="Monthly Salary Cost by Department" subtitle="Cost to company / 12">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={salaryData} margin={{ top: 5, right: 20, left: 20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="dept" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => formatINR(v, { compact: true })} />
            <Tooltip content={<CustomTooltip formatter={(v) => formatINR(Number(v), { compact: true })} />} />
            <Bar dataKey="cost" fill={PALETTE.amber} radius={[4, 4, 0, 0]} name="Monthly Cost" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Report Library */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">Report Library</h2>
            <p className="text-sm text-ink-500 mt-0.5">Pre-built report templates across all HR modules</p>
          </div>
          <Button variant="secondary" size="sm" icon={<FileText size={14} />} onClick={handleExport}>
            All Reports
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {reportLibrary.map((r) => (
            <Card key={r.title} className="hover:shadow-card-hover transition-shadow">
              <div className="flex items-start gap-3 mb-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${r.bg} ${r.color} shrink-0`}>
                  {r.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-ink-900 text-sm">{r.title}</h3>
                  <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">{r.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 mb-3">
                {r.kpis.map((k) => (
                  <div key={k.label}>
                    <p className="text-xs text-ink-400">{k.label}</p>
                    <p className="text-sm font-semibold text-ink-800">{k.value}</p>
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" icon={<ChevronRight size={14} />} className="w-full justify-center" onClick={() => navigate(r.route)}>
                View Report
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* Quick insight banner */}
      <Card className="bg-gradient-to-r from-brand-600 to-violet-600 text-white">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity size={24} className="shrink-0 opacity-80" />
            <div>
              <p className="font-semibold text-base">AI-powered insights available</p>
              <p className="text-sm opacity-80 mt-0.5">Get automated anomaly detection and predictive attrition risk for your workforce.</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" className="shrink-0 !bg-white !text-brand-700 hover:!bg-brand-50 border-0" onClick={() => navigate('/dashboard/kpi-graphs')}>
            Explore AI Insights
          </Button>
        </div>
      </Card>
    </div>
  );
}
