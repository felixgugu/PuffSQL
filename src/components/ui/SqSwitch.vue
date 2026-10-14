<template>
  <label class="sq-switch" :class="{ 'is-disabled': disabled }">
    <input
      class="sq-switch__input"
      type="checkbox"
      role="switch"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel"
      v-bind="$attrs"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span v-if="$slots.default" class="sq-switch__label"><slot /></span>
  </label>
</template>

<script setup lang="ts">
/**
 * Minimal switch (replaces PrimeVue ToggleSwitch). 32×18 track, 14px knob, accent fill when on,
 * `role="switch"` on the native input so the state is announced correctly.
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
.sq-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-family: var(--app-font-sans);
  font-size: 12px;
  color: rgb(var(--color-dark-300));
}

.sq-switch__input {
  appearance: none;
  position: relative;
  width: 32px;
  height: 18px;
  margin: 0;
  flex-shrink: 0;
  border-radius: 9999px;
  background-color: rgb(var(--color-dark-600));
  cursor: pointer;
  transition: background-color 120ms ease-out;
}

.sq-switch__input::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  background-color: #ffffff;
  transition: transform 120ms ease-out;
}

.sq-switch__input:checked {
  background-color: rgb(var(--color-accent));
}

.sq-switch__input:checked::before {
  transform: translateX(14px);
}

.sq-switch__input:focus-visible {
  outline: 2px solid rgb(var(--color-accent));
  outline-offset: 2px;
}

.sq-switch.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sq-switch__label {
  user-select: none;
}
</style>
