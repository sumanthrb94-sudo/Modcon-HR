// ===========================================================================
// ModCon HR — Cozy Daily Briefing & Intelligent Morning Digest
// ===========================================================================
// Benchmarked against BambooHR & HiBob:
// 1. Personalized morning welcome with time-of-day warmth
// 2. Personal punch-in & hours logged snapshot
// 3. "Who's Out in My Team Today" real-time presence
// 4. Action-required digest (zero tab-hunting)
// 5. Company moments & upcoming holiday countdown
// ===========================================================================

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Sun,
  Coffee,
  Moon,
  Clock,
  Users,
  CheckCircle2,
  CalendarDays,
  Sparkles,
  ArrowRight,
  MapPin,
  CalendarOff,
} from 'lucide-react';
import { Badge, Avatar, Button } from '@/components/ui';
import type { Employee } from '@/types';
import type { UserProfile } from '@/lib/auth';
import { getAttendanceRecordFor, getAttendanceRecords } from '@/data/attendance';
import { getEmployeeDirectory } from '@/data/employees';
import { getOnLeaveToday, getLeaveRequests } from '@/data/leave';
import { getHolidayDirectory } from '@/data/holidays';
import { currentHour, todayIso } from '@/lib/today';
import { formatDate, formatDateShort, formatWeekdayLong } from '@/lib/utils';

interface CozyDailyBriefingProps {
  currentEmployee?: Employee | null;
  profile: UserProfile | null;
  isManager: boolean;
  pendingApprovalsCount?: number;
}

export function CozyDailyBriefing({
  currentEmployee,
  profile,
  isManager,
  pendingApprovalsCount = 0,
}: CozyDailyBriefingProps) {
  const hour = currentHour();
  const today = todayIso();
  const firstName = currentEmployee?.fullName?.split(' ')[0] ?? profile?.displayName?.split(' ')[0] ?? 'there';

  // 1. Time-of-day greeting
  const greeting = useMemo(() => {
    if (hour < 12) {
      return { text: `Good morning, ${firstName}`, icon: <Coffee size={20} className="text-amber-600" /> };
    }
    if (hour < 17) {
      return { text: `Good afternoon, ${firstName}`, icon: <Sun size={20} className="text-amber-500" /> };
    }
    return { text: `Good evening, ${firstName}`, icon: <Moon size={20} className="text-indigo-500" /> };
  }, [hour, firstName]);

  // 2. Personal Attendance Status
  const myAttendance = useMemo(() => {
    if (!currentEmployee?.id) return null;
    return getAttendanceRecordFor(currentEmployee.id, today);
  }, [currentEmployee?.id, today]);

  // 3. Team Pulse (Peers in the same department)
  const teamPulse = useMemo(() => {
    if (!currentEmployee?.department) {
      return { total: 0, present: 0, wfh: 0, onLeave: [] };
    }
    const dir = getEmployeeDirectory();
    const deptPeers = dir.filter(
      (e) => e.department === currentEmployee.department && e.id !== currentEmployee.id,
    );
    const peerIds = new Set(deptPeers.map((p) => p.id));
    const allAttendance = getAttendanceRecords().filter((r) => r.date === today && peerIds.has(r.employeeId));

    const onLeavePeers = getOnLeaveToday(today)
      .filter((r) => peerIds.has(r.employeeId))
      .map((r) => ({
        request: r,
        name: dir.find((e) => e.id === r.employeeId)?.fullName ?? 'Teammate',
        designation: dir.find((e) => e.id === r.employeeId)?.designation ?? '',
      }));

    const presentCount = allAttendance.filter((r) => r.status === 'Present').length;
    const wfhCount = allAttendance.filter((r) => r.status === 'Work From Home').length;

    return {
      total: deptPeers.length,
      present: presentCount,
      wfh: wfhCount,
      onLeave: onLeavePeers,
    };
  }, [currentEmployee?.department, currentEmployee?.id, today]);

  // 4. Next upcoming holiday
  const nextHoliday = useMemo(() => {
    const upcoming = getHolidayDirectory()
      .filter((h) => h.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] ?? null;
  }, [today]);

  // 5. My pending leave requests
  const myPendingLeaves = useMemo(() => {
    if (!currentEmployee?.id) return 0;
    return getLeaveRequests().filter(
      (r) => r.employeeId === currentEmployee.id && r.status === 'Pending',
    ).length;
  }, [currentEmployee?.id]);

  return (
    <div
      data-testid="cozy-daily-briefing"
      className="relative overflow-hidden rounded-2xl border border-brand-200/80 bg-gradient-to-br from-brand-50/70 via-white to-amber-50/50 p-5 md:p-6 shadow-sm transition-all"
    >
      {/* Decorative accent glow */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-brand-200/30 blur-2xl" />
      <div className="pointer-events-none absolute -left-12 -bottom-12 h-44 w-44 rounded-full bg-amber-200/25 blur-2xl" />

      {/* Header bar */}
      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-ink-100">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm border border-brand-100 shrink-0">
            {greeting.icon}
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
              {greeting.text} 👋
            </h1>
            <p className="text-xs md:text-sm text-ink-500 mt-0.5">
              {formatWeekdayLong(today)}, {formatDate(today)} ·{' '}
              <span className="font-medium text-ink-700">
                {currentEmployee?.department ?? 'General'} · {currentEmployee?.designation ?? 'Team Member'}
              </span>
            </p>
          </div>
        </div>

        {/* Live Attendance Snapshot */}
        <div className="flex items-center gap-3 bg-white/90 border border-ink-200/80 rounded-xl px-4 py-2.5 shadow-xs">
          <Clock size={18} className="text-brand-600 shrink-0" />
          {currentEmployee ? (
            <>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-ink-900">
                    {myAttendance?.checkIn ? `Checked In: ${myAttendance.checkIn}` : 'Not Checked In Yet'}
                  </span>
                  <Badge tone={myAttendance?.checkIn ? 'green' : 'amber'} dot className="text-[11px] px-2 py-0.5">
                    {myAttendance?.status ?? 'Pending Punch'}
                  </Badge>
                </div>
                <p className="text-[11px] text-ink-500 mt-0.5">
                  {myAttendance?.checkIn
                    ? `${myAttendance.workedHours > 0 ? `${myAttendance.workedHours.toFixed(1)} hrs logged today` : 'Session active'} · ${myAttendance.isLate ? 'Late arrival' : 'On schedule'}`
                    : 'Tap to mark your arrival in My Attendance'}
                </p>
              </div>
              {!myAttendance?.checkIn && (
                <Link to="/my-attendance">
                  <Button size="sm" variant="secondary" className="text-xs ml-2">
                    Punch In
                  </Button>
                </Link>
              )}
            </>
          ) : (
            <>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-ink-900">
                    Attendance Master
                  </span>
                  <Badge tone="blue" dot className="text-[11px] px-2 py-0.5">
                    Admin Mode
                  </Badge>
                </div>
                <p className="text-[11px] text-ink-500 mt-0.5">
                  Manage organization attendance & logs
                </p>
              </div>
              <Link to="/attendance">
                <Button size="sm" variant="secondary" className="text-xs ml-2">
                  Mark Attendance
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Intelligent Summaries Grid */}
      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4 pt-5">
        {/* Card 1: Team Out & Presence */}
        <div className="rounded-xl bg-white/90 border border-ink-100 p-4 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
              <Users size={14} className="text-brand-600" />
              Team Pulse · {currentEmployee?.department ?? 'My Team'}
            </span>
            <Badge tone="blue">{teamPulse.total} Colleagues</Badge>
          </div>

          {teamPulse.onLeave.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50/70 rounded-lg p-2.5">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>All team members are available today. No one is on leave.</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-ink-700">
                {teamPulse.onLeave.length} teammate{teamPulse.onLeave.length > 1 ? 's' : ''} on leave today:
              </p>
              <div className="space-y-1">
                {teamPulse.onLeave.slice(0, 2).map((peer) => (
                  <div key={peer.request.id} className="flex items-center justify-between text-xs bg-ink-50 rounded px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      <Avatar name={peer.name} size="xs" />
                      <span className="font-medium text-ink-800">{peer.name}</span>
                    </div>
                    <span className="text-[11px] text-ink-500">{peer.request.type} Leave</span>
                  </div>
                ))}
                {teamPulse.onLeave.length > 2 && (
                  <span className="text-[11px] text-ink-400 block pt-0.5">
                    +{teamPulse.onLeave.length - 2} more on leave
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 text-[11px] text-ink-500 pt-1 border-t border-ink-50">
            <span>🟢 {teamPulse.present} Present</span>
            <span>🔵 {teamPulse.wfh} Remote/WFH</span>
          </div>
        </div>

        {/* Card 2: Action Required / Approvals Digest */}
        <div className="rounded-xl bg-white/90 border border-ink-100 p-4 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
              <Sparkles size={14} className="text-amber-600" />
              Action Digest
            </span>
            {isManager && pendingApprovalsCount > 0 ? (
              <Badge tone="amber">{pendingApprovalsCount} Pending</Badge>
            ) : (
              <Badge tone="green">Clear</Badge>
            )}
          </div>

          {isManager ? (
            pendingApprovalsCount > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-ink-700">
                  You have <strong className="text-amber-800">{pendingApprovalsCount}</strong> pending request(s) awaiting your manager review.
                </p>
                <Link
                  to="/attendance"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                >
                  Review regularizations & leaves <ArrowRight size={13} />
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50/70 rounded-lg p-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>You're all caught up! No team approvals currently waiting.</span>
              </div>
            )
          ) : myPendingLeaves > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-ink-700">
                You have <strong className="text-brand-700">{myPendingLeaves}</strong> submitted leave request(s) currently awaiting manager decision.
              </p>
              <Link
                to="/leave"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
              >
                Track in Leave Management <ArrowRight size={13} />
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50/70 rounded-lg p-2.5">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>No pending items. Have a focused, productive day!</span>
            </div>
          )}

          <div className="pt-1 border-t border-ink-50 text-[11px] text-ink-500">
            Quick shortcut: <Link to="/leave" className="text-brand-600 hover:underline">Apply for Time Off</Link>
          </div>
        </div>

        {/* Card 3: Company Moments & Next Holiday */}
        <div className="rounded-xl bg-white/90 border border-ink-100 p-4 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
              <CalendarDays size={14} className="text-emerald-600" />
              Company Moments
            </span>
            <Link
              to="/dashboard/holiday-calendar"
              className="text-[11px] font-medium text-brand-600 hover:underline"
            >
              Calendar →
            </Link>
          </div>

          {nextHoliday ? (
            <div className="bg-emerald-50/60 border border-emerald-100/80 rounded-lg p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-emerald-950">{nextHoliday.name}</p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    {formatWeekdayLong(nextHoliday.date)}, {formatDateShort(nextHoliday.date)}
                  </p>
                </div>
                <Badge tone="green" className="text-[10px] px-1.5 py-0">
                  {nextHoliday.type}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink-500">No company holidays scheduled in the coming weeks.</p>
          )}

          <div className="pt-1 border-t border-ink-50 flex items-center justify-between text-[11px] text-ink-500">
            <span>🎉 Next month cycle is active</span>
            <Link to="/careers" className="text-brand-600 hover:underline">Internal Openings</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
