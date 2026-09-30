import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import type { Tabulator } from 'tabulator-tables';
import { buildLayoutKey, useGridLayoutStore } from '../src/stores/gridLayoutStore';

function freshStore() {
  setActivePinia(createPinia());
  return useGridLayoutStore();
}

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

function sliceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing marker: ${start}`);
  const to = source.indexOf(end, from);
  assert.notEqual(to, -1, `missing marker: ${end}`);
  return source.slice(from, to);
}

interface FakeTable {
  table: Tabulator;
  appliedLayouts: unknown[][];
  appliedSorters: unknown[][];
}

function makeFakeTable(
  columns: Array<{ field: string; width: number; visible?: boolean }>,
  sorters: Array<{ field: string; dir: 'asc' | 'desc' }> = []
): FakeTable {
  const appliedLayouts: unknown[][] = [];
  const appliedSorters: unknown[][] = [];
  const table = {
    getColumns: () =>
      columns.map((column) => ({
        getField: () => column.field,
        getWidth: () => column.width,
        isVisible: () => column.visible !== false,
      })),
    getSorters: () => sorters,
    setColumnLayout: (layout: unknown[]) => {
      appliedLayouts.push(layout);
      return true;
    },
    setSort: (next: unknown[]) => {
      appliedSorters.push(next);
    },
  } as unknown as Tabulator;
  return { table, appliedLayouts, appliedSorters };
}

test('buildLayoutKey namespaces result sets by tab and set index', () => {
  assert.equal(buildLayoutKey('tab-1', 0), 'tab-1:0');
  assert.equal(buildLayoutKey('tab-1', 2), 'tab-1:2');
  assert.equal(buildLayoutKey(null, 0), 'orphan:0');
  assert.equal(buildLayoutKey(undefined, 1), 'orphan:1');
});

test('capture then restore round-trips column layout and sorters', () => {
  const store = freshStore();
  const key = store.layoutKey('tab-a', 0);

  const source = makeFakeTable(
    [
      { field: '__sqlight_row', width: 60 },
      { field: '0', width: 240 },
      { field: '1', width: 120, visible: false },
    ],
    [{ field: '0', dir: 'asc' }]
  );

  store.capture(key, source.table);
  assert.equal(store.has(key), true);

  const target = makeFakeTable([]);
  assert.equal(store.restore(key, target.table), true);
  assert.deepEqual(target.appliedLayouts, [
    [
      { field: '__sqlight_row', width: 60, visible: true },
      { field: '0', width: 240, visible: true },
      { field: '1', width: 120, visible: false },
    ],
  ]);
  // Tabulator resolves sorters by `column` (a field name works), not by the `field` key of the
  // sorter object it returns from `getSorters()`.
  assert.deepEqual(target.appliedSorters, [[{ column: '0', dir: 'asc' }]]);
});

test('restore is a no-op for an unknown key and skips an empty sorter list', () => {
  const store = freshStore();
  const target = makeFakeTable([]);
  assert.equal(store.restore(store.layoutKey('tab-missing', 0), target.table), false);
  assert.equal(target.appliedLayouts.length, 0);

  const key = store.layoutKey('tab-b', 0);
  store.capture(key, makeFakeTable([{ field: '0', width: 90 }]).table);
  const restored = makeFakeTable([]);
  store.restore(key, restored.table);
  assert.equal(restored.appliedLayouts.length, 1);
  assert.equal(restored.appliedSorters.length, 0);
});

test('capture ignores non-directional sorters and tolerates a missing grid', () => {
  const store = freshStore();
  const key = store.layoutKey('tab-c', 0);
  const source = makeFakeTable([{ field: '0', width: 100 }], [
    { field: '0', dir: 'asc' },
    { field: '', dir: 'asc' },
    { field: '1', dir: undefined as unknown as 'asc' },
  ]);

  store.capture(key, source.table);
  const target = makeFakeTable([]);
  store.restore(key, target.table);
  assert.deepEqual(target.appliedSorters, [[{ column: '0', dir: 'asc' }]]);

  // A grid torn down mid-capture must not throw.
  store.capture(store.layoutKey('tab-d', 0), null);
});

test('active set index is remembered per tab and cleared with its layouts', () => {
  const store = freshStore();
  assert.equal(store.getActiveSetIndex('tab-x'), null);

  store.setActiveSetIndex('tab-x', 3);
  store.capture(store.layoutKey('tab-x', 3), makeFakeTable([{ field: '0', width: 100 }]).table);
  assert.equal(store.getActiveSetIndex('tab-x'), 3);
  assert.equal(store.has('tab-x:3'), true);

  store.clearTab('tab-x');
  assert.equal(store.getActiveSetIndex('tab-x'), null);
  assert.equal(store.has('tab-x:3'), false);
  // Other tabs are untouched by a scoped clear.
  store.capture(store.layoutKey('tab-y', 0), makeFakeTable([{ field: '0', width: 100 }]).table);
  store.clearTab('tab-x');
  assert.equal(store.has('tab-y:0'), true);
});

test('hidden toolbars are remembered per result tab and cleared with the tab', () => {
  const store = freshStore();
  assert.equal(store.isToolbarHidden('tab-t'), false);
  assert.equal(store.isToolbarHidden(null), false);
  // An unknown tab id must be ignored rather than remembered under a shared key.
  store.setToolbarHidden(null, true);
  store.setToolbarHidden(undefined, true);
  assert.equal(store.isToolbarHidden('orphan'), false);

  store.setToolbarHidden('tab-t', true);
  assert.equal(store.isToolbarHidden('tab-t'), true);
  assert.equal(store.isToolbarHidden('tab-other'), false, 'other tabs keep their own toolbars');

  assert.equal(store.toggleToolbarHidden('tab-t'), false);
  assert.equal(store.isToolbarHidden('tab-t'), false);
  assert.equal(store.toggleToolbarHidden('tab-t'), true);
  assert.equal(store.isToolbarHidden('tab-t'), true);
  assert.equal(store.toggleToolbarHidden(null), false, 'a missing tab id cannot be toggled');

  store.clearTab('tab-t');
  assert.equal(store.isToolbarHidden('tab-t'), false);
});

test('multiple result sets default to hiding toolbars until explicitly toggled', () => {
  const store = freshStore();
  // When defaultHidden is true (multi result sets view):
  assert.equal(store.isToolbarHidden('tab-m', true), true);

  // Toggling flips from default-hidden (true) to visible (false)
  assert.equal(store.toggleToolbarHidden('tab-m', true), false);
  assert.equal(store.isToolbarHidden('tab-m', true), false);

  // Toggling again flips from visible (false) back to hidden (true)
  assert.equal(store.toggleToolbarHidden('tab-m', true), true);
  assert.equal(store.isToolbarHidden('tab-m', true), true);

  // Clearing the tab resets the preference back to defaultHidden
  store.clearTab('tab-m');
  assert.equal(store.isToolbarHidden('tab-m', true), true);
});

test('the hide-toolbar toggle sits in AppBottomPanel and reaches every grid pane', () => {
  const panel = readSource('src/components/layout/AppBottomPanel.vue');
  assert.match(panel, /toggleToolbarVisibility/);
  assert.match(panel, /results\.hideToolbars/);
  assert.match(panel, /results\.showToolbars/);

  const grid = readSource('src/components/results/ResultGrid.vue');
  assert.equal(
    (grid.match(/:hide-toolbar="toolbarHidden"/g) ?? []).length,
    3,
    'single, maximized, and stacked panes must all receive the flag'
  );
  assert.match(grid, /gridLayoutStore\.isToolbarHidden\(props\.tabId \?\? null, true\)/);

  const item = readSource('src/components/results/ResultGridItem.vue');
  assert.match(item, /hideToolbar\?: boolean;/);
  assert.equal(
    (item.match(/v-if="!hideToolbar"/g) ?? []).length,
    2,
    'both the toolbar and the info bar must be hidden'
  );
});

test('result grids wire layout restore and capture into the Tabulator lifecycle', () => {
  const item = readFileSync(
    resolve(process.cwd(), 'src/components/results/ResultGridItem.vue'),
    'utf-8'
  );
  assert.match(item, /gridLayoutStore\.restore\(layoutKey\.value/, 'grid ready must restore the layout');
  assert.match(item, /table\.on\('columnResized', scheduleLayoutCapture\)/);
  assert.match(item, /table\.on\('columnMoved', handleColumnMoved\)/);
  assert.match(item, /table\.on\('columnVisibilityChanged', scheduleLayoutCapture\)/);
  assert.match(item, /table\.on\('dataSorted', scheduleLayoutCapture\)/);
  assert.match(item, /captureLayoutNow\(\);/, 'unmount must snapshot the final layout');
  assert.match(item, /tabId\?: string \| null;/, 'result grid item must accept an explicit tab id');

  const grid = readFileSync(resolve(process.cwd(), 'src/components/results/ResultGrid.vue'), 'utf-8');
  assert.match(grid, /:key="itemKey\(/);
  assert.match(grid, /:tab-id="tabId"/, 'parent must pass an explicit tab id');

  const panel = readFileSync(resolve(process.cwd(), 'src/components/layout/AppBottomPanel.vue'), 'utf-8');
  assert.match(panel, /:tab-id="queryStore\.activeResultTabId"/);
});

test('refresh resets sorting and filtering instead of restoring them', () => {
  const item = readSource('src/components/results/ResultGridItem.vue');

  // The reset runs on every successful refresh…
  assert.match(
    sliceBetween(item, 'async function handleRefresh()', '// Check editability'),
    /resetGridState\(\);/,
    'refresh must reset the visible view state'
  );

  // …and drops sorting, filtering and the quick-filter input while keeping column widths.
  const resetBody = sliceBetween(item, 'function resetGridState()', 'async function handleRefresh()');
  assert.match(resetBody, /clearQuickFilter\(\)/);
  assert.match(resetBody, /table\.clearSort\(\)/);
  assert.match(resetBody, /table\.clearFilter\(\)/);

  // The shared helper (also driven by the input's clear icon) empties both the visible input and
  // the debounced filter value.
  const clearBody = sliceBetween(item, 'function clearQuickFilter()', 'function resetGridState()');
  assert.match(clearBody, /quickFilterInput\.value = ''/);
  assert.match(clearBody, /quickFilter\.value = ''/);
  assert.match(
    resetBody,
    /gridLayoutStore\.capture\(layoutKey\.value, table\)/,
    'the remembered sorters must be overwritten so a rebuild cannot bring them back'
  );
  assert.doesNotMatch(resetBody, /setColumnLayout|setSort\(/, 'column layout must survive a refresh');

  for (const path of [
    'src/components/editor/TableDataViewer.vue',
    'src/components/editor/TableStructureViewer.vue',
  ]) {
    const source = readSource(path);
    assert.match(source, /resetGridState\(\);/, `${path} must reset on reload`);
    assert.match(source, /table\.clearSort\(\)/, `${path} must drop the sorter`);
    assert.match(source, /table\.clearFilter\(\)/, `${path} must drop the quick filter`);
  }
});
