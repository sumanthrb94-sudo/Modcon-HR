import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Phone,
  MessageSquare,
  Sparkles,
  Users,
  Calendar,
  Clock,
  MapPin,
  DollarSign,
  ArrowRight,
  Lock,
  Smartphone,
  Layers,
  ChevronRight,
  TrendingDown,
  Building2,
  Zap,
  HelpCircle,
  FileSpreadsheet,
  Check,
  Star,
  Award,
  Globe2,
} from 'lucide-react';
import { BrandLockup, BrandMark } from '@/components/ui';

export function LandingPage() {
  const [employeeCount, setEmployeeCount] = useState<number>(35);
  const [activeTab, setActiveTab] = useState<'attendance' | 'payroll' | 'shifts' | 'geofence'>('attendance');

  // Pricing calculations based on company rules:
  // <10 employees: FREE
  // 10-49 employees: 3 months free trial, then ₹50 / emp / mo
  // 50+ employees: ₹50 / emp / mo capped at maximum ₹5,000 / mo
  const { modconMonthlyCost, legacyMonthlyCost, annualSavings, trialMessage } = useMemo(() => {
    let cost = 0;
    if (employeeCount < 10) {
      cost = 0;
    } else if (employeeCount <= 49) {
      cost = employeeCount * 50;
    } else {
      cost = Math.min(employeeCount * 50, 5000);
    }

    const legacy = employeeCount * 220; // Average market rate of Darwinbox/Keka/GreytHR
    const monthlyDiff = Math.max(0, legacy - cost);
    const savings = monthlyDiff * 12;

    let trial = '';
    if (employeeCount < 10) trial = '100% Free Forever for under 10 employees';
    else if (employeeCount <= 49) trial = '3 Months Free Trial included — no credit card needed';
    else trial = 'Enterprise Cap: Maximum subscription of ₹5,000/mo';

    return {
      modconMonthlyCost: cost,
      legacyMonthlyCost: legacy,
      annualSavings: savings,
      trialMessage: trial,
    };
  }, [employeeCount]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-brand-500 selection:text-white">
      {/* --------------------------------------------------------------------- */}
      {/* TOP EMERGENCY HOTLINE & LOGIN BANNER                                 */}
      {/* --------------------------------------------------------------------- */}
      <aside aria-label="Announcement" className="bg-gradient-to-r from-brand-700 via-brand-600 to-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-inner">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2">
            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-extrabold">NEW</span>
            <span>Zero False LOP Engine with 1-Click Whole-Month Attendance Regularization is live!</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <a
              href="tel:9700144003"
              className="flex items-center gap-1.5 hover:underline decoration-white/70 transition-colors"
            >
              <Phone size={13} className="text-amber-200" />
              <span>Direct Hotline: <strong className="text-amber-100 font-mono">9700144003</strong></span>
            </a>
            <span className="hidden sm:inline text-white/40">|</span>
            <Link
              to="/login"
              className="hidden sm:inline-flex items-center gap-1 hover:text-amber-200 transition-colors"
            >
              <Lock size={12} />
              <span>Employee Portal</span>
            </Link>
          </div>
        </div>
      </aside>

      {/* --------------------------------------------------------------------- */}
      {/* STICKY MAIN NAVIGATION                                                */}
      {/* --------------------------------------------------------------------- */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/85 border-b border-slate-800/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="p-1 rounded-lg bg-slate-900 border border-slate-700/60 shadow-md group-hover:border-brand-500/80 transition-colors">
              <BrandMark size={28} />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-extrabold text-xl tracking-tight text-white flex items-center gap-1">
                MODCON <span className="text-brand-500">HR</span>
              </span>
              <span className="text-[10px] font-medium tracking-widest uppercase text-slate-400">Enterprise HRMS</span>
            </div>
          </Link>

          {/* Center Navigation Links */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#problems" className="hover:text-white transition-colors">Problems in Legacy HR</a>
            <a href="#solutions" className="hover:text-white transition-colors">Our Solutions</a>
            <a href="#features" className="hover:text-white transition-colors">Platform Features</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing & Trial</a>
            <a href="#calculator" className="hover:text-white transition-colors">ROI Calculator</a>
          </nav>

          {/* Right Action CTA Buttons */}
          <div className="flex items-center gap-3">
            {/* Phone Quick Dial CTA */}
            <a
              href="tel:9700144003"
              className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-xs font-semibold text-slate-200 transition-all shadow-sm"
              title="Speak with an enterprise specialist"
            >
              <Phone size={14} className="text-brand-400 animate-bounce" />
              <span className="font-mono">9700144003</span>
            </a>

            {/* CORPORATE LOGIN BUTTON - Visible & Clickable */}
            <Link
              to="/login"
              id="corporate-login-nav-btn"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-600 text-white text-xs sm:text-sm font-bold shadow-lg shadow-brand-500/20 hover:shadow-brand-500/35 border border-brand-400/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Lock size={15} className="text-brand-100" />
              <span>Corporate Login</span>
            </Link>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------------------- */}
      {/* HERO SECTION                                                          */}
      {/* --------------------------------------------------------------------- */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28">
        {/* Glow ambient background effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[350px] bg-brand-600/15 blur-[140px] pointer-events-none rounded-full" />
        <div className="absolute top-1/3 right-10 w-[350px] h-[250px] bg-amber-500/10 blur-[120px] pointer-events-none rounded-full" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          {/* Pill Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-semibold text-slate-300 shadow-xl mb-6">
            <Sparkles size={14} className="text-amber-400" />
            <span>Built by 30-Year Systems Architects for Indian Corporates & Startups</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-[1.12]">
            Stop Losing Money on <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-brand-400 to-amber-300">Stupid HR Tools</span> That Flag Week-Offs As Absent.
          </h1>

          {/* Subheading */}
          <p className="mt-6 text-base sm:text-lg lg:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
            Conventional HR software costs ₹300/seat, punishes employees on Sundays, forces 50-step regularization, and breaks during payroll.
            <strong className="text-white font-semibold"> Modcon HR</strong> is the zero-false-flag platform with 1-click bulk approvals, multi-location geofencing, and pricing starting at just <strong className="text-emerald-400 font-bold">₹50/seat with 3 months free trial</strong>.
          </p>

          {/* Primary Action Buttons */}
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4 max-w-lg mx-auto">
            {/* CTA Phone / WhatsApp Call */}
            <a
              href="tel:9700144003"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 via-brand-500 to-amber-600 hover:from-brand-500 hover:to-amber-500 text-white font-bold text-sm shadow-xl shadow-brand-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Phone size={17} className="text-amber-200" />
              <span>Schedule Demo: 9700144003</span>
            </a>

            {/* Corporate Login CTA */}
            <Link
              to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-700 hover:border-slate-500 text-white font-semibold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md"
            >
              <Lock size={16} className="text-brand-400" />
              <span>Corporate Employee Login</span>
              <ArrowRight size={15} className="text-slate-400" />
            </Link>
          </div>

          {/* Quick Guarantees & Features */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 size={15} /> 100% Free under 10 employees
            </span>
            <span className="flex items-center gap-1.5 text-sky-400">
              <CheckCircle2 size={15} /> 3 Months Free Trial for 10–49 seats
            </span>
            <span className="flex items-center gap-1.5 text-amber-400">
              <CheckCircle2 size={15} /> Maximum Cap ₹5,000 / month
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <CheckCircle2 size={15} /> No credit card required to start
            </span>
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* HERO VISUAL: ATTENDANCE CALENDAR SHOWCASE                         */}
          {/* ----------------------------------------------------------------- */}
          <div className="mt-14 max-w-5xl mx-auto rounded-2xl border border-slate-800 bg-slate-900/80 p-2 sm:p-4 shadow-2xl backdrop-blur-md">
            <div className="rounded-xl border border-slate-700/60 bg-slate-950 p-4 sm:p-6 text-left">
              {/* Window Bar */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-rose-500/80" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 text-xs font-mono text-slate-400 hidden sm:inline">Modcon HR · Intelligent Attendance Engine</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded-full">
                    Zero False LOP Active
                  </span>
                </div>
              </div>

              {/* Sample Live Calendar Showcase */}
              <div className="mt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-base font-bold text-white">September 2026 Monthly Attendance Master</h2>
                    <p className="text-xs text-slate-400">22 Present · 4 WFH · 4 Week Offs (Sundays) · 3 Official Holidays · 0 False Red Flags</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded bg-brand-900/40 text-brand-300 border border-brand-700/50">
                      Bulk Regularize Month (Ready)
                    </span>
                  </div>
                </div>

                {/* Calendar Grid Demo */}
                <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-xs">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                    <div key={day} className={`py-1 rounded font-bold text-[10px] uppercase tracking-wider ${i >= 5 ? 'text-slate-400 bg-slate-900/60' : 'text-slate-300 bg-slate-800/50'}`}>
                      {day}
                    </div>
                  ))}

                  {/* Sample 7 Days representing real tiles */}
                  {/* Mon Sept 14 (Ganesh Chaturthi Holiday) */}
                  <div className="p-2 rounded-lg bg-teal-950/40 border border-teal-700/60 flex flex-col justify-between min-h-[64px] text-left">
                    <div className="flex justify-between items-center text-[10px] text-teal-400 font-mono font-bold">
                      <span>14</span>
                      <span className="text-[9px] bg-teal-800/80 text-teal-200 px-1 rounded">Holiday</span>
                    </div>
                    <div className="text-[10px] font-semibold text-teal-200 truncate">Ganesh Chaturthi</div>
                  </div>

                  {/* Tue Sept 15 (Present) */}
                  <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-700/60 flex flex-col justify-between min-h-[64px] text-left">
                    <div className="flex justify-between items-center text-[10px] text-emerald-400 font-mono font-bold">
                      <span>15</span>
                      <span className="text-[9px] bg-emerald-800/80 text-emerald-200 px-1 rounded">Present</span>
                    </div>
                    <div className="text-[10px] font-mono text-emerald-300">08:58 – 18:02 (9.0h)</div>
                  </div>

                  {/* Wed Sept 16 (Present) */}
                  <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-700/60 flex flex-col justify-between min-h-[64px] text-left">
                    <div className="flex justify-between items-center text-[10px] text-emerald-400 font-mono font-bold">
                      <span>16</span>
                      <span className="text-[9px] bg-emerald-800/80 text-emerald-200 px-1 rounded">Present</span>
                    </div>
                    <div className="text-[10px] font-mono text-emerald-300">09:02 – 18:05 (9.0h)</div>
                  </div>

                  {/* Thu Sept 17 (Present) */}
                  <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-700/60 flex flex-col justify-between min-h-[64px] text-left">
                    <div className="flex justify-between items-center text-[10px] text-emerald-400 font-mono font-bold">
                      <span>17</span>
                      <span className="text-[9px] bg-emerald-800/80 text-emerald-200 px-1 rounded">Present</span>
                    </div>
                    <div className="text-[10px] font-mono text-emerald-300">08:55 – 18:00 (9.1h)</div>
                  </div>

                  {/* Fri Sept 18 (Present) */}
                  <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-700/60 flex flex-col justify-between min-h-[64px] text-left">
                    <div className="flex justify-between items-center text-[10px] text-emerald-400 font-mono font-bold">
                      <span>18</span>
                      <span className="text-[9px] bg-emerald-800/80 text-emerald-200 px-1 rounded">Present</span>
                    </div>
                    <div className="text-[10px] font-mono text-emerald-300">09:00 – 18:00 (9.0h)</div>
                  </div>

                  {/* Sat Sept 19 (WFH) */}
                  <div className="p-2 rounded-lg bg-sky-950/40 border border-sky-700/60 flex flex-col justify-between min-h-[64px] text-left">
                    <div className="flex justify-between items-center text-[10px] text-sky-400 font-mono font-bold">
                      <span>19</span>
                      <span className="text-[9px] bg-sky-800/80 text-sky-200 px-1 rounded">WFH</span>
                    </div>
                    <div className="text-[10px] font-mono text-sky-300">09:05 – 18:05 (9.0h)</div>
                  </div>

                  {/* Sun Sept 20 (Week Off - NOT RED, NOT ABSENT!) */}
                  <div className="p-2 rounded-lg bg-slate-900/80 border border-dashed border-slate-700 flex flex-col justify-between min-h-[64px] text-left">
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono font-bold">
                      <span>20</span>
                      <span className="text-[9px] bg-slate-800 text-slate-300 px-1 rounded">Off</span>
                    </div>
                    <div className="text-[10px] font-semibold text-slate-400">Rostered Rest Day</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* SECTION 1: PROBLEMS IN REGULAR HR TOOLS VS MODCON SOLUTIONS          */}
      {/* --------------------------------------------------------------------- */}
      <section id="problems" className="py-20 bg-slate-900/60 border-t border-slate-800 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-extrabold uppercase tracking-widest text-brand-400 bg-brand-950/80 border border-brand-800/70 px-3 py-1 rounded-full">
              The Reality Check
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Why 92% of Companies Complain About Their Current HR Software
            </h2>
            <p className="mt-3 text-slate-400 text-sm sm:text-base">
              Legacy HR systems were built 15 years ago for rigid corporate hierarchies. They create friction, introduce false salary cuts, and waste hundreds of hours every month.
            </p>
          </div>

          {/* 6 Key Comparison Blocks */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-rose-600" />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold font-mono text-rose-400 flex items-center gap-1.5">
                    <XCircle size={15} /> THE LEGACY PROBLEM
                  </span>
                  <span className="text-[10px] bg-rose-950 border border-rose-800 text-rose-300 px-2 py-0.5 rounded font-mono">Pain Point #1</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">False Absences & LOP on Week-Offs</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Regular tools hardcode rules or glitch on organisation week-off configs, marking Sundays or dual week-offs (Sat & Sun) as missing punch & unexcused absence, deducting employee salaries wrongfully.
                </p>

                <div className="my-5 p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/60">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 mb-1">
                    <CheckCircle2 size={14} /> THE MODCON SOLUTION
                  </div>
                  <p className="text-xs text-emerald-200/90 leading-relaxed">
                    Dynamic tenant-level & employee-level primary and secondary week-off engine with auto-synced official national holidays. Rest days are never flagged absent.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-rose-600" />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold font-mono text-rose-400 flex items-center gap-1.5">
                    <XCircle size={15} /> THE LEGACY PROBLEM
                  </span>
                  <span className="text-[10px] bg-rose-950 border border-rose-800 text-rose-300 px-2 py-0.5 rounded font-mono">Pain Point #2</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Tedious 1-By-1 Regularizations</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  If biometric devices miss a punch, employees have to click and submit 20 separate regularizations for one month. Managers drown in dozens of separate approval emails.
                </p>

                <div className="my-5 p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/60">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 mb-1">
                    <CheckCircle2 size={14} /> THE MODCON SOLUTION
                  </div>
                  <p className="text-xs text-emerald-200/90 leading-relaxed">
                    1-Click Whole-Month Bulk Regularization. Select all actionable days at once before payroll processing with pre-filled shift reasons and admin instant clearance.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 3 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-rose-600" />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold font-mono text-rose-400 flex items-center gap-1.5">
                    <XCircle size={15} /> THE LEGACY PROBLEM
                  </span>
                  <span className="text-[10px] bg-rose-950 border border-rose-800 text-rose-300 px-2 py-0.5 rounded font-mono">Pain Point #3</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Exorbitant Pricing & Lock-in Fees</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Competitors charge ₹150 to ₹350 per employee per month with minimum billing commitments, ₹30,000 implementation setup costs, and annual lock-ins.
                </p>

                <div className="my-5 p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/60">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 mb-1">
                    <CheckCircle2 size={14} /> THE MODCON SOLUTION
                  </div>
                  <p className="text-xs text-emerald-200/90 leading-relaxed">
                    Honest, founder-friendly pricing: Free under 10 employees. 3 Months Free Trial for 10-49 seats. Flat ₹50/emp/mo capped at a maximum of ₹5,000/mo.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 4 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-rose-600" />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold font-mono text-rose-400 flex items-center gap-1.5">
                    <XCircle size={15} /> THE LEGACY PROBLEM
                  </span>
                  <span className="text-[10px] bg-rose-950 border border-rose-800 text-rose-300 px-2 py-0.5 rounded font-mono">Pain Point #4</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Fake GPS & Location Spoofing</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Employees easily bypass standard mobile app check-ins using fake mock location tools, checking in from their beds while claiming to be at work.
                </p>

                <div className="my-5 p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/60">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 mb-1">
                    <CheckCircle2 size={14} /> THE MODCON SOLUTION
                  </div>
                  <p className="text-xs text-emerald-200/90 leading-relaxed">
                    Cryptographic multi-location geofencing with Wi-Fi BSSID validation, mock-location detection, and automated audit telemetry stamps.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 5 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-rose-600" />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold font-mono text-rose-400 flex items-center gap-1.5">
                    <XCircle size={15} /> THE LEGACY PROBLEM
                  </span>
                  <span className="text-[10px] bg-rose-950 border border-rose-800 text-rose-300 px-2 py-0.5 rounded font-mono">Pain Point #5</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Clunky UI & Mobile Overlapping</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Outdated interfaces that overflow off phone screens, unreadable text, broken touch targets, and confusing nested menus that frustrate employees.
                </p>

                <div className="my-5 p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/60">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 mb-1">
                    <CheckCircle2 size={14} /> THE MODCON SOLUTION
                  </div>
                  <p className="text-xs text-emerald-200/90 leading-relaxed">
                    Ultra-clean mobile-first aesthetic with color-coded high-contrast day tiles, zero text clipping, smooth micro-animations, and instant responses.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 6 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-rose-600" />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold font-mono text-rose-400 flex items-center gap-1.5">
                    <XCircle size={15} /> THE LEGACY PROBLEM
                  </span>
                  <span className="text-[10px] bg-rose-950 border border-rose-800 text-rose-300 px-2 py-0.5 rounded font-mono">Pain Point #6</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Disconnected Payroll & Tax Errors</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Attendance data must be exported into Excel, manually massaged to fix missing punch days, and imported into a separate payroll software with constant errors.
                </p>

                <div className="my-5 p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/60">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 mb-1">
                    <CheckCircle2 size={14} /> THE MODCON SOLUTION
                  </div>
                  <p className="text-xs text-emerald-200/90 leading-relaxed">
                    Direct real-time attendance-to-payroll pipeline. Automated Indian statutory calculations (EPF, ESI, PT, TDS) and one-click salary slip generation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* SECTION 2: INTERACTIVE ROI & SAVINGS CALCULATOR                       */}
      {/* --------------------------------------------------------------------- */}
      <section id="calculator" className="py-20 relative bg-slate-950 border-t border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-900/80 to-slate-950 p-6 sm:p-10 shadow-2xl">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-3 py-1 rounded-full">
                Interactive ROI Calculator
              </span>
              <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold text-white">
                How Much Are You Overpaying With Legacy HRMS?
              </h2>
              <p className="mt-2 text-slate-400 text-sm">
                Slide to select your active employee headcount and see your instant financial savings.
              </p>
            </div>

            {/* Slider Control */}
            <div className="max-w-xl mx-auto mb-10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-300">Number of Employees</span>
                <span className="text-2xl font-extrabold text-brand-400 font-mono">{employeeCount} seats</span>
              </div>
              <input
                type="range"
                min="3"
                max="250"
                value={employeeCount}
                onChange={(e) => setEmployeeCount(Number(e.target.value))}
                className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
              <div className="flex justify-between text-[11px] text-slate-500 font-mono mt-1">
                <span>3 (Free Tier)</span>
                <span>49 (Trial Tier)</span>
                <span>100</span>
                <span>250 (Capped ₹5k)</span>
              </div>
            </div>

            {/* Comparison Output Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              {/* Other HR Tools */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Other HRMS Tools (Avg ₹220/seat)</span>
                <div className="my-4">
                  <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-300">₹{legacyMonthlyCost.toLocaleString('en-IN')}</span>
                  <span className="text-xs text-slate-500 block">/ month</span>
                </div>
                <span className="text-[11px] text-rose-400">+ Implementation & Setup Fees</span>
              </div>

              {/* Modcon HR */}
              <div className="p-5 rounded-2xl bg-gradient-to-b from-brand-950/70 to-slate-950 border border-brand-700/80 flex flex-col justify-between relative shadow-xl shadow-brand-950/50">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-[10px] font-extrabold uppercase px-3 py-0.5 rounded-full shadow-sm">
                  Modcon HR
                </div>
                <span className="text-xs font-semibold text-brand-300 uppercase tracking-wider mt-2">Modcon HR Plan</span>
                <div className="my-4">
                  <span className="text-3xl sm:text-4xl font-extrabold font-mono text-white">
                    {modconMonthlyCost === 0 ? 'FREE' : `₹${modconMonthlyCost.toLocaleString('en-IN')}`}
                  </span>
                  <span className="text-xs text-brand-300/80 block">{modconMonthlyCost === 0 ? 'Forever' : '/ month'}</span>
                </div>
                <span className="text-[11px] font-medium text-emerald-400">{trialMessage}</span>
              </div>

              {/* Annual Savings */}
              <div className="p-5 rounded-2xl bg-emerald-950/30 border border-emerald-800/80 flex flex-col justify-between">
                <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Your Annual Savings</span>
                <div className="my-4">
                  <span className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400">
                    ₹{annualSavings.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-emerald-300/80 block">Saved Every Year</span>
                </div>
                <span className="text-[11px] text-emerald-400 font-semibold">Zero lock-in · Cancel anytime</span>
              </div>
            </div>

            {/* Direct Call to Action */}
            <div className="mt-10 text-center flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="tel:9700144003"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-900/40 transition-all hover:scale-[1.02]"
              >
                <Phone size={15} />
                <span>Call 9700144003 to Activate Plan</span>
              </a>
              <Link
                to="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-sm transition-all"
              >
                <Lock size={14} className="text-brand-400" />
                <span>Log into Corporate Console</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* SECTION 3: CORE PRODUCT PILLARS & SOLUTIONS                           */}
      {/* --------------------------------------------------------------------- */}
      <section id="features" className="py-20 bg-slate-900/40 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="text-xs font-extrabold uppercase tracking-widest text-sky-400 bg-sky-950/80 border border-sky-800 px-3 py-1 rounded-full">
              Engineered For Reliability
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-white">
              Every Tool Your HR & Finance Teams Need
            </h2>
            <p className="mt-2 text-slate-400 text-sm sm:text-base">
              From biometric clock-ins to automated Form-16 payslips, everything runs synchronously in real time.
            </p>
          </div>

          {/* Interactive Feature Category Pills */}
          <div className="flex items-center justify-center gap-2 flex-wrap mb-10">
            <button
              onClick={() => setActiveTab('attendance')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${activeTab === 'attendance' ? 'bg-brand-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'}`}
            >
              📅 Attendance & Zero-LOP
            </button>
            <button
              onClick={() => setActiveTab('payroll')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${activeTab === 'payroll' ? 'bg-brand-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'}`}
            >
              💵 Payroll & Compliance
            </button>
            <button
              onClick={() => setActiveTab('shifts')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${activeTab === 'shifts' ? 'bg-brand-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'}`}
            >
              🔄 Multi-Shift Rostering
            </button>
            <button
              onClick={() => setActiveTab('geofence')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${activeTab === 'geofence' ? 'bg-brand-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'}`}
            >
              📍 Geofenced Mobile Punch
            </button>
          </div>

          {/* Feature Showcase Details */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950 p-6 sm:p-10 shadow-2xl">
            {activeTab === 'attendance' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="inline-block p-2 rounded-lg bg-brand-950 border border-brand-800 text-brand-400 mb-3">
                    <Calendar size={22} />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Bulletproof Attendance Engine</h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-4">
                    Eliminate month-end HR panics. Our calendar tracks Worked Hours, Work From Home, Half Days, and Approved Leaves in real time with high visual clarity.
                  </p>
                  <ul className="space-y-2.5 text-xs text-slate-300 mb-6">
                    <li className="flex items-center gap-2"><Check className="text-emerald-400" size={16} /> 1-Click Whole-Month Bulk Regularization before payroll cutoff</li>
                    <li className="flex items-center gap-2"><Check className="text-emerald-400" size={16} /> Week-offs (Sundays or Sat/Sun) are mathematically protected from absent status</li>
                    <li className="flex items-center gap-2"><Check className="text-emerald-400" size={16} /> Live sync with Indian National and Regional holiday calendars</li>
                  </ul>
                  <a href="tel:9700144003" className="text-xs font-bold text-brand-400 hover:text-brand-300 flex items-center gap-1">
                    Request Live Attendance Demo →
                  </a>
                </div>
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Bulk Regularize Month</span>
                      <span className="text-[11px] text-slate-400">Instantly address all unregularized anomalies</span>
                    </div>
                    <span className="px-2.5 py-1 rounded bg-brand-600 text-white text-xs font-bold">1-Click</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Auto-Approved Clearance</span>
                      <span className="text-[11px] text-slate-400">Admin toggle to clear LOP before issuing salaries</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold">Protected</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'payroll' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="inline-block p-2 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-400 mb-3">
                    <DollarSign size={22} />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Indian Statutory Payroll Engine</h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-4">
                    Run compliant monthly salaries in 30 seconds. Configurable salary structures (Basic, HRA, Special Allowance) with automatic deduction formulas.
                  </p>
                  <ul className="space-y-2.5 text-xs text-slate-300 mb-6">
                    <li className="flex items-center gap-2"><Check className="text-emerald-400" size={16} /> Automated PF, ESI, Professional Tax, and Income Tax deductions</li>
                    <li className="flex items-center gap-2"><Check className="text-emerald-400" size={16} /> One-click PDF salary slip downloads with company branding</li>
                    <li className="flex items-center gap-2"><Check className="text-emerald-400" size={16} /> Automatic Loss of Pay (LOP) recalculation linked directly to attendance</li>
                  </ul>
                  <a href="tel:9700144003" className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                    Ask About Payroll Rules: 9700144003 →
                  </a>
                </div>
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 font-mono text-xs">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex justify-between">
                    <span className="text-slate-400">Monthly Gross CTC:</span>
                    <span className="text-white font-bold">₹1,25,000</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex justify-between">
                    <span className="text-slate-400">EPF + ESI + PT Deduction:</span>
                    <span className="text-rose-400">-₹4,200</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-emerald-800 flex justify-between text-emerald-300 font-bold">
                    <span>Net Disbursed Salary:</span>
                    <span>₹1,20,800</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'shifts' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="inline-block p-2 rounded-lg bg-sky-950 border border-sky-800 text-sky-400 mb-3">
                    <Clock size={22} />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Dynamic Multi-Shift Rostering</h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-4">
                    Whether you run a 24x7 IT support rota or morning/afternoon retail shifts, Modcon HR supports individual and group shift assignments seamlessly.
                  </p>
                  <ul className="space-y-2.5 text-xs text-slate-300 mb-6">
                    <li className="flex items-center gap-2"><Check className="text-emerald-400" size={16} /> Night shift support spanning past UTC midnight</li>
                    <li className="flex items-center gap-2"><Check className="text-emerald-400" size={16} /> Flexible grace periods per department or individual</li>
                    <li className="flex items-center gap-2"><Check className="text-emerald-400" size={16} /> Dual week-off configurations (e.g. 5-day work week) per employee</li>
                  </ul>
                  <a href="tel:9700144003" className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1">
                    Configure Shift Policies: 9700144003 →
                  </a>
                </div>
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                    <span className="font-semibold text-white">General Shift</span>
                    <span className="text-slate-400 font-mono">09:00 – 18:00 (15m grace)</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                    <span className="font-semibold text-white">Evening Support Shift</span>
                    <span className="text-slate-400 font-mono">14:00 – 23:00 (15m grace)</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                    <span className="font-semibold text-white">Overnight Ops Shift</span>
                    <span className="text-slate-400 font-mono">22:00 – 07:00 (Next day)</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'geofence' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="inline-block p-2 rounded-lg bg-amber-950 border border-amber-800 text-amber-400 mb-3">
                    <MapPin size={22} />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Tamper-Proof Geofencing</h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-4">
                    Lock attendance check-ins to exact company office coordinates. Automatically block mock locations and fake GPS check-in apps.
                  </p>
                  <ul className="space-y-2.5 text-xs text-slate-300 mb-6">
                    <li className="flex items-center gap-2"><Check className="text-emerald-400" size={16} /> Configurable meter radius per branch office location</li>
                    <li className="flex items-center gap-2"><Check className="text-emerald-400" size={16} /> Optional client geofence exemptions for field sales reps</li>
                    <li className="flex items-center gap-2"><Check className="text-emerald-400" size={16} /> Real-time check-in coordinates stored with cryptographic evidence</li>
                  </ul>
                  <a href="tel:9700144003" className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1">
                    Test Geofencing Hotline: 9700144003 →
                  </a>
                </div>
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5 text-xs">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white block">Bengaluru HQ</span>
                      <span className="text-[11px] text-slate-400">12.9716° N, 77.5946° E</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold">150m Radius</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white block">Hyderabad Tech Park</span>
                      <span className="text-[11px] text-slate-400">17.3850° N, 78.4867° E</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold">200m Radius</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* SECTION 4: TRANSPARENT PRICING                                       */}
      {/* --------------------------------------------------------------------- */}
      <section id="pricing" className="py-20 bg-slate-950 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-3 py-1 rounded-full">
              Transparent & Founder-Friendly
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-white">
              Predictable Pricing. No Per-Seat Traps.
            </h2>
            <p className="mt-3 text-slate-400 text-sm sm:text-base">
              Free for early startups. 3 months free trial for growing businesses. Capped at ₹5,000 for standard enterprises.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Tier 1: Free Startup */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-7 flex flex-col justify-between hover:border-slate-700 transition-all">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Startup Plan</span>
                <h3 className="text-2xl font-bold text-white mt-1">Under 10 Seats</h3>
                <p className="text-xs text-slate-400 mt-2">Perfect for young ventures and early founding teams.</p>
                <div className="my-6">
                  <span className="text-4xl font-extrabold text-white">₹0</span>
                  <span className="text-xs text-slate-400 ml-1">/ Free Forever</span>
                </div>
                <ul className="space-y-3 text-xs text-slate-300">
                  <li className="flex items-center gap-2"><Check className="text-emerald-400" size={15} /> Up to 9 active employees</li>
                  <li className="flex items-center gap-2"><Check className="text-emerald-400" size={15} /> Full attendance & mobile check-in</li>
                  <li className="flex items-center gap-2"><Check className="text-emerald-400" size={15} /> Leave management & holiday sync</li>
                  <li className="flex items-center gap-2"><Check className="text-emerald-400" size={15} /> Company newsfeed & announcements</li>
                  <li className="flex items-center gap-2"><Check className="text-emerald-400" size={15} /> No credit card needed</li>
                </ul>
              </div>
              <div className="mt-8">
                <Link
                  to="/login"
                  className="w-full inline-flex items-center justify-center py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-all border border-slate-700"
                >
                  Start Free Now
                </Link>
              </div>
            </div>

            {/* Tier 2: 10-49 Growth (Featured) */}
            <div className="rounded-3xl border-2 border-brand-500 bg-gradient-to-b from-slate-900 to-slate-950 p-7 flex flex-col justify-between relative shadow-2xl shadow-brand-950/60 scale-105 z-10">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-brand-600 to-amber-500 text-white text-[11px] font-extrabold uppercase px-4 py-1 rounded-full shadow-md">
                3 MONTHS FREE TRIAL
              </div>
              <div>
                <span className="text-xs font-bold text-brand-400 uppercase tracking-wider">Growth Plan</span>
                <h3 className="text-2xl font-bold text-white mt-1">10 to 49 Seats</h3>
                <p className="text-xs text-slate-300 mt-2">Zero risk for expanding companies.</p>
                <div className="my-6">
                  <span className="text-4xl font-extrabold text-white">₹50</span>
                  <span className="text-xs text-slate-400 ml-1">/ employee / month</span>
                  <span className="block text-[11px] text-amber-300 font-semibold mt-1">🎉 3 Months Completely Free</span>
                </div>
                <ul className="space-y-3 text-xs text-slate-200">
                  <li className="flex items-center gap-2"><Check className="text-brand-400" size={15} /> Everything in Startup Tier</li>
                  <li className="flex items-center gap-2"><Check className="text-brand-400" size={15} /> 1-Click Whole-Month Bulk Regularization</li>
                  <li className="flex items-center gap-2"><Check className="text-brand-400" size={15} /> Statutory Indian Payroll & Payslips</li>
                  <li className="flex items-center gap-2"><Check className="text-brand-400" size={15} /> Geofenced mobile punches</li>
                  <li className="flex items-center gap-2"><Check className="text-brand-400" size={15} /> Dedicated WhatsApp onboarding</li>
                </ul>
              </div>
              <div className="mt-8">
                <a
                  href="tel:9700144003"
                  className="w-full inline-flex items-center justify-center py-3 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-600 text-white font-bold text-xs shadow-lg shadow-brand-500/25 transition-all"
                >
                  <Phone size={14} className="mr-1.5" /> Call 9700144003 For Free Trial
                </a>
              </div>
            </div>

            {/* Tier 3: Enterprise 50+ (Capped) */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-7 flex flex-col justify-between hover:border-slate-700 transition-all">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Enterprise Scale</span>
                <h3 className="text-2xl font-bold text-white mt-1">50+ Seats</h3>
                <p className="text-xs text-slate-400 mt-2">Maximum subscription cap at ₹5,000.</p>
                <div className="my-6">
                  <span className="text-4xl font-extrabold text-white">₹50</span>
                  <span className="text-xs text-slate-400 ml-1">/ employee / month</span>
                  <span className="block text-[11px] text-emerald-400 font-semibold mt-1">Max Cap: ₹5,000 / month flat</span>
                </div>
                <ul className="space-y-3 text-xs text-slate-300">
                  <li className="flex items-center gap-2"><Check className="text-emerald-400" size={15} /> Unlimited employees supported</li>
                  <li className="flex items-center gap-2"><Check className="text-emerald-400" size={15} /> Multi-office branch geofences</li>
                  <li className="flex items-center gap-2"><Check className="text-emerald-400" size={15} /> Custom multi-shift policies</li>
                  <li className="flex items-center gap-2"><Check className="text-emerald-400" size={15} /> Bank payout NEFT/RTGS batch files</li>
                  <li className="flex items-center gap-2"><Check className="text-emerald-400" size={15} /> 99.9% Enterprise uptime SLA</li>
                </ul>
              </div>
              <div className="mt-8">
                <a
                  href="tel:9700144003"
                  className="w-full inline-flex items-center justify-center py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-all border border-slate-700"
                >
                  Speak With Enterprise Sales
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* FINAL CALL TO ACTION                                                  */}
      {/* --------------------------------------------------------------------- */}
      <section className="py-20 relative bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border-t border-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="p-8 sm:p-12 rounded-3xl bg-slate-900/90 border border-slate-700 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-600/10 rounded-full blur-3xl pointer-events-none" />

            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Ready to Upgrade to Stress-Free HR Management?
            </h2>
            <p className="mt-4 text-slate-300 text-sm sm:text-base max-w-xl mx-auto">
              Schedule a personalized walkthrough with our system engineers today. We will migrate your team in under 24 hours with zero downtime.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="tel:9700144003"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl bg-gradient-to-r from-brand-600 to-amber-600 hover:from-brand-500 hover:to-amber-500 text-white font-bold text-base shadow-xl shadow-brand-600/30 transition-all hover:scale-105 active:scale-95"
              >
                <Phone size={19} className="text-amber-200" />
                <span>Call Hotline: 9700144003</span>
              </a>

              {/* CORPORATE LOGIN BUTTON */}
              <Link
                to="/login"
                id="corporate-login-cta-btn"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold text-base transition-all hover:scale-105 active:scale-95 shadow-md"
              >
                <Lock size={18} className="text-brand-400" />
                <span>Corporate Login</span>
              </Link>
            </div>

            <p className="mt-6 text-xs text-slate-400">
              Direct Phone & WhatsApp: <strong className="text-slate-200 font-mono">+91 97001 44003</strong> · Available Mon–Sat 09:00 to 19:00 IST
            </p>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* FOOTER                                                                */}
      {/* --------------------------------------------------------------------- */}
      <footer className="bg-slate-950 border-t border-slate-900 py-12 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <BrandMark size={24} />
            <span className="font-display font-extrabold text-white text-sm">MODCON <span className="text-brand-500">HR</span></span>
            <span className="text-slate-600">|</span>
            <span>Enterprise Multi-Tenant Human Resources Operating System</span>
          </div>

          <div className="flex items-center gap-6 flex-wrap justify-center">
            <Link to="/login" className="hover:text-white transition-colors font-medium">Corporate Login</Link>
            <Link to="/careers" className="hover:text-white transition-colors font-medium">Careers</Link>
            <a href="tel:9700144003" className="hover:text-brand-400 transition-colors font-mono font-bold">+91 97001 44003</a>
          </div>

          <p className="text-slate-600">
            © {new Date().getFullYear()} Modcon HR Systems. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
export default LandingPage;
