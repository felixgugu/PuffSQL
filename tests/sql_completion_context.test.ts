import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setActivePinia, createPinia } from 'pinia';
import { getCursorContext } from '../src/utils/sqlParser.ts';
import {
  setupSqlCompletionProvider,
  disposeSqlCompletionProvider,
} from '../src/utils/sqlCompletionProvider.ts';
import { schemaService } from '../src/services/schemaService.ts';
import { useSchemaStore } from '../src/stores/schemaStore.ts';
import { useConnectionStore } from '../src/stores/connectionStore.ts';
import {
  getLastCompletionProvider,
  getLastRegisteredLanguage,
  resetMonacoStub,
} from './stubs/monaco.ts';

// Mock localStorage for the node environment (connectionStore reads cached state)
const storageData = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = {
    getItem: (key: string) => storageData.get(key) || null,
    setItem: (key: string, val: string) => storageData.set(key, val),
    removeItem: (key: string) => storageData.delete(key),
    clear: () => storageData.clear(),
  };
}

// ---------------------------------------------------------------------------
// getCursorContext: keyword context detection
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Provider integration: FROM/JOIN must never suggest column names
// ---------------------------------------------------------------------------

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
