import { getCurrentInstance, onUnmounted } from 'vue';
import { createWindowDrag } from '@/composables/windowDrag';
import { resizeWindowRect, type WindowRect } from '@/utils/windowGeometry';

export interface UseDialogWindowOptions {
  /** Smallest size a dialog may be resized to. */
  minWidth?: number;
  minHeight?: number;
}

/** Corner and edge grab zones, injected into every dialog. */
const HANDLES = ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'] as const;
type ResizeHandle = (typeof HANDLES)[number];

const SHARED_CLASS = 'sq-dialog-window';
const READY_ATTRIBUTE = 'data-sq-window';
/**
 * The dialog root is `.p-dialog`, the header is `.p-dialog-header`. PrimeVue only merges the
 * caller's fallthrough attributes (`class`, `style`, listeners) into the root section, which is
 * why the marker class below reliably lands on `.p-dialog` and not on the overlay mask.
 *
 * Dialogs built with `:showHeader="false"` render their own title bar instead of PrimeVue's, so
 * they opt that bar in by adding the `sq-dialog-drag-handle` class.
 */
const HEADER_SELECTOR = '.p-dialog-header, .sq-dialog-drag-handle';
const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, [data-pc-section="headeractions"]';

const DEFAULT_MIN_WIDTH = 360;
const DEFAULT_MIN_HEIGHT = 220;

let instanceCount = 0;

/**
 * Window behaviour shared by every dialog: drag by the header, resize from any edge or corner,
 * and never come to rest outside the viewport.
 *
 * Dragging is delegated to `windowDrag`, the same implementation the floating tool windows use,
 * so the feel is identical everywhere: pushing past an edge meets progressive resistance and
 * letting go springs the dialog back onto the nearest edge carrying the release velocity. The
 * spring always settles inside the shared resting range, so the overshoot is gesture-only.
 *
 * Resizing stays a hard clamp: sizing is a deliberate act with a minimum, not a throw.
 *
 * Usage:
 *   const dialogWindow = useDialogWindow();
 *   <Dialog :class="dialogWindow.marker" @show="dialogWindow.onShow" @hide="dialogWindow.onHide" …>
 */
export function useDialogWindow(options: UseDialogWindowOptions = {}) {
  const minWidth = options.minWidth ?? DEFAULT_MIN_WIDTH;
  const minHeight = options.minHeight ?? DEFAULT_MIN_HEIGHT;
  // Unique per dialog instance, so nested dialogs (a template's "add" dialog inside the template
  // library, for example) never grab each other's element.
  const instanceClass = `sq-dialog-window-${++instanceCount}`;

  let root: HTMLElement | null = null;
  let teardown: (() => void) | null = null;
  let releaseGesture: (() => void) | null = null;
  /** The dialog's live geometry, kept in sync so the drag and the resize agree on it. */
  let geometry: WindowRect = { left: 0, top: 0, width: 0, height: 0 };

  function viewport(): { width: number; height: number } {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  function applyGeometry() {
    if (!root) return;
    root.style.left = `${Math.round(geometry.left)}px`;
    root.style.top = `${Math.round(geometry.top)}px`;
    root.style.width = `${Math.round(geometry.width)}px`;
    root.style.height = `${Math.round(geometry.height)}px`;
  }

  /**
   * Convert a dialog from "centred by the overlay mask" to explicit fixed geometry, so moving
   * and sizing it become simple arithmetic on four numbers.
   */
  function pin(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    el.style.position = 'fixed';
    el.style.margin = '0';
    // The size utilities (`max-w-[95vw]`, `h-[80vh]`) would otherwise fight the resize.
    el.style.maxWidth = 'none';
    el.style.maxHeight = 'none';
    geometry = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    applyGeometry();
  }

  const drag = createWindowDrag({
    readPosition: () => ({ left: geometry.left, top: geometry.top }),
    writePosition: (left, top) => {
      geometry.left = left;
      geometry.top = top;
      applyGeometry();
    },
    readSize: () => ({ width: geometry.width, height: geometry.height }),
    readViewport: viewport,
    isLocked: () => root === null,
    beginGesture: () => {
      if (root) pin(root);
    },
  });

  /** Track a resize gesture with the shared pointer plumbing. */
  function beginResizeGesture(onMove: (event: PointerEvent) => void) {
    releaseGesture?.();

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.userSelect = '';
      releaseGesture = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.body.style.userSelect = 'none';
    releaseGesture = onUp;
  }

  /** Drag the whole window by its header. */
  function startDrag(event: PointerEvent) {
    const target = event.target as HTMLElement | null;
    // The header also hosts the close button and any actions; those are not drag handles.
    if (target?.closest(INTERACTIVE_SELECTOR)) return;
    drag.startDrag(event);
  }

  /** Resize from any edge or corner, bounded by the viewport and the minimum size. */
  function startResize(event: PointerEvent, grab: ResizeHandle) {
    const el = root;
    if (!el || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    pin(el);
    const start = { ...geometry };
    const grabX = event.clientX;
    const grabY = event.clientY;

    const node = event.currentTarget as HTMLElement | null;
    if (node && typeof node.setPointerCapture === 'function' && typeof event.pointerId === 'number') {
      try {
        node.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a nicety; the window listeners below still track the resize.
      }
    }

    beginResizeGesture((move) => {
      geometry = resizeWindowRect(
        start,
        grab,
        move.clientX - grabX,
        move.clientY - grabY,
        viewport(),
        { minWidth, minHeight }
      );
      applyGeometry();
    });
  }

  function setup(el: HTMLElement) {
    root = el;

    // The handles are absolutely positioned, so the dialog has to be their containing block.
    // Done here rather than in CSS so the `fixed` positioning of the custom floating windows
    // (which share the same surface class) is never disturbed by specificity.
    if (getComputedStyle(el).position === 'static') {
      el.style.position = 'relative';
    }

    const header = el.querySelector<HTMLElement>(HEADER_SELECTOR);
    header?.addEventListener('pointerdown', startDrag);

    const disposers = HANDLES.map((grab) => {
      const node = document.createElement('div');
      node.className = `sq-dialog-resize-handle sq-dialog-resize-${grab}`;
      node.setAttribute('aria-hidden', 'true');

      const onPointerDown = (event: PointerEvent) => startResize(event, grab);
      node.addEventListener('pointerdown', onPointerDown);
      el.appendChild(node);

      return () => {
        node.removeEventListener('pointerdown', onPointerDown);
        node.remove();
      };
    });

    teardown = () => {
      header?.removeEventListener('pointerdown', startDrag);
      disposers.forEach((dispose) => dispose());
    };
  }

  /** Bind to the dialog's `@show`: the element only exists once the dialog is on screen. */
  function onShow() {
    if (typeof document === 'undefined') return;
    const el = document.querySelector<HTMLElement>(`.${instanceClass}`);
    if (!el || el.getAttribute(READY_ATTRIBUTE) === 'true') return;
    el.setAttribute(READY_ATTRIBUTE, 'true');
    setup(el);
  }

  /** Bind to the dialog's `@hide`. */
  function onHide() {
    drag.stop();
    releaseGesture?.();
    releaseGesture = null;
    teardown?.();
    teardown = null;
    root?.removeAttribute(READY_ATTRIBUTE);
    root = null;
  }

  if (getCurrentInstance()) {
    onUnmounted(onHide);
  }

  return {
    /** Add to the dialog's class list so this instance can find its own element. */
    marker: `${SHARED_CLASS} ${instanceClass}`,
    onShow,
    onHide,
  };
}
