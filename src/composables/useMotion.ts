import { isSpringSettled, springStep, SPRING_PRESETS, type SpringConfig } from '@/utils/spring';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the user asked the system for less motion.
 *
 * Reduced motion is a gentler equivalent, not the absence of feedback: callers should drop
 * travel and looping motion but keep the opacity and colour changes that carry meaning.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

export interface RunSpringOptions {
  from: number;
  to: number;
  /** Initial velocity in value-units per second — hand the gesture's release speed to it. */
  velocity?: number;
  config?: SpringConfig;
  onFrame: (value: number, velocity: number) => void;
  onComplete?: () => void;
}

/**
 * Drive a spring from `from` to `to`, handing over `velocity` so the animation continues at the
 * exact speed the gesture left off at (the seam between dragging and animating is what separates
 * "fluid" from "fine").
 *
 * Returns a cancel function. Call it before starting a new spring — that is what makes a
 * re-grab take over from the value that is on screen instead of the value it was heading for.
 * When the platform cannot animate (no rAF, or reduced motion is on) the spring resolves
 * immediately, so callers never need a second code path.
 */
export function runSpring(options: RunSpringOptions): () => void {
  const { from, to, velocity = 0, config = SPRING_PRESETS.move, onFrame, onComplete } = options;

  if (typeof requestAnimationFrame === 'undefined' || prefersReducedMotion()) {
    onFrame(to, 0);
    onComplete?.();
    return () => {};
  }

  let state = { value: from, velocity };
  let last = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let frame = 0;
  let cancelled = false;

  const tick = (now: number) => {
    if (cancelled) return;
    const dt = Math.max((now - last) / 1000, 0);
    last = now;

    state = springStep(state, to, config, dt);

    if (isSpringSettled(state, to)) {
      onFrame(to, 0);
      onComplete?.();
      return;
    }

    onFrame(state.value, state.velocity);
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
  };
}
