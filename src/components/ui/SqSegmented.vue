<template>
  <div class="sq-seg" :class="`sq-seg--${size}`" role="group" :aria-label="ariaLabel">
    <button
      v-for="option in normalized"
      :key="String(option.value)"
      type="button"
      class="sq-seg__item"
      :class="{ 'is-active': option.value === modelValue }"
      :aria-pressed="option.value === modelValue"
      :disabled="disabled"
      @click="$emit('update:modelValue', option.value)"
    >
      <slot name="option" :option="option">{{ option.label }}</slot>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * Minimal segmented control (replaces PrimeVue SelectButton). One border around the group, the
 * active segment is the only one with a surface; no fills, no pills — see SPEC §7.
 */
export interface SqSegmentOption {
  label: string;
  value: string | number | boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | boolean;
    options: Array<SqSegmentOption | string>;
    size?: 'sm' | 'md';
    disabled?: boolean;
    ariaLabel?: string;
  }>(),
  { size: 'md' }
);

defineEmits<{
  (e: 'update:modelValue', value: string | number | boolean): void;
}>();

const normalized = computed<SqSegmentOption[]>(() =>
  props.options.map((option) =>
    typeof option === 'string' ? { label: option, value: option } : option
  )
);
</script>

<style scoped>
.sq-seg {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid rgb(var(--color-dark-700));
  border-radius: 4px;
  background-color: rgb(var(--color-dark-850));
}

.sq-seg__item {
  height: 22px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: rgb(var(--color-dark-400));
  font-family: var(--app-font-sans);
  font-size: 12px;
  cursor: pointer;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}

.sq-seg--sm .sq-seg__item {
  height: 20px;
  padding: 0 8px;
  font-size: 11px;
}

.sq-seg__item:hover:not(.is-active) {
  background-color: rgb(var(--color-dark-750));
  color: rgb(var(--color-dark-200));
}

.sq-seg__item.is-active {
  background-color: rgb(var(--color-dark-900));
  border-color: rgb(var(--color-dark-700));
  color: rgb(var(--color-dark-100));
  font-weight: 500;
}

.sq-seg__item:focus-visible {
  outline: 2px solid rgb(var(--color-accent));
  outline-offset: 1px;
}

.sq-seg__item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
