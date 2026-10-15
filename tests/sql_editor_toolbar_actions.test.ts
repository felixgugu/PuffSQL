import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

describe('SQL editor toolbar actions', () => {
  test('toolbar renders the clipboard and folding actions in the requested order', () => {
    const source = readSource('src/components/layout/SqlEditorToolbar.vue');
    const actionOrder = [
      "action: 'cut'",
      "action: 'copy'",
      "action: 'paste'",
      "action: 'foldAll'",
      "action: 'unfoldAll'",
    ];

    let previousIndex = -1;
    for (const marker of actionOrder) {
      const currentIndex = source.indexOf(marker);
      assert.ok(currentIndex > previousIndex, `${marker} should appear in the requested order`);
      previousIndex = currentIndex;
    }

    assert.match(source, /:aria-label="item\.label"/, 'buttons carry their localized label');
    assert.match(source, /(?:label: '剪下'|label: t\('common\.cut'\))/, 'cut should have a localized label');
    assert.match(source, /(?:label: '複製'|label: t\('common\.copy'\))/, 'copy should have a localized label');
    assert.match(source, /(?:label: '貼上'|label: t\('common\.paste'\))/, 'paste should have a localized label');
    assert.match(source, /(?:label: '展開'|label: t\('common\.expand'\))/, 'unfold should have a localized label');
    assert.match(source, /(?:label: '收合'|label: t\('common\.collapse'\))/, 'fold should have a localized label');
  });

  test('AppMain wires the toolbar straight to its own editor methods', () => {
    const mainSource = readSource('src/components/layout/AppMain.vue');

    for (const binding of [
      '@run-query="runQuery"',
      '@cancel-query="queryStore.cancelQuery"',
      '@format-sql="formatCode"',
      '@editor-action="runEditorAction"',
    ]) {
      assert.ok(mainSource.includes(binding), `${binding} should be bound on SqlEditorToolbar`);
    }

    assert.match(mainSource, /function runEditorAction\(action: SqlEditorToolbarAction\)/);
    assert.match(mainSource, /monacoRef\.value\?\.runEditorAction\(action\)/);
    assert.match(mainSource, /defineExpose\(\{[\s\S]*?runEditorAction,/);

    // The action no longer travels through App.vue: the toolbar emits it and AppMain runs it.
    const appSource = readSource('src/App.vue');
    assert.doesNotMatch(appSource, /sql-editor-action/, 'App.vue should not relay editor actions');
    assert.doesNotMatch(appSource, /runEditorAction/, 'App.vue should not relay editor actions');
    assert.match(appSource, /mainWorkspaceRef\.value\?\.runQuery\(mode\)/, 'shortcuts still run through AppMain');
  });

  test('Monaco maps each action to the correct command and focuses before triggering', () => {
    const source = readSource('src/components/editor/MonacoEditor.vue');
    const commandMap = source.slice(
      source.indexOf('const SQL_EDITOR_ACTION_COMMANDS'),
      source.indexOf('function updateHighlightStyle')
    );

    assert.match(commandMap, /cut: 'editor\.action\.clipboardCutAction'/);
    assert.match(commandMap, /copy: 'editor\.action\.clipboardCopyAction'/);
    assert.match(commandMap, /paste: 'editor\.action\.clipboardPasteAction'/);
    assert.match(commandMap, /unfoldAll: 'editor\.unfoldAll'/);
    assert.match(commandMap, /foldAll: 'editor\.foldAll'/);

    const methodStart = source.indexOf('function runEditorAction');
    const methodEnd = source.indexOf('onMounted(', methodStart);
    const method = source.slice(methodStart, methodEnd);
    const focusIndex = method.indexOf('editorInstance.focus()');
    const triggerIndex = method.indexOf("editorInstance.trigger('sqlight-toolbar'");

    assert.ok(focusIndex !== -1, 'the editor should regain focus before running an action');
    assert.ok(triggerIndex !== -1, 'the mapped Monaco command should be triggered');
    assert.ok(focusIndex < triggerIndex, 'focus must be restored before triggering the command');
  });

  test('clipboard actions are always visible now that they own a dedicated row', () => {
    const source = readSource('src/components/layout/SqlEditorToolbar.vue');

    assert.doesNotMatch(source, /@media/, 'the width-based hide rule is gone');
    assert.doesNotMatch(source, /toolbar-action-clipboard/, 'no action keeps a hiding class');
    assert.doesNotMatch(source, /min-\[1440px\]/, 'no action is limited to wide windows');
    assert.doesNotMatch(source, /<style/, 'the row needs no scoped overrides');
  });
});
