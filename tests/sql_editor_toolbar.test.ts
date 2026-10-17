import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { readSource, repoRoot } from './helpers/source';

describe('sql_editor_toolbar_actions', () => {
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
});

describe('sql_editor_toolbar_layout', () => {

/**
 * The SQL editor owns a toolbar row of its own, directly above Monaco. The window title bar keeps
 * only the global controls, so a squeezed window no longer hides query execution behind an
 * overflow clip and the editing controls sit next to the code they act on.
 */
describe('SQL editor toolbar placement', () => {
  test('the row is a 36px chrome strip with a hairline bottom border', () => {
    const source = readSource('src/components/layout/SqlEditorToolbar.vue');

    assert.match(
      source,
      /class="sql-editor-toolbar h-9 bg-dark-850 border-b border-dark-700[^"]*flex-shrink-0[^"]*"/,
      'the row is one 36px chrome line that never shrinks'
    );
    assert.doesNotMatch(source, /shadow-/, 'SPEC §6 keeps toolbars flat');
    assert.match(source, /<div class="flex-1" \/>/, 'a flexible gap pushes the options to the right');
  });

  test('the right group holds the execution analysis options in order', () => {
    const source = readSource('src/components/layout/SqlEditorToolbar.vue');
    const order = [
      '<div class="flex-1" />',
      'queryStore.toggleStatsEnabled()',
      'queryStore.toggleShowplanEnabled()',
      'queryStore.toggleActualPlanEnabled()',
      'const limitOptions',
    ];

    let previousIndex = -1;
    for (const marker of order) {
      const currentIndex = source.indexOf(marker);
      assert.ok(currentIndex > previousIndex, `${marker} should appear in the requested order`);
      previousIndex = currentIndex;
    }
    assert.match(source, /queryStore\.maxRows = val === 'none' \? null : Number\(val\)/);
  });

  test('the row limit control is labelled by its tooltip, not by visible text', () => {
    const source = readSource('src/components/layout/SqlEditorToolbar.vue');

    assert.doesNotMatch(source, /Limit:/, 'the "Limit:" wording is gone from the row');
    assert.match(
      source,
      /v-tooltip\.bottom="t\('header\.maxRowsTooltip'\)"/,
      'hovering the limit select explains what it does'
    );
    assert.match(
      source,
      /:aria-label="t\('header\.maxRowsTooltip'\)"/,
      'the unlabelled select still announces itself to assistive tech'
    );
  });

  test('the limit select is the same height as the strips beside it', () => {
    const source = readSource('src/components/layout/SqlEditorToolbar.vue');

    // md strips render 28px tall (28px segments inside a 1px ring), so the select is md too.
    assert.match(
      source,
      /option-label="label"\s*size="md"/,
      'a md select matches the md strips; a sm one (24px) sat 4px shorter'
    );
  });

  test('the run controls keep the swap behaviour and a separate Run All', () => {
    const source = readSource('src/components/layout/SqlEditorToolbar.vue');
    const runIndex = source.indexOf("emit('run-query', 'current')");
    const cancelIndex = source.indexOf("emit('cancel-query')");
    const runAllIndex = source.indexOf("emit('run-query', 'all')");

    assert.ok(runIndex !== -1 && cancelIndex !== -1 && runAllIndex !== -1, 'all three controls emit');
    assert.match(source, /v-if="!queryStore\.isExecuting"/, 'one slot swaps between Run and Stop');
    assert.match(source, /:disabled="queryStore\.isExecuting"/, 'Run All is disabled while executing');
  });

  test('the editing controls are three segmented strips, separated by spacing', () => {
    const source = readSource('src/components/layout/SqlEditorToolbar.vue');

    assert.equal(
      source.match(/<SqButtonGroup/g)?.length,
      3,
      'clipboard, folding and execution-analysis strips'
    );
    for (const label of ['aria-label="剪貼"', 'aria-label="檢視與格式化"', 'aria-label="執行分析選項"']) {
      assert.ok(source.includes(label), `${label} should label a strip`);
    }

    const clipboardIndex = source.indexOf('clipboardActions');
    const foldingIndex = source.indexOf('foldingActions');
    const analysisIndex = source.indexOf('queryStore.toggleStatsEnabled()');
    assert.ok(
      clipboardIndex > -1 && foldingIndex > clipboardIndex && analysisIndex > foldingIndex,
      'the strips run clipboard → folding → analysis'
    );
    assert.match(
      source,
      /v-for="item in foldingActions"[\s\S]*?emit\('format-sql'\)[\s\S]{0,600}?<\/SqButtonGroup>/,
      'Format SQL lives inside the folding strip'
    );

    assert.equal(
      source.match(/w-px h-4 bg-dark-700/g)?.length,
      1,
      'only one hairline survives (after Run All); the strips separate by spacing'
    );
    assert.match(source, /class="sql-editor-toolbar[^"]*gap-1[^"]*"/, 'the row spaces its children with gap');
  });

  test('AppMain renders the row only for SQL editor tabs, above the editor', () => {
    const mainSource = readSource('src/components/layout/AppMain.vue');
    const branchIndex = mainSource.indexOf("v-if=\"workspaceStore.activeTab?.type === 'sql_editor'\"");
    const toolbarIndex = mainSource.indexOf('<SqlEditorToolbar');
    const monacoIndex = mainSource.indexOf('<MonacoEditor');

    assert.ok(branchIndex !== -1, 'AppMain keeps the SQL editor branch');
    assert.ok(toolbarIndex !== -1, 'AppMain renders the SQL editor toolbar');
    assert.ok(monacoIndex !== -1, 'AppMain still renders Monaco');
    assert.ok(toolbarIndex > branchIndex, 'the row lives inside the SQL editor branch');
    assert.ok(toolbarIndex < monacoIndex, 'the row sits directly above the editor');
    assert.equal(
      mainSource.match(/<SqlEditorToolbar/g)?.length,
      1,
      'exactly one toolbar row exists, so other tab types hide it by construction'
    );
  });

  test('the window title bar no longer hosts the editor and execution controls', () => {
    const header = readSource('src/components/layout/AppHeader.vue');

    for (const marker of [
      'SqlEditorToolbar',
      "emit('run-query'",
      "emit('cancel-query'",
      "emit('format-sql'",
      'queryStore',
      'limitOptions',
      'toggleStatsEnabled',
      'toggleShowplanEnabled',
      'toggleActualPlanEnabled',
      'SquareMinus',
      'SkipForward',
      'editor.newTab',
    ]) {
      assert.ok(!header.includes(marker), `AppHeader should no longer reference ${marker}`);
    }

    // The global controls stay where they were, and so does the drag-region contract.
    for (const marker of [
      'data-tauri-drag-region="deep"',
      'header.quickFinderTooltip',
      'header.toggleSidebar',
      '<WindowControls v-if="showWindowControls" />',
    ]) {
      assert.ok(header.includes(marker), `AppHeader should keep ${marker}`);
    }
  });

  test('the retired toolbar-actions component is gone', () => {
    assert.equal(
      existsSync(resolve(repoRoot, 'src/components/layout/SqlEditorToolbarActions.vue')),
      false,
      'the clipboard cluster was merged into SqlEditorToolbar'
    );
  });

  test('the new-tab action lives only on the tab bar, not in the title bar', () => {
    const main = readSource('src/components/layout/AppMain.vue');

    assert.match(main, /:aria-label="\$t\('editor\.newTab'\)"/, 'the tab bar keeps its new-tab button');
    assert.match(main, /@click="handleAddNewTab"/, 'and that button still adds a tab');
    const buttonIndex = main.indexOf("editor.newTab");
    assert.ok(
      buttonIndex > main.indexOf('workspace-tab-bar') && buttonIndex < main.indexOf('<MonacoEditor'),
      'the button sits inside the tab bar, above the editor'
    );
  });
});
});
