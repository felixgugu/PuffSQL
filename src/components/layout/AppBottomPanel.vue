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

      <!-- Right: Grid Actions + Panel View Switcher + Panel Minimize Control -->
      <div class="flex items-center space-x-1 pl-2 flex-shrink-0 text-xs">
        <!-- Grid Actions (only when in results tab and has active result sets) -->
        <template v-if="workspaceStore.bottomPanelTab === 'results' && activeResultSetsCount > 0">
          <!-- Toolbar visibility for every grid pane in this result tab -->
          <Button
            type="button"
            :icon="isToolbarHidden ? 'pi pi-eye-slash' : 'pi pi-eye'"
            size="small"
            rounded
            text
            :severity="isToolbarHidden ? 'primary' : 'secondary'"
            @click="toggleToolbarVisibility"
            :aria-label="isToolbarHidden ? $t('results.showToolbars') : $t('results.hideToolbars')"
            :v-tooltip.bottom="isToolbarHidden ? $t('results.showToolbarsTooltip') : $t('results.hideToolbarsTooltip')"
            class="!w-6 !h-6 !p-0"
          />

          <div class="h-3.5 w-px bg-dark-750 mx-1 flex-shrink-0"></div>
        </template>

        <!--
          Level 2 of the tab hierarchy: a segmented control, not document tabs. The results grid,
          the message log, the query history and the IO stats are four *views of one panel*, so
          they read as one control — unlike the query result chips on the left, which are separate
          objects the user switches between.
        -->
        <div
          class="sq-view-switch"
          role="tablist"
          :aria-label="$t('results.panelViews')"
          @keydown="onPanelTabKeydown($event)"
        >
          <button
            v-for="(tab, index) in panelTabs"
            :key="tab.id"
            type="button"
            role="tab"
            :id="panelTabId(tab.id)"
            :aria-controls="panelViewId(tab.id)"
            :aria-selected="workspaceStore.bottomPanelTab === tab.id"
            :tabindex="workspaceStore.bottomPanelTab === tab.id ? 0 : -1"
            :title="tab.title"
            :data-panel-index="index"
            @click="workspaceStore.setBottomPanelTab(tab.id)"
            class="sq-view-tab"
            :class="{ 'is-active': workspaceStore.bottomPanelTab === tab.id }"
          >
            <span>{{ tab.label }}</span>
            <span v-if="tab.badge > 0" class="sq-view-count">{{ tab.badge }}</span>
          </button>
        </div>

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
      <div
        v-if="workspaceStore.bottomPanelTab === 'results'"
        :id="panelViewId('results')"
        role="tabpanel"
        :aria-labelledby="panelTabId('results')"
        tabindex="0"
        class="w-full h-full flex flex-col min-h-0 overflow-hidden focus:outline-none"
      >
        <ResultGrid
          :result-sets="queryStore.activeResult?.resultSets ?? []"
          :tab-id="queryStore.activeResultTabId"
          :duration-ms="queryStore.activeResultTab?.durationMs"
        />
      </div>

      <!-- Tab 2: Messages -->
      <ResultMessages
        v-else-if="workspaceStore.bottomPanelTab === 'messages'"
        :id="panelViewId('messages')"
        role="tabpanel"
        :aria-labelledby="panelTabId('messages')"
        :messages="queryStore.sessionMessages"
        @clear="queryStore.clearMessages()"
      />

      <!-- Tab 3: History -->
      <QueryHistory
        v-else-if="workspaceStore.bottomPanelTab === 'history'"
        :id="panelViewId('history')"
        role="tabpanel"
        :aria-labelledby="panelTabId('history')"
        :history="queryStore.history"
        @select="onSelectHistory"
        @clear="queryStore.clearHistory()"
      />

      <!-- Tab 4: Execution Stats & IO Analyzer -->
      <ExecutionStatsViewer
        v-else-if="workspaceStore.bottomPanelTab === 'stats'"
        :id="panelViewId('stats')"
        role="tabpanel"
        :aria-labelledby="panelTabId('stats')"
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


/**
 * Only messages that need attention earn a badge; the routine "1 row affected" info lines would
 * light the counter up on every statement and teach users to ignore it.
 */
const messageIssueCount = computed(
  () =>
    queryStore.sessionMessages.filter((m) => m.level === 'error' || m.level === 'warning').length
);

const panelTabs = computed<{ id: BottomPanelTab; label: string; badge: number; title: string }[]>(() => [
  {
    id: 'results',
    label: t('results.tabResults'),
    badge: 0,
    title: t('results.tabResults'),
  },
  {
    id: 'messages',
    label: t('results.tabMessages'),
    badge: messageIssueCount.value,
    title: t('results.messagesInSession', { count: queryStore.sessionMessages.length }),
  },
  {
    id: 'history',
    label: t('results.tabHistory'),
    badge: 0,
    title: t('results.tabHistory'),
  },
  {
    id: 'stats',
    label: t('results.tabStats'),
    badge: 0,
    title: t('results.tabStats'),
  },
]);

/** Stable ids so each tab button and its panel can reference each other. */
function panelTabId(id: BottomPanelTab): string {
  return `bottom-panel-tab-${id}`;
}

function panelViewId(id: BottomPanelTab): string {
  return `bottom-panel-view-${id}`;
}

/**
 * Roving focus for the view switcher: only the selected tab is in the tab order, and the arrow
 * keys move between views the way a native tab strip does.
 */
function onPanelTabKeydown(event: KeyboardEvent) {
  const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
  if (!keys.includes(event.key)) return;

  const tabs = panelTabs.value;
  const count = tabs.length;
  if (count === 0) return;

  const currentIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === workspaceStore.bottomPanelTab)
  );
  let nextIndex = currentIndex;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % count;
  if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + count) % count;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = count - 1;

  const next = tabs[nextIndex];
  if (!next) return;

  event.preventDefault();
  workspaceStore.setBottomPanelTab(next.id);
  nextTick(() => {
    document.getElementById(panelTabId(next.id))?.focus();
  });
}

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

/* Level 2 view switcher: one recessed track, one raised pill for the active view.
   The step direction flips between modes (dark chrome is lightened by panels, light chrome is
   darkened by them), so each mode names its own track tone instead of pretending one token
   describes both. The active pill always uses the single surface-above-everything token. */
.sq-view-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background-color: rgb(var(--color-dark-900) / 0.65);
  border: 1px solid rgb(var(--color-dark-750));
}

html:not(.dark) .sq-view-switch {
  background-color: rgb(var(--color-dark-800));
}

.sq-view-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 8px;
  border-radius: 5px;
  font-size: 0.75rem;
  font-weight: 400;
  color: rgb(var(--color-dark-400));
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.sq-view-tab:hover {
  color: rgb(var(--color-dark-200));
  background-color: rgb(var(--color-dark-800) / 0.7);
}

.sq-view-tab.is-active {
  background-color: rgb(var(--color-raised, 39 39 42));
  color: rgb(var(--p-primary-color, #3b82f6));
  font-weight: 500;
  cursor: default;
  box-shadow: 0 1px 2px rgb(var(--color-dark-950) / 0.12), inset 0 0 0 1px rgb(var(--color-dark-700) / 0.7);
}

.sq-view-count {
  min-width: 14px;
  padding: 0 4px;
  border-radius: 999px;
  background-color: rgb(var(--color-danger) / 0.16);
  color: rgb(var(--color-danger));
  font-size: 0.6875rem;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
</style>
