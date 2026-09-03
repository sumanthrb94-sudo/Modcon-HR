import clsx, { type ClassValue } from 'clsx';

import { APP_TIME_ZONE } from './today';

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

// ---------------------------------------------------------------------------
// Date rendering — always in IST.
//
// Stored dates are `YYYY-MM-DD`, which JS parses as UTC midnight. Rendering
// that with the viewer's local zone moves it backwards for anyone west of
// Greenwich: a holiday on 2026-08-15 displays as 14 Aug in New York, and a
// birthday on the 1st lands in the previous month. Pinning the zone keeps the
// date the business meant, wherever it is read.
// ---------------------------------------------------------------------------

function istDateFormat(iso: string, options: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { ...options, timeZone: APP_TIME_ZONE });
}

/** "12 May 2026" style date. */
export function formatDate(iso: string): string {
  return istDateFormat(iso, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Short "12 May" date. */
export function formatDateShort(iso: string): string {
  return istDateFormat(iso, { day: '2-digit', month: 'short' });
}

/** "Mon" — weekday of a stored date, in IST. */
export function formatWeekdayShort(iso: string): string {
  return istDateFormat(iso, { weekday: 'short' });
}

/** "Monday" — weekday of a stored date, in IST. */
export function formatWeekdayLong(iso: string): string {
  return istDateFormat(iso, { weekday: 'long' });
}

/** "May" — month of a stored date, in IST. */
export function formatMonthShort(iso: string): string {
  return istDateFormat(iso, { month: 'short' });
}

/** "May 2026" — month and year of a stored date, in IST. */
export function formatMonthYearLong(iso: string): string {
  return istDateFormat(iso, { month: 'long', year: 'numeric' });
}

const istYmdParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function ymdOf(iso: string): { year: number; month: number; day: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts: Record<string, string> = {};
  istYmdParts.formatToParts(d).forEach((p) => { parts[p.type] = p.value; });
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/** Day of month (1–31) of a stored date, in IST. */
export function dayOfMonth(iso: string): number {
  return ymdOf(iso)?.day ?? NaN;
}

/** Month index (0–11) of a stored date, in IST — comparable with Date#getMonth. */
export function monthIndexOf(iso: string): number {
  const parts = ymdOf(iso);
  return parts ? parts.month - 1 : NaN;
}

/** Full year of a stored date, in IST. */
export function yearOf(iso: string): number {
  return ymdOf(iso)?.year ?? NaN;
}

/** Relative "3 days ago" style. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(diff / day);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  return `${Math.floor(months / 12)} year${months >= 24 ? 's' : ''} ago`;
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

// Steps of the ink ramp with one accent, rather than a rainbow: the identity
// is mono, and a spread of unrelated hues was the loudest thing on a page of
// people. The steps are all dark enough to carry white initials.
const AVATAR_COLORS = [
  'bg-ink-900',
  'bg-ink-700',
  'bg-brand-700',
  'bg-ink-800',
  'bg-ink-600',
  'bg-brand-800',
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
