import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from './Card';
import { SlidingNumber } from './motion';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  delta?: number; // percent change
  deltaLabel?: string;
  footer?: ReactNode;
  onClick?: () => void;
  /** Where tapping the tile goes. A tile showing a count of something should open that something. */
  to?: string;
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
  to,
  active,
}: StatCardProps) {
  const positive = (delta ?? 0) >= 0;
  const card = (
    <Card
      className={cn(
        'transition-colors duration-150',
        (onClick || to) && 'hover:border-ink-900',
        (onClick || to) && 'cursor-pointer select-none',
        active && 'border-brand-600 bg-brand-100'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        {/* min-w-0 and break-words: a value can be an email address, one word
            with nowhere to wrap, and at this size it pushed the Super Admin's
            Organizations page to 613px on a 390px phone. */}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-600">{label}</p>
          <p className="font-display text-2xl font-extrabold text-ink-900 mt-1 break-words">
            <SlidingNumber value={typeof value === 'number' ? value.toLocaleString('en-IN') : value} />
          </p>
        </div>
        {/* One ink tile for every stat card. The icon is a label, not a
            status — sixty-two of these carried six unrelated hues, which is
            what "never recolour outside the palette" rules out. */}
        {icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center bg-ink-100 text-ink-900">
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
  // A real link, so it is reachable by keyboard and opens in a new tab like any other.
  return to ? <Link to={to} className="block" aria-label={`${label}: ${value}`}>{card}</Link> : card;
}
