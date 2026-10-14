import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

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
  assert.match(
    source,
    /:class="workspaceStore\.activeTabId === tab\.id \? '' : '!font-normal'"/,
    'the alias tag must be reset to the regular weight outside the active tab'
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
