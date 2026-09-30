/**
 * Geometry rules for every movable window in the app.
 *
 * The 12 PrimeVue dialogs, the two floating tool windows and the grid's pane splitters all have
 * to agree on one definition of "inside the screen"; keeping that definition here is what stops
 * them drifting apart. Pure functions — no DOM, no Vue reactivity — so the rules are testable.
 *
 * The rule is absolute containment: a window may never rest partly outside the viewport, and a
 * drag is clamped rather than allowed to overshoot and spring back.
 */

export interface WindowRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface SizeLimits {
  minWidth: number;
  minHeight: number;
}

export interface WindowBounds {
  minLeft: number;
  maxLeft: number;
  minTop: number;
  maxTop: number;
}

/** `edges` is a subset of 'l' | 'r' | 't' | 'b', e.g. 'tl' for the top-left corner. */
export type ResizeEdges = string;

/**
 * The range a window of this size is allowed to *rest* in: the whole window stays on screen.
 *
 * This is the single definition of "in bounds". Everything else — the hard clamp a drag settles
 * to, and the centre of the rubber band's resistance — is derived from it, so a window can never
 * come to rest partly outside the viewport. When the window is larger than the viewport the range
 * collapses to 0, pinning it to the origin rather than letting it flip to the opposite edge.
 */
export function windowBounds(size: ViewportSize, viewport: ViewportSize): WindowBounds {
  return {
    minLeft: 0,
    maxLeft: Math.max(0, viewport.width - size.width),
    minTop: 0,
    maxTop: Math.max(0, viewport.height - size.height),
  };
}

/** Slide a window until the whole of it is inside the viewport. */
export function clampWindowToViewport(rect: WindowRect, viewport: ViewportSize): WindowRect {
  const bounds = windowBounds(rect, viewport);

  return {
    ...rect,
    left: Math.min(Math.max(rect.left, bounds.minLeft), bounds.maxLeft),
    top: Math.min(Math.max(rect.top, bounds.minTop), bounds.maxTop),
  };
}

/**
 * Apply a resize gesture to one or more edges.
 *
 * Every edge is clamped twice: it cannot cross the screen edge, and it cannot shrink the window
 * below its minimum size. Clamping (rather than ignoring the move) is what keeps a resize from
 * silently dying when the pointer overtakes a limit.
 */
export function resizeWindowRect(
  start: WindowRect,
  edges: ResizeEdges,
  dx: number,
  dy: number,
  viewport: ViewportSize,
  limits: SizeLimits
): WindowRect {
  let left = start.left;
  let top = start.top;
  let right = start.left + start.width;
  let bottom = start.top + start.height;

  if (edges.includes('l')) left = Math.min(Math.max(start.left + dx, 0), right - limits.minWidth);
  if (edges.includes('r')) right = Math.max(Math.min(right + dx, viewport.width), left + limits.minWidth);
  if (edges.includes('t')) top = Math.min(Math.max(start.top + dy, 0), bottom - limits.minHeight);
  if (edges.includes('b')) bottom = Math.max(Math.min(bottom + dy, viewport.height), top + limits.minHeight);

  return { left, top, width: right - left, height: bottom - top };
}
