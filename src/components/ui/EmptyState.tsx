import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start justify-center py-12">
      <div className="flex h-14 w-14 items-center justify-center bg-ink-100 text-ink-500 mb-4">
        {icon ?? <Inbox size={26} />}
      </div>
      <h3 className="font-display text-base font-extrabold text-ink-900">{title}</h3>
      {description && <p className="text-sm text-ink-600 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
