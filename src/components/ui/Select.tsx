import { cn } from '@/lib/utils';

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  className?: string;
  placeholder?: string;
}

export function Select({ value, onChange, options, className, placeholder }: SelectProps) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn('input cursor-pointer', className)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
