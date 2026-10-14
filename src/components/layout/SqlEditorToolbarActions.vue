<template>
  <div class="flex items-center space-x-1">
    <SqButton
      v-for="item in actions"
      :key="item.action"
      :disabled="disabled"
      :class="item.class"
      :aria-label="item.label"
      v-tooltip.bottom="item.tooltip"
      @click="emit('action', item.action)"
    >
      <template #icon>
        <component :is="item.icon" class="w-3.5 h-3.5" />
      </template>
    </SqButton>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import SqButton from '@/components/ui/SqButton.vue';
import {
  ClipboardPaste,
  Copy,
  FoldVertical,
  Scissors,
  UnfoldVertical,
} from 'lucide-vue-next';
import type { SqlEditorToolbarAction } from '@/types/editor';

const { t } = useI18n();

defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'action', action: SqlEditorToolbarAction): void;
}>();

interface SqlEditorToolbarItem {
  action: SqlEditorToolbarAction;
  label: string;
  tooltip: string;
  icon: Component;
  class?: string;
}

const actions = computed<SqlEditorToolbarItem[]>(() => [
  {
    action: 'cut',
    label: t('common.cut'),
    tooltip: t('editor.cutTooltip'),
    icon: Scissors,
    class: 'hidden min-[1440px]:inline-flex toolbar-action-clipboard',
  },
  {
    action: 'copy',
    label: t('common.copy'),
    tooltip: t('editor.copyTooltip'),
    icon: Copy,
    class: 'hidden min-[1440px]:inline-flex toolbar-action-clipboard',
  },
  {
    action: 'paste',
    label: t('common.paste'),
    tooltip: t('editor.pasteTooltip'),
    icon: ClipboardPaste,
    class: 'hidden min-[1440px]:inline-flex toolbar-action-clipboard',
  },
  {
    action: 'unfoldAll',
    label: t('common.expand'),
    tooltip: t('editor.unfoldAllTooltip'),
    icon: UnfoldVertical,
  },
  {
    action: 'foldAll',
    label: t('common.collapse'),
    tooltip: t('editor.foldAllTooltip'),
    icon: FoldVertical,
  },
]);
</script>

<style scoped>
/* 當視窗處於最小寬度區間 (<= 1440px) 時，隱藏剪下、複製、貼上按鈕 */
@media (max-width: 1440px) {
  :deep(.toolbar-action-clipboard),
  .toolbar-action-clipboard {
    display: none !important;
  }
}
</style>
