import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

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

  test('every new string exists in both locales', () => {
    const keys = [
      'scriptDrop',
      'indexRebuild',
      'indexReorganize',
      'disabledObject',
      'indexKeys',
      'indexIncludes',
      'indexFilter',
      'references',
      'dblclickViewDefinition',
      'generatedObjectScript',
      'objectScriptFailed',
    ];

    for (const locale of ['zh-TW', 'en']) {
      const dictionary = readSource(`src/i18n/locales/${locale}.ts`);
      for (const key of keys) {
        assert.match(dictionary, new RegExp(`\\b${key}:`), `${locale} is missing ${key}`);
      }
    }
  });
});
