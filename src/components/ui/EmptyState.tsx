import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /**
   * `h1` when the empty state IS the page — a route that renders nothing else
   * would otherwise have no top-level heading at all (G11). Inside a page it
   * stays `h2`, beneath the page's own h1.
   */
  headingLevel?: 'h1' | 'h2';
}

export function EmptyState({ icon, title, description, action, headingLevel = 'h2' }: EmptyStateProps) {
  const Heading = headingLevel;
  return (
    <div className="flex flex-col items-start justify-center py-12">
      <div className="flex h-14 w-14 items-center justify-center bg-ink-100 text-ink-500 mb-4">
        {icon ?? <Inbox size={26} />}
      </div>
      <Heading className="font-display text-base font-extrabold text-ink-900">{title}</Heading>
      {description && <p className="text-sm text-ink-600 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
