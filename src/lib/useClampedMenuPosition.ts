import { useLayoutEffect, useState, type RefObject } from 'react';

export interface ClampedPosition {
  top: number;
  left: number;
}

/**
 * Where a floating panel should sit so it never runs off the viewport,
 * measured from its trigger rather than assumed from a fixed CSS anchor.
 *
 * `NotificationsMenu` and `QuickAddMenu` used `position: absolute; right: 0`,
 * which only stays on screen when the trigger itself is pinned to the
 * screen's right edge (the topbar's compact bell). Anywhere else — stacked
 * under a heading on a phone, or second in a row of two buttons — the panel
 * ran off one edge or the other: QA found the dashboard's Notifications
 * panel with its first ~40px of text invisible off the left of the screen,
 * and fixing that by flipping the anchor to the left ran Quick Add's panel
 * off the right instead, because on the Admin dashboard it sits second in a
 * row after Notifications rather than at the row's own left edge. Neither
 * fixed CSS anchor is correct for every trigger position, so this measures
 * the real one and clamps into the viewport instead of guessing it.
 *
 * Right-aligned to the trigger by default — the panel's original position —
 * and only pulled inward when that would overflow either edge. Returns
 * `null` while closed or before the first measurement, which callers use to
 * withhold the panel for one frame rather than flash it at (0, 0).
 */
export function useClampedMenuPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  panelWidth: number,
  gutter = 16,
): ClampedPosition | null {
  const [position, setPosition] = useState<ClampedPosition | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPosition(null);
      return;
    }
    const measure = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const left = Math.min(
        Math.max(rect.right - panelWidth, gutter),
        Math.max(viewportWidth - panelWidth - gutter, gutter),
      );
      setPosition({ top: rect.bottom + 8, left });
    };
    measure();
    // A phone rotated, or a window resized, while the panel happens to be
    // open — cheap to keep correct, and the alternative is a stale position
    // nobody notices until they try to tap something that is not there.
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, triggerRef, panelWidth, gutter]);

  return position;
}
