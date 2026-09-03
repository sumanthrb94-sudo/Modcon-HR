import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    // A 2px rule under the title is the system's main organising device —
    // sections are separated by the strength of the divider, not by whitespace.
    <div className="mb-6 border-b-2 border-ink-900/40 pb-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink-900" style={{ letterSpacing: '-0.025em' }}>
            {title}
          </h1>
          {subtitle && <p className="text-sm text-ink-600 mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
