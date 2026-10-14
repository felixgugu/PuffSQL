import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

describe('SQL editor toolbar actions', () => {
  test('toolbar renders the five actions in the requested order', () => {
    const source = readSource('src/components/layout/SqlEditorToolbarActions.vue');
    const actionOrder = [
      "action: 'cut'",
      "action: 'copy'",
      "action: 'paste'",
      "action: 'unfoldAll'",
      "action: 'foldAll'",
    ];

    let previousIndex = -1;
    for (const marker of actionOrder) {
      const currentIndex = source.indexOf(marker);
      assert.ok(currentIndex > previousIndex, `${marker} should appear in the requested order`);
      previousIndex = currentIndex;
    }

    assert.match(source, /:disabled="disabled"/, 'buttons should share the disabled prop');
    assert.match(source, /(?:label: '剪下'|label: t\('common\.cut'\))/, 'cut should have a localized label');
    assert.match(source, /(?:label: '複製'|label: t\('common\.copy'\))/, 'copy should have a localized label');
    assert.match(source, /(?:label: '貼上'|label: t\('common\.paste'\))/, 'paste should have a localized label');
    assert.match(source, /(?:label: '展開'|label: t\('common\.expand'\))/, 'unfold should have a localized label');
    assert.match(source, /(?:label: '收合'|label: t\('common\.collapse'\))/, 'fold should have a localized label');
  });

  test('AppHeader places the actions immediately before Format SQL', () => {
    const source = readSource('src/components/layout/AppHeader.vue');
    const actionsIndex = source.indexOf('<SqlEditorToolbarActions');
    const formatIndex = source.indexOf('<!-- Format SQL Button -->');

    assert.ok(actionsIndex !== -1, 'AppHeader should render SqlEditorToolbarActions');
    assert.ok(formatIndex !== -1, 'AppHeader should retain the Format SQL button');
    assert.ok(actionsIndex < formatIndex, 'SQL editor actions should be placed before Format SQL');
    assert.match(
      source,
      /:disabled="workspaceStore\.activeTab\?\.type !== 'sql_editor'"/,
      'the actions should only be enabled for SQL editor tabs'
    );
    assert.match(
      source,
      /\(e: 'sql-editor-action', action: SqlEditorToolbarAction\): void;/,
      'AppHeader should emit a typed SQL editor action'
    );
  });

  test('App forwards the action through AppMain to MonacoEditor', () => {
    const appSource = readSource('src/App.vue');
    const mainSource = readSource('src/components/layout/AppMain.vue');
    const editorSource = readSource('src/components/editor/MonacoEditor.vue');

    assert.match(appSource, /@sql-editor-action="handleSqlEditorAction"/);
    assert.match(appSource, /mainWorkspaceRef\.value\?\.runEditorAction\(action\)/);
    assert.match(mainSource, /function runEditorAction\(action: SqlEditorToolbarAction\)/);
    assert.match(mainSource, /monacoRef\.value\?\.runEditorAction\(action\)/);
    assert.match(mainSource, /defineExpose\(\{[\s\S]*?runEditorAction,/);
    assert.match(editorSource, /function runEditorAction\(action: SqlEditorToolbarAction\)/);
    assert.match(editorSource, /defineExpose\(\{[\s\S]*?runEditorAction,/);
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

  test('clipboard actions (cut, copy, paste) are hidden at minimum window width', () => {
    const source = readSource('src/components/layout/SqlEditorToolbarActions.vue');
    assert.match(
      source,
      /action:\s*'cut'[\s\S]*?class:\s*'[^']*toolbar-action-clipboard[^']*'/,
      'cut action must have the toolbar-action-clipboard class'
    );
    assert.match(
      source,
      /action:\s*'copy'[\s\S]*?class:\s*'[^']*toolbar-action-clipboard[^']*'/,
      'copy action must have the toolbar-action-clipboard class'
    );
    assert.match(
      source,
      /action:\s*'paste'[\s\S]*?class:\s*'[^']*toolbar-action-clipboard[^']*'/,
      'paste action must have the toolbar-action-clipboard class'
    );
    assert.match(
      source,
      /@media\s*\(\s*max-width:\s*1440px\s*\)\s*\{[\s\S]*?\.toolbar-action-clipboard\s*\{[\s\S]*?display:\s*none\s*!important;/,
      'scoped media query must hide toolbar-action-clipboard at minimum window width'
    );
  });
});
