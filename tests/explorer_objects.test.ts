import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { useConnectionStore } from '../src/stores/connectionStore';
import { useSchemaStore } from '../src/stores/schemaStore';
import { filterAndRankQuickObjects, fuzzyMatch, highlightMatchedChunks, parseSearchQuery, type QuickFinderItem } from '../src/utils/fuzzySearch';
import { readSource } from './helpers/source';

describe('table_objects', () => {
const sidebar = 'src/components/layout/AppSidebar.vue';
const rows = 'src/components/layout/ExplorerObjectRows.vue';

/**
 * The Explorer lists constraints, indexes and triggers under a table or view, and the CREATE script
 * is built from the same payload. These guardrails keep the four layers wired together: the Rust
 * command, the browser mock, the tree, and the script generator.
 */
describe('table objects in the Explorer', () => {
  test('the Rust command is exposed as a driver method, a command and an invoke handler', () => {
    assert.match(readSource('src-tauri/src/drivers/mod.rs'), /async fn get_table_objects\(/);
    assert.match(readSource('src-tauri/src/commands/schema_commands.rs'), /pub async fn get_table_objects\(/);
    assert.match(readSource('src-tauri/src/lib.rs'), /^\s+get_table_objects,$/m, 'the command is registered');
    assert.match(
      readSource('src-tauri/src/drivers/mssql/metadata_sql.rs'),
      /pub fn table_objects_batch\(/,
      'the metadata SQL lives in its own testable module'
    );
  });

  test('the front end reaches it through the service layer and a browser mock', () => {
    assert.match(readSource('src/services/schemaService.ts'), /async getTableObjects\(/);
    assert.match(readSource('src/services/schemaService.ts'), /invokeCommand<TableObjects>\('get_table_objects'/);

    const api = readSource('src/services/api.ts');
    assert.match(api, /case 'get_table_objects':/, 'browser mode has to answer too');
    for (const kind of ['PRIMARY_KEY', 'UNIQUE', 'CHECK', 'DEFAULT', 'FOREIGN_KEY']) {
      assert.ok(api.includes(`kind: '${kind}'`), `the mock covers ${kind}`);
    }
    assert.ok(api.includes('isInsteadOf') && api.includes('filterDefinition'), 'the mock is realistic');
  });

  test('expanding a node loads everything in one call, and the scripts read the same cache', () => {
    const source = readSource(sidebar);

    assert.match(source, /async function toggleTable\(/, 'the tree still expands lazily');
    assert.match(source, /await schemaService\.getTableObjects\(connId, schema, tableName, db\)/);
    assert.match(source, /async function ensureTableObjects\(/, 'scripts can request the payload directly');
    assert.doesNotMatch(source, /schemaService\.getColumns\(/, 'the columns-only call is no longer the tree path');
  });

  test('the generated script is handed the constraints, indexes and triggers', () => {
    const source = readSource(sidebar);
    const ddlCall = source.slice(source.indexOf('const ddl = generateCreateTableDdl('));

    for (const field of ['constraints', 'indexes', 'triggers']) {
      assert.ok(
        ddlCall.slice(0, 400).includes(`${field}: objects?.${field}`),
        `the DDL call forwards ${field}`
      );
    }
  });

  test('the tree renders the new rows next to the columns, for tables and views', () => {
    const source = readSource(sidebar);

    assert.equal(
      source.split('<ExplorerObjectRows').length - 1,
      2,
      'one instance in the table branch and one in the view branch'
    );
    assert.match(source, /:items="explorerObjectMenuItems"/, 'the object menu is mounted');
    assert.match(source, /function openExplorerObjectContextMenu\(/, 'right-click opens it');
    assert.match(source, /async function handleExplorerObjectOpen\(/, 'double-click has its own handler');
    assert.match(source, /async function handleOpenTriggerDefinition\(/, 'triggers can be read back');
  });

  test('the rows are distinguished by icon colour and badge, not by folders', () => {
    const source = readSource(rows);

    assert.match(source, /from '@\/components\/icons'/, 'icons come from the app set');
    assert.ok(!/from '[^']*lucide/.test(source), 'no third-party icon package');
    for (const [kind, token] of [
      ['PRIMARY_KEY', 'text-warn'],
      ['UNIQUE', 'text-ok'],
      ['CHECK', 'text-info'],
      ['DEFAULT', 'text-plan'],
      ['FOREIGN_KEY', 'text-accent'],
    ]) {
      assert.match(
        source,
        new RegExp(`${kind}: \\{ icon: \\w+, color: '${token}'`),
        `${kind} keeps its own colour token`
      );
    }
    assert.ok(!/#[0-9a-fA-F]{6}/.test(source), 'colours come from tokens, never hex values');
    assert.match(source, /data-object-kind/, 'each row states what it is');
  });
});
});

describe('quick_finder', () => {
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

test('fuzzyMatch accurately identifies exact, prefix, CamelCase, and subsequence matches', () => {
  const exact = fuzzyMatch('Employees', 'Employees');
  assert.equal(exact.matched, true);
  assert.equal(exact.score, 1000);
  assert.equal(exact.indices.length, 'Employees'.length);

  const caseExact = fuzzyMatch('employees', 'Employees');
  assert.equal(caseExact.matched, true);
  assert.equal(caseExact.score, 1000);

  const prefix = fuzzyMatch('Emp', 'Employees');
  assert.equal(prefix.matched, true);
  assert.ok(prefix.score >= 600, `Prefix score should be >= 600, got ${prefix.score}`);
  assert.deepEqual(prefix.indices, [0, 1, 2]);

  const camel = fuzzyMatch('ULL', 'UserLoginLogs');
  assert.equal(camel.matched, true);
  assert.deepEqual(camel.indices, [0, 4, 9]);

  const subseq = fuzzyMatch('uslog', 'UserLoginLogs');
  assert.equal(subseq.matched, true);
  assert.ok(subseq.indices.length === 5);

  const noMatch = fuzzyMatch('xyz', 'UserLoginLogs');
  assert.equal(noMatch.matched, false);
  assert.equal(noMatch.score, 0);
  assert.equal(noMatch.indices.length, 0);

  const empty = fuzzyMatch('', 'AnyObject');
  assert.equal(empty.matched, true);
  assert.equal(empty.score, 0);
});

test('highlightMatchedChunks correctly segments text into highlighted and plain chunks', () => {
  const target = 'UserLoginLogs';
  const chunks = highlightMatchedChunks(target, [0, 4, 9]);

  const reconstructed = chunks.map((c) => c.text).join('');
  assert.equal(reconstructed, target);

  const highlightedText = chunks.filter((c) => c.highlight).map((c) => c.text).join('');
  assert.equal(highlightedText, 'ULL');
});

test('parseSearchQuery correctly detects type prefix shortcuts', () => {
  const t1 = parseSearchQuery('t: Users');
  assert.equal(t1.cleanQuery, 'Users');
  assert.equal(t1.explicitTypeFilter, 'table');

  const t2 = parseSearchQuery('table: Users');
  assert.equal(t2.cleanQuery, 'Users');
  assert.equal(t2.explicitTypeFilter, 'table');

  const v1 = parseSearchQuery('v: SalesSummary');
  assert.equal(v1.cleanQuery, 'SalesSummary');
  assert.equal(v1.explicitTypeFilter, 'view');

  const p1 = parseSearchQuery('p: usp_GetOrders');
  assert.equal(p1.cleanQuery, 'usp_GetOrders');
  assert.equal(p1.explicitTypeFilter, 'procedure');

  const f1 = parseSearchQuery('func: fn_CalculateTax');
  assert.equal(f1.cleanQuery, 'fn_CalculateTax');
  assert.equal(f1.explicitTypeFilter, 'function');

  const normal = parseSearchQuery('Customers');
  assert.equal(normal.cleanQuery, 'Customers');
  assert.equal(normal.explicitTypeFilter, undefined);
});

test('filterAndRankQuickObjects ranks higher-relevance matches first and handles type filters', () => {
  const testItems: QuickFinderItem[] = [
    { id: '1', schema: 'dbo', name: 'OrderDetails', type: 'table', database: 'AppDb', connId: 'c1' },
    { id: '2', schema: 'dbo', name: 'Orders', type: 'table', database: 'AppDb', connId: 'c1' },
    { id: '3', schema: 'dbo', name: 'vw_Orders', type: 'view', database: 'AppDb', connId: 'c1' },
    { id: '4', schema: 'dbo', name: 'usp_ProcessOrders', type: 'procedure', database: 'AppDb', connId: 'c1' },
    { id: '5', schema: 'sales', name: 'OrdersArchive', type: 'table', database: 'AppDb', connId: 'c1' },
    { id: '6', schema: 'dbo', name: 'Customers', type: 'table', database: 'AppDb', connId: 'c1' },
  ];

  const results = filterAndRankQuickObjects(testItems, 'Orders', 'all');
  assert.ok(results.length >= 4);
  assert.equal(results[0]?.item.name, 'Orders');

  const procResults = filterAndRankQuickObjects(testItems, 'Orders', 'procedure');
  assert.equal(procResults.length, 1);
  assert.equal(procResults[0]?.item.name, 'usp_ProcessOrders');

  const viewResults = filterAndRankQuickObjects(testItems, 'v: Orders', 'all');
  assert.equal(viewResults.length, 1);
  assert.equal(viewResults[0]?.item.name, 'vw_Orders');

  const salesResults = filterAndRankQuickObjects(testItems, 'sales.Orders', 'all');
  assert.ok(salesResults.length > 0);
  assert.equal(salesResults[0]?.item.name, 'OrdersArchive');
  assert.equal(salesResults[0]?.item.schema, 'sales');
});

test('schemaStore aggregates tables, views, procedures, and functions into QuickFinderItem objects', () => {
  const schemaStore = useSchemaStore();
  const connStore = useConnectionStore();

  connStore.activeConnectionId = 'test-conn';
  connStore.activeDatabase = 'Northwind';

  const dbKey = 'test-conn:Northwind';
  schemaStore.tablesByDb[dbKey] = [
    { schema: 'dbo', name: 'Customers', kind: 'BASE TABLE' },
    { schema: 'dbo', name: 'CustomerOrdersView', kind: 'VIEW' },
  ];

  schemaStore.routinesByDb[dbKey] = [
    { schema: 'dbo', name: 'usp_MonthlyReport', kind: 'PROCEDURE' },
    { schema: 'dbo', name: 'fn_GetDiscount', kind: 'FUNCTION' },
  ];

  const objects = schemaStore.getDatabaseObjects('test-conn', 'Northwind');
  assert.equal(objects.length, 4);

  const tableObj = objects.find((o) => o.name === 'Customers');
  assert.equal(tableObj?.type, 'table');

  const viewObj = objects.find((o) => o.name === 'CustomerOrdersView');
  assert.equal(viewObj?.type, 'view');

  const procObj = objects.find((o) => o.name === 'usp_MonthlyReport');
  assert.equal(procObj?.type, 'procedure');

  const funcObj = objects.find((o) => o.name === 'fn_GetDiscount');
  assert.equal(funcObj?.type, 'function');
});
});
