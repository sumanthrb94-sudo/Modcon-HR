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
} from 'lucide-react';
import { BrandLockup } from '@/components/ui';
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
      setFormError('Could not submit demo request. Please try calling +91 7799934943 directly.');
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
        'Automated Indian statutory payroll & payslips',
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
      ctaText: 'Call +91 7799934943',
      ctaHref: 'tel:+917799934943',
      isHotline: true,
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
              <span>+91 7799934943</span>
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center">
            <BrandLockup size={32} />
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-xs font-display font-extrabold uppercase tracking-wider text-ink-700">
            <a href="#comparison" className="hover:text-brand-600 transition-colors">
              Problems & Solutions
            </a>
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
              <span className="font-mono font-bold">+91 7799934943</span>
            </a>
          </nav>

          {/* THE SINGLE CORPORATE LOGIN BUTTON */}
          <div className="flex items-center gap-3">
            <Link
              to={user ? "/dashboard" : "/login"}
              id="corporate-login-main-button"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-900 text-white hover:bg-ink-800 text-xs font-display font-extrabold uppercase tracking-wider transition-colors border border-ink-900 shadow-sm"
            >
              <Lock size={12} className="text-brand-500" />
              <span>{user ? "Corporate Workspace →" : "Corporate Login"}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* 3. HERO: MINIMAL, ARCHITECTURAL, MODERNIST                        */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <section className="bg-white border-b-2 border-ink-900 py-12 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 mb-4 px-2.5 py-1 bg-ink-100 border border-ink-300 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-800">
              <span className="w-1.5 h-1.5 bg-brand-600" />
              Human Resource Operating System
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-display font-extrabold text-ink-900 tracking-tight leading-[1.08]">
              Accurate attendance. Honest payroll. Zero false deductions.
            </h1>

            <p className="mt-6 text-base sm:text-lg text-ink-600 leading-relaxed font-sans">
              Modcon HR eliminates false absences on Sundays and rostered week-offs, simplifies whole-month regularizations into a single click, and provides Indian statutory payroll for a flat ₹49/seat with no cap.
            </p>

            {/* Single restrained CTA — no funnel stack on mobile */}
            <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <a
                href="#book-demo"
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-ink-900 text-white hover:bg-ink-800 text-xs font-display font-extrabold uppercase tracking-wider transition-colors border border-ink-900 shadow-sm"
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
                <span className="hidden sm:inline">WhatsApp: +91 7799934943</span>
              </a>
            </div>

            {/* Mobile clean image stamp */}
            <div className="sm:hidden mt-6 border-2 border-ink-900 overflow-hidden">
              <div className="aspect-[16/9] w-full bg-ink-200">
                <img
                  src={heroMobileImg}
                  alt="Workforce operations"
                  className="w-full h-full object-cover grayscale-photo"
                  loading="eager"
                  onError={(e) => {
                    e.currentTarget.src = '/images/hero_mobile.jpg';
                  }}
                />
              </div>
            </div>
          </div>

          {/* 3 Metric Pillars */}
          <div className="mt-12 pt-8 border-t border-ink-200 grid grid-cols-1 sm:grid-cols-3 gap-6 font-mono">
            <div className="border-l-2 border-brand-600 pl-4">
              <div className="text-2xl font-extrabold text-ink-900 font-display">₹0 / Free</div>
              <div className="text-xs text-ink-600 mt-1">Free forever for teams under 10 seats</div>
            </div>
            <div className="border-l-2 border-brand-600 pl-4">
              <div className="text-2xl font-extrabold text-brand-600 font-display">3 Months Free</div>
              <div className="text-xs text-ink-600 mt-1">Full trial for organizations up to 49 seats</div>
            </div>
            <div className="border-l-2 border-ink-900 pl-4">
              <div className="text-2xl font-extrabold text-ink-900 font-display">Flat ₹49 / seat</div>
              <div className="text-xs text-ink-600 mt-1">Flat ₹49 per employee · No seat cap</div>
            </div>
          </div>

          {/* Figure 01: Hero High-Resolution Authentic Editorial Photograph with Responsive Mobile Crop */}
          <div className="mt-12 border-2 border-ink-900 bg-white">
            <div className="relative aspect-[4/3] sm:aspect-[16/9] w-full overflow-hidden bg-ink-200">
              <picture>
                <source media="(max-width: 640px)" srcSet={heroMobileImg} />
                <img
                  src={heroEditorialImg}
                  alt="Architecture and engineering workforce collaborating with Modcon HR in Bangalore studio"
                  className="w-full h-full object-cover grayscale-photo"
                  loading="eager"
                  onError={(e) => {
                    e.currentTarget.src = '/images/hero_editorial.jpg';
                  }}
                />
              </picture>
            </div>
            <div className="p-3.5 bg-ink-100 border-t-2 border-ink-900 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs font-mono text-ink-700 gap-1.5">
              <span>Plate 01 · Collaborative workforce operations in an architecture & engineering studio.</span>
              <span className="text-ink-500 font-bold uppercase text-[10px]">Bangalore & Hyderabad Roster Cohort</span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* 4. BOOK A DEMO WITH US FORM (MODERNIST & WHATSAPP INTEGRATION)     */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <section id="book-demo" className="py-16 sm:py-20 bg-ink-100 border-b-2 border-ink-900 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="bg-white border-2 border-ink-900 p-6 sm:p-10">
            <div className="border-b border-ink-200 pb-6 mb-8">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-600 block mb-1">
                Direct Engagement
              </span>
              <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-ink-900">
                Book a Demo with Us
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-ink-600">
                Schedule a 20-minute tailored walkthrough of Modcon HR with our deployment architects. We will show how dynamic week-offs, bulk regularization, and automated statutory payroll work for your team.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Authentic Editorial Plate 02 & Direct Contacts */}
              <div className="lg:col-span-5 space-y-6">
                <div className="border-2 border-ink-900 bg-white">
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-ink-200">
                    <picture>
                      <source media="(max-width: 640px)" srcSet={payrollAuditImg} />
                      <img
                        src={operationsDirectorImg}
                        alt="Operations Director reviewing personnel rosters"
                        className="w-full h-full object-cover grayscale-photo"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.src = '/images/operations_director.jpg';
                        }}
                      />
                    </picture>
                  </div>
                  <div className="p-3 bg-ink-100 border-t-2 border-ink-900 text-[11px] font-mono text-ink-700">
                    Plate 04 · People operations and payroll administration at Hyderabad design firm.
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
                    <a href="tel:+917799934943" className="text-ink-900 font-bold hover:text-brand-600 block">
                      Phone: +91 7799934943
                    </a>
                    <a
                      href={getWhatsAppDemoLink()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-700 font-bold hover:underline block mt-0.5"
                    >
                      WhatsApp: +91 7799934943
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
            <div className="relative aspect-[16/9] sm:aspect-[21/9] w-full overflow-hidden bg-ink-200">
              <img
                src={payrollAuditImg}
                alt="Payroll audit and statutory compliance review at operations desk"
                className="w-full h-full object-cover grayscale-photo"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.src = '/images/payroll_audit.jpg';
                }}
              />
            </div>
            <div className="p-3.5 bg-ink-100 border-t-2 border-ink-900 text-xs font-mono text-ink-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
              <span className="font-bold text-ink-900">Plate 02 · Payroll &amp; Statutory Compliance Desk</span>
              <span className="text-ink-500 uppercase text-[10px] font-bold">Hyderabad Operations Cohort</span>
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
              Reach our deployment engineers at <strong className="text-white font-mono">+91 7799934943</strong> or message on WhatsApp. We configure organizational shift policies and migrate employee rosters within 24 hours.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <a
              href="tel:+917799934943"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-ink-900 hover:bg-ink-100 text-xs font-display font-extrabold uppercase tracking-wider transition-colors"
            >
              <Phone size={13} className="text-brand-600" />
              <span>Call +91 7799934943</span>
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
            <a href="tel:+917799934943" className="hidden sm:inline font-mono font-bold text-brand-600 hover:underline">
              +91 7799934943
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
