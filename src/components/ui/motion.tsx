/**
 * Motion primitives — one vocabulary for the whole app.
 *
 * Public pages (landing, login, careers) use the full set: blur reveals on
 * scroll, word-by-word headlines, staggered grids. Inside the app motion stays
 * out of the way — a quick fade per route, digits that slide into a stat card,
 * a dialog that settles — because somebody approving leave is there to click,
 * not to watch.
 *
 * Two rules every primitive here keeps:
 *  - **The text in the DOM is always the final text.** `SlidingNumber` animates
 *    the characters it is given; it never counts up through values that are not
 *    true, so a screen reader, a copy-paste or a test reading the page in the
 *    middle of the animation reads the real figure.
 *  - **A reveal drops its `filter` once it lands** (`transitionEnd`). A leftover
 *    `filter: blur(0)` makes the element a containing block for
 *    `position: fixed` descendants, which pins a dialog opened inside it to the
 *    section rather than the viewport.
 *
 * Reduced motion is handled once, by `<MotionConfig reducedMotion="user">` in
 * `src/main.tsx`, plus the CSS guard in `src/index.css` for the keyframe
 * animations Tailwind owns.
 */
import { Children, type ReactNode } from 'react';
import { motion, type Variants } from 'motion/react';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const spring = { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 } as const;

const blurIn: Variants = {
  hidden: { opacity: 0, y: 14, filter: 'blur(8px)' },
  // A function of `custom` so FadeIn can delay itself; under a Stagger the
  // custom is undefined and the parent's stagger decides the timing.
  visible: (delay?: number) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: delay ? { duration: 0.6, ease: EASE_OUT, delay } : { duration: 0.6, ease: EASE_OUT },
    transitionEnd: { filter: 'none' },
  }),
};

interface FadeInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Reveal when scrolled into view (default) or immediately on mount. */
  onView?: boolean;
  as?: 'div' | 'section' | 'li' | 'article' | 'span';
}

/** Fade-in-blur reveal, once. */
export function FadeIn({ children, className, delay = 0, onView = true, as = 'div' }: FadeInProps) {
  const Tag = motion[as];
  const trigger = onView
    ? { whileInView: 'visible' as const, viewport: { once: true, margin: '0px 0px -10% 0px' } }
    : { animate: 'visible' as const };
  return (
    <Tag
      className={className}
      variants={blurIn}
      initial="hidden"
      {...trigger}
      custom={delay}
    >
      {children}
    </Tag>
  );
}

interface StaggerProps {
  children: ReactNode;
  className?: string;
  /** Seconds between children. */
  step?: number;
  delay?: number;
  onView?: boolean;
}

/** Reveals its `StaggerItem` children one after another. */
export function Stagger({ children, className, step = 0.07, delay = 0, onView = true }: StaggerProps) {
  const trigger = onView
    ? { whileInView: 'visible' as const, viewport: { once: true, margin: '0px 0px -10% 0px' } }
    : { animate: 'visible' as const };
  return (
    <motion.div
      className={className}
      initial="hidden"
      {...trigger}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: step, delayChildren: delay } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li' | 'article';
}) {
  const Tag = motion[as];
  return (
    <Tag className={className} variants={blurIn}>
      {children}
    </Tag>
  );
}

/**
 * A headline that arrives word by word. The words are real text nodes in
 * order, separated by real spaces, so the heading reads and matches exactly as
 * its string.
 */
export function TextEffect({
  children,
  className,
  delay = 0,
  step = 0.06,
  as = 'h1',
}: {
  children: string;
  className?: string;
  delay?: number;
  step?: number;
  as?: 'h1' | 'h2' | 'h3' | 'p';
}) {
  const Tag = motion[as];
  const words = children.split(' ');
  return (
    <Tag
      className={className}
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: step, delayChildren: delay } } }}
    >
      {words.map((word, i) => (
        <span key={`${word}-${i}`}>
          <motion.span className="inline-block" variants={blurIn}>
            {word}
          </motion.span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </Tag>
  );
}

/**
 * Format a number the Indian way — 1,23,45,678 — optionally as rupees.
 * `Intl` already knows the grouping; this only fixes the locale and digits.
 */
export function formatIndian(value: number, { rupee = false, decimals = 0 } = {}): string {
  const text = value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return rupee ? `₹${text}` : text;
}

/**
 * Digits that slide up into place. Takes the final value — a number, or a
 * pre-formatted string such as "₹1,23,456" or "12 / 15" — and animates each
 * digit in its own clipped slot. Only digits move; separators, symbols and
 * words sit still, so "—" or "Not set" render as plain text.
 *
 * A digit re-animates when it changes (it is keyed by position and value), so
 * a total that moves from 1,240 to 1,250 rolls only the tens.
 */
export function SlidingNumber({
  value,
  className,
  rupee = false,
}: {
  value: number | string;
  className?: string;
  rupee?: boolean;
}) {
  const text = typeof value === 'number' ? formatIndian(value, { rupee }) : value;
  // A value with no digits at all is a word ("Not measured", "—"): nothing to roll.
  if (!/\d/.test(text)) return <span className={className}>{text}</span>;
  // Words stay unbreakable (nowrap) and are joined by real spaces, so the
  // value wraps only where its plain-text form would and copies as typed.
  const words = text.split(' ');
  let position = text.length;
  const slots = words.map((word) => {
    const chars = Array.from(word).map((ch) => {
      // Keyed by position from the right, so a new leading digit does not
      // re-key — and re-roll — every digit after it.
      const key = position--;
      return { ch, key };
    });
    position--; // the space
    return chars;
  });
  return (
    <span className={className}>
      {slots.map((chars, w) => (
        <span key={w}>
          <span className="whitespace-nowrap">
            {chars.map(({ ch, key }, i) =>
              /\d/.test(ch) ? (
                <span key={key} className="relative inline-block overflow-hidden align-bottom">
                  <motion.span
                    key={ch}
                    className="inline-block"
                    initial={{ y: '70%', opacity: 0 }}
                    animate={{ y: '0%', opacity: 1 }}
                    transition={{ ...spring, delay: Math.min(i, 8) * 0.025 }}
                  >
                    {ch}
                  </motion.span>
                </span>
              ) : (
                <span key={key}>{ch}</span>
              ),
            )}
          </span>
          {w < slots.length - 1 ? ' ' : null}
        </span>
      ))}
    </span>
  );
}

/**
 * A route's content settling in. Light on purpose — a 180 ms fade and a few
 * pixels of rise — and no exit animation, so navigating never waits on the
 * page being left.
 */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/** Convenience: stagger a plain list of nodes without wrapping each by hand. */
export function StaggerList({ children, className, itemClassName, step }: {
  children: ReactNode;
  className?: string;
  itemClassName?: string;
  step?: number;
}) {
  return (
    <Stagger className={className} step={step}>
      {Children.toArray(children).map((child, i) => (
        <StaggerItem key={i} className={itemClassName}>
          {child}
        </StaggerItem>
      ))}
    </Stagger>
  );
}
