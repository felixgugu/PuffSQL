import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isMacUserAgent, modifierLabel, shortcutLabel } from '../src/utils/shortcutKeys';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

describe('Shortcut key labels', () => {
  test('the command modifier follows the platform', () => {
    assert.equal(isMacUserAgent(MAC_UA), true);
    assert.equal(isMacUserAgent(WINDOWS_UA), false);
    assert.equal(isMacUserAgent(undefined), false, 'an unknown platform must fall back to Ctrl');
    assert.equal(modifierLabel(MAC_UA), '⌘');
    assert.equal(modifierLabel(WINDOWS_UA), 'Ctrl');
  });

  test('shortcut labels join the modifier with the chord', () => {
    assert.equal(shortcutLabel('Enter', WINDOWS_UA), 'Ctrl + Enter');
    assert.equal(shortcutLabel('Shift + Enter', MAC_UA), '⌘ + Shift + Enter');
  });
});

describe('Results empty state', () => {
  test('one shared component covers both "nothing run yet" and "zero rows matched"', () => {
    const source = readSource('src/components/results/ResultsEmptyState.vue');

    assert.match(
      source,
      /variant: 'idle' \| 'no-rows'/,
      'the component must model both empty situations'
    );
    assert.match(source, /results\.emptyTitle/, 'the idle state must use the onboarding title');
    assert.match(
      source,
      /results\.emptyNoRowsDesc', \{ columns: props\.columnCount \?\? 0 \}/,
      'the zero-row state must report how many columns the statement returned'
    );
    assert.match(
      source,
      /v-if="variant === 'idle'"[\s\S]*?shortcutLabel/,
      'shortcut hints belong to the onboarding state only'
    );
  });

  test('the empty state only advertises shortcuts the app actually wires', () => {
    const source = readSource('src/components/results/ResultsEmptyState.vue');
    const chords = Array.from(source.matchAll(/shortcutLabel\('([^']+)'/g)).map((m) => m[1]);

    assert.deepEqual(
      chords,
      ['Enter', 'Shift + Enter', 'P', 'I'],
      'hints must stay in sync with the global key handler'
    );

    const app = readSource('src/App.vue');
    assert.match(app, /e\.shiftKey && e\.key === 'Enter'/, 'Ctrl + Shift + Enter runs everything');
    assert.match(app, /e\.key === 'Enter'/, 'Ctrl + Enter runs the current statement');
    assert.match(app, /e\.key === 'p' \|\| e\.key === 'P'/, 'Ctrl + P opens the object finder');
    assert.match(app, /e\.key === 'i' \|\| e\.key === 'I'/, 'Ctrl + I opens the AI assistant');

    // No platform-blind hint text may be hardcoded in the component.
    assert.doesNotMatch(source, /'Ctrl \+/, 'hints must go through shortcutLabel');
  });

  test('both grid surfaces render the shared empty state instead of a bare label', () => {
    const grid = readSource('src/components/results/ResultGrid.vue');
    assert.match(grid, /<ResultsEmptyState[\s\S]{0,120}?variant="idle"/);
    assert.match(grid, /import ResultsEmptyState from '@\/components\/results\/ResultsEmptyState\.vue'/);
    assert.doesNotMatch(grid, /No rows returned/, 'the standalone placeholder must be gone');

    const item = readSource('src/components/results/ResultGridItem.vue');
    assert.match(
      item,
      /<ResultsEmptyState[\s\S]{0,200}?:variant="resultSetColumnCount > 0 \? 'no-rows' : 'idle'"/,
      'a tab with columns but no rows must read as a finished query, not an untouched one'
    );
    assert.match(
      item,
      /const resultSetColumnCount = computed\(\(\) => props\.resultSet\?\.columns\?\.length \?\? 0\)/,
      'the zero-row distinction must come from the result metadata'
    );
    assert.doesNotMatch(item, /No rows returned/, 'the standalone placeholder must be gone');
  });
});

describe('Result grid data semantics', () => {
  test('NULL renders as a labelled token rather than italic text', () => {
    const source = readSource('src/utils/tabulatorColumns.ts');
    assert.match(
      source,
      /if \(value === null \|\| value === undefined\) \{\s*return buildBadge\('NULL', 'sqlight-null-badge'\);/,
      'NULL and undefined must both render the badge'
    );
    // The value-dependent class is what keeps light/dark contrast rules attached to the cell.
    assert.match(
      source,
      /classList\.toggle\('sqlight-cell-null', value === null \|\| value === undefined\)/,
      'the cell must keep its nullable marker class'
    );
  });

  test('the NULL token is styled from the grid contrast token in both colour modes', () => {
    const css = readSource('src/styles/tabulatorTheme.css');
    const block = css.match(/\.sqlight-null-badge \{[\s\S]*?\}/);
    assert.ok(block, 'the NULL token must have a dedicated style block');
    assert.match(block![0], /color: var\(--sq-grid-muted\)/, 'it must keep the verified muted tone');
    assert.match(
      block![0],
      /background-color: rgb\(var\(--color-dark-100\) \/ 0\.0\d\)/,
      'the tint must be derived from the active palette at low alpha'
    );
  });

  test('the commit button label is translated', () => {
    const source = readSource('src/components/results/ResultGridItem.vue');
    assert.match(
      source,
      /:label="modifiedCount > 0 \? \$t\('results\.commitWithCount', \{ count: modifiedCount \}\) : \$t\('common\.commit'\)"/,
      'the commit label must not hardcode Chinese text'
    );
    assert.doesNotMatch(source, /`提交 /, 'no hardcoded commit label may remain');
  });
});
