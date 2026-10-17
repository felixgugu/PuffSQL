import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkspaceStore } from '../src/stores/workspaceStore';
import { type SqlEditorTab } from '../src/types/workspace';
import { readSource } from './helpers/source';

describe('workspace_tab_rename', () => {
describe('Workspace editor tab header rename behavior', () => {
  test('workspace editor tab header removes double-click inline rename', () => {
    const appMainSource = readSource('src/components/layout/AppMain.vue');

    assert.doesNotMatch(
      appMainSource,
      /@dblclick[^\n]*startRenameTab\(tab\)/,
      'Workspace tab div must not have @dblclick bound to startRenameTab'
    );
  });
});
});

describe('tab_cursor_persistence', () => {
const storage = new Map<string, string>();
before(() => {
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, String(value)); },
    removeItem: (key) => { storage.delete(key); },
    clear: () => storage.clear(),
    key: () => null,
    length: 0,
  };
});

beforeEach(() => {
  storage.clear();
  setActivePinia(createPinia());
});

test('workspaceStore: updateTabCursorPosition updates tab cursor and persists to storage', () => {
  const store = useWorkspaceStore();
  const tabId = store.addSqlTab('SELECT 1;\nSELECT 2;\nSELECT 3;', 'Test.sql');

  store.updateTabCursorPosition(tabId, { lineNumber: 3, column: 7 });

  const tab = store.tabs.find((t) => t.id === tabId) as SqlEditorTab;
  assert.ok(tab);
  assert.deepEqual(tab.cursorPosition, { lineNumber: 3, column: 7 });

  const rawSaved = storage.get('sqlight_workspace_tabs');
  assert.ok(rawSaved);
  const parsed = JSON.parse(rawSaved);
  const savedTab = parsed.find((t: any) => t.id === tabId);
  assert.deepEqual(savedTab.cursorPosition, { lineNumber: 3, column: 7 });
});

test('workspaceStore: saveEditorViewState & getEditorViewState stores and retrieves Monaco view states', () => {
  const store = useWorkspaceStore();
  const tabId1 = store.addSqlTab('SELECT 1;', 'Tab1.sql');
  const tabId2 = store.addSqlTab('SELECT 2;', 'Tab2.sql');

  const mockViewState1 = {
    cursorState: [{ inSelectionMode: false, selectionStart: { lineNumber: 2, column: 5 }, position: { lineNumber: 2, column: 5 } }],
    viewState: { scrollTop: 120, scrollLeft: 0, firstPosition: { lineNumber: 1, column: 1 } },
  };

  store.saveEditorViewState(tabId1, mockViewState1);

  assert.deepEqual(store.getEditorViewState(tabId1), mockViewState1);
  assert.equal(store.getEditorViewState(tabId2), null);
  assert.equal(store.getEditorViewState('non-existent'), null);
});

test('workspaceStore: closeTab and closeOtherTabs clean up cached editor view states', () => {
  const store = useWorkspaceStore();
  const tabId1 = store.addSqlTab('SELECT 1;', 'Tab1.sql');
  const tabId2 = store.addSqlTab('SELECT 2;', 'Tab2.sql');
  const tabId3 = store.addSqlTab('SELECT 3;', 'Tab3.sql');

  store.saveEditorViewState(tabId1, { state: 1 });
  store.saveEditorViewState(tabId2, { state: 2 });
  store.saveEditorViewState(tabId3, { state: 3 });

  store.closeTab(tabId1);
  assert.equal(store.getEditorViewState(tabId1), null);
  assert.deepEqual(store.getEditorViewState(tabId2), { state: 2 });
  assert.deepEqual(store.getEditorViewState(tabId3), { state: 3 });

  store.closeOtherTabs(tabId2);
  assert.equal(store.getEditorViewState(tabId3), null);
  assert.deepEqual(store.getEditorViewState(tabId2), { state: 2 });
});

test('workspaceStore: duplicateSqlTab preserves original tab cursorPosition', () => {
  const store = useWorkspaceStore();
  const originalId = store.addSqlTab('SELECT 100;\nSELECT 200;', 'Original.sql');
  store.updateTabCursorPosition(originalId, { lineNumber: 2, column: 11 });

  const duplicatedId = store.duplicateSqlTab(originalId);
  assert.ok(duplicatedId);

  const dupTab = store.tabs.find((t) => t.id === duplicatedId) as SqlEditorTab;
  assert.ok(dupTab);
  assert.deepEqual(dupTab.cursorPosition, { lineNumber: 2, column: 11 });
});

test('MonacoEditor and AppMain: template and lifecycle wire tab-id and initial-cursor correctly', () => {
  const appMainSrc = readSource('src/components/layout/AppMain.vue');
  const monacoSrc = readSource('src/components/editor/MonacoEditor.vue');

  assert.match(
    appMainSrc,
    /:tab-id="workspaceStore\.activeTab\.id"/,
    'AppMain must pass :tab-id to MonacoEditor'
  );
  assert.match(
    appMainSrc,
    /:initial-cursor="\(workspaceStore\.activeTab as SqlEditorTab\)\.cursorPosition"/,
    'AppMain must pass :initial-cursor to MonacoEditor'
  );

  assert.match(
    appMainSrc,
    /function focusEditor\(line\?:\s*number,\s*col\?:\s*number\)/,
    'AppMain focusEditor must have optional line and col parameters'
  );

  assert.match(
    monacoSrc,
    /tabId\?:\s*string;/,
    'MonacoEditor props must accept optional tabId'
  );
  assert.match(
    monacoSrc,
    /initialCursor\?:\s*\{\s*lineNumber:\s*number;\s*column:\s*number\s*\};/,
    'MonacoEditor props must accept optional initialCursor'
  );

  assert.match(
    monacoSrc,
    /editorInstance\.restoreViewState\(savedViewState\)/,
    'MonacoEditor must restore savedViewState if present'
  );
  assert.match(
    monacoSrc,
    /editorInstance\.setPosition\(pos\)/,
    'MonacoEditor must restore initialCursor position if present'
  );

  assert.match(
    monacoSrc,
    /editorInstance\.onDidChangeCursorPosition/,
    'MonacoEditor must track cursor movements via onDidChangeCursorPosition'
  );
  assert.match(
    monacoSrc,
    /workspaceStore\.updateTabCursorPosition\(props\.tabId/,
    'MonacoEditor must update workspaceStore tab cursor position'
  );

  assert.match(
    monacoSrc,
    /workspaceStore\.saveEditorViewState\(props\.tabId,\s*viewState\)/,
    'MonacoEditor must save editor viewState before unmounting'
  );
});
});
