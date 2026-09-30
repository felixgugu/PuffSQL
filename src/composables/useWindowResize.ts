import { getCurrentInstance, onUnmounted } from 'vue';
import { resizeWindowRect } from '@/utils/windowGeometry';

export type WindowResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r';

export interface UseWindowResizeOptions {
  pos: { top: number; left: number };
  size: { width: number; height: number };
  isLocked: () => boolean;
  minWidth: number;
  minHeight: number;
}

/**
 * Eight-direction resizing for the floating tool windows.
 *
 * This used to be copied into both windows, in two versions that disagreed about their minimum
 * width and neither of which stopped the top and left edges from being dragged off screen.
 * Extracting it means the two windows are now provably identical, and the geometry itself lives
 * in `utils/windowGeometry` alongside the dialogs' rules.
 */
export function useWindowResize(options: UseWindowResizeOptions) {
  const { pos, size, isLocked, minWidth, minHeight } = options;

  let activeHandle: WindowResizeHandle | null = null;
  let startRect = { left: 0, top: 0, width: 0, height: 0 };
  let grabX = 0;
  let grabY = 0;

  function viewport(): { width: number; height: number } {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  function onMove(event: PointerEvent) {
    if (!activeHandle) return;

    const next = resizeWindowRect(
      startRect,
      activeHandle,
      event.clientX - grabX,
      event.clientY - grabY,
      viewport(),
      { minWidth, minHeight }
    );

    pos.left = Math.round(next.left);
    pos.top = Math.round(next.top);
    size.width = Math.round(next.width);
    size.height = Math.round(next.height);
  }

  function endResize() {
    activeHandle = null;

    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endResize);
      window.removeEventListener('pointercancel', endResize);
    }
  }

  function startResize(event: PointerEvent, handle: WindowResizeHandle) {
    if (isLocked() || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    activeHandle = handle;
    grabX = event.clientX;
    grabY = event.clientY;
    startRect = { left: pos.left, top: pos.top, width: size.width, height: size.height };

    const node = event.currentTarget as HTMLElement | null;
    if (node && typeof node.setPointerCapture === 'function' && typeof event.pointerId === 'number') {
      try {
        node.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a nicety; the window listeners below still track the resize.
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endResize);
    window.addEventListener('pointercancel', endResize);
  }

  if (getCurrentInstance()) {
    onUnmounted(endResize);
  }

  return { startResize, endResize };
}
