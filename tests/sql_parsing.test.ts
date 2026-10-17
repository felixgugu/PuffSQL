import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { schemaService } from '../src/services/schemaService';
import { useConnectionStore } from '../src/stores/connectionStore';
import { useSchemaStore } from '../src/stores/schemaStore';
import { disposeSqlCompletionProvider, setupSqlCompletionProvider } from '../src/utils/sqlCompletionProvider';
import { generateDeleteStatement } from '../src/utils/sqlGenerator';
import { extractTableIdentifierAtCursor, parseIdentifierSegments, segmentsToIdentifier } from '../src/utils/sqlIdentifierExtractor';
import { getCursorContext } from '../src/utils/sqlParser';
import { extractStatementAtCursor, splitSqlBatches, splitSqlBatchesWithMeta } from '../src/utils/sqlStatementExtractor';
import { getLastCompletionProvider, getLastRegisteredLanguage, resetMonacoStub } from './stubs/monaco';

describe('statements', () => {
test('transaction guards stay attached when the cursor is on the generated DELETE', () => {
  const sql = generateDeleteStatement({ tableName: 'T', columns: [{ name: 'id' }], row: [1] });
  const line = sql.split('\n').findIndex((line) => line.startsWith('DELETE')) + 1;
  assert.equal(extractStatementAtCursor(sql, line).sql, sql);
});
test('blank lines within a query do not detach its WHERE clause', () => {
  const sql = 'DELETE FROM Orders\n\nWHERE id = 7;';
  assert.equal(extractStatementAtCursor(sql, 1).sql, sql);
});
test('GO and semicolons inside a multiline literal do not split a query', () => {
  const sql = "SELECT 'a;\nGO\nb' AS value;";
  assert.equal(extractStatementAtCursor(sql, 2).sql, sql);
});
test('nested comments containing GO are not batch boundaries', () => {
  const sql = 'SELECT /* outer\n/* inner */\nGO\n*/ 1;';
  assert.equal(extractStatementAtCursor(sql, 3).sql, sql);
});
test('real GO boundaries isolate batches and separator line executes nothing', () => {
  const sql = 'SELECT 1;\nGO -- batch\nSELECT 2;';
  assert.equal(extractStatementAtCursor(sql, 3).sql, 'SELECT 2;');
  assert.equal(extractStatementAtCursor(sql, 2).sql, '');
});
test('selection remains an explicit execution override', () => {
  assert.deepEqual(extractStatementAtCursor('SELECT 1;', 1, 'SELECT 2'), { sql: 'SELECT 2', isSelection: true });
});

test('splitSqlBatches correctly divides script across GO boundaries', () => {
  const script = `USE [mydb];
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE dbo.Test (id int);
GO`;

  const batches = splitSqlBatches(script);
  assert.equal(batches.length, 4);
  assert.equal(batches[0], 'USE [mydb];');
  assert.equal(batches[1], 'SET ANSI_NULLS ON');
  assert.equal(batches[2], 'SET QUOTED_IDENTIFIER ON');
  assert.equal(batches[3], 'CREATE TABLE dbo.Test (id int);');
});

test('splitSqlBatches preserves queries without GO as a single batch', () => {
  const query = 'SELECT * FROM Customers WHERE City = "Taipei";';
  const batches = splitSqlBatches(query);
  assert.equal(batches.length, 1);
  assert.equal(batches[0], query);
});

test('splitSqlBatches ignores GO inside string literals and block comments', () => {
  const script = `SELECT 'GO' AS val;
GO
SELECT /* GO inside comment */ 42;`;
  const batches = splitSqlBatches(script);
  assert.equal(batches.length, 2);
  assert.equal(batches[0], "SELECT 'GO' AS val;");
  assert.equal(batches[1], "SELECT /* GO inside comment */ 42;");
});

test('splitSqlBatchesWithMeta accurately tracks startLine and repeatCount', () => {
  const script = `
-- Line 2 comment
USE master;
GO

-- Line 6 comment
INSERT INTO #temp VALUES (1);
GO 3 -- repeat 3 times

SELECT * FROM #temp;
`;

  const meta = splitSqlBatchesWithMeta(script);
  assert.equal(meta.length, 3);

  assert.equal(meta[0]?.sql, '-- Line 2 comment\nUSE master;');
  assert.equal(meta[0]?.startLine, 2);
  assert.equal(meta[0]?.repeatCount, 1);

  assert.equal(meta[1]?.sql, '-- Line 6 comment\nINSERT INTO #temp VALUES (1);');
  assert.equal(meta[1]?.startLine, 6);
  assert.equal(meta[1]?.repeatCount, 3);

  assert.equal(meta[2]?.sql, 'SELECT * FROM #temp;');
  assert.equal(meta[2]?.startLine, 10);
  assert.equal(meta[2]?.repeatCount, 1);

  const expanded = splitSqlBatches(script);
  assert.equal(expanded.length, 5); // 1 + 3 + 1
  assert.equal(expanded[0], '-- Line 2 comment\nUSE master;');
  assert.equal(expanded[1], '-- Line 6 comment\nINSERT INTO #temp VALUES (1);');
  assert.equal(expanded[2], '-- Line 6 comment\nINSERT INTO #temp VALUES (1);');
  assert.equal(expanded[3], '-- Line 6 comment\nINSERT INTO #temp VALUES (1);');
  assert.equal(expanded[4], 'SELECT * FROM #temp;');
});
});

describe('sql_completion_context', () => {
// Mock localStorage for the node environment (connectionStore reads cached state)
const storageData = new Map<string, string>();
// A hook, not a conditional install: every member gets its own store back.
before(() => {
  (globalThis as any).localStorage = {
    getItem: (key: string) => storageData.get(key) || null,
    setItem: (key: string, val: string) => storageData.set(key, val),
    removeItem: (key: string) => storageData.delete(key),
    clear: () => storageData.clear(),
  };
});

const TABLE_CASES = [
  'SELECT * FROM ',
  'SELECT * FROM Us',
  'SELECT * FROM Users u JOIN ',
  'SELECT * FROM Users u JOIN Ord',
  'SELECT * FROM Users u INNER JOIN Ord',
  'SELECT * FROM Users u LEFT JOIN ',
  'SELECT * FROM Order',
  'SELECT * FROM In',
  'FROM Users u, Orde',
  'DELETE FROM ',
  'INSERT INTO ',
  'UPDATE ',
  'ALTER TABLE ',
];

for (const sql of TABLE_CASES) {
  test(`getCursorContext: table context after FROM/JOIN -> ${JSON.stringify(sql)}`, () => {
    const ctx = getCursorContext(sql);
    assert.equal(ctx.contextType, 'table');
    assert.equal(ctx.isDotTrigger, false);
  });
}

test('getCursorContext: table context survives a line break after FROM', () => {
  const ctx = getCursorContext('SELECT *\nFROM\n  ');
  assert.equal(ctx.contextType, 'table');
});

test('getCursorContext: dot trigger wins for qualified identifiers', () => {
  assert.deepEqual(getCursorContext('SELECT * FROM dbo.Us'), {
    isDotTrigger: true,
    qualifier: 'dbo',
    contextType: 'column_or_expr',
  });

  assert.deepEqual(getCursorContext('SELECT * FROM Users u ON u.'), {
    isDotTrigger: true,
    qualifier: 'u',
    contextType: 'column_or_expr',
  });
});

const COLUMN_CASES = [
  'SELECT ',
  'SELECT DISTINCT ',
  'SELECT * FROM Users u WHERE ',
  'SELECT * FROM Users u WHERE id',
  'SELECT * FROM Users u ON ',
  'SELECT * FROM Users u WHERE a = 1 AND ',
  'SELECT * FROM Users u ORDER BY ',
  'SELECT 1 AS x; SELECT ',
];

for (const sql of COLUMN_CASES) {
  test(`getCursorContext: column context -> ${JSON.stringify(sql)}`, () => {
    const ctx = getCursorContext(sql);
    assert.equal(ctx.contextType, 'column_or_expr');
    assert.equal(ctx.isDotTrigger, false);
  });
}

const JOIN_MODIFIER_CASES: Array<[string, string]> = [
  ['SELECT * FROM Users u LEFT ', 'LEFT'],
  ['SELECT * FROM Users u RIGHT ', 'RIGHT'],
  ['SELECT * FROM Users u FULL ', 'FULL'],
  ['SELECT * FROM Users u INNER ', 'INNER'],
  ['SELECT * FROM Users u CROSS ', 'CROSS'],
  ['SELECT * FROM Users u FULL OUTER ', 'OUTER'],
];

for (const [sql, modifier] of JOIN_MODIFIER_CASES) {
  test(`getCursorContext: join keyword context (${modifier})`, () => {
    const ctx = getCursorContext(sql);
    assert.equal(ctx.contextType, 'join_keyword');
    assert.equal(ctx.joinModifier, modifier);
  });
}

test('getCursorContext: table names colliding with reserved words stay in table context', () => {
  // "Order" and "In..." are reserved-word prefixes of real table names; the token being
  // typed must never be mistaken for a clause keyword, otherwise columns flood back in.
  assert.equal(getCursorContext('SELECT * FROM Order').contextType, 'table');
  assert.equal(getCursorContext('SELECT * FROM In').contextType, 'table');
});

test('getCursorContext: empty prefix falls back to general', () => {
  assert.equal(getCursorContext('  ').contextType, 'general');
  assert.equal(getCursorContext('').contextType, 'general');
});

const FIXTURE_TABLES = [
  {
    schema: 'dbo',
    name: 'Users',
    kind: 'BASE TABLE',
    columns: [
      { name: 'UserId', dataType: 'int', isNullable: false, isPrimaryKey: true, isIdentity: true },
      { name: 'Email', dataType: 'nvarchar', maxLength: 200, isNullable: false, isPrimaryKey: false, isIdentity: false },
    ],
  },
  {
    schema: 'dbo',
    name: 'Orders',
    kind: 'BASE TABLE',
    columns: [
      { name: 'OrderId', dataType: 'int', isNullable: false, isPrimaryKey: true, isIdentity: true },
      { name: 'UserId', dataType: 'int', isNullable: false, isPrimaryKey: false, isIdentity: false },
    ],
  },
  {
    schema: 'sales',
    name: 'vw_Summary',
    kind: 'VIEW',
    columns: [
      { name: 'Total', dataType: 'decimal', isNullable: true, isPrimaryKey: false, isIdentity: false },
    ],
  },
];

interface SuggestionLike {
  label: string;
  kind: number;
  insertText: string;
  sortText?: string;
}

interface FakeModel {
  getValue(): string;
  getOffsetAt(position: unknown): number;
  getLineContent(lineNumber: number): string;
  getWordUntilPosition(position: unknown): { word: string; startColumn: number; endColumn: number };
}

/** Builds a model stub with the caret placed at the very end of `text`. */
function createFakeModel(text: string): { model: FakeModel; position: { lineNumber: number; column: number } } {
  const lines = text.split('\n');
  const lineNumber = lines.length;
  const lineContent = lines[lineNumber - 1] ?? '';
  const column = lineContent.length + 1;
  const wordMatch = lineContent.match(/[a-zA-Z0-9_]*$/);
  const word = wordMatch ? wordMatch[0] : '';
  const position = { lineNumber, column };

  const model: FakeModel = {
    getValue: () => text,
    getOffsetAt: () => text.length,
    getLineContent: (ln: number) => lines[ln - 1] ?? '',
    getWordUntilPosition: () => ({
      word,
      startColumn: column - word.length,
      endColumn: column,
    }),
  };

  return { model, position };
}

function suggestFor(sql: string): SuggestionLike[] {
  const provider = getLastCompletionProvider();
  assert.ok(provider, 'completion provider must be registered');

  const { model, position } = createFakeModel(sql);
  const result = provider!.provideCompletionItems(model, position) as {
    suggestions: SuggestionLike[];
  };
  return result.suggestions;
}

before(async () => {
  storageData.clear();
  setActivePinia(createPinia());
  resetMonacoStub();

  const connStore = useConnectionStore();
  connStore.activeConnectionId = 'conn-test';
  connStore.activeDatabase = 'TestDb';

  (schemaService as any).getDatabaseSchema = async () => FIXTURE_TABLES;
  await useSchemaStore().loadDatabaseSchema('conn-test', 'TestDb');

  setupSqlCompletionProvider();
});

beforeEach(() => {
  storageData.clear();
});

test('provider: registers a completion provider for the sql language', () => {
  assert.equal(getLastRegisteredLanguage(), 'sql');
});

const KIND = {
  Field: 3,
  Class: 5,
  Interface: 7,
  Module: 8,
  Keyword: 17,
};

for (const sql of [
  'SELECT * FROM Us',
  'SELECT * FROM dbo.Users u JOIN Ord',
  'SELECT * FROM Users u INNER JOIN Ord',
  'SELECT * FROM Order',
]) {
  test(`provider: no column suggestions while typing a table name -> ${JSON.stringify(sql)}`, () => {
    const suggestions = suggestFor(sql);
    assert.ok(suggestions.length > 0, 'expected table suggestions');
    assert.ok(
      suggestions.every((s) => s.kind !== KIND.Field),
      `expected no Field items, got ${JSON.stringify(suggestions.filter((s) => s.kind === KIND.Field).map((s) => s.label))}`
    );
    assert.ok(suggestions.some((s) => s.label === 'Users'), 'expected table "Users"');
    assert.ok(suggestions.some((s) => s.label === 'Orders'), 'expected table "Orders"');
  });
}

test('provider: FROM context also offers schemas and views but no keywords', () => {
  const suggestions = suggestFor('SELECT * FROM ');
  const kinds = new Set(suggestions.map((s) => s.kind));
  assert.deepEqual([...kinds].sort(), [KIND.Class, KIND.Interface, KIND.Module]);
  assert.ok(suggestions.some((s) => s.label === 'dbo' && s.kind === KIND.Module));
  assert.ok(suggestions.some((s) => s.label === 'vw_Summary' && s.kind === KIND.Interface));
});

for (const [sql, expected] of [
  ['SELECT * FROM Users u LEFT ', ['OUTER', 'JOIN']],
  ['SELECT * FROM Users u INNER ', ['JOIN']],
  ['SELECT * FROM Users u FULL OUTER ', ['JOIN']],
] as Array<[string, string[]]>) {
  test(`provider: only join keywords after modifier -> ${JSON.stringify(sql)}`, () => {
    const suggestions = suggestFor(sql);
    assert.deepEqual(suggestions.map((s) => s.label).sort(), [...expected].sort());
    assert.ok(suggestions.every((s) => s.kind === KIND.Keyword));
    assert.ok(suggestions.every((s) => s.insertText === s.label));
  });
}

test('provider: column context still suggests columns (no over-filtering)', () => {
  const suggestions = suggestFor('SELECT * FROM Users u WHERE ');
  const labels = suggestions.map((s) => s.label);
  assert.ok(labels.includes('Email'), 'expected Users columns');
  assert.ok(suggestions.some((s) => s.kind === KIND.Field), 'expected Field items');
});

test('provider: aliased dot trigger suggests only that table columns', () => {
  const suggestions = suggestFor('SELECT * FROM Users u WHERE u.');
  assert.ok(suggestions.length > 0);
  assert.deepEqual(suggestions.map((s) => s.label).sort(), ['Email', 'UserId']);
});

test.after(() => {
  disposeSqlCompletionProvider();
});
});

describe('locate_table', () => {
describe('sqlIdentifierExtractor', () => {
  test('parseIdentifierSegments: parses unbracketed single identifier', () => {
    assert.deepEqual(parseIdentifierSegments('Orders'), ['Orders']);
  });

  test('parseIdentifierSegments: parses bracketed single identifier', () => {
    assert.deepEqual(parseIdentifierSegments('[Orders]'), ['Orders']);
  });

  test('parseIdentifierSegments: parses schema and table with brackets', () => {
    assert.deepEqual(parseIdentifierSegments('[dbo].[Orders]'), ['dbo', 'Orders']);
  });

  test('parseIdentifierSegments: parses schema and table without brackets', () => {
    assert.deepEqual(parseIdentifierSegments('dbo.Orders'), ['dbo', 'Orders']);
  });

  test('parseIdentifierSegments: parses bracketed identifiers with spaces', () => {
    assert.deepEqual(parseIdentifierSegments('[Sales].[Order Details]'), ['Sales', 'Order Details']);
  });

  test('parseIdentifierSegments: parses three-part identifiers [db].[schema].[table]', () => {
    assert.deepEqual(parseIdentifierSegments('[Northwind].[dbo].[Customers]'), ['Northwind', 'dbo', 'Customers']);
  });

  test('parseIdentifierSegments: returns empty array for empty string', () => {
    assert.deepEqual(parseIdentifierSegments(''), []);
  });

  test('segmentsToIdentifier: returns null for SQL reserved keywords', () => {
    assert.equal(segmentsToIdentifier(['SELECT']), null);
    assert.equal(segmentsToIdentifier(['FROM']), null);
    assert.equal(segmentsToIdentifier(['WHERE']), null);
    assert.equal(segmentsToIdentifier(['JOIN']), null);
  });

  test('segmentsToIdentifier: returns table for non-reserved single token', () => {
    assert.deepEqual(segmentsToIdentifier(['Orders']), { table: 'Orders' });
    assert.deepEqual(segmentsToIdentifier(['Users']), { table: 'Users' });
  });

  test('segmentsToIdentifier: returns schema and table for two segments', () => {
    assert.deepEqual(segmentsToIdentifier(['dbo', 'Orders']), { schema: 'dbo', table: 'Orders' });
    assert.deepEqual(segmentsToIdentifier(['sales', 'Customers']), { schema: 'sales', table: 'Customers' });
  });

  test('segmentsToIdentifier: returns database, schema, and table for three segments', () => {
    assert.deepEqual(segmentsToIdentifier(['AdventureWorks', 'dbo', 'Products']), {
      database: 'AdventureWorks',
      schema: 'dbo',
      table: 'Products',
    });
  });

  test('extractTableIdentifierAtCursor: prioritizes selection when provided', () => {
    const result = extractTableIdentifierAtCursor('SELECT * FROM Orders', 1, 'dbo.Orders');
    assert.deepEqual(result, { schema: 'dbo', table: 'Orders' });
  });

  test('extractTableIdentifierAtCursor: strips single and double quotes from selection', () => {
    assert.deepEqual(extractTableIdentifierAtCursor('', 1, "'Customers'"), { table: 'Customers' });
    assert.deepEqual(extractTableIdentifierAtCursor('', 1, '"Customers"'), { table: 'Customers' });
  });

  test('extractTableIdentifierAtCursor: extracts table when cursor is on unbracketed table name', () => {
    const line = 'SELECT * FROM Orders WHERE id = 1';
    const col = line.indexOf('Orders') + 2; // on 'r'
    const result = extractTableIdentifierAtCursor(line, col);
    assert.deepEqual(result, { table: 'Orders' });
  });

  test('extractTableIdentifierAtCursor: extracts schema and table when cursor is on [dbo].[Orders]', () => {
    const line = 'SELECT * FROM [dbo].[Orders] WHERE Id = 10';
    const col = line.indexOf('Orders') + 1;
    const result = extractTableIdentifierAtCursor(line, col);
    assert.deepEqual(result, { schema: 'dbo', table: 'Orders' });
  });

  test('extractTableIdentifierAtCursor: extracts schema and table when cursor is on schema part of dbo.Orders', () => {
    const line = 'SELECT * FROM dbo.Orders';
    const col = line.indexOf('dbo') + 1;
    const result = extractTableIdentifierAtCursor(line, col);
    assert.deepEqual(result, { schema: 'dbo', table: 'Orders' });
  });

  test('extractTableIdentifierAtCursor: extracts table with spaces in brackets: [Sales].[Order Details]', () => {
    const line = 'SELECT * FROM [Sales].[Order Details] o';
    const col = line.indexOf('Order Details') + 3;
    const result = extractTableIdentifierAtCursor(line, col);
    assert.deepEqual(result, { schema: 'Sales', table: 'Order Details' });
  });

  test('extractTableIdentifierAtCursor: returns null when cursor is on SQL keyword FROM or SELECT', () => {
    const line = 'SELECT * FROM Orders';
    const colSelect = line.indexOf('SELECT') + 2;
    assert.equal(extractTableIdentifierAtCursor(line, colSelect), null);

    const colFrom = line.indexOf('FROM') + 2;
    assert.equal(extractTableIdentifierAtCursor(line, colFrom), null);
  });

  test('extractTableIdentifierAtCursor: returns null for empty line or no identifier match', () => {
    assert.equal(extractTableIdentifierAtCursor('', 1), null);
    assert.equal(extractTableIdentifierAtCursor('   ', 2), null);
  });
});
});
