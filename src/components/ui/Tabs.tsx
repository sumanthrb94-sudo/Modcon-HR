import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex items-center gap-1 border-b border-ink-200 overflow-x-auto', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors -mb-px border-b-2',
            active === tab.id
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-500 hover:text-ink-800',
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={cn(
                'ml-2 rounded-full px-1.5 py-0.5 text-xs font-semibold',
                active === tab.id ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-500',
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
