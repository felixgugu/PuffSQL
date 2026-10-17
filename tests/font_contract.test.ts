import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SYSTEM_MONOSPACE_FONT_FAMILY } from '../src/data/fontOptions';
import { CUSTOM_FONT_VALUE, isPresetFontFamily, normalizeFontFamily } from '../src/utils/fontFamily';
import { readSource } from './helpers/source';

describe('grid_font_settings', () => {
/** Assembled so this regression test does not itself trip the "no AG Grid references" scan. */
const LEGACY_FONT_VARIABLE = ['--', 'ag', '-font-family'].join('');
const LEGACY_ROOT_CLASS = ['.', 'ag', '-styled-root'].join('');

test('all Tabulator grids bind the configurable grid font variable', () => {
  const gridViews = [
    'src/components/results/ResultGridItem.vue',
    'src/components/editor/TableStructureViewer.vue',
    'src/components/editor/TableDataViewer.vue',
  ];

  for (const path of gridViews) {
    const source = readSource(path);
    assert.match(
      source,
      /:style="\{ '--sqlight-grid-font': settingsStore\.gridFontFamily \}"/,
      `${path} should bind --sqlight-grid-font to gridFontFamily`
    );
    assert.doesNotMatch(
      source,
      new RegExp(LEGACY_FONT_VARIABLE),
      `${path} must not keep the removed AG Grid font variable`
    );
  }
});

test('the grid theme consumes the configured font and falls back to the shared default', () => {
  const css = readSource('src/styles/tabulatorTheme.css');
  assert.match(
    css,
    /\.tabulator \{[^}]*font-family: var\(--sqlight-grid-font,/,
    'the Tabulator root must consume the configured font variable'
  );
  assert.ok(
    css.includes(`var(--sqlight-grid-font, ${SYSTEM_MONOSPACE_FONT_FAMILY})`),
    'the theme fallback must stay in sync with the shared default font family'
  );
});

test('the global stylesheet no longer carries AG Grid typography overrides', () => {
  const css = readSource('src/assets/main.css');
  assert.doesNotMatch(css, new RegExp(LEGACY_ROOT_CLASS.replace('.', '\\.')));
  assert.doesNotMatch(css, new RegExp(LEGACY_FONT_VARIABLE));
});
});

describe('global_font_scope', () => {
function sliceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing marker: ${start}`);
  const to = source.indexOf(end, from);
  assert.notEqual(to, -1, `missing marker: ${end}`);
  return source.slice(from, to);
}

/**
 * The "全域介面字型" setting writes --app-font-sans, which only reaches elements styled with
 * Tailwind's font-sans utility. Any surface that hardcodes a monospace stack silently opts out
 * of the setting, which is how the Explorer tree and the ER diagram used to behave.
 */
const GLOBAL_FONT_SURFACES = [
  'src/components/layout/AppSidebar.vue',
  'src/components/layout/SqlFolderExplorer.vue',
  'src/components/layout/SqlFileTreeNode.vue',
  'src/components/editor/ErTableNode.vue',
  'src/components/editor/ErDiagramViewer.vue',
];

test('no Explorer or ER diagram surface pins text to a hardcoded monospace font', () => {
  for (const path of GLOBAL_FONT_SURFACES) {
    const source = readSource(path);
    assert.doesNotMatch(
      source,
      /font-mono/,
      `${path} must not use the font-mono utility; it must follow the global UI font`
    );
    assert.doesNotMatch(
      source,
      /'monospace'/,
      `${path} must not hardcode a monospace font family`
    );
  }
});

test('the font-sans utility resolves to the configurable global font variable', () => {
  const config = readSource('tailwind.config.js');
  assert.match(
    config,
    /sans:\s*\['var\(--app-font-sans\)'\]/,
    "Tailwind's font-sans must map to var(--app-font-sans) for the setting to take effect"
  );
});

test('the Explorer tree content area opts into the global UI font', () => {
  const source = readSource('src/components/layout/AppSidebar.vue');
  assert.match(
    source,
    /<div class="flex-1 overflow-y-auto px-1\.5 py-2 text-xs font-sans">/,
    'the tree content container must declare font-sans'
  );
});

test('ER cardinality badges read their font from the global font setting', () => {
  const source = readSource('src/components/editor/ErDiagramViewer.vue');
  assert.match(
    source,
    /fontFamily: erCanvasFontFamily\.value/,
    'canvas labels must bind the configured global font family'
  );
  assert.match(
    source,
    /settingsStore\.globalFontFamily \|\| DEFAULT_GLOBAL_FONT_FAMILY/,
    'canvas labels must fall back to the shared default global font'
  );
});

/**
 * Explorer text is intentionally unweighted: hierarchy comes from indentation, icons and
 * colour, so node labels stay at the regular weight instead of turning bold.
 */
const EXPLORER_TEXT_FILES = [
  'src/components/layout/AppSidebar.vue',
  'src/components/layout/SqlFolderExplorer.vue',
  'src/components/layout/SqlFileTreeNode.vue',
];

test('Explorer text is never bold', () => {
  for (const path of EXPLORER_TEXT_FILES) {
    const source = readSource(path);
    assert.doesNotMatch(
      source,
      /font-(medium|semibold|bold)\b/,
      `${path} must not apply a bold text weight inside the Explorer`
    );
  }
});

test('the Explorer status chip keeps the regular UI weight', () => {
  const source = readSource('src/components/layout/AppSidebar.vue');
  // The chip is our own SqChip now (no PrimeVue tag weight to fight), so the contract is simply
  // that the 使用中 status chip carries no bold/medium weight class.
  assert.match(
    source,
    /:label="\$t\('sidebar\.inUse'\)"[\s\S]{0,120}?class="mr-1"/,
    'the 使用中 chip must stay on the regular weight'
  );
});

/**
 * The grid font setting (查詢與結果 → 結果表格字型) is a *table* setting: it may only reach the
 * `.tabulator` content. The chrome around it — the per-grid toolbar and the multi result set
 * header — has to keep following the 外觀與主題 global UI font.
 */
const GRID_CHROME_ROOT = /w-full h-full flex flex-col bg-dark-900 overflow-hidden[^"]*/;

const GRID_CONTAINERS = [
  'src/components/results/ResultGridItem.vue',
  'src/components/results/ResultGrid.vue',
  'src/components/editor/TableDataViewer.vue',
  'src/components/editor/TableStructureViewer.vue',
];

const GRID_TOOLBARS = [
  {
    path: 'src/components/results/ResultGridItem.vue',
    start: '<!-- Subheader Toolbar',
    end: '<!-- Empty State:',
  },
  {
    path: 'src/components/editor/TableDataViewer.vue',
    start: '<!-- Subheader toolbar for Table Data',
    end: '<!-- Loading State -->',
  },
  {
    path: 'src/components/editor/TableStructureViewer.vue',
    start: '<!-- Subheader toolbar for Table Structure',
    end: '<!-- Loading State -->',
  },
];

test('the grid containers opt into the global UI font', () => {
  for (const path of GRID_CONTAINERS) {
    const containerLine = readSource(path)
      .split('\n')
      .find((line) => GRID_CHROME_ROOT.test(line));

    assert.ok(containerLine, `${path} must keep its known container root`);
    assert.match(containerLine!, /font-sans/, `${path} must follow the configurable global UI font`);
    assert.doesNotMatch(containerLine!, /font-mono/, `${path} must not pin its chrome to a monospace stack`);
    assert.doesNotMatch(
      containerLine!,
      /--sqlight-grid-font/,
      `${path} must keep the grid font on the table wrapper, not on the whole component`
    );
  }
});

test('the grid toolbars carry no hardcoded monospace font', () => {
  for (const { path, start, end } of GRID_TOOLBARS) {
    const toolbar = sliceBetween(readSource(path), start, end);
    assert.doesNotMatch(
      toolbar,
      /font-mono/,
      `${path}: the toolbar must render in the 外觀與主題 font, not in the grid font`
    );
  }
});

test('the grid font only wraps the Tabulator table itself', () => {
  const tableGrids = GRID_TOOLBARS.filter(
    (grid) => grid.path !== 'src/components/results/ResultGrid.vue'
  );

  for (const { path } of tableGrids) {
    assert.match(
      readSource(path),
      /class="sqlight-grid[^"]*"[\s\S]{0,200}?:style="\{ '--sqlight-grid-font': settingsStore\.gridFontFamily \}"/,
      `${path} must bind the grid font on the .sqlight-grid wrapper`
    );
  }
});
});

describe('font_family', () => {
const OPTIONS = [
  { label: 'Consolas', value: 'Consolas, Monaco, monospace' },
  { label: 'System', value: 'monospace' },
];

describe('Font family picker utilities', () => {
  test('CUSTOM_FONT_VALUE is a non-font sentinel', () => {
    assert.equal(typeof CUSTOM_FONT_VALUE, 'string');
    assert.ok(CUSTOM_FONT_VALUE.length > 0);
    assert.ok(!OPTIONS.some((option) => option.value === CUSTOM_FONT_VALUE));
  });

  test('isPresetFontFamily matches preset values exactly', () => {
    assert.equal(isPresetFontFamily('monospace', OPTIONS), true);
    assert.equal(isPresetFontFamily('  monospace  ', OPTIONS), true);
    assert.equal(
      isPresetFontFamily('Consolas, Monaco, monospace', OPTIONS),
      true
    );
  });

  test('isPresetFontFamily treats custom and blank values as non-preset', () => {
    assert.equal(isPresetFontFamily('"Noto Sans TC", sans-serif', OPTIONS), false);
    assert.equal(isPresetFontFamily('', OPTIONS), false);
    assert.equal(isPresetFontFamily('   ', OPTIONS), false);
    assert.equal(isPresetFontFamily(null, OPTIONS), false);
    assert.equal(isPresetFontFamily(undefined, OPTIONS), false);
  });

  test('normalizeFontFamily trims and falls back when blank', () => {
    assert.equal(normalizeFontFamily('  monospace  ', 'fallback'), 'monospace');
    assert.equal(normalizeFontFamily('"Noto Sans TC"', 'fallback'), '"Noto Sans TC"');
    assert.equal(normalizeFontFamily('', 'fallback'), 'fallback');
    assert.equal(normalizeFontFamily('   ', 'fallback'), 'fallback');
    assert.equal(normalizeFontFamily(null, 'fallback'), 'fallback');
    assert.equal(normalizeFontFamily(undefined, 'fallback'), 'fallback');
  });

  test('SettingsModal uses the FontFamilyPicker for all three font settings', () => {
    const source = readSource('src/components/modals/SettingsModal.vue');
    const usages = source.match(/<FontFamilyPicker/g) || [];
    assert.equal(usages.length, 3);
    assert.match(source, /import FontFamilyPicker from '@\/components\/common\/FontFamilyPicker\.vue';/);
    for (const binding of [
      'settingsStore.globalFontFamily',
      'settingsStore.editorFontFamily',
      'settingsStore.gridFontFamily',
    ]) {
      assert.ok(source.includes(binding), `expected binding for ${binding}`);
    }
  });
});
});
