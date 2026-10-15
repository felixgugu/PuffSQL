import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useGridExport } from '../src/composables/useGridExport';
import type { UseGridSelectionReturn } from '../src/composables/useGridSelection';
import type { ColumnDef } from '../src/types/query';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

const columns: ColumnDef[] = [{ name: 'id', dataType: 'int', nullable: false, ordinal: 0 }];

function createExportHandler(rows: unknown[][]) {
  const toasts: Array<{ message: string }> = [];
  const selection = {
    getSelectionBlocks: () => [],
    getVisualDataColIndices: () => [0],
  } as unknown as UseGridSelectionReturn;

  const handler = useGridExport({
    getRows: () => rows as never,
    getColumns: () => columns,
    selection,
    showToast: (message) => {
      toasts.push({ message });
    },
  });

  return { handler, toasts };
}

/**
 * The result toolbar's copy tools are one label-only strip: no per-format icons, and every segment
 * flashes its label for two seconds after a successful copy.
 */
describe('result grid copy tools', () => {
  test('the four copy formats are one icon-free segmented strip', () => {
    const source = readSource('src/components/results/ResultGridItem.vue');
    const groupStart = source.indexOf('aria-label="複製查詢結果"');

    assert.ok(groupStart > -1, 'the copy tools live in one named strip');
    const group = source.slice(groupStart, source.indexOf('</SqButtonGroup>', groupStart));

    for (const label of ["'Copy TSV'", "'CSV'", "'JSON'", "'MD'"]) {
      assert.ok(group.includes(label), `${label} should be a segment`);
    }
    assert.doesNotMatch(group, /<template #icon>/, 'the segments are label only');
    assert.doesNotMatch(
      group,
      /FileSpreadsheet|FileText|FileCode|Table2/,
      'the four format icons are gone'
    );
    assert.equal(
      (group.match(/common\.copied/g) ?? []).length,
      4,
      'all four segments flash the copied label'
    );
    assert.match(group, /min-w-\[68px\]/, 'the widest label keeps the strip from reflowing');
    assert.doesNotMatch(source, /'Copied!'/, 'the hardcoded label is gone');
  });

  test('JSON and Markdown copies flash their segment too, then reset after two seconds', async () => {
    navigator.clipboard = { writeText: () => Promise.resolve() } as unknown as Clipboard;
    const { handler, toasts } = createExportHandler([[1]]);

    handler.copyAsJson();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(handler.copiedJson.value, true, 'JSON flashes its own segment');
    assert.equal(handler.copiedTsv.value, false, 'the other segments stay quiet');
    assert.equal(toasts.length, 1, 'the success toast still fires');

    handler.copyAsMarkdown();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(handler.copiedMd.value, true, 'Markdown flashes its own segment');

    const source = readSource('src/composables/useGridExport.ts');
    assert.match(
      source,
      /function flashCopied[\s\S]*?setTimeout\([\s\S]*?\}, 2000\);/,
      'the flash resets after two seconds'
    );
    assert.match(source, /copiedJson,\s*\n\s*copiedMd,/, 'both flags are returned');
  });

  test('copying an empty result set does not flash anything', () => {
    navigator.clipboard = { writeText: () => Promise.resolve() } as unknown as Clipboard;
    const { handler, toasts } = createExportHandler([]);

    handler.copyAsJson();
    handler.copyAsMarkdown();
    assert.equal(handler.copiedJson.value, false);
    assert.equal(handler.copiedMd.value, false);
    assert.equal(toasts.length, 2, 'both copies answer with the empty-result toast');
  });
});
