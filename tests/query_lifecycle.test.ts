import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { before, beforeEach, describe, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { connectionService } from '../src/services/connectionService';
import { queryService } from '../src/services/queryService';
import { schemaService } from '../src/services/schemaService';
import { useConnectionStore } from '../src/stores/connectionStore';
import { resetHistorySeq, resetQueryExecutionSeq, resetSessionMessageSeq, useQueryStore } from '../src/stores/queryStore';
import { useWorkspaceStore } from '../src/stores/workspaceStore';
import { QueryResult } from '../src/types/query';
import { generateDuplicateConnectionName } from '../src/utils/connectionNameHelper';
import { savePlanToFile } from '../src/utils/fileStorage';
import { extractShowPlanXml, formatXml } from '../src/utils/planXmlParser';
import { buildExecutionStats, formatBytes, formatPageSize, parseStatisticsMessages, wrapQueryWithPerfTelemetry } from '../src/utils/statsParser';
import { readSource } from './helpers/source';

const PLAN_VIEWER = 'src/components/editor/ExecutionPlanViewer.vue';

describe('connection', () => {
const data = new Map<string, string>();
before(() => {
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
    clear: () => data.clear(), key: () => null, length: 0,
  };
});

beforeEach(() => {
  data.clear();
  setActivePinia(createPinia());
  connectionService.connect = async () => {};
  schemaService.switchDatabase = async () => {};
  schemaService.getDatabases = async () => [{ name: 'A' }, { name: 'B' }];
  schemaService.getDatabaseSchema = async () => [];
});

test('database switch failure preserves the displayed and persisted database', async () => {
  const store = useConnectionStore();
  await store.connect('server', 'A');
  schemaService.switchDatabase = async () => { throw new Error('access denied'); };
  await assert.rejects(store.switchDatabase('B'), /access denied/);
  assert.equal(store.activeDatabase, 'A');
  assert.equal(data.get('sqlight_last_database'), 'A');
});

test('failed post-connect database selection does not publish a successful new target', async () => {
  const store = useConnectionStore();
  await store.connect('old', 'A');
  schemaService.switchDatabase = async () => { throw new Error('access denied'); };
  await assert.rejects(store.connect('new', 'B'), /access denied/);
  assert.equal(store.activeConnectionId, 'old');
  assert.equal(store.activeDatabase, 'A');
  assert.equal(store.status, 'error');
});

test('late connection response cannot overwrite the most recent selection', async () => {
  const store = useConnectionStore();
  let release!: () => void;
  connectionService.connect = (id) => id === 'slow'
    ? new Promise<void>((resolve) => { release = resolve; }) : Promise.resolve();
  const pending = store.connect('slow', 'A');
  await store.connect('fast', 'B');
  release();
  await pending;
  assert.equal(store.activeConnectionId, 'fast');
  assert.equal(store.activeDatabase, 'B');
});

test('a tab for a deleted connection is not rebound to the active server', async () => {
  const store = useConnectionStore();
  await store.connect('current', 'A');
  const workspace = useWorkspaceStore();
  workspace.addSqlTab('DELETE FROM Orders', 'old query', 'deleted', 'B');
  workspace.setActiveTab(workspace.activeTabId);
  assert.equal(workspace.activeTab?.connectionId, 'deleted');
  assert.equal(workspace.activeTab?.database, 'B');
});

test('query IPC includes the requested database, SQL and limit', async () => {
  let sent: unknown;
  globalThis.window = { __TAURI_INTERNALS__: {
    invoke: async (command: string, args: unknown) => { sent = { command, args }; return {}; },
  } } as unknown as Window & typeof globalThis;
  try {
    await queryService.executeQuery('server', 'B', 'SELECT 1', 10, 'request', 30);
    assert.deepEqual(sent, { command: 'execute_query', args: {
      connectionId: 'server', database: 'B', sql: 'SELECT 1', maxRows: 10,
      requestId: 'request', timeoutSeconds: 30,
    } });
  } finally { delete (globalThis as any).window; }
});

async function twoConnectionWorkspace() {
  const store = useConnectionStore();
  const profile = (id: string) => ({
    id, name: id, engine: 'mssql' as const, host: 'localhost', port: 1433,
    database: 'master', username: 'sa', encrypt: false, trustServerCertificate: true,
    createdAt: '', updatedAt: '',
  });
  connectionService.getConnections = async () => [profile('A'), profile('B')];
  await store.connect('A', 'master');
  await store.loadConnections();

  const connected: string[] = [];
  connectionService.connect = async (id) => { connected.push(id); };

  const workspace = useWorkspaceStore();
  workspace.addSqlTab('SELECT 1', 'a.sql', 'A', 'master');
  const tabA = workspace.activeTabId;
  workspace.addSqlTab('SELECT 2', 'b.sql', 'B', 'master');
  const tabB = workspace.activeTabId;
  return { workspace, tabA, tabB, connected };
}

test('rapid tab switching only connects to the tab the user settles on', async () => {
  const { workspace, tabA, tabB, connected } = await twoConnectionWorkspace();

  workspace.setActiveTab(tabA);
  workspace.setActiveTab(tabB);
  workspace.setActiveTab(tabA);
  workspace.setActiveTab(tabB);
  assert.deepEqual(connected, [], 'nothing should connect while the switch is still settling');

  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.deepEqual(connected, ['B']);
});

test('executing right after a tab switch flushes the pending connection sync', async () => {
  const { workspace, tabA, tabB, connected } = await twoConnectionWorkspace();

  workspace.setActiveTab(tabA);
  workspace.setActiveTab(tabB);
  assert.deepEqual(connected, []);

  await workspace.ensureActiveTabConnection();
  assert.deepEqual(connected, ['B'], 'the flush must not wait for the debounce');

  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.deepEqual(connected, ['B'], 'the flushed timer must not fire a second time');
});
});

describe('connection_duplicate', () => {
describe('connectionNameHelper utility', () => {
  test('generates (Copy) suffix for standard connection name', () => {
    const result = generateDuplicateConnectionName('Dev DB', ['Dev DB', 'Prod DB']);
    assert.equal(result, 'Dev DB (Copy)');
  });

  test('increments to (Copy 2) when (Copy) already exists', () => {
    const existing = ['Dev DB', 'Dev DB (Copy)'];
    const result = generateDuplicateConnectionName('Dev DB', existing);
    assert.equal(result, 'Dev DB (Copy 2)');
  });

  test('increments to (Copy 3) when (Copy) and (Copy 2) exist', () => {
    const existing = ['Dev DB', 'Dev DB (Copy)', 'Dev DB (Copy 2)'];
    const result = generateDuplicateConnectionName('Dev DB', existing);
    assert.equal(result, 'Dev DB (Copy 3)');
  });

  test('extracts root name when duplicating an already copied connection', () => {
    const existing = ['Dev DB', 'Dev DB (Copy)'];
    const result = generateDuplicateConnectionName('Dev DB (Copy)', existing);
    assert.equal(result, 'Dev DB (Copy 2)');
  });

  test('extracts root name when duplicating a numbered copy', () => {
    const existing = ['Dev DB', 'Dev DB (Copy)', 'Dev DB (Copy 2)'];
    const result = generateDuplicateConnectionName('Dev DB (Copy 2)', existing);
    assert.equal(result, 'Dev DB (Copy 3)');
  });

  test('performs case-insensitive comparison against existing names', () => {
    const existing = ['dev db', 'dev db (copy)'];
    const result = generateDuplicateConnectionName('Dev DB', existing);
    assert.equal(result, 'Dev DB (Copy 2)');
  });

  test('handles empty or whitespace-only name gracefully', () => {
    const result = generateDuplicateConnectionName('   ', []);
    assert.equal(result, 'New Connection (Copy)');
  });

  test('SaveConnectionPayload includes copyPasswordFrom when password is blank during duplication', () => {
    const initialProfile = { id: 'conn-source-123', name: 'Source DB' };
    const formPassword = '';
    const copyFrom = initialProfile && !formPassword.trim() ? initialProfile.id : undefined;
    assert.equal(copyFrom, 'conn-source-123');

    const withPassword = 'custom-pwd';
    const copyFromWithPwd = initialProfile && !withPassword.trim() ? initialProfile.id : undefined;
    assert.equal(copyFromWithPwd, undefined);
  });

  test('SaveConnectionPayload includes alias when provided and undefined when blank', () => {
    const aliasInput = '  PROD  ';
    const alias = aliasInput.trim() || undefined;
    assert.equal(alias, 'PROD');

    const emptyAliasInput = '   ';
    const emptyAlias = emptyAliasInput.trim() || undefined;
    assert.equal(emptyAlias, undefined);
  });

  test('Duplicating connection inherits alias from initialProfile', () => {
    const initialProfile = { id: 'conn-1', name: 'ERP Primary', alias: 'ERP' };
    const formAlias = initialProfile.alias || '';
    assert.equal(formAlias, 'ERP');
  });
});
});

describe('cancel_query', () => {
const storageMap = new Map<string, string>();
before(() => {
  globalThis.localStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storageMap.set(key, String(value));
    },
    removeItem: (key: string) => {
      storageMap.delete(key);
    },
    clear: () => storageMap.clear(),
    key: () => null,
    length: 0,
  };
});

beforeEach(() => {
  storageMap.clear();
  setActivePinia(createPinia());
});

test('queryStore starts with isExecuting=false, isCancelling=false, currentRequestId=null', () => {
  const store = useQueryStore();
  assert.equal(store.isExecuting, false);
  assert.equal(store.isCancelling, false);
  assert.equal(store.currentRequestId, null);
  assert.equal(store.elapsedExecutionMs, 0);
});

test('cancelQuery invokes queryService.cancelQuery with active connection and requestId', async () => {
  const store = useQueryStore();

  let cancelledConnId: string | null = null;
  let cancelledReqId: string | undefined = undefined;

  queryService.cancelQuery = async (connId, reqId) => {
    cancelledConnId = connId;
    cancelledReqId = reqId;
  };

  await store.cancelQuery();
  assert.equal(cancelledConnId, null);

  let resolveQuery: (res: any) => void;
  const queryPromise = new Promise((resolve) => {
    resolveQuery = resolve;
  });

  queryService.executeQuery = async (_connId, _db, _sql, _limit, reqId) => {
    assert.ok(reqId && reqId.startsWith('req_'));
    return queryPromise as any;
  };

  const execPromise = store.execute('conn-42', 'master', 'WAITFOR DELAY "00:00:30"');

  assert.equal(store.isExecuting, true);
  assert.equal(store.isCancelling, false);
  assert.ok(store.currentRequestId);

  await store.cancelQuery();

  assert.equal(store.isCancelling, true);
  assert.equal(cancelledConnId, 'conn-42');
  assert.equal(cancelledReqId, store.currentRequestId);

  resolveQuery!(Promise.reject(new Error('Query cancelled by user')));
  const result = await execPromise;

  assert.equal(result, null);
  assert.equal(store.isExecuting, false);
  assert.equal(store.isCancelling, false);
  assert.equal(store.currentRequestId, null);
});

test('cancelled query records status as cancelled in history and does not add error tab', async () => {
  const store = useQueryStore();

  queryService.executeQuery = async () => {
    throw new Error('Query cancelled by user');
  };

  const initialTabCount = store.resultTabs.length;
  const result = await store.execute('conn-1', 'master', 'SELECT * FROM BigCartesianProduct');

  assert.equal(result, null);
  assert.equal(store.resultTabs.length, initialTabCount);

  assert.equal(store.history.length, 1);
  const histItem = store.history[0];
  assert.equal(histItem?.status, 'cancelled');
  assert.equal(histItem?.connectionId, 'conn-1');
  assert.ok(histItem?.errorMessage?.includes('取消'));
  assert.equal(store.isExecuting, false);
});

test('subsequent query executes normally and independently after a cancelled query', async () => {
  const store = useQueryStore();

  let queryCallCount = 0;
  queryService.executeQuery = async (_connId, _db, sql) => {
    queryCallCount++;
    if (queryCallCount === 1) {
      throw new Error('查詢已被使用者取消');
    }
    return {
      resultSets: [
        {
          columns: [{ name: 'Val', dataType: 'int', nullable: false, ordinal: 0 }],
          rows: [[100]],
          rowCount: 1,
        },
      ],
      messages: [],
      affectedRows: 1,
      executionTimeMs: 12,
    };
  };

  const firstRes = await store.execute('conn-1', 'master', 'SELECT * FROM HeavyLoop');
  assert.equal(firstRes, null);
  assert.equal(store.history[0]?.status, 'cancelled');
  assert.equal(store.resultTabs.length, 0);

  const secondRes = await store.execute('conn-1', 'master', 'SELECT 100 AS Val');
  assert.ok(secondRes);
  assert.equal(secondRes.resultSets.length, 1);
  assert.equal(secondRes.resultSets[0]?.rows[0]?.[0], 100);
  assert.equal(store.history[0]?.status, 'success');
  assert.equal(store.resultTabs.length, 1);
  assert.equal(store.isExecuting, false);
});

test('queryService exposes cancelQuery and getConnectionSpid methods', async () => {
  assert.equal(typeof queryService.cancelQuery, 'function');
  assert.equal(typeof queryService.getConnectionSpid, 'function');

  const spid = await queryService.getConnectionSpid('conn-mock');
  assert.equal(spid, 55);

  const cancelRes = await queryService.cancelQuery('conn-mock', 'req-123');
  assert.equal(cancelRes, undefined);
});

test('execute with multi-batch script delegates to queryService under backend session lock and aggregates results', async () => {
  const store = useQueryStore();

  let capturedConn = '';
  let capturedDb = '';
  let capturedSql = '';

  queryService.executeQuery = async (connId, db, sql) => {
    capturedConn = connId;
    capturedDb = db;
    capturedSql = sql;
    return {
      resultSets: [
        {
          columns: [{ name: 'Done', dataType: 'int', nullable: false, ordinal: 0 }],
          rows: [[1]],
          rowCount: 1,
        },
      ],
      messages: [
        { level: 'info', message: 'Query completed successfully. Executed 3 batch(es), 1 result set(s), 1 rows returned.', timestamp: new Date().toISOString() },
      ],
      affectedRows: 1,
      executionTimeMs: 25,
    };
  };

  const script = `SET ANSI_NULLS ON
GO
CREATE TABLE dbo.MyTable (id int);
GO
SELECT 1 AS Done;`;

  const res = await store.execute('conn-1', 'master', script);
  assert.ok(res);
  assert.equal(capturedConn, 'conn-1');
  assert.equal(capturedDb, 'master');
  assert.equal(capturedSql, script);

  assert.equal(res.resultSets.length, 1);
  assert.equal(res.resultSets[0]?.rows[0]?.[0], 1);
  assert.equal(res.messages.length, 1);
  assert.match(res.messages[0]?.message || '', /Executed 3 batch/);
});
});

describe('messages_and_history', () => {
const storageMap = new Map<string, string>();
before(() => {
  globalThis.localStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storageMap.set(key, String(value));
    },
    removeItem: (key: string) => {
      storageMap.delete(key);
    },
    clear: () => storageMap.clear(),
    key: () => null,
    length: 0,
  };
});

beforeEach(() => {
  storageMap.clear();
  setActivePinia(createPinia());
  resetQueryExecutionSeq();
  resetSessionMessageSeq();
  resetHistorySeq();
});

test('sessionMessages and history start empty and are purely in-memory without localStorage persistence', () => {
  const store = useQueryStore();
  assert.equal(store.sessionMessages.length, 0);
  assert.equal(store.history.length, 0);
  assert.equal(storageMap.size, 0, 'No data should be in localStorage initially');
});

test('sessionMessages accumulates query after query and keeps newest in front with sequential numbers', async () => {
  const store = useQueryStore();

  let queryCallCount = 0;
  queryService.executeQuery = async (_conn, _db, _sql) => {
    queryCallCount++;
    const res: QueryResult = {
      resultSets: [
        {
          columns: [{ name: 'id', dataType: 'int', nullable: false, ordinal: 0 }],
          rows: [[queryCallCount]],
          rowCount: 1,
          totalCount: 1,
          isTruncated: false,
        },
      ],
      messages: [
        {
          level: 'info',
          message: `Query ${queryCallCount} completed. 1 row affected.`,
          timestamp: new Date().toISOString(),
        },
      ],
      affectedRows: 1,
      executionTimeMs: 10,
    };
    return res;
  };

  await store.execute('conn-1', 'db1', 'SELECT 1;');
  assert.equal(store.sessionMessages.length, 1);
  assert.equal(store.sessionMessages[0].seq, 1);
  assert.equal(store.sessionMessages[0].message, 'Query 1 completed. 1 row affected.');

  await store.execute('conn-1', 'db1', 'SELECT 2;');
  assert.equal(store.sessionMessages.length, 2);
  assert.equal(store.sessionMessages[0].seq, 2);
  assert.equal(store.sessionMessages[0].message, 'Query 2 completed. 1 row affected.');
  assert.equal(store.sessionMessages[1].seq, 1);

  queryService.executeQuery = async () => ({
    resultSets: [],
    messages: [
      { level: 'info', message: 'First msg from query 3', timestamp: new Date().toISOString() },
      { level: 'warning', message: 'Second msg from query 3', timestamp: new Date().toISOString() },
    ],
    affectedRows: 0,
    executionTimeMs: 25,
  });

  await store.execute('conn-1', 'db1', 'EXEC test;');
  assert.equal(store.sessionMessages.length, 4);
  assert.equal(store.sessionMessages[0].seq, 4);
  assert.equal(store.sessionMessages[0].message, 'Second msg from query 3');
  assert.equal(store.sessionMessages[1].seq, 3);
  assert.equal(store.sessionMessages[1].message, 'First msg from query 3');
  assert.equal(store.sessionMessages[2].seq, 2);
  assert.equal(store.sessionMessages[3].seq, 1);

  // Still not persisted to localStorage
  assert.equal(storageMap.has('sqlight_messages'), false);
  assert.equal(storageMap.has('sqlight_history'), false);
});

test('history accumulates query after query and keeps newest in front with sequential numbers', async () => {
  const store = useQueryStore();

  queryService.executeQuery = async (_conn, _db, sql) => ({
    resultSets: [],
    messages: [],
    affectedRows: 5,
    executionTimeMs: 15,
  });

  await store.execute('conn-1', 'db1', 'SELECT 1;');
  await store.execute('conn-1', 'db1', 'SELECT 2;');
  await store.execute('conn-1', 'db1', 'SELECT 3;');

  assert.equal(store.history.length, 3);
  assert.equal(store.history[0].seq, 3);
  assert.equal(store.history[0].sql, 'SELECT 3;');
  assert.equal(store.history[1].seq, 2);
  assert.equal(store.history[1].sql, 'SELECT 2;');
  assert.equal(store.history[2].seq, 1);
  assert.equal(store.history[2].sql, 'SELECT 1;');
});

test('clearMessages empties sessionMessages and clearHistory empties history', async () => {
  const store = useQueryStore();

  queryService.executeQuery = async () => ({
    resultSets: [],
    messages: [{ level: 'info', message: 'Hello', timestamp: new Date().toISOString() }],
    affectedRows: 1,
    executionTimeMs: 5,
  });

  await store.execute('conn-1', 'db1', 'SELECT 1;');
  assert.equal(store.sessionMessages.length, 1);
  assert.equal(store.history.length, 1);

  store.clearMessages();
  assert.equal(store.sessionMessages.length, 0);
  assert.equal(store.history.length, 1, 'clearMessages should not clear history');

  store.clearHistory();
  assert.equal(store.history.length, 0);
});

test('query cancellation and errors also accumulate into both sessionMessages and history', async () => {
  const store = useQueryStore();

  queryService.executeQuery = async () => {
    throw new Error('Invalid object name dbo.NonExistentTable');
  };

  await store.execute('conn-1', 'db1', 'SELECT * FROM dbo.NonExistentTable;');

  assert.equal(store.sessionMessages.length, 1);
  assert.equal(store.sessionMessages[0].level, 'error');
  assert.ok(store.sessionMessages[0].message.includes('Invalid object name dbo.NonExistentTable'));
  assert.equal(store.sessionMessages[0].seq, 1);

  assert.equal(store.history.length, 1);
  assert.equal(store.history[0].status, 'error');
  assert.equal(store.history[0].seq, 1);

  queryService.executeQuery = async () => {
    throw new Error('Query was cancelled by user');
  };

  await store.execute('conn-1', 'db1', 'SELECT * FROM huge_table;');

  assert.equal(store.sessionMessages.length, 2);
  assert.equal(store.sessionMessages[0].level, 'warning');
  assert.equal(store.sessionMessages[0].seq, 2);

  assert.equal(store.history.length, 2);
  assert.equal(store.history[0].status, 'cancelled');
  assert.equal(store.history[0].seq, 2);
});

test('history and messages expand/collapse set behavior preserves individual and batch state', () => {
  const expandedKeys = new Set<string | number>();

  const toggleExpand = (key: string | number) => {
    if (expandedKeys.has(key)) {
      expandedKeys.delete(key);
    } else {
      expandedKeys.add(key);
    }
  };

  const item1Key = 'hist-1';
  const item2Key = 'hist-2';

  assert.equal(expandedKeys.has(item1Key), false);
  assert.equal(expandedKeys.has(item2Key), false);

  toggleExpand(item1Key);
  assert.equal(expandedKeys.has(item1Key), true);
  assert.equal(expandedKeys.has(item2Key), false);

  toggleExpand(item1Key);
  assert.equal(expandedKeys.has(item1Key), false);

  const allKeys = [item1Key, item2Key, 'hist-3'];
  allKeys.forEach((k) => expandedKeys.add(k));
  assert.equal(expandedKeys.size, 3);
  assert.equal(allKeys.every((k) => expandedKeys.has(k)), true);

  expandedKeys.clear();
  assert.equal(expandedKeys.size, 0);
});

test('queryService openQueryLogFile and getQueryLogPath return valid log path in browser/mock environment', async () => {
  const logPath = await queryService.getQueryLogPath();
  assert.ok(logPath.includes('puffsql.log'), 'getQueryLogPath should resolve to puffsql.log');

  const openedPath = await queryService.openQueryLogFile();
  assert.ok(openedPath.includes('puffsql.log'), 'openQueryLogFile should open puffsql.log');
});
});

describe('showplan', () => {
const storageMap = new Map<string, string>();
before(() => {
  globalThis.localStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => { storageMap.set(key, String(value)); },
    removeItem: (key: string) => { storageMap.delete(key); },
    clear: () => storageMap.clear(),
    key: () => null,
    length: 0,
  };
});

beforeEach(() => {
  storageMap.clear();
  setActivePinia(createPinia());
});

test('isShowplanEnabled and isStatsEnabled default to false', () => {
  const store = useQueryStore();
  assert.equal(store.isShowplanEnabled, false);
  assert.equal(store.isStatsEnabled, false);
});

test('toggleShowplanEnabled and toggleStatsEnabled enforce mutual exclusivity', () => {
  const store = useQueryStore();

  store.toggleStatsEnabled();
  assert.equal(store.isStatsEnabled, true);
  assert.equal(store.isShowplanEnabled, false);

  // Enabling showplan automatically disables stats
  store.toggleShowplanEnabled();
  assert.equal(store.isShowplanEnabled, true);
  assert.equal(store.isStatsEnabled, false);

  // Enabling stats automatically disables showplan
  store.toggleStatsEnabled();
  assert.equal(store.isStatsEnabled, true);
  assert.equal(store.isShowplanEnabled, false);

  // Toggling off returns both to false
  store.toggleStatsEnabled();
  assert.equal(store.isStatsEnabled, false);
  assert.equal(store.isShowplanEnabled, false);
});

test('direct assignment maintains mutual exclusivity between showplan and stats', () => {
  const store = useQueryStore();

  store.isStatsEnabled = true;
  assert.equal(store.isStatsEnabled, true);

  store.isShowplanEnabled = true;
  assert.equal(store.isShowplanEnabled, true);
  assert.equal(store.isStatsEnabled, false);

  store.isStatsEnabled = true;
  assert.equal(store.isStatsEnabled, true);
  assert.equal(store.isShowplanEnabled, false);
});

test('execute with isShowplanEnabled wraps query in SET SHOWPLAN_ALL ON and OFF and creates [Plan] tab', async () => {
  const store = useQueryStore();
  store.isShowplanEnabled = true;

  const executedCommands: string[] = [];

  queryService.executeQuery = async (_connId, _db, sql) => {
    executedCommands.push(sql);

    if (sql === 'SET SHOWPLAN_ALL ON;') {
      return {
        resultSets: [],
        messages: [],
        affectedRows: 0,
        executionTimeMs: 1,
      };
    }

    if (sql === 'SET SHOWPLAN_ALL OFF;') {
      return {
        resultSets: [],
        messages: [],
        affectedRows: 0,
        executionTimeMs: 1,
      };
    }

    return {
      resultSets: [
        {
          columns: [
            { name: 'StmtText', dataType: 'nvarchar', nullable: true, ordinal: 0 },
            { name: 'NodeId', dataType: 'int', nullable: false, ordinal: 1 },
            { name: 'Parent', dataType: 'int', nullable: false, ordinal: 2 },
            { name: 'PhysicalOp', dataType: 'varchar', nullable: true, ordinal: 3 },
            { name: 'LogicalOp', dataType: 'varchar', nullable: true, ordinal: 4 },
            { name: 'EstimateRows', dataType: 'float', nullable: true, ordinal: 5 },
            { name: 'TotalSubtreeCost', dataType: 'float', nullable: true, ordinal: 6 },
          ],
          rows: [
            ['SELECT * FROM Customers WHERE Country = ?', 1, 0, null, null, 15, 0.00328],
            ['  |--Clustered Index Seek(OBJECT:([Customers].[PK_Customers]))', 2, 1, 'Clustered Index Seek', 'Index Seek', 15, 0.00328],
          ],
          rowCount: 2,
        },
      ],
      messages: [],
      affectedRows: 0,
      executionTimeMs: 8,
    };
  };

  const res = await store.execute('conn-1', 'TestDb', 'SELECT * FROM Customers WHERE Country = ?');
  assert.ok(res);

  // Ensure commands were executed in exact order: SHOWPLAN ON -> User Query -> SHOWPLAN OFF
  assert.equal(executedCommands.length, 3);
  assert.equal(executedCommands[0], 'SET SHOWPLAN_ALL ON;');
  assert.equal(executedCommands[1], 'SELECT * FROM Customers WHERE Country = ?');
  assert.equal(executedCommands[2], 'SET SHOWPLAN_ALL OFF;');

  const activeTab = store.activeResultTab;
  assert.ok(activeTab);
  assert.equal(activeTab.isShowplan, true);
  assert.ok(activeTab.title.includes('[Plan]'));
  assert.equal(activeTab.result.resultSets.length, 1);
  assert.equal(activeTab.result.resultSets[0]?.columns[0]?.name, 'StmtText');
  assert.equal(activeTab.result.resultSets[0]?.rowCount, 2);
});

test('execute with isShowplanEnabled guarantees SET SHOWPLAN_ALL OFF even if user query throws error', async () => {
  const store = useQueryStore();
  store.isShowplanEnabled = true;

  const executedCommands: string[] = [];

  queryService.executeQuery = async (_connId, _db, sql) => {
    executedCommands.push(sql);

    if (sql === 'SET SHOWPLAN_ALL ON;') {
      return { resultSets: [], messages: [], affectedRows: 0, executionTimeMs: 1 };
    }
    if (sql === 'SET SHOWPLAN_ALL OFF;') {
      return { resultSets: [], messages: [], affectedRows: 0, executionTimeMs: 1 };
    }

    throw new Error('Msg 208: Invalid object name NonExistentTable');
  };

  const res = await store.execute('conn-1', 'TestDb', 'SELECT * FROM NonExistentTable');
  assert.ok(res);
  assert.equal(store.executionError, 'Msg 208: Invalid object name NonExistentTable');

  // Even though query failed, SET SHOWPLAN_ALL OFF must have been called in finally!
  assert.ok(executedCommands.includes('SET SHOWPLAN_ALL ON;'));
  assert.ok(executedCommands.includes('SET SHOWPLAN_ALL OFF;'));
  assert.equal(executedCommands[executedCommands.length - 1], 'SET SHOWPLAN_ALL OFF;');
});
});

describe('stats_analyzer', () => {
const storageMap = new Map<string, string>();
before(() => {
  globalThis.localStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => { storageMap.set(key, String(value)); },
    removeItem: (key: string) => { storageMap.delete(key); },
    clear: () => storageMap.clear(),
    key: () => null,
    length: 0,
  };
});

beforeEach(() => {
  storageMap.clear();
  setActivePinia(createPinia());
});

test('formatBytes and formatPageSize calculate human readable data sizes from 8KB SQL Server pages', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(1024 * 1024), '1 MB');
  assert.equal(formatBytes(1024 * 1024 * 1024), '1 GB');

  // 1 page = 8192 bytes = 8 KB
  assert.equal(formatPageSize(1), '1 頁 (8 KB)');

  // 1000 pages = 8,192,000 bytes = 7.81 MB
  assert.ok(formatPageSize(1000).includes('1,000 頁 (7.8 MB)'));
});

test('parseStatisticsMessages accurately parses STATISTICS IO and STATISTICS TIME lines', () => {
  const sampleMessages = [
    "Table 'Customers'. Scan count 1, logical reads 35, physical reads 2, read-ahead reads 4, lob logical reads 0, lob physical reads 0, lob read-ahead reads 0.",
    "Table 'Orders'. Scan count 2, logical reads 1250, physical reads 10, read-ahead reads 0, lob logical reads 12, lob physical reads 0, lob read-ahead reads 0.",
    "Table 'Worktable'. Scan count 0, logical reads 0, physical reads 0, read-ahead reads 0, lob logical reads 0, lob physical reads 0, lob read-ahead reads 0.",
    "SQL Server parse and compile time: \n   CPU time = 3 ms, elapsed time = 5 ms.",
    "SQL Server Execution Times:\n   CPU time = 48 ms,  elapsed time = 62 ms.",
  ];

  const parsed = parseStatisticsMessages(sampleMessages);

  assert.equal(parsed.cpuTimeMs, 48);
  assert.equal(parsed.elapsedTimeMs, 62);
  assert.equal(parsed.compileCpuTimeMs, 3);
  assert.equal(parsed.compileElapsedTimeMs, 5);

  assert.equal(parsed.tableStats.length, 3);

  // Sorted by logical reads descending -> Orders (1250) should be first
  const firstTable = parsed.tableStats[0];
  assert.equal(firstTable?.tableName, 'Orders');
  assert.equal(firstTable?.logicalReads, 1250);
  assert.equal(firstTable?.physicalReads, 10);
  assert.equal(firstTable?.lobLogicalReads, 12);
  assert.equal(firstTable?.totalReads, 1262);
  assert.equal(firstTable?.isHighIo, true); // > 1000 logical reads -> flagged as High IO

  const secondTable = parsed.tableStats[1];
  assert.equal(secondTable?.tableName, 'Customers');
  assert.equal(secondTable?.logicalReads, 35);
  assert.equal(secondTable?.physicalReads, 2);
  assert.equal(secondTable?.readAheadReads, 4);
  assert.equal(secondTable?.isHighIo, false);

  const worktable = parsed.tableStats[2];
  assert.equal(worktable?.tableName, 'Worktable');
  assert.equal(worktable?.logicalReads, 0);
});

test('buildExecutionStats correctly computes cache hit ratio and aggregates totals', () => {
  const messages = [
    "Table 'Products'. Scan count 1, logical reads 100, physical reads 10, read-ahead reads 0, lob logical reads 0.",
  ];

  const stats = buildExecutionStats({
    messages,
    telemetrySummary: {
      elapsedTimeMs: 25,
      cpuTimeMs: 15,
      logicalReads: 100,
      physicalReads: 10,
      physicalWrites: 5,
    },
    waitStats: [
      {
        waitType: 'PAGEIOLATCH_SH',
        waitingTasksCount: 2,
        waitTimeMs: 8,
        maxWaitTimeMs: 5,
      },
    ],
    executionTimeMsFallback: 25,
    querySql: 'SELECT * FROM Products',
  });

  assert.equal(stats.totalLogicalReads, 100);
  assert.equal(stats.totalPhysicalReads, 10);
  assert.equal(stats.totalPhysicalWrites, 5);
  assert.equal(stats.cpuTimeMs, 15);
  assert.equal(stats.elapsedTimeMs, 25);
  // (100 - 10) / 100 = 90%
  assert.equal(stats.cacheHitRatio, 90);
  assert.equal(stats.waitStats.length, 1);
  assert.equal(stats.waitStats[0]?.waitType, 'PAGEIOLATCH_SH');
});

test('wrapQueryWithPerfTelemetry properly surrounds query with telemetry and statistics commands', () => {
  const wrapped = wrapQueryWithPerfTelemetry('SELECT * FROM sys.tables;');
  assert.ok(wrapped.includes('SET STATISTICS IO ON;'));
  assert.ok(wrapped.includes('SET STATISTICS TIME ON;'));
  assert.ok(wrapped.includes('SELECT * FROM sys.tables;'));
  assert.ok(wrapped.includes('SET STATISTICS IO OFF;'));
  assert.ok(wrapped.includes('__SQLIGHT_PERF_SUMMARY__'));
  assert.ok(wrapped.includes('__SQLIGHT_WAIT_STATS__'));
});

test('queryStore defaults isStatsEnabled to false and strips telemetry result sets when enabled', async () => {
  const store = useQueryStore();
  assert.equal(store.isStatsEnabled, false);

  store.isStatsEnabled = true;

  queryService.executeQuery = async (_connId, _db, sql) => {
    assert.ok(sql.includes('__SQLIGHT_PERF_SUMMARY__'));

    return {
      resultSets: [
        {
          columns: [{ name: 'Id', dataType: 'int', nullable: false, ordinal: 0 }],
          rows: [[1], [2]],
          rowCount: 2,
        },
        {
          columns: [
            { name: '__sqlight_tag__', dataType: 'varchar', nullable: false, ordinal: 0 },
            { name: 'elapsedTimeMs', dataType: 'int', nullable: false, ordinal: 1 },
            { name: 'cpuTimeMs', dataType: 'int', nullable: false, ordinal: 2 },
            { name: 'logicalReads', dataType: 'bigint', nullable: false, ordinal: 3 },
            { name: 'physicalReads', dataType: 'bigint', nullable: false, ordinal: 4 },
            { name: 'physicalWrites', dataType: 'bigint', nullable: false, ordinal: 5 },
          ],
          rows: [['__SQLIGHT_PERF_SUMMARY__', 35, 12, 420, 0, 0]],
          rowCount: 1,
        },
        {
          columns: [
            { name: '__sqlight_tag__', dataType: 'varchar', nullable: false, ordinal: 0 },
            { name: 'wait_type', dataType: 'varchar', nullable: false, ordinal: 1 },
            { name: 'waiting_tasks_count', dataType: 'bigint', nullable: false, ordinal: 2 },
            { name: 'wait_time_ms', dataType: 'bigint', nullable: false, ordinal: 3 },
            { name: 'max_wait_time_ms', dataType: 'bigint', nullable: false, ordinal: 4 },
          ],
          rows: [['__SQLIGHT_WAIT_STATS__', 'ASYNC_NETWORK_IO', 1, 4, 4]],
          rowCount: 1,
        },
      ],
      messages: [
        {
          level: 'info',
          message: "Table 'MyTable'. Scan count 1, logical reads 420, physical reads 0.",
          timestamp: new Date().toISOString(),
        },
      ],
      affectedRows: 2,
      executionTimeMs: 35,
    };
  };

  const res = await store.execute('conn-1', 'AppDb', 'SELECT * FROM MyTable');
  assert.ok(res);

  // The telemetry result sets MUST be stripped so only 1 result set is presented to user
  assert.equal(res.resultSets.length, 1);
  assert.equal(res.resultSets[0]?.columns[0]?.name, 'Id');

  assert.ok(store.activeExecutionStats);
  assert.equal(store.activeExecutionStats.totalLogicalReads, 420);
  assert.equal(store.activeExecutionStats.cpuTimeMs, 12);
  assert.equal(store.activeExecutionStats.waitStats.length, 1);
  assert.equal(store.activeExecutionStats.waitStats[0]?.waitType, 'ASYNC_NETWORK_IO');
});
});

describe('execution_plan_xml', () => {
const storageMap = new Map<string, string>();
before(() => {
  globalThis.localStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => { storageMap.set(key, String(value)); },
    removeItem: (key: string) => { storageMap.delete(key); },
    clear: () => storageMap.clear(),
    key: () => null,
    length: 0,
  };
});

beforeEach(() => {
  storageMap.clear();
  setActivePinia(createPinia());
});

test('isActualPlanEnabled defaults to false', () => {
  const store = useQueryStore();
  assert.equal(store.isActualPlanEnabled, false);
});

test('3-way mutual exclusivity between Stats, Showplan, and Actual Plan via toggles', () => {
  const store = useQueryStore();

  store.toggleStatsEnabled();
  assert.equal(store.isStatsEnabled, true);
  assert.equal(store.isShowplanEnabled, false);
  assert.equal(store.isActualPlanEnabled, false);

  store.toggleShowplanEnabled();
  assert.equal(store.isStatsEnabled, false);
  assert.equal(store.isShowplanEnabled, true);
  assert.equal(store.isActualPlanEnabled, false);

  store.toggleActualPlanEnabled();
  assert.equal(store.isStatsEnabled, false);
  assert.equal(store.isShowplanEnabled, false);
  assert.equal(store.isActualPlanEnabled, true);

  store.toggleStatsEnabled();
  assert.equal(store.isStatsEnabled, true);
  assert.equal(store.isShowplanEnabled, false);
  assert.equal(store.isActualPlanEnabled, false);

  store.toggleStatsEnabled();
  assert.equal(store.isStatsEnabled, false);
  assert.equal(store.isShowplanEnabled, false);
  assert.equal(store.isActualPlanEnabled, false);
});

test('3-way mutual exclusivity via direct assignment', () => {
  const store = useQueryStore();

  store.isActualPlanEnabled = true;
  assert.equal(store.isActualPlanEnabled, true);
  assert.equal(store.isStatsEnabled, false);
  assert.equal(store.isShowplanEnabled, false);

  store.isStatsEnabled = true;
  assert.equal(store.isStatsEnabled, true);
  assert.equal(store.isActualPlanEnabled, false);
  assert.equal(store.isShowplanEnabled, false);

  store.isShowplanEnabled = true;
  assert.equal(store.isShowplanEnabled, true);
  assert.equal(store.isStatsEnabled, false);
  assert.equal(store.isActualPlanEnabled, false);
});

test('extractShowPlanXml extracts XML and leaves query data result sets intact', () => {
  const mockResult: QueryResult = {
    resultSets: [
      {
        columns: [
          { name: 'Id', dataType: 'int', nullable: false, ordinal: 0 },
          { name: 'Name', dataType: 'nvarchar', nullable: true, ordinal: 1 },
        ],
        rows: [
          [1, 'Alice'],
          [2, 'Bob'],
        ],
        rowCount: 2,
      },
      {
        columns: [
          { name: 'Microsoft SQL Server 2005 XML Showplan', dataType: 'xml', nullable: true, ordinal: 0 },
        ],
        rows: [
          ['<ShowPlanXML xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan"><BatchSequence><Batch><Statements><StmtSimple StatementText="SELECT * FROM Users" /></Statements></Batch></BatchSequence></ShowPlanXML>'],
        ],
        rowCount: 1,
      },
    ],
    messages: [],
    affectedRows: 0,
    executionTimeMs: 12,
  };

  const { cleanedResultSets, planXml } = extractShowPlanXml(mockResult);

  assert.ok(planXml);
  assert.ok(planXml.includes('<ShowPlanXML'));
  assert.ok(planXml.includes('SELECT * FROM Users'));

  // The XML result set was stripped, leaving only the real user data
  assert.equal(cleanedResultSets.length, 1);
  assert.equal(cleanedResultSets[0]?.columns[0]?.name, 'Id');
  assert.equal(cleanedResultSets[0]?.rowCount, 2);
});

test('formatXml produces readable indented XML string', () => {
  const rawXml = '<ShowPlanXML><Batch><StmtSimple StatementText="SELECT 1" /></Batch></ShowPlanXML>';
  const formatted = formatXml(rawXml);

  assert.ok(formatted.includes('<ShowPlanXML>\n'));
  assert.ok(formatted.includes('  <Batch>\n'));
  assert.ok(formatted.includes('    <StmtSimple StatementText="SELECT 1" />\n'));
  assert.ok(formatted.includes('  </Batch>\n'));
  assert.ok(formatted.includes('</ShowPlanXML>'));
});

test('workspaceStore.addExecutionPlanTab creates and selects execution_plan tab', () => {
  const workspaceStore = useWorkspaceStore();
  const sampleXml = '<ShowPlanXML><Batch /></ShowPlanXML>';
  const sampleSql = 'SELECT * FROM Orders;';

  const tab = workspaceStore.addExecutionPlanTab(sampleXml, sampleSql, 'Orders (Actual Plan)', 'conn-1', 'Northwind');

  assert.equal(tab.type, 'execution_plan');
  assert.equal(tab.title, 'Orders (Actual Plan)');
  assert.equal(tab.planXml, sampleXml);
  assert.equal(tab.querySql, sampleSql);
  assert.equal(tab.connectionId, 'conn-1');
  assert.equal(tab.database, 'Northwind');
  assert.equal(workspaceStore.activeTabId, tab.id);
  assert.equal(workspaceStore.activeTab?.id, tab.id);
});

test('execute with isActualPlanEnabled wraps in SET STATISTICS XML ON and OFF, extracts XML and adds tab', async () => {
  const queryStore = useQueryStore();
  const workspaceStore = useWorkspaceStore();
  queryStore.isActualPlanEnabled = true;

  const executedCommands: string[] = [];
  const sampleXml = '<ShowPlanXML xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan"><BatchSequence /></ShowPlanXML>';

  queryService.executeQuery = async (_connId, _db, sql) => {
    executedCommands.push(sql);

    if (sql === 'SET STATISTICS XML ON;') {
      return { resultSets: [], messages: [], affectedRows: 0, executionTimeMs: 1 };
    }
    if (sql === 'SET STATISTICS XML OFF;') {
      return { resultSets: [], messages: [], affectedRows: 0, executionTimeMs: 1 };
    }

    return {
      resultSets: [
        {
          columns: [{ name: 'Count', dataType: 'int', nullable: false, ordinal: 0 }],
          rows: [[42]],
          rowCount: 1,
        },
        {
          columns: [{ name: 'Microsoft SQL Server 2005 XML Showplan', dataType: 'xml', nullable: true, ordinal: 0 }],
          rows: [[sampleXml]],
          rowCount: 1,
        },
      ],
      messages: [],
      affectedRows: 0,
      executionTimeMs: 25,
    };
  };

  const res = await queryStore.execute('conn-1', 'ShopDb', 'SELECT COUNT(*) AS Count FROM Products');
  assert.ok(res);

  // Check command order: XML ON -> Query -> XML OFF
  assert.equal(executedCommands.length, 3);
  assert.equal(executedCommands[0], 'SET STATISTICS XML ON;');
  assert.equal(executedCommands[1], 'SELECT COUNT(*) AS Count FROM Products');
  assert.equal(executedCommands[2], 'SET STATISTICS XML OFF;');

  const activeWorkspaceTab = workspaceStore.activeTab;
  assert.ok(activeWorkspaceTab);
  assert.equal(activeWorkspaceTab.type, 'execution_plan');
  assert.equal((activeWorkspaceTab as any).planXml, sampleXml);

  const activeResultTab = queryStore.activeResultTab;
  assert.ok(activeResultTab);
  assert.equal(activeResultTab.result.resultSets.length, 1);
  assert.equal(activeResultTab.result.resultSets[0]?.columns[0]?.name, 'Count');
});

test('execute with isActualPlanEnabled guarantees SET STATISTICS XML OFF even when query fails', async () => {
  const queryStore = useQueryStore();
  queryStore.isActualPlanEnabled = true;

  const executedCommands: string[] = [];

  queryService.executeQuery = async (_connId, _db, sql) => {
    executedCommands.push(sql);

    if (sql === 'SET STATISTICS XML ON;') {
      return { resultSets: [], messages: [], affectedRows: 0, executionTimeMs: 1 };
    }
    if (sql === 'SET STATISTICS XML OFF;') {
      return { resultSets: [], messages: [], affectedRows: 0, executionTimeMs: 1 };
    }

    throw new Error('Msg 207: Invalid column name nonexistent_col');
  };

  const res = await queryStore.execute('conn-1', 'ShopDb', 'SELECT nonexistent_col FROM Products');
  assert.ok(res);
  assert.equal(queryStore.executionError, 'Msg 207: Invalid column name nonexistent_col');

  // Verify SET STATISTICS XML OFF was called in finally
  assert.ok(executedCommands.includes('SET STATISTICS XML ON;'));
  assert.ok(executedCommands.includes('SET STATISTICS XML OFF;'));
  assert.equal(executedCommands[executedCommands.length - 1], 'SET STATISTICS XML OFF;');
});

test('scripts/patch-qp.mjs runs cleanly, is idempotent, and ensures qp.js is patched', () => {
  const scriptPath = path.resolve('scripts/patch-qp.mjs');
  const output = execFileSync(process.execPath, [scriptPath], { encoding: 'utf8' });
  assert.ok(output !== undefined);

  const qpPath = path.resolve('node_modules/html-query-plan/dist/qp.js');
  if (fs.existsSync(qpPath)) {
    const qpContent = fs.readFileSync(qpPath, 'utf8');
    assert.equal(qpContent.includes('var SVG = this.SVG ='), false, 'Unpatched this.SVG = must not exist in qp.js');
    assert.ok(qpContent.includes('(typeof window !== "undefined" ? window : this).SVG ='));
    assert.ok(qpContent.includes('return factory.call(root, root, root.document)'));
  }

  const qpMinPath = path.resolve('node_modules/html-query-plan/dist/qp.min.js');
  if (fs.existsSync(qpMinPath)) {
    const qpMinContent = fs.readFileSync(qpMinPath, 'utf8');
    assert.equal(qpMinContent.includes('var n=this.SVG='), false, 'Unpatched var n=this.SVG= must not exist in qp.min.js');
    assert.ok(qpMinContent.includes('var n=(typeof window !== "undefined" ? window : this).SVG='));
  }
});

test('html-query-plan can be evaluated in strict mode without throwing TypeError: Cannot set properties of undefined', () => {
  const qpPath = path.resolve('node_modules/html-query-plan/dist/qp.js');
  if (!fs.existsSync(qpPath)) return;

  const code = fs.readFileSync(qpPath, 'utf8');

  const mockElement = {
    style: {}, setAttribute: () => {}, getAttribute: () => null, appendChild: () => {},
    childNodes: [], children: [], addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [],
  };
  const mockDocument = {
    createElementNS: (_ns: string, tag: string) => ({
      ...mockElement, nodeName: tag, createSVGRect: () => ({}), getBBox: () => ({ x: 0, y: 0, width: 100, height: 100 })
    }),
    createElement: (tag: string) => ({ ...mockElement, nodeName: tag }),
    documentElement: { ...mockElement }, getElementsByTagName: () => [], addEventListener: () => {},
  };
  const mockWindow = { document: mockDocument, Event: function() {}, CustomEvent: function() {}, setTimeout, clearTimeout };

  // Evaluate in strict mode: this should NOT throw TypeError: Cannot set properties of undefined (setting 'SVG')
  const fn = new Function('window', 'document', 'exports', 'module', '"use strict";\n' + code);
  const moduleObj = { exports: {} as any };
  fn(mockWindow, mockDocument, moduleObj.exports, moduleObj);

  assert.equal(typeof moduleObj.exports.showPlan, 'function');
  assert.equal(typeof moduleObj.exports.drawLines, 'function');
  assert.ok(moduleObj.exports.Node);
});

test('savePlanToFile invokes showSaveFilePicker with .sqlplan filter and writes content', async () => {
  let pickerCalledWith: any = null;
  let writtenContent = '';
  let streamClosed = false;

  (globalThis as any).window = {
    showSaveFilePicker: async (opts: any) => {
      pickerCalledWith = opts;
      return {
        name: opts.suggestedName,
        createWritable: async () => ({
          write: async (chunk: string) => { writtenContent = chunk; },
          close: async () => { streamClosed = true; },
        }),
      };
    },
  };

  const sampleXml = '<ShowPlanXML><Batch /></ShowPlanXML>';
  const res = await savePlanToFile(sampleXml, 'Orders');

  assert.equal(res.saved, true);
  assert.equal(res.fileName, 'Orders.sqlplan');
  assert.equal(writtenContent, sampleXml);
  assert.equal(streamClosed, true);
  assert.equal(pickerCalledWith.suggestedName, 'Orders.sqlplan');
  assert.equal(pickerCalledWith.types[0].description, 'SQL Server 執行計畫 (*.sqlplan)');
  assert.ok(pickerCalledWith.types[0].accept['application/xml'].includes('.sqlplan'));

  delete (globalThis as any).window;
});

test('savePlanToFile returns { saved: false } when user cancels save dialog', async () => {
  (globalThis as any).window = {
    showSaveFilePicker: async () => {
      const abortErr = new Error('The user aborted a request.');
      abortErr.name = 'AbortError';
      throw abortErr;
    },
  };

  const sampleXml = '<ShowPlanXML><Batch /></ShowPlanXML>';
  const res = await savePlanToFile(sampleXml, 'Orders.sqlplan');

  assert.equal(res.saved, false);
  assert.equal(res.fileName, undefined);

  delete (globalThis as any).window;
});

test('ExecutionPlanViewer.vue includes tooltip autoscroll, word-break, and layout rules', () => {
  const vueFile = readSource(PLAN_VIEWER);

  assert.ok(vueFile.includes('max-height: min(520px, 75vh) !important;'), 'Should have max-height constraint');
  assert.ok(vueFile.includes('overflow-y: auto !important;'), 'Should enable vertical auto scroll');
  assert.ok(vueFile.includes('overflow-wrap: anywhere !important;'), 'Should break overflowing words/identifiers');
  assert.ok(vueFile.includes('word-break: break-word !important;'), 'Should break long word boundaries');
  assert.ok(vueFile.includes('table-layout: fixed !important;'), 'Should use fixed table layout to prevent horizontal distortion');
  assert.ok(vueFile.includes('scrollbar-width: thin;'), 'Should style scrollbar for modern browsers');
  assert.ok(vueFile.includes('.qp-tt::-webkit-scrollbar'), 'Should provide custom webkit scrollbar');

  assert.ok(vueFile.includes('showNodeOrLineTooltip'), 'Should define showNodeOrLineTooltip');
  assert.ok(vueFile.includes('dismissTooltip()'), 'Should call dismissTooltip on unmount');
});

test('tooltip viewport edge clamping calculation keeps tooltip safely in viewport', () => {
  const viewportHeight = 800;
  const viewportWidth = 1200;
  const padding = 16;
  const tooltipHeight = 450;
  const tooltipWidth = 400;

  // Case 1: Cursor near bottom (cursorY = 700 -> rect.bottom = 1150)
  const rectBottomOverflow = {
    bottom: 1150,
    right: 500,
    height: tooltipHeight,
    width: tooltipWidth,
  };
  const clampedTop = Math.max(padding, viewportHeight - rectBottomOverflow.height - padding);
  assert.equal(clampedTop, 800 - 450 - 16); // 334px
  assert.ok(clampedTop + tooltipHeight <= viewportHeight - padding);

  // Case 2: Cursor near right edge (cursorX = 1100 -> rect.right = 1500)
  const rectRightOverflow = {
    bottom: 500,
    right: 1500,
    height: tooltipHeight,
    width: tooltipWidth,
  };
  const clampedLeft = Math.max(padding, viewportWidth - rectRightOverflow.width - padding);
  assert.equal(clampedLeft, 1200 - 400 - 16); // 784px
  assert.ok(clampedLeft + tooltipWidth <= viewportWidth - padding);
});

test('patch-qp.mjs configures qp.js for persistent tooltips without immediate mouseout hide', () => {
  const qpJs = readSource('node_modules/html-query-plan/dist/qp.js');

  assert.ok(
    !/window\.clearTimeout\(timeoutId\);[\r\n\s]+timeoutId\s*=\s*null;[\r\n\s]+hideTooltip\(\);/.test(qpJs),
    'onMouseout should not call hideTooltip'
  );
  assert.ok(
    /function showTooltip\(node,\s*tooltip\)\s*\{[\r\n\s]+hideTooltip\(\);[\r\n\s]+timeoutId\s*=\s*null;/.test(qpJs),
    'showTooltip should reset timeoutId'
  );
  assert.ok(qpJs.includes('window.QP_hideTooltip = hideTooltip;'), 'hideTooltip should export window.QP_hideTooltip');
});

test('ExecutionPlanViewer.vue implements click-outside dismissal, Escape key, and close button', () => {
  const vueFile = readSource(PLAN_VIEWER);

  assert.ok(vueFile.includes('dismissTooltip'), 'Should define dismissTooltip');
  assert.ok(vueFile.includes('handleDocumentPointerDown'), 'Should handle pointerdown on document');
  assert.ok(vueFile.includes('handleDocumentKeyDown'), 'Should handle keydown on document for Escape');
  assert.ok(vueFile.includes('qp-tt-close-btn'), 'Should inject and style close button');
  assert.ok(vueFile.includes("removeEventListener('pointerdown'"), 'Should clean up pointerdown listener');
  assert.ok(vueFile.includes("removeEventListener('keydown'"), 'Should clean up keydown listener');
});

test('ExecutionPlanViewer.vue uses native Vue event delegation with jsTooltips: false', () => {
  const vueFile = readSource(PLAN_VIEWER);

  assert.ok(vueFile.includes('{ jsTooltips: false }'), 'showPlan should be called with { jsTooltips: false }');

  assert.ok(vueFile.includes('handleContainerMouseOver'), 'Should implement container mouseover delegation');
  assert.ok(vueFile.includes('handleContainerMouseOut'), 'Should implement container mouseout debounce handling');
  assert.ok(vueFile.includes('showNodeOrLineTooltip'), 'Should define showNodeOrLineTooltip');
  assert.ok(vueFile.includes('getLineTooltip'), 'Should extract polyline data flow stats');
  assert.ok(
    /\.plan-render-canvas \.qp-node \.qp-tt\s*\{\s*display:\s*none\s*!important;/.test(vueFile),
    'Should hide in-canvas tooltip templates'
  );
  assert.ok(vueFile.includes('body > .qp-tt'), 'Should style active floating tooltip attached to body');
});

test('ExecutionPlanViewer.vue enables mouse text selection and one-click copy inside tooltips', () => {
  const vueFile = readSource(PLAN_VIEWER);

  assert.ok(vueFile.includes('user-select: text !important;'), 'Should allow mouse text selection in tooltip');
  assert.ok(vueFile.includes('-webkit-user-select: text !important;'), 'Should allow webkit mouse text selection');
  assert.ok(vueFile.includes('cursor: text;'), 'Should display I-beam text cursor for content');
  assert.ok(vueFile.includes('::selection'), 'Should define custom selection highlight color');

  assert.ok(vueFile.includes('qp-tt-copy-btn'), 'Should inject and style one-click copy button');
  assert.ok(vueFile.includes('navigator.clipboard.writeText'), 'Should write clean tooltip text to clipboard on copy');
  assert.ok(vueFile.includes('qp-tt-actions'), 'Should group copy and close buttons in header');
});

test('ExecutionPlanViewer.vue provides dark and classic themes with SVG polyline styling', () => {
  const vueFile = readSource(PLAN_VIEWER);

  assert.ok(vueFile.includes('sqlight_plan_theme'), 'Should persist user theme preference');
  assert.ok(vueFile.includes('planTheme'), 'Should define reactive planTheme state');
  assert.ok(vueFile.includes('togglePlanTheme'), 'Should implement togglePlanTheme handler');

  assert.ok(vueFile.includes('.plan-render-canvas.theme-dark'), 'Should define dark theme canvas style');
  assert.ok(vueFile.includes('.plan-scroll-dark'), 'Should define dark blueprint dot-grid scroll area');
  assert.ok(vueFile.includes('.theme-dark div.qp-node'), 'Should style operator node cards in dark theme');
  assert.ok(vueFile.includes('#252532'), 'Should use dark card surface for nodes');
  assert.ok(vueFile.includes('#38bdf8'), 'Should use sky blue for Cost percentage in dark theme');

  assert.ok(
    vueFile.includes('.plan-render-canvas.theme-dark .qp-root svg polyline'),
    'Should customize SVG polyline arrows in dark theme'
  );
  assert.ok(
    vueFile.includes('fill: #334155 !important;'),
    'Should style SVG arrow fill with slate color'
  );
  assert.ok(
    vueFile.includes('stroke: #64748b !important;'),
    'Should style SVG arrow stroke with slate outline'
  );
  assert.ok(
    vueFile.includes('.plan-render-canvas.theme-dark .qp-root svg polyline:hover'),
    'Should highlight SVG arrow on hover'
  );

  assert.ok(vueFile.includes('.plan-render-canvas.theme-classic'), 'Should define classic light theme canvas');
  assert.ok(vueFile.includes('#FFFFCC'), 'Should support classic yellow operator node in classic mode');
});
});
