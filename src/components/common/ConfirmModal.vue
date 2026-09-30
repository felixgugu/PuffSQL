<template>
  <Dialog
    :visible="isOpen"
    modal
    :closable="true"
    :dismissable-mask="true"
    :class="dialogWindow.marker"
    class="w-full max-w-md"
    @show="dialogWindow.onShow"
    @hide="dialogWindow.onHide"
    @update:visible="val => !val && $emit('cancel')"
  >
    <template #header>
      <div class="flex items-center space-x-2">
        <i v-if="isDanger" class="pi pi-exclamation-triangle text-danger text-base" />
        <i v-else class="pi pi-info-circle text-accent text-base" />
        <span class="font-semibold text-sm text-dark-100">{{ title }}</span>
      </div>
    </template>

    <div class="text-xs text-dark-200 leading-relaxed py-1">
      <p class="whitespace-pre-wrap">{{ message }}</p>
    </div>

    <template #footer>
      <div class="flex items-center justify-end space-x-2 pt-2">
        <Button
          :label="cancelText || 'Cancel'"
          severity="secondary"
          size="small"
          text
          @click="$emit('cancel')"
        />
        <Button
          :label="confirmText || 'Confirm'"
          :severity="isDanger ? 'danger' : 'primary'"
          size="small"
          @click="$emit('confirm')"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { useDialogWindow } from '@/composables/useDialogWindow';

const dialogWindow = useDialogWindow();

withDefaults(
  defineProps<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
  }>(),
  {
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    isDanger: false,
  }
);

defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();
</script>
