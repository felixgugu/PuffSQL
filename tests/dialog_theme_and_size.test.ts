import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf-8');
}

describe('Dialog theme styling and dimension consistency', () => {
  test('main.css owns the one dialog frame its callers must not re-declare', () => {
    const css = readSource('src/assets/main.css');
    // The canonical frame is shared by SqDialog panels and the hand-rolled tool windows alike, so
    // it is declared once against `.sq-dialog-surface` and nowhere else.
    assert.match(
      css,
      /\.sq-dialog-surface \{\s*\n\s*border-radius: 6px !important;\s*\n\s*border: 1px solid rgb\(var\(--color-dark-700\)\) !important;\s*\n\s*box-shadow: var\(--shadow-overlay\) !important;\s*\n\s*overflow: hidden !important;\s*\n\}/,
      'main.css must own the dialog radius, border and shadow'
    );
    assert.doesNotMatch(css, /\.p-dialog/, 'no PrimeVue dialog selector may survive in main.css');
    assert.match(
      css,
      /\.sq-dialog-surface \.sq-dialog-header \{\s*\n\s*border-top-left-radius: inherit !important;/,
      'the dialog header must inherit the frame radius'
    );
    assert.match(
      css,
      /\.sq-dialog-surface \.sq-dialog-footer \{\s*\n\s*border-bottom-left-radius: inherit !important;/,
      'the dialog footer must inherit the frame radius'
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
    // The frame radius comes from `.sq-dialog-surface`, so the floating window must not restate it
    // inline (it used to read PrimeVue's theme variable to work around the same problem).
    assert.match(aiChat, /sq-dialog-surface/, 'AiSqlChatModal must wear the shared dialog surface');
    assert.doesNotMatch(aiChat, /borderRadius/, 'the shared surface owns the radius');
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
