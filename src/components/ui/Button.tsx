import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: ReactNode;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className,
  ...rest
}: ButtonProps) {
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-300',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
  };
  return (
    <button className={cn(variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}
