<template>
  <SqPopover
    :model-value="modelValue"
    :anchor="resolvedAnchor"
    :align="align"
    :min-width="minWidth"
    role="menu"
    :aria-label="ariaLabel"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div
      ref="listRef"
      class="sq-menu"
      @keydown="onKeydown"
    >
      <template v-for="(item, index) in items" :key="index">
        <div v-if="item.separator" class="sq-menu__separator" role="separator" />
        <button
          v-else
          type="button"
          class="sq-menu__item"
          :class="{ 'is-danger': item.danger, 'is-disabled': item.disabled }"
          role="menuitem"
          :disabled="item.disabled"
          :data-menu-index="index"
          @click="select(item)"
        >
          <component :is="item.icon" v-if="item.icon" class="w-3.5 h-3.5 flex-shrink-0" />
          <span class="truncate">{{ item.label }}</span>
        </button>
      </template>
    </div>
  </SqPopover>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, type Component } from 'vue';
import SqPopover from '@/components/ui/SqPopover.vue';
import type { RectLike } from '@/utils/popoverPlacement';

export interface SqMenuItem {
  label?: string;
  /** A PuffSQL icon component. Menu models are data, so the icon travels as a component reference. */
  icon?: Component;
  separator?: boolean;
  disabled?: boolean;
  /** Renders in the danger tone: destructive commands must not look like the default action. */
  danger?: boolean;
  command?: () => void;
}

/**
 * Minimal menu (replaces PrimeVue Menu). Keyboard contract: ArrowDown/ArrowUp move through the
 * items, Home/End jump to the ends, Enter/Space activate the focused item, Escape closes (through
 * SqPopover). Focus moves into the menu when it opens, like a native popup menu.
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    items: SqMenuItem[];
    anchor?: HTMLElement | null;
    /** Pointer rectangle: used by context menus that open at the cursor. */
    anchorRect?: RectLike | null;
    align?: 'start' | 'end';
    minWidth?: string;
    ariaLabel?: string;
  }>(),
  { align: 'start', minWidth: '14rem' }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const listRef = ref<HTMLElement | null>(null);

const resolvedAnchor = computed(() => {
  if (props.anchor) return props.anchor;
  const rect = props.anchorRect;
  if (!rect) return null;
  return { getBoundingClientRect: () => rect };
});

function enabledItems(): HTMLButtonElement[] {
  const nodes = listRef.value?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]');
  return nodes ? [...nodes].filter((node) => !node.disabled) : [];
}

function focusItem(offset: 1 | -1 | 'first' | 'last') {
  const items = enabledItems();
  if (items.length === 0) return;
  const currentIndex = items.findIndex((node) => node === document.activeElement);

  let nextIndex: number;
  if (offset === 'first') nextIndex = 0;
  else if (offset === 'last') nextIndex = items.length - 1;
  else if (currentIndex === -1) nextIndex = offset === 1 ? 0 : items.length - 1;
  else nextIndex = (currentIndex + offset + items.length) % items.length;

  items[nextIndex]?.focus();
}

function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      focusItem(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      focusItem(-1);
      break;
    case 'Home':
      event.preventDefault();
      focusItem('first');
      break;
    case 'End':
      event.preventDefault();
      focusItem('last');
      break;
    default:
      break;
  }
}

function select(item: SqMenuItem) {
  if (item.disabled || item.separator) return;
  emit('update:modelValue', false);
  item.command?.();
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    await nextTick();
    focusItem('first');
  }
);
</script>

<style scoped>
.sq-menu {
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-family: var(--app-font-sans);
  font-size: 12px;
}

.sq-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: rgb(var(--color-dark-200));
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.sq-menu__item:hover:not(:disabled),
.sq-menu__item:focus-visible {
  background-color: rgb(var(--color-dark-750));
  color: rgb(var(--color-dark-100));
  outline: none;
}

.sq-menu__item.is-danger {
  color: rgb(var(--color-danger));
}

.sq-menu__item.is-danger:hover:not(:disabled),
.sq-menu__item.is-danger:focus-visible {
  background-color: rgb(var(--color-danger) / 0.1);
}

.sq-menu__item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.sq-menu__separator {
  height: 1px;
  margin: 4px 0;
  background-color: rgb(var(--color-dark-750));
}
</style>
