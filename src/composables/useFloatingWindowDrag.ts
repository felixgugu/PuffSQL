import { getCurrentInstance, onUnmounted } from 'vue';
import { createWindowDrag, type WindowDragOptions } from '@/composables/windowDrag';

export interface FloatingWindowPosition {
  top: number;
  left: number;
}

export interface FloatingWindowSize {
  width: number;
  height: number;
}

export interface UseFloatingWindowDragOptions extends WindowDragOptions {
  pos: FloatingWindowPosition;
  size: FloatingWindowSize;
  /** Maximised windows do not move. */
  isLocked: () => boolean;
}

/**
 * Drag for the floating tool windows (AI chat, data view).
 *
 * These windows are neither PrimeVue dialogs nor full-screen panels, so they keep their own
 * geometry model — reactive `pos` / `size` rendered straight into `:style`. Only the adapter
 * lives here; the drag behaviour itself (rubber-banded edges, velocity handoff, spring back)
 * comes from `windowDrag`, which is the same implementation every dialog uses.
 */
export function useFloatingWindowDrag(options: UseFloatingWindowDragOptions) {
  const { pos, size, isLocked, ...dragOptions } = options;

  const drag = createWindowDrag(
    {
      readPosition: () => ({ left: pos.left, top: pos.top }),
      writePosition: (left, top) => {
        pos.left = left;
        pos.top = top;
      },
      readSize: () => ({ width: size.width, height: size.height }),
      readViewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
      isLocked,
    },
    dragOptions
  );

  if (getCurrentInstance()) {
    onUnmounted(drag.stop);
  }

  return { startDrag: drag.startDrag, endDrag: drag.endDrag };
}
