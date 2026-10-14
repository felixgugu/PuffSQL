import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TAB_CATEGORY_THEMES, getTabThemeStyle } from '../src/utils/tabTheme';
import { THEME_ROLE_COLORS } from '../src/services/themeManager';
import type { TabType } from '../src/types/workspace';

const ALL_TAB_TYPES: TabType[] = [
  'sql_editor',
  'table_data',
  'table_structure',
  'execution_plan',
  'er_diagram',
];

/** Reads the role name out of an `rgb(var(--color-ok))` style reference. */
function roleOf(value: string): string {
  const match = /var\(--color-([a-z-]+)\)/.exec(value);
  assert.ok(match, `${value} must reference a colour token`);
  return match[1]!;
}

test('each workspace tab type is distinct, and every accent is a role token', () => {
  assert.equal(Object.keys(TAB_CATEGORY_THEMES).length, 5);

  const accents = new Set<string>();
  for (const type of ALL_TAB_TYPES) {
    const theme = TAB_CATEGORY_THEMES[type];
    assert.ok(theme, `Theme for ${type} must exist`);
    assert.equal(theme.type, type);
    assert.ok(theme.label, `Label for ${type} must exist`);

    assert.match(theme.accent, /^rgb\(var\(--color-[a-z-]+\)\)$/, `${type} accent must be a token`);
    assert.ok(
      THEME_ROLE_COLORS[roleOf(theme.accent)],
      `${type} accent must resolve in the theme role table`
    );
    accents.add(theme.accent);
  }

  assert.equal(accents.size, 5, 'All 5 categories must stay visually distinct');
});

test('the category palette holds no raw colour values', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/utils/tabTheme.ts'), 'utf-8');
  // The one exception is the sentinel for a legacy saved setting.
  const hexes = [...source.matchAll(/#[0-9a-fA-F]{3,8}/g)].map((match) => match[0]);
  assert.deepEqual(hexes, ['#1e40af'], 'only the legacy-default sentinel may be a literal');
  assert.doesNotMatch(source, /--p-primary-color/, 'PrimeVue theme variables are gone');
});

test('inactive tabs are neutral chrome so the accent stays the only colour signal', () => {
  for (const type of ALL_TAB_TYPES) {
    const style = getTabThemeStyle(type, false);
    assert.equal(style['--tab-bg'], 'transparent');
    assert.equal(style['--tab-border'], 'rgb(var(--color-dark-700))');
    assert.equal(style['--tab-text'], 'rgb(var(--color-dark-500))');
    assert.equal(style['--tab-hover-bg'], 'rgb(var(--color-dark-750))');
    assert.equal(style['--tab-hover-text'], 'rgb(var(--color-dark-200))');
    // The category only shows while the tab is the one you are looking at.
    assert.equal(style['--tab-top-accent'], TAB_CATEGORY_THEMES[type].accent);
  }
});

test('an active tab is canvas plus its own accent, never a coloured block', () => {
  for (const type of ALL_TAB_TYPES) {
    const style = getTabThemeStyle(type, true);
    assert.equal(style['--tab-active-surface'], 'rgb(var(--color-dark-900))');
    assert.equal(style['--tab-active-text'], 'rgb(var(--color-dark-100))');
    assert.equal(style['--tab-border'], TAB_CATEGORY_THEMES[type].accent);
    assert.equal(style['--tab-top-accent'], TAB_CATEGORY_THEMES[type].accent);
  }
});

test('the custom SQL tab colour overrides that tab only', () => {
  const customBg = '#4338ca';
  const customText = '#fef08a';

  const activeSqlStyle = getTabThemeStyle('sql_editor', true, customBg, customText);
  assert.equal(activeSqlStyle['--tab-active-surface'], customBg);
  assert.equal(activeSqlStyle['--tab-active-text'], customText);
  assert.equal(activeSqlStyle['--tab-border'], customBg);

  // Other categories are not the user's to paint, and a custom colour never reaches an inactive tab.
  assert.equal(
    getTabThemeStyle('table_data', true, customBg, customText)['--tab-active-surface'],
    'rgb(var(--color-dark-900))'
  );
  assert.equal(
    getTabThemeStyle('sql_editor', false, customBg, customText)['--tab-top-accent'],
    TAB_CATEGORY_THEMES.sql_editor.accent
  );

  // A saved setting still holding the old default means "no custom colour".
  assert.equal(
    getTabThemeStyle('sql_editor', true, '#1e40af')['--tab-active-surface'],
    'rgb(var(--color-dark-900))'
  );
});

test('AppBottomPanel active result tab applies theme/connection borders (top, left, right) like editor tabs', () => {
  const panelSrc = readFileSync(
    resolve(process.cwd(), 'src/components/layout/AppBottomPanel.vue'),
    'utf-8'
  );

  // Active result tab has active-tab class
  assert.match(
    panelSrc,
    /queryStore\.activeResultTabId === rtab\.id\s*\?\s*'[^']*active-tab[^']*'/,
    'active result tab must receive the active-tab class'
  );

  // Scoped CSS styles active tab top, left, right border accent and seamless bottom overlap
  assert.match(
    panelSrc,
    /\.result-tab-item\.active-tab\s*\{[\s\S]*?border-top-color:\s*var\(--tab-top-accent[\s\S]*?!important/,
    'active result tab must have border-top-color set to theme accent'
  );
  assert.match(
    panelSrc,
    /\.result-tab-item\.active-tab\s*\{[\s\S]*?border-left-color:\s*var\(--tab-top-accent[\s\S]*?!important/,
    'active result tab must have border-left-color set to theme accent'
  );
  assert.match(
    panelSrc,
    /\.result-tab-item\.active-tab\s*\{[\s\S]*?border-right-color:\s*var\(--tab-top-accent[\s\S]*?!important/,
    'active result tab must have border-right-color set to theme accent'
  );
  assert.match(
    panelSrc,
    /\.result-tab-item\.active-tab\s*\{[\s\S]*?border-bottom-color:\s*transparent\s*!important/,
    'active result tab must have transparent bottom border'
  );
  assert.match(
    panelSrc,
    /\.result-tab-item\.active-tab\s*\{[\s\S]*?margin-bottom:\s*-1px/,
    'active result tab must have margin-bottom: -1px to merge with panel'
  );

  // getResultTabStyle sets topAccent and connection color support
  assert.match(
    panelSrc,
    /getResultTabTopAccent/,
    'getResultTabTopAccent helper must calculate theme/connection top accent'
  );
  assert.match(
    panelSrc,
    /getResultTabConnectionColor/,
    'getResultTabConnectionColor helper must support connection color override'
  );
  assert.match(
    panelSrc,
    /borderLeftColor:\s*topAccent/,
    'getResultTabStyle must set borderLeftColor to topAccent'
  );
  assert.match(
    panelSrc,
    /borderRightColor:\s*topAccent/,
    'getResultTabStyle must set borderRightColor to topAccent'
  );
});

test('AppMain active workspace tab applies theme/connection borders on top, left, and right', () => {
  const mainSrc = readFileSync(
    resolve(process.cwd(), 'src/components/layout/AppMain.vue'),
    'utf-8'
  );

  assert.match(
    mainSrc,
    /\.query-tab-item\.active-tab\s*\{[\s\S]*?border-top-color:\s*var\(--tab-top-accent\)\s*!important/,
    'active workspace tab must have border-top-color set to theme accent'
  );
  assert.match(
    mainSrc,
    /\.query-tab-item\.active-tab\s*\{[\s\S]*?border-left-color:\s*var\(--tab-top-accent\)\s*!important/,
    'active workspace tab must have border-left-color set to theme accent'
  );
  assert.match(
    mainSrc,
    /\.query-tab-item\.active-tab\s*\{[\s\S]*?border-right-color:\s*var\(--tab-top-accent\)\s*!important/,
    'active workspace tab must have border-right-color set to theme accent'
  );
});
