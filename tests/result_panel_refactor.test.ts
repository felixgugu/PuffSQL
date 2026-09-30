import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

describe('Query Result Panel Consolidation and Status Bar Enhancement', () => {
  test('AppBottomPanel removes the outer header tab row and uses a single consolidated tabs bar', () => {
    const bottomPanelSource = readSource('src/components/layout/AppBottomPanel.vue');

    // 1. The old outer h-8 tabs row with Results/Messages/History/Stats button array is removed
    assert.doesNotMatch(
      bottomPanelSource,
      /<div class="h-8 bg-dark-850 border-b border-dark-700 flex items-center justify-between px-2 text-xs flex-shrink-0">/,
      'Old outer h-8 tabs row must be removed'
    );

    // 2. The consolidated header is h-9, flex items-center justify-between, and has overflow-hidden (no horizontal scrollbar on the full row)
    assert.match(
      bottomPanelSource,
      /class="h-9 bg-dark-850 border-b border-dark-750 flex items-center justify-between px-1\.5 select-none flex-shrink-0 overflow-hidden"/,
      'The single consolidated header row must be overflow-hidden with no horizontal scroll'
    );

    // 3. Left section contains resultsTabsBarRef with internal horizontal scrolling
    assert.match(
      bottomPanelSource,
      /ref="resultsTabsBarRef"[\s\S]*?overflow-x-auto/,
      'Left section must have horizontal scrolling for SQL result tabs'
    );

    // 4. The right side is one segmented control, so the four views of the panel are visually
    //    distinct from the query result chips on the left.
    assert.match(
      bottomPanelSource,
      /class="sq-view-switch"[\s\S]{0,80}?role="tablist"/,
      'The panel views must be grouped in a single segmented control'
    );
    assert.match(
      bottomPanelSource,
      /role="tab"[\s\S]{0,400}?:aria-selected="workspaceStore\.bottomPanelTab === tab\.id"/,
      'Each panel view must expose its selected state to assistive technology'
    );
    // Roving focus: only the selected view is in the tab order, and the arrow keys move between
    // views, so the switcher behaves like the tab strip it claims to be.
    assert.match(
      bottomPanelSource,
      /:tabindex="workspaceStore\.bottomPanelTab === tab\.id \? 0 : -1"/,
      'Only the selected panel view may be tabbable'
    );
    assert.match(bottomPanelSource, /@keydown="onPanelTabKeydown\(\$event\)"/);
    assert.match(
      bottomPanelSource,
      /if \(event\.key === 'ArrowRight'\) nextIndex = \(currentIndex \+ 1\) % count;/,
      'Arrow keys must move between panel views'
    );
    assert.equal(
      (bottomPanelSource.match(/role="tabpanel"/g) ?? []).length,
      4,
      'Every panel view must be exposed as the tabpanel of its tab'
    );

    // 5. Every view is listed at all times — including results — so the active view is always
    //    indicated, even before the first query has run.
    assert.match(
      bottomPanelSource,
      /id:\s*'results'[\s\S]*?id:\s*'messages'/,
      'The view switcher must list results before messages'
    );
    assert.match(
      bottomPanelSource,
      /id:\s*'messages'/,
      'Right panelTabs must contain messages'
    );
    assert.match(
      bottomPanelSource,
      /id:\s*'history'/,
      'Right panelTabs must contain history'
    );
    assert.match(
      bottomPanelSource,
      /id:\s*'stats'/,
      'Right panelTabs must contain stats'
    );
    // Counts are rendered as plain text so the Aura badge theme cannot leak in.
    assert.doesNotMatch(bottomPanelSource, /<Badge/, 'Panel view counts must not use PrimeVue Badge');
  });

  test('ResultGridItem moves duration to status bar and removes selection tip', () => {
    const itemSource = readSource('src/components/results/ResultGridItem.vue');

    // 1. selectionTip is removed
    assert.doesNotMatch(
      itemSource,
      /\$t\('results\.selectionTip'\)/,
      'results.selectionTip must be removed from status bar'
    );

    // 2. Duration is placed in the status bar alongside total rows and columns
    assert.match(
      itemSource,
      /Duration:[\s\S]*?\{\{\s*displayDuration\s*\}\}ms/,
      'Duration must be displayed in the status bar'
    );

    // 3. ResultGridItem accepts durationMs prop
    assert.match(
      itemSource,
      /durationMs\?: number;/,
      'ResultGridItem must accept optional durationMs prop'
    );

    // 4. Duplicate row count indicator in toolbar is removed
    assert.doesNotMatch(
      itemSource,
      /resultSet\.rows\.length\.toLocaleString\(\)\s*\}\}<\/strong>\s*\{\{\s*\$t\('results\.rowCount'/,
      'Toolbar must not contain duplicate row count indicator'
    );
  });

  test('ResultGrid passes durationMs to ResultGridItem instances', () => {
    const gridSource = readSource('src/components/results/ResultGrid.vue');

    assert.match(
      gridSource,
      /durationMs\?: number;/,
      'ResultGrid must accept durationMs prop'
    );

    const matches = gridSource.match(/:duration-ms="durationMs"/g);
    assert.ok(matches && matches.length >= 3, 'ResultGrid must pass duration-ms to all ResultGridItem instances');
  });

  test('AppBottomPanel provides compact text action: 顯示工具列, and ResultGrid supports double-click equal heights on splitters', () => {
    const bottomPanelSource = readSource('src/components/layout/AppBottomPanel.vue');

    // 1. Show/hide toolbar action is present in header right area
    assert.match(
      bottomPanelSource,
      /isToolbarHidden \? \$t\('results\.showToolbars'\) : \$t\('results\.hideToolbars'\)/,
      'AppBottomPanel must contain show/hide toolbars toggle button'
    );

    // 2. Middle multi-results header and buttons (equalHeights, ssmsStacked/tabbed) are removed
    assert.doesNotMatch(
      bottomPanelSource,
      /\$t\('results\.equalHeights'\)/,
      'equalHeights button must be removed from header toolbar'
    );
    assert.doesNotMatch(
      bottomPanelSource,
      /\$t\('results\.ssmsStacked'\)/,
      'ssmsStacked button must be removed from header toolbar'
    );

    // 3. ResultGrid has no middle sub-toolbar and has pure SSMS stacked view with double-click equal heights
    const gridSource = readSource('src/components/results/ResultGrid.vue');
    assert.doesNotMatch(
      gridSource,
      /results\.resultSetsCount/,
      'ResultGrid must not have the middle result sets count toolbar'
    );
    assert.match(
      gridSource,
      /@dblclick="resetEqualHeights"/,
      'ResizableSplitter in ResultGrid must support double-click to reset equal heights'
    );
  });
});
