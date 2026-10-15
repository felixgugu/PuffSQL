<template>
  <SqDialog
    :visible="isOpen"
    dismissable-mask
    :class="dialogWindow.marker"
    class="w-full max-w-md"
    @show="dialogWindow.onShow"
    @hide="dialogWindow.onHide"
    @update:visible="val => !val && $emit('cancel')"
  >
    <template #header>
      <div class="flex items-center space-x-2">
        <TriangleAlert v-if="isDanger" class="w-3.5 h-3.5 text-danger" />
        <Info v-else class="w-3.5 h-3.5 text-accent" />
        <span>{{ title }}</span>
      </div>
    </template>

    <div class="text-xs text-dark-200 leading-relaxed py-1">
      <p class="whitespace-pre-wrap">{{ message }}</p>
    </div>

    <template #footer>
      <div class="flex items-center justify-end space-x-2 pt-2">
        <SqButton
          :label="cancelText || 'Cancel'"
          @click="$emit('cancel')"
        />
        <SqButton
          :label="confirmText || 'Confirm'"
          :tone="isDanger ? 'danger' : 'accent'"
          variant="solid"
          @click="$emit('confirm')"
        />
      </div>
    </template>
  </SqDialog>
</template>

<script setup lang="ts">
import { Info, TriangleAlert } from '@/components/icons';
import SqDialog from '@/components/ui/SqDialog.vue';
import SqButton from '@/components/ui/SqButton.vue';
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
