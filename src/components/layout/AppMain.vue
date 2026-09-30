<template>
  <main class="h-full flex flex-col bg-dark-900 overflow-hidden">
    <!-- Workspace Tab Bar -->
    <div
      @dragover.prevent="handleBarDragOver"
      @dragleave="handleBarDragLeave"
      @drop.prevent="handleBarDrop"
      class="workspace-tab-bar h-9 bg-dark-850 flex items-center px-1.5 space-x-1 select-none flex-shrink-0 overflow-hidden transition-colors"
      :class="[isBarDragOver ? 'bg-dark-800 ring-1 ring-inset ring-brand-500/40' : '']"
    >
      <!-- Scrollable Tabs List -->
      <div
        ref="queryTabsBarRef"
        @wheel="handleTabsWheel"
        class="query-tabs-scroll flex-1 flex items-end overflow-x-auto overflow-y-hidden select-none h-full"
      >
        <!-- Tabs List -->
        <div
          v-for="(tab, idx) in workspaceStore.tabs"
          :key="tab.id"
          @pointerdown="onTabPointerDown($event, idx)"
          @click="handleTabClick(tab.id)"
          @contextmenu.prevent="openTabContextMenu($event, tab)"
          @dragover.stop.prevent="handleTabItemDragOver($event, tab)"
          @dragleave.stop="handleTabItemDragLeave($event, tab)"
          @drop.stop.prevent="handleTabItemDrop($event, tab)"
          :data-flip-key="tab.id"
          :class="[
            'query-tab-item h-7 px-2.5 flex items-center space-x-2 text-xs border cursor-grab active:cursor-grabbing transition-all duration-100 group max-w-[280px] select-none touch-none flex-shrink-0 relative',
            workspaceStore.activeTabId === tab.id ? 'font-medium shadow-sm active-tab' : 'inactive-tab shadow-xs',
            isPointerDragging && dragSourceIndex === idx ? 'opacity-35 border-dashed border-brand-400 scale-95' : '',
            dropHoverIndex === idx && isPointerDragging && dropHoverIndex !== dragSourceIndex ? 'border-brand-400 bg-brand-500/25 ring-1 ring-brand-400 scale-105' : '',
            dragOverTabId === tab.id ? 'border-brand-400 bg-brand-500/30 ring-1 ring-brand-400 scale-105 shadow-md' : ''
          ]"
          :style="getTabItemStyle(tab, idx)"
          :title="getTabTooltip(tab)"
        >
          <FileCode v-if="tab.type === 'sql_editor'" class="w-3.5 h-3.5 flex-shrink-0 transition-opacity" :class="workspaceStore.activeTabId === tab.id ? 'text-primary opacity-100' : 'text-primary/70 opacity-60 group-hover:opacity-100'" />
          <Table2 v-else-if="tab.type === 'table_data'" class="w-3.5 h-3.5 flex-shrink-0 transition-opacity" :class="workspaceStore.activeTabId === tab.id ? 'text-ok opacity-100' : 'text-ok/80 opacity-60 group-hover:opacity-100'" />
          <TableProperties v-else-if="tab.type === 'table_structure'" class="w-3.5 h-3.5 flex-shrink-0 transition-opacity" :class="workspaceStore.activeTabId === tab.id ? 'text-structure opacity-100' : 'text-structure/80 opacity-60 group-hover:opacity-100'" />
          <Network v-else-if="tab.type === 'execution_plan'" class="w-3.5 h-3.5 flex-shrink-0 transition-opacity" :class="workspaceStore.activeTabId === tab.id ? 'text-plan opacity-100' : 'text-plan/80 opacity-60 group-hover:opacity-100'" />
          <Workflow v-else-if="tab.type === 'er_diagram'" class="w-3.5 h-3.5 flex-shrink-0 transition-opacity" :class="workspaceStore.activeTabId === tab.id ? 'text-er opacity-100' : 'text-er/80 opacity-60 group-hover:opacity-100'" />

          <!-- Title Display OR Inline Rename Input -->
          <input
            v-if="editingTabId === tab.id"
            ref="renameInputRef"
            v-model="editingTabTitle"
            @click.stop
            @pointerdown.stop
            @keydown.enter.stop="saveRenameTab(tab.id)"
            @keydown.esc.stop="cancelRenameTab"
            @blur="saveRenameTab(tab.id)"
            class="bg-dark-800 border border-brand-500 text-dark-100 rounded px-1.5 py-0.5 text-xs font-sans focus:outline-none w-28 flex-1 min-w-0"
          />
          <div
            v-else
            class="flex items-center space-x-1.5 min-w-0 flex-1"
          >
            <!-- Tab Name (left-aligned) -->
            <span
              class="truncate min-w-0"
              :style="getTabTitleStyle(tab)"
            >
              {{ tab.title }}
            </span>
            <!-- Alias badge (right-aligned via ml-auto) -->
            <Tag
              v-if="getTabConnectionAlias(tab)"
              severity="secondary"
              :value="getTabConnectionAlias(tab)"
              class="!text-xxs !font-mono !px-1.5 !py-0 flex-shrink-0 ml-auto max-w-[85px] truncate"
              :class="workspaceStore.activeTabId === tab.id ? '' : '!font-normal'"
              :title="`${$t('sidebar.connections')}: ${getTabConnectionAlias(tab)}`"
            />
          </div>

          <!-- Dirty Indicator -->
          <span
            v-if="tab.isDirty && editingTabId !== tab.id"
            class="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 ring-1 ring-black/30"
            :title="$t('editor.unsavedChanges')"
          />

          <!-- Close Tab Button -->
          <button
            v-if="editingTabId !== tab.id"
            type="button"
            @click.stop="workspaceStore.closeTab(tab.id)"
            class="p-0.5 rounded transition-all flex-shrink-0 text-dark-400 hover:text-danger hover:bg-rose-500/15 cursor-pointer"
            :class="workspaceStore.activeTabId === tab.id ? 'opacity-40 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-70 hover:!opacity-100'"
            :title="$t('editor.closeTab')"
          >
            <X class="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      <!-- Vertical Divider -->
      <div class="h-4 w-px bg-dark-750 mx-0.5 flex-shrink-0"></div>

      <!-- Fixed Right: Add New Query Tab Button -->
      <Button
        icon="pi pi-plus"
        severity="secondary"
        size="small"
        text
        rounded
        class="!h-7 !w-7 !p-0 !text-accent flex-shrink-0"
        v-tooltip.bottom="$t('editor.newTab')"
        @click="handleAddNewTab"
      />
    </div>

    <!-- PrimeVue Tab Context Menu -->
    <ContextMenu ref="tabContextMenuRef" :model="tabContextMenuItems" />

    <!-- Active Tab Workspace Area (Monaco Editor / Table Data) -->
    <div class="flex-1 relative overflow-hidden bg-dark-900 flex flex-col">
      <div v-if="workspaceStore.activeTab?.type === 'sql_editor'" class="w-full h-full flex flex-col">
        <!-- Monaco SQL Editor Component -->
        <div class="flex-1 relative overflow-hidden" @mousedown="dispatchClearGridSelection">
          <MonacoEditor
            ref="monacoRef"
            :key="workspaceStore.activeTab.id"
            :tab-id="workspaceStore.activeTab.id"
            :initial-cursor="(workspaceStore.activeTab as SqlEditorTab).cursorPosition"
            v-model="(workspaceStore.activeTab as SqlEditorTab).query"
            @execute="(sql, mode) => runQuery(mode || 'current', sql)"
            @format="formatCode"
            @save="saveActiveTab"
          />
        </div>
      </div>

      <!-- Table Data Browser Tab -->
      <TableDataViewer
        v-else-if="workspaceStore.activeTab?.type === 'table_data'"
        :key="workspaceStore.activeTab.id"
        :schema="(workspaceStore.activeTab as TableDataTab).schema"
        :table-name="(workspaceStore.activeTab as TableDataTab).tableName"
      />

      <!-- Table Structure Browser Tab -->
      <TableStructureViewer
        v-else-if="workspaceStore.activeTab?.type === 'table_structure'"
        :key="workspaceStore.activeTab.id"
        :schema="(workspaceStore.activeTab as TableStructureTab).schema"
        :table-name="(workspaceStore.activeTab as TableStructureTab).tableName"
      />

      <!-- Execution Plan Browser Tab -->
      <ExecutionPlanViewer
        v-else-if="workspaceStore.activeTab?.type === 'execution_plan'"
        :key="workspaceStore.activeTab.id"
        :tab="workspaceStore.activeTab as ExecutionPlanTab"
      />

      <!-- ER Diagram Tab -->
      <ErDiagramViewer
        v-else-if="workspaceStore.activeTab?.type === 'er_diagram'"
        :key="workspaceStore.activeTab.id"
        :tab="workspaceStore.activeTab as ErDiagramTab"
      />

      <div v-else class="w-full h-full flex items-center justify-center text-dark-500 text-xs">
        <span>No active workspace tab</span>
      </div>
    </div>

    <!-- Dangerous Query Double-Confirmation Modal -->
    <DangerousQueryModal
      :is-open="dangerousModalState.isOpen"
      :step="dangerousModalState.step"
      :connection-name="dangerousModalState.connectionName"
      :database-name="dangerousModalState.databaseName"
      :detected-keywords="dangerousModalState.detectedKeywords"
      :sql="dangerousModalState.sql"
      @proceed="handleDangerousModalProceed"
      @cancel="handleDangerousModalCancel"
    />
  </main>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick, onBeforeUnmount, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import ContextMenu from 'primevue/contextmenu';
import { FileCode, Table2, TableProperties, Network, Workflow, X } from 'lucide-vue-next';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useQueryStore } from '@/stores/queryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import MonacoEditor from '@/components/editor/MonacoEditor.vue';
import TableDataViewer from '@/components/editor/TableDataViewer.vue';
import TableStructureViewer from '@/components/editor/TableStructureViewer.vue';
import ExecutionPlanViewer from '@/components/editor/ExecutionPlanViewer.vue';
import ErDiagramViewer from '@/components/editor/ErDiagramViewer.vue';
import DangerousQueryModal from '@/components/modals/DangerousQueryModal.vue';
import { saveSqlToFile, openSqlFromFile } from '@/utils/fileStorage';
import { sqlFolderService } from '@/services/sqlFolderService';
import { getTabThemeStyle } from '@/utils/tabTheme';
import { detectDangerousSqlStatements } from '@/utils/sqlGuard';
import { dispatchClearGridSelection } from '@/utils/tabulatorGrid';
import { cancelFlip, captureFlipRects, playFlip } from '@/composables/useFlip';
import type { SqlEditorToolbarAction } from '@/types/editor';
import type { SqlEditorTab, TableDataTab, TableStructureTab, ExecutionPlanTab, ErDiagramTab, WorkspaceTab } from '@/types/workspace';

const { t } = useI18n();
const workspaceStore = useWorkspaceStore();
const connectionStore = useConnectionStore();
const queryStore = useQueryStore();
const settingsStore = useSettingsStore();

const monacoRef = ref<InstanceType<typeof MonacoEditor> | null>(null);

// ========================
// Tab Reorder (Pointer Events)
// ========================
const queryTabsBarRef = ref<HTMLDivElement | null>(null);
const dragSourceIndex = ref<number | null>(null);
const dropHoverIndex = ref<number | null>(null);
const isPointerDragging = ref<boolean>(false);

let startPointerX = 0;
let hasMovedBeyondThreshold = false;
// A drag ends with a click event; that one click must not also activate the tab it landed on.
let suppressClick = false;

function onTabPointerDown(e: PointerEvent, index: number) {
  if (e.button !== 0) return;

  const target = e.target as HTMLElement | null;
  if (target?.closest('button') || target?.closest('input')) {
    return;
  }

  suppressClick = false;
  // A previous reorder may still be settling; take over from the laid-out position.
  cancelFlip(queryTabsBarRef.value, '.query-tab-item');
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

  if (!queryTabsBarRef.value) return;
  const tabElements = queryTabsBarRef.value.querySelectorAll('.query-tab-item');
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

  const before = captureFlipRects(queryTabsBarRef.value, '.query-tab-item');
  workspaceStore.reorderTabs(from, to);
  await nextTick();
  playFlip(before, queryTabsBarRef.value, '.query-tab-item', 'x');
}

function handleTabClick(tabId: string) {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (hasMovedBeyondThreshold || isPointerDragging.value) {
    return;
  }
  workspaceStore.setActiveTab(tabId);
  if (workspaceStore.activeTab?.type === 'sql_editor') {
    dispatchClearGridSelection();
  }
}

function getTabConnectionColor(tab: WorkspaceTab): string | undefined {
  const connId = tab.connectionId || (workspaceStore.activeTabId === tab.id ? connectionStore.activeConnectionId : null);
  if (!connId) return undefined;
  const conn = connectionStore.getConnectionById(connId) || connectionStore.connections.find((c) => c.id === connId);
  return conn?.color || undefined;
}

function getTabConnectionAlias(tab: WorkspaceTab): string | undefined {
  const connId = tab.connectionId || (workspaceStore.activeTabId === tab.id ? connectionStore.activeConnectionId : null);
  if (!connId) return undefined;
  const conn = connectionStore.getConnectionById(connId) || connectionStore.connections.find((c) => c.id === connId);
  return conn?.alias?.trim() || undefined;
}

function getTabTitleStyle(tab: WorkspaceTab): Record<string, string> {
  const color = getTabConnectionColor(tab);
  const style: Record<string, string> = {};
  if (color) {
    style.color = color;
  }
  // Only the tab in use is emphasised; inactive tab labels keep the regular weight.
  if (workspaceStore.activeTabId === tab.id) {
    style.fontWeight = '600';
  }
  return style;
}

function getTabItemStyle(tab: WorkspaceTab, idx: number) {
  const isActive = workspaceStore.activeTabId === tab.id;
  const isDropHover = dropHoverIndex.value === idx && isPointerDragging.value && dropHoverIndex.value !== dragSourceIndex.value;
  const isDragOver = dragOverTabId.value === tab.id;

  if (isDropHover || isDragOver) {
    return {
      borderTopWidth: '1px',
    };
  }

  const baseStyle = getTabThemeStyle(
    tab.type,
    isActive,
    settingsStore.colorMode === 'light'
  );

  const connColor = getTabConnectionColor(tab);
  const accentColor = connColor || (tab.type === 'sql_editor' ? 'var(--p-primary-color, #3b82f6)' : (baseStyle['--tab-top-accent'] || 'var(--p-primary-color, #3b82f6)'));
  baseStyle['--tab-top-accent'] = accentColor;

  if (isActive) {
    baseStyle['--tab-border'] = 'rgb(var(--color-dark-700))';
  }

  return baseStyle;
}

// ========================
// Inline Tab Renaming
// ========================
const editingTabId = ref<string | null>(null);
const editingTabTitle = ref<string>('');
const renameInputRef = ref<HTMLInputElement | null>(null);

function startRenameTab(tab: WorkspaceTab) {
  editingTabId.value = tab.id;
  editingTabTitle.value = tab.title;
  nextTick(() => {
    renameInputRef.value?.focus();
    renameInputRef.value?.select();
  });
}

async function saveRenameTab(tabId: string) {
  if (!editingTabId.value || editingTabId.value !== tabId) return;
  const trimmed = editingTabTitle.value.trim();
  editingTabId.value = null;
  editingTabTitle.value = '';
  if (trimmed) {
    await workspaceStore.renameTab(tabId, trimmed);
  }
}

function cancelRenameTab() {
  editingTabId.value = null;
  editingTabTitle.value = '';
}

// ========================
// Context Menu
// ========================
const tabContextMenuRef = ref();
const tabContextMenu = reactive<{
  tab: WorkspaceTab | null;
}>({
  tab: null,
});

const tabContextMenuItems = computed(() => {
  const tab = tabContextMenu.tab;
  if (!tab) return [];
  const items: any[] = [
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
  ];

  if (tab.type === 'sql_editor') {
    items.push({
      label: t('editor.duplicateTab'),
      icon: 'pi pi-copy',
      command: handleContextMenuDuplicate,
    });
    items.push({
      label: t('editor.saveAs'),
      icon: 'pi pi-save',
      command: handleContextMenuSaveAs,
    });
  }

  items.push({
    label: t('editor.closeTab'),
    icon: 'pi pi-times',
    command: handleContextMenuClose,
  });

  items.push({
    label: t('editor.closeOthers'),
    icon: 'pi pi-clone',
    disabled: workspaceStore.tabs.length <= 1,
    command: handleContextMenuCloseOthers,
  });

  return items;
});

function openTabContextMenu(e: MouseEvent, tab: WorkspaceTab) {
  tabContextMenu.tab = tab;
  tabContextMenuRef.value?.show(e);
}

function handleContextMenuRename() {
  const tab = tabContextMenu.tab;
  if (tab) {
    startRenameTab(tab);
  }
}

function handleContextMenuDuplicate() {
  const tab = tabContextMenu.tab;
  if (tab && tab.type === 'sql_editor') {
    workspaceStore.duplicateSqlTab(tab.id);
  }
}

function handleContextMenuSaveAs() {
  const tab = tabContextMenu.tab;
  if (tab) {
    saveActiveTab(tab);
  }
}

function handleContextMenuClose() {
  const tab = tabContextMenu.tab;
  if (tab) {
    workspaceStore.closeTab(tab.id);
  }
}

function handleContextMenuCloseOthers() {
  const tab = tabContextMenu.tab;
  if (tab) {
    workspaceStore.closeOtherTabs(tab.id);
  }
}

// ========================
// Tooltips & File I/O
// ========================
function getTabTooltip(tab: WorkspaceTab): string {
  const conn = connectionStore.connections.find((c) => c.id === tab.connectionId);
  const connName = conn?.name || (tab.connectionId ? 'Unknown Connection' : '未指定連線');
  const aliasPart = conn?.alias ? ` (別名: ${conn.alias})` : '';
  const dbName = tab.database || 'master';
  return `${tab.title}\n連線: ${connName}${aliasPart}\n資料庫: ${dbName}\n(雙擊或右鍵重新命名此分頁)`;
}

async function saveActiveTab(tabToSave?: WorkspaceTab) {
  const targetTab = tabToSave || workspaceStore.activeTab;
  if (!targetTab || targetTab.type !== 'sql_editor') return;

  const sqlTab = targetTab as SqlEditorTab;
  try {
    // If the tab is associated with a monitored local SQL file, save in-place without prompting
    if (sqlTab.filePath) {
      await sqlFolderService.writeFile(sqlTab.filePath, sqlTab.query);
      workspaceStore.markTabSaved(sqlTab.id);
      workspaceStore.showToast(`已儲存：${sqlTab.title}`, 'success', 2000);
      return;
    }

    const defaultName = sqlTab.title.endsWith('.sql') ? sqlTab.title : `${sqlTab.title}.sql`;
    const result = await saveSqlToFile(sqlTab.query, defaultName);
    if (result.saved && result.fileName) {
      workspaceStore.markTabSaved(sqlTab.id, result.fileName);
      workspaceStore.showToast(`已儲存至檔案：${result.fileName}`, 'success', 2500);
    }
  } catch (err) {
    console.error('Save SQL failed:', err);
    workspaceStore.showToast('儲存檔案失敗', 'error', 3000);
  }
}

async function openSqlFile() {
  try {
    const result = await openSqlFromFile();
    if (result.opened) {
      const fileName = result.fileName || 'Opened.sql';
      if (result.fileType === 'er_diagram' && result.erData) {
        const title = fileName.replace(/\.(puffsql-er|sqlight-er|x6)?\.json$/i, '') || 'ER Diagram';
        workspaceStore.addErDiagramTab({
          title,
          initialData: result.erData,
          fileName,
        });
        workspaceStore.showToast(`已開啟 ER 關聯模型：${fileName}`, 'success', 2500);
      } else if (result.content !== undefined) {
        workspaceStore.addSqlTab(
          result.content,
          fileName,
          connectionStore.activeConnectionId || undefined,
          connectionStore.activeDatabase || 'master'
        );
        if (workspaceStore.activeTab) {
          workspaceStore.activeTab.isDirty = false;
        }
        workspaceStore.showToast(`已開啟 SQL 檔案：${fileName}`, 'success', 2500);
      }
    }
  } catch (err) {
    console.error('Open file failed:', err);
    workspaceStore.showToast('開啟檔案失敗', 'error', 3000);
  }
}

// ========================
// Wheel & Query Execution
// ========================
function handleTabsWheel(e: WheelEvent) {
  const container = e.currentTarget as HTMLElement;
  if (!container) return;
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault();
    container.scrollLeft += e.deltaY;
  }
}

function formatCode() {
  if (monacoRef.value) {
    monacoRef.value.formatCode();
  } else if (workspaceStore.activeTab?.type === 'sql_editor') {
    workspaceStore.formatActiveQuery();
  }
}

function runEditorAction(action: SqlEditorToolbarAction) {
  if (workspaceStore.activeTab?.type !== 'sql_editor') return;
  monacoRef.value?.runEditorAction(action);
}

// ========================
// Dangerous Query Double-Confirmation Safe Guard
// ========================
const dangerousModalState = reactive<{
  isOpen: boolean;
  step: 1 | 2;
  connectionName: string;
  databaseName: string;
  detectedKeywords: string[];
  sql: string;
  pendingExecute: (() => Promise<void>) | null;
}>({
  isOpen: false,
  step: 1,
  connectionName: '',
  databaseName: '',
  detectedKeywords: [],
  sql: '',
  pendingExecute: null,
});

function handleDangerousModalProceed() {
  if (dangerousModalState.step === 1) {
    dangerousModalState.step = 2;
  } else {
    dangerousModalState.isOpen = false;
    const fn = dangerousModalState.pendingExecute;
    dangerousModalState.pendingExecute = null;
    if (fn) {
      fn();
    }
  }
}

function handleDangerousModalCancel() {
  dangerousModalState.isOpen = false;
  dangerousModalState.pendingExecute = null;
  workspaceStore.showToast('已取消執行危險指令', 'info', 2500);
}

async function executeSql(connId: string, db: string, targetSql: string) {
  const result = await queryStore.execute(connId, db, targetSql);

  // Auto-switch to Results or Messages (if query has no data or error, show Messages like SSMS)
  const totalRows = result?.resultSets?.reduce((sum, rs) => sum + (rs.rowCount ?? rs.rows?.length ?? 0), 0) ?? 0;
  if (!result || result.messages.some((m) => m.level === 'error') || result.resultSets.length === 0 || totalRows === 0) {
    workspaceStore.setBottomPanelTab('messages');
  } else {
    workspaceStore.setBottomPanelTab('results');
  }
}

async function runQuery(mode: 'current' | 'all' = 'current', queryOverride?: string) {
  let targetSql = queryOverride;
  if (!targetSql && monacoRef.value) {
    targetSql = monacoRef.value.getExecutableQuery(mode);
  }
  if (!targetSql && workspaceStore.activeTab?.type === 'sql_editor') {
    targetSql = (workspaceStore.activeTab as SqlEditorTab).query;
  }

  if (!targetSql || !targetSql.trim()) return;

  // Tab clicks debounce the connection sync, so flush it here: a statement must run
  // against the connection its own tab belongs to, not the one we were just on.
  await workspaceStore.ensureActiveTabConnection();

  const connId = connectionStore.activeConnectionId || 'default';
  const db = connectionStore.activeDatabase || 'master';

  const tabConnId = workspaceStore.activeTab?.connectionId;
  if (tabConnId && connectionStore.activeConnectionId !== tabConnId) {
    const targetName = connectionStore.getConnectionById(tabConnId)?.name ?? '目標連線';
    const currentName = connectionStore.activeConnection?.name ?? '目前連線';
    workspaceStore.showToast(
      `無法切換至「${targetName}」，已取消執行以免誤用「${currentName}」`,
      'error',
      4000
    );
    return;
  }

  // Check safety guard if modificationPrompt is enabled on active connection
  const activeConn = connectionStore.getConnectionById(connId) || connectionStore.activeConnection;
  if (activeConn?.modificationPrompt) {
    const check = detectDangerousSqlStatements(targetSql);
    if (check.isDangerous) {
      dangerousModalState.connectionName = activeConn.name;
      dangerousModalState.databaseName = db;
      dangerousModalState.detectedKeywords = check.detectedKeywords;
      dangerousModalState.sql = targetSql;
      dangerousModalState.step = 1;
      dangerousModalState.pendingExecute = () => executeSql(connId, db, targetSql);
      dangerousModalState.isOpen = true;
      return;
    }
  }

  await executeSql(connId, db, targetSql);
}

function insertTextAtCursor(text: string, title?: string) {
  if (monacoRef.value && workspaceStore.activeTab?.type === 'sql_editor') {
    monacoRef.value.insertTextAtCursor(text);
    workspaceStore.showToast(`已插入「${title || 'SQL 範本'}」至目前編輯點`, 'success', 2200);
  } else {
    workspaceStore.addSqlTab(text, title ? `${title}.sql` : undefined);
    workspaceStore.showToast(`已在新分頁開啟「${title || 'SQL 範本'}」`, 'info', 2200);
  }
}

function getTableNameAtCursor() {
  if (workspaceStore.activeTab?.type !== 'sql_editor') {
    return null;
  }
  return monacoRef.value?.getTableNameAtCursor() ?? null;
}

function scrollToStart() {
  if (queryTabsBarRef.value) {
    queryTabsBarRef.value.scrollLeft = 0;
  }
}

function scrollToEnd() {
  if (queryTabsBarRef.value) {
    queryTabsBarRef.value.scrollLeft = queryTabsBarRef.value.scrollWidth;
  }
}

function focusEditor(line?: number, col?: number) {
  nextTick(() => {
    monacoRef.value?.focus(line, col);
  });
}

function triggerSuggest() {
  nextTick(() => {
    monacoRef.value?.triggerSuggest();
  });
}

function getSelectedOrFullQuery(): { sql: string; isSelection: boolean } {
  if (monacoRef.value && workspaceStore.activeTab?.type === 'sql_editor') {
    return monacoRef.value.getSelectedOrFullQuery();
  }
  if (workspaceStore.activeTab?.type === 'sql_editor') {
    const sql = (workspaceStore.activeTab as SqlEditorTab).query || '';
    return { sql, isSelection: false };
  }
  return { sql: '', isSelection: false };
}

function handleAddNewTab() {
  workspaceStore.addSqlTab();
  nextTick(() => {
    scrollToEnd();
    focusEditor(1, 1);
  });
}

// ========================
// Drag & Drop Tables from Explorer onto Tabs / Tab Bar
// ========================
const isBarDragOver = ref(false);
const dragOverTabId = ref<string | null>(null);
let tabHoverSwitchTimer: ReturnType<typeof setTimeout> | null = null;

function isTableDragEvent(e: DragEvent): boolean {
  if (!e.dataTransfer) return false;
  const types = e.dataTransfer.types;
  if (!types) return false;
  const typeArray = Array.from(types);
  return (
    typeArray.includes('application/sqlight-table') ||
    (types as any).contains?.('application/sqlight-table') ||
    typeArray.includes('text/plain')
  );
}

function handleBarDragOver(e: DragEvent) {
  if (isTableDragEvent(e)) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    isBarDragOver.value = true;
  }
}

function handleBarDragLeave(e: DragEvent) {
  const currentTarget = e.currentTarget as HTMLElement | null;
  const relatedTarget = e.relatedTarget as HTMLElement | null;
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
    return;
  }
  isBarDragOver.value = false;
}

function handleBarDrop(e: DragEvent) {
  isBarDragOver.value = false;
  if (!isTableDragEvent(e)) return;
  e.preventDefault();

  const raw = e.dataTransfer?.getData('application/sqlight-table');
  let tableInfo: { connId?: string; db?: string; schema?: string; table?: string; sql?: string } | null = null;
  if (raw) {
    try {
      tableInfo = JSON.parse(raw);
    } catch {
      tableInfo = null;
    }
  }

  const plainText = e.dataTransfer?.getData('text/plain') || '';
  const tableName = tableInfo?.table || 'Query';
  const dbPrefix = tableInfo?.db ? `[${tableInfo.db}].` : '';
  const sql = tableInfo?.sql || (tableInfo?.schema && tableInfo?.table
    ? `SELECT TOP 1000\n  *\nFROM ${dbPrefix}[${tableInfo.schema}].[${tableInfo.table}];\n`
    : plainText || 'SELECT TOP 1000 * FROM sys.tables;\n');

  try {
    workspaceStore.addSqlTab(
      sql,
      `${tableName}.sql`,
      tableInfo?.connId,
      tableInfo?.db
    );
    workspaceStore.showToast(`已開啟 ${tableName} 查詢分頁`, 'success', 2000);
  } catch (err) {
    console.error('Failed to parse dropped table on bar:', err);
  }
}

function handleTabItemDragOver(e: DragEvent, tab: WorkspaceTab) {
  if (!isTableDragEvent(e)) return;
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
  }

  if (dragOverTabId.value !== tab.id) {
    dragOverTabId.value = tab.id;
    if (tabHoverSwitchTimer) {
      clearTimeout(tabHoverSwitchTimer);
      tabHoverSwitchTimer = null;
    }
    if (workspaceStore.activeTabId !== tab.id) {
      tabHoverSwitchTimer = setTimeout(() => {
        workspaceStore.setActiveTab(tab.id);
      }, 350);
    }
  }
}

function handleTabItemDragLeave(e: DragEvent, tab: WorkspaceTab) {
  const currentTarget = e.currentTarget as HTMLElement | null;
  const relatedTarget = e.relatedTarget as HTMLElement | null;
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
    return;
  }
  if (dragOverTabId.value === tab.id) {
    dragOverTabId.value = null;
  }
  if (tabHoverSwitchTimer) {
    clearTimeout(tabHoverSwitchTimer);
    tabHoverSwitchTimer = null;
  }
}

async function handleTabItemDrop(e: DragEvent, tab: WorkspaceTab) {
  if (tabHoverSwitchTimer) {
    clearTimeout(tabHoverSwitchTimer);
    tabHoverSwitchTimer = null;
  }
  dragOverTabId.value = null;

  if (!isTableDragEvent(e)) return;
  e.preventDefault();

  const raw = e.dataTransfer?.getData('application/sqlight-table');
  let tableInfo: { connId?: string; db?: string; schema?: string; table?: string; sql?: string } | null = null;
  if (raw) {
    try {
      tableInfo = JSON.parse(raw);
    } catch {
      tableInfo = null;
    }
  }

  const plainText = e.dataTransfer?.getData('text/plain') || '';
  const tableName = tableInfo?.table || 'Query';
  const dbPrefix = tableInfo?.db ? `[${tableInfo.db}].` : '';
  const sql = tableInfo?.sql || (tableInfo?.schema && tableInfo?.table
    ? `SELECT TOP 1000\n  *\nFROM ${dbPrefix}[${tableInfo.schema}].[${tableInfo.table}];\n`
    : plainText || 'SELECT TOP 1000 * FROM sys.tables;\n');

  try {
    if (tab.type === 'er_diagram') {
      workspaceStore.setActiveTab(tab.id);
      if (tableInfo?.schema && tableInfo?.table) {
        nextTick(() => {
          window.dispatchEvent(
            new CustomEvent('sqlight:add-table-to-er', {
              detail: {
                schema: tableInfo!.schema,
                table: tableInfo!.table,
                connId: tableInfo!.connId,
                database: tableInfo!.db,
              },
            })
          );
        });
        workspaceStore.showToast(`已將 ${tableInfo.schema}.${tableInfo.table} 加入至 ER 圖`, 'success', 2000);
      }
    } else if (tab.type === 'sql_editor') {
      workspaceStore.setActiveTab(tab.id);
      const sqlTab = tab as SqlEditorTab;
      if (!sqlTab.query.trim()) {
        sqlTab.query = sql;
      } else {
        const prefix = sqlTab.query.endsWith('\n') ? '\n' : '\n\n';
        sqlTab.query += prefix + sql;
      }
      workspaceStore.showToast(`已將 ${tableName} 查詢語法加入至分頁`, 'success', 2000);
    } else {
      workspaceStore.addSqlTab(
        sql,
        `${tableName}.sql`,
        tableInfo?.connId,
        tableInfo?.db
      );
      workspaceStore.showToast(`已開啟 ${tableName} 查詢分頁`, 'success', 2000);
    }
  } catch (err) {
    console.error('Failed to parse dropped table:', err);
  }
}

watch(
  () => workspaceStore.activeTabId,
  (newId) => {
    const tabs = workspaceStore.tabs;
    if (tabs.length > 0 && tabs[tabs.length - 1]?.id === newId) {
      nextTick(() => {
        scrollToEnd();
      });
    } else if (tabs[0]?.id === newId) {
      nextTick(() => {
        scrollToStart();
      });
    }
    if (workspaceStore.activeTab?.type === 'sql_editor') {
      nextTick(() => {
        focusEditor();
      });
    }
  }
);

onBeforeUnmount(() => {
  if (tabHoverSwitchTimer) {
    clearTimeout(tabHoverSwitchTimer);
    tabHoverSwitchTimer = null;
  }
  window.removeEventListener('pointermove', onDocumentPointerMove);
  window.removeEventListener('pointerup', onDocumentPointerUp);
  window.removeEventListener('pointercancel', onDocumentPointerUp);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

defineExpose({
  runQuery,
  formatCode,
  runEditorAction,
  saveActiveTab,
  openSqlFile,
  insertTextAtCursor,
  getTableNameAtCursor,
  getSelectedOrFullQuery,
  scrollToStart,
  scrollToEnd,
  focusEditor,
  triggerSuggest,
});
</script>

<style scoped>
.query-tab-item {
  position: relative;
  background-color: var(--tab-bg);
  border-top-width: 1px;
  border-left-width: 1px;
  border-right-width: 1px;
  border-bottom-width: 1px;
  border-top-color: var(--tab-border);
  border-left-color: var(--tab-border);
  border-right-color: var(--tab-border);
  border-bottom-color: transparent;
  color: var(--tab-text);
  border-radius: 0;
  transition: all 0.15s ease;
}

.query-tab-item + .query-tab-item {
  margin-left: -1px;
}

.query-tab-item:hover {
  background-color: var(--tab-hover-bg);
  border-top-color: var(--tab-hover-border);
  border-left-color: var(--tab-hover-border);
  border-right-color: var(--tab-hover-border);
  color: var(--tab-hover-text);
}

.query-tab-item.active-tab {
  height: 29px !important;
  background-color: var(--tab-active-surface, rgb(var(--color-dark-900))) !important;
  color: var(--tab-active-text, rgb(var(--color-dark-100))) !important;
  border-top-color: var(--tab-top-accent) !important;
  border-left-color: var(--tab-top-accent) !important;
  border-right-color: var(--tab-top-accent) !important;
  border-bottom-color: var(--tab-active-surface, rgb(var(--color-dark-900))) !important;
  margin-bottom: -1px;
  z-index: 10;
  box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.08);
}

/* 頂部高光指示條 (Top Accent Indicator) */
.query-tab-item.active-tab::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background-color: var(--tab-top-accent, var(--p-primary-color, #3b82f6));
  z-index: 2;
}

.query-tabs-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.query-tabs-scroll::-webkit-scrollbar {
  height: 4px;
  width: 0px;
}

.query-tabs-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.query-tabs-scroll::-webkit-scrollbar-thumb {
  background: rgb(var(--color-dark-600));
  border-radius: 2px;
}

.query-tabs-scroll::-webkit-scrollbar-thumb:hover {
  background: rgb(var(--color-dark-500));
}

.workspace-tab-bar {
    padding-top: 6px;
    border-bottom: 1px solid rgb(var(--color-dark-600) / var(--tw-text-opacity, 1));
}
</style>
