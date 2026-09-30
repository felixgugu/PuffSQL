import { ref, getCurrentInstance, onUnmounted } from 'vue';
import { rubberbandClamp, SPRING_PRESETS } from '@/utils/spring';
import { runSpring } from '@/composables/useMotion';

export interface UseSplitterOptions {
  direction: 'horizontal' | 'vertical';
  initialSize: number;
  minSize?: number | (() => number);
  maxSize?: number | (() => number);
  reverse?: boolean; // When true, dragging backwards increases the size (useful for bottom or right panels)
  onResize?: (newSize: number) => void;
  /**
   * How much the panel resists being dragged past its limits. Higher follows the pointer
   * further; 0 restores a hard stop at the boundary.
   */
  rubberBandConstant?: number;
  /**
   * Fraction of the pointer's release velocity handed to the settle spring. A rubber band has
   * already absorbed most of the energy, so the snap-back should not reuse all of it.
   */
  releaseVelocityScale?: number;
}

/** Only the last few pointer samples count when measuring the release velocity. */
const VELOCITY_SAMPLE_WINDOW_MS = 120;
/** Ceiling for the handed-off velocity, so a very fast flick cannot launch the panel. */
const MAX_RELEASE_VELOCITY = 800;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function useSplitter(options: UseSplitterOptions) {
  const {
    direction,
    initialSize,
    minSize = 50,
    maxSize = Infinity,
    reverse = false,
    onResize,
    rubberBandConstant = 0.35,
    releaseVelocityScale = 0.35,
  } = options;

  function resolveBound(val: number | (() => number) | undefined, defaultVal: number): number {
    if (typeof val === 'function') return val();
    if (typeof val === 'number') return val;
    return defaultVal;
  }

  const size = ref<number>(initialSize);
  const isDragging = ref<boolean>(false);

  let startPos = 0;
  let startSize = 0;
  let dragRange = 1;
  let samples: Array<{ pos: number; time: number }> = [];
  let cancelSettle: (() => void) | null = null;

  function sample(pos: number) {
    samples.push({ pos, time: now() });
    const cutoff = now() - VELOCITY_SAMPLE_WINDOW_MS;
    while (samples.length > 2 && samples[0]!.time < cutoff) {
      samples.shift();
    }
  }

  /**
   * Release velocity in size-units per second. Measured over the last ~120ms rather than the
   * whole gesture, because what matters is how fast the pointer was moving when it let go.
   */
  function releaseVelocity(): number {
    if (samples.length < 2) return 0;
    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    const elapsed = (last.time - first.time) / 1000;
    if (elapsed <= 0) return 0;

    const travel = (last.pos - first.pos) * (reverse ? -1 : 1);
    const velocity = travel / elapsed;
    return Math.max(Math.min(velocity, MAX_RELEASE_VELOCITY), -MAX_RELEASE_VELOCITY);
  }

  function settleToOffset(target: number, velocity: number) {
    cancelSettle?.();
    cancelSettle = runSpring({
      from: size.value,
      to: target,
      velocity: velocity * releaseVelocityScale,
      // The gesture carried momentum, so this is the one place a little bounce is justified.
      config: SPRING_PRESETS.momentum,
      onFrame: (value) => {
        size.value = Math.round(value);
        onResize?.(size.value);
      },
      onComplete: () => {
        cancelSettle = null;
      },
    });
  }

  function stopSettle() {
    cancelSettle?.();
    cancelSettle = null;
  }

  function onPointerDown(event: PointerEvent) {
    // Only respond to primary mouse button
    if (event.button !== 0) return;

    // Grabbing a panel that is still settling takes over from the value on screen rather than
    // snapping to the value it was heading for.
    stopSettle();

    isDragging.value = true;
    startPos = direction === 'horizontal' ? event.clientX : event.clientY;
    startSize = size.value;
    samples = [];
    sample(startPos);

    const currentMin = resolveBound(minSize, 50);
    const currentMax = resolveBound(maxSize, Infinity);
    dragRange = Math.max(currentMax - currentMin, 1);

    // Keep receiving move/up events even when the pointer leaves the handle or the window.
    const handle = event.currentTarget as HTMLElement | null;
    if (handle && typeof handle.setPointerCapture === 'function' && typeof event.pointerId === 'number') {
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a nicety; the document listeners below still track the drag.
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);

      // Prevent text selection during drag
      document.body.style.userSelect = 'none';
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!isDragging.value) return;

    const currentPos = direction === 'horizontal' ? event.clientX : event.clientY;
    const delta = reverse ? startPos - currentPos : currentPos - startPos;
    sample(currentPos);

    const currentMin = resolveBound(minSize, 50);
    const currentMax = resolveBound(maxSize, Infinity);

    // Past the limit the panel keeps following the pointer, but with progressive resistance
    // instead of stopping dead at the edge.
    const newSize = rubberbandClamp(
      startSize + delta,
      currentMin,
      currentMax,
      dragRange,
      rubberBandConstant
    );

    size.value = Math.round(newSize);
    onResize?.(size.value);
  }

  function onPointerUp() {
    if (!isDragging.value) return;

    isDragging.value = false;

    const velocity = releaseVelocity();
    samples = [];

    const currentMin = resolveBound(minSize, 50);
    const currentMax = resolveBound(maxSize, Infinity);
    const restingSize = Math.round(Math.min(Math.max(size.value, currentMin), currentMax));

    // Inside the limits there is no snap target: the user put the panel where they wanted it.
    // Only a rubber-banded overshoot needs to travel back.
    if (restingSize !== size.value) {
      settleToOffset(restingSize, velocity);
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);

      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  }

  function handleWindowResize() {
    if (typeof window === 'undefined') return;
    stopSettle();
    const currentMin = resolveBound(minSize, 50);
    const currentMax = resolveBound(maxSize, Infinity);

    if (size.value > currentMax) {
      size.value = Math.round(Math.max(currentMin, currentMax));
      onResize?.(size.value);
    } else if (size.value < currentMin) {
      size.value = Math.round(currentMin);
      onResize?.(size.value);
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleWindowResize);
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      stopSettle();
      if (typeof document !== 'undefined') {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleWindowResize);
      }
    });
  }

  return {
    size,
    isDragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
