import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { WorkspaceTab, BottomPanelTab, SqlEditorTab, TableDataTab, TableStructureTab, ExecutionPlanTab, ErDiagramTab } from '@/types/workspace';
import { format as formatSql } from 'sql-formatter';
import { useConnectionStore } from './connectionStore';
import { useSqlFolderStore } from './sqlFolderStore';
import { useToastStore } from './toastStore';
import { sqlFolderService } from '@/services/sqlFolderService';

/** What each caller-supplied severity is titled with above its own message. */
const TOAST_SUMMARIES: Record<'info' | 'success' | 'warning' | 'error', string> = {
  info: '提示',
  success: '成功',
  warning: '警告',
  error: '錯誤',
};

const STORAGE_TABS_KEY = 'sqlight_workspace_tabs';
const STORAGE_ACTIVE_TAB_KEY = 'sqlight_active_tab_id';
const STORAGE_SIDEBAR_KEY = 'sqlight_sidebar_open';

function loadSavedSidebarState(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_SIDEBAR_KEY);
    if (raw !== null) {
      return raw === 'true';
    }
  } catch (e) {
    console.warn('Failed to load sidebar open state:', e);
  }
  return true;
}

function saveSidebarStateToStorage(isOpen: boolean) {
  try {
    localStorage.setItem(STORAGE_SIDEBAR_KEY, String(isOpen));
  } catch (e) {
    console.warn('Failed to save sidebar state to storage:', e);
  }
}

const DEFAULT_INITIAL_TAB: SqlEditorTab = {
  id: 'tab-initial-sql-1',
  type: 'sql_editor',
  title: 'Query 1.sql',
  query: '',
  isDirty: false,
};

function loadSavedTabs(): WorkspaceTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_TABS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validTabs: WorkspaceTab[] = parsed.filter(
          (t: unknown): t is WorkspaceTab =>
            typeof t === 'object' &&
            t !== null &&
            'id' in t &&
            typeof (t as { id: unknown }).id === 'string' &&
            'type' in t &&
            ((t as { type: unknown }).type === 'sql_editor' ||
              (t as { type: unknown }).type === 'table_data' ||
              (t as { type: unknown }).type === 'table_structure' ||
              (t as { type: unknown }).type === 'execution_plan' ||
              (t as { type: unknown }).type === 'er_diagram')
        );
        if (validTabs.length > 0) {
          return validTabs;
        }
      }
    }
  } catch (e) {
    console.warn('Failed to parse saved workspace tabs:', e);
  }
  return [{ ...DEFAULT_INITIAL_TAB }];
}

function loadSavedActiveTabId(availableTabs: WorkspaceTab[]): string {
  try {
    const savedId = localStorage.getItem(STORAGE_ACTIVE_TAB_KEY);
    if (savedId && availableTabs.some((t) => t.id === savedId)) {
      return savedId;
    }
  } catch (e) {
    console.warn('Failed to load active tab id:', e);
  }
  return availableTabs[0]?.id ?? DEFAULT_INITIAL_TAB.id;
}

function saveTabsToStorage(tabList: WorkspaceTab[]) {
  try {
    localStorage.setItem(STORAGE_TABS_KEY, JSON.stringify(tabList));
  } catch (e) {
    console.warn('Failed to save workspace tabs to storage:', e);
  }
}

function saveActiveTabIdToStorage(id: string) {
  try {
    localStorage.setItem(STORAGE_ACTIVE_TAB_KEY, id);
  } catch (e) {
    console.warn('Failed to save active tab id to storage:', e);
  }
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const initialTabs = loadSavedTabs();
  const tabs = ref<WorkspaceTab[]>(initialTabs);
  const activeTabId = ref<string>(loadSavedActiveTabId(initialTabs));
  const bottomPanelTab = ref<BottomPanelTab>('results');
  const isBottomPanelOpen = ref<boolean>(true);
  const isSidebarOpen = ref<boolean>(loadSavedSidebarState());
  const pendingColumnToInsert = ref<string | null>(null);
  const toastStore = useToastStore();

  // Watchers to auto-persist changes
  watch(
    tabs,
    (newTabs) => {
      saveTabsToStorage(newTabs);
    },
    { deep: true }
  );

  watch(activeTabId, (newId) => {
    saveActiveTabIdToStorage(newId);
  });

  watch(isSidebarOpen, (isOpen) => {
    saveSidebarStateToStorage(isOpen);
  });

  const activeTab = computed(() => {
    return tabs.value.find((t) => t.id === activeTabId.value) ?? tabs.value[0] ?? null;
  });

  async function syncTabConnectionAndDatabase(tab: WorkspaceTab) {
    const connectionStore = useConnectionStore();

    // If tab has no connection recorded, bind current active connection and db
    if (!tab.connectionId) {
      if (connectionStore.activeConnectionId) {
        tab.connectionId = connectionStore.activeConnectionId;
        tab.database = connectionStore.activeDatabase || 'master';
      }
      return;
    }

    // 1. Connection differs: switch connection and db
    if (tab.connectionId !== connectionStore.activeConnectionId) {
      const exists = connectionStore.connections.some((c) => c.id === tab.connectionId);
      if (exists) {
        try {
          await connectionStore.connect(tab.connectionId, tab.database);
        } catch (err) {
          console.warn(`[WorkspaceStore] Auto-switching connection to '${tab.connectionId}' failed:`, err);
        }
      }
    } else if (tab.database && tab.database !== connectionStore.activeDatabase) {
      // 2. Same connection, but different database: switch database
      try {
        await connectionStore.switchDatabase(tab.database);
      } catch (err) {
        console.warn(`[WorkspaceStore] Auto-switching database to '${tab.database}' failed:`, err);
      }
    }
  }

  function setActiveTab(id: string) {
    activeTabId.value = id;
    scheduleTabConnectionSync();
  }

  /**
   * Hand-clicking through tabs tends to come in bursts (scanning a few queries, or
   * flipping back and forth between two). Waiting briefly before touching the
   * connection means only the tab the user settles on triggers a switch.
   */
  const CONNECTION_SYNC_DEBOUNCE_MS = 180;
  let connectionSyncTimer: ReturnType<typeof setTimeout> | null = null;

  function runTabConnectionSync(): Promise<void> {
    const targetTab = tabs.value.find((t) => t.id === activeTabId.value);
    if (!targetTab) return Promise.resolve();
    return syncTabConnectionAndDatabase(targetTab).catch((err) => {
      console.warn('Sync connection for tab error:', err);
    });
  }

  function scheduleTabConnectionSync() {
    if (connectionSyncTimer) clearTimeout(connectionSyncTimer);
    connectionSyncTimer = setTimeout(() => {
      connectionSyncTimer = null;
      void runTabConnectionSync();
    }, CONNECTION_SYNC_DEBOUNCE_MS);
  }

  /**
   * Drops any pending debounce and syncs immediately. Callers about to touch the
   * database must await this so their work cannot land on the previous tab's
   * connection.
   */
  async function ensureActiveTabConnection(): Promise<void> {
    if (connectionSyncTimer) {
      clearTimeout(connectionSyncTimer);
      connectionSyncTimer = null;
    }
    await runTabConnectionSync();
  }

  function updateActiveTabConnection(connId: string, database?: string) {
    if (activeTab.value) {
      activeTab.value.connectionId = connId;
      if (database) {
        activeTab.value.database = database;
      }
    }
  }

  function updateActiveTabDatabase(database: string) {
    if (activeTab.value) {
      activeTab.value.database = database;
    }
  }

  function markTabSaved(tabId: string, newTitle?: string) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (tab) {
      tab.isDirty = false;
      if (newTitle) {
        tab.title = newTitle;
      }
    }
  }

  function addSqlTab(
    initialQuery = '',
    title?: string,
    connectionId?: string,
    database?: string,
    filePath?: string
  ) {
    const connectionStore = useConnectionStore();
    const existingNums = tabs.value
      .filter((t) => t.type === 'sql_editor')
      .map((t) => {
        const match = t.title.match(/^Query\s*(\d+)/i);
        return match ? parseInt(match[1] || '0', 10) : 0;
      });
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
    const tabId = `tab-sql-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const effectiveConnId = connectionId || connectionStore.activeConnectionId || undefined;
    const effectiveDb = database || connectionStore.activeDatabase || 'master';

    const newTab: SqlEditorTab = {
      id: tabId,
      type: 'sql_editor',
      title: title ?? `Query ${nextNum}.sql`,
      query: initialQuery ?? '',
      connectionId: effectiveConnId,
      database: effectiveDb,
      filePath,
      isDirty: false,
    };
    tabs.value.push(newTab);
    activeTabId.value = tabId;
    return tabId;
  }

  function openSqlFileTab(filePath: string, fileName: string, content: string) {
    // If a tab with this exact filePath is already open, switch to it
    const existing = tabs.value.find(
      (t): t is SqlEditorTab => t.type === 'sql_editor' && (t as SqlEditorTab).filePath === filePath
    );
    if (existing) {
      activeTabId.value = existing.id;
      return existing.id;
    }
    return addSqlTab(content, fileName, undefined, undefined, filePath);
  }

  /**
   * 複製指定的 SQL 編輯分頁，將其查詢內容、連線與資料庫完整拷貝至新分頁
   */
  function duplicateSqlTab(tabId: string): string | null {
    const sourceTab = tabs.value.find((t) => t.id === tabId);
    if (!sourceTab || sourceTab.type !== 'sql_editor') {
      return null;
    }

    const sqlTab = sourceTab as SqlEditorTab;
    const existingTitles = tabs.value.map((t) => t.title);

    const hasSqlExt = sqlTab.title.toLowerCase().endsWith('.sql');
    const baseName = hasSqlExt ? sqlTab.title.slice(0, -4) : sqlTab.title;
    const copyMatch = baseName.match(/^(.*?)(?:\s*\((?:Copy|複製)(?:\s*(\d+))?\))?$/i);
    const rootName = copyMatch && copyMatch[1] ? copyMatch[1].trim() : baseName;

    let newTitle = `${rootName} (Copy)${hasSqlExt ? '.sql' : ''}`;
    let counter = 2;
    while (existingTitles.includes(newTitle)) {
      newTitle = `${rootName} (Copy ${counter})${hasSqlExt ? '.sql' : ''}`;
      counter++;
    }

    const newTabId = `tab-sql-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newTab: SqlEditorTab = {
      id: newTabId,
      type: 'sql_editor',
      title: newTitle,
      query: sqlTab.query,
      connectionId: sqlTab.connectionId,
      database: sqlTab.database,
      cursorPosition: sqlTab.cursorPosition ? { ...sqlTab.cursorPosition } : undefined,
      filePath: undefined,
      isDirty: sqlTab.query.trim().length > 0,
    };

    const sourceIdx = tabs.value.findIndex((t) => t.id === tabId);
    if (sourceIdx !== -1) {
      tabs.value.splice(sourceIdx + 1, 0, newTab);
    } else {
      tabs.value.push(newTab);
    }

    activeTabId.value = newTabId;
    return newTabId;
  }

  function addTableDataTab(
    schema: string,
    tableName: string,
    connectionId?: string,
    database?: string
  ) {
    const connectionStore = useConnectionStore();
    const effectiveConnId = connectionId || connectionStore.activeConnectionId || undefined;
    const effectiveDb = database || connectionStore.activeDatabase || 'master';

    const existing = tabs.value.find(
      (t) =>
        t.type === 'table_data' &&
        (t as TableDataTab).schema === schema &&
        (t as TableDataTab).tableName === tableName &&
        (!t.connectionId || t.connectionId === effectiveConnId) &&
        (!t.database || t.database === effectiveDb)
    );
    if (existing) {
      setActiveTab(existing.id);
      return;
    }

    const tabId = `tab-data-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newTab: TableDataTab = {
      id: tabId,
      type: 'table_data',
      title: `${schema}.${tableName} (Data)`,
      schema,
      tableName,
      connectionId: effectiveConnId,
      database: effectiveDb,
      isDirty: false,
    };
    tabs.value.push(newTab);
    activeTabId.value = tabId;
  }

  function addTableStructureTab(
    schema: string,
    tableName: string,
    connectionId?: string,
    database?: string
  ) {
    const connectionStore = useConnectionStore();
    const effectiveConnId = connectionId || connectionStore.activeConnectionId || undefined;
    const effectiveDb = database || connectionStore.activeDatabase || 'master';

    const existing = tabs.value.find(
      (t) =>
        t.type === 'table_structure' &&
        (t as TableStructureTab).schema === schema &&
        (t as TableStructureTab).tableName === tableName &&
        (!t.connectionId || t.connectionId === effectiveConnId) &&
        (!t.database || t.database === effectiveDb)
    );
    if (existing) {
      setActiveTab(existing.id);
      return;
    }

    const tabId = `tab-struct-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newTab: TableStructureTab = {
      id: tabId,
      type: 'table_structure',
      title: `${schema}.${tableName} (Structure)`,
      schema,
      tableName,
      connectionId: effectiveConnId,
      database: effectiveDb,
      isDirty: false,
    };
    tabs.value.push(newTab);
    activeTabId.value = tabId;
  }

  function addExecutionPlanTab(
    planXml: string,
    querySql: string,
    title?: string,
    connectionId?: string,
    database?: string
  ): ExecutionPlanTab {
    const connectionStore = useConnectionStore();
    const effectiveConnId = connectionId || connectionStore.activeConnectionId || undefined;
    const effectiveDb = database || connectionStore.activeDatabase || undefined;

    const tabId = `tab-plan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newTab: ExecutionPlanTab = {
      id: tabId,
      type: 'execution_plan',
      title: title || `執行計畫 ${new Date().toLocaleTimeString()}`,
      planXml,
      querySql,
      executedAt: new Date().toLocaleTimeString(),
      connectionId: effectiveConnId,
      database: effectiveDb,
      isDirty: false,
    };
    tabs.value.push(newTab);
    activeTabId.value = tabId;
    return newTab;
  }

  function addErDiagramTab(options: {
    title?: string;
    rootSchema?: string;
    rootTable?: string;
    depth?: 1 | 2;
    connectionId?: string;
    database?: string;
    initialData?: any;
    fileName?: string;
  }) {
    const connectionStore = useConnectionStore();
    const effectiveConnId = options.connectionId || connectionStore.activeConnectionId || undefined;
    const effectiveDb = options.database || connectionStore.activeDatabase || 'master';
    const depth = options.depth || 2;

    // Check if same root table ER tab already exists
    if (options.rootSchema && options.rootTable) {
      const existing = tabs.value.find(
        (t) =>
          t.type === 'er_diagram' &&
          (t as ErDiagramTab).rootSchema === options.rootSchema &&
          (t as ErDiagramTab).rootTable === options.rootTable &&
          (!t.connectionId || t.connectionId === effectiveConnId) &&
          (!t.database || t.database === effectiveDb)
      );
      if (existing) {
        setActiveTab(existing.id);
        return;
      }
    }

    const tabId = `tab-er-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const title = options.title || (options.rootTable ? `ER: ${options.rootTable}` : 'ER Diagram');
    const newTab: ErDiagramTab = {
      id: tabId,
      type: 'er_diagram',
      title,
      rootSchema: options.rootSchema,
      rootTable: options.rootTable,
      depth,
      connectionId: effectiveConnId,
      database: effectiveDb,
      initialData: options.initialData,
      fileName: options.fileName,
      isDirty: false,
    };
    tabs.value.push(newTab);
    activeTabId.value = tabId;
  }

  const editorViewStateCache = new Map<string, any>();

  function saveEditorViewState(tabId: string, state: any) {
    if (!tabId || !state) return;
    editorViewStateCache.set(tabId, state);
  }

  function getEditorViewState(tabId: string): any {
    if (!tabId) return null;
    return editorViewStateCache.get(tabId) ?? null;
  }

  function deleteEditorViewState(tabId: string) {
    editorViewStateCache.delete(tabId);
  }

  function updateTabCursorPosition(
    tabId: string,
    position: { lineNumber: number; column: number }
  ) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (tab && tab.type === 'sql_editor') {
      (tab as SqlEditorTab).cursorPosition = {
        lineNumber: position.lineNumber,
        column: position.column,
      };
      saveTabsToStorage(tabs.value);
    }
  }

  function closeTab(tabId: string) {
    const index = tabs.value.findIndex((t) => t.id === tabId);
    if (index === -1) return;

    deleteEditorViewState(tabId);
    tabs.value.splice(index, 1);

    if (activeTabId.value === tabId) {
      if (tabs.value.length > 0) {
        const nextIndex = Math.min(index, tabs.value.length - 1);
        const nextTab = tabs.value[nextIndex];
        if (nextTab) {
          activeTabId.value = nextTab.id;
        }
      } else {
        addSqlTab();
      }
    }
  }

  function updateTabContent(tabId: string, query: string) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (tab && tab.type === 'sql_editor') {
      tab.query = query;
      tab.isDirty = true;
    }
  }

  function updateTabData(tabId: string, patch: Partial<WorkspaceTab>) {
    const idx = tabs.value.findIndex((t) => t.id === tabId);
    if (idx !== -1) {
      tabs.value[idx] = { ...tabs.value[idx], ...patch } as WorkspaceTab;
      saveTabsToStorage(tabs.value);
    }
  }

  // Cross component reload signal (SSOT). Bumped after a TSV import so that any open
  // `table_data` tab for that table refreshes itself.
  const tableDataVersions = ref<Record<string, number>>({});

  function tableDataVersionKey(
    connId: string,
    database: string,
    schema: string,
    table: string
  ): string {
    return `${connId}|${database}|${schema}|${table}`.toLowerCase();
  }

  function bumpTableDataVersion(
    connId: string,
    database: string,
    schema: string,
    table: string
  ): void {
    const key = tableDataVersionKey(connId, database, schema, table);
    tableDataVersions.value = {
      ...tableDataVersions.value,
      [key]: (tableDataVersions.value[key] ?? 0) + 1,
    };
  }

  function getTableDataVersion(
    connId: string,
    database: string,
    schema: string,
    table: string
  ): number {
    return tableDataVersions.value[tableDataVersionKey(connId, database, schema, table)] ?? 0;
  }

  function formatActiveQuery(): void {
    const current = activeTab.value;
    if (current && current.type === 'sql_editor') {
      try {
        const formatted = formatSql(current.query, {
          language: 'tsql',
          keywordCase: 'upper',
          tabWidth: 2,
        });
        current.query = formatted;
        current.isDirty = true;
      } catch (err) {
        console.warn('Failed to format SQL:', err);
      }
    }
  }

  function setBottomPanelTab(tab: BottomPanelTab) {
    bottomPanelTab.value = tab;
    isBottomPanelOpen.value = true;
  }

  function toggleBottomPanel() {
    isBottomPanelOpen.value = !isBottomPanelOpen.value;
  }

  function toggleSidebar() {
    isSidebarOpen.value = !isSidebarOpen.value;
  }

  function setSidebarOpen(open: boolean) {
    isSidebarOpen.value = open;
  }

  function reorderTabs(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= tabs.value.length) return;
    if (toIndex < 0 || toIndex >= tabs.value.length) return;

    const moved = tabs.value[fromIndex];
    if (!moved) return;
    tabs.value.splice(fromIndex, 1);
    tabs.value.splice(toIndex, 0, moved);
  }

  async function renameTab(tabId: string, newTitle: string): Promise<boolean> {
    const trimmed = newTitle.trim();
    if (!trimmed) return false;
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab) return false;

    if (tab.type === 'sql_editor') {
      const sqlTab = tab as SqlEditorTab;
      if (sqlTab.filePath) {
        // Bi-directional synchronization: rename the physical SQL file on disk and update explorer tree
        const sqlFolderStore = useSqlFolderStore();
        return await sqlFolderStore.renameItem(sqlTab.filePath, trimmed, false);
      }
    }

    tab.title = trimmed;
    return true;
  }

  /**
   * Updates filePath and tab title for an open SQL tab when a file is renamed
   */
  function syncRenamedFile(oldPath: string, newPath: string, newName: string) {
    const normOld = oldPath.replace(/\\/g, '/').toLowerCase();
    for (const tab of tabs.value) {
      if (tab.type === 'sql_editor') {
        const sqlTab = tab as SqlEditorTab;
        if (sqlTab.filePath && sqlTab.filePath.replace(/\\/g, '/').toLowerCase() === normOld) {
          sqlTab.filePath = newPath;
          sqlTab.title = newName;
        }
      }
    }
  }

  /**
   * Updates filePaths for any open SQL tabs inside a folder when the folder is renamed
   */
  function syncRenamedFolder(oldFolderPath: string, newFolderPath: string) {
    const normOldDir = oldFolderPath.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '') + '/';
    const normNewDir = newFolderPath.replace(/\\/g, '/').replace(/\/$/, '') + '/';

    for (const tab of tabs.value) {
      if (tab.type === 'sql_editor') {
        const sqlTab = tab as SqlEditorTab;
        if (sqlTab.filePath) {
          const normTabPath = sqlTab.filePath.replace(/\\/g, '/');
          if (normTabPath.toLowerCase().startsWith(normOldDir)) {
            const relPath = normTabPath.slice(normOldDir.length);
            sqlTab.filePath = normNewDir + relPath;
          }
        }
      }
    }
  }

  function closeOtherTabs(tabId: string) {
    const toDelete = tabs.value.filter((t) => t.id !== tabId).map((t) => t.id);
    for (const id of toDelete) {
      deleteEditorViewState(id);
    }
    tabs.value = tabs.value.filter((t) => t.id === tabId);
    activeTabId.value = tabId;
  }

  function setPendingColumnToInsert(colName: string) {
    pendingColumnToInsert.value = colName;
  }

  function consumePendingColumnToInsert(): string | null {
    const val = pendingColumnToInsert.value;
    pendingColumnToInsert.value = null;
    return val;
  }

  function clearPendingColumnToInsert() {
    pendingColumnToInsert.value = null;
  }

  function showToast(
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info',
    duration = 2500
  ) {
    toastStore.add({
      severity: type === 'warning' ? 'warn' : type,
      summary: TOAST_SUMMARIES[type],
      detail: message,
      life: duration,
    });
  }

  const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Automatically saves all modified SQL editor tabs that have a filePath
   */
  async function autoSaveSqlFiles(force = false): Promise<number> {
    const tabsToSave = tabs.value.filter(
      (t): t is SqlEditorTab =>
        t.type === 'sql_editor' &&
        Boolean((t as SqlEditorTab).filePath) &&
        (force || Boolean((t as SqlEditorTab).isDirty))
    );

    if (tabsToSave.length === 0) return 0;

    let savedCount = 0;
    for (const tab of tabsToSave) {
      try {
        if (tab.filePath) {
          await sqlFolderService.writeFile(tab.filePath, tab.query);
          tab.isDirty = false;
          markTabSaved(tab.id);
          savedCount++;
        }
      } catch (err) {
        console.error(`[WorkspaceStore] Auto-save failed for ${tab.title} (${tab.filePath}):`, err);
      }
    }

    if (savedCount > 0) {
      showToast(`已自動儲存 ${savedCount} 個 SQL 檔案`, 'info', 2000);
    }
    return savedCount;
  }

  /**
   * Starts or restarts the auto-save timer (default: 5 minutes)
   */
  function startAutoSaveTimer(intervalMs = AUTO_SAVE_INTERVAL_MS) {
    stopAutoSaveTimer();
    autoSaveTimer = setInterval(() => {
      autoSaveSqlFiles().catch((err) => {
        console.error('[WorkspaceStore] Auto-save error:', err);
      });
    }, intervalMs);
    if (typeof autoSaveTimer === 'object' && autoSaveTimer !== null && 'unref' in autoSaveTimer) {
      (autoSaveTimer as unknown as { unref: () => void }).unref();
    }
  }

  /**
   * Stops the auto-save timer
   */
  function stopAutoSaveTimer() {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer);
      autoSaveTimer = null;
    }
  }

  // Start the 5-minute auto-save timer
  startAutoSaveTimer();

  return {
    tabs,
    activeTabId,
    activeTab,
    bottomPanelTab,
    isBottomPanelOpen,
    isSidebarOpen,
    pendingColumnToInsert,
    setActiveTab,
    ensureActiveTabConnection,
    updateActiveTabConnection,
    updateActiveTabDatabase,
    markTabSaved,
    addSqlTab,
    openSqlFileTab,
    duplicateSqlTab,
    addTableDataTab,
    addTableStructureTab,
    addExecutionPlanTab,
    addErDiagramTab,
    closeTab,
    closeOtherTabs,
    reorderTabs,
    renameTab,
    syncRenamedFile,
    syncRenamedFolder,
    updateTabContent,
    updateTabData,
    tableDataVersions,
    bumpTableDataVersion,
    getTableDataVersion,
    formatActiveQuery,
    setBottomPanelTab,
    toggleBottomPanel,
    toggleSidebar,
    setSidebarOpen,
    setPendingColumnToInsert,
    consumePendingColumnToInsert,
    clearPendingColumnToInsert,
    showToast,
    autoSaveSqlFiles,
    startAutoSaveTimer,
    stopAutoSaveTimer,
    saveEditorViewState,
    getEditorViewState,
    deleteEditorViewState,
    updateTabCursorPosition,
  };
});
