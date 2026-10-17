import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { FOCUSABLE_SELECTOR, nextTrapIndex } from '../src/utils/focusTrap';
import { readSource } from './helpers/source';

describe('sq_dialog', () => {
const DIALOG_FILES = [
  'src/components/common/ConfirmModal.vue',
  'src/components/modals/ConnectionModal.vue',
  'src/components/modals/DangerousQueryModal.vue',
  'src/components/modals/ExportSchemaModal.vue',
  'src/components/modals/QuickObjectFinderModal.vue',
  'src/components/modals/SettingsModal.vue',
  'src/components/modals/SqlTemplateModal.vue',
  'src/components/modals/settings/AiSettingsTab.vue',
  'src/components/layout/SqlFolderExplorer.vue',
  'src/components/results/ResultGridItem.vue',
];

describe('dialog focus ring', () => {
  test('Tab wraps in both directions instead of escaping the dialog', () => {
    assert.equal(nextTrapIndex(3, 0, false), 1, 'forward');
    assert.equal(nextTrapIndex(3, 2, false), 0, 'forward wraps to the first stop');
    assert.equal(nextTrapIndex(3, 0, true), 2, 'backward wraps to the last stop');
    assert.equal(nextTrapIndex(3, 1, true), 0, 'backward');
  });

  test('focus sitting on the panel itself enters the ring from the right end', () => {
    assert.equal(nextTrapIndex(4, -1, false), 0, 'Tab starts at the first stop');
    assert.equal(nextTrapIndex(4, -1, true), 3, 'Shift+Tab starts at the last stop');
  });

  test('a dialog with no controls has nothing to trap', () => {
    assert.equal(nextTrapIndex(0, -1, false), -1);
    assert.equal(nextTrapIndex(0, 0, true), -1);
  });

  test('the stop list excludes disabled controls and programmatic targets', () => {
    assert.match(FOCUSABLE_SELECTOR, /button:not\(\[disabled\]\)/);
    assert.match(FOCUSABLE_SELECTOR, /input:not\(\[disabled\]\):not\(\[type="hidden"\]\)/);
    assert.match(FOCUSABLE_SELECTOR, /\[tabindex\]:not\(\[tabindex="-1"\]\)/);
    assert.match(FOCUSABLE_SELECTOR, /a\[href\]/, 'a link without href is not a stop');
  });
});

describe('SqDialog owns the modal contract', () => {
  const source = readSource('src/components/ui/SqDialog.vue');

  test('it is the app own primitive, not a PrimeVue wrapper', () => {
    assert.doesNotMatch(source, /primevue/, 'the primitive must not depend on PrimeVue');
    assert.match(source, /<Teleport to="body">/, 'a dialog escapes every stacking context');
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /:aria-labelledby="hasTitle \? titleId : undefined"/, 'the title names the dialog');
  });

  test('the scrim is the spec scrim, without blur', () => {
    // One scrim for the whole app: `.sq-scrim` in main.css, shared with the hand-rolled TSV
    // wizard, so a modal never dims the app differently from its neighbours.
    const css = readSource('src/assets/main.css');
    assert.match(css, /\.sq-scrim \{\s*\n\s*background-color: rgba\(16, 24, 40, 0\.32\);\s*\n\}/);
    assert.match(source, /class="sq-dialog-mask sq-scrim"/, 'the mask paints the shared scrim');
    assert.doesNotMatch(source, /backdrop-filter/, 'no glass effect');
  });

  test('the drag and resize hand-off waits for a settled element', () => {
    // useDialogWindow measures the panel on `show`; firing it before the enter transition ends
    // would pin the geometry mid-fade.
    assert.match(source, /@after-enter="onAfterEnter"/);
    assert.match(source, /@after-leave="onAfterLeave"/);
    assert.match(source, /function onAfterEnter\(\)[\s\S]*?emit\('show'\)/);
    assert.match(source, /function onAfterLeave\(\)[\s\S]*?emit\('hide'\)/);
    // Without `appear` a dialog that mounts already visible never enters, so `show` never fires
    // and the window comes up without its drag and resize zones.
    assert.match(source, /<Transition name="sq-dialog" appear/);
  });

  test('Escape, the scrim and the close button are three separate switches', () => {
    assert.match(source, /if \(!props\.closeOnEscape\) return;/, 'Escape honours its own flag');
    assert.match(source, /if \(!props\.dismissableMask\) return;/, 'the scrim honours its own flag');
    assert.match(source, /v-if="closable"/, 'the close button honours its own flag');
    // A drag that starts on a control and ends on the scrim must not dismiss the dialog.
    assert.match(source, /const startedOnMask = pressedOnMask;/);
    assert.match(source, /event\.target !== maskEl\.value \|\| !startedOnMask/);
  });

  test('Tab is trapped and focus returns to whatever opened the dialog', () => {
    assert.match(source, /nextTrapIndex\(stops\.length, current, event\.shiftKey\)/);
    assert.match(source, /focusFirstWithin\(panel\)/, 'focus lands inside on open');
    assert.match(source, /target\.isConnected\) target\.focus/, 'focus is handed back on close');
  });

  test('stacked dialogs still stack', () => {
    // The template library opens a second dialog on top of itself.
    assert.match(source, /const openDialogs: number\[\] = \[\];/);
    assert.match(source, /zIndex\.value = Z_BASE \+ openDialogs\.length;/);
  });
});

describe('every dialog in the app is built on SqDialog', () => {
  test('no component imports PrimeVue Dialog any more', () => {
    for (const file of [...DIALOG_FILES, 'src/components/modals/TsvImportModal.vue']) {
      assert.doesNotMatch(
        readSource(file),
        /primevue\/dialog/,
        `${file} still imports PrimeVue Dialog`
      );
    }
  });

  test('each dialog file renders SqDialog and never the retired Dialog tag', () => {
    for (const file of DIALOG_FILES) {
      const source = readSource(file);
      assert.match(source, /components\/ui\/SqDialog\.vue/, `${file} must import SqDialog`);
      assert.doesNotMatch(source, /<Dialog[\s>]/, `${file} must not render <Dialog>`);
      assert.doesNotMatch(source, /<\/Dialog>/, `${file} must not close </Dialog>`);
    }
  });
});
});

describe('dialog_window', () => {
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
      const dialogClasses = source.match(/<SqDialog[\s\S]*?>/g) ?? [];

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
    // These render :show-header="false", so they have no shared title bar for the composable to
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
      /const HEADER_SELECTOR = '\.sq-dialog-header, \.sq-dialog-drag-handle'/,
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
});

describe('dialog_theme_and_size', () => {
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
});
