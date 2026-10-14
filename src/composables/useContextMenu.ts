import { ref } from 'vue';
import type { RectLike } from '@/utils/popoverPlacement';

/**
 * State for a right-click menu: where the pointer was and whether the menu is open.
 *
 * The rect is a zero-size virtual anchor at the cursor, which is what `SqMenu`'s `anchorRect`
 * expects — the same placement code then keeps the menu inside the viewport near screen edges.
 */
export function useContextMenu() {
  const isOpen = ref(false);
  const rect = ref<RectLike>({ top: 0, bottom: 0, left: 0, right: 0 });

  function openAt(event: MouseEvent) {
    rect.value = {
      top: event.clientY,
      bottom: event.clientY,
      left: event.clientX,
      right: event.clientX,
    };
    isOpen.value = true;
  }

  function close() {
    isOpen.value = false;
  }

  return { isOpen, rect, openAt, close };
}
