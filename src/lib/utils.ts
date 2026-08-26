import clsx, { type ClassValue } from 'clsx';

/** Tailwind-friendly className combiner. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Format a number as INR currency. */
export function formatINR(amount: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format a plain number with Indian grouping. */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}

/** "12 May 2026" style date. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Short "12 May" date. */
export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/** "5 days" / "1 month" / "2 years" for a positive day count. */
function relativeSpan(days: number): string {
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'}`;
}

/** Relative "3 days ago" style. Handles future dates instead of "-3 days ago". */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor((Date.now() - then) / day);

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days === -1) return 'Tomorrow';
  // Future dates used to fall through `days < 30` and render "-5 days ago".
  if (days < 0) return `in ${relativeSpan(-days)}`;
  return `${relativeSpan(days)} ago`;
}

/** Initials from a full name. */
export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const AVATAR_COLORS = [
  'bg-brand-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-orange-500',
];

/** Deterministic avatar color from a string seed. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Clamp a number. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** Percentage helper. */
export function pct(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}
