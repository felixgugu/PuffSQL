/**
 * Spring and rubber-band math for gesture-driven UI.
 *
 * Translated from Apple's "Designing Fluid Interfaces" (WWDC 2018): motion should start from
 * the value that is on screen, inherit the gesture's velocity, and settle with a spring rather
 * than a fixed-duration curve, so it can be grabbed and reversed at any instant.
 *
 * These helpers are pure — no DOM, no Vue reactivity — so the movement they describe can be
 * unit-tested and driven from any animation loop.
 */

export interface SpringConfig {
  /**
   * 1.0 is critically damped (no overshoot). Below 1.0 the value overshoots and oscillates, so
   * reserve it for interactions that already carried momentum (a flick, a throw, a release).
   */
  damping: number;
  /**
   * Seconds it takes to reach the target. This is not a duration: a spring has no fixed end,
   * its settle time emerges from the parameters. Lower is snappier.
   */
  response: number;
}

/** The values Apple ships, mapped onto the web. */
export const SPRING_PRESETS = {
  /** Repositioning something that was not thrown — graceful, no overshoot. */
  move: { damping: 1, response: 0.4 },
  /** Drawers and sheets. */
  sheet: { damping: 0.8, response: 0.3 },
  /** A value that just left a gesture, so it should still read as thrown. */
  momentum: { damping: 0.8, response: 0.4 },
} as const satisfies Record<string, SpringConfig>;

export interface SpringState {
  value: number;
  velocity: number;
}

/**
 * Advance a spring by `dtSeconds` using semi-implicit Euler over fixed 240Hz sub-steps, which
 * keeps the integration stable when a frame runs long (a GC pause, a background tab wake-up).
 */
export function springStep(
  state: SpringState,
  target: number,
  config: SpringConfig = SPRING_PRESETS.move,
  dtSeconds: number
): SpringState {
  const response = Math.max(config.response, 0.01);
  const omega = (2 * Math.PI) / response;
  const stiffness = omega * omega;
  const dampingCoefficient = 2 * config.damping * omega;

  let { value, velocity } = state;
  let remaining = Math.min(Math.max(dtSeconds, 0), 1 / 30);
  const step = 1 / 240;

  while (remaining > 0) {
    const slice = Math.min(step, remaining);
    remaining -= slice;
    const acceleration = -stiffness * (value - target) - dampingCoefficient * velocity;
    velocity += acceleration * slice;
    value += velocity * slice;
  }

  return { value, velocity };
}

/** True once the spring is close enough that another frame would be invisible. */
export function isSpringSettled(state: SpringState, target: number): boolean {
  return Math.abs(state.value - target) < 0.1 && Math.abs(state.velocity) < 4;
}

/**
 * Progressive resistance past a boundary: the further the surface is dragged beyond the limit,
 * the less it follows. A hard stop reads as frozen, continuous resistance reads as "responsive,
 * but there is nothing more here".
 *
 * The result approaches `dimension` as the overshoot grows without bound.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (dimension <= 0) return 0;
  const magnitude = Math.abs(overshoot);
  return (magnitude * dimension * constant) / (dimension + constant * magnitude);
}

/**
 * Clamp `value` into `[min, max]`, letting it overshoot asymptotically under a rubber band
 * instead of stopping dead at the edge.
 */
export function rubberbandClamp(
  value: number,
  min: number,
  max: number,
  dimension: number,
  constant = 0.35
): number {
  if (value < min) return min - rubberband(min - value, dimension, constant);
  if (value > max) return max + rubberband(value - max, dimension, constant);
  return value;
}
