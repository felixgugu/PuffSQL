import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { computeFrameStats, isGridPerfDiagEnabled } from '../src/composables/useGridPerfDiag';
import { PERF_FIXTURE_DEFAULT_SPEC, PERF_FIXTURE_MAX_COLS, PERF_FIXTURE_MAX_ROWS, PERF_FIXTURE_MAX_SETS, buildPerfFixture, buildPerfFixtureColumns, parsePerfFixtureSpec } from '../src/utils/perfGridFixture';
import { readSource } from './helpers/source';

describe('grid_scroll_perf', () => {
const GRID_VIEWS = [
  'src/components/results/ResultGridItem.vue',
  'src/components/editor/TableDataViewer.vue',
  'src/components/editor/TableStructureViewer.vue',
];

test('computeFrameStats summarises samples with p95 and frame budget overruns', () => {
  const stats = computeFrameStats([16, 16, 16, 40]);
  assert.equal(stats.frames, 4);
  assert.equal(stats.avgMs, 22);
  assert.equal(stats.maxMs, 40);
  assert.equal(stats.p95Ms, 40);
  assert.equal(stats.overBudgetFrames, 1);
  assert.ok(stats.fps > 0);
  assert.deepEqual(computeFrameStats([]), {
    frames: 0,
    avgMs: 0,
    p95Ms: 0,
    maxMs: 0,
    fps: 0,
    overBudgetFrames: 0,
  });
});

test('perf HUD stays disabled outside an explicit dev opt-in', () => {
  assert.equal(isGridPerfDiagEnabled(), false);
});

test('result grid hands Tabulator raw row data instead of reactive proxies', () => {
  const source = readSource('src/components/results/ResultGridItem.vue');
  assert.match(source, /getRows: \(\) => gridRowData\.value/, 'the table must read the raw row-data computed');
  assert.match(source, /toRaw\(rows\)/, 'row data must be unwrapped with toRaw');
  assert.doesNotMatch(
    source,
    /:row-data=/,
    'the template must not bind reactive row data into a grid component any more'
  );
});

test('quick filter debounces large result sets, applies through setFilter and cleans up its timer', () => {
  const source = readSource('src/components/results/ResultGridItem.vue');

  assert.match(
    source,
    /v-model="quickFilterInput"/,
    'the input must bind the raw value, not the debounced one'
  );
  assert.doesNotMatch(
    source,
    /v-model="quickFilter"/,
    'binding the grid value directly to the input would skip the debounce'
  );
  assert.match(source, /const QUICK_FILTER_DEBOUNCE_MS = 250;/);
  assert.match(
    source,
    /const QUICK_FILTER_DEBOUNCE_ROW_THRESHOLD = 10000;/,
    'the measured ~100ms crossing is around 10k rows'
  );
  assert.match(source, /\}, QUICK_FILTER_DEBOUNCE_MS\);/, 'the debounce delay constant must drive the timer');
  assert.match(source, /table\.setFilter\(buildQuickFilter\(term\)\)/, 'the debounced value must reach Tabulator');
  assert.match(source, /table\.clearFilter\(\)/, 'an empty term must clear the filter');

  const unmountBlock = /onBeforeUnmount\(\(\) => \{([\s\S]*?)\n\}\);/.exec(source);
  assert.ok(unmountBlock, 'the component must still tear down on unmount');
  assert.match(
    unmountBlock![1]!,
    /clearTimeout\(quickFilterTimer\)/,
    'a pending debounce must not fire after the grid is gone'
  );
});

test('grids render every column and offer no per-column header filters', () => {
  for (const path of GRID_VIEWS) {
    const source = readSource(path);
    assert.doesNotMatch(
      source,
      /headerFilter/,
      `${path} must not add per-column header filters (migration decision)`
    );
    // Column windowing was explicitly deferred: the grids ship with the default all-columns
    // renderer, so this assertion documents the current decision rather than a permanent rule.
    assert.doesNotMatch(
      source,
      /renderHorizontal: 'virtual'/,
      `${path} must not silently enable horizontal virtualisation`
    );
    assert.match(
      source,
      /selectableRows: false/,
      `${path} must disable row selection so the range module initialises`
    );
    assert.match(
      source,
      /headerSortClickElement: 'icon'/,
      `${path} must sort from the arrow so header clicks can select columns`
    );
  }
});

test('the frozen # column keeps an opaque background', () => {
  const css = readSource('src/styles/tabulatorTheme.css');
  const rule = /\.sqlight-row-index-cell\s*\{([^}]*)\}/g;
  const matches = [...css.matchAll(rule)];
  assert.ok(matches.length > 0, 'row index column styling must exist');
  assert.ok(
    matches.some((match) => /background-color: var\(--sq-grid-bg\)/.test(match[1]!)),
    'the frozen cell needs an opaque background so scrolled content cannot bleed through'
  );
});

test('grid cells keep their content vertically centred', () => {
  const css = readSource('src/styles/tabulatorTheme.css');

  const cellRule = /\.tabulator-row \.tabulator-cell \{([^}]*)\}/.exec(css);
  assert.ok(cellRule, 'the cell rule must exist');
  const cellLineHeight = /line-height:\s*(\d+)px/.exec(cellRule![1]!);
  assert.ok(
    cellLineHeight,
    'cells are fixed height, so a matching line-height is what centres their content'
  );

  for (const path of GRID_VIEWS) {
    const rowHeight = /rowHeight: (\d+)/.exec(readSource(path));
    assert.ok(rowHeight, `${path} must define a fixed row height`);
    assert.equal(
      cellLineHeight![1],
      rowHeight![1],
      `the cell line-height must stay in sync with the ${path} row height`
    );
  }

  const headerRule = /\.tabulator-header \.tabulator-col \{([^}]*)\}/.exec(css);
  assert.ok(headerRule, 'the header column rule must exist');
  assert.match(headerRule![1]!, /justify-content: center/, 'header titles must be centred too');
  assert.match(css, /\.sqlight-badge \{[^}]*vertical-align: middle/);
});

test('perf fixture is dev-gated before the IPC layer', () => {
  const serviceSource = readSource('src/services/queryService.ts');
  assert.match(
    serviceSource,
    /import\.meta\.env\?\.DEV \? parsePerfFixtureSpec\(sql\) : null/,
    'the fixture shortcut must be gated behind import.meta.env.DEV'
  );
  assert.match(serviceSource, /buildPerfFixture\(fixture\)/);
});

test('grid perf HUD can measure quick-filter cost and restores the filter afterwards', () => {
  const diagSource = readSource('src/composables/useGridPerfDiag.ts');
  assert.match(diagSource, /export async function runFilterSettleBenchmark\(/);
  assert.equal(
    (diagSource.match(/const original = options\.current\(\);/g) ?? []).length,
    1,
    'the original filter value must be captured exactly once'
  );
  assert.match(
    diagSource,
    /options\.apply\(original\)/,
    'the benchmark must put the grid back how the component believes it is'
  );
  assert.match(diagSource, /Run filter benchmark/);
  assert.match(diagSource, /tabulator-tableholder/, 'the scroller selector must match Tabulator');
});

test('all three grids mount a Tabulator table and scope keyboard handling to it', () => {
  for (const path of GRID_VIEWS) {
    const source = readSource(path);
    assert.match(source, /useTabulatorTable\(/, `${path} must use the shared Tabulator lifecycle`);
    assert.match(source, /@scroll\.capture\.passive="handleGridScroll"/, `${path} must track horizontal scrolling`);
    assert.match(source, /class="sqlight-grid /, `${path} must opt into the shared grid theme`);
  }
});
});

describe('grid_perf_fixture', () => {
test('perf fixture spec is only recognised through the dev marker comment', () => {
  assert.equal(parsePerfFixtureSpec('SELECT 1'), null);
  assert.equal(parsePerfFixtureSpec(''), null);
  assert.equal(parsePerfFixtureSpec(undefined), null);
  assert.equal(parsePerfFixtureSpec('-- sqlight:perf-fixture cols=5'), null, 'line comments must not trigger');

  const spec = parsePerfFixtureSpec('/* sqlight:perf-fixture */');
  assert.deepEqual(spec, PERF_FIXTURE_DEFAULT_SPEC);
});

test('perf fixture spec reads cols, rows, sets and longtext tokens', () => {
  const spec = parsePerfFixtureSpec(
    'SELECT * FROM t; /* sqlight:perf-fixture cols=40 rows=50000 sets=3 longtext=1 */'
  );
  assert.deepEqual(spec, { cols: 40, rows: 50000, sets: 3, longtext: true });

  assert.equal(
    parsePerfFixtureSpec('/* sqlight:perf-fixture longtext=true */')?.longtext,
    true
  );
  assert.equal(
    parsePerfFixtureSpec('/* sqlight:perf-fixture longtext=0 */')?.longtext,
    false
  );
});

test('perf fixture spec clamps out-of-range values and ignores junk tokens', () => {
  const spec = parsePerfFixtureSpec(
    '/* sqlight:perf-fixture cols=99999 rows=9999999 sets=99 longtext=maybe nonsense */'
  );
  assert.equal(spec?.cols, PERF_FIXTURE_MAX_COLS);
  assert.equal(spec?.rows, PERF_FIXTURE_MAX_ROWS);
  assert.equal(spec?.sets, PERF_FIXTURE_MAX_SETS);
  assert.equal(spec?.longtext, false);

  const zeroed = parsePerfFixtureSpec('/* sqlight:perf-fixture cols=0 rows=0 sets=0 */');
  assert.deepEqual(zeroed, { ...PERF_FIXTURE_DEFAULT_SPEC, cols: 1, rows: 1, sets: 1 });

  const unparsable = parsePerfFixtureSpec('/* sqlight:perf-fixture cols=abc rows= */');
  assert.deepEqual(unparsable, PERF_FIXTURE_DEFAULT_SPEC);
});

test('perf fixture columns cycle through the type mix and are nullable on demand', () => {
  const columns = buildPerfFixtureColumns(8, false);
  assert.equal(columns.length, 8);
  assert.deepEqual(
    columns.map((column) => column.dataType),
    ['int', 'bigint', 'nvarchar', 'bit', 'datetime2', 'decimal', 'uniqueidentifier', 'varbinary']
  );
  assert.deepEqual(
    columns.map((column) => column.ordinal),
    [0, 1, 2, 3, 4, 5, 6, 7]
  );
  assert.equal(columns[1]?.nullable, false, 'non-nullable types stay non-nullable');
  assert.equal(columns[2]?.nullable, true, 'nullable types stay nullable');
  assert.ok(!columns.some((column) => column.dataType === 'nvarchar(max)'));
});

test('perf fixture longtext mode adds nvarchar(max) columns including StmtText', () => {
  const columns = buildPerfFixtureColumns(40, true);
  const longTextColumns = columns.filter((column) => column.dataType === 'nvarchar(max)');
  assert.ok(longTextColumns.length >= 2, 'longtext must add more than one wide column');
  assert.equal(columns[columns.length - 1]?.name, 'StmtText');
  assert.equal(columns[columns.length - 1]?.dataType, 'nvarchar(max)');
  assert.ok(
    longTextColumns.every((column) => column.nullable),
    'wide text columns must be nullable so the NULL path is exercised'
  );
});

test('perf fixture shapes result sets from the requested dimensions', () => {
  const result = buildPerfFixture({ cols: 12, rows: 5, sets: 2 });
  assert.equal(result.resultSets.length, 2);
  assert.equal(result.affectedRows, 0);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0]?.level, 'info');

  for (const set of result.resultSets) {
    assert.equal(set.columns.length, 12);
    assert.equal(set.rows.length, 5);
    assert.equal(set.rowCount, 5);
    assert.equal(set.totalCount, 5);
    assert.ok(Array.isArray(set.rows[0]), 'rows must be positional arrays, not records');
    assert.equal(set.rows[0]?.length, 12);
  }
});

test('perf fixture uses the documented default size', () => {
  const result = buildPerfFixture();
  assert.equal(result.resultSets.length, PERF_FIXTURE_DEFAULT_SPEC.sets);
  assert.equal(result.resultSets[0]?.columns.length, PERF_FIXTURE_DEFAULT_SPEC.cols);
  assert.equal(result.resultSets[0]?.rows.length, PERF_FIXTURE_DEFAULT_SPEC.rows);
});

test('perf fixture is deterministic for a given spec', () => {
  const first = buildPerfFixture({ cols: 9, rows: 40, sets: 2 });
  const second = buildPerfFixture({ cols: 9, rows: 40, sets: 2 });

  assert.deepEqual(first.resultSets, second.resultSets, 'A/B runs must see identical cell data');
  assert.deepEqual(
    first.messages.map((message) => message.message),
    second.messages.map((message) => message.message)
  );
  assert.notDeepEqual(
    first.resultSets[0]!.rows,
    first.resultSets[1]!.rows,
    'each set must use its own seed'
  );
});

test('perf fixture injects NULLs on a fixed cadence and keeps value types honest', () => {
  const result = buildPerfFixture({ cols: 8, rows: 40 });
  const rows = result.resultSets[0]!.rows;
  const nullableIndex = result.resultSets[0]!.columns.findIndex((column) => column.nullable);
  assert.ok(nullableIndex >= 0);

  assert.equal(rows[0]?.[nullableIndex], null, 'row 0 is blank in nullable columns');
  assert.equal(rows[17]?.[nullableIndex], null, 'row 17 repeats the cadence');
  assert.notEqual(rows[1]?.[nullableIndex], null, 'rows in between keep their value');

  const types = result.resultSets[0]!.columns.map((column) => column.dataType);
  const bitRow = rows.find((row) => typeof row[3] === 'boolean');
  assert.ok(bitRow, 'bit columns must emit real booleans');
  assert.ok(
    rows.some((row) => typeof row[0] === 'number'),
    'int columns must emit numbers'
  );

  const binaryIndex = types.indexOf('varbinary');
  assert.ok(binaryIndex >= 0);
  const binaryCell = rows[1]?.[binaryIndex];
  assert.ok(binaryCell && typeof binaryCell === 'object', 'binary columns emit descriptor objects');
  assert.equal((binaryCell as { type: string }).type, 'binary');
  const binaryLength = (binaryCell as { length: number }).length;
  assert.ok(Number.isInteger(binaryLength) && binaryLength >= 16 && binaryLength <= 80);
});
});
