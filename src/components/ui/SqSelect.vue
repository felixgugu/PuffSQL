<template>
  <div class="sq-select" :class="[`sq-select--${size}`, { 'is-open': isOpen, 'is-disabled': disabled }]">
    <button
      ref="triggerRef"
      type="button"
      class="sq-select__trigger"
      role="combobox"
      :aria-expanded="isOpen"
      :aria-label="ariaLabel"
      :disabled="disabled"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span class="sq-select__value">
        <slot name="value" :value="modelValue" :option="selectedOption">
          {{ selectedLabel ?? placeholder }}
        </slot>
      </span>
      <ChevronDown class="sq-select__caret w-3.5 h-3.5" />
    </button>

    <SqPopover
      v-model="isOpen"
      :anchor="triggerRef"
      :min-width="listMinWidth"
      role="listbox"
      :aria-label="ariaLabel"
    >
      <div ref="listRef" class="sq-select__list" @keydown="onListKeydown">
        <div v-if="options.length === 0" class="sq-select__empty">{{ emptyLabel }}</div>
        <button
          v-for="(option, index) in options"
          :key="index"
          type="button"
          class="sq-select__option"
          :class="{ 'is-selected': isSelected(option) }"
          role="option"
          :aria-selected="isSelected(option)"
          :data-select-index="index"
          @click="select(option)"
        >
          <slot name="option" :option="option" :label="labelOf(option)">
            <span class="truncate">{{ labelOf(option) }}</span>
          </slot>
          <Check v-if="isSelected(option)" class="w-3.5 h-3.5 flex-shrink-0 text-accent" />
        </button>
      </div>
      <!-- Footer actions (e.g. "new connection") live outside the listbox so they are not options. -->
      <div v-if="$slots.footer" class="sq-select__footer" @click.stop>
        <slot name="footer" />
      </div>
    </SqPopover>
  </div>
</template>

<script setup lang="ts" generic="T">
import { computed, nextTick, ref, watch } from 'vue';
import { Check, ChevronDown } from '@/components/icons';
import SqPopover from '@/components/ui/SqPopover.vue';

/**
 * Minimal select (replaces PrimeVue Select).
 *
 * A combobox trigger plus a listbox in SqPopover, so it inherits the tested placement and
 * dismissal behaviour. Keyboard contract: Enter/Space/ArrowDown open, ArrowUp/Down move the
 * active option, Home/End jump, Enter commits, Escape closes, and typing letters jumps to the
 * first option with that prefix (type-ahead), like a native select.
 */
const props = withDefaults(
  defineProps<{
    modelValue?: unknown;
    options: readonly T[];
    /** Property name (or getter) used for the option label. */
    optionLabel?: string | ((option: T) => string);
    /** Property name (or getter) used for the option value. */
    optionValue?: string | ((option: T) => unknown);
    placeholder?: string;
    emptyLabel?: string;
    size?: 'sm' | 'md';
    disabled?: boolean;
    ariaLabel?: string;
  }>(),
  {
    placeholder: '請選擇…',
    emptyLabel: '沒有可選項目',
    size: 'md',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: unknown): void;
}>();

defineSlots<{
  /** Trigger content; falls back to the selected option's label. */
  value?: (props: { value: unknown; option: T | undefined }) => unknown;
  /** Option row content. */
  option?: (props: { option: T; label: string }) => unknown;
  /** Rendered under the list; not part of the listbox. */
  footer?: () => unknown;
}>();

const triggerRef = ref<HTMLElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const activeIndex = ref(-1);
let typeAheadBuffer = '';
let typeAheadTimer: ReturnType<typeof setTimeout> | null = null;

function valueOf(option: T): unknown {
  if (typeof props.optionValue === 'function') return props.optionValue(option);
  if (typeof props.optionValue === 'string' && option && typeof option === 'object') {
    return (option as Record<string, unknown>)[props.optionValue];
  }
  return option;
}

function labelOf(option: T): string {
  if (typeof props.optionLabel === 'function') return props.optionLabel(option);
  if (typeof props.optionLabel === 'string' && option && typeof option === 'object') {
    return String((option as Record<string, unknown>)[props.optionLabel] ?? '');
  }
  return String(option ?? '');
}

const selectedOption = computed(() =>
  props.options.find((option) => valueOf(option) === props.modelValue)
);
const selectedLabel = computed(() =>
  selectedOption.value === undefined ? undefined : labelOf(selectedOption.value)
);
/** The list matches the trigger width so long names do not wrap into a ragged column. */
const listMinWidth = ref('12rem');

function isSelected(option: T): boolean {
  return valueOf(option) === props.modelValue;
}

function open() {
  if (props.disabled) return;
  isOpen.value = true;
  activeIndex.value = props.options.findIndex((option) => isSelected(option));
}

function toggle() {
  if (isOpen.value) isOpen.value = false;
  else open();
}

function select(option: T) {
  emit('update:modelValue', valueOf(option));
  isOpen.value = false;
  triggerRef.value?.focus();
}

function focusOption(index: number) {
  const nodes = listRef.value?.querySelectorAll<HTMLButtonElement>('button[role="option"]');
  nodes?.[index]?.focus();
}

function moveActive(offset: 1 | -1 | 'first' | 'last') {
  const count = props.options.length;
  if (count === 0) return;
  const current = activeIndex.value;
  let next: number;
  if (offset === 'first') next = 0;
  else if (offset === 'last') next = count - 1;
  else if (current < 0) next = offset === 1 ? 0 : count - 1;
  else next = (current + offset + count) % count;

  activeIndex.value = next;
  focusOption(next);
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (props.disabled) return;
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
    event.preventDefault();
    open();
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    open();
    return;
  }
  handleTypeAhead(event);
}

function onListKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      moveActive(1);
      return;
    case 'ArrowUp':
      event.preventDefault();
      moveActive(-1);
      return;
    case 'Home':
      event.preventDefault();
      moveActive('first');
      return;
    case 'End':
      event.preventDefault();
      moveActive('last');
      return;
    case 'Enter':
    case ' ': {
      event.preventDefault();
      const option = props.options[activeIndex.value];
      if (option !== undefined) select(option);
      return;
    }
    default:
      handleTypeAhead(event);
  }
}

/** Single-character navigation: successive letters accumulate into a prefix for ~800ms. */
function handleTypeAhead(event: KeyboardEvent) {
  if (event.key.length !== 1 || !/[a-zA-Z0-9]/.test(event.key)) return;
  typeAheadBuffer += event.key.toLowerCase();
  if (typeAheadTimer) clearTimeout(typeAheadTimer);
  typeAheadTimer = setTimeout(() => {
    typeAheadBuffer = '';
  }, 800);

  const match = props.options.findIndex((option) =>
    labelOf(option).toLowerCase().startsWith(typeAheadBuffer)
  );
  if (match === -1) return;

  activeIndex.value = match;
  if (isOpen.value) focusOption(match);
  else {
    const option = props.options[match];
    if (option !== undefined) select(option);
  }
}

watch(isOpen, async (open) => {
  if (!open) {
    activeIndex.value = -1;
    typeAheadBuffer = '';
    return;
  }
  listMinWidth.value = `${triggerRef.value?.offsetWidth ?? 192}px`;
  await nextTick();
  focusOption(activeIndex.value >= 0 ? activeIndex.value : 0);
});
</script>

<style scoped>
.sq-select {
  position: relative;
  display: inline-flex;
  flex: 1 1 auto;
  min-width: 0;
}

.sq-select__trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 0 8px;
  background-color: rgb(var(--color-dark-900));
  border: 1px solid rgb(var(--color-dark-700));
  border-radius: 4px;
  color: rgb(var(--color-dark-100));
  font-family: var(--app-font-sans);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 120ms ease-out;
}

.sq-select--sm .sq-select__trigger { height: 24px; }
.sq-select--md .sq-select__trigger { height: 28px; }

.sq-select__trigger:hover:not(:disabled) {
  border-color: rgb(var(--color-dark-600));
}

.sq-select__trigger:focus-visible,
.sq-select.is-open .sq-select__trigger {
  border-color: rgb(var(--color-accent));
  outline: 2px solid rgb(var(--color-accent));
  outline-offset: 1px;
}

.sq-select.is-disabled .sq-select__trigger {
  opacity: 0.5;
  cursor: not-allowed;
}

.sq-select__value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.sq-select__caret {
  flex-shrink: 0;
  color: rgb(var(--color-dark-500));
}

.sq-select__list {
  max-height: 18rem;
  overflow-y: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sq-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  /*
   * 26px is the *minimum*: a plain single-line option stays exactly as tall as before, while a
   * call-site slot that renders two lines (the connection picker shows the server under the name)
   * grows instead of overflowing into its neighbours.
   */
  min-height: 26px;
  padding: 3px 8px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: rgb(var(--color-dark-200));
  font-family: var(--app-font-sans);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.sq-select__option:hover,
.sq-select__option:focus-visible {
  background-color: rgb(var(--color-dark-750));
  color: rgb(var(--color-dark-100));
  outline: none;
}

.sq-select__option.is-selected {
  color: rgb(var(--color-accent));
}

.sq-select__empty {
  padding: 8px;
  color: rgb(var(--color-dark-500));
  font-size: 12px;
  font-style: italic;
}

.sq-select__footer {
  padding: 4px;
  border-top: 1px solid rgb(var(--color-dark-700));
}
</style>
