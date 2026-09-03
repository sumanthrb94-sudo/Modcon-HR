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

// Tints from the 100 step of a ramp with its 800 step for the label — the
// pairing the brand kit's `.tag` uses, so every tag carries the same visual
// weight. `blue` is the brand tone (it was named for the old palette and is
// spelt into too many call sites to rename); the state hues stay distinct
// because an approval and a rejection have to be told apart at a glance, but
// they are muted to sit under the accent rather than compete with it.
const tones: Record<BadgeTone, string> = {
  gray: 'bg-ink-100 text-ink-700',
  blue: 'bg-brand-100 text-brand-800',
  green: 'bg-emerald-50 text-emerald-800',
  amber: 'bg-amber-50 text-amber-800',
  red: 'bg-rose-50 text-rose-800',
  violet: 'bg-violet-50 text-violet-800',
  cyan: 'bg-cyan-50 text-cyan-800',
  pink: 'bg-pink-50 text-pink-800',
};

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
  onClick?: () => void;
}

export function Badge({ children, tone = 'gray', className, dot, onClick }: BadgeProps) {
  return (
    <span
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-medium tracking-[0.02em]',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 bg-current opacity-70" />}
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
