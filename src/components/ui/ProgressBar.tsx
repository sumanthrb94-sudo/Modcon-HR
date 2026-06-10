import { cn, clamp } from '@/lib/utils';

interface ProgressBarProps {
  value: number; // 0-100
  tone?: 'brand' | 'green' | 'amber' | 'red';
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

const tones = {
  brand: 'bg-brand-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
};

export function ProgressBar({ value, tone = 'brand', size = 'md', showLabel, className }: ProgressBarProps) {
  const v = clamp(value, 0, 100);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('flex-1 overflow-hidden rounded-full bg-ink-100', size === 'sm' ? 'h-1.5' : 'h-2')}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', tones[tone])}
          style={{ width: `${v}%` }}
        />
      </div>
      {showLabel && <span className="text-xs font-semibold text-ink-600 w-9 text-right">{v}%</span>}
    </div>
  );
}
