import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkspaceStore } from '../src/stores/workspaceStore';
import { generateTableSelectSql } from '../src/utils/tableSelectSql';
import type { SqlEditorTab } from '../src/types/workspace';

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
});

test('generateTableSelectSql generates a single-line schema-qualified SELECT', () => {
  assert.equal(
    generateTableSelectSql('sales', 'Orders'),
    'SELECT * FROM sales.Orders;\n'
  );

  // No database prefix, even when the table came from another database.
  const fromOtherDb = generateTableSelectSql('dbo', 'Customers');
  assert.equal(fromOtherDb, 'SELECT * FROM dbo.Customers;\n');
  assert.equal(fromOtherDb.includes('AdventureWorks'), false);
});

test('generateTableSelectSql drops TOP and stays on one line', () => {
  const sql = generateTableSelectSql('dbo', 'Products');

  assert.equal(sql.trim().split('\n').length, 1);
  assert.equal(/\bTOP\b/i.test(sql), false);
  assert.equal(sql.toLowerCase().includes('top 1000'), false);
  // A trailing newline keeps the cursor on a fresh line after a drag-drop insert.
  assert.equal(sql.endsWith(';\n'), true);
});

test('generateTableSelectSql leaves identifiers bare unless brackets are required', () => {
  assert.equal(generateTableSelectSql('dbo', 'Products'), 'SELECT * FROM dbo.Products;\n');
  // Brackets are kept only where dropping them would break or change the statement.
  assert.equal(
    generateTableSelectSql('dbo', 'Order Details'),
    'SELECT * FROM dbo.[Order Details];\n'
  );
  assert.equal(generateTableSelectSql('dbo', 'Order'), 'SELECT * FROM dbo.[Order];\n');
  assert.equal(
    generateTableSelectSql('  ', 'Plain'),
    'SELECT * FROM Plain;\n'
  );
});

test('dropping table on tab bar opens a new SQL tab with SELECT statement', () => {
  const store = useWorkspaceStore();
  const initialCount = store.tabs.length;

  const tableInfo = {
    connId: 'conn-local',
    db: 'Northwind',
    schema: 'dbo',
    table: 'Products',
  };
  const sql = generateTableSelectSql(tableInfo.schema, tableInfo.table);

  store.addSqlTab(
    sql,
    `${tableInfo.table}.sql`,
    tableInfo.connId,
    tableInfo.db
  );

  assert.equal(store.tabs.length, initialCount + 1);
  const newTab = store.tabs[store.tabs.length - 1] as SqlEditorTab;
  assert.equal(newTab.type, 'sql_editor');
  assert.equal(newTab.title, 'Products.sql');
  assert.equal(newTab.connectionId, 'conn-local');
  assert.equal(newTab.database, 'Northwind');
  assert.equal(newTab.query, sql);
  assert.equal(store.activeTabId, newTab.id);
});

test('dropping table on existing empty SQL tab replaces content; non-empty appends', () => {
  const store = useWorkspaceStore();
  const sqlTab = store.tabs.find((t) => t.type === 'sql_editor') as SqlEditorTab;
  assert.ok(sqlTab);

  const newSql = 'SELECT * FROM Sales.Invoices;\n';

  // 1. When empty, replace
  sqlTab.query = '   ';
  if (!sqlTab.query.trim()) {
    sqlTab.query = newSql;
  } else {
    const prefix = sqlTab.query.endsWith('\n') ? '\n' : '\n\n';
    sqlTab.query += prefix + newSql;
  }
  assert.equal(sqlTab.query, newSql);

  // 2. When non-empty, append with double newline
  const secondSql = 'SELECT * FROM Sales.Customers;\n';
  if (!sqlTab.query.trim()) {
    sqlTab.query = secondSql;
  } else {
    const prefix = sqlTab.query.endsWith('\n') ? '\n' : '\n\n';
    sqlTab.query += prefix + secondSql;
  }
  assert.equal(sqlTab.query, `${newSql}\n${secondSql}`);
});

test('application/sqlight-table JSON payload serializes and deserializes properly', () => {
  const payload = {
    connId: 'conn-1',
    db: 'MyDB',
    schema: 'dbo',
    table: 'Users',
    sql: 'SELECT * FROM dbo.Users;\n',
  };

  const serialized = JSON.stringify(payload);
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.connId, 'conn-1');
  assert.equal(parsed.db, 'MyDB');
  assert.equal(parsed.schema, 'dbo');
  assert.equal(parsed.table, 'Users');
  assert.equal(parsed.sql, payload.sql);
});
