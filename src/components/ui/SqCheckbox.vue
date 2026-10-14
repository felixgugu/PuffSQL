<template>
  <label class="sq-check" :class="{ 'is-disabled': disabled }">
    <input
      class="sq-check__input"
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel"
      v-bind="$attrs"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span v-if="$slots.default" class="sq-check__label"><slot /></span>
  </label>
</template>

<script setup lang="ts">
/**
 * Minimal checkbox (replaces PrimeVue Checkbox).
 *
 * Stays a real `<input type="checkbox">`: keyboard behaviour, screen-reader semantics, form
 * participation and `indeterminate` all come for free. Only the size and the accent fill are
 * ours — `accent-color` paints the checked state with the single action colour.
 */
withDefaults(
  defineProps<{
    modelValue?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
  }>(),
  { modelValue: false }
);

defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();
</script>

<style scoped>
.sq-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-family: var(--app-font-sans);
  font-size: 12px;
  color: rgb(var(--color-dark-300));
}

.sq-check__input {
  width: 14px;
  height: 14px;
  margin: 0;
  flex-shrink: 0;
  accent-color: rgb(var(--color-accent));
  cursor: pointer;
}

.sq-check__input:focus-visible {
  outline: 2px solid rgb(var(--color-accent));
  outline-offset: 2px;
}

.sq-check.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sq-check__label {
  user-select: none;
}
</style>
