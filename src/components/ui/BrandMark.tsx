import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// The Modcon HR mark and wordmark, from the brand identity kit.
//
// The mark is an enclosed monogram: the letter M cut into three modules and
// knocked out of a solid tile. Two full columns carry the structure, the short
// accent column is the person moving through it. It is drawn on a 24 × 24 tile
// — columns 4 units wide with 1.5-unit gaps, inset 5 units from every edge, the
// accent column stopping at 7.5 so the M reads asymmetric rather than as a
// bracket. Nothing here is a free parameter: the geometry is the identity, so
// draw it from this component rather than re-typing the rectangles.
//
// MODCON and HR sit at equal weight — HR is a division of the name, not a
// suffix — and the kit's product rule is that below 20px the wordmark is
// dropped and the tile stands alone (`<BrandMark />` with no `wordmark`).
// ---------------------------------------------------------------------------

interface BrandMarkProps {
  /** Tile edge in px. Product chrome uses 24; the sign-in lockup uses more. */
  size?: number;
  className?: string;
}

export function BrandMark({ size = 24, className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role="img"
      aria-label="Modcon HR"
    >
      <rect width="24" height="24" fill="#201e1d" />
      <rect x="4.5" y="5" width="4" height="14" fill="#ffffff" />
      <rect x="10" y="5" width="4" height="7.5" fill="#ec3013" />
      <rect x="15.5" y="5" width="4" height="14" fill="#ffffff" />
    </svg>
  );
}

interface WordmarkProps {
  /** Cap height in px — the wordmark is set in Archivo 800, flush left. */
  size?: number;
  /** Rendered on the ink tile of a dark surface rather than on paper. */
  onDark?: boolean;
  className?: string;
}

export function Wordmark({ size = 18, onDark, className }: WordmarkProps) {
  return (
    <span
      className={cn('font-display font-extrabold leading-none whitespace-nowrap', className)}
      style={{ fontSize: size, letterSpacing: '-0.035em' }}
    >
      <span className={onDark ? 'text-white' : 'text-ink-900'}>MODCON</span>
      <span className={cn('ml-[0.22em]', onDark ? 'text-brand-500' : 'text-brand-600')} style={{ letterSpacing: '-0.02em' }}>
        HR
      </span>
    </span>
  );
}

interface BrandLockupProps {
  /** Tile edge in px; the wordmark is set to match its optical weight. */
  size?: number;
  onDark?: boolean;
  className?: string;
}

/** The primary lockup — mark and wordmark, flush left, on one baseline. */
export function BrandLockup({ size = 32, onDark, className }: BrandLockupProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark size={size} />
      <Wordmark size={Math.round(size * 0.62)} onDark={onDark} />
    </span>
  );
}
