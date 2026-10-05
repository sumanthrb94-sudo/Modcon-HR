import { Link } from 'react-router-dom';
import { BrandLockup } from '@/components/ui';

interface Section {
  title: string;
  body: string;
}

function PublicPolicyPage({ title, intro, sections }: { title: string; intro: string; sections: Section[] }) {
  return (
    <div className="min-h-screen bg-ink-50 text-ink-900">
      <header className="border-b-2 border-ink-900 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5 sm:px-6">
          <Link to="/" aria-label="Modcon HR home"><BrandLockup size={28} /></Link>
          <Link to="/" className="text-xs font-bold uppercase tracking-wider text-brand-700 hover:underline">Back to home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-brand-700">Launch policy</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-ink-600">{intro}</p>
        <p className="mt-3 text-xs font-semibold text-amber-800">Draft for customer review. Legal counsel must approve this policy before commercial launch.</p>
        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.title} className="border-t border-ink-300 pt-5">
              <h2 className="font-display text-xl font-extrabold">{section.title}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink-700">{section.body}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

export function PayrollBoundariesPage() {
  return <PublicPolicyPage title="Payroll service boundaries" intro="Modcon HR prepares payroll inputs and calculations. It does not replace the employer, payroll approver, tax adviser, accountant, government portal, bank, or statutory filing system." sections={[
    { title: 'What the product does', body: 'Uses approved attendance, leave, salary structures, and configured statutory settings to prepare explainable payroll calculations, payslips, and supported export files.' },
    { title: 'What the customer must do', body: 'Verify employee data and applicability, review each payroll run, approve final amounts, arrange salary payment, file returns, make statutory remittances, and retain legally required records.' },
    { title: 'Configuration and updates', body: 'Calculations depend on the organisation’s configuration and the effective dates of applicable rules. Customers must review statutory configuration with a qualified professional and confirm it after legal or policy changes.' },
    { title: 'No filing representation', body: 'A prepared return, worksheet, or export is not proof of filing or payment. Government acknowledgements and bank confirmations remain the authoritative records.' },
  ]} />;
}

export function PrivacyPage() {
  return <PublicPolicyPage title="Privacy notice" intro="This notice describes the intended handling of employee and customer data in Modcon HR. Contract-specific roles and retention periods must be finalized before commercial launch." sections={[
    { title: 'Data processed', body: 'Account details, employee records, attendance and location evidence, leave, payroll inputs, payslips, documents, support messages, and security/audit events.' },
    { title: 'Purpose and access', body: 'Data is used to provide the subscribed HR workflows. Access is role-based and organisation-scoped. Customers control which employees and administrators are authorized.' },
    { title: 'Retention and deletion', body: 'Retention must follow the customer agreement, applicable law, and configured policy. A verified administrator may request export or deletion, subject to legal retention obligations and backup expiry.' },
    { title: 'Security and incidents', body: 'The service uses authentication, tenant-isolated database rules, audit records, and encrypted provider infrastructure. Suspected incidents must be reported through the published support channel.' },
    { title: 'Location data', body: 'Geolocation is collected only for configured attendance workflows. Employers must provide required notices and obtain any consent required for their workforce and jurisdiction.' },
  ]} />;
}

export function TermsPage() {
  return <PublicPolicyPage title="Service terms" intro="These draft terms define the operating assumptions needed for a responsible pilot. Commercial terms, governing law, liability, and support commitments require counsel and customer approval." sections={[
    { title: 'Permitted use', body: 'Customers may use the service for their own authorised workforce operations and must keep accounts, roles, configuration, and uploaded content accurate and lawful.' },
    { title: 'Customer responsibilities', body: 'The customer is responsible for employment decisions, payroll approval, statutory applicability, filing and payment, employee notices, and the actions of its administrators.' },
    { title: 'Availability and support', body: 'Pilot availability and response targets are defined in the customer launch plan. Planned maintenance and material incidents will be communicated through the designated support channel.' },
    { title: 'Data portability and exit', body: 'Before termination, authorised administrators may request supported exports. Deletion timing, backup expiry, and legally required retention are governed by the final customer agreement.' },
  ]} />;
}
