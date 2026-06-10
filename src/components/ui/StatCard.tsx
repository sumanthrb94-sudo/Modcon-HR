import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from './Card';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  iconClass?: string;
  delta?: number; // percent change
  deltaLabel?: string;
  footer?: ReactNode;
}

export function StatCard({ label, value, icon, iconClass, delta, deltaLabel, footer }: StatCardProps) {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className="hover:shadow-card-hover transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-ink-500">{label}</p>
          <p className="text-2xl font-bold text-ink-900 mt-1">{value}</p>
        </div>
        {icon && (
          <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', iconClass ?? 'bg-brand-50 text-brand-600')}>
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
