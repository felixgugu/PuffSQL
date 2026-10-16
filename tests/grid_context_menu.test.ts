/**
 * grid context menu — merged from grid_context_menu_actions, grid_context_menu_column_name, grid_double_click_copy:
 * one file per component and layer instead of 3 files that all read the same sources.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { countOccurrences, readSource } from './helpers/source';

describe('grid_context_menu_actions', () => {
/**
 * The full-table copy actions live in the toolbar. They used to be duplicated at the bottom of
 * every grid context menu, which made the menu longer without adding reachable functionality.
 */
const grids: Array<{ path: string; actions: string[] }> = [
  {
    path: 'src/components/results/ResultGridItem.vue',
    actions: ['copyAsTsv', 'copyAsCsv', 'copyAsJson', 'copyAsMarkdown'],
  },
  {
    path: 'src/components/editor/TableDataViewer.vue',
    actions: ['copyAsTsv', 'copyAsJson', 'copyAsMarkdown'],
  },
  {
    path: 'src/components/editor/TableStructureViewer.vue',
    actions: ['copyAsTsv', 'copyAsJson', 'copyAsMarkdown'],
  },
];

describe('Grid context menus own the actions the toolbars cannot reach', () => {
  for (const grid of grids) {
    test(`${grid.path} binds each full-table copy action exactly once`, () => {
      const source = readSource(grid.path);

      for (const action of grid.actions) {
        assert.equal(
          countOccurrences(source, `@click="${action}"`),
          1,
          `${action} must only be wired to the toolbar button`
        );
      }

      assert.doesNotMatch(
        source.replace(/v-tooltip\.top="'[^']*'"/g, ''),
        /複製全表(結構)?為 (TSV|JSON|Markdown)/,
        'the context menu must not repeat the full-table copy entries'
      );
    });
  }

  test('the row level copy actions stay in the context menu', () => {
    const result = readSource('src/components/results/ResultGridItem.vue');
    assert.match(result, /(?:複製儲存格值 \(Copy Cell\)|results\.copyCell)/);
    assert.match(result, /(?:複製欄位名稱 \(Column Name\)|results\.copyColumnName)/);
    assert.match(result, /(?:複製整列資料 \(Copy Row\)|results\.copyRow)/);
    assert.match(result, /(?:複製整列為 JSON \(Row JSON\)|results\.copyRowJson)/);
  });

  for (const grid of grids) {
    test(`${grid.path} keeps selection copy in the context menu only`, () => {
      const source = readSource(grid.path);

      assert.equal(
        countOccurrences(source, '@click="copySelectedCells"'),
        1,
        'the aggregate bar must not repeat the context menu action'
      );
      assert.doesNotMatch(
        source,
        /Copy Selection Button/,
        'the aggregate bar copy-selection button was removed'
      );
      assert.match(
        source,
        /onCopySelected: \(\) => gridExport\.copySelectedCells\(\)/,
        'Ctrl+C must keep copying the current selection'
      );
      assert.match(source, /(?:複製選取內容 \(\{\{ selectionStats\?\.totalCells \}\} 格\)|results\.copySelection)/);
    });
  }
});
});

describe('grid_context_menu_column_name', () => {
describe('Result grid context menu: copy column name', () => {
  test('useGridExport exposes a copyColumnName action', () => {
    const source = readSource('src/composables/useGridExport.ts');
    assert.match(
      source,
      /copyColumnName: \(name: string\) => void;/,
      'UseGridExportReturn should declare copyColumnName'
    );
    assert.match(
      source,
      /function copyColumnName\(name: string\)/,
      'useGridExport should implement copyColumnName'
    );
    assert.match(
      source,
      /navigator\.clipboard\.writeText\(text\)/,
      'copyColumnName should write to the clipboard'
    );
    assert.match(
      source,
      /\n    copyColumnName,/,
      'copyColumnName should be returned from useGridExport'
    );
  });

  test('ResultGridItem renders the column name item directly below Copy Cell', () => {
    const source = readSource('src/components/results/ResultGridItem.vue');

    const copyCellIdx = source.indexOf('results.copyCell') !== -1 ? source.indexOf('results.copyCell') : source.indexOf('複製儲存格值 (Copy Cell)');
    const copyColumnIdx = source.indexOf('results.copyColumnName') !== -1 ? source.indexOf('results.copyColumnName') : source.indexOf('複製欄位名稱 (Column Name)');
    const copyRowIdx = source.indexOf('results.copyRow') !== -1 ? source.indexOf('results.copyRow') : source.indexOf('複製整列資料 (Copy Row)');

    assert.ok(copyCellIdx !== -1, 'Copy Cell item should exist');
    assert.ok(copyColumnIdx !== -1, 'Column Name item should exist');
    assert.ok(copyRowIdx !== -1, 'Copy Row item should exist');

    assert.ok(
      copyCellIdx < copyColumnIdx,
      'Column Name should appear after Copy Cell'
    );
    assert.ok(
      copyColumnIdx < copyRowIdx,
      'Column Name should appear before Copy Row'
    );
  });

  test('ResultGridItem wires the menu item to the exported action', () => {
    const source = readSource('src/components/results/ResultGridItem.vue');
    assert.match(
      source,
      /copyColumnName: exportCopyColumnName,/,
      'copyColumnName should be destructured from the export composable'
    );
    assert.match(
      source,
      /function copyColumnName\(\) \{\s*exportCopyColumnName\(contextMenu\.colName\);\s*\}/,
      'menu handler should copy the context menu column name'
    );
    assert.match(
      source,
      /@click="copyColumnName"/,
      'the Column Name button should call copyColumnName'
    );
  });
});
});

describe('grid_double_click_copy', () => {
describe('Result grid: double-click copies a read-only cell value', () => {
  test('ResultGridItem binds the Tabulator cellDblClick event', () => {
    const source = readSource('src/components/results/ResultGridItem.vue');

    assert.match(
      source,
      /table\.on\('cellDblClick', handleCellDoubleClick\)/,
      'the grid must subscribe to cellDblClick'
    );
    assert.match(
      source,
      /function handleCellDoubleClick\(_event: MouseEvent, cell: TabulatorCellComponent\)/,
      'ResultGridItem should implement handleCellDoubleClick'
    );
    assert.match(
      source,
      /import type \{\s*TabulatorCellComponent,/,
      'TabulatorCellComponent should be imported from tabulator-tables'
    );
  });

  test('double-click copy leaves editable cells to the editor', () => {
    const source = readSource('src/components/results/ResultGridItem.vue');

    const guardIdx = source.indexOf('if (isColumnEditable(colIdx)) return;');
    const writeIdx = source.indexOf('navigator.clipboard.writeText(text)', guardIdx);

    assert.ok(guardIdx !== -1, 'the handler should bail out when the cell is editable');
    assert.ok(
      writeIdx !== -1 && guardIdx < writeIdx,
      'the editable check must run before the clipboard write'
    );
  });

  test('double-click copy ignores the row number column and reuses export formatting', () => {
    const source = readSource('src/components/results/ResultGridItem.vue');

    assert.match(
      source,
      /const colIdx = getColIndex\(cell\.getField\(\)\);/,
      'the handler should resolve the data column index via getColIndex'
    );
    assert.match(
      source,
      /const text = formatCellForExport\(cell\.getValue\(\) as CellValue\);/,
      'the handler should reuse formatCellForExport'
    );
  });

  test('double-click copy reports both success and failure', () => {
    const source = readSource('src/components/results/ResultGridItem.vue');

    assert.match(
      source,
      /workspaceStore\.showToast\(`已複製「\$\{colName\}」的值至剪貼簿`, 'success'/,
      'a successful copy should toast the column name'
    );
    assert.match(
      source,
      /workspaceStore\.showToast\('複製失敗：無法寫入剪貼簿', 'warning'/,
      'a failed clipboard write should be surfaced as a warning'
    );
  });
});
});
