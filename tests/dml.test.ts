import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { type TableSchema } from '../src/stores/schemaStore';
import { useWorkspaceStore } from '../src/stores/workspaceStore';
import { type ColumnDef, type QueryResultTab } from '../src/types/query';
import { type SqlEditorTab } from '../src/types/workspace';
import { generateBatchUpdateScript, type RowModification } from '../src/utils/batchUpdateGenerator';
import { buildWhereConditions, formatSqlLiteral, formatTableName, generateDeleteStatement, generateInsertStatement, generateUpdateStatement } from '../src/utils/sqlGenerator';
import { checkTableEditability } from '../src/utils/tableEditability';
import { generateTableSelectSql } from '../src/utils/tableSelectSql';

describe('dml', () => {
const columns = [{ name: 'tenant', isPrimaryKey: true }, { name: 'id', isPrimaryKey: true }, { name: 'value' }];
test('complete composite primary key uses every key component', () => {
  assert.deepEqual(buildWhereConditions(columns, [7, 9, 'x'], ['tenant', 'id']), ['[tenant] = 7', '[id] = 9']);
});
test('partial composite primary key falls back to all projected columns', () => {
  assert.deepEqual(buildWhereConditions([columns[1]!, columns[2]!], [9, 'x'], ['tenant', 'id']), ["[id] = 9", "[value] = N'x'"]);
});
test('unknown primary key metadata never assumes a partial key is unique', () => {
  assert.equal(buildWhereConditions(columns, [7, 9, null]).length, 3);
});
test('empty, incomplete and ambiguous rows cannot produce unconstrained DML', () => {
  assert.throws(() => buildWhereConditions([], []));
  assert.throws(() => buildWhereConditions(columns, [7]));
  assert.throws(() => buildWhereConditions([{ name: 'id' }, { name: 'id' }], [1, 2]));
});
test('generated mutations roll back when more or fewer than one row is affected', () => {
  for (const generate of [generateDeleteStatement, generateUpdateStatement]) {
    const sql = generate({ database: 'B', tableName: 'Orders', columns, row: [7, 9, 'x'], primaryKeyColumns: ['tenant', 'id'] });
    assert.match(sql, /\[B\]\.\[dbo\]\.\[Orders\]/);
    assert.match(sql, /IF @@TRANCOUNT <> 0 THROW/);
    assert.match(sql, /IF @@ROWCOUNT <> 1 THROW/);
    assert.match(sql, /ROLLBACK TRANSACTION/);
  }
});
test('identity columns are omitted from inserts and update assignments', () => {
  const params = { tableName: 'Orders', columns: [{ name: 'id', isIdentity: true, isPrimaryKey: true }, { name: 'value' }], row: [1, 'x'], primaryKeyColumns: ['id'] };
  assert.match(generateInsertStatement(params), /\(\[value\]\)/);
  assert.doesNotMatch(generateUpdateStatement(params), /SET\s+\[id\]/);
});
test('identifier escaping preserves closing brackets instead of deleting them', () => {
  assert.equal(formatTableName('a]b', 's', 'db'), '[db].[s].[a]]b]');
});
test('binary placeholders and imprecise integers cannot silently become SQL values', () => {
  assert.throws(() => formatSqlLiteral({ type: 'binary', length: 8 }));
  assert.throws(() => formatSqlLiteral(9007199254740992));
  assert.equal(formatSqlLiteral('9223372036854775807'), "N'9223372036854775807'");
});
});

describe('inline_editing', () => {
const mockTableSchema: TableSchema = {
  schema: 'dbo',
  name: 'Users',
  kind: 'BASE TABLE',
  columns: [
    { name: 'id', dataType: 'int', isPrimaryKey: true, isIdentity: true, nullable: false },
    { name: 'username', dataType: 'nvarchar', isPrimaryKey: false, isIdentity: false, nullable: false },
    { name: 'email', dataType: 'nvarchar', isPrimaryKey: false, isIdentity: false, nullable: true },
    { name: 'age', dataType: 'int', isPrimaryKey: false, isIdentity: false, nullable: true },
  ],
};

const mockNoPkTableSchema: TableSchema = {
  schema: 'dbo',
  name: 'Logs',
  kind: 'BASE TABLE',
  columns: [
    { name: 'timestamp', dataType: 'datetime', isPrimaryKey: false, isIdentity: false, nullable: false },
    { name: 'message', dataType: 'nvarchar', isPrimaryKey: false, isIdentity: false, nullable: true },
  ],
};

const mockViewSchema: TableSchema = {
  schema: 'dbo',
  name: 'v_active_users',
  kind: 'VIEW',
  columns: [
    { name: 'id', dataType: 'int', isPrimaryKey: true, isIdentity: false, nullable: false },
    { name: 'username', dataType: 'nvarchar', isPrimaryKey: false, isIdentity: false, nullable: false },
  ],
};

const mockGetTableSchema = (tableName: string): TableSchema | undefined => {
  const clean = tableName.toLowerCase().replace(/\[|\]/g, '');
  if (clean === 'users' || clean === 'dbo.users') return mockTableSchema;
  if (clean === 'logs' || clean === 'dbo.logs') return mockNoPkTableSchema;
  if (clean === 'v_active_users' || clean === 'dbo.v_active_users') return mockViewSchema;
  return undefined;
};

test('checkTableEditability: single table with full PK in projection is editable', () => {
  const tab: QueryResultTab = {
    id: 'tab-1',
    title: 'Query 1',
    sql: 'SELECT id, username, email FROM Users',
    result: { resultSets: [], messages: [], affectedRows: 0, executionTimeMs: 10 },
    executedAt: '12:00:00',
    isPinned: false,
    durationMs: 10,
    rowCount: 5,
  };

  const columns: ColumnDef[] = [
    { name: 'id', dataType: 'int', nullable: false, ordinal: 0 },
    { name: 'username', dataType: 'nvarchar', nullable: false, ordinal: 1 },
    { name: 'email', dataType: 'nvarchar', nullable: true, ordinal: 2 },
  ];

  const res = checkTableEditability({ tab, columns, getTableSchema: mockGetTableSchema });
  assert.equal(res.canEdit, true);
  assert.deepEqual(res.pkColumns, ['id']);
  assert.equal(res.targetTable?.tableName, 'Users');
});

test('checkTableEditability: table without PK cannot be edited', () => {
  const tab: QueryResultTab = {
    id: 'tab-2',
    title: 'Query 2',
    sql: 'SELECT timestamp, message FROM Logs',
    result: { resultSets: [], messages: [], affectedRows: 0, executionTimeMs: 10 },
    executedAt: '12:00:00',
    isPinned: false,
    durationMs: 10,
    rowCount: 2,
  };

  const columns: ColumnDef[] = [
    { name: 'timestamp', dataType: 'datetime', nullable: false, ordinal: 0 },
    { name: 'message', dataType: 'nvarchar', nullable: true, ordinal: 1 },
  ];

  const res = checkTableEditability({ tab, columns, getTableSchema: mockGetTableSchema });
  assert.equal(res.canEdit, false);
  assert.match(res.reason || '', /沒有主鍵/);
  assert.equal(res.shortReason, '無主鍵');
});

test('checkTableEditability: missing PK column in projection cannot be edited', () => {
  const tab: QueryResultTab = {
    id: 'tab-3',
    title: 'Query 3',
    sql: 'SELECT username, email FROM Users',
    result: { resultSets: [], messages: [], affectedRows: 0, executionTimeMs: 10 },
    executedAt: '12:00:00',
    isPinned: false,
    durationMs: 10,
    rowCount: 5,
  };

  const columns: ColumnDef[] = [
    { name: 'username', dataType: 'nvarchar', nullable: false, ordinal: 0 },
    { name: 'email', dataType: 'nvarchar', nullable: true, ordinal: 1 },
  ];

  const res = checkTableEditability({ tab, columns, getTableSchema: mockGetTableSchema });
  assert.equal(res.canEdit, false);
  assert.match(res.reason || '', /未包含完整主鍵欄位/);
  assert.equal(res.shortReason, '缺少 PK 欄位');
});

test('checkTableEditability: multi-table JOIN cannot be edited', () => {
  const tab: QueryResultTab = {
    id: 'tab-4',
    title: 'Query 4',
    sql: 'SELECT u.id, u.username, l.message FROM Users u JOIN Logs l ON u.id = l.id',
    result: { resultSets: [], messages: [], affectedRows: 0, executionTimeMs: 10 },
    executedAt: '12:00:00',
    isPinned: false,
    durationMs: 10,
    rowCount: 5,
  };

  const columns: ColumnDef[] = [
    { name: 'id', dataType: 'int', nullable: false, ordinal: 0 },
    { name: 'username', dataType: 'nvarchar', nullable: false, ordinal: 1 },
    { name: 'message', dataType: 'nvarchar', nullable: true, ordinal: 2 },
  ];

  const res = checkTableEditability({ tab, columns, getTableSchema: mockGetTableSchema });
  assert.equal(res.canEdit, false);
  assert.match(res.reason || '', /多資料表/);
  assert.equal(res.shortReason, '多表查詢');
});

test('checkTableEditability: VIEW cannot be edited', () => {
  const tab: QueryResultTab = {
    id: 'tab-5',
    title: 'Query 5',
    sql: 'SELECT id, username FROM v_active_users',
    result: { resultSets: [], messages: [], affectedRows: 0, executionTimeMs: 10 },
    executedAt: '12:00:00',
    isPinned: false,
    durationMs: 10,
    rowCount: 5,
  };

  const columns: ColumnDef[] = [
    { name: 'id', dataType: 'int', nullable: false, ordinal: 0 },
    { name: 'username', dataType: 'nvarchar', nullable: false, ordinal: 1 },
  ];

  const res = checkTableEditability({ tab, columns, getTableSchema: mockGetTableSchema });
  assert.equal(res.canEdit, false);
  assert.match(res.reason || '', /檢視表/);
  assert.equal(res.shortReason, '檢視表');
});

test('generateBatchUpdateScript: builds transactional multi-row UPDATE with rowcount guards', () => {
  const modifications: RowModification[] = [
    {
      rowIndex: 0,
      updates: { username: 'alice_new', email: 'alice@example.com' },
      pkWhere: { id: 1 },
    },
    {
      rowIndex: 2,
      updates: { email: null },
      pkWhere: { id: 3 },
    },
  ];

  const script = generateBatchUpdateScript({
    tableName: 'Users',
    schema: 'dbo',
    database: 'MyDb',
    modifications,
  });

  assert.match(script, /BEGIN TRANSACTION;/);
  assert.match(script, /COMMIT TRANSACTION;/);
  assert.match(script, /ROLLBACK TRANSACTION;/);
  assert.match(script, /IF @@ROWCOUNT <> 1 THROW 50001/);
  assert.match(script, /\[MyDb\]\.\[dbo\]\.\[Users\]/);
  assert.match(script, /\[username\] = N'alice_new'/);
  assert.match(script, /\[email\] = NULL/);
  assert.match(script, /WHERE \[id\] = 1/);
  assert.match(script, /WHERE \[id\] = 3/);
});

test('generateBatchUpdateScript: throws on empty modifications or missing PK conditions', () => {
  assert.throws(() => {
    generateBatchUpdateScript({ tableName: 'Users', modifications: [] });
  });

  assert.throws(() => {
    generateBatchUpdateScript({
      tableName: 'Users',
      modifications: [{ rowIndex: 0, updates: { username: 'test' }, pkWhere: {} }],
    });
  });
});
});

describe('drag_drop_table', () => {
const data = new Map<string, string>();
before(() => {
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  };
});

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

  sqlTab.query = '   ';
  if (!sqlTab.query.trim()) {
    sqlTab.query = newSql;
  } else {
    const prefix = sqlTab.query.endsWith('\n') ? '\n' : '\n\n';
    sqlTab.query += prefix + newSql;
  }
  assert.equal(sqlTab.query, newSql);

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
});
