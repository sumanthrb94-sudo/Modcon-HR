import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Accessible name, for selects whose <label> is not associated by id. */
  ariaLabel?: string;
}

/**
 * A select that always has an accessible name.
 *
 * Most call sites are filter bars — a bare select whose first option reads
 * "All Departments" or "All Statuses" — and only a third of them passed
 * `ariaLabel`, so a screen reader announced "combo box" and nothing else on
 * every list page (G11, R4-M4). The fallback is the placeholder, or else the
 * first option, which in a filter bar is exactly what names it. It is applied
 * only when nothing better exists: an explicit `ariaLabel` wins, and so does a
 * `<label>` wrapping or pointing at the element, which is why it is checked on
 * the element rather than decided from props.
 */
export function Select({ value, onChange, options, className, placeholder, disabled, ariaLabel }: SelectProps) {
  const ref = useRef<HTMLSelectElement>(null);
  const fallback = placeholder || options[0]?.label || undefined;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || ariaLabel) return;
    if (el.labels && el.labels.length > 0) el.removeAttribute('aria-label');
    else if (fallback) el.setAttribute('aria-label', fallback);
  }, [ariaLabel, fallback]);

  return (
    <select
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn('input cursor-pointer', className)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
