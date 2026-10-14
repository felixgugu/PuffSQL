import { defineStore } from 'pinia';
import { ref, computed, watch, markRaw } from 'vue';
import type { QueryResult, QueryHistoryItem, QueryResultTab, QueryMessage, SessionMessageItem } from '@/types/query';
import { queryService } from '@/services/queryService';
import { useSettingsStore } from './settingsStore';
import { useWorkspaceStore } from './workspaceStore';
import { useGridLayoutStore } from './gridLayoutStore';
import { parseTargetTableFromSql } from '@/utils/sqlGenerator';
import { splitSqlBatches, splitSqlStatements } from '@/utils/sqlStatementExtractor';
import {
  buildExecutionStats,
  wrapQueryWithPerfTelemetry,
  type ExecutionStatsData,
  type PerfTelemetrySummary,
  type WaitStatItem,
} from '@/utils/statsParser';
import { extractShowPlanXml } from '@/utils/planXmlParser';

let queryExecutionSeq = 0;
let sessionMessageSeq = 0;
let historySeq = 0;

export function resetQueryExecutionSeq(): void {
  queryExecutionSeq = 0;
}

export function resetSessionMessageSeq(): void {
  sessionMessageSeq = 0;
}

export function resetHistorySeq(): void {
  historySeq = 0;
}

const STORAGE_STATS_ENABLED_KEY = 'sqlight_perf_stats_enabled';

function loadSavedStatsSetting(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_STATS_ENABLED_KEY);
    return raw === 'true'; // Default is false!
  } catch {
    return false;
  }
}

function saveStatsSetting(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_STATS_ENABLED_KEY, String(enabled));
  } catch {
    // ignore storage error
  }
}

export const useQueryStore = defineStore('query', () => {
  const settingsStore = useSettingsStore();
  const resultTabs = ref<QueryResultTab[]>([]);
  const activeResultTabId = ref<string | null>(null);

  const isExecuting = ref<boolean>(false);
  const isCancelling = ref<boolean>(false);
  const currentRequestId = ref<string | null>(null);
  const currentRunningConnectionId = ref<string | null>(null);
  const elapsedExecutionMs = ref<number>(0);
  let executionTimer: ReturnType<typeof setInterval> | null = null;

  function startExecutionTimer() {
    elapsedExecutionMs.value = 0;
    const start = Date.now();
    if (executionTimer) clearInterval(executionTimer);
    executionTimer = setInterval(() => {
      elapsedExecutionMs.value = Date.now() - start;
    }, 100);
  }

  function stopExecutionTimer() {
    if (executionTimer) {
      clearInterval(executionTimer);
      executionTimer = null;
    }
  }

  const executionError = ref<string | null>(null);
  const history = ref<QueryHistoryItem[]>([]);
  const sessionMessages = ref<SessionMessageItem[]>([]);
  const maxRows = ref<number | null>(10000);

  // Performance Analysis & IO Stats State (default false)
  const isStatsEnabled = ref<boolean>(loadSavedStatsSetting());
  const activeExecutionStats = ref<ExecutionStatsData | null>(null);
  const statsHistory = ref<ExecutionStatsData[]>([]);

  // Estimated Execution Plan State (SET SHOWPLAN_ALL ON, default false)
  const isShowplanEnabled = ref<boolean>(false);

  // Actual Execution Plan State (SET STATISTICS XML ON, default false)
  const isActualPlanEnabled = ref<boolean>(false);

  watch(
    isStatsEnabled,
    (newVal) => {
      saveStatsSetting(newVal);
      if (newVal) {
        if (isShowplanEnabled.value) isShowplanEnabled.value = false;
        if (isActualPlanEnabled.value) isActualPlanEnabled.value = false;
      }
    },
    { flush: 'sync' }
  );

  watch(
    isShowplanEnabled,
    (newVal) => {
      if (newVal) {
        if (isStatsEnabled.value) isStatsEnabled.value = false;
        if (isActualPlanEnabled.value) isActualPlanEnabled.value = false;
      }
    },
    { flush: 'sync' }
  );

  watch(
    isActualPlanEnabled,
    (newVal) => {
      if (newVal) {
        if (isStatsEnabled.value) isStatsEnabled.value = false;
        if (isShowplanEnabled.value) isShowplanEnabled.value = false;
      }
    },
    { flush: 'sync' }
  );

  function toggleStatsEnabled() {
    isStatsEnabled.value = !isStatsEnabled.value;
    if (isStatsEnabled.value) {
      isShowplanEnabled.value = false;
      isActualPlanEnabled.value = false;
    }
  }

  function toggleShowplanEnabled() {
    isShowplanEnabled.value = !isShowplanEnabled.value;
    if (isShowplanEnabled.value) {
      isStatsEnabled.value = false;
      isActualPlanEnabled.value = false;
    }
  }

  function toggleActualPlanEnabled() {
    isActualPlanEnabled.value = !isActualPlanEnabled.value;
    if (isActualPlanEnabled.value) {
      isStatsEnabled.value = false;
      isShowplanEnabled.value = false;
    }
  }

  const activeResultTab = computed<QueryResultTab | null>(() => {
    if (!resultTabs.value.length) return null;
    const found = resultTabs.value.find((tab) => tab.id === activeResultTabId.value);
    if (found) return found;
    return resultTabs.value[0] ?? null;
  });

  // Backward compatible activeResult computed from currently selected tab
  const activeResult = computed<QueryResult | null>(() => {
    return activeResultTab.value?.result ?? null;
  });

  function enforceResultLimit() {
    const settingsStore = useSettingsStore();
    const maxTabs = settingsStore.maxResultTabs;

    while (resultTabs.value.length > maxTabs) {
      // Find the oldest unpinned tab from the end
      let targetIndex = -1;
      for (let i = resultTabs.value.length - 1; i >= 0; i--) {
        const tab = resultTabs.value[i];
        if (tab && !tab.isPinned) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex !== -1) {
        const [removed] = resultTabs.value.splice(targetIndex, 1);
        if (removed) useGridLayoutStore().clearTab(removed.id);
      } else {
        // If all tabs are pinned, respect the pins and stop evicting
        break;
      }
    }
  }

  function extractFirstTableName(sql: string): string {
    if (!sql || !sql.trim()) return 'Query';
    const parsed = parseTargetTableFromSql(sql);
    if (parsed?.tableName) {
      return parsed.tableName;
    }

    const cleanSql = sql
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();

    // Match FROM, INTO, UPDATE, JOIN, TRUNCATE TABLE followed by table name
    const regex = /\b(?:FROM|INTO|UPDATE|JOIN|TRUNCATE\s+TABLE)\s+(?:\[?[\w]+\]?\.)*(?:\[?([\w]+)\]?)/i;
    const match = cleanSql.match(regex);

    if (match && match[1]) {
      const name = match[1].replace(/[\[\]]/g, '').trim();
      if (name && !['SELECT', 'WHERE', 'VALUES', 'SET'].includes(name.toUpperCase())) {
        return name;
      }
    }

    const firstWord = cleanSql.match(/^[a-zA-Z]+/);
    if (firstWord) {
      return firstWord[0].toUpperCase();
    }

    return 'Query';
  }

  function insertNewTab(newTab: QueryResultTab) {
    // Insert right after all pinned tabs (leftmost position among unpinned tabs)
    const firstUnpinnedIdx = resultTabs.value.findIndex((t) => !t.isPinned);
    if (firstUnpinnedIdx === -1) {
      resultTabs.value.push(newTab);
    } else {
      resultTabs.value.splice(firstUnpinnedIdx, 0, newTab);
    }
    activeResultTabId.value = newTab.id;
    applyResultTabRetention(newTab.id);
  }

  /**
   * Applies the result tab retention mode, keeping `keepId` as the surviving unpinned tab.
   * With accumulation on the historical behaviour applies: tabs pile up to `maxResultTabs` and
   * the oldest unpinned one is evicted. With it off (the default) only pinned tabs survive
   * alongside the tab that was just produced.
   */
  function applyResultTabRetention(keepId: string) {
    if (settingsStore.accumulateResultTabs) {
      enforceResultLimit();
    } else {
      closeOtherResultTabs(keepId);
    }
  }

  /** Keeps pinned tabs plus the tab the user is currently looking at. */
  function pruneResultTabsToActive() {
    const keepId = activeResultTabId.value ?? resultTabs.value[0]?.id ?? null;
    if (!keepId) return;
    closeOtherResultTabs(keepId);
  }

  // Switching the retention mode off prunes right away, whichever UI flipped it (the panel header
  // button or the settings modal), so both entry points behave identically. Switching it back on
  // needs no immediate work: accumulation resumes with the next execution.
  watch(
    () => settingsStore.accumulateResultTabs,
    (accumulate) => {
      if (!accumulate) pruneResultTabsToActive();
    }
  );

  async function execute(
    connectionId: string,
    database: string,
    sql: string,
    limitOverride?: number | null
  ): Promise<QueryResult | null> {
    if (!sql.trim()) return null;

    const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    currentRequestId.value = reqId;
    currentRunningConnectionId.value = connectionId;
    isExecuting.value = true;
    isCancelling.value = false;
    executionError.value = null;
    startExecutionTimer();
    const startTime = Date.now();

    try {
      const limit = limitOverride !== undefined ? limitOverride : maxRows.value;
      const isShowplan = isShowplanEnabled.value;
      const isActualPlan = isActualPlanEnabled.value;
      let result: QueryResult;
      let actualPlanXml: string | null = null;

      const batches = splitSqlBatches(sql);

      if (isShowplan) {
        try {
          await queryService.executeQuery(connectionId, database, 'SET SHOWPLAN_ALL ON;', null, reqId);
          result = await queryService.executeQuery(connectionId, database, sql, limit, reqId);
        } finally {
          try {
            await queryService.executeQuery(connectionId, database, 'SET SHOWPLAN_ALL OFF;');
          } catch (offErr) {
            console.error('Failed to turn off SET SHOWPLAN_ALL', offErr);
          }
        }
      } else if (isActualPlan) {
        try {
          await queryService.executeQuery(connectionId, database, 'SET STATISTICS XML ON;', null, reqId);
          result = await queryService.executeQuery(connectionId, database, sql, limit, reqId);
        } finally {
          try {
            await queryService.executeQuery(connectionId, database, 'SET STATISTICS XML OFF;');
          } catch (offErr) {
            console.error('Failed to turn off SET STATISTICS XML', offErr);
          }
        }
      } else {
        // Only wrap with performance telemetry if single-batch (variable scope cannot cross GO boundaries)
        const effectiveSql = isStatsEnabled.value && batches.length <= 1
          ? wrapQueryWithPerfTelemetry(sql)
          : sql;
        result = await queryService.executeQuery(connectionId, database, effectiveSql, limit, reqId);
      }

      const duration = result.executionTimeMs || (Date.now() - startTime);

      // If actual execution plan was enabled, extract the XML showplan
      if (isActualPlan) {
        const extracted = extractShowPlanXml(result.resultSets);
        actualPlanXml = extracted.planXml;
        result.resultSets = extracted.cleanedResultSets;
      }

      let telemetrySummary: PerfTelemetrySummary | null = null;
      const waitStats: WaitStatItem[] = [];

      // If performance analysis was enabled (and not showplan), extract telemetry payloads and remove them from user data grids
      if (!isShowplan && isStatsEnabled.value) {
        result.resultSets = result.resultSets.filter((rs) => {
          const tagCol = rs.columns.find((c) => c.name === '__sqlight_tag__');
          if (!tagCol) return true;

          const tagVal = String(rs.rows[0]?.[tagCol.ordinal] || '');
          if (tagVal === '__SQLIGHT_PERF_SUMMARY__') {
            const row = rs.rows[0];
            if (row) {
              telemetrySummary = {
                elapsedTimeMs: Number(row[1] || 0),
                cpuTimeMs: Number(row[2] || 0),
                logicalReads: Number(row[3] || 0),
                physicalReads: Number(row[4] || 0),
                physicalWrites: Number(row[5] || 0),
              };
            }
            return false;
          }

          if (tagVal === '__SQLIGHT_WAIT_STATS__') {
            for (const r of rs.rows) {
              waitStats.push({
                waitType: String(r[1] || ''),
                waitingTasksCount: Number(r[2] || 0),
                waitTimeMs: Number(r[3] || 0),
                maxWaitTimeMs: Number(r[4] || 0),
              });
            }
            return false;
          }

          return true;
        });

        const stats = buildExecutionStats({
          messages: result.messages.map((m) => m.message),
          telemetrySummary,
          waitStats,
          executionTimeMsFallback: duration,
          querySql: sql,
        });

        activeExecutionStats.value = stats;
        statsHistory.value.unshift(stats);
        if (statsHistory.value.length > 50) {
          statsHistory.value.pop();
        }

        try {
          const workspaceStore = useWorkspaceStore();
          workspaceStore.setBottomPanelTab('stats');
        } catch {
          // ignore if workspaceStore is unavailable (e.g. unit tests)
        }
      } else if (!isShowplan) {
        // If not explicitly enabled, but messages have STATISTICS IO / TIME, parse it gracefully
        const hasIoMsg = result.messages.some((m) =>
          /Table\s+'[^']+'\.\s+Scan\s+count/i.test(m.message)
        );
        if (hasIoMsg) {
          const stats = buildExecutionStats({
            messages: result.messages.map((m) => m.message),
            executionTimeMsFallback: duration,
            querySql: sql,
          });
          activeExecutionStats.value = stats;
        }
      }

      const hasError = result.messages.some((m) => m.level === 'error');
      const totalRows = result.resultSets.length > 0
        ? result.resultSets.reduce((sum, rs) => sum + (rs.rowCount ?? rs.rows?.length ?? 0), 0)
        : 0;
      const hasData = result.resultSets.length > 0 && totalRows > 0;
      const rowCount = result.resultSets.length > 0
        ? totalRows
        : (result.affectedRows ?? 0);
      const timeStr = new Date().toLocaleTimeString();
      const parsed = parseTargetTableFromSql(sql);
      const tableName = parsed?.tableName || extractFirstTableName(sql);
      const schema = parsed?.schema;

      if (hasData) {
        queryExecutionSeq++;
        const seq = queryExecutionSeq;
        const setsLabel = result.resultSets.length > 1 ? ` [${result.resultSets.length} sets]` : '';
        const tabTitle = isShowplan
          ? `${seq}.${tableName} [Plan]${setsLabel}`
          : `${seq}.${tableName}${setsLabel}`;

        const newTab: QueryResultTab = {
          id: `tab-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          title: tabTitle,
          sql,
          result,
          executedAt: timeStr,
          isPinned: false,
          durationMs: duration,
          rowCount,
          connectionId,
          database,
          tableName,
          schema,
          seq,
          isShowplan,
        };

        if (result.resultSets) {
          for (const rs of result.resultSets) {
            if (rs.rows && Array.isArray(rs.rows)) {
              rs.rows = markRaw(rs.rows);
            }
          }
        }

        insertNewTab(newTab);
      }

      if (isShowplan) {
        try {
          const workspaceStore = useWorkspaceStore();
          workspaceStore.setBottomPanelTab('results');
        } catch {
          // ignore if workspaceStore is unavailable (e.g. unit tests)
        }
      } else if (!hasData) {
        try {
          const workspaceStore = useWorkspaceStore();
          workspaceStore.setBottomPanelTab('messages');
        } catch {
          // ignore if workspaceStore is unavailable (e.g. unit tests)
        }
      }

      if (actualPlanXml) {
        try {
          const workspaceStore = useWorkspaceStore();
          workspaceStore.addExecutionPlanTab(
            actualPlanXml,
            sql,
            `${tableName} (Actual Plan)`,
            connectionId,
            database
          );
        } catch {
          // ignore if workspaceStore is unavailable (e.g. unit tests)
        }
      }

      // Add messages to sessionMessages (accumulate without persistence, newest in front)
      if (result.messages && result.messages.length > 0) {
        const arrivedAt = Date.now();
        const newItems: SessionMessageItem[] = result.messages.map((m) => {
          sessionMessageSeq++;
          return {
            id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}-${sessionMessageSeq}`,
            seq: sessionMessageSeq,
            level: m.level,
            message: m.message,
            code: m.code,
            lineNumber: m.lineNumber,
            timestamp: m.timestamp || new Date().toISOString(),
            sql: m.sql || sql,
            // Lets the message log flash what just ran, even if its panel mounts afterwards.
            freshAt: arrivedAt,
          };
        });
        sessionMessages.value.unshift(...newItems.reverse());
      }

      // Add to query history
      historySeq++;
      history.value.unshift({
        id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        seq: historySeq,
        connectionId,
        database,
        sql,
        executedAt: timeStr,
        executionTimeMs: duration,
        status: hasError ? 'error' : 'success',
        affectedRows: result.affectedRows,
        errorMessage: result.messages.find((m) => m.level === 'error')?.message,
      });

      return result;
    } catch (err: unknown) {
      const duration = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : String(err);
      const isCancelled =
        isCancelling.value ||
        msg.toLowerCase().includes('cancelled') ||
        msg.includes('取消');

      if (isCancelled) {
        executionError.value = '查詢已被使用者取消 (Query cancelled by user)';
        const timeStr = new Date().toLocaleTimeString();

        historySeq++;
        history.value.unshift({
          id: `hist-${Date.now()}`,
          seq: historySeq,
          connectionId,
          database,
          sql,
          executedAt: timeStr,
          executionTimeMs: duration,
          status: 'cancelled',
          errorMessage: '查詢已被使用者取消 (Query cancelled by user)',
        });

        const cancelMessage: QueryMessage = {
          level: 'warning',
          message: `🛑 查詢已被使用者中斷與取消 (Query cancelled by user). 耗時: ${(duration / 1000).toFixed(2)} 秒`,
          timestamp: new Date().toISOString(),
        };

        if (activeResultTab.value) {
          activeResultTab.value.result.messages.push(cancelMessage);
        }

        sessionMessageSeq++;
        sessionMessages.value.unshift({
          id: `msg-${Date.now()}-${sessionMessageSeq}`,
          seq: sessionMessageSeq,
          level: cancelMessage.level,
          message: cancelMessage.message,
          timestamp: cancelMessage.timestamp,
          freshAt: Date.now(),
        });

        try {
          const workspaceStore = useWorkspaceStore();
          workspaceStore.setBottomPanelTab('messages');
          workspaceStore.showToast('查詢已中斷並取消 (Query cancelled)', 'info', 2500);
        } catch {
          // ignore if workspaceStore unavailable
        }

        return null;
      }

      executionError.value = msg;
      const timeStr = new Date().toLocaleTimeString();

      const errorResult: QueryResult = {
        resultSets: [],
        messages: [
          {
            level: 'error',
            message: msg,
            timestamp: new Date().toISOString(),
            sql,
          },
        ],
        affectedRows: 0,
        executionTimeMs: duration,
      };

      try {
        const workspaceStore = useWorkspaceStore();
        workspaceStore.setBottomPanelTab('messages');
      } catch {
        // ignore if workspaceStore is unavailable (e.g. unit tests)
      }

      sessionMessageSeq++;
      sessionMessages.value.unshift({
        id: `msg-${Date.now()}-${sessionMessageSeq}`,
        seq: sessionMessageSeq,
        level: 'error',
        message: msg,
        timestamp: new Date().toISOString(),
        sql,
        freshAt: Date.now(),
      });

      historySeq++;
      history.value.unshift({
        id: `hist-${Date.now()}`,
        seq: historySeq,
        connectionId,
        database,
        sql,
        executedAt: timeStr,
        executionTimeMs: duration,
        status: 'error',
        errorMessage: msg,
      });

      return errorResult;
    } finally {
      stopExecutionTimer();
      isExecuting.value = false;
      isCancelling.value = false;
      currentRequestId.value = null;
      currentRunningConnectionId.value = null;
    }
  }

  async function cancelQuery(): Promise<void> {
    if (!isExecuting.value) return;
    isCancelling.value = true;
    try {
      const connId = currentRunningConnectionId.value;
      const reqId = currentRequestId.value;
      if (connId) {
        await queryService.cancelQuery(connId, reqId || undefined);
      }
    } catch (err) {
      console.error('Failed to cancel query:', err);
    }
  }

  function selectResultTab(id: string) {
    activeResultTabId.value = id;
  }

  function togglePinTab(id: string) {
    const index = resultTabs.value.findIndex((t) => t.id === id);
    if (index === -1) return;
    const tab = resultTabs.value[index];
    if (!tab) return;
    tab.isPinned = !tab.isPinned;

    resultTabs.value.splice(index, 1);

    if (tab.isPinned) {
      // Move to the end of pinned tabs (to the left of unpinned tabs)
      let lastPinnedIdx = -1;
      for (let i = resultTabs.value.length - 1; i >= 0; i--) {
        const item = resultTabs.value[i];
        if (item && item.isPinned) {
          lastPinnedIdx = i;
          break;
        }
      }
      resultTabs.value.splice(lastPinnedIdx + 1, 0, tab);
    } else {
      // Unpinned: move to the beginning of unpinned tabs (newest position)
      const firstUnpinnedIdx = resultTabs.value.findIndex((t) => !t.isPinned);
      if (firstUnpinnedIdx === -1) {
        resultTabs.value.push(tab);
      } else {
        resultTabs.value.splice(firstUnpinnedIdx, 0, tab);
      }
    }

    activeResultTabId.value = id;
  }

  function reorderResultTabs(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= resultTabs.value.length) return;
    if (toIndex < 0 || toIndex >= resultTabs.value.length) return;

    const moved = resultTabs.value[fromIndex];
    if (!moved) return;
    resultTabs.value.splice(fromIndex, 1);
    resultTabs.value.splice(toIndex, 0, moved);
  }

  function deleteResultTab(id: string) {
    // Cannot delete the last remaining tab
    if (resultTabs.value.length <= 1) return;

    const index = resultTabs.value.findIndex((t) => t.id === id);
    if (index !== -1) {
      const isCurrentlyActive = activeResultTabId.value === id;
      resultTabs.value.splice(index, 1);
      useGridLayoutStore().clearTab(id);

      if (isCurrentlyActive) {
        // Fallback to the adjacent tab or first tab
        const nextTab = resultTabs.value[index] || resultTabs.value[index - 1] || resultTabs.value[0];
        activeResultTabId.value = nextTab ? nextTab.id : null;
      }
    }
  }

  function closeOtherResultTabs(keepId: string) {
    const gridLayoutStore = useGridLayoutStore();
    for (const tab of resultTabs.value) {
      if (tab.id !== keepId && !tab.isPinned) {
        gridLayoutStore.clearTab(tab.id);
      }
    }
    resultTabs.value = resultTabs.value.filter((t) => t.id === keepId || t.isPinned);
    activeResultTabId.value = keepId;
  }

  function renameResultTab(id: string, newTitle: string) {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    const tab = resultTabs.value.find((t) => t.id === id);
    if (tab) {
      tab.title = trimmed;
    }
  }

  function clearResults() {
    // Retain pinned tabs if any, or clear all
    const gridLayoutStore = useGridLayoutStore();
    for (const tab of resultTabs.value) {
      if (!tab.isPinned) gridLayoutStore.clearTab(tab.id);
    }
    resultTabs.value = resultTabs.value.filter((t) => t.isPinned);
    if (resultTabs.value.length > 0) {
      activeResultTabId.value = resultTabs.value[0]?.id ?? null;
    } else {
      activeResultTabId.value = null;
    }
    executionError.value = null;
  }

  function clearMessages() {
    sessionMessages.value = [];
  }

  function clearHistory() {
    history.value = [];
  }

  function clearExecutionStats() {
    activeExecutionStats.value = null;
  }

  async function refreshTabResultSet(
    tabId: string,
    setIndex: number = 0
  ): Promise<{ success: boolean; rowCount: number; error?: string }> {
    const tab = resultTabs.value.find((t) => t.id === tabId);
    if (!tab) {
      return { success: false, rowCount: 0, error: '查無對應之查詢結果分頁' };
    }

    const connId = tab.connectionId;
    const db = tab.database;
    if (!connId || !db) {
      return { success: false, rowCount: 0, error: '無法取得當前連線或資料庫資訊' };
    }

    const startTime = Date.now();
    try {
      let targetSql = tab.sql;
      const isMultiSet = tab.result.resultSets.length > 1;

      if (isMultiSet) {
        const statements = splitSqlStatements(tab.sql);
        if (statements.length === tab.result.resultSets.length && statements[setIndex]) {
          targetSql = statements[setIndex]!;
        }
      }

      const limit = maxRows.value != null && maxRows.value > 0 ? maxRows.value : undefined;
      let res: QueryResult;

      try {
        res = await queryService.executeQuery(connId, db, targetSql, limit);
      } catch (subErr) {
        if (targetSql !== tab.sql) {
          res = await queryService.executeQuery(connId, db, tab.sql, limit);
        } else {
          throw subErr;
        }
      }

      const duration = res.executionTimeMs || (Date.now() - startTime);

      if (res.resultSets) {
        for (const rs of res.resultSets) {
          if (rs.rows && Array.isArray(rs.rows)) {
            rs.rows = markRaw(rs.rows);
          }
        }
      }

      // In-place update of target result set or all result sets
      if (res.resultSets.length === 1 && isMultiSet && targetSql !== tab.sql && tab.result.resultSets[setIndex]) {
        tab.result.resultSets[setIndex] = res.resultSets[0]!;
      } else if (res.resultSets.length === 0 && isMultiSet && targetSql !== tab.sql && tab.result.resultSets[setIndex]) {
        tab.result.resultSets[setIndex] = {
          columns: tab.result.resultSets[setIndex]!.columns ?? [],
          rows: [],
          rowCount: 0,
        };
      } else if (res.resultSets.length === 0) {
        const prevColumns = tab.result.resultSets[0]?.columns ?? [];
        tab.result.resultSets = [{
          columns: prevColumns,
          rows: [],
          rowCount: 0,
        }];
        tab.result.affectedRows = res.affectedRows;
      } else {
        tab.result.resultSets = res.resultSets;
        tab.result.affectedRows = res.affectedRows;
      }

      tab.rowCount = tab.result.resultSets.reduce(
        (sum, rs) => sum + (rs.rowCount ?? rs.rows?.length ?? 0),
        0
      );
      tab.durationMs = duration;
      tab.executedAt = new Date().toLocaleTimeString();

      if (res.messages && res.messages.length > 0) {
        tab.result.messages = res.messages;
      }

      const refreshedCount = tab.result.resultSets[setIndex]?.rowCount ?? tab.rowCount;
      return { success: true, rowCount: refreshedCount };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, rowCount: 0, error: msg };
    }
  }

  return {
    resultTabs,
    activeResultTabId,
    activeResultTab,
    activeResult,
    isExecuting,
    isCancelling,
    currentRequestId,
    elapsedExecutionMs,
    cancelQuery,
    executionError,
    history,
    sessionMessages,
    maxRows,
    isStatsEnabled,
    isShowplanEnabled,
    isActualPlanEnabled,
    toggleStatsEnabled,
    toggleShowplanEnabled,
    toggleActualPlanEnabled,
    activeExecutionStats,
    statsHistory,
    currentExecutionSeq: computed(() => queryExecutionSeq),
    currentSessionMessageSeq: computed(() => sessionMessageSeq),
    currentHistorySeq: computed(() => historySeq),
    execute,
    refreshTabResultSet,
    selectResultTab,
    togglePinTab,
    reorderResultTabs,
    deleteResultTab,
    closeOtherResultTabs,
    pruneResultTabsToActive,
    renameResultTab,
    clearResults,
    clearMessages,
    clearHistory,
    clearExecutionStats,
  };
});
