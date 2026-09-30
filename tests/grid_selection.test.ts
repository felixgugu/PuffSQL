import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Tabulator } from 'tabulator-tables';
import {
  formatAggregateNumber,
  readCellValue,
  useGridSelection,
} from '../src/composables/useGridSelection';
import {
  columnIndexFromField,
  coerceEditedValue,
  fieldForColumnIndex,
} from '../src/utils/tabulatorColumns';
import {
  clearGridRanges,
  CLEAR_GRID_SELECTION_EVENT,
  dispatchClearGridSelection,
} from '../src/utils/tabulatorGrid';
import type { CellValue, ColumnDef } from '../src/types/query';

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

function readTheme(): string {
  return readFileSync(resolve(process.cwd(), 'src/styles/tabulatorTheme.css'), 'utf-8');
}

function themeBlock(css: string, selector: string): string {
  return new RegExp(`${selector} \\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? '';
}

test('dark theme selection palette matches the agreed colours', () => {
  const css = readTheme();
  const darkBlock = themeBlock(css, 'html\\.dark \\.tabulator');

  assert.match(darkBlock, /--sq-grid-range-fill: rgba\(56, 125, 237, 0\.25\)/, 'selection area tint');
  assert.match(
    darkBlock,
    /--sq-grid-range-active-fill: rgba\(56, 125, 237, 0\.45\)/,
    'active cell tint'
  );
  assert.match(darkBlock, /--sq-grid-range-border: #3b82f6/, 'selection border colour');
  assert.match(darkBlock, /--sq-grid-range-handle: #3b82f6/, 'drag handle colour');
  assert.match(darkBlock, /--sq-grid-range-text: #ffffff/, 'selection text colour');

  const cellRule =
    /\.tabulator-row \.tabulator-cell\.tabulator-range-selected \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(cellRule, /background-color: var\(--sq-grid-range-fill\)/);
  assert.match(cellRule, /color: var\(--sq-grid-range-text\)/);

  const outlineRule =
    /\.tabulator-range-overlay \.tabulator-range \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(
    outlineRule,
    /border: var\(--sq-grid-range-border-width\) solid var\(--sq-grid-range-border\)/
  );

  const activeRule = /\.tabulator-range-cell-active \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(activeRule, /background-color: var\(--sq-grid-range-active-fill\)/);
  assert.match(activeRule, /border: 2px solid var\(--sq-grid-range-border\)/);

  const handleRule =
    /\.tabulator-range\.tabulator-range-active::after \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(handleRule, /width: 4px;/, 'the drag handle is a 4x4 square');
  assert.match(handleRule, /height: 4px;/);
  assert.match(handleRule, /border-radius: 0;/);
  assert.match(handleRule, /background-color: var\(--sq-grid-range-handle\)/);
});

test('light theme palette keeps the header anchored and the accents readable', () => {
  const css = readTheme();
  const lightBlock = themeBlock(css, 'html:not\\(\\.dark\\) \\.tabulator');

  // Header: the chrome surface, muted text, readable sort arrows and a stronger bottom line.
  assert.match(lightBlock, /--sq-grid-header-bg: rgb\(var\(--color-dark-850\)\)/);
  assert.match(lightBlock, /--sq-grid-header-text: rgb\(var\(--color-dark-500\)\)/);
  // The sort arrow is the only sort affordance, so it must clear 3:1 on the light header.
  assert.match(lightBlock, /--sq-grid-sort-icon: #64748b/);
  assert.match(lightBlock, /--sq-grid-sort-icon-hover: #1e293b/);
  assert.match(lightBlock, /--sq-grid-border: rgb\(var\(--color-dark-700\)\)/);
  assert.match(
    css,
    /\.tabulator \.tabulator-header,\s*\n\.tabulator \.tabulator-footer \{\s*\n\s*border-color: var\(--sq-grid-border\)/,
    'the header must keep the 1px structural line'
  );

  // Rows: the soft grey canvas surface, soft separators, a hover tint and softer-than-black text.
  // These resolve through the shell's tokens, so the grid keeps following the surface palette.
  assert.match(lightBlock, /--sq-grid-bg: rgb\(var\(--color-dark-900\)\)/);
  assert.match(lightBlock, /--sq-grid-fg: rgb\(var\(--color-dark-300\)\)/);
  assert.match(lightBlock, /--sq-grid-line: rgb\(var\(--color-dark-800\)\)/);
  assert.match(lightBlock, /--sq-grid-row-hover: rgb\(var\(--color-dark-800\)\)/);
  assert.match(lightBlock, /--sq-grid-row-stripe: rgb\(var\(--color-dark-850\)\)/);
  assert.match(css, /\.tabulator-row:hover \{\s*\n\s*background-color: var\(--sq-grid-row-hover\)/);

  // Selection: a barely-there wash with a bright focus border and handle.
  assert.match(lightBlock, /--sq-grid-range-fill: rgba\(59, 130, 246, 0\.08\)/);
  assert.match(lightBlock, /--sq-grid-range-border: #2563eb/);
  assert.match(lightBlock, /--sq-grid-range-handle: #2563eb/);

  // Accents that read as neon on white get solid, contrast-safe replacements.
  assert.match(lightBlock, /--sq-grid-pk-accent: #b45309/);
  assert.match(lightBlock, /--sq-grid-identity-accent: #0e7490/);
  assert.match(lightBlock, /--sq-grid-type-accent: #0369a1/);
  assert.match(lightBlock, /--sq-grid-fulltype-accent: #047857/);
});

test('boolean values render as theme aware pills', () => {
  const columns = readFileSync(
    resolve(process.cwd(), 'src/utils/tabulatorColumns.ts'),
    'utf-8'
  );
  assert.match(columns, /sqlight-bool-badge \$\{value \? 'sqlight-bool-true' : 'sqlight-bool-false'\}/);

  const css = readTheme();
  const truePill = /html:not\(\.dark\) \.sqlight-bool-badge\.sqlight-bool-true \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(truePill, /border: 1px solid #a7f3d0/);
  assert.match(truePill, /background-color: #ecfdf5/);
  assert.match(truePill, /color: #059669/);

  const falsePill = /html:not\(\.dark\) \.sqlight-bool-badge\.sqlight-bool-false \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(falsePill, /background-color: #e2e8f0/);
  assert.match(falsePill, /color: #475569/);

  // The structure viewer badges get the same treatment.
  for (const [selector, background, text] of [
    ['\\.sqlight-badge-pk', '#fffbeb', '#b45309'],
    ['\\.sqlight-badge-yes', '#ecfdf5', '#059669'],
    ['\\.sqlight-badge-no', '#e2e8f0', '#475569'],
    ['\\.sqlight-badge-identity', '#ecfeff', '#0e7490'],
  ] as const) {
    const rule = new RegExp(`html:not\\(\\.dark\\) ${selector} \\{([\\s\\S]*?)\\n\\}`, 'g').exec(css)?.[1] ?? '';
    assert.match(rule, new RegExp(`background-color: ${background}`), `${selector} background`);
    assert.match(rule, new RegExp(`color: ${text}`), `${selector} text colour`);
  }
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
  const monacoSrc = readFileSync(resolve(process.cwd(), 'src/components/editor/MonacoEditor.vue'), 'utf-8');
  assert.match(monacoSrc, /dispatchClearGridSelection\(\)/, 'MonacoEditor must call dispatchClearGridSelection');
  assert.match(monacoSrc, /editorContainer\.value\.addEventListener\('mousedown'/, 'MonacoEditor attaches mousedown on editorContainer');
  assert.match(monacoSrc, /editorInstance\.onMouseDown/, 'MonacoEditor calls onMouseDown');
  assert.match(monacoSrc, /editorInstance\.onDidFocusEditorText/, 'MonacoEditor calls onDidFocusEditorText');

  const appMainSrc = readFileSync(resolve(process.cwd(), 'src/components/layout/AppMain.vue'), 'utf-8');
  assert.match(appMainSrc, /@mousedown="dispatchClearGridSelection"/, 'AppMain binds mousedown on editor wrapper');

  const gridSelectionSrc = readFileSync(resolve(process.cwd(), 'src/composables/useGridSelection.ts'), 'utf-8');
  assert.match(gridSelectionSrc, /CLEAR_GRID_SELECTION_EVENT/, 'useGridSelection listens to CLEAR_GRID_SELECTION_EVENT');
  assert.match(gridSelectionSrc, /active\.closest\('\.monaco-editor'\)/, 'useGridSelection protects Monaco editor from Ctrl+C intercept');
});
