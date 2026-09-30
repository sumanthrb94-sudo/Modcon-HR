import { useEffect } from 'react';
import { ArrowRight, Check, FileCheck2, MapPin, MessageCircle, Phone, Smartphone, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandLockup, BrandMark } from '@/components/ui';
import { getWhatsAppDemoLink } from '@/lib/demoRequests';
import workplaceEditorialImg from '@/assets/images/workplace_editorial.jpg';
import payrollAuditImg from '@/assets/images/payroll_audit.jpg';

const exceptionCards = [
  {
    icon: Workflow,
    eyebrow: 'Attendance',
    title: 'Every punch has a context.',
    body: 'Biometric devices, GPS, web punch, manual corrections, night shifts, missed punches and multiple locations can coexist without making HR the human integration layer.',
  },
  {
    icon: FileCheck2,
    eyebrow: 'Payroll & compliance',
    title: 'Every payslip has a reason.',
    body: 'Connect attendance decisions to PF, ESI, PT, TDS, gratuity, bonus and leave encashment workflows, with the audit trail needed when trust is on the line.',
  },
  {
    icon: Smartphone,
    eyebrow: 'Employee experience',
    title: 'Every action should work on a phone.',
    body: 'Give employees simple self-service and managers fast approvals across leave, attendance questions, payslips and documents — with WhatsApp as a natural front door.',
  },
  {
    icon: MapPin,
    eyebrow: 'Branches & field teams',
    title: 'Every location can follow its own rules.',
    body: 'Head office, stores, construction sites, sales teams and remote employees stay on one record while policies, shifts and attendance areas remain location-aware.',
  },
];

const journey = ['Recruit', 'Onboard', 'Manage', 'Attend', 'Leave', 'Payroll', 'Comply', 'Analyze'];

export function IndiaFirstPage() {
  useEffect(() => {
    document.title = 'India-first HR Software | Modcon HR';
    const description = 'Modcon HR is an India-first people operations platform for attendance exceptions, statutory payroll, leave, onboarding, WhatsApp workflows and multi-branch teams.';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', description);
    return () => {
      document.title = 'ModCon HR — Modern HR Platform';
    };
  }, []);

  return (
    <main className="min-h-screen bg-ink-50 text-ink-900 font-sans antialiased">
      <header className="border-b-2 border-ink-900 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="Modcon HR home"><BrandLockup size={28} /></Link>
          <nav className="hidden items-center gap-6 text-xs font-display font-extrabold uppercase tracking-wider text-ink-700 md:flex">
            <Link to="/" className="transition-colors hover:text-brand-600">Product overview</Link>
            <a href="#exceptions" className="transition-colors hover:text-brand-600">The exceptions</a>
            <a href="#operating-layer" className="transition-colors hover:text-brand-600">Operating layer</a>
          </nav>
          <Link to="/login" className="inline-flex items-center gap-2 border border-ink-900 bg-ink-900 px-3 py-2.5 text-[10px] font-display font-extrabold uppercase tracking-wider text-white transition-colors hover:bg-ink-800 sm:px-4 sm:text-xs">
            Sign in
          </Link>
        </div>
      </header>

      <section className="border-b-2 border-ink-900 bg-ink-900 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-brand-400">
              <span className="h-1.5 w-1.5 bg-brand-500" />
              India-first people operations
            </span>
            <h1 className="mt-5 max-w-3xl text-4xl font-display font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
              HR software for the workday you actually run.
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-relaxed text-ink-200 sm:text-base">
              Modcon HR is built around the exceptions Indian companies handle every day: missed punches, changing shifts, branch transfers, incomplete documents, custom leave rules and payroll that has to be right today.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="#operating-layer" className="inline-flex items-center justify-center gap-2 bg-brand-600 px-5 py-3 text-xs font-display font-extrabold uppercase tracking-wider text-white transition-colors hover:bg-brand-700">
                See the operating layer <ArrowRight size={14} />
              </a>
              <Link to="/" className="inline-flex items-center justify-center gap-2 border border-white/30 px-5 py-3 text-xs font-display font-extrabold uppercase tracking-wider text-white transition-colors hover:border-white">
                Back to product overview
              </Link>
            </div>
          </div>
          <div className="relative overflow-hidden border-2 border-white/30 bg-ink-800">
            <img src={workplaceEditorialImg} alt="Indian workplace team collaborating around an operations plan" className="h-full min-h-[280px] w-full object-cover opacity-75" loading="eager" />
            <div className="absolute inset-0 bg-gradient-to-tr from-ink-900/75 via-transparent to-brand-600/20" />
            <div className="absolute bottom-0 left-0 right-0 border-t border-white/30 bg-ink-900/75 p-4 font-mono text-[10px] uppercase tracking-wider text-ink-200">
              One record · many realities
            </div>
          </div>
        </div>
      </section>

      <section id="exceptions" className="border-b-2 border-ink-900 bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-brand-600">The India-first thesis</span>
            <h2 className="mt-3 text-3xl font-display font-extrabold leading-tight tracking-tight sm:text-5xl">The normal case is easy. The exception is where value lives.</h2>
            <p className="mt-4 text-sm leading-relaxed text-ink-600 sm:text-base">
              Generic HR software is designed for a clean process. Modcon is designed for the moment the process changes — and for the people who still need a clear answer afterward.
            </p>
          </div>
          <div className="mt-10 grid gap-0 border-2 border-ink-900 sm:grid-cols-2">
            {exceptionCards.map(({ icon: Icon, eyebrow, title, body }, index) => (
              <article key={title} className={`p-6 sm:p-8 ${index % 2 === 0 ? 'sm:border-r-2' : ''} ${index < 2 ? 'border-b-2' : ''} border-ink-900`}>
                <Icon size={22} className="text-brand-600" />
                <span className="mt-6 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">{eyebrow}</span>
                <h3 className="mt-2 text-xl font-display font-extrabold text-ink-900">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-600">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="operating-layer" className="border-b-2 border-ink-900 bg-ink-100 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <span className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-brand-600">The operating layer</span>
              <h2 className="mt-3 text-3xl font-display font-extrabold leading-tight tracking-tight sm:text-4xl">Recruit → Onboard → Manage → Attend → Leave → Payroll → Comply → Analyze</h2>
              <p className="mt-4 text-sm leading-relaxed text-ink-600">One connected record for employees, HR admins, managers, mobile workers, WhatsApp conversations, integrations and the API underneath.</p>
            </div>
            <div>
              <div className="grid grid-cols-2 border-2 border-ink-900 bg-white sm:grid-cols-4">
                {journey.map((step, index) => (
                  <div key={step} className={`flex min-h-24 flex-col justify-between p-4 ${index % 4 !== 3 ? 'sm:border-r-2' : ''} ${index < 4 ? 'border-b-2 sm:border-b-0' : ''} border-ink-900`}>
                    <span className="font-mono text-[10px] font-bold text-brand-600">0{index + 1}</span>
                    <span className="mt-5 text-sm font-display font-extrabold uppercase text-ink-900">{step}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 border-2 border-ink-900 bg-white">
                <div className="grid gap-0 sm:grid-cols-2">
                  <div className="border-b-2 border-ink-900 p-5 sm:border-b-0 sm:border-r-2">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-brand-600">For people</span>
                    <p className="mt-2 text-sm font-bold text-ink-900">Employee app/web · manager portal · WhatsApp</p>
                  </div>
                  <div className="p-5">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-brand-600">For systems</span>
                    <p className="mt-2 text-sm font-bold text-ink-900">Integrations · migration · audit trails · API</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b-2 border-ink-900 bg-white py-14 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div className="overflow-hidden border-2 border-ink-900">
            <img src={payrollAuditImg} alt="Payroll and compliance review at an operations desk" className="h-full min-h-[240px] w-full object-cover" loading="lazy" />
            <div className="flex items-center gap-2 border-t-2 border-ink-900 bg-ink-100 p-3 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-700"><BrandMark size={15} /> Designed for the messy middle</div>
          </div>
          <div>
            <h2 className="text-3xl font-display font-extrabold leading-tight tracking-tight sm:text-4xl">Make migration and adoption part of the product.</h2>
            <ul className="mt-6 space-y-4 text-sm text-ink-700">
              {['Bring employee data in from Excel, Sheets, old HRMS and payroll tools.', 'Keep managers moving with fewer clicks and clear exception queues.', 'Let employees use the channels they already understand, including WhatsApp.', 'Answer owner questions quickly: headcount, absence, payroll, cost, notice period.'].map((item) => (
                <li key={item} className="flex items-start gap-3"><Check size={16} className="mt-0.5 shrink-0 text-brand-600" /><span>{item}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-ink-900 py-12 text-white sm:py-16">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 sm:px-6 md:flex-row md:items-center">
          <div>
            <span className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-brand-400">See it in your workflow</span>
            <h2 className="mt-2 text-2xl font-display font-extrabold sm:text-3xl">Build a calmer HR operating day.</h2>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="inline-flex items-center justify-center gap-2 border border-white/30 px-4 py-3 text-xs font-display font-extrabold uppercase tracking-wider text-white hover:border-white">Back to top</a>
            <a href={getWhatsAppDemoLink()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 bg-emerald-700 px-4 py-3 text-xs font-display font-extrabold uppercase tracking-wider text-white hover:bg-emerald-800"><MessageCircle size={14} /> Start a conversation</a>
            <a href="tel:+917799934943" aria-label="Call Modcon HR" title="Call Modcon HR" className="inline-flex items-center justify-center bg-white px-4 py-3 text-ink-900 hover:bg-ink-100"><Phone size={16} /></a>
          </div>
        </div>
      </section>
    </main>
  );
}
