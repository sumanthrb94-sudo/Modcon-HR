import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone =
  | 'gray'
  | 'blue'
  | 'green'
  | 'amber'
  | 'red'
  | 'violet'
  | 'cyan'
  | 'pink';

const tones: Record<BadgeTone, string> = {
  gray: 'bg-ink-100 text-ink-600',
  blue: 'bg-brand-50 text-brand-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-rose-50 text-rose-700',
  violet: 'bg-violet-50 text-violet-700',
  cyan: 'bg-cyan-50 text-cyan-700',
  pink: 'bg-pink-50 text-pink-700',
};

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
}

export function Badge({ children, tone = 'gray', className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

// Convenience: map common status strings to tones so modules stay consistent.
export function statusTone(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (['active', 'approved', 'completed', 'present', 'paid', 'hired', 'resolved', 'on track', 'reimbursed', 'assigned'].includes(s)) return 'green';
  if (['pending', 'processing', 'in progress', 'screening', 'probation', 'submitted', 'draft', 'self review', 'manager review'].includes(s)) return 'amber';
  if (['rejected', 'absent', 'behind', 'urgent', 'overdue', 'at risk', 'resigned'].includes(s)) return 'red';
  if (['on leave', 'notice period', 'on hold', 'half day', 'in repair'].includes(s)) return 'violet';
  if (['work from home', 'interview', 'offer', 'open', 'available'].includes(s)) return 'blue';
  return 'gray';
}
