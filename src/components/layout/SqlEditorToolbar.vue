<template>
  <!--
    Toolbar owned by the SQL editor page. It sits directly above Monaco so the editing and
    execution controls live next to the code they act on, instead of crowding the window title
    bar: 36px tall (SPEC §5 "editor toolbar"), chrome surface, hairline bottom border, no shadow.
  -->
  <div
    class="sql-editor-toolbar h-9 bg-dark-850 border-b border-dark-700 px-2 flex items-center gap-1 select-none flex-shrink-0 overflow-hidden text-xs"
  >
    <!-- Run / Stop (one slot that swaps) -->
    <SqButton
      v-if="!queryStore.isExecuting"
      tone="accent"
      variant="solid"
      class="w-14"
      :aria-label="t('header.runTooltip')"
      v-tooltip.bottom="t('header.runTooltip')"
      @click="emit('run-query', 'current')"
    >
      <template #icon><Play class="w-3.5 h-3.5" /></template>
    </SqButton>
    <SqButton
      v-else
      tone="danger"
      variant="solid"
      class="w-14"
      :loading="queryStore.isCancelling"
      :disabled="queryStore.isCancelling"
      :aria-label="t('header.cancelQueryTooltip')"
      v-tooltip.bottom="queryStore.isCancelling ? t('common.running') : t('header.cancelQueryTooltip')"
      @click="emit('cancel-query')"
    >
      <template #icon><SquareMinus class="w-3.5 h-3.5" /></template>
    </SqButton>

    <!-- Run All Statements -->
    <SqButton
      tone="accent"
      variant="outline"
      class="w-14"
      :disabled="queryStore.isExecuting"
      :aria-label="t('header.runAllTooltip')"
      v-tooltip.bottom="t('header.runAllTooltip')"
      @click="emit('run-query', 'all')"
    >
      <template #icon><SkipForward class="w-3.5 h-3.5" /></template>
    </SqButton>

    <div class="w-px h-4 bg-dark-700 mx-0.5 flex-shrink-0" />

    <!-- Clipboard group: always visible, this row has room for it -->
    <SqButtonGroup class="ml-1" aria-label="剪貼">
      <SqButton
        v-for="item in clipboardActions"
        :key="item.action"
        :aria-label="item.label"
        v-tooltip.bottom="item.tooltip"
        @click="emit('editor-action', item.action)"
      >
        <template #icon>
          <component :is="item.icon" class="w-3.5 h-3.5" />
        </template>
      </SqButton>
    </SqButtonGroup>

    <!-- Folding & formatting group -->
    <SqButtonGroup class="ml-1" aria-label="檢視與格式化">
      <SqButton
        v-for="item in foldingActions"
        :key="item.action"
        :aria-label="item.label"
        v-tooltip.bottom="item.tooltip"
        @click="emit('editor-action', item.action)"
      >
        <template #icon>
          <component :is="item.icon" class="w-3.5 h-3.5" />
        </template>
      </SqButton>

      <!-- Format SQL -->
      <SqButton
        :aria-label="t('header.formatSqlTooltip')"
        v-tooltip.bottom="t('header.formatSqlTooltip')"
        @click="emit('format-sql')"
      >
        <template #icon><AlignLeft class="w-3.5 h-3.5" /></template>
      </SqButton>
    </SqButtonGroup>

    <!-- Flexible gap keeps the analysis options on the right edge -->
    <div class="flex-1" />

    <!-- Execution analysis group: three independent toggles, one strip -->
    <SqButtonGroup aria-label="執行分析選項">
      <!-- Performance Analysis Toggle (SET STATISTICS IO, TIME ON) -->
      <SqButton
        :tone="queryStore.isStatsEnabled ? 'accent' : 'neutral'"
        :active="queryStore.isStatsEnabled"
        aria-label="效能分析 (SET STATISTICS IO, TIME ON)"
        v-tooltip.bottom="'效能分析 (SET STATISTICS IO, TIME ON)'"
        @click="queryStore.toggleStatsEnabled()"
      >
        <template #icon><Gauge class="w-3.5 h-3.5" /></template>
      </SqButton>

      <!-- Estimated Execution Plan Toggle (SET SHOWPLAN_ALL ON) -->
      <SqButton
        :tone="queryStore.isShowplanEnabled ? 'accent' : 'neutral'"
        :active="queryStore.isShowplanEnabled"
        aria-label="預估執行計畫 (SET SHOWPLAN_ALL ON)"
        v-tooltip.bottom="'預估執行計畫 (SET SHOWPLAN_ALL ON)'"
        @click="queryStore.toggleShowplanEnabled()"
      >
        <template #icon><Network class="w-3.5 h-3.5" /></template>
      </SqButton>

      <!-- Actual Execution Plan Toggle (SET STATISTICS XML ON) -->
      <SqButton
        :tone="queryStore.isActualPlanEnabled ? 'accent' : 'neutral'"
        :active="queryStore.isActualPlanEnabled"
        aria-label="實際執行計畫 (SET STATISTICS XML ON)"
        v-tooltip.bottom="'實際執行計畫 (SET STATISTICS XML ON)'"
        @click="queryStore.toggleActualPlanEnabled()"
      >
        <template #icon><Share2 class="w-3.5 h-3.5" /></template>
      </SqButton>
    </SqButtonGroup>

    <!-- Max Rows Limit Selector (visible wording moved into the tooltip) -->
    <div class="flex items-center pl-1 text-dark-400 text-xxs font-mono">
      <SqSelect
        :model-value="queryStore.maxRows ?? 'none'"
        :options="limitOptions"
        option-value="value"
        option-label="label"
        size="md"
        class="min-w-[75px] font-mono"
        :aria-label="t('header.maxRowsTooltip')"
        v-tooltip.bottom="t('header.maxRowsTooltip')"
        @update:model-value="val => onMaxRowsChange(val as string | number)"
      >
        <template #value="slotProps">
          <span class="text-[11px] font-mono leading-none">
            {{ limitOptions.find(o => o.value === slotProps.value)?.label ?? (slotProps.value === 'none' ? 'No Limit' : slotProps.value) }}
          </span>
        </template>
        <template #option="slotProps">
          <span class="text-[11px] font-mono py-0.5">
            {{ slotProps.option.label }}
          </span>
        </template>
      </SqSelect>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import SqButton from '@/components/ui/SqButton.vue';
import SqButtonGroup from '@/components/ui/SqButtonGroup.vue';
import SqSelect from '@/components/ui/SqSelect.vue';
import {
  AlignLeft,
  ClipboardPaste,
  Copy,
  FoldVertical,
  Gauge,
  Network,
  Play,
  Scissors,
  Share2,
  SkipForward,
  SquareMinus,
  UnfoldVertical,
} from '@/components/icons';
import { useQueryStore } from '@/stores/queryStore';
import type { QueryRunMode, SqlEditorToolbarAction } from '@/types/editor';

const { t } = useI18n();
const queryStore = useQueryStore();

const emit = defineEmits<{
  (e: 'run-query', mode: QueryRunMode): void;
  (e: 'cancel-query'): void;
  (e: 'format-sql'): void;
  (e: 'editor-action', action: SqlEditorToolbarAction): void;
}>();

interface SqlEditorToolbarItem {
  action: SqlEditorToolbarAction;
  label: string;
  tooltip: string;
  icon: Component;
}

/** Clipboard group, in the order the row shows it. */
const clipboardActions = computed<SqlEditorToolbarItem[]>(() => [
  {
    action: 'cut',
    label: t('common.cut'),
    tooltip: t('editor.cutTooltip'),
    icon: Scissors,
  },
  {
    action: 'copy',
    label: t('common.copy'),
    tooltip: t('editor.copyTooltip'),
    icon: Copy,
  },
  {
    action: 'paste',
    label: t('common.paste'),
    tooltip: t('editor.pasteTooltip'),
    icon: ClipboardPaste,
  },
]);

/** Folding group; Format SQL follows the two folding actions inside the same strip. */
const foldingActions = computed<SqlEditorToolbarItem[]>(() => [
  {
    action: 'foldAll',
    label: t('common.collapse'),
    tooltip: t('editor.foldAllTooltip'),
    icon: FoldVertical,
  },
  {
    action: 'unfoldAll',
    label: t('common.expand'),
    tooltip: t('editor.unfoldAllTooltip'),
    icon: UnfoldVertical,
  },
]);

const limitOptions = [
  { label: '1,000', value: 1000 },
  { label: '5,000', value: 5000 },
  { label: '10,000', value: 10000 },
  { label: '50,000', value: 50000 },
  { label: 'No Limit', value: 'none' },
];

function onMaxRowsChange(val: string | number) {
  queryStore.maxRows = val === 'none' ? null : Number(val);
}
</script>
