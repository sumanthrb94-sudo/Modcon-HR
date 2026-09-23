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
        {/* min-w-0 and break-words: a subtitle carrying an email address is one
            unbreakable word, and a flex child that cannot shrink below it
            pushes the whole page past a phone's width (QA saw the Admin
            dashboard 7px too wide at 390px). */}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold text-ink-900" style={{ letterSpacing: '-0.025em' }}>
            {title}
          </h1>
          {subtitle && <p className="text-sm text-ink-600 mt-1 break-words">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
