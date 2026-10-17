import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type Tabulator } from 'tabulator-tables';
import { useGridExport } from '../src/composables/useGridExport';
import { formatAggregateNumber, readCellValue, type UseGridSelectionReturn, useGridSelection } from '../src/composables/useGridSelection';
import { ColumnDef, type CellValue } from '../src/types/query';
import { coerceEditedValue, columnIndexFromField, fieldForColumnIndex } from '../src/utils/tabulatorColumns';
import { CLEAR_GRID_SELECTION_EVENT, clearGridRanges, dispatchClearGridSelection } from '../src/utils/tabulatorGrid';
import { readSource } from './helpers/source';

describe('grid_selection', () => {
interface ColumnStub {
  field: string;
  title: string;
}

function makeTableStub(options: {
  ranges: Array<{ columns: ColumnStub[]; rows: unknown[] }>;
  totalRows: number;
}) {
  return {
    getColumns: () =>
      (options.ranges[0]?.columns ?? []).map((column) => ({
        getField: () => column.field,
        isVisible: () => true,
        getDefinition: () => ({ title: column.title }),
      })),
    getRanges: () =>
      options.ranges.map((range) => ({
        getColumns: () =>
          range.columns.map((column) => ({
            getField: () => column.field,
            isVisible: () => true,
            getDefinition: () => ({ title: column.title }),
          })),
        getRows: () => range.rows.map((row) => ({ getData: () => row })),
        getTopEdge: () => 0,
        getBottomEdge: () => range.rows.length - 1,
        getLeftEdge: () => 0,
        getRightEdge: () => range.columns.length - 1,
        remove: () => {},
      })),
    getDataCount: () => options.totalRows,
    on: () => {},
  } as unknown as Tabulator;
}

test('column fields round-trip through the positional index mapping', () => {
  assert.equal(fieldForColumnIndex(0), '0');
  assert.equal(fieldForColumnIndex(17), '17');
  assert.equal(columnIndexFromField('0'), 0);
  assert.equal(columnIndexFromField('17'), 17);
  assert.equal(columnIndexFromField('__sqlight_row'), undefined);
  assert.equal(columnIndexFromField(''), undefined);
  assert.equal(columnIndexFromField(null), undefined);
});

test('readCellValue supports positional arrays and record rows', () => {
  assert.equal(readCellValue([1, 'a'], '1'), 'a');
  assert.equal(readCellValue([null, 'a'], '0'), null);
  assert.equal(readCellValue({ columnName: 'id' }, 'columnName'), 'id');
  assert.equal(readCellValue({ columnName: null }, 'columnName'), null);
  assert.equal(readCellValue(undefined, '0'), null);
});

test('formatAggregateNumber keeps integers exact and floats readable', () => {
  assert.equal(formatAggregateNumber(1234), (1234).toLocaleString());
  assert.equal(formatAggregateNumber(1.5), (1.5).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }));
});

test('coerceEditedValue matches the inline editing rules of the previous grid', () => {
  const intColumn: ColumnDef = { name: 'age', dataType: 'int', nullable: true, ordinal: 0 };
  const textColumn: ColumnDef = { name: 'name', dataType: 'nvarchar', nullable: true, ordinal: 1 };
  const bitColumn: ColumnDef = { name: 'active', dataType: 'bit', nullable: false, ordinal: 2 };

  assert.equal(coerceEditedValue('42', intColumn), 42);
  assert.equal(coerceEditedValue('NULL', intColumn), null);
  assert.equal(coerceEditedValue('null', intColumn), null);
  assert.equal(coerceEditedValue('', intColumn), null);
  assert.equal(coerceEditedValue('', textColumn), '');
  assert.equal(coerceEditedValue('  keep  ', textColumn), '  keep  ');
  assert.equal(coerceEditedValue('1', bitColumn), true);
  assert.equal(coerceEditedValue('0', bitColumn), false);
  assert.equal(coerceEditedValue('TRUE', bitColumn), true);
  assert.equal(coerceEditedValue('false', bitColumn), false);
});

test('selection stats aggregate every range and report whole-column selections', () => {
  const table = makeTableStub({
    totalRows: 2,
    ranges: [
      {
        columns: [
          { field: '0', title: 'id' },
          { field: '1', title: 'name' },
        ],
        rows: [
          [1, 'a'],
          [2, 'b'],
        ],
      },
    ],
  });

  const selection = useGridSelection({
    getTable: () => table,
    getContainer: () => null,
    getColumns: () => [],
  });

  selection.refresh();

  assert.equal(selection.hasSelection.value, true);
  assert.equal(selection.selectedColumnsCount.value, 2);
  assert.deepEqual(selection.selectionStats.value, {
    totalCells: 4,
    numericCount: 2,
    sum: 3,
    avg: 1.5,
    min: 1,
    max: 2,
    distinctCount: 4,
  });

  const blocks = selection.getSelectionBlocks();
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.coversAllRows, true);
  assert.deepEqual(
    blocks[0]!.columns,
    [
      { field: '0', title: 'id' },
      { field: '1', title: 'name' },
    ]
  );
  assert.deepEqual(blocks[0]!.rows, [
    [1, 'a'],
    [2, 'b'],
  ]);
});

test('partial ranges report no whole-column selection and exclude the row index column', () => {
  const table = makeTableStub({
    totalRows: 10,
    ranges: [
      {
        columns: [
          { field: '__sqlight_row', title: '#' },
          { field: '0', title: 'id' },
        ],
        rows: [
          [1, 10],
          [2, 20],
        ],
      },
    ],
  });

  const selection = useGridSelection({
    getTable: () => table,
    getContainer: () => null,
    getColumns: () => [],
  });

  selection.refresh();

  assert.equal(selection.hasSelection.value, true);
  assert.equal(selection.selectedColumnsCount.value, 0, 'a partial range is not a column selection');
  assert.deepEqual(
    selection.getSelectionBlocks()[0]!.columns.map((column) => column.field),
    ['0'],
    'the frozen # column never takes part in a selection'
  );
  assert.equal(selection.selectionStats.value?.totalCells, 2);
});

test('an empty range set clears the selection state', () => {
  const table = makeTableStub({ totalRows: 0, ranges: [] });
  const selection = useGridSelection({
    getTable: () => table,
    getContainer: () => null,
    getColumns: () => [],
  });

  selection.refresh();
  assert.equal(selection.hasSelection.value, false);
  assert.equal(selection.selectionStats.value, null);
  assert.deepEqual(selection.getSelectionBlocks(), []);
});

test('clearGridRanges uses the module teardown and falls back to the public API', () => {
  // Tabulator has no public "clear ranges" call, and removing the last range with
  // `RangeComponent.remove()` makes it auto-create a range with NaN bounds that later crashes the
  // layout pass, so the module's own teardown must be preferred.
  const calls: string[] = [];
  const withModule = {
    modules: {
      selectRange: {
        setDefaultRange: () => calls.push('setDefaultRange'),
        layoutElement: () => calls.push('layoutElement'),
      },
    },
  } as unknown as Tabulator;
  clearGridRanges(withModule);
  assert.deepEqual(calls, ['setDefaultRange', 'layoutElement']);

  const removed: string[] = [];
  const withoutModule = {
    getRanges: () => [{ remove: () => removed.push('removed') }],
  } as unknown as Tabulator;
  clearGridRanges(withoutModule);
  assert.deepEqual(removed, ['removed']);

  // Must be a no-op rather than throwing when the grid is gone.
  clearGridRanges(null);
});

test('dispatchClearGridSelection dispatches CLEAR_GRID_SELECTION_EVENT', () => {
  assert.equal(CLEAR_GRID_SELECTION_EVENT, 'sqlight:clear-grid-selection');

  const dispatched: Event[] = [];
  const originalWindow = globalThis.window;
  (globalThis as any).window = {
    dispatchEvent: (event: Event) => {
      dispatched.push(event);
      return true;
    },
  };

  try {
    dispatchClearGridSelection();
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0]!.type, 'sqlight:clear-grid-selection');
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test('clearCellSelection resets selection state and removes grid ranges', () => {
  let removeCalled = 0;
  const table = {
    getColumns: () => [{ getField: () => '0', isVisible: () => true, getDefinition: () => ({ title: 'id' }) }],
    getRanges: () => [{
      getColumns: () => [{ getField: () => '0', isVisible: () => true, getDefinition: () => ({ title: 'id' }) }],
      getRows: () => [{ getData: () => [1] }],
      getTopEdge: () => 0,
      getBottomEdge: () => 0,
      getLeftEdge: () => 0,
      getRightEdge: () => 0,
      remove: () => { removeCalled++; },
    }],
    getDataCount: () => 1,
    on: () => {},
  } as unknown as Tabulator;

  const selection = useGridSelection({
    getTable: () => table,
    getContainer: () => null,
    getColumns: () => [],
  });

  selection.refresh();
  assert.equal(selection.hasSelection.value, true);
  assert.notEqual(selection.selectionStats.value, null);

  selection.clearCellSelection();
  assert.equal(selection.hasSelection.value, false);
  assert.equal(selection.selectionStats.value, null);
  assert.equal(selection.selectedColumnsCount.value, 0);
  assert.ok(removeCalled > 0, 'grid range remove was called');
});

test('MonacoEditor and AppMain wire editor clicking to dispatchClearGridSelection', () => {
  const monacoSrc = readSource('src/components/editor/MonacoEditor.vue');
  assert.match(monacoSrc, /dispatchClearGridSelection\(\)/, 'MonacoEditor must call dispatchClearGridSelection');
  assert.match(monacoSrc, /editorContainer\.value\.addEventListener\('mousedown'/, 'MonacoEditor attaches mousedown on editorContainer');
  assert.match(monacoSrc, /editorInstance\.onMouseDown/, 'MonacoEditor calls onMouseDown');
  assert.match(monacoSrc, /editorInstance\.onDidFocusEditorText/, 'MonacoEditor calls onDidFocusEditorText');

  const appMainSrc = readSource('src/components/layout/AppMain.vue');
  assert.match(appMainSrc, /@mousedown="dispatchClearGridSelection"/, 'AppMain binds mousedown on editor wrapper');

  const gridSelectionSrc = readSource('src/composables/useGridSelection.ts');
  assert.match(gridSelectionSrc, /CLEAR_GRID_SELECTION_EVENT/, 'useGridSelection listens to CLEAR_GRID_SELECTION_EVENT');
  assert.match(gridSelectionSrc, /active\.closest\('\.monaco-editor'\)/, 'useGridSelection protects Monaco editor from Ctrl+C intercept');
});
});

describe('result_export_group', () => {
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
});
