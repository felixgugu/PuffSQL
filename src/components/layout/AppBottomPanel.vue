<template>
  <div class="h-full bg-dark-850 flex flex-col overflow-hidden select-none border-t border-dark-700">
    <!--
      Indeterminate progress hairline. While a query runs, the toolbar button and the status bar
      are not where the user is looking — the results area is. This keeps the wait visible from
      the panel itself. Reduced motion swaps the slide for a static segment (see main.css).
    -->
    <div
      v-if="queryStore.isExecuting"
      class="sq-progress-line"
      role="progressbar"
      :aria-label="$t('common.running')"
    />

    <!-- Combined Bottom Panel Header Tabs Bar: Left (SQL Result Tabs) + Auto Space + Right (Messages | History | Stats) + Minimize -->
    <div class="h-9 bg-dark-850 border-b border-dark-750 flex items-center justify-between px-1.5 select-none flex-shrink-0 overflow-hidden">
      <!-- Left: SQL Result Tabs Bar (with horizontal scroll) -->
      <div
        ref="resultsTabsBarRef"
        @wheel="handleResultTabsWheel"
        class="flex-1 min-w-0 h-full flex items-end px-0.5 overflow-x-auto overflow-y-hidden select-none"
        :class="{ 'results-inactive': workspaceStore.bottomPanelTab !== 'results' }"
      >
        <div
          v-for="(rtab, idx) in queryStore.resultTabs"
          :key="rtab.id"
          @pointerdown="onTabPointerDown($event, idx)"
          @click="handleTabClick(rtab.id)"
          @contextmenu.prevent="openTabContextMenu($event, rtab)"
          :data-flip-key="rtab.id"
          :class="[
            'result-tab-item h-7 px-2 flex items-center space-x-1.5 text-xxs cursor-grab active:cursor-grabbing transition-all duration-100 group max-w-[220px] border flex-shrink-0 select-none touch-none relative',
            queryStore.activeResultTabId === rtab.id
              ? 'font-medium shadow-sm border-primary active-tab'
              : 'bg-dark-850/60 border-dark-750/70 hover:border-dark-600 hover:bg-dark-800/90',
            isPointerDragging && dragSourceIndex === idx ? 'opacity-35 border-dashed border-brand-400 scale-95' : '',
            dropHoverIndex === idx && isPointerDragging && dropHoverIndex !== dragSourceIndex ? 'border-brand-400 bg-brand-500/25 ring-1 ring-brand-400 scale-105' : ''
          ]"
          :style="getResultTabStyle(rtab)"
          :title="`${rtab.title}\n執行時間: ${rtab.executedAt} (${rtab.durationMs}ms)\n筆數: ${rtab.rowCount} rows\n\nSQL 語句:\n${rtab.sql}`"
        >
          <!-- Pin / Unpin Button -->
          <button
            type="button"
            @click.stop="queryStore.togglePinTab(rtab.id)"
            :class="[
              'p-0.5 rounded transition-colors cursor-pointer',
              rtab.isPinned
                ? 'text-warn'
                : (queryStore.activeResultTabId === rtab.id && workspaceStore.bottomPanelTab === 'results' ? 'text-dark-400 hover:text-dark-100 opacity-70 group-hover:opacity-100' : 'text-dark-500 hover:text-dark-300 opacity-0 group-hover:opacity-75')
            ]"
            :title="rtab.isPinned ? '已釘選（不會被自動清理，點擊解除釘選）' : '釘選此結果（保護不被自動移除）'"
          >
            <Pin class="w-2.5 h-2.5" :class="rtab.isPinned ? 'fill-current' : ''" />
          </button>

          <!-- Tab Title (Normal Span OR Inline Rename Input) -->
          <input
            v-if="editingTabId === rtab.id"
            ref="renameInputRef"
            v-model="editingTabTitle"
            @click.stop
            @pointerdown.stop
            @keydown.enter.stop="saveRenameTab(rtab.id)"
            @keydown.esc.stop="cancelRenameTab"
            @blur="saveRenameTab(rtab.id)"
            class="bg-dark-900 border border-brand-500 text-dark-100 rounded px-1 py-0 text-xxs font-sans focus:outline-none w-20 flex-1 min-w-0"
          />
          <span
            v-else
            class="truncate flex-1 select-none"
          >
            {{ rtab.title }}
          </span>

          <!-- Status Badge (if error) -->
          <span
            v-if="editingTabId !== rtab.id && rtab.result.messages.some((m) => m.level === 'error')"
            class="text-xxs px-1 py-0.2 rounded font-mono flex-shrink-0 pointer-events-none bg-rose-100 dark:bg-rose-900/90 text-danger border border-rose-200 dark:border-rose-700/50"
          >
            Err
          </span>

          <!-- Delete Tab Button (Disabled on the last remaining result tab) -->
          <button
            v-if="editingTabId !== rtab.id"
            type="button"
            @click.stop="queryStore.deleteResultTab(rtab.id)"
            :disabled="queryStore.resultTabs.length <= 1"
            :class="[
              'p-0.5 rounded transition-all flex-shrink-0',
              queryStore.resultTabs.length <= 1
                ? 'opacity-20 cursor-not-allowed text-dark-600'
                : (queryStore.activeResultTabId === rtab.id && workspaceStore.bottomPanelTab === 'results' ? 'text-dark-400 hover:text-danger hover:bg-rose-500/15 opacity-50 group-hover:opacity-100 cursor-pointer' : 'text-dark-400 hover:text-danger hover:bg-rose-500/15 opacity-0 group-hover:opacity-75 hover:!opacity-100 cursor-pointer')
            ]"
            :title="queryStore.resultTabs.length <= 1 ? '最後一個查詢結果不可刪除' : '關閉此結果'"
          >
            <X class="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      <!-- PrimeVue Result Tab Context Menu -->
      <ContextMenu ref="tabContextMenuRef" :model="tabContextMenuItems" />

      <!-- Right: Grid Actions + Text-style Tabs (Messages | History | Stats) + Panel Minimize Control -->
      <div class="flex items-center space-x-1 pl-2 flex-shrink-0 text-xs">
        <!-- Grid Actions (only when in results tab and has active result sets) -->
        <template v-if="workspaceStore.bottomPanelTab === 'results' && activeResultSetsCount > 0">
          <!-- 顯示工具列 / 隱藏工具列 -->
          <button
            type="button"
            @click="toggleToolbarVisibility"
            class="h-6 px-1.5 py-0.5 rounded text-xs transition-colors cursor-pointer select-none text-dark-400 hover:text-dark-200 hover:bg-dark-800"
            :title="isToolbarHidden ? $t('results.showToolbarsTooltip') : $t('results.hideToolbarsTooltip')"
          >
            <span>{{ isToolbarHidden ? $t('results.showToolbars') : $t('results.hideToolbars') }}</span>
          </button>

          <div class="h-3.5 w-px bg-dark-750 mx-1 flex-shrink-0"></div>
        </template>

        <!-- Panel Tabs: 訊息 | 歷程 | 統計 -->
        <button
          v-for="tab in panelTabs"
          :key="tab.id"
          type="button"
          @click="workspaceStore.setBottomPanelTab(tab.id)"
          class="panel-sub-tab h-6 px-2 py-0.5 rounded text-xs transition-all cursor-pointer select-none border border-transparent"
          :class="workspaceStore.bottomPanelTab === tab.id ? '!font-medium' : '!font-normal'"
          :style="workspaceStore.bottomPanelTab === tab.id ? { color: 'var(--p-primary-color, #3b82f6)' } : {}"
        >
          <span :class="workspaceStore.bottomPanelTab === tab.id ? 'text-primary' : 'text-dark-400 hover:text-dark-200'">{{ tab.label }}</span>
        </button>

        <div class="h-3.5 w-px bg-dark-750 mx-1 flex-shrink-0"></div>

        <Button
          icon="pi pi-minus"
          severity="secondary"
          size="small"
          text
          rounded
          class="!h-6 !w-6 !p-0"
          v-tooltip.bottom="'縮小面板 (Minimize)'"
          @click="workspaceStore.toggleBottomPanel()"
        />
      </div>
    </div>

    <!-- Panel Body -->
    <div class="flex-1 overflow-hidden bg-dark-900">
      <!-- Tab 1: Results Grid -->
      <div v-if="workspaceStore.bottomPanelTab === 'results'" class="w-full h-full flex flex-col min-h-0 overflow-hidden">
        <ResultGrid
          :result-sets="queryStore.activeResult?.resultSets ?? []"
          :tab-id="queryStore.activeResultTabId"
          :duration-ms="queryStore.activeResultTab?.durationMs"
        />
      </div>

      <!-- Tab 2: Messages -->
      <ResultMessages
        v-else-if="workspaceStore.bottomPanelTab === 'messages'"
        :messages="queryStore.sessionMessages"
        @clear="queryStore.clearMessages()"
      />

      <!-- Tab 3: History -->
      <QueryHistory
        v-else-if="workspaceStore.bottomPanelTab === 'history'"
        :history="queryStore.history"
        @select="onSelectHistory"
        @clear="queryStore.clearHistory()"
      />

      <!-- Tab 4: Execution Stats & IO Analyzer -->
      <ExecutionStatsViewer
        v-else-if="workspaceStore.bottomPanelTab === 'stats'"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import ContextMenu from 'primevue/contextmenu';
import { Pin, X } from 'lucide-vue-next';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useQueryStore } from '@/stores/queryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useGridLayoutStore } from '@/stores/gridLayoutStore';
import ResultGrid from '@/components/results/ResultGrid.vue';
import ResultMessages from '@/components/results/ResultMessages.vue';
import QueryHistory from '@/components/results/QueryHistory.vue';
import ExecutionStatsViewer from '@/components/results/ExecutionStatsViewer.vue';
import { cancelFlip, captureFlipRects, playFlip } from '@/composables/useFlip';
import type { BottomPanelTab } from '@/types/workspace';
import type { QueryResultTab } from '@/types/query';

const { t } = useI18n();
const workspaceStore = useWorkspaceStore();
const queryStore = useQueryStore();
const settingsStore = useSettingsStore();
const connectionStore = useConnectionStore();
const gridLayoutStore = useGridLayoutStore();

const activeResultSetsCount = computed(() => {
  return queryStore.activeResultTab?.result?.resultSets?.length ?? queryStore.activeResult?.resultSets?.length ?? 0;
});

const isToolbarHidden = computed(() => {
  return gridLayoutStore.isToolbarHidden(queryStore.activeResultTabId, true);
});

function toggleToolbarVisibility() {
  gridLayoutStore.toggleToolbarHidden(queryStore.activeResultTabId, true);
}

const resultsTabsBarRef = ref<HTMLDivElement | null>(null);
const dragSourceIndex = ref<number | null>(null);
const dropHoverIndex = ref<number | null>(null);
const isPointerDragging = ref<boolean>(false);

let startPointerX = 0;
let hasMovedBeyondThreshold = false;
// A drag ends with a click event; that one click must not also activate the result tab it landed on.
let suppressClick = false;

function onTabPointerDown(e: PointerEvent, index: number) {
  // Only respond to left mouse button
  if (e.button !== 0) return;

  // Don't initiate drag if clicking on buttons (Pin / Close) or input (Renaming)
  const target = e.target as HTMLElement | null;
  if (target?.closest('button') || target?.closest('input')) {
    return;
  }

  suppressClick = false;
  // A previous reorder may still be settling; take over from the laid-out position.
  cancelFlip(resultsTabsBarRef.value, '.result-tab-item');
  dragSourceIndex.value = index;
  dropHoverIndex.value = index;
  startPointerX = e.clientX;
  hasMovedBeyondThreshold = false;

  window.addEventListener('pointermove', onDocumentPointerMove);
  window.addEventListener('pointerup', onDocumentPointerUp);
  window.addEventListener('pointercancel', onDocumentPointerUp);
}

function onDocumentPointerMove(e: PointerEvent) {
  if (dragSourceIndex.value === null) return;

  const dx = Math.abs(e.clientX - startPointerX);
  if (!hasMovedBeyondThreshold && dx > 4) {
    hasMovedBeyondThreshold = true;
    isPointerDragging.value = true;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  }

  if (!isPointerDragging.value) return;

  // Find which tab is hovered
  if (!resultsTabsBarRef.value) return;
  const tabElements = resultsTabsBarRef.value.querySelectorAll('.result-tab-item');
  let targetIndex: number | null = null;

  for (let i = 0; i < tabElements.length; i++) {
    const el = tabElements[i];
    if (el) {
      const rect = el.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right) {
        targetIndex = i;
        break;
      }
    }
  }

  if (targetIndex === null && tabElements.length > 0) {
    const firstEl = tabElements[0];
    const lastEl = tabElements[tabElements.length - 1];
    if (firstEl && e.clientX < firstEl.getBoundingClientRect().left) {
      targetIndex = 0;
    } else if (lastEl && e.clientX > lastEl.getBoundingClientRect().right) {
      targetIndex = tabElements.length - 1;
    }
  }

  if (targetIndex !== null) {
    dropHoverIndex.value = targetIndex;
  }
}

async function onDocumentPointerUp() {
  window.removeEventListener('pointermove', onDocumentPointerMove);
  window.removeEventListener('pointerup', onDocumentPointerUp);
  window.removeEventListener('pointercancel', onDocumentPointerUp);

  document.body.style.cursor = '';
  document.body.style.userSelect = '';

  const from = dragSourceIndex.value;
  const to = dropHoverIndex.value;
  const wasDragging = isPointerDragging.value;

  // Clear the drag state first so the source tab drops its dragging classes before the FLIP
  // pass measures the settled layout.
  dragSourceIndex.value = null;
  dropHoverIndex.value = null;
  isPointerDragging.value = false;
  hasMovedBeyondThreshold = false;
  suppressClick = wasDragging;

  if (!wasDragging || from === null || to === null || from === to) return;

  const before = captureFlipRects(resultsTabsBarRef.value, '.result-tab-item');
  queryStore.reorderResultTabs(from, to);
  await nextTick();
  playFlip(before, resultsTabsBarRef.value, '.result-tab-item', 'x');
}

function handleTabClick(tabId: string) {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (hasMovedBeyondThreshold || isPointerDragging.value) {
    return;
  }
  workspaceStore.setBottomPanelTab('results');
  queryStore.selectResultTab(tabId);
}

// ========================
// Inline Tab Renaming
// ========================
const editingTabId = ref<string | null>(null);
const editingTabTitle = ref<string>('');
const renameInputRef = ref<HTMLInputElement | null>(null);

function startRenameTab(rtab: QueryResultTab) {
  editingTabId.value = rtab.id;
  editingTabTitle.value = rtab.title;
  nextTick(() => {
    renameInputRef.value?.focus();
    renameInputRef.value?.select();
  });
}

function saveRenameTab(tabId: string) {
  if (!editingTabId.value || editingTabId.value !== tabId) return;
  const trimmed = editingTabTitle.value.trim();
  if (trimmed) {
    queryStore.renameResultTab(tabId, trimmed);
  }
  editingTabId.value = null;
  editingTabTitle.value = '';
}

function cancelRenameTab() {
  editingTabId.value = null;
  editingTabTitle.value = '';
}

// ========================
// Tab Context Menu
// ========================
const tabContextMenuRef = ref();
const tabContextMenu = reactive<{
  tab: QueryResultTab | null;
}>({
  tab: null,
});

const tabContextMenuItems = computed(() => {
  const tab = tabContextMenu.tab;
  if (!tab) return [];
  const otherClosableCount = queryStore.resultTabs.filter((t) => t.id !== tab.id && !t.isPinned).length;
  return [
    {
      label: tab.title,
      disabled: true,
      class: 'font-mono !text-xs !text-dark-300',
    },
    { separator: true },
    {
      label: t('editor.renameTab'),
      icon: 'pi pi-pencil',
      command: handleContextMenuRename,
    },
    {
      label: tab.isPinned ? t('common.unpin') : t('results.pinTab'),
      icon: tab.isPinned ? 'pi pi-bookmark-fill' : 'pi pi-bookmark',
      command: handleContextMenuPin,
    },
    {
      label: t('results.closeTab'),
      icon: 'pi pi-times',
      disabled: queryStore.resultTabs.length <= 1,
      command: handleContextMenuClose,
    },
    {
      label: t('results.closeOtherTabs'),
      icon: 'pi pi-clone',
      disabled: otherClosableCount === 0,
      command: handleContextMenuCloseOthers,
    },
  ];
});

function openTabContextMenu(e: MouseEvent, tab: QueryResultTab) {
  tabContextMenu.tab = tab;
  tabContextMenuRef.value?.show(e);
}

function handleContextMenuRename() {
  const tab = tabContextMenu.tab;
  if (tab) {
    startRenameTab(tab);
  }
}

function handleContextMenuPin() {
  const tab = tabContextMenu.tab;
  if (tab) {
    queryStore.togglePinTab(tab.id);
  }
}

function handleContextMenuClose() {
  const tab = tabContextMenu.tab;
  if (tab) {
    queryStore.deleteResultTab(tab.id);
  }
}

function handleContextMenuCloseOthers() {
  const tab = tabContextMenu.tab;
  if (tab) {
    queryStore.closeOtherResultTabs(tab.id);
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onDocumentPointerMove);
  window.removeEventListener('pointerup', onDocumentPointerUp);
  window.removeEventListener('pointercancel', onDocumentPointerUp);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});


const panelTabs = computed<{ id: BottomPanelTab; label: string }[]>(() => [
  {
    id: 'messages',
    label: t('results.tabMessages'),
  },
  {
    id: 'history',
    label: t('results.tabHistory'),
  },
  {
    id: 'stats',
    label: t('results.tabStats'),
  },
]);

function handleResultTabsWheel(e: WheelEvent) {
  const container = e.currentTarget as HTMLElement;
  if (!container) return;
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault();
    container.scrollLeft += e.deltaY;
  }
}

function onSelectHistory(sql: string) {
  workspaceStore.addSqlTab(sql);
}

function getResultTabConnectionColor(rtab: QueryResultTab): string | undefined {
  const connId = rtab.connectionId || workspaceStore.activeTab?.connectionId || connectionStore.activeConnectionId;
  if (!connId) return undefined;
  const conn = connectionStore.getConnectionById(connId) || connectionStore.connections.find((c) => c.id === connId);
  return conn?.color || undefined;
}

function getResultTabTopAccent(rtab: QueryResultTab): string {
  const connColor = getResultTabConnectionColor(rtab);
  if (connColor) return connColor;
  return 'var(--p-primary-color, #3b82f6)';
}

function getResultTabStyle(rtab: QueryResultTab): Record<string, string> {
  const isActive = queryStore.activeResultTabId === rtab.id;
  const topAccent = getResultTabTopAccent(rtab);
  const isLight = settingsStore.colorMode === 'light';

  if (!isActive) {
    return {
      '--tab-top-accent': topAccent,
      // Slate-600 keeps the inactive label readable on the grey chrome (slate-500 fell to ~4:1).
      '--tab-text': isLight ? '#475569' : '#94a3b8',
      '--tab-hover-text': isLight ? '#0f172a' : '#f8fafc',
    };
  }

  return {
    '--tab-top-accent': topAccent,
    // The active result tab merges into the canvas in both modes (no hardcoded white in light).
    '--tab-active-surface': 'rgb(var(--color-dark-900))',
    '--tab-active-text': isLight ? '#0f172a' : 'rgb(var(--color-dark-100))',
    '--tab-border': topAccent,
    backgroundColor: 'rgb(var(--color-dark-900))',
    color: isLight ? '#0f172a' : 'rgb(var(--color-dark-100))',
    borderTopColor: topAccent,
    borderLeftColor: topAccent,
    borderRightColor: topAccent,
    borderBottomColor: 'transparent',
  };
}
</script>

<style scoped>
.result-tab-item {
  position: relative;
  border-radius: 0;
  color: var(--tab-text, #94a3b8);
  transition: all 0.15s ease;
}

.result-tab-item:hover {
  color: var(--tab-hover-text, #f8fafc);
}

.result-tab-item + .result-tab-item {
  margin-left: -1px;
}

.result-tab-item.active-tab {
  height: 29px !important;
  background-color: var(--tab-active-surface, rgb(var(--color-dark-900))) !important;
  color: var(--tab-active-text, rgb(var(--color-dark-100))) !important;
  border-top-color: var(--tab-top-accent, var(--p-primary-color, #3b82f6)) !important;
  border-left-color: var(--tab-top-accent, var(--p-primary-color, #3b82f6)) !important;
  border-right-color: var(--tab-top-accent, var(--p-primary-color, #3b82f6)) !important;
  border-bottom-color: transparent !important;
  margin-bottom: -1px;
  z-index: 10;
  box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.08);
}

/* 頂部高光指示條 (Top Accent Indicator) 增強活躍結果分頁辨識度 */
.result-tab-item.active-tab::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background-color: var(--tab-top-accent, var(--p-primary-color, #3b82f6));
  z-index: 2;
}

.results-inactive .result-tab-item.active-tab {
  height: 28px !important;
  border-top-color: rgb(var(--color-dark-700)) !important;
  border-left-color: rgb(var(--color-dark-700)) !important;
  border-right-color: rgb(var(--color-dark-700)) !important;
  border-bottom-color: rgb(var(--color-dark-750)) !important;
  background-color: rgba(var(--color-dark-800), 0.5) !important;
  color: rgb(var(--color-dark-400)) !important;
  margin-bottom: 0;
  box-shadow: none;
}

.results-inactive .result-tab-item.active-tab::before {
  display: none;
}

.panel-sub-tab.\!font-medium {
  background-color: rgba(var(--color-dark-750), 0.9);
  border-color: rgba(var(--p-primary-color), 0.35);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.panel-sub-tab.\!font-normal:hover {
  background-color: rgba(var(--color-dark-800), 0.8);
}
</style>
