<template>
  <div class="w-full h-full flex flex-col overflow-hidden font-mono text-xs">
    <!-- Subheader with Clear Action and Expand/Collapse All -->
    <div class="h-6 bg-dark-850 border-b border-dark-750 flex items-center justify-between px-3 text-xxs text-dark-400 select-none flex-shrink-0">
      <span>{{ history.length }} queries executed in this session</span>
      <div class="flex items-center space-x-2">
        <SqButton
          type="button"
          :label="$t('results.physicalLog')"
          size="sm"
          @click="handleOpenLog"
          :v-tooltip.top="$t('results.openLogTooltip')"
        >
          <template #icon><FileText class="w-3.5 h-3.5" /></template>
        </SqButton>
        <span v-if="history.length > 0" class="text-dark-600">|</span>
        <SqButton
          v-if="history.length > 0"
          type="button"
          :label="isAllExpanded ? $t('common.collapseAll') : $t('common.expandAll')"
          size="sm"
          @click="toggleExpandAll"
        />
        <span v-if="history.length > 0" class="text-dark-600">|</span>
        <SqButton
          v-if="history.length > 0"
          type="button"
          :label="$t('history.clearHistory')"
          size="sm"
          tone="danger"
          @click="$emit('clear')"
        />
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="history.length === 0" class="flex-1 flex items-center justify-center text-dark-500 italic select-none">
      {{ $t('history.noHistory') }}
    </div>

    <!-- Query History List (Newest at the top) -->
    <div v-else class="flex-1 overflow-auto p-3 space-y-2 select-text">
      <div
        v-for="(item, idx) in history"
        :key="item.id ?? idx"
        @click="$emit('select', item.sql)"
        :class="[
          'p-2.5 rounded-md border flex flex-col space-y-1.5 transition-colors cursor-pointer group',
          item.status === 'error'
            ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 text-danger hover:border-rose-700/80'
            : item.status === 'cancelled'
            ? 'bg-amber-500/15 border-amber-500/30 text-warn hover:border-amber-600/50'
            : 'bg-dark-850/60 border-dark-750 text-dark-200 hover:border-dark-600 hover:bg-dark-850'
        ]"
      >
        <!-- Line 1: [序號][時間] 資訊與右上角操作按鈕 -->
        <div class="flex items-center justify-between text-xxs font-mono flex-shrink-0 gap-2">
          <div class="flex items-center space-x-2 flex-wrap min-w-0">
            <span class="text-accent font-bold font-mono">[{{ '#' + (item.seq ?? (history.length - idx)) }}]</span>
            <span class="text-dark-400 font-mono">[{{ item.executedAt }}]</span>
            <span class="text-accent font-medium">{{ item.executionTimeMs }}ms</span>
            <SqChip
              v-if="item.status === 'cancelled'"
              tone="warn"
              label="Cancelled"
              class="uppercase"
            />
            <SqChip
              v-else-if="item.status === 'error'"
              tone="danger"
              label="Error"
              class="uppercase"
            />
            <span v-else-if="item.affectedRows !== undefined" class="text-ok font-mono">
              {{ item.affectedRows }} row(s)
            </span>
            <span v-if="item.database" class="text-dark-500 text-xxs truncate max-w-[140px]" :title="item.database">
              ({{ item.database }})
            </span>
          </div>

          <!-- 右上角操作按鈕：展開|收合 與 複製 -->
          <div class="flex items-center space-x-1 flex-shrink-0 select-none">
            <SqButton
              type="button"
              size="sm"
              class="opacity-0 group-hover:opacity-100"
              :aria-label="isExpanded(item.id ?? idx) ? $t('common.collapse') : $t('common.expand')"
              @click.stop="toggleExpand(item.id ?? idx)"
              :v-tooltip.top="isExpanded(item.id ?? idx) ? $t('common.collapse') : $t('common.expand')"
            >
              <template #icon>
                <ChevronUp v-if="isExpanded(item.id ?? idx)" class="w-3.5 h-3.5" />
                <ChevronDown v-else class="w-3.5 h-3.5" />
              </template>
            </SqButton>

            <SqButton
              type="button"
              size="sm"
              class="opacity-0 group-hover:opacity-100"
              :aria-label="copiedKey === (item.id ?? idx) ? $t('common.copied') : 'Copy SQL'"
              @click.stop="copySql(item.sql, item.id ?? idx)"
              :v-tooltip.top="copiedKey === (item.id ?? idx) ? $t('common.copied') : 'Copy SQL'"
            >
              <template #icon>
                <Check v-if="copiedKey === (item.id ?? idx)" class="w-3.5 h-3.5 text-ok" />
                <Copy v-else class="w-3.5 h-3.5" />
              </template>
            </SqButton>
          </div>
        </div>

        <!-- Line 2: SQL 語法 (收合時為單行截斷二行高度，展開時為多行換行完整呈現) -->
        <div
          :class="[
            'font-mono select-text text-dark-200 group-hover:text-accent text-xs transition-all',
            isExpanded(item.id ?? idx)
              ? 'whitespace-pre-wrap leading-relaxed break-words'
              : 'truncate leading-normal'
          ]"
          :title="!isExpanded(item.id ?? idx) ? item.sql : undefined"
        >
          {{ item.sql }}
        </div>

        <!-- 展開時顯示完整錯誤訊息 -->
        <div
          v-if="isExpanded(item.id ?? idx) && item.errorMessage && item.status !== 'cancelled'"
          class="text-xxs text-danger/90 whitespace-pre-wrap font-mono mt-0.5 pt-1 border-t border-rose-200 dark:border-rose-900/40 break-words"
        >
          {{ item.errorMessage }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import SqButton from '@/components/ui/SqButton.vue';
import { Check, ChevronDown, ChevronUp, Copy, FileText } from '@/components/icons';
import SqChip from '@/components/ui/SqChip.vue';
import type { QueryHistoryItem } from '@/types/query';
import { queryService } from '@/services/queryService';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const props = defineProps<{
  history: QueryHistoryItem[];
}>();

defineEmits<{
  (e: 'select', sql: string): void;
  (e: 'clear'): void;
}>();

const workspaceStore = useWorkspaceStore();

async function handleOpenLog() {
  try {
    const path = await queryService.openQueryLogFile();
    workspaceStore.showToast(`已在預設編輯器開啟日誌：${path}`, 'info', 3000);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    workspaceStore.showToast(`開啟日誌檔失敗：${msg}`, 'error', 3500);
  }
}

const copiedKey = ref<string | number | null>(null);
let copyTimeout: ReturnType<typeof setTimeout> | null = null;

const expandedKeys = ref<Set<string | number>>(new Set());

function isExpanded(key: string | number): boolean {
  return expandedKeys.value.has(key);
}

function toggleExpand(key: string | number) {
  const next = new Set(expandedKeys.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedKeys.value = next;
}

const isAllExpanded = computed(() => {
  if (props.history.length === 0) return false;
  return props.history.every((item, idx) => expandedKeys.value.has(item.id ?? idx));
});

function toggleExpandAll() {
  if (isAllExpanded.value) {
    expandedKeys.value = new Set();
  } else {
    const next = new Set<string | number>();
    props.history.forEach((item, idx) => next.add(item.id ?? idx));
    expandedKeys.value = next;
  }
}

async function copySql(text: string, key: string | number) {
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = key;
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      copiedKey.value = null;
    }, 1500);
  } catch (err) {
    console.error('Failed to copy SQL:', err);
  }
}
</script>
