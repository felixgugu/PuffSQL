import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readSource } from './helpers/source';

describe('result_panel_refactor', () => {
describe('Query Result Panel Consolidation and Status Bar Enhancement', () => {
  test('AppBottomPanel removes the outer header tab row and uses a single consolidated tabs bar', () => {
    const bottomPanelSource = readSource('src/components/layout/AppBottomPanel.vue');

    assert.doesNotMatch(
      bottomPanelSource,
      /<div class="h-8 bg-dark-850 border-b border-dark-700 flex items-center justify-between px-2 text-xs flex-shrink-0">/,
      'Old outer h-8 tabs row must be removed'
    );

    assert.match(
      bottomPanelSource,
      /class="h-9 bg-dark-850 border-b border-dark-750 flex items-center justify-between px-1\.5 select-none flex-shrink-0 overflow-hidden"/,
      'The single consolidated header row must be overflow-hidden with no horizontal scroll'
    );

    assert.match(
      bottomPanelSource,
      /ref="resultsTabsBarRef"[\s\S]*?overflow-x-auto/,
      'Left section must have horizontal scrolling for SQL result tabs'
    );

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

    assert.doesNotMatch(
      itemSource,
      /\$t\('results\.selectionTip'\)/,
      'results.selectionTip must be removed from status bar'
    );

    assert.match(
      itemSource,
      /Duration:[\s\S]*?\{\{\s*displayDuration\s*\}\}ms/,
      'Duration must be displayed in the status bar'
    );

    assert.match(
      itemSource,
      /durationMs\?: number;/,
      'ResultGridItem must accept optional durationMs prop'
    );

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

    assert.match(
      bottomPanelSource,
      /isToolbarHidden \? \$t\('results\.showToolbars'\) : \$t\('results\.hideToolbars'\)/,
      'AppBottomPanel must contain show/hide toolbars toggle button'
    );

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
});

describe('tab_label_weight', () => {
/**
 * Tab labels are only emphasised for the tab in use. Inactive editor tabs, bottom-panel tabs
 * and query result tabs must stay at the regular weight.
 */
test('inactive editor tabs carry no bold weight class', () => {
  const source = readSource('src/components/layout/AppMain.vue');
  assert.match(
    source,
    /workspaceStore\.activeTabId === tab\.id \? 'font-medium active-tab' : 'inactive-tab'/,
    'only the active editor tab may take font-medium; the inactive branch must stay unweighted'
  );
});

test('editor tab titles are only bolded while their tab is active', () => {
  const source = readSource('src/components/layout/AppMain.vue');
  assert.match(
    source,
    /if \(workspaceStore\.activeTabId === tab\.id\) \{\s*style\.fontWeight = '600';\s*\}/,
    'getTabTitleStyle must gate the title weight on the active tab'
  );
  assert.doesNotMatch(
    source,
    /return \{\s*color,\s*fontWeight: '600',\s*\}/,
    'getTabTitleStyle must not bold every tab that has a connection colour'
  );
});

test('the connection alias tag drops to the regular weight on inactive tabs', () => {
  const source = readSource('src/components/layout/AppMain.vue');
  // The alias chip is our own SqChip now: the chip fixes the label weight itself, so the active
  // tab can no longer emphasise it and there is no PrimeVue tag weight left to reset.
  const alias = source.match(/<SqChip[\s\S]{0,320}?getTabConnectionAlias\(tab\)[\s\S]{0,220}?\/>/);
  assert.ok(alias, 'the tab alias chip must stay easy to locate');
  assert.doesNotMatch(
    alias![0]!,
    /font-(medium|semibold|bold)/,
    'the tab alias chip must stay on the regular weight in every tab state'
  );
});

test('bottom panel view tabs are only emphasised while selected', () => {
  const source = readSource('src/components/layout/AppBottomPanel.vue');

  // The switcher is a segmented control: the state lives in one class hook, and the weight lives
  // in the stylesheet rather than in a per-tab utility string.
  assert.match(
    source,
    /class="sq-view-tab"\s*\n\s*:class="\{ 'is-active': workspaceStore\.bottomPanelTab === tab\.id \}"/,
    'the bottom panel view tab must switch a single is-active hook'
  );
  assert.match(
    source,
    /\.sq-view-tab\s*\{[\s\S]*?font-weight:\s*400/,
    'the default view tab weight must stay regular'
  );
  assert.match(
    source,
    /\.sq-view-tab\.is-active\s*\{[\s\S]*?font-weight:\s*500/,
    'only the selected view tab may take extra weight'
  );
});

test('inactive query result tabs carry no bold weight class', () => {
  const source = readSource('src/components/layout/AppBottomPanel.vue');
  const conditional = source.match(
    /queryStore\.activeResultTabId === rtab\.id\s*\?\s*'([^']*)'\s*:\s*'([^']*)'/
  );
  assert.ok(conditional, 'the active/inactive result tab classes must be easy to locate');
  assert.match(conditional[1]!, /font-medium/, 'the active result tab keeps its emphasis');
  assert.doesNotMatch(
    conditional[2]!,
    /font-(medium|semibold|bold)/,
    'the inactive result tab must not be bold'
  );
});

test('the multi result set grid badge drops the theme bold weight', () => {
  const source = readSource('src/components/results/ResultGridItem.vue');
  assert.match(
    source,
    /v-if="totalSets > 1"[\s\S]{0,200}?Result #\$\{setIndex \+ 1\}/,
    'the badge must stay gated to multi result set grids'
  );

  // The badge is our own SqChip now: the chip fixes the label size and weight itself, so there is
  // no PrimeVue `.p-tag` bold weight left to reset at the call site.
  const badge = source.match(
    /<SqChip[\s\S]{0,300}?v-if="totalSets > 1"[\s\S]{0,300}?<\/SqChip>/
  );
  assert.ok(badge, 'the badge markup must stay easy to locate');
  assert.match(badge![0]!, /tone="neutral"/, 'the badge must use the neutral chip tone');
  assert.doesNotMatch(badge![0]!, /font-(medium|semibold|bold)/);
  assert.doesNotMatch(source, /primevue\/tag/, 'the badge must not go back to PrimeVue Tag');
});
});

describe('tab_middle_click_close', () => {
const EDITOR_TABS = 'src/components/layout/AppMain.vue';
const RESULT_TABS = 'src/components/layout/AppBottomPanel.vue';

/**
 * Middle-click closes a tab, like every browser. The strips keep their own close paths (the editor
 * tabs may open a fresh query when the last one goes, the result tabs refuse to close the last
 * one), so the middle button has to call exactly the same store action as the tab's × button
 * rather than inventing a second close route.
 */
describe('middle-click closes a tab', () => {
  test('both tab strips route the middle button to their own close action', () => {
    const cases = [
      { path: EDITOR_TABS, close: 'workspaceStore.closeTab(tab.id)' },
      { path: RESULT_TABS, close: 'queryStore.deleteResultTab(rtab.id)' },
    ];

    for (const { path, close } of cases) {
      const source = readSource(path);

      assert.ok(
        source.includes(`@auxclick.middle.prevent="${close}"`),
        `${path} must close its tab on a middle click`
      );
      assert.ok(
        source.includes(`@click.stop="${close}"`),
        `${path} must use the same close action as its × button`
      );
      assert.match(
        source,
        /@mousedown\.middle\.prevent/,
        `${path} must swallow the middle press so Windows does not start auto-scroll`
      );
    }
  });

  test('a middle press never starts a tab drag', () => {
    for (const path of [EDITOR_TABS, RESULT_TABS]) {
      const handler = /function onTabPointerDown\(e: PointerEvent, index: number\) \{([\s\S]{0,220})/.exec(
        readSource(path)
      )?.[1];

      assert.ok(handler, `${path} must keep onTabPointerDown`);
      assert.match(
        handler!,
        /if \(e\.button !== 0\) return;/,
        `${path} must ignore every button but the left one`
      );
    }
  });
});
});
