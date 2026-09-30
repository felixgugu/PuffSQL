import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf-8');
}

describe('Dialog theme styling and dimension consistency', () => {
  test('main.css enforces theme-aware border radius on all non-maximized Dialogs', () => {
    const css = readSource('src/assets/main.css');
    // The canonical frame is shared by PrimeVue dialogs and the hand-rolled surfaces, so the
    // selector list names both.
    assert.match(
      css,
      /\.p-dialog:not\(\.p-dialog-maximized\),\s*\n\.sq-dialog-surface\s*\{\s*border-radius:\s*var\(--p-dialog-border-radius/,
      'main.css must enforce theme-aware border radius for .p-dialog'
    );
    assert.match(
      css,
      /\.p-dialog:not\(\.p-dialog-maximized\)\s*\.p-dialog-header\s*\{\s*border-top-left-radius:\s*inherit/,
      'Dialog header must inherit border radius from parent'
    );
    assert.match(
      css,
      /\.p-dialog:not\(\.p-dialog-maximized\)\s*\.p-dialog-footer\s*\{\s*border-bottom-left-radius:\s*inherit/,
      'Dialog footer must inherit border radius from parent'
    );
  });

  test('Settings-category dialogs have default height of 80vh', () => {
    const settingsModal = readSource('src/components/modals/SettingsModal.vue');
    assert.match(settingsModal, /h-\[80vh\]/, 'SettingsModal must have default height of 80vh');

    const connectionModal = readSource('src/components/modals/ConnectionModal.vue');
    assert.match(connectionModal, /h-\[80vh\]/, 'ConnectionModal must have default height of 80vh');

    const exportSchemaModal = readSource('src/components/modals/ExportSchemaModal.vue');
    assert.match(exportSchemaModal, /h-\[80vh\]/, 'ExportSchemaModal must have default height of 80vh');

    const sqlTemplateModal = readSource('src/components/modals/SqlTemplateModal.vue');
    assert.match(sqlTemplateModal, /h-\[80vh\]/, 'SqlTemplateModal must have default height of 80vh');

    const quickFinderModal = readSource('src/components/modals/QuickObjectFinderModal.vue');
    assert.match(quickFinderModal, /h-\[80vh\]/, 'QuickObjectFinderModal must have default height of 80vh');
  });

  test('AI SQL Assistant dialog retains its custom window size and does not enforce 80vh', () => {
    const aiChat = readSource('src/components/modals/AiSqlChatModal.vue');
    assert.doesNotMatch(aiChat, /h-\[80vh\]/, 'AiSqlChatModal must retain its own dimension logic and not be 80vh');
    assert.match(aiChat, /size\.height/, 'AiSqlChatModal must use size.height');
    assert.match(aiChat, /var\(--p-dialog-border-radius/, 'AiSqlChatModal must respect theme border radius');
  });

  test('Dialogs do not carry hardcoded rounded classes that conflict with theme preset', () => {
    const connectionModal = readSource('src/components/modals/ConnectionModal.vue');
    assert.doesNotMatch(connectionModal, /!rounded-2xl/, 'ConnectionModal must not hardcode !rounded-2xl');

    const quickFinder = readSource('src/components/modals/QuickObjectFinderModal.vue');
    assert.doesNotMatch(quickFinder, /!rounded-xl/, 'QuickObjectFinderModal must not hardcode !rounded-xl');

    const sqlTemplateModal = readSource('src/components/modals/SqlTemplateModal.vue');
    assert.doesNotMatch(sqlTemplateModal, /!rounded-xl/, 'SqlTemplateModal must not hardcode !rounded-xl');

    const commitModal = readSource('src/components/results/ResultGridItem.vue');
    assert.doesNotMatch(commitModal, /!rounded-lg/, 'ResultGridItem commit modal must not hardcode !rounded-lg');
  });
});
