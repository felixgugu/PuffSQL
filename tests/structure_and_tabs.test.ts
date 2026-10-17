import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkspaceStore } from '../src/stores/workspaceStore';
import { useQueryStore, resetQueryExecutionSeq } from '../src/stores/queryStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { queryService } from '../src/services/queryService';
import { splitSqlStatements } from '../src/utils/sqlStatementExtractor';
import { getTabThemeStyle } from '../src/utils/tabTheme';
import type { QueryResult } from '../src/types/query';

const data = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => { data.set(key, String(value)); },
  removeItem: (key) => { data.delete(key); },
  clear: () => data.clear(),
  key: () => null,
  length: 0,
};

beforeEach(() => {
  data.clear();
  setActivePinia(createPinia());
  resetQueryExecutionSeq();
});

test('addTableStructureTab appends a tab at the end and switches active tab', () => {
  const store = useWorkspaceStore();
  const initialCount = store.tabs.length;

  store.addTableStructureTab('dbo', 'Employees', 'conn-1', 'AdventureWorks');

  assert.equal(store.tabs.length, initialCount + 1);
  const createdTab = store.tabs[store.tabs.length - 1];
  assert.equal(createdTab?.type, 'table_structure');
  assert.equal(createdTab?.title, 'dbo.Employees (Structure)');
  assert.equal(store.activeTabId, createdTab?.id);

  // Calling again for the same table and database should activate existing without duplicate
  store.addTableStructureTab('dbo', 'Employees', 'conn-1', 'AdventureWorks');
  assert.equal(store.tabs.length, initialCount + 1);
  assert.equal(store.activeTabId, createdTab?.id);
});

test('newly added tabs are placed sequentially (oldest -> newest, appended to the right)', () => {
  const store = useWorkspaceStore();

  assert.ok(store.tabs.length >= 1);
  const originalFirstId = store.tabs[0].id;

  store.addSqlTab('SELECT 1;', 'Query 10.sql');
  assert.equal(store.tabs[store.tabs.length - 1].title, 'Query 10.sql');
  assert.equal(store.activeTabId, store.tabs[store.tabs.length - 1].id);
  assert.equal(store.tabs[0].id, originalFirstId);

  store.addSqlTab('SELECT 2;', 'Query 11.sql');
  assert.equal(store.tabs[store.tabs.length - 1].title, 'Query 11.sql');
  assert.equal(store.tabs[store.tabs.length - 2].title, 'Query 10.sql');
  assert.equal(store.activeTabId, store.tabs[store.tabs.length - 1].id);

  store.addTableDataTab('sales', 'Customers', 'conn-1', 'TestDB');
  assert.equal(store.tabs[store.tabs.length - 1].title, 'sales.Customers (Data)');
  assert.equal(store.activeTabId, store.tabs[store.tabs.length - 1].id);

  store.addExecutionPlanTab('<ShowPlanXML />', 'SELECT 1;', 'Plan Alpha');
  assert.equal(store.tabs[store.tabs.length - 1].title, 'Plan Alpha');
  assert.equal(store.activeTabId, store.tabs[store.tabs.length - 1].id);
});

test('queryExecutionSeq increments sequentially and titles follow $SEQ.$Tabname', async () => {
  const store = useQueryStore();
  // These assertions cover the accumulate path, which is now opt-in (off by default).
  useSettingsStore().accumulateResultTabs = true;

  queryService.executeQuery = async (_connId, _db, sql) => {
    const isOrders = sql.includes('Orders');
    const rowCount = isOrders ? 12 : 50;
    return {
      resultSets: [
        {
          columns: [{ name: 'Id', dataType: 'int', nullable: false, ordinal: 0 }],
          rows: Array.from({ length: rowCount }, (_, i) => [i + 1]),
          rowCount,
        },
      ],
      messages: [],
      affectedRows: 0,
      executionTimeMs: 15,
    } as QueryResult;
  };

  await store.execute('conn-1', 'master', 'SELECT * FROM Customers;');
  assert.equal(store.resultTabs.length, 1);
  assert.equal(store.resultTabs[0]?.title, '1.Customers');
  assert.equal(store.resultTabs[0]?.seq, 1);
  assert.equal(store.resultTabs[0]?.rowCount, 50);

  await store.execute('conn-1', 'master', 'SELECT * FROM Orders;');
  assert.equal(store.resultTabs.length, 2);
  assert.equal(store.resultTabs[0]?.title, '2.Orders');
  assert.equal(store.resultTabs[0]?.seq, 2);
  assert.equal(store.resultTabs[0]?.rowCount, 12);

  queryService.executeQuery = async () => {
    throw new Error('Table does not exist');
  };
  await store.execute('conn-1', 'master', 'SELECT * FROM NonExistentTable;');
  assert.equal(store.resultTabs.length, 2);
  assert.equal(store.executionError, 'Table does not exist');

  queryService.executeQuery = async () => ({
    resultSets: [
      {
        columns: [{ name: 'Id', dataType: 'int', nullable: false, ordinal: 0 }],
        rows: [],
        rowCount: 0,
      },
    ],
    messages: [],
    affectedRows: 0,
    executionTimeMs: 5,
  } as QueryResult);
  await store.execute('conn-1', 'master', 'SELECT * FROM Customers WHERE 1 = 0;');
  assert.equal(store.resultTabs.length, 2);

  queryService.executeQuery = async () => ({
    resultSets: [],
    messages: [{ level: 'info', message: '(1 row affected)', timestamp: new Date().toISOString() }],
    affectedRows: 1,
    executionTimeMs: 10,
  } as QueryResult);
  await store.execute('conn-1', 'master', 'UPDATE Customers SET Name = "New";');
  assert.equal(store.resultTabs.length, 2);
});

test('queryStore aggregates rowCount across multiple resultSets and adds [N sets] to tab title', async () => {
  const store = useQueryStore();
  // These assertions cover the accumulate path, which is now opt-in (off by default).
  useSettingsStore().accumulateResultTabs = true;

  queryService.executeQuery = async () => {
    return {
      resultSets: [
        {
          columns: [{ name: 'Id', dataType: 'int', nullable: false, ordinal: 0 }],
          rows: Array.from({ length: 18 }, (_, i) => [i + 1]),
          rowCount: 18,
        },
        {
          columns: [{ name: 'Code', dataType: 'varchar', nullable: true, ordinal: 0 }],
          rows: Array.from({ length: 27 }, (_, i) => [`code-${i + 1}`]),
          rowCount: 27,
        },
      ],
      messages: [],
      affectedRows: 0,
      executionTimeMs: 25,
    } as QueryResult;
  };

  await store.execute('conn-1', 'master', 'SELECT TOP 1000 * FROM tblLoginData; SELECT TOP 100 * FROM tblServiceEntry;');
  assert.equal(store.resultTabs.length, 1);
  assert.equal(store.resultTabs[0]?.rowCount, 45); // 18 + 27
  assert.equal(store.resultTabs[0]?.title, '1.tblLoginData [2 sets]');

  queryService.executeQuery = async () => {
    return {
      resultSets: [
        {
          columns: [{ name: 'Id', dataType: 'int', nullable: false, ordinal: 0 }],
          rows: Array.from({ length: 18 }, (_, i) => [i + 1]),
          rowCount: 18,
        },
        {
          columns: [{ name: 'Code', dataType: 'varchar', nullable: true, ordinal: 0 }],
          rows: Array.from({ length: 27 }, (_, i) => [`code-${i + 1}`]),
          rowCount: 27,
        },
        {
          columns: [{ name: 'UserId', dataType: 'int', nullable: false, ordinal: 0 }],
          rows: Array.from({ length: 30 }, (_, i) => [100 + i]),
          rowCount: 30,
        },
      ],
      messages: [],
      affectedRows: 0,
      executionTimeMs: 38,
    } as QueryResult;
  };

  await store.execute('conn-1', 'master', 'SELECT * FROM tbl1; SELECT * FROM tbl2; SELECT * FROM tbl3;');
  assert.equal(store.resultTabs.length, 2);
  assert.equal(store.resultTabs[0]?.rowCount, 75); // 18 + 27 + 30
  assert.equal(store.resultTabs[0]?.title, '2.tbl1 [3 sets]');
});


test('active SQL query tab applies theme color to borders', () => {
  const style = getTabThemeStyle('sql_editor', true);
  assert.equal(style['--tab-border'], 'rgb(var(--color-accent))');
  assert.equal(style['--tab-top-accent'], 'rgb(var(--color-accent))');
});

test('addErDiagramTab adds an er_diagram tab at index 0 and activates it', () => {
  const store = useWorkspaceStore();
  const initialCount = store.tabs.length;

  store.addErDiagramTab({
    rootSchema: 'dbo',
    rootTable: 'Orders',
    depth: 1,
    connectionId: 'conn-1',
    database: 'Northwind',
  });

  assert.equal(store.tabs.length, initialCount + 1);
  const createdTab = store.tabs[store.tabs.length - 1];
  assert.equal(createdTab?.type, 'er_diagram');
  assert.equal(createdTab?.title, 'ER: Orders');
  assert.equal(store.activeTabId, createdTab?.id);

  // Calling again for the same root table should activate existing without duplicate
  store.addErDiagramTab({
    rootSchema: 'dbo',
    rootTable: 'Orders',
    depth: 1,
    connectionId: 'conn-1',
    database: 'Northwind',
  });
  assert.equal(store.tabs.length, initialCount + 1);
  assert.equal(store.activeTabId, createdTab?.id);
});

test('addErDiagramTab defaults depth to 2 when omitted', () => {
  const store = useWorkspaceStore();
  store.addErDiagramTab({
    rootSchema: 'dbo',
    rootTable: 'Products',
    connectionId: 'conn-1',
    database: 'Northwind',
  });

  const tab = store.tabs[store.tabs.length - 1] as any;
  assert.equal(tab.type, 'er_diagram');
  assert.equal(tab.depth, 2);
});

test('addErDiagramTab supports restoring from file with initialData', () => {
  const store = useWorkspaceStore();
  const initialCount = store.tabs.length;

  const mockX6Data = {
    type: 'sqlight_er_model',
    version: '1.0',
    graph: { cells: [] },
  };

  store.addErDiagramTab({
    title: 'CustomerModel.sqlight-er.json',
    initialData: mockX6Data,
    fileName: 'CustomerModel.sqlight-er.json',
  });

  assert.equal(store.tabs.length, initialCount + 1);
  const createdTab = store.tabs[store.tabs.length - 1];
  assert.equal(createdTab?.type, 'er_diagram');
  assert.equal(createdTab?.title, 'CustomerModel.sqlight-er.json');
  assert.equal(store.activeTabId, createdTab?.id);
});

test('splitSqlStatements correctly splits multiple statements by top-level semicolon', () => {
  const sql = `
    SELECT TOP 1000 * FROM [Info360_AICC].[dbo].[tblLoginData];
    -- comment with ; semicolon
    SELECT TOP 100 * FROM [tblServiceEntry] WHERE note = 'abc;123';
    /* multi-line comment ; */
    SELECT 1 AS [col;name];
  `;

  const stmts = splitSqlStatements(sql);
  assert.equal(stmts.length, 3);
  assert.match(stmts[0]!, /tblLoginData/);
  assert.match(stmts[1]!, /tblServiceEntry/);
  assert.match(stmts[2]!, /SELECT 1/);
});

test('refreshTabResultSet re-runs query SQL and updates tab in-place for single result set', async () => {
  const store = useQueryStore();

  let executionCount = 0;
  queryService.executeQuery = async () => {
    executionCount++;
    const rowCount = executionCount === 1 ? 10 : 25;
    return {
      resultSets: [
        {
          columns: [{ name: 'Id', dataType: 'int', nullable: false, ordinal: 0 }],
          rows: Array.from({ length: rowCount }, (_, i) => [i + 1]),
          rowCount,
        },
      ],
      messages: [{ level: 'info', message: `Executed #${executionCount}`, timestamp: new Date().toISOString() }],
      affectedRows: 0,
      executionTimeMs: 12,
    } as QueryResult;
  };

  await store.execute('conn-1', 'master', 'SELECT * FROM Customers;');
  assert.equal(store.resultTabs.length, 1);
  const tabId = store.resultTabs[0]!.id;
  assert.equal(store.resultTabs[0]!.rowCount, 10);

  const refreshRes = await store.refreshTabResultSet(tabId, 0);
  assert.equal(refreshRes.success, true);
  assert.equal(refreshRes.rowCount, 25);
  assert.equal(store.resultTabs.length, 1);
  assert.equal(store.resultTabs[0]!.id, tabId);
  assert.equal(store.resultTabs[0]!.rowCount, 25);
  assert.equal(store.resultTabs[0]!.result.resultSets[0]!.rowCount, 25);
});

test('refreshTabResultSet re-runs specific statement and updates target result set in-place for multi-result set tab', async () => {
  const store = useQueryStore();

  queryService.executeQuery = async (_cId, _db, sql) => {
    if (!sql.includes('tblLoginData') && sql.includes('tblServiceEntry')) {
      // Re-running just the second statement
      return {
        resultSets: [
          {
            columns: [{ name: 'EntryId', dataType: 'int', nullable: false, ordinal: 0 }],
            rows: Array.from({ length: 40 }, (_, i) => [i + 1]),
            rowCount: 40,
          },
        ],
        messages: [],
        affectedRows: 0,
        executionTimeMs: 15,
      } as QueryResult;
    }

    return {
      resultSets: [
        {
          columns: [{ name: 'LoginId', dataType: 'int', nullable: false, ordinal: 0 }],
          rows: Array.from({ length: 18 }, (_, i) => [i + 1]),
          rowCount: 18,
        },
        {
          columns: [{ name: 'EntryId', dataType: 'int', nullable: false, ordinal: 0 }],
          rows: Array.from({ length: 27 }, (_, i) => [i + 1]),
          rowCount: 27,
        },
      ],
      messages: [],
      affectedRows: 0,
      executionTimeMs: 25,
    } as QueryResult;
  };

  await store.execute(
    'conn-1',
    'master',
    'SELECT TOP 1000 * FROM [tblLoginData];\nSELECT TOP 100 * FROM [tblServiceEntry];'
  );

  assert.equal(store.resultTabs.length, 1);
  const tabId = store.resultTabs[0]!.id;
  assert.equal(store.resultTabs[0]!.rowCount, 45); // 18 + 27
  assert.equal(store.resultTabs[0]!.result.resultSets[0]!.rowCount, 18);
  assert.equal(store.resultTabs[0]!.result.resultSets[1]!.rowCount, 27);

  // Refresh only Grid #1 (setIndex = 1, which is tblServiceEntry)
  const refreshRes = await store.refreshTabResultSet(tabId, 1);
  assert.equal(refreshRes.success, true);
  assert.equal(refreshRes.rowCount, 40);

  assert.equal(store.resultTabs.length, 1);
  assert.equal(store.resultTabs[0]!.result.resultSets[0]!.rowCount, 18);
  assert.equal(store.resultTabs[0]!.result.resultSets[1]!.rowCount, 40);
  assert.equal(store.resultTabs[0]!.rowCount, 58);
});

test('duplicateSqlTab duplicates an SQL tab with all its content, connection, and database without linking original filePath', () => {
  const store = useWorkspaceStore();

  const originalSql = 'SELECT * FROM Users WHERE active = 1;\nSELECT 42;';
  const originalTabId = store.addSqlTab(
    originalSql,
    'UsersReport.sql',
    'conn-prod',
    'ProdDB',
    'C:/Projects/UsersReport.sql'
  );

  const initialCount = store.tabs.length;
  const originalIdx = store.tabs.findIndex((t) => t.id === originalTabId);

  const newTabId = store.duplicateSqlTab(originalTabId);
  assert.ok(newTabId);
  assert.notEqual(newTabId, originalTabId);
  assert.equal(store.tabs.length, initialCount + 1);

  assert.equal(store.activeTabId, newTabId);

  const newIdx = store.tabs.findIndex((t) => t.id === newTabId);
  assert.equal(newIdx, originalIdx + 1);

  const newTab = store.tabs[newIdx];
  assert.equal(newTab.type, 'sql_editor');
  assert.equal(newTab.title, 'UsersReport (Copy).sql');
  assert.equal((newTab as any).query, originalSql);
  assert.equal(newTab.connectionId, 'conn-prod');
  assert.equal(newTab.database, 'ProdDB');
  // Should NOT inherit physical filePath to avoid unintended file overwrites
  assert.equal((newTab as any).filePath, undefined);
  assert.equal(newTab.isDirty, true);

  const thirdTabId = store.duplicateSqlTab(originalTabId);
  assert.ok(thirdTabId);
  const thirdTab = store.tabs.find((t) => t.id === thirdTabId);
  assert.equal(thirdTab?.title, 'UsersReport (Copy 2).sql');

  assert.equal(store.duplicateSqlTab('non-existent-id'), null);
});


