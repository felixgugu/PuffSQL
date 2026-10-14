<template>
  <span
    class="sq-input"
    :class="[`sq-input--${size}`, { 'is-invalid': invalid, 'is-disabled': disabled }]"
  >
    <slot name="prefix" />
    <input
      ref="inputRef"
      class="sq-input__field"
      :value="modelValue"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :aria-invalid="invalid || undefined"
      :aria-label="ariaLabel"
      v-bind="$attrs"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keydown.enter="$emit('enter', ($event.target as HTMLInputElement).value)"
    />
    <slot name="suffix" />
  </span>
</template>

<script setup lang="ts">
import { ref } from 'vue';

/**
 * Minimal text input (replaces PrimeVue InputText).
 *
 * Fixed control heights (24 / 28 / 32px), a 1px hairline border, a 4px radius and a 2px accent
 * outline on focus — i.e. the SPEC's control contract, so call sites stop carrying `!h-7
 * !bg-dark-900 !border-dark-700` overrides. Prefix/suffix slots replace IconField/InputIcon.
 */
withDefaults(
  defineProps<{
    modelValue?: string | number;
    type?: string;
    placeholder?: string;
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    readonly?: boolean;
    invalid?: boolean;
    ariaLabel?: string;
  }>(),
  { modelValue: '', type: 'text', size: 'md' }
);

defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'enter', value: string): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);

defineExpose({
  focus: () => inputRef.value?.focus(),
});
</script>

<style scoped>
.sq-input {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  /* Width stays a call-site decision (`w-full`, `w-40`, …): no scoped `width` rule here, which
     would out-specify Tailwind's utilities and silently ignore those classes. */
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 8px;
  background-color: rgb(var(--color-dark-900));
  border: 1px solid rgb(var(--color-dark-700));
  border-radius: 4px;
  color: rgb(var(--color-dark-100));
  font-family: var(--app-font-sans);
  font-size: 12px;
  transition: border-color 120ms ease-out;
}

.sq-input--sm { height: 24px; }
.sq-input--md { height: 28px; }
.sq-input--lg { height: 32px; }

.sq-input:hover:not(.is-disabled) {
  border-color: rgb(var(--color-dark-600));
}

.sq-input:focus-within {
  border-color: rgb(var(--color-accent));
  outline: 2px solid rgb(var(--color-accent));
  outline-offset: 1px;
}

.sq-input.is-invalid {
  border-color: rgb(var(--color-danger));
}

.sq-input.is-disabled {
  opacity: 0.5;
}

.sq-input__field {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  outline: none;
}

.sq-input__field::placeholder {
  color: rgb(var(--color-dark-500));
}
</style>
