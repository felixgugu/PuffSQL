<template>
  <textarea
    ref="textareaRef"
    class="sq-textarea"
    :class="{ 'is-invalid': invalid }"
    :value="modelValue"
    :rows="rows"
    :placeholder="placeholder"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    :aria-label="ariaLabel"
    v-bind="$attrs"
    @input="onInput"
  />
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';

/**
 * Minimal textarea (replaces PrimeVue Textarea): same control contract as SqInput, plus an
 * optional auto-resize so chat-style inputs grow with their content instead of showing scrollbars.
 */
const props = withDefaults(
  defineProps<{
    modelValue?: string;
    rows?: number | string;
    placeholder?: string;
    disabled?: boolean;
    invalid?: boolean;
    autoResize?: boolean;
    ariaLabel?: string;
  }>(),
  { modelValue: '', rows: 3 }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

function resize(): void {
  const el = textareaRef.value;
  if (!el || !props.autoResize) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
  resize();
}

watch(
  () => props.modelValue,
  () => {
    if (!props.autoResize) return;
    void nextTick(resize);
  }
);

defineExpose({
  focus: () => textareaRef.value?.focus(),
});
</script>

<style scoped>
.sq-textarea {
  display: block;
  width: 100%;
  padding: 6px 8px;
  background-color: rgb(var(--color-dark-900));
  border: 1px solid rgb(var(--color-dark-700));
  border-radius: 4px;
  color: rgb(var(--color-dark-100));
  font-family: var(--app-font-sans);
  font-size: 12px;
  line-height: 1.5;
  resize: none;
  transition: border-color 120ms ease-out;
}

.sq-textarea:hover:not(:disabled) {
  border-color: rgb(var(--color-dark-600));
}

.sq-textarea:focus {
  border-color: rgb(var(--color-accent));
  outline: 2px solid rgb(var(--color-accent));
  outline-offset: 1px;
}

.sq-textarea.is-invalid {
  border-color: rgb(var(--color-danger));
}

.sq-textarea:disabled {
  opacity: 0.5;
}

.sq-textarea::placeholder {
  color: rgb(var(--color-dark-500));
}
</style>
