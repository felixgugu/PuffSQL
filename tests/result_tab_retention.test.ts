import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { Tabulator } from 'tabulator-tables';
import { useQueryStore, resetQueryExecutionSeq } from '../src/stores/queryStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useGridLayoutStore } from '../src/stores/gridLayoutStore';
import { queryService } from '../src/services/queryService';
import zhTW from '../src/i18n/locales/zh-TW';
import en from '../src/i18n/locales/en';
import type { QueryResult } from '../src/types/query';

const data = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => { data.set(key, String(value)); },
  removeItem: (key) => { data.delete(key); },
  clear: () => data.clear(),
  key: () => null,
  length: 0,
};

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

/** Makes queryService.executeQuery return one result set with rows for the named table. */
function stubQueryWithRows(tableName: string, rowCount = 5): void {
  queryService.executeQuery = async (_connId, _db, sql) => {
    const rows = sql.includes(tableName) ? rowCount : 1;
    return {
      resultSets: [
        {
          columns: [{ name: 'Id', dataType: 'int', nullable: false, ordinal: 0 }],
          rows: Array.from({ length: rows }, (_, i) => [i + 1]),
          rowCount: rows,
        },
      ],
      messages: [],
      affectedRows: 0,
      executionTimeMs: 7,
    } as QueryResult;
  };
}

function fakeGridTable(): Tabulator {
  return {
    getColumns: () => [{ getField: () => 'Id', getWidth: () => 120, isVisible: () => true }],
    getSorters: () => [],
  } as unknown as Tabulator;
}

beforeEach(() => {
  data.clear();
  setActivePinia(createPinia());
  resetQueryExecutionSeq();
});

test('result tab accumulation defaults to off, persists, and resets', async () => {
  const settings = useSettingsStore();

  assert.equal(settings.accumulateResultTabs, false, 'multi-tab retention must be opt-in');

  settings.accumulateResultTabs = true;
  await nextTick();
  const autoSaved = JSON.parse(data.get('sqlight_app_settings') ?? '{}');
  assert.equal(autoSaved.accumulateResultTabs, true, 'the flag must auto-persist');

  settings.saveSettings();
  const saved = JSON.parse(data.get('sqlight_app_settings') ?? '{}');
  assert.equal(saved.accumulateResultTabs, true);

  settings.resetToDefaults();
  assert.equal(settings.accumulateResultTabs, false);
});

test('with accumulation off, a new query closes the previous unpinned result tab', async () => {
  const store = useQueryStore();
  const gridLayout = useGridLayoutStore();
  stubQueryWithRows('Customers', 50);

  await store.execute('conn-1', 'master', 'SELECT * FROM Customers;');
  assert.equal(store.resultTabs.length, 1);
  const firstTabId = store.resultTabs[0]!.id;

  // Remember a layout for the tab that is about to be evicted.
  const firstKey = gridLayout.layoutKey(firstTabId, 0);
  gridLayout.capture(firstKey, fakeGridTable());
  assert.equal(gridLayout.has(firstKey), true);

  stubQueryWithRows('Orders', 12);
  await store.execute('conn-1', 'master', 'SELECT * FROM Orders;');

  assert.equal(store.resultTabs.length, 1, 'only the newest result tab survives');
  const newestTabId = store.resultTabs[0]!.id;
  assert.notEqual(newestTabId, firstTabId);
  assert.equal(store.activeResultTabId, newestTabId, 'the newest tab becomes active');
  assert.equal(gridLayout.has(firstKey), false, 'the evicted tab drops its grid layout cache');
});

test('with accumulation off, pinned tabs survive alongside the newest result tab', async () => {
  const store = useQueryStore();
  stubQueryWithRows('Customers', 50);

  await store.execute('conn-1', 'master', 'SELECT * FROM Customers;');
  const pinnedTabId = store.resultTabs[0]!.id;
  store.togglePinTab(pinnedTabId);
  assert.equal(store.resultTabs[0]!.isPinned, true);

  stubQueryWithRows('Orders', 12);
  await store.execute('conn-1', 'master', 'SELECT * FROM Orders;');

  assert.equal(store.resultTabs.length, 2);
  assert.equal(store.resultTabs[0]!.id, pinnedTabId);
  assert.equal(store.resultTabs[0]!.isPinned, true);
  assert.equal(store.resultTabs[1]!.isPinned, false);
  assert.equal(store.activeResultTabId, store.resultTabs[1]!.id);

  // A third query still keeps the pin and replaces the previous unpinned tab.
  const previousUnpinnedId = store.resultTabs[1]!.id;
  stubQueryWithRows('Products', 3);
  await store.execute('conn-1', 'master', 'SELECT * FROM Products;');

  assert.equal(store.resultTabs.length, 2);
  assert.equal(store.resultTabs[0]!.id, pinnedTabId);
  assert.notEqual(store.resultTabs[1]!.id, previousUnpinnedId);
});

test('with accumulation on, tabs pile up to maxResultTabs and evict the oldest unpinned', async () => {
  const store = useQueryStore();
  const settings = useSettingsStore();
  settings.accumulateResultTabs = true;
  settings.maxResultTabs = 2;
  stubQueryWithRows('Customers', 50);

  await store.execute('conn-1', 'master', 'SELECT * FROM Customers;');
  await store.execute('conn-1', 'master', 'SELECT * FROM Orders;');
  assert.equal(store.resultTabs.length, 2);

  await store.execute('conn-1', 'master', 'SELECT * FROM Products;');
  assert.equal(store.resultTabs.length, 2, 'the cap is enforced');
  assert.equal(store.resultTabs[0]!.title, '3.Products', 'the newest tab stays leftmost');
  assert.equal(store.resultTabs[1]!.title, '2.Orders');

  // Pinned tabs are never evicted, even when that keeps the tab count at the cap.
  const pinnedTabId = store.resultTabs[1]!.id;
  store.togglePinTab(pinnedTabId);
  await store.execute('conn-1', 'master', 'SELECT * FROM Customers;');
  assert.equal(store.resultTabs.length, 2);
  assert.equal(store.resultTabs[0]!.id, pinnedTabId, 'the pin survives eviction');
});

test('switching accumulation off prunes to pinned plus the tab being viewed', async () => {
  const store = useQueryStore();
  const settings = useSettingsStore();
  settings.accumulateResultTabs = true;
  stubQueryWithRows('Customers', 50);

  await store.execute('conn-1', 'master', 'SELECT * FROM Customers;');
  await store.execute('conn-1', 'master', 'SELECT * FROM Orders;');
  await store.execute('conn-1', 'master', 'SELECT * FROM Products;');
  assert.equal(store.resultTabs.length, 3);

  // Pin the oldest tab, then look at another one before switching the mode off.
  const pinnedTabId = store.resultTabs[2]!.id;
  store.togglePinTab(pinnedTabId);
  const viewedTabId = store.resultTabs.find((tab) => !tab.isPinned)!.id;
  store.selectResultTab(viewedTabId);

  settings.accumulateResultTabs = false;
  await nextTick();

  assert.equal(store.resultTabs.length, 2, 'only the pin and the viewed tab remain');
  assert.deepEqual(
    store.resultTabs.map((tab) => tab.id).sort(),
    [pinnedTabId, viewedTabId].sort()
  );
  assert.equal(store.activeResultTabId, viewedTabId, 'the viewed tab does not jump');
});

test('pruneResultTabsToActive keeps the pin and the active tab', async () => {
  const store = useQueryStore();
  const settings = useSettingsStore();
  settings.accumulateResultTabs = true;
  stubQueryWithRows('Customers', 50);

  await store.execute('conn-1', 'master', 'SELECT * FROM Customers;');
  await store.execute('conn-1', 'master', 'SELECT * FROM Orders;');
  await store.execute('conn-1', 'master', 'SELECT * FROM Products;');

  const pinnedTabId = store.resultTabs[2]!.id;
  store.togglePinTab(pinnedTabId);
  store.selectResultTab(store.resultTabs[1]!.id);
  const activeId = store.activeResultTabId;

  store.pruneResultTabsToActive();

  assert.equal(store.resultTabs.length, 2);
  assert.ok(store.resultTabs.some((tab) => tab.id === pinnedTabId));
  assert.equal(store.activeResultTabId, activeId);
});

test('the retention toggle sits in the result toolbar and in the settings modal', () => {
  const panel = readSource('src/components/layout/AppBottomPanel.vue');
  assert.match(panel, /icon="pi pi-clone"/, 'the toggle uses the stacked-tabs icon');
  assert.match(
    panel,
    /settingsStore\.accumulateResultTabs = !settingsStore\.accumulateResultTabs/,
    'the header button flips the persisted flag'
  );
  assert.match(panel, /results\.keepResultTabs/, 'on-state label key');
  assert.match(panel, /results\.singleResultTab/, 'off-state label key');

  const modal = readSource('src/components/modals/SettingsModal.vue');
  assert.match(
    modal,
    /SqSwitch v-model="settingsStore\.accumulateResultTabs"/,
    'the settings modal exposes the same switch'
  );
});

test('the retention labels exist in both locales', () => {
  const locales: Array<[string, typeof zhTW]> = [
    ['zh-TW', zhTW],
    ['en', en],
  ];

  for (const [name, locale] of locales) {
    const results = locale.results as unknown as Record<string, string>;
    for (const key of [
      'keepResultTabs',
      'keepResultTabsTooltip',
      'singleResultTab',
      'singleResultTabTooltip',
    ]) {
      const value = results[key];
      assert.ok(
        typeof value === 'string' && value.trim().length > 0,
        `${name}.results.${key} must be set`
      );
    }

    const settingsModal = locale.settingsModal as unknown as Record<string, string>;
    for (const key of ['accumulateResultTabs', 'accumulateResultTabsDesc']) {
      const value = settingsModal[key];
      assert.ok(
        typeof value === 'string' && value.trim().length > 0,
        `${name}.settingsModal.${key} must be set`
      );
    }
  }
});
