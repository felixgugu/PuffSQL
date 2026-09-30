import { SPRING_PRESETS } from '@/utils/spring';
import { prefersReducedMotion, runSpring } from '@/composables/useMotion';

export type FlipAxis = 'x' | 'y';

/** Elements opt in to the FLIP pass by carrying this attribute with a stable id. */
export const FLIP_KEY_ATTRIBUTE = 'data-flip-key';

/** In-flight FLIP springs, so re-grabbing an element takes over instead of fighting it. */
const activeFlips = new WeakMap<HTMLElement, () => void>();

/**
 * Record where every keyed element currently sits, so a reorder can animate from that position
 * to the one it lands in (First–Last–Invert–Play).
 *
 * A list that reorders instantly is a jump cut: the user saw the element under their pointer,
 * and after release it teleports somewhere else. Playing the delta back keeps the spatial
 * relationship between the thing being moved and the pointer that moved it.
 */
export function captureFlipRects(
  container: HTMLElement | null,
  selector: string
): Map<string, DOMRect> {
  const rects = new Map<string, DOMRect>();
  if (!container) return rects;

  container.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    const key = el.getAttribute(FLIP_KEY_ATTRIBUTE);
    if (key) rects.set(key, el.getBoundingClientRect());
  });

  return rects;
}

/**
 * Animate every keyed element from the captured position back to the position it holds now.
 * Call this after the DOM has been updated for the new order.
 */
export function playFlip(
  rects: Map<string, DOMRect>,
  container: HTMLElement | null,
  selector: string,
  axis: FlipAxis = 'x'
): void {
  // Reduced motion: land on the new layout directly rather than sliding across the screen.
  if (!container || rects.size === 0 || prefersReducedMotion()) return;

  const offset = axis === 'x' ? 'left' : 'top';
  const translate = (value: number) =>
    value === 0 ? '' : `translate${axis.toUpperCase()}(${value.toFixed(2)}px)`;

  container.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    const key = el.getAttribute(FLIP_KEY_ATTRIBUTE);
    const before = key ? rects.get(key) : undefined;
    if (!before) return;

    const delta = before[offset] - el.getBoundingClientRect()[offset];
    if (Math.abs(delta) < 1) return;

    // These elements also carry a CSS `transition`, which would fight the per-frame spring
    // updates and double-animate the same property.
    const previousTransition = el.style.transition;
    const previousWillChange = el.style.willChange;
    el.style.transition = 'none';
    el.style.willChange = 'transform';
    el.style.transform = translate(delta);

    activeFlips.get(el)?.();

    const cancel = runSpring({
      from: delta,
      to: 0,
      config: SPRING_PRESETS.move,
      onFrame: (value) => {
        el.style.transform = translate(value);
      },
      onComplete: () => {
        el.style.transform = '';
        el.style.transition = previousTransition;
        el.style.willChange = previousWillChange;
        activeFlips.delete(el);
      },
    });

    activeFlips.set(el, () => {
      cancel();
      el.style.transform = '';
      el.style.transition = previousTransition;
      el.style.willChange = previousWillChange;
    });
  });
}

/**
 * Drop any FLIP transform still in flight, so the next gesture starts from the settled layout
 * instead of the middle of the previous animation.
 */
export function cancelFlip(container: HTMLElement | null, selector: string): void {
  if (!container) return;

  container.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    activeFlips.get(el)?.();
    activeFlips.delete(el);
    el.style.transform = '';
    el.style.transition = '';
    el.style.willChange = '';
  });
}
