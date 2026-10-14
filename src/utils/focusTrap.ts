/**
 * Keyboard reach inside a modal surface.
 *
 * The selector is deliberately short: only the elements a keyboard user can actually land on, in
 * DOM order. `tabindex="-1"` is excluded on purpose — it is a programmatic target (the panel
 * itself), never a Tab stop.
 */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Where Tab lands next inside a ring of `length` stops.
 *
 * Kept free of the DOM so the wrap-around can be reasoned about (and unit tested) on its own:
 * `current` is the index of the focused stop, or a negative number when focus sits on the panel
 * rather than on a stop.
 */
export function nextTrapIndex(length: number, current: number, backwards: boolean): number {
  if (length <= 0) return -1;
  if (current < 0 || current >= length) return backwards ? length - 1 : 0;
  return (current + (backwards ? -1 : 1) + length) % length;
}

/** A stop is only real if the browser is actually laying it out. */
function isRenderable(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
  if (el.hasAttribute('inert')) return false;
  return el.getClientRects().length > 0;
}

/** Every Tab stop inside `root`, in DOM order. */
export function focusablesWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isRenderable);
}

/**
 * Move focus to the first stop inside `root`, falling back to the panel itself so a dialog with
 * no controls is still reachable — and so Escape still has somewhere to land.
 */
export function focusFirstWithin(root: HTMLElement): void {
  const [first] = focusablesWithin(root);
  (first ?? root).focus({ preventScroll: true });
}
