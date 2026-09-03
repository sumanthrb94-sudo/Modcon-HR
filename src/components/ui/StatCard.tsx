import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from './Card';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  delta?: number; // percent change
  deltaLabel?: string;
  footer?: ReactNode;
  onClick?: () => void;
  active?: boolean;
}

export function StatCard({
  label,
  value,
  icon,
  delta,
  deltaLabel,
  footer,
  onClick,
  active,
}: StatCardProps) {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card
      className={cn(
        'transition-colors duration-150',
        onClick && 'hover:border-ink-900',
        onClick && 'cursor-pointer select-none',
        active && 'border-brand-600 bg-brand-100'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-600">{label}</p>
          <p className="font-display text-2xl font-extrabold text-ink-900 mt-1">{value}</p>
        </div>
        {/* One ink tile for every stat card. The icon is a label, not a
            status — sixty-two of these carried six unrelated hues, which is
            what "never recolour outside the palette" rules out. */}
        {icon && (
          <div className="flex h-11 w-11 items-center justify-center bg-ink-100 text-ink-900">
            {icon}
          </div>
        )}
      </div>
      {(delta !== undefined || footer) && (
        <div className="mt-3 flex items-center gap-1.5 text-sm">
          {delta !== undefined && (
            <span className={cn('inline-flex items-center gap-1 font-semibold', positive ? 'text-emerald-600' : 'text-rose-600')}>
              {positive ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
              {Math.abs(delta)}%
            </span>
          )}
          {deltaLabel && <span className="text-ink-400">{deltaLabel}</span>}
          {footer}
        </div>
      )}
    </Card>
  );
}
