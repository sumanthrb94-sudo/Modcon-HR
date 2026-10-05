import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Phone,
  ArrowRight,
  Lock,
  Check,
  X,
  ShieldCheck,
  MessageCircle,
  Calendar,
  Building2,
  User,
  Mail,
  Loader2,
  CheckCircle2,
  FileCheck2,
  MapPin,
  Smartphone,
  Workflow,
  ArrowUpRight,
} from 'lucide-react';
import { BrandLockup, BrandMark } from '@/components/ui';
import { submitDemoRequest, getWhatsAppDemoLink } from '@/lib/demoRequests';
import { useAuth } from '@/lib/auth';

// Direct Vite asset pipeline imports to guarantee bundling and rendering across all environments
import heroEditorialImg from '@/assets/images/hero_editorial.jpg';
import heroMobileImg from '@/assets/images/hero_mobile.jpg';
import workplaceEditorialImg from '@/assets/images/workplace_editorial.jpg';
import siteOperationsImg from '@/assets/images/site_operations.jpg';
import operationsDirectorImg from '@/assets/images/operations_director.jpg';
import payrollAuditImg from '@/assets/images/payroll_audit.jpg';

export function LandingPage() {
  const { user } = useAuth();

  // Demo Booking Form State
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [teamSize, setTeamSize] = useState('16 to 49 employees');
  const [preferredSlot, setPreferredSlot] = useState('Morning (10:00 AM – 01:00 PM)');
  const [message, setMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');

  async function handleDemoSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');

    if (!fullName.trim() || !companyName.trim() || !workEmail.trim() || !phone.trim()) {
      setFormError('Please fill in your name, company, work email, and phone number.');
      return;
    }

    setSubmitting(true);
    try {
      await submitDemoRequest({
        fullName: fullName.trim(),
        companyName: companyName.trim(),
        workEmail: workEmail.trim(),
        phone: phone.trim(),
        teamSize,
        preferredSlot,
        message: message.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      setFormError('Could not submit demo request. Please try calling our hotline directly.');
    } finally {
      setSubmitting(false);
    }
  }

  const problemsAndSolutions = [
    {
      title: 'Rest Day Absences & Wrongful LOP',
      legacy:
        'Standard tools rely on rigid calendar checks that treat unpunched Sundays, dual week-offs, and public holidays as unexcused absences, leading to wrongful Loss of Pay deductions in payroll.',
      modcon:
        'Dynamic primary and secondary week-off protection tied to organization and shift policies. Rest days and public holidays are never marked absent or penalized.',
    },
    {
      title: 'Individual Regularization Fatigue',
      legacy:
        'Employees must submit separate regularization requests for every missed punch. HR administrators spend days sorting through individual approval threads at month end.',
      modcon:
        '1-click whole-month bulk regularization. Employees review and reconcile all anomalies across the entire month in one step, ready for immediate approval.',
    },
    {
      title: 'Predatory Per-Seat Pricing & Lock-Ins',
      legacy:
        'Legacy platforms charge ₹150 to ₹350 per employee per month with mandatory annual lock-in contracts and hefty initial setup fees.',
      modcon:
        'Free under 10 employees. 3 months free trial for 10–49 seats. Flat ₹49/seat with no arbitrary caps, no setup fees, and no lock-ins.',
    },
    {
      title: 'Location Spoofing & Hardware Queues',
      legacy:
        'Biometric hardware causes bottlenecks at office doors and frequently breaks, while generic mobile apps are vulnerable to GPS mock-location spoofing.',
      modcon:
        'Cryptographic mobile geofencing paired with office Wi-Fi perimeter verification. Mock locations are blocked and check-ins are verified instantly.',
    },
    {
      title: 'Disconnected Attendance & Payroll Silos',
      legacy:
        'Attendance records sit in one system while payroll sits in Excel spreadsheets. Manual exports create calculation errors and statutory compliance risks.',
      modcon:
        'Direct synchronization between approved attendance and payroll. Automatic computation of EPF, ESI, Professional Tax, and TDS with instant PDF payslips.',
    },
  ];

  const pricingTiers = [
    {
      tier: '01',
      name: 'Startup',
      seats: 'Up to 9 seats',
      price: '₹0',
      period: 'Free forever',
      badge: 'Zero Cost',
      features: [
        'Complete attendance & geofenced check-in',
        'Dynamic week-off & holiday protection',
        'Leave management & company directory',
        'No credit card required',
      ],
      ctaText: 'Access Portal',
      ctaHref: '/login',
      isHotline: false,
    },
    {
      tier: '02',
      name: 'Growth',
      seats: '10 to 49 seats',
      price: '₹49',
      period: 'per employee / month · Flat ₹49/seat',
      badge: '3 Months Free Trial',
      highlight: true,
      features: [
        'All Startup features included',
        '3 months free trial for growing teams',
        '1-Click whole-month bulk regularization',
        'Explainable Indian statutory calculations & payslips',
        'Dedicated onboarding & priority support',
      ],
      ctaText: 'Book a Demo with Us',
      ctaHref: '#book-demo',
      isHotline: false,
    },
    {
      tier: '03',
      name: 'Enterprise',
      seats: '50+ seats',
      price: '₹49',
      period: 'per employee / month · Flat (No cap)',
      badge: 'Flat Rate · No Cap',
      features: [
        'All Growth features included',
        'Flat rate: no maximum cap, pay only for active staff',
        'Multi-branch office geofencing',
        'Bank salary transfer file export (NEFT/RTGS)',
        'Custom shift policies & dedicated engineer',
      ],
      ctaText: 'Call us',
      ctaHref: 'tel:+917799934943',
      isHotline: true,
    },
  ];

  const indiaFirstCards = [
    {
      icon: Workflow,
      title: 'Exceptions, not just attendance',
      body: 'Biometric, GPS, web punch, night shifts, missed punches and multiple sites — one workflow for the messy middle.',
    },
    {
      icon: FileCheck2,
      title: 'Payroll people can trust',
      body: 'PF, ESI, PT, TDS, gratuity and leave encashment connected to the attendance decisions behind every payslip.',
    },
    {
      icon: Smartphone,
      title: 'Mobile-first for real teams',
      body: 'Simple self-service for employees and fast approvals for managers, without forcing HR to become the middleman.',
    },
    {
      icon: MapPin,
      title: 'One record across every branch',
      body: 'Head office, stores, sites and field teams stay aligned while policies and attendance rules remain location-aware.',
    },
  ];

  return (
    <div className="min-h-screen bg-ink-50 text-ink-900 font-sans antialiased selection:bg-brand-600/20">
      {/* ───────────────────────────────────────────────────────────────── */}
      {/* 1. TOP UTILITY BAR (HOTLINE, WHATSAPP, BOOK DEMO - NO DUP LOGIN) */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <div className="bg-ink-900 text-ink-100 text-xs py-2 px-4 border-b border-ink-900">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {/* Mobile: just brand marker. Desktop: show direct desk label */}
          <div className="flex items-center gap-3">
            <span className="inline-block w-2 h-2 bg-brand-600 shrink-0" />
            <span className="hidden sm:inline font-mono text-[11px] uppercase tracking-wider text-ink-300">
              Direct Desk
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {/* WhatsApp icon always visible */}
            <a
              href={getWhatsAppDemoLink()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chat on WhatsApp"
              className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1.5 transition-colors font-mono"
            >
              <MessageCircle size={13} />
              <span className="hidden sm:inline">WhatsApp Us</span>
            </a>

            <span className="text-ink-600 hidden sm:inline">|</span>

            {/* Desktop only: phone link */}
            <a
              href="tel:+917799934943"
              aria-label="Call us"
              className="hidden sm:flex items-center gap-1 font-mono font-bold text-white hover:text-brand-400 transition-colors"
            >
              <Phone size={12} className="text-brand-500" />
              <span className="sr-only">Call our hotline</span>
            </a>

            {/* Mobile only: contact us pill */}
            <a
              href="#book-demo"
              className="sm:hidden text-[11px] font-display font-extrabold uppercase tracking-wider text-brand-400 hover:text-brand-300 transition-colors"
            >
              Contact Us
            </a>

            <span className="text-ink-600 hidden sm:inline">|</span>

            <a
              href="#book-demo"
              className="hidden sm:inline text-ink-200 hover:text-white font-display font-extrabold uppercase tracking-wider text-[11px] transition-colors"
            >
              Book Demo →
            </a>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* 2. MINIMAL NAVIGATION (ONLY ONE PROMINENT CORPORATE LOGIN BUTTON)  */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b-2 border-ink-900 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center">
            <BrandLockup size={28} />
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-xs font-display font-extrabold uppercase tracking-wider text-ink-700">
            <a href="#comparison" className="hover:text-brand-600 transition-colors">
              Problems & Solutions
            </a>
            <Link to="/india-first" className="hover:text-brand-600 transition-colors">
              India-first HR
            </Link>
            <a href="#pricing" className="hover:text-brand-600 transition-colors">
              Pricing
            </a>
            <a href="#book-demo" className="hover:text-brand-600 transition-colors">
              Consultation
            </a>
            <a
              href="tel:+917799934943"
              className="hover:text-brand-600 transition-colors flex items-center gap-1 text-ink-900"
            >
              <Phone size={12} className="text-brand-600" />
              <span className="sr-only">Call our hotline</span>
            </a>
          </nav>

          {/* THE SINGLE CORPORATE LOGIN BUTTON */}
          <div className="flex items-center gap-3">
            <Link
              to={user ? "/dashboard" : "/login"}
              id="corporate-login-main-button"
              className="inline-flex shrink-0 items-center gap-2 px-3 sm:px-5 py-2.5 bg-ink-900 text-white hover:bg-ink-800 text-[10px] sm:text-xs font-display font-extrabold uppercase tracking-wider transition-colors border border-ink-900 shadow-sm whitespace-nowrap"
            >
              <Lock size={12} className="text-brand-500" />
              <span className="sm:hidden">{user ? "Workspace" : "Login"}</span>
              <span className="hidden sm:inline">{user ? "Corporate Workspace →" : "Corporate Login"}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* 3. HERO: MINIMAL, ARCHITECTURAL, MODERNIST                        */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <section className="bg-white border-b-2 border-ink-900 py-10 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 mb-4 px-2.5 py-1 bg-ink-100 border border-ink-300 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-800">
              <span className="w-1.5 h-1.5 bg-brand-600" />
              India-first Human Resource Operating System
            </div>

            <h1 className="text-[2.35rem] sm:text-5xl lg:text-6xl font-display font-extrabold text-ink-900 tracking-tight leading-[1.04]">
              Indian HR, built for the exceptions.
            </h1>

            <p className="mt-5 sm:mt-6 text-[15px] sm:text-lg text-ink-600 leading-relaxed font-sans">
              Modcon HR connects attendance, leave, payroll preparation, onboarding and people operations around the realities Indian companies actually face — from missed punches and branch transfers to statutory deadlines.
            </p>

            {/* Single restrained CTA — no funnel stack on mobile */}
            <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <a
                href="#book-demo"
                className="inline-flex justify-center items-center gap-2 px-6 py-3.5 bg-ink-900 text-white hover:bg-ink-800 text-xs font-display font-extrabold uppercase tracking-wider transition-colors border border-ink-900 shadow-sm"
              >
                <span>Book a Demo</span>
                <ArrowRight size={14} className="text-brand-500" />
              </a>

              {/* Desktop only: show phone link; mobile gets WhatsApp icon */}
              <a
                href={getWhatsAppDemoLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-700 hover:text-emerald-900 transition-colors"
              >
                <MessageCircle size={13} />
                <span className="sm:hidden">WhatsApp</span>
                <span className="hidden sm:inline">WhatsApp Desk</span>
              </a>
              <Link to="/india-first" className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-ink-600 hover:text-brand-600 transition-colors">
                <ArrowUpRight size={13} />
                <span>Why India-first</span>
              </Link>
            </div>

            {/* Mobile editorial image stamp — intentionally distinct from the main hero plate */}
            <div className="sm:hidden mt-6 border-2 border-ink-900 overflow-hidden">
              <div className="landing-image-frame aspect-[16/9] w-full bg-ink-200">
                <img
                  src={workplaceEditorialImg}
                  alt="People operations team collaborating on a workplace plan"
                  className="landing-photo w-full h-full object-cover"
                  loading="eager"
                  onError={(e) => {
                    e.currentTarget.src = '/images/workplace_editorial.jpg';
                  }}
                />
              </div>
            </div>
          </div>

          {/* Logo-led capability proof — no vanity counters */}
          <div className="mt-12 pt-8 border-t border-ink-200">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-600">One operating layer</span>
                <p className="mt-1 text-sm text-ink-600">The workday, from first check-in to final payslip.</p>
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-ink-500">Capabilities, not vanity metrics</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 border-2 border-ink-900 bg-white overflow-hidden">
              {[
                ['Attendance', 'Protected week-offs'],
                ['Payroll', 'Statutory by default'],
                ['People Ops', 'One shared record'],
                ['Field Teams', 'Verified check-ins'],
              ].map(([label, detail], index) => (
                <div key={label} className={`group flex min-w-0 items-center gap-2.5 p-3.5 sm:gap-3 sm:p-5 ${['border-r-2 border-b-2 lg:border-b-0 lg:border-r-2', 'border-b-2 lg:border-b-0', 'border-r-2 lg:border-r-2', ''][index]} border-ink-900`}>
                  <BrandMark size={26} className="transition-transform duration-200 group-hover:-translate-y-0.5" />
                  <div className="min-w-0">
                    <div className="font-display text-xs sm:text-sm font-extrabold uppercase tracking-wide text-ink-900">{label}</div>
                    <div className="mt-1 text-[10px] leading-tight text-ink-500">{detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Figure 01: Hero High-Resolution Authentic Editorial Photograph with Responsive Mobile Crop */}
          <div className="mt-12 border-2 border-ink-900 bg-white">
            <div className="landing-image-frame relative aspect-[4/3] sm:aspect-[16/9] w-full overflow-hidden bg-ink-200">
              <picture>
                <source media="(max-width: 640px)" srcSet={heroMobileImg} />
                <img
                  src={heroEditorialImg}
                  alt="Architecture and engineering workforce collaborating with Modcon HR in Bangalore studio"
                  className="landing-photo w-full h-full object-cover"
                  loading="eager"
                  onError={(e) => {
                    e.currentTarget.src = '/images/hero_editorial.jpg';
                  }}
                />
              </picture>
            </div>
            <div className="p-3 bg-ink-100 border-t-2 border-ink-900 flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] sm:text-xs font-mono text-ink-700 gap-2">
              <span className="flex items-start gap-2 leading-relaxed"><BrandMark size={16} /> <span>Editorial field note · Collaborative workforce operations in an architecture &amp; engineering studio.</span></span>
              <span className="text-ink-500 font-bold uppercase text-[10px]">Built for Bangalore &amp; Hyderabad teams</span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* 4. INDIA-FIRST POSITIONING                                         */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <section id="india-first" className="bg-ink-900 py-14 text-white sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <span className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-brand-400">Built for the Indian exception</span>
              <h2 className="mt-3 text-3xl font-display font-extrabold leading-tight tracking-tight sm:text-5xl">
                The normal case is easy. Your workday is not.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-300 sm:text-base">
                Indian companies do not need another generic HRMS. They need one operating layer that stays calm when shifts change, documents go missing, branches multiply, and payroll still has to close today.
              </p>
              <Link to="/india-first" className="mt-7 inline-flex items-center gap-2 border border-white/40 px-4 py-3 text-xs font-display font-extrabold uppercase tracking-wider text-white transition-colors hover:border-brand-400 hover:bg-brand-600">
                Explore the India-first model
                <ArrowUpRight size={14} className="text-brand-400" />
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-px overflow-hidden border border-white/20 bg-white/20 sm:grid-cols-2">
              {indiaFirstCards.map(({ icon: Icon, title, body }) => (
                <article key={title} className="bg-ink-900 p-5 sm:p-6">
                  <Icon size={20} className="text-brand-400" />
                  <h3 className="mt-5 text-base font-display font-extrabold text-white">{title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-ink-300">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* 5. BOOK A DEMO WITH US FORM (MODERNIST & WHATSAPP INTEGRATION)     */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <section id="book-demo" className="py-12 sm:py-20 bg-ink-100 border-b-2 border-ink-900 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="bg-white border-2 border-ink-900 p-4 sm:p-10">
            <div className="border-b border-ink-200 pb-6 mb-8">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-600 block mb-1">
                Direct Engagement
              </span>
              <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-ink-900">
                Book a Demo with Us
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-ink-600">
                Schedule a 20-minute tailored walkthrough of Modcon HR. We will show how dynamic week-offs, bulk regularization, and explainable payroll preparation work for your team.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Editorial operations image & direct contacts */}
              <div className="lg:col-span-5 space-y-6">
                <div className="border-2 border-ink-900 bg-white">
                  <div className="landing-image-frame relative aspect-[4/3] w-full overflow-hidden bg-ink-200">
                    <picture>
                      <source media="(max-width: 640px)" srcSet={payrollAuditImg} />
                      <img
                        src={operationsDirectorImg}
                        alt="Operations Director reviewing personnel rosters"
                        className="landing-photo w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.src = '/images/operations_director.jpg';
                        }}
                      />
                    </picture>
                  </div>
                  <div className="p-3 bg-ink-100 border-t-2 border-ink-900 text-[11px] font-mono text-ink-700">
                    <span className="flex items-start gap-2 leading-relaxed"><BrandMark size={16} /> <span>People operations and payroll administration at a Hyderabad design firm.</span></span>
                  </div>
                </div>

                <div className="p-4 bg-ink-50 border border-ink-300 space-y-3 font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-brand-600 uppercase font-bold block mb-0.5">Deployment Guarantee</span>
                    <p className="text-ink-800 text-[11px]">
                      24-hour tenant provisioning and full spreadsheet roster migration handled by our team.
                    </p>
                  </div>
                  <div className="pt-2 border-t border-ink-200">
                    <span className="text-[10px] text-ink-500 uppercase font-bold block mb-0.5">Direct Line & WhatsApp</span>
                    <a href="tel:+917799934943" aria-label="Call our hotline" title="Call our hotline" className="inline-flex items-center gap-2 text-ink-900 font-bold hover:text-brand-600 block">
                      <Phone size={14} className="text-brand-600" />
                      <span>Call hotline</span>
                    </a>
                    <a
                      href={getWhatsAppDemoLink()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-700 font-bold hover:underline block mt-0.5"
                    >
                      <MessageCircle size={14} />
                      WhatsApp desk
                    </a>
                  </div>
                </div>
              </div>

              {/* Right Column: Interactive Form */}
              <div className="lg:col-span-7">

            {submitted ? (
              <div className="p-8 bg-ink-50 border-2 border-emerald-600 text-center space-y-4">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-600 text-white rounded-none">
                  <CheckCircle2 size={24} />
                </div>
                <h3 className="text-xl font-display font-extrabold text-ink-900">
                  Demo Request Confirmed!
                </h3>
                <p className="text-xs text-ink-700 max-w-md mx-auto leading-relaxed">
                  Thank you, <strong>{fullName}</strong>. Our enterprise team will contact you at <strong>{workEmail}</strong> and <strong>{phone}</strong> within 2 business hours.
                </p>

                <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <a
                    href={getWhatsAppDemoLink({ name: fullName, company: companyName, teamSize, phone })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-700 text-white hover:bg-emerald-800 text-xs font-display font-extrabold uppercase tracking-wider transition-colors"
                  >
                    <MessageCircle size={15} />
                    <span>Chat on WhatsApp Now</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => setSubmitted(false)}
                    className="px-4 py-3 text-xs text-ink-600 hover:text-ink-900 font-bold uppercase"
                  >
                    Submit Another Inquiry
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleDemoSubmit} className="space-y-6">
                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-300 text-rose-700 text-xs font-medium">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Full Name */}
                  <div>
                    <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-ink-700 mb-1">
                      Full Name *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        className="w-full px-3 py-2.5 text-xs border border-ink-300 bg-ink-50 focus:bg-white focus:outline-none focus:border-brand-600 font-sans"
                      />
                    </div>
                  </div>

                  {/* Company Name */}
                  <div>
                    <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-ink-700 mb-1">
                      Company / Organization Name *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="e.g. Acme Tech Pvt Ltd"
                        className="w-full px-3 py-2.5 text-xs border border-ink-300 bg-ink-50 focus:bg-white focus:outline-none focus:border-brand-600 font-sans"
                      />
                    </div>
                  </div>

                  {/* Work Email */}
                  <div>
                    <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-ink-700 mb-1">
                      Work Email Address *
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        value={workEmail}
                        onChange={(e) => setWorkEmail(e.target.value)}
                        placeholder="rahul@company.com"
                        className="w-full px-3 py-2.5 text-xs border border-ink-300 bg-ink-50 focus:bg-white focus:outline-none focus:border-brand-600 font-sans"
                      />
                    </div>
                  </div>

                  {/* Phone / WhatsApp */}
                  <div>
                    <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-ink-700 mb-1">
                      Phone / WhatsApp Number *
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full px-3 py-2.5 text-xs border border-ink-300 bg-ink-50 focus:bg-white focus:outline-none focus:border-brand-600 font-mono"
                      />
                    </div>
                  </div>

                  {/* Team Size */}
                  <div>
                    <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-ink-700 mb-1">
                      Estimated Team Headcount
                    </label>
                    <select
                      value={teamSize}
                      onChange={(e) => setTeamSize(e.target.value)}
                      className="w-full px-3 py-2.5 text-xs border border-ink-300 bg-ink-50 focus:bg-white focus:outline-none focus:border-brand-600 font-sans"
                    >
                      <option value="1 to 9 employees (Free Starter)">1 to 9 employees (Free Starter)</option>
                      <option value="10 to 49 employees (3 Months Free Trial)">10 to 49 employees (3 Months Free Trial)</option>
                      <option value="50 to 199 employees (Flat ₹49/seat)">50 to 199 employees (Flat ₹49/seat)</option>
                      <option value="200+ employees (Enterprise Custom)">200+ employees (Enterprise Custom)</option>
                    </select>
                  </div>

                  {/* Preferred Slot */}
                  <div>
                    <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-ink-700 mb-1">
                      Preferred Demo Time
                    </label>
                    <select
                      value={preferredSlot}
                      onChange={(e) => setPreferredSlot(e.target.value)}
                      className="w-full px-3 py-2.5 text-xs border border-ink-300 bg-ink-50 focus:bg-white focus:outline-none focus:border-brand-600 font-sans"
                    >
                      <option value="Morning (10:00 AM – 01:00 PM)">Morning (10:00 AM – 01:00 PM)</option>
                      <option value="Afternoon (02:00 PM – 05:00 PM)">Afternoon (02:00 PM – 05:00 PM)</option>
                      <option value="Evening (05:00 PM – 07:00 PM)">Evening (05:00 PM – 07:00 PM)</option>
                      <option value="Immediate Phone Callback">Immediate Phone Callback</option>
                    </select>
                  </div>
                </div>

                {/* Specific Questions / Notes */}
                <div>
                  <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-ink-700 mb-1">
                    Specific Requirements or Current System Challenges (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us about your shift rosters, current biometric setup, or payroll challenges..."
                    className="w-full px-3 py-2.5 text-xs border border-ink-300 bg-ink-50 focus:bg-white focus:outline-none focus:border-brand-600 font-sans"
                  />
                </div>

                {/* Submission CTA and WhatsApp quick-link */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-brand-600 text-white hover:bg-brand-700 text-xs font-display font-extrabold uppercase tracking-wider transition-colors disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Sending Request…</span>
                      </>
                    ) : (
                      <>
                        <Calendar size={14} />
                        <span>Confirm & Book Demo</span>
                      </>
                    )}
                  </button>

                  <a
                    href={getWhatsAppDemoLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-3.5 bg-emerald-700 text-white hover:bg-emerald-800 text-xs font-display font-extrabold uppercase tracking-wider transition-colors w-full sm:w-auto justify-center"
                  >
                    <MessageCircle size={14} />
                    <span>WhatsApp Us</span>
                  </a>
                </div>
              </form>
            )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* 5. PROBLEMS IN REGULAR HR TOOLS VS THE MODCON SOLUTION           */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <section id="comparison" className="py-16 sm:py-20 bg-ink-50 border-b-2 border-ink-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="mb-12 max-w-2xl">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-600 block mb-1">
              System Audit
            </span>
            <h2 className="text-2xl sm:text-4xl font-display font-extrabold text-ink-900 tracking-tight">
              Problems in Regular HR Tools vs. Modcon HR
            </h2>
            <p className="mt-2 text-sm text-ink-600 leading-relaxed">
              Why traditional HR systems cause payroll disputes, employee frustration, and unnecessary administrative overhead.
            </p>
          </div>

          <div className="border-2 border-ink-900 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-2 bg-ink-100 border-b-2 border-ink-900 text-xs font-display font-extrabold uppercase tracking-wider">
              <div className="p-4 flex items-center gap-2 text-ink-700 md:border-r-2 md:border-ink-900">
                <X size={15} className="text-brand-600" />
                <span>Problem in Regular HR Tools</span>
              </div>
              <div className="p-4 flex items-center gap-2 text-ink-900">
                <Check size={15} className="text-brand-600" />
                <span>The Modcon HR Solution</span>
              </div>
            </div>

            <div className="divide-y divide-ink-200">
              {problemsAndSolutions.map((item, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-2">
                  {/* Problem */}
                  <div className="p-5 sm:p-6 md:border-r-2 md:border-ink-900 bg-ink-50/50">
                    <span className="font-mono text-[10px] font-bold text-ink-500 uppercase tracking-widest block mb-1">
                      Flaw 0{idx + 1}
                    </span>
                    <h3 className="text-sm font-bold text-ink-900 mb-2">
                      {item.title}
                    </h3>
                    <p className="text-xs text-ink-600 leading-relaxed">
                      {item.legacy}
                    </p>
                  </div>

                  {/* Solution */}
                  <div className="p-5 sm:p-6 bg-white flex flex-col justify-between">
                    <div>
                      <span className="font-mono text-[10px] font-bold text-brand-600 uppercase tracking-widest block mb-1">
                        Modcon Fix
                      </span>
                      <h3 className="text-sm font-bold text-ink-900 mb-2">
                        Resolved in Core Engine
                      </h3>
                      <p className="text-xs text-ink-800 leading-relaxed font-medium">
                        {item.modcon}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Single Photographic Plate — Payroll & Compliance Desk */}
          <div className="mt-12 border-2 border-ink-900 bg-white">
            <div className="landing-image-frame relative aspect-[16/9] sm:aspect-[21/9] w-full overflow-hidden bg-ink-200">
              <img
                src={payrollAuditImg}
                alt="Payroll audit and statutory compliance review at operations desk"
                className="landing-photo w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.src = '/images/payroll_audit.jpg';
                }}
              />
            </div>
            <div className="p-3.5 bg-ink-100 border-t-2 border-ink-900 text-xs font-mono text-ink-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
              <span className="font-bold text-ink-900 flex items-center gap-2"><BrandMark size={16} /> Payroll &amp; statutory compliance desk</span>
              <span className="text-ink-500 uppercase text-[10px] font-bold">Designed for real operations</span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* 6. PRICING: MINIMAL, ARCHITECTURAL, TRANSPARENT                   */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-16 sm:py-20 bg-white border-b-2 border-ink-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="mb-12 max-w-2xl">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-600 block mb-1">
              Commercial Terms
            </span>
            <h2 className="text-2xl sm:text-4xl font-display font-extrabold text-ink-900 tracking-tight">
              Honest, Transparent Pricing
            </h2>
            <p className="mt-2 text-sm text-ink-600">
              No hidden setup fees, no per-module add-ons, and no restrictive lock-in contracts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pricingTiers.map((tier) => (
              <div
                key={tier.tier}
                className={`p-6 sm:p-8 flex flex-col justify-between border-2 ${
                  tier.highlight ? 'border-brand-600 bg-white' : 'border-ink-900 bg-ink-50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-xs font-bold uppercase text-ink-500">
                      Tier {tier.tier}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 ${
                        tier.highlight
                          ? 'bg-brand-600 text-white'
                          : 'bg-ink-200 text-ink-800'
                      }`}
                    >
                      {tier.badge}
                    </span>
                  </div>

                  <h3 className="text-xl font-display font-extrabold text-ink-900">
                    {tier.name}
                  </h3>
                  <p className="text-xs text-ink-600 mt-0.5 font-medium">
                    {tier.seats}
                  </p>

                  <div className="my-6 pb-6 border-b border-ink-300">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl sm:text-4xl font-display font-extrabold text-ink-900">
                        {tier.price}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-ink-600 block mt-1">
                      {tier.period}
                    </span>
                  </div>

                  <ul className="space-y-3 text-xs text-ink-700">
                    {tier.features.map((feature, fIdx) => (
                      <li key={fIdx} className="flex items-start gap-2">
                        <Check size={14} className="text-brand-600 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 pt-6 border-t border-ink-200">
                  {tier.isHotline ? (
                    <a
                      href={getWhatsAppDemoLink()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-1.5 py-3 bg-emerald-700 text-white hover:bg-emerald-800 text-xs font-display font-extrabold uppercase tracking-wider transition-colors"
                    >
                      <MessageCircle size={13} />
                      <span>Contact Us</span>
                    </a>
                  ) : tier.ctaHref.startsWith('#') ? (
                    <a
                      href={tier.ctaHref}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-3 bg-brand-600 text-white hover:bg-brand-700 text-xs font-display font-extrabold uppercase tracking-wider transition-colors"
                    >
                      <Calendar size={13} />
                      <span>{tier.ctaText}</span>
                    </a>
                  ) : (
                    <Link
                      to={tier.ctaHref}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-3 bg-ink-900 text-white hover:bg-ink-800 text-xs font-display font-extrabold uppercase tracking-wider transition-colors"
                    >
                      <Lock size={12} className="text-brand-500" />
                      <span>{tier.ctaText}</span>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* 7. ENTERPRISE ASSISTED DEPLOYMENT & DESK                          */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <section className="bg-ink-900 text-white py-12 border-b-2 border-ink-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 mb-2 text-brand-400 font-mono text-xs font-bold uppercase tracking-wider">
              <ShieldCheck size={14} />
              <span>Assisted Deployment & Migration Desk</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-extrabold tracking-tight">
              Ready to eliminate false LOP and streamline payroll?
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-ink-300 leading-relaxed">
              Reach our deployment engineers by phone or WhatsApp. We configure organizational shift policies and migrate employee rosters within 24 hours.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <a
              href="tel:+917799934943"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-ink-900 hover:bg-ink-100 text-xs font-display font-extrabold uppercase tracking-wider transition-colors"
            >
              <Phone size={13} className="text-brand-600" />
              <span>Call us</span>
            </a>

            <a
              href={getWhatsAppDemoLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-700 text-white hover:bg-emerald-800 text-xs font-display font-extrabold uppercase tracking-wider transition-colors"
            >
              <MessageCircle size={13} />
              <span>WhatsApp Desk</span>
            </a>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* 8. FOOTER                                                        */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <footer className="bg-ink-50 py-8 text-xs text-ink-600 border-t border-ink-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandLockup size={24} />
            <span className="text-ink-400">|</span>
            <span className="text-[11px] text-ink-500 font-mono">
              Modernist Enterprise Workforce Architecture
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <Link to="/payroll-boundaries" className="text-ink-700 hover:text-brand-600 transition-colors uppercase font-display text-[11px] font-bold">
              Payroll boundaries
            </Link>
            <Link to="/privacy" className="text-ink-700 hover:text-brand-600 transition-colors uppercase font-display text-[11px] font-bold">
              Privacy
            </Link>
            <Link to="/terms" className="text-ink-700 hover:text-brand-600 transition-colors uppercase font-display text-[11px] font-bold">
              Terms
            </Link>
            <a href="#book-demo" className="text-ink-700 hover:text-brand-600 transition-colors uppercase font-display text-[11px] font-bold">
              Book Demo
            </a>
            <a
              href={getWhatsAppDemoLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:underline"
            >
              <MessageCircle size={12} />
              <span>WhatsApp</span>
            </a>
            {/* Phone only on desktop */}
            <a href="tel:+917799934943" aria-label="Call our hotline" title="Call our hotline" className="hidden sm:inline-flex items-center gap-1 font-mono font-bold text-brand-600 hover:underline">
              <Phone size={13} />
              <span className="sr-only">Call hotline</span>
            </a>
            <Link to={user ? "/dashboard" : "/login"} className="font-bold text-ink-900 hover:text-brand-600 transition-colors uppercase font-display text-[11px]">
              {user ? "Workspace" : "Login"}
            </Link>
          </div>

          <div className="font-mono text-[10px] text-ink-400">
            © {new Date().getFullYear()} Modcon HR Systems.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
