import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

const DIALOGS: Array<[string, number]> = [
  ['src/components/common/ConfirmModal.vue', 1],
  ['src/components/modals/ConnectionModal.vue', 1],
  ['src/components/modals/DangerousQueryModal.vue', 1],
  ['src/components/modals/ExportSchemaModal.vue', 1],
  ['src/components/modals/QuickObjectFinderModal.vue', 1],
  ['src/components/modals/SettingsModal.vue', 1],
  ['src/components/modals/SqlTemplateModal.vue', 2],
  ['src/components/layout/SqlFolderExplorer.vue', 2],
  ['src/components/modals/settings/AiSettingsTab.vue', 1],
  ['src/components/results/ResultGridItem.vue', 1],
];

describe('Every dialog shares one frame and one window behaviour', () => {
  test('each dialog wires the shared window composable for every dialog it renders', () => {
    for (const [file, count] of DIALOGS) {
      const source = readSource(file);

      assert.match(
        source,
        /import \{ useDialogWindow \} from '@\/composables\/useDialogWindow'/,
        `${file} must import useDialogWindow`
      );
      assert.equal(
        (source.match(/useDialogWindow\(\)/g) ?? []).length,
        count,
        `${file} must create one dialog window instance per dialog it renders`
      );
      assert.equal(
        (source.match(/@show="[a-zA-Z]+\.onShow"/g) ?? []).length,
        count,
        `${file} must set up its window behaviour on show`
      );
      assert.equal(
        (source.match(/@hide="[a-zA-Z]+\.onHide"/g) ?? []).length,
        count,
        `${file} must tear its window behaviour down on hide`
      );
    }
  });

  test('no dialog paints a border, shadow or ring of its own', () => {
    for (const [file] of DIALOGS) {
      const source = readSource(file);
      const dialogClasses = source.match(/<Dialog[\s\S]*?>/g) ?? [];

      for (const tag of dialogClasses) {
        // Only the frame counts. `!border-b` / `!border-dark-750` on a header or footer divider
        // are legitimate internal separators, so the bare utility is matched precisely.
        assert.doesNotMatch(
          tag,
          /shadow-2xl|ring-1 ring-black|!border(?![-\w])|border border-dark-700/,
          `${file}: the dialog frame comes from the shared surface, not from local utilities`
        );
      }
    }
  });

  test('the hand-rolled surfaces adopt the same frame class', () => {
    for (const file of [
      'src/components/modals/TsvImportModal.vue',
      'src/components/modals/AiSqlChatModal.vue',
      'src/components/modals/DataViewModal.vue',
    ]) {
      assert.match(
        readSource(file),
        /sq-dialog-surface/,
        `${file} must use the shared dialog surface`
      );
    }
  });

  test('nothing in the app asks PrimeVue for a maximize button', () => {
    // Maximize/minimize are explicitly out of scope for the unified dialog behaviour.
    const files = [
      ...DIALOGS.map(([file]) => file),
      'src/components/modals/TsvImportModal.vue',
      'src/components/modals/AiSqlChatModal.vue',
      'src/components/modals/DataViewModal.vue',
    ];

    for (const file of files) {
      const source = readSource(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/<!--[\s\S]*?-->/g, '');
      assert.doesNotMatch(
        source,
        /:maximizable|maximizable(\s|>|=)/,
        `${file} must not enable the PrimeVue maximize button`
      );
    }
  });

  test('the window behaviour clamps to the viewport instead of letting a dialog escape', () => {
    const source = readSource('src/composables/useDialogWindow.ts');

    // The drag itself (rubber band + spring back onto the shared resting range) is delegated, so
    // dialogs and tool windows cannot drift apart.
    assert.match(source, /createWindowDrag/);
    // Resizing stays a hard clamp against the viewport and the minimum size.
    assert.match(source, /resizeWindowRect/);
    assert.match(
      source,
      /releaseGesture\?\.\(\)/,
      'a new gesture must release the previous listeners'
    );
  });

  test('the resize handles are inset so overflow cannot clip them', () => {
    const css = readSource('src/assets/main.css');
    for (const handle of ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l']) {
      assert.ok(
        css.includes(`.sq-dialog-resize-${handle}`),
        `main.css must style the ${handle} resize handle`
      );
    }
    assert.match(css, /\.sq-dialog-resize-tl \{[\s\S]*?top: 0;[\s\S]*?left: 0/);
    assert.match(css, /\.sq-dialog-resize-br \{[\s\S]*?bottom: 0;[\s\S]*?right: 0/);
  });

  test('dialogs that build their own header opt it in as the drag handle', () => {
    // These render :showHeader="false", so they have no .p-dialog-header for the composable to
    // find; without the marker they would not be draggable at all.
    for (const file of [
      'src/components/modals/QuickObjectFinderModal.vue',
      'src/components/modals/SqlTemplateModal.vue',
      'src/components/results/ResultGridItem.vue',
    ]) {
      assert.match(
        readSource(file),
        /sq-dialog-drag-handle/,
        `${file} must mark its custom title bar as the drag handle`
      );
    }

    assert.match(
      readSource('src/composables/useDialogWindow.ts'),
      /const HEADER_SELECTOR = '\.p-dialog-header, \.sq-dialog-drag-handle'/,
      'the composable must accept both header shapes'
    );
  });

  test('the commit dialog keeps its semantic accent inside the shared frame', () => {
    const source = readSource('src/components/results/ResultGridItem.vue');
    assert.match(source, /sq-dialog-accent-danger/);
    assert.match(source, /sq-dialog-accent-warn/);

    const css = readSource('src/assets/main.css');
    assert.match(css, /\.sq-dialog-surface\.sq-dialog-accent-danger \{/);
    assert.match(css, /\.sq-dialog-surface\.sq-dialog-accent-warn \{/);
  });

  test('the retired AI chat dialog stylesheet is gone', () => {
    // It used to define a second, competing shadow for the same window.
    const css = readSource('src/assets/main.css');
    assert.doesNotMatch(css, /\.ai-sql-chat-dialog/);
  });
});
