<template>
  <div class="w-full h-full flex flex-col bg-dark-900 text-dark-100 overflow-hidden font-sans">
    <!-- Top Toolbar Header -->
    <AppHeader
      @open-sql-file="handleOpenSqlFile"
      @save-sql-file="handleSaveSqlFile"
      @open-connection-modal="handleOpenNewConnection"
      @open-settings-modal="isSettingsModalOpen = true"
      @open-quick-finder="isQuickFinderOpen = true"
      @open-sql-templates="isSqlTemplatesOpen = true"
      @open-ai-chat="handleOpenAiChat"
    />


    <!-- Center Resizable Body (Sidebar + Workspace/Results) -->
    <div class="flex-1 flex overflow-hidden relative">
      <!-- Left Resizable Sidebar -->
      <div
        v-if="workspaceStore.isSidebarOpen"
        :style="{ width: `${sidebarSplitter.size.value}px` }"
        class="h-full flex-shrink-0 overflow-hidden"
      >
        <AppSidebar
          ref="sidebarRef"
          @open-connection-modal="handleOpenNewConnection"
          @edit-connection="handleEditConnection"
          @duplicate-connection="handleDuplicateConnection"
          @request-locate-table="handleLocateTableRequest"
        />
      </div>

      <!-- Horizontal Splitter Handle (Resize Sidebar Width) -->
      <ResizableSplitter
        v-if="workspaceStore.isSidebarOpen"
        direction="horizontal"
        :is-dragging="sidebarSplitter.isDragging.value"
        @pointerdown="sidebarSplitter.onPointerDown"
        @dragover.prevent
      />

      <!-- Right Area: Main Editor & Bottom Results Panel -->
      <div class="flex-1 flex flex-col overflow-hidden min-w-0">
        <!-- Main SQL Workspace Area -->
        <div class="flex-1 overflow-hidden min-h-0">
          <AppMain ref="mainWorkspaceRef" />
        </div>

        <!-- Vertical Splitter & Bottom Results Dock -->
        <template v-if="workspaceStore.isBottomPanelOpen && workspaceStore.activeTab?.type !== 'er_diagram'">
          <ResizableSplitter
            direction="vertical"
            :is-dragging="bottomSplitter.isDragging.value"
            @pointerdown="bottomSplitter.onPointerDown"
            @dblclick="toggleMaximizeBottomPanel"
          />

          <div
            :style="{ height: `${bottomSplitter.size.value}px` }"
            class="w-full flex-shrink-0 overflow-hidden"
          >
            <AppBottomPanel />
          </div>
        </template>
      </div>
    </div>

    <!-- Bottom Status Bar -->
    <AppStatusBar />

    <!-- Connection Management Modal -->
    <ConnectionModal
      :is-open="isConnectionModalOpen"
      :edit-profile="editingProfile"
      :initial-profile="initialConnectionProfile"
      @close="handleCloseConnectionModal"
    />

    <!-- Settings Management Modal -->
    <SettingsModal
      :is-open="isSettingsModalOpen"
      @close="isSettingsModalOpen = false"
    />

    <!-- Quick Object Finder (Spotlight Ctrl+P) -->
    <QuickObjectFinderModal
      :is-open="isQuickFinderOpen"
      @close="isQuickFinderOpen = false"
    />

    <!-- Common SQL Templates Modal (常用 SQL 範本庫與同層自訂文件) -->
    <SqlTemplateModal
      :is-open="isSqlTemplatesOpen"
      @close="isSqlTemplatesOpen = false"
      @insert="handleInsertTemplate"
      @open-in-new-tab="handleOpenTemplateInNewTab"
    />

    <!-- AI SQL Assistant Chat Modal -->
    <AiSqlChatModal />

    <!-- AI Floating Progress Pill (縮小化浮動膠囊) -->
    <AiFloatingPill />

    <!-- 資料檢視 (Data View Dialog & Minimized Floating Pill) -->
    <DataViewModal />
    <DataViewFloatingPill />

    <!-- TSV 匯入精靈 (Explorer 資料表右鍵) -->
    <TsvImportModal />

    <!-- Global Toast Notification -->
    <SqToast />
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue';
import AppHeader from '@/components/layout/AppHeader.vue';
import AppSidebar from '@/components/layout/AppSidebar.vue';
import AppMain from '@/components/layout/AppMain.vue';
import AppBottomPanel from '@/components/layout/AppBottomPanel.vue';
import AppStatusBar from '@/components/layout/AppStatusBar.vue';
import ResizableSplitter from '@/components/common/ResizableSplitter.vue';
import ConnectionModal from '@/components/modals/ConnectionModal.vue';
import SettingsModal from '@/components/modals/SettingsModal.vue';
import QuickObjectFinderModal from '@/components/modals/QuickObjectFinderModal.vue';
import SqlTemplateModal from '@/components/modals/SqlTemplateModal.vue';
import AiSqlChatModal from '@/components/modals/AiSqlChatModal.vue';
import AiFloatingPill from '@/components/ai/AiFloatingPill.vue';
import DataViewModal from '@/components/modals/DataViewModal.vue';
import DataViewFloatingPill from '@/components/modals/DataViewFloatingPill.vue';
import TsvImportModal from '@/components/modals/TsvImportModal.vue';
import SqToast from '@/components/ui/SqToast.vue';
import { useSplitter } from '@/composables/useSplitter';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useQueryStore } from '@/stores/queryStore';
import type { QueryRunMode } from '@/types/editor';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAiChatStore } from '@/stores/aiChatStore';
import { themeManager } from '@/services/themeManager';
import type { ConnectionProfile } from '@/types/connection';
import type { SqlTemplate } from '@/types/sqlTemplate';

const workspaceStore = useWorkspaceStore();
const queryStore = useQueryStore();
const settingsStore = useSettingsStore();
const aiChatStore = useAiChatStore();

function handleOpenAiChat(sqlOverride?: string, isSelection = false) {
  let targetSql = sqlOverride || '';
  let isSel = isSelection;

  if (!targetSql && mainWorkspaceRef.value) {
    const info = mainWorkspaceRef.value.getSelectedOrFullQuery();
    targetSql = info.sql;
    isSel = info.isSelection;
  }

  aiChatStore.openChat(targetSql, isSel);
}

const isConnectionModalOpen = ref(false);
const isSettingsModalOpen = ref(false);
const isQuickFinderOpen = ref(false);
const isSqlTemplatesOpen = ref(false);
const editingProfile = ref<ConnectionProfile | null>(null);
const initialConnectionProfile = ref<ConnectionProfile | null>(null);
const mainWorkspaceRef = ref<InstanceType<typeof AppMain> | null>(null);
const sidebarRef = ref<InstanceType<typeof AppSidebar> | null>(null);

async function handleLocateTableRequest() {
  if (!workspaceStore.isSidebarOpen) {
    workspaceStore.toggleSidebar();
  }

  const target = mainWorkspaceRef.value?.getTableNameAtCursor();
  if (!target || !target.table) {
    workspaceStore.showToast(
      '游標處未偵測到資料表名稱，請將游標移至資料表或反白選取名稱',
      'info',
      2500
    );
    return;
  }

  if (sidebarRef.value) {
    await sidebarRef.value.locateTable(target);
  }
}

function handleInsertTemplate(template: SqlTemplate) {
  isSqlTemplatesOpen.value = false;
  mainWorkspaceRef.value?.insertTextAtCursor(template.code, template.title);
}

function handleOpenTemplateInNewTab(template: SqlTemplate) {
  isSqlTemplatesOpen.value = false;
  workspaceStore.addSqlTab(template.code, `${template.title}.sql`);
  workspaceStore.showToast(`已在新分頁開啟「${template.title}」`, 'info', 2200);
}


function handleOpenNewConnection() {
  editingProfile.value = null;
  initialConnectionProfile.value = null;
  isConnectionModalOpen.value = true;
}

function handleEditConnection(profile: ConnectionProfile) {
  editingProfile.value = profile;
  initialConnectionProfile.value = null;
  isConnectionModalOpen.value = true;
}

function handleDuplicateConnection(profile: ConnectionProfile) {
  editingProfile.value = null;
  initialConnectionProfile.value = profile;
  isConnectionModalOpen.value = true;
}

function handleCloseConnectionModal() {
  isConnectionModalOpen.value = false;
  editingProfile.value = null;
  initialConnectionProfile.value = null;
}

// Resizable sidebar (width: min 180px, max 500px, initial 260px)
const sidebarSplitter = useSplitter({
  direction: 'horizontal',
  initialSize: 260,
  minSize: 180,
  maxSize: 500,
});

// Resizable bottom dock (height: min 100px, dynamic max up to window height - 100px, initial 240px, reverse dragging)
const bottomSplitter = useSplitter({
  direction: 'vertical',
  initialSize: 240,
  minSize: 100,
  maxSize: () => Math.max(200, window.innerHeight - 100),
  reverse: true,
});

let preMaximizedBottomHeight = 240;

function toggleMaximizeBottomPanel() {
  const maxH = Math.max(200, window.innerHeight - 100);
  if (bottomSplitter.size.value >= maxH - 40) {
    // Already maximized, restore to previous size or default 240px
    bottomSplitter.size.value = Math.max(100, preMaximizedBottomHeight || 240);
  } else {
    // Save current size and maximize
    preMaximizedBottomHeight = bottomSplitter.size.value;
    bottomSplitter.size.value = maxH;
  }
}

function handleRunQuery(mode: QueryRunMode = 'current') {
  mainWorkspaceRef.value?.runQuery(mode);
}

function handleCancelQuery() {
  queryStore.cancelQuery();
}

function handleFormatSql() {
  if (mainWorkspaceRef.value) {
    mainWorkspaceRef.value.formatCode();
  } else {
    workspaceStore.formatActiveQuery();
  }
}

function handleOpenSqlFile() {
  mainWorkspaceRef.value?.openSqlFile();
}

function handleSaveSqlFile() {
  mainWorkspaceRef.value?.saveActiveTab();
}

function handleGlobalKeydown(e: KeyboardEvent) {
  // Alt + Break / Pause -> Cancel Running Query
  if (e.altKey && (e.key === 'Pause' || e.key === 'Cancel' || e.code === 'Pause')) {
    e.preventDefault();
    handleCancelQuery();
    return;
  }

  // Escape -> Cancel Query if executing and no modal is open
  if (e.key === 'Escape' && queryStore.isExecuting) {
    if (!isQuickFinderOpen.value && !isConnectionModalOpen.value && !isSettingsModalOpen.value) {
      e.preventDefault();
      handleCancelQuery();
      return;
    }
  }
  // Ctrl/Cmd + Shift + Enter -> Run All
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
    e.preventDefault();
    handleRunQuery('all');
    return;
  }

  // F5 -> the SSMS habit: run the selection if there is one, otherwise the whole script. Only while
  // a SQL editor tab is active, and only the bare key: everywhere else (and with any modifier) F5
  // keeps doing whatever the WebView does with it.
  if (e.key === 'F5' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
    if (workspaceStore.activeTab?.type === 'sql_editor') {
      e.preventDefault();
      handleRunQuery('selection-or-all');
    }
    return;
  }

  // Ctrl/Cmd + Enter -> Run Current Statement / Selected
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'Enter') {
    e.preventDefault();
    handleRunQuery('current');
    return;
  }

  // Ctrl/Cmd + S -> Save SQL File
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    handleSaveSqlFile();
    return;
  }

  // Ctrl/Cmd + O -> Open SQL File
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'o' || e.key === 'O')) {
    e.preventDefault();
    handleOpenSqlFile();
    return;
  }

  // Shift + Alt + F to format SQL
  if (e.shiftKey && e.altKey && (e.key === 'F' || e.key === 'f')) {
    e.preventDefault();
    handleFormatSql();
    return;
  }

  // Ctrl/Cmd + N -> Add New Query Tab
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault();
    handleNewQueryTab();
    return;
  }

  // Ctrl/Cmd + I -> Open AI Chat Assistant
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'i' || e.key === 'I')) {
    e.preventDefault();
    handleOpenAiChat();
    return;
  }

  // Ctrl/Cmd + P -> Quick Object Finder (Spotlight)
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault();
    isQuickFinderOpen.value = !isQuickFinderOpen.value;
    return;
  }

  // Ctrl/Cmd + Shift + A -> Manually trigger SQL Completion in active editor (and prevent browser Tab Search)
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
    e.preventDefault();
    mainWorkspaceRef.value?.focusEditor();
    mainWorkspaceRef.value?.triggerSuggest();
    return;
  }
}

function handleAiChatCustomEvent(e: Event) {
  const customEvt = e as CustomEvent<{ sql: string; isSelection: boolean }>;
  if (customEvt.detail) {
    handleOpenAiChat(customEvt.detail.sql, customEvt.detail.isSelection);
  } else {
    handleOpenAiChat();
  }
}

function handleNewQueryTab() {
  workspaceStore.addSqlTab();
  nextTick(() => {
    mainWorkspaceRef.value?.scrollToStart();
    mainWorkspaceRef.value?.focusEditor();
  });
}

function handleOpenQuickFinder() {
  isQuickFinderOpen.value = true;
}

function handleOpenSqlTemplates() {
  isSqlTemplatesOpen.value = true;
}

onMounted(() => {
  themeManager.initTheme(settingsStore);
  window.addEventListener('keydown', handleGlobalKeydown);
  window.addEventListener('sqlight:new-query-tab', handleNewQueryTab);
  window.addEventListener('sqlight:open-quick-finder', handleOpenQuickFinder);
  window.addEventListener('sqlight:open-sql-templates', handleOpenSqlTemplates);
  window.addEventListener('sqlight:locate-table-at-cursor', handleLocateTableRequest);
  window.addEventListener('sqlight:open-ai-chat', handleAiChatCustomEvent);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
  window.removeEventListener('sqlight:new-query-tab', handleNewQueryTab);
  window.removeEventListener('sqlight:open-quick-finder', handleOpenQuickFinder);
  window.removeEventListener('sqlight:open-sql-templates', handleOpenSqlTemplates);
  window.removeEventListener('sqlight:locate-table-at-cursor', handleLocateTableRequest);
  window.removeEventListener('sqlight:open-ai-chat', handleAiChatCustomEvent);
});
</script>
