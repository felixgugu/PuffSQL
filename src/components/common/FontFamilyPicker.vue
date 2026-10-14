<template>
  <div class="space-y-1.5">
    <SqSelect
      :model-value="selectedValue"
      :options="selectOptions"
      option-label="label"
      option-value="value"
      :class="selectClass"
      @update:model-value="handleSelect"
    />
    <SqInput
      v-if="showCustom"
      ref="inputRef"
      :model-value="customText"
      :placeholder="inputPlaceholder"
      class="w-full font-mono"
      @update:model-value="handleInput"
      @blur="handleBlur"
    />
    <div
      v-if="preview"
      class="rounded border border-dark-750 bg-dark-900/70 px-2.5 py-1.5 text-xs text-dark-200 truncate"
      :class="previewClass"
      :style="{ fontFamily: currentFont }"
    >
      {{ previewText }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import SqSelect from '@/components/ui/SqSelect.vue';
import SqInput from '@/components/ui/SqInput.vue';
import {
  CUSTOM_FONT_VALUE,
  isPresetFontFamily,
  normalizeFontFamily,
} from '@/utils/fontFamily';

const props = withDefaults(
  defineProps<{
    /** Current font-family string. */
    modelValue: string;
    /** Preset choices shown in the dropdown. */
    options: ReadonlyArray<{ label: string; value: string }>;
    /** Fallback applied when the custom input is cleared. */
    defaultValue?: string;
    /** Render a small live preview strip below the input. */
    preview?: boolean;
    /** Text shown inside the preview strip. */
    previewText?: string;
    /** Extra classes applied to the dropdown. */
    selectClass?: string;
    /** Extra classes applied to the preview strip. */
    previewClass?: string;
    /** Placeholder for the custom font input. */
    inputPlaceholder?: string;
  }>(),
  {
    defaultValue: '',
    preview: false,
    previewText: 'PuffSQL 資料庫工具 · 查詢結果 · ABC 123',
    selectClass: 'w-full !text-xs !bg-dark-900 !border-dark-700 font-mono',
    previewClass: 'font-mono',
    inputPlaceholder: '輸入字型名稱，例如 "Noto Sans TC", sans-serif',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

/** Sentinel option that reveals the free-form input. */
const customOption = { label: '自訂 (Custom)…', value: CUSTOM_FONT_VALUE };

const selectOptions = computed(() => [...props.options, customOption]);

const fallback = computed(() => props.defaultValue || props.options[0]?.value || '');

/** True while the free-form input is shown, even before the value changes. */
const showCustom = ref(!isPresetFontFamily(props.modelValue, props.options));

/** Local editable text so trailing spaces are not stripped while typing. */
const customText = ref(props.modelValue ?? '');

const inputRef = ref<{ focus?: () => void } | null>(null);

const currentFont = computed(() =>
  normalizeFontFamily(props.modelValue, fallback.value)
);

const selectedValue = computed(() =>
  showCustom.value ? CUSTOM_FONT_VALUE : currentFont.value
);

watch(
  () => props.modelValue,
  (value) => {
    // A preset value always collapses back to preset mode (e.g. reset to defaults).
    if (isPresetFontFamily(value, props.options)) {
      showCustom.value = false;
      customText.value = value;
      return;
    }
    // An externally applied custom value syncs only when not already editing.
    if (!showCustom.value) {
      showCustom.value = true;
      customText.value = value;
    }
  }
);

function handleSelect(value: unknown): void {
  if (value === CUSTOM_FONT_VALUE) {
    // Reveal the input, seeding it with the current font for easy editing.
    showCustom.value = true;
    customText.value = currentFont.value;
    void nextTick(() => inputRef.value?.focus?.());
  } else if (typeof value === 'string') {
    showCustom.value = false;
    customText.value = value;
    emit('update:modelValue', value);
  }
}

function handleInput(value: unknown): void {
  const raw = typeof value === 'string' ? value : '';
  customText.value = raw;
  // Keep the stored value valid while allowing blank text mid-edit.
  if (raw.trim()) {
    emit('update:modelValue', raw.trim());
  }
}

function handleBlur(): void {
  const next = normalizeFontFamily(customText.value, fallback.value);
  customText.value = next;
  emit('update:modelValue', next);
}
</script>
