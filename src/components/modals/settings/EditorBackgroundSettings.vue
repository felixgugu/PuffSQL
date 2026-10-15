<template>
  <div class="space-y-3 pt-3 border-t border-dark-800">
    <!-- Enable switch -->
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <label class="font-medium text-dark-100 block">
          {{ $t('settingsModal.editorBackgroundImage') }}
        </label>
        <span class="text-xxs text-dark-400">{{ $t('settingsModal.editorBackgroundImageDesc') }}</span>
      </div>
      <SqSwitch
        :model-value="settingsStore.editorBackgroundImageEnabled"
        :disabled="!hasImage"
        :aria-label="$t('settingsModal.editorBackgroundImage')"
        @update:model-value="settingsStore.setEditorBackgroundImageEnabled($event)"
      />
    </div>

    <!-- Preview + picker -->
    <div class="flex items-start space-x-3">
      <div
        class="sqlight-checkerboard w-24 h-16 rounded border border-dark-700 flex items-center justify-center overflow-hidden shrink-0"
      >
        <img
          v-if="hasImage"
          :src="settingsStore.editorBackgroundImage"
          alt=""
          class="max-w-full max-h-full object-contain"
          draggable="false"
        />
        <span v-else class="text-xxs text-dark-500 px-2 text-center leading-tight">
          {{ $t('settingsModal.editorBackgroundImageEmpty') }}
        </span>
      </div>

      <div class="flex-1 min-w-0 space-y-1.5">
        <div class="flex items-center flex-wrap gap-2">
          <SqButton
            :label="hasImage ? $t('settingsModal.editorBackgroundImageReplace') : $t('settingsModal.editorBackgroundImageChoose')"
            variant="outline"
            :loading="isProcessing"
            @click="openPicker"
          >
            <template #icon><Image class="w-3.5 h-3.5" /></template>
          </SqButton>
          <SqButton
            v-if="hasImage"
            :label="$t('settingsModal.editorBackgroundImageRemove')"
            tone="danger"
            @click="clearImage"
          >
            <template #icon><Trash2 class="w-3.5 h-3.5" /></template>
          </SqButton>
        </div>
        <span class="text-xxs text-dark-500 block leading-relaxed">{{ statusText }}</span>
      </div>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      class="hidden"
      :accept="acceptedTypes"
      @change="handleFileChange"
    />

    <!-- Opacity -->
    <div v-if="hasImage" class="space-y-1">
      <div class="flex items-center justify-between">
        <label class="text-xs text-dark-200">{{ $t('settingsModal.editorBackgroundImageOpacity') }}</label>
        <span class="text-xxs text-dark-400 font-mono">{{ opacityPercent }}%</span>
      </div>
      <input
        type="range"
        min="5"
        max="100"
        step="5"
        :value="opacityPercent"
        class="w-full h-1.5 rounded appearance-none bg-dark-700 accent-primary cursor-pointer"
        :aria-label="$t('settingsModal.editorBackgroundImageOpacity')"
        @input="handleOpacityInput"
      />
    </div>

    <!-- Size -->
    <div v-if="hasImage" class="space-y-1">
      <div class="flex items-center justify-between">
        <label class="text-xs text-dark-200">{{ $t('settingsModal.editorBackgroundImageSize') }}</label>
        <span class="text-xxs text-dark-400 font-mono">{{ sizePercent }}%</span>
      </div>
      <input
        type="range"
        min="10"
        max="100"
        step="5"
        :value="sizePercent"
        class="w-full h-1.5 rounded appearance-none bg-dark-700 accent-primary cursor-pointer"
        :aria-label="$t('settingsModal.editorBackgroundImageSize')"
        @input="handleSizeInput"
      />
      <span class="text-xxs text-dark-500 block leading-relaxed">
        {{ $t('settingsModal.editorBackgroundImageHint') }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import SqButton from '@/components/ui/SqButton.vue';
import { Image, Trash2 } from '@/components/icons';
import SqSwitch from '@/components/ui/SqSwitch.vue';
import { useSettingsStore } from '@/stores/settingsStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  EDITOR_BACKGROUND_ACCEPTED_TYPES,
  EditorBackgroundError,
  prepareEditorBackgroundImage,
} from '@/services/editorBackgroundService';

const { t } = useI18n();
const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();

const fileInputRef = ref<HTMLInputElement | null>(null);
const isProcessing = ref(false);

const acceptedTypes = EDITOR_BACKGROUND_ACCEPTED_TYPES.join(',');
const hasImage = computed(() => Boolean(settingsStore.editorBackgroundImage));
const opacityPercent = computed(() => Math.round(settingsStore.editorBackgroundImageOpacity * 100));
const sizePercent = computed(() => Math.round(settingsStore.editorBackgroundImageSize));

const statusText = computed(() => {
  if (isProcessing.value) return t('settingsModal.editorBackgroundImageProcessing');
  if (!hasImage.value) return t('settingsModal.editorBackgroundImageHint');
  if (!settingsStore.editorBackgroundImageEnabled) {
    return t('settingsModal.editorBackgroundImageDisabled');
  }
  return t('settingsModal.editorBackgroundImageReady');
});

function openPicker() {
  if (isProcessing.value) return;
  fileInputRef.value?.click();
}

function clearImage() {
  settingsStore.setEditorBackgroundImage('');
  workspaceStore.showToast(t('settingsModal.editorBackgroundImageRemoved'), 'info', 2200);
}

function handleOpacityInput(event: Event) {
  settingsStore.setEditorBackgroundImageOpacity(
    Number((event.target as HTMLInputElement).value) / 100
  );
}

function handleSizeInput(event: Event) {
  settingsStore.setEditorBackgroundImageSize(Number((event.target as HTMLInputElement).value));
}

function errorMessageKey(error: unknown): string {
  const code = error instanceof EditorBackgroundError ? error.code : 'decode_failed';
  if (code === 'unsupported_type') return 'settingsModal.editorBackgroundImageUnsupportedType';
  if (code === 'too_large') return 'settingsModal.editorBackgroundImageTooLarge';
  return 'settingsModal.editorBackgroundImageDecodeFailed';
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Reset first so picking the same file twice still fires a change event.
  input.value = '';
  if (!file) return;

  isProcessing.value = true;
  try {
    const prepared = await prepareEditorBackgroundImage(file);
    settingsStore.setEditorBackgroundImage(prepared.dataUrl);
    // The settings watcher persists asynchronously, so verify the write here: a full storage quota
    // must be reported instead of silently keeping a backdrop that vanishes on restart.
    if (!settingsStore.saveSettings()) {
      workspaceStore.showToast(
        t('settingsModal.editorBackgroundImageNotPersisted'),
        'warning',
        4200
      );
      return;
    }
    workspaceStore.showToast(
      t('settingsModal.editorBackgroundImageApplied', {
        width: prepared.width,
        height: prepared.height,
        size: formatKilobytes(prepared.bytes),
      }),
      'success',
      2800
    );
  } catch (error) {
    console.warn('[editor-background] Failed to prepare image:', error);
    workspaceStore.showToast(t(errorMessageKey(error)), 'error', 3600);
  } finally {
    isProcessing.value = false;
  }
}

function formatKilobytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}
</script>

<style scoped>
/* Transparent PNGs need a checkerboard backdrop, otherwise the preview looks empty. */
.sqlight-checkerboard {
  background-color: #ffffff;
  background-image:
    linear-gradient(45deg, rgba(0, 0, 0, 0.12) 25%, transparent 25%, transparent 75%, rgba(0, 0, 0, 0.12) 75%),
    linear-gradient(45deg, rgba(0, 0, 0, 0.12) 25%, transparent 25%, transparent 75%, rgba(0, 0, 0, 0.12) 75%);
  background-size: 12px 12px;
  background-position: 0 0, 6px 6px;
}
</style>
