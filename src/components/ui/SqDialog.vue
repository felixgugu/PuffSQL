<template>
  <Teleport to="body">
    <!-- `appear` matters: a dialog that mounts already visible (a store-driven one, or a harness)
         would otherwise never fire `show`, and would come up without its drag and resize zones. -->
    <Transition name="sq-dialog" appear @after-enter="onAfterEnter" @after-leave="onAfterLeave">
      <div
        v-if="visible"
        ref="maskEl"
        class="sq-dialog-mask sq-scrim"
        :style="{ zIndex }"
        @pointerdown="onMaskPointerDown"
        @click="onMaskClick"
      >
        <div
          ref="panelEl"
          class="sq-dialog-surface sq-dialog-panel"
          :class="$attrs.class"
          :style="$attrs.style"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="hasTitle ? titleId : undefined"
          tabindex="-1"
          @keydown="onPanelKeyDown"
        >
          <header v-if="showHeader" class="sq-dialog-header">
            <h2 v-if="hasTitle" :id="titleId" class="sq-dialog-title">
              <slot name="header">{{ header }}</slot>
            </h2>
            <span v-else class="sq-dialog-title" aria-hidden="true" />

            <SqButton
              v-if="closable"
              class="sq-dialog-close"
              size="sm"
              tone="danger"
              :aria-label="$t('common.close')"
              v-tooltip.top="$t('common.close')"
              @click="requestClose()"
            >
              <template #icon><X class="w-3.5 h-3.5" /></template>
            </SqButton>
          </header>

          <div class="sq-dialog-content" :class="contentClass">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="sq-dialog-footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, useSlots, watch } from 'vue';
import { X } from '@/components/icons';
import SqButton from '@/components/ui/SqButton.vue';
import { focusFirstWithin, focusablesWithin, nextTrapIndex } from '@/utils/focusTrap';

/**
 * The app's one dialog frame (replaces PrimeVue Dialog).
 *
 * It owns exactly what the call sites used to get from PrimeVue: a teleported modal with a scrim,
 * a title bar, Escape and mask dismissal, a Tab loop, and `show`/`hide` events fired after the
 * enter / leave transition so `useDialogWindow` can attach its drag and resize handles to a
 * settled element. The frame itself (1px border, 6px radius, `--shadow-overlay`) comes from
 * `.sq-dialog-surface` in main.css, shared with the hand-rolled tool windows.
 *
 * `closable` only controls the title-bar button. `closeOnEscape` and `dismissableMask` are
 * separate so a dialog that is busy can refuse both while still showing the button — the shape
 * `ExportSchemaModal` needs while it is running.
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    visible: boolean;
    /** Title text. A `#header` slot takes precedence when both are given. */
    header?: string;
    /** Show the title-bar close button. */
    closable?: boolean;
    /** Escape dismisses the dialog (an inner handler may still claim the key first). */
    closeOnEscape?: boolean;
    /** Clicking the scrim dismisses the dialog. */
    dismissableMask?: boolean;
    /** Render the title bar at all; three dialogs draw their own. */
    showHeader?: boolean;
    /** Extra classes for the scrolling body, e.g. `!p-0` for a dialog with its own layout. */
    contentClass?: string;
  }>(),
  {
    closable: true,
    closeOnEscape: true,
    dismissableMask: false,
    showHeader: true,
  }
);

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'show'): void;
  (e: 'hide'): void;
}>();

const slots = useSlots();
const maskEl = ref<HTMLElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const titleId = `sq-dialog-title-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
const hasTitle = computed(() => props.showHeader && Boolean(slots.header || props.header));

/**
 * Stacked dialogs need distinct z-indexes (the template library opens its "add template" dialog
 * on top of itself). The base sits below `.sq-popover` and far below tooltips and toasts, which
 * is the ordering PrimeVue's overlay stack produced before.
 */
const Z_BASE = 1100;
const openDialogs: number[] = [];
const zIndex = ref(Z_BASE);
let restoreFocusTo: HTMLElement | null = null;

function releaseZIndex() {
  const at = openDialogs.indexOf(zIndex.value);
  if (at !== -1) openDialogs.splice(at, 1);
}

watch(
  () => props.visible,
  (open) => {
    if (open) {
      zIndex.value = Z_BASE + openDialogs.length;
      openDialogs.push(zIndex.value);
      restoreFocusTo = (document.activeElement as HTMLElement | null) ?? null;
      return;
    }
    releaseZIndex();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (props.visible) releaseZIndex();
});

function requestClose() {
  emit('update:visible', false);
}

function onAfterEnter() {
  const panel = panelEl.value;
  if (panel) focusFirstWithin(panel);
  emit('show');
}

function onAfterLeave() {
  const target = restoreFocusTo;
  restoreFocusTo = null;
  // The control that opened the dialog can be gone by now (a menu item, a row action).
  if (target && target.isConnected) target.focus({ preventScroll: true });
  emit('hide');
}

function onPanelKeyDown(event: KeyboardEvent) {
  // An input inside the dialog may have claimed the key already (the search fields in the
  // template library and the object finder close the dialog themselves).
  if (event.defaultPrevented) return;

  if (event.key === 'Escape') {
    if (!props.closeOnEscape) return;
    event.preventDefault();
    requestClose();
    return;
  }

  if (event.key !== 'Tab') return;
  const panel = panelEl.value;
  if (!panel) return;

  const stops = focusablesWithin(panel);
  const current = stops.indexOf(document.activeElement as HTMLElement);
  const target = nextTrapIndex(stops.length, current, event.shiftKey);

  event.preventDefault();
  if (target === -1) {
    panel.focus({ preventScroll: true });
    return;
  }
  stops[target]?.focus({ preventScroll: true });
}

/** A press that starts on a control and ends on the scrim is a drag, not a dismissal. */
let pressedOnMask = false;

function onMaskPointerDown(event: PointerEvent) {
  pressedOnMask = event.target === maskEl.value;
}

function onMaskClick(event: MouseEvent) {
  const startedOnMask = pressedOnMask;
  pressedOnMask = false;
  if (!props.dismissableMask) return;
  if (event.target !== maskEl.value || !startedOnMask) return;
  requestClose();
}
</script>

<style scoped>
.sq-dialog-mask {
  position: fixed;
  inset: 0;
  display: flex;
  padding: 24px;
  overflow: auto;
}

.sq-dialog-enter-active,
.sq-dialog-leave-active {
  transition: opacity 140ms ease-out;
}

.sq-dialog-enter-from,
.sq-dialog-leave-to {
  opacity: 0;
}

/* `margin: auto` centres the panel and, unlike `align-items: center`, cannot push its top edge
   out of reach when the dialog is taller than the viewport. */
.sq-dialog-panel {
  margin: auto;
  display: flex;
  flex-direction: column;
  background-color: rgb(var(--color-raised));
  color: rgb(var(--color-dark-300));
}

.sq-dialog-header {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px 0 14px;
  background-color: rgb(var(--color-dark-800));
  border-bottom: 1px solid rgb(var(--color-dark-750));
  cursor: move;
  user-select: none;
}

.sq-dialog-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--color-dark-100));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sq-dialog-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px;
}

.sq-dialog-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  background-color: rgb(var(--color-dark-800));
  border-top: 1px solid rgb(var(--color-dark-750));
}
</style>
