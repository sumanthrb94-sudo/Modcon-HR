import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Accessible name. Defaults to the placeholder, which is what a sighted user reads as the field's label. */
  ariaLabel?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className, ariaLabel }: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder.replace(/…$/, '')}
        className="input pl-9"
      />
    </div>
  );
}
