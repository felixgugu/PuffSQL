import { rubberbandClamp, SPRING_PRESETS } from '@/utils/spring';
import { clampWindowToViewport, windowBounds } from '@/utils/windowGeometry';
import { runSpring } from '@/composables/useMotion';

/**
 * The drag behaviour every window in the app shares, as a plain factory rather than a Vue hook:
 * it only deals in numbers, so the PrimeVue dialogs (which own a DOM element) and the floating
 * tool windows (which own reactive `pos` / `size`) can both drive it through a small adapter.
 *
 * The feel: pushing past an edge meets progressive resistance instead of a wall, and letting go
 * springs the window back onto the nearest edge carrying the pointer's release velocity — so
 * there is no seam between dragging and animating, and grabbing it mid-flight takes over from
 * wherever it is on screen.
 *
 * The bounds are always the shared ones from `utils/windowGeometry`: the rubber band is only the
 * *transient* overshoot during the gesture, and the spring always settles back inside the range
 * where the whole window is on screen.
 */

/** Only the last few pointer samples count when measuring the release velocity. */
const VELOCITY_SAMPLE_WINDOW_MS = 120;
/** Ceiling for the handed-off velocity, so a very fast flick cannot launch the window. */
const MAX_RELEASE_VELOCITY = 900;

export interface WindowDragHost {
  /** Where the window is now, in viewport coordinates. */
  readPosition(): { left: number; top: number };
  writePosition(left: number, top: number): void;
  readSize(): { width: number; height: number };
  readViewport(): { width: number; height: number };
  /** Maximised or otherwise fixed windows do not move. */
  isLocked(): boolean;
  /**
   * Runs once per gesture, before anything reads the geometry — this is where a window that is
   * centred by its container pins itself to explicit coordinates.
   */
  beginGesture?(): void;
}

export interface WindowDragOptions {
  /** How much the window resists being pushed past an edge. Higher follows the pointer further. */
  rubberBandConstant?: number;
  /** Fraction of the pointer's release velocity handed to the spring back. */
  releaseVelocityScale?: number;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function createWindowDrag(host: WindowDragHost, options: WindowDragOptions = {}) {
  const { rubberBandConstant = 0.35, releaseVelocityScale = 0.35 } = options;

  let dragging = false;
  let grabX = 0;
  let grabY = 0;
  let originLeft = 0;
  let originTop = 0;
  let samples: Array<{ x: number; y: number; time: number }> = [];
  let cancelSettle: (() => void) | null = null;

  /** Velocity in px/s, measured over the last ~120ms rather than the whole gesture. */
  function releaseVelocity(): { x: number; y: number } {
    if (samples.length < 2) return { x: 0, y: 0 };

    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    const elapsed = (last.time - first.time) / 1000;
    if (elapsed <= 0) return { x: 0, y: 0 };

    const clamp = (value: number) =>
      Math.max(Math.min(value, MAX_RELEASE_VELOCITY), -MAX_RELEASE_VELOCITY);

    return { x: clamp((last.x - first.x) / elapsed), y: clamp((last.y - first.y) / elapsed) };
  }

  /** Spring the window back onto the nearest edge, carrying the release velocity with it. */
  function settle(targetLeft: number, targetTop: number, velocity: { x: number; y: number }) {
    cancelSettle?.();

    const start = host.readPosition();
    let left = start.left;
    let top = start.top;
    const publish = () => host.writePosition(left, top);

    // Two independent springs: a single 2D spring desyncs as soon as X and Y move at different
    // speeds. Each publishes the whole position, so neither depends on the other's frame order.
    const stopX = runSpring({
      from: left,
      to: targetLeft,
      velocity: velocity.x * releaseVelocityScale,
      config: SPRING_PRESETS.momentum,
      onFrame: (value) => {
        left = value;
        publish();
      },
      onComplete: () => {
        left = Math.round(targetLeft);
        publish();
      },
    });

    const stopY = runSpring({
      from: top,
      to: targetTop,
      velocity: velocity.y * releaseVelocityScale,
      config: SPRING_PRESETS.momentum,
      onFrame: (value) => {
        top = value;
        publish();
      },
      onComplete: () => {
        top = Math.round(targetTop);
        publish();
      },
    });

    cancelSettle = () => {
      stopX();
      stopY();
    };
  }

  function onMove(event: PointerEvent) {
    if (!dragging) return;

    const { width, height } = host.readSize();
    // Track the delta from the grab point so the window stays glued to where it was grabbed.
    const left = originLeft + (event.clientX - grabX);
    const top = originTop + (event.clientY - grabY);

    samples.push({ x: event.clientX, y: event.clientY, time: now() });
    const cutoff = now() - VELOCITY_SAMPLE_WINDOW_MS;
    while (samples.length > 2 && samples[0]!.time < cutoff) {
      samples.shift();
    }

    // Past an edge the window keeps following the pointer, but with progressive resistance.
    const bounds = windowBounds({ width, height }, host.readViewport());
    host.writePosition(
      rubberbandClamp(left, bounds.minLeft, bounds.maxLeft, width, rubberBandConstant),
      rubberbandClamp(top, bounds.minTop, bounds.maxTop, height, rubberBandConstant)
    );
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;

    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    }

    const velocity = releaseVelocity();
    samples = [];

    const size = host.readSize();
    const current = host.readPosition();
    const resting = clampWindowToViewport(
      { ...current, width: size.width, height: size.height },
      host.readViewport()
    );

    // Inside the bounds there is nothing to spring back from: the window stays exactly where the
    // pointer left it. Only the rubber-banded overshoot travels home.
    if (
      Math.abs(resting.left - current.left) < 0.5 &&
      Math.abs(resting.top - current.top) < 0.5
    ) {
      host.writePosition(resting.left, resting.top);
      return;
    }

    settle(resting.left, resting.top, velocity);
  }

  function startDrag(event: PointerEvent) {
    if (host.isLocked() || event.button !== 0) return;

    // Grabbing a window that is still springing back takes over from where it is on screen,
    // rather than snapping to where it was heading.
    cancelSettle?.();
    cancelSettle = null;

    host.beginGesture?.();

    dragging = true;
    grabX = event.clientX;
    grabY = event.clientY;
    const start = host.readPosition();
    originLeft = start.left;
    originTop = start.top;
    samples = [{ x: grabX, y: grabY, time: now() }];

    const handle = event.currentTarget as HTMLElement | null;
    if (
      handle &&
      typeof handle.setPointerCapture === 'function' &&
      typeof event.pointerId === 'number'
    ) {
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a nicety; the window listeners below still track the drag.
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  /** Drop any in-flight spring back and end the gesture, e.g. when the window is hidden. */
  function stop() {
    cancelSettle?.();
    cancelSettle = null;
    endDrag();
  }

  return { startDrag, endDrag, stop };
}
