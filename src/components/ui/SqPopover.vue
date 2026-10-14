<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      ref="panelRef"
      class="sq-popover"
      :class="{ 'is-ready': ready }"
      :style="{ top: `${top}px`, left: `${left}px`, minWidth: minWidth }"
      :role="role"
      :aria-label="ariaLabel"
    >
      <slot />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { placePanel } from '@/utils/popoverPlacement';
import type { RectLike } from '@/utils/popoverPlacement';

/**
 * Anything that can report the rectangle the panel should hang off. A real element satisfies this,
 * and so does a virtual anchor built from a pointer position (context menus).
 */
export interface SqPopoverAnchor {
  getBoundingClientRect(): RectLike;
  contains?(node: Node): boolean;
}

/**
 * Minimal floating panel (replaces PrimeVue Popover / Menu overlays).
 *
 * Owns exactly the three behaviours an overlay must get right: it is positioned against its
 * trigger (flipping above it and clamping to the viewport when there is no room below), it closes
 * on outside pointer-down and on Escape, and it never traps focus — a popover is a side trip, not
 * a modal. Dialogs keep their own focus trap.
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** Element the panel is anchored to; its rect drives the position. */
    anchor?: SqPopoverAnchor | null;
    align?: 'start' | 'end';
    /** Rendered as `min-width`, e.g. `16rem`. */
    minWidth?: string;
    role?: string;
    ariaLabel?: string;
  }>(),
  { align: 'start', minWidth: '12rem', role: 'dialog' }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const panelRef = ref<HTMLElement | null>(null);
const top = ref(0);
const left = ref(0);
const ready = ref(false);

function close() {
  emit('update:modelValue', false);
}

function updatePosition() {
  const panel = panelRef.value;
  const anchor = props.anchor;
  if (!panel || !anchor) return;

  const rect = anchor.getBoundingClientRect();
  const placed = placePanel({
    anchor: rect,
    panel: { width: panel.offsetWidth, height: panel.offsetHeight },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    align: props.align,
  });
  top.value = placed.top;
  left.value = placed.left;
  ready.value = true;
}

function onPointerDown(event: PointerEvent) {
  const target = event.target as Node | null;
  if (!target) return;
  if (panelRef.value?.contains(target)) return;
  if (props.anchor?.contains?.(target)) return;
  close();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    close();
  }
}

function onWindowChange() {
  updatePosition();
}

function bindListeners() {
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('resize', onWindowChange);
  window.addEventListener('scroll', onWindowChange, true);
}

function unbindListeners() {
  document.removeEventListener('pointerdown', onPointerDown, true);
  document.removeEventListener('keydown', onKeydown, true);
  window.removeEventListener('resize', onWindowChange);
  window.removeEventListener('scroll', onWindowChange, true);
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      ready.value = false;
      bindListeners();
      await nextTick();
      updatePosition();
    } else {
      unbindListeners();
      ready.value = false;
    }
  }
);

onBeforeUnmount(unbindListeners);

defineExpose({ updatePosition });
</script>

<style scoped>
.sq-popover {
  position: fixed;
  /* Above PrimeVue's overlays (dialogs sit around z-index 1100) so a popover opened from inside a
     dialog is still visible. */
  z-index: 1200;
  background-color: rgb(var(--color-raised));
  border: 1px solid rgb(var(--color-dark-700));
  border-radius: 6px;
  box-shadow: var(--shadow-raised, 0 1px 2px rgba(16, 24, 40, 0.06), 0 4px 12px rgba(16, 24, 40, 0.08));
  opacity: 0;
}

.sq-popover.is-ready {
  opacity: 1;
}
</style>
