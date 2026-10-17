import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { EDITOR_BACKGROUND_ACCEPTED_TYPES, EDITOR_BACKGROUND_MAX_DATA_URL_BYTES, EDITOR_BACKGROUND_MAX_DIMENSION, dataUrlByteSize, fitWithin, isAcceptedImageType } from '../src/services/editorBackgroundService';
import { queryService } from '../src/services/queryService';
import { useQueryStore } from '../src/stores/queryStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { hexToRgba, transientHighlightColors } from '../src/utils/highlightColor';
import { readSource } from './helpers/source';

describe('result_message_flash', () => {
const storageData = new Map<string, string>();
before(() => {
  globalThis.localStorage = {
    getItem: (key) => storageData.get(key) ?? null,
    setItem: (key, value) => { storageData.set(key, String(value)); },
    removeItem: (key) => { storageData.delete(key); },
    clear: () => storageData.clear(),
    key: () => null,
    length: 0,
  };
});

describe('transient highlight colour', () => {
  test('converts the configured hex into the editor wash alphas', () => {
    assert.equal(hexToRgba('#feffe0', 0.22), 'rgba(254, 255, 224, 0.22)');
    assert.equal(hexToRgba('#ffffff', 1), 'rgba(255, 255, 255, 1)');

    const colors = transientHighlightColors('#feffe0');
    assert.equal(colors.background, 'rgba(254, 255, 224, 0.22)');
    assert.equal(colors.border, 'rgba(254, 255, 224, 0.85)');
  });

  test('accepts short hex and tolerates malformed input', () => {
    assert.equal(hexToRgba('#abc', 0.22), 'rgba(170, 187, 204, 0.22)');
    assert.equal(hexToRgba('', 0.22), 'rgba(254, 255, 224, 0.22)');
    assert.equal(hexToRgba('#fe', 0.22), 'rgba(254, 255, 224, 0.22)');
    assert.equal(hexToRgba('nope', 0.22), 'rgba(254, 255, 224, 0.22)');
  });

  test('the setting keeps the editor default', () => {
    setActivePinia(createPinia());
    assert.equal(useSettingsStore().editorHighlightColor, '#feffe0');
  });
});

describe('message log transient flash', () => {
  test('ResultMessages flashes new messages with the configured colour', () => {
    const source = readSource('src/components/results/ResultMessages.vue');

    assert.match(
      source,
      /transientHighlightColors\(\s*settingsStore\.editorHighlightColor/,
      'the flash must read the 執行暫態高亮顏色 setting'
    );
    assert.match(source, /'--sq-flash-bg': background/, 'the wash colour is passed as a variable');
    assert.match(source, /'--sq-flash-border': border/, 'the leading edge is passed as a variable');
    assert.match(
      source,
      /'sq-message-flash': isFlashing\(getMsgKey\(msg, idx\)\)/,
      'the flash class is driven per message key'
    );
  });

  test('new messages are recognised by arrival, not by mount order', () => {
    const source = readSource('src/components/results/ResultMessages.vue');

    assert.match(source, /const FLASH_ARRIVAL_WINDOW_MS = 4000;/, 'the arrival window is bounded');
    assert.match(source, /const FLASH_DURATION_MS = 3000;/, 'the wash lasts a few seconds');
    assert.match(source, /animation: sqMessageFlash \d+ms/, 'the wash fades out on its own');
    assert.match(
      source,
      /@media \(prefers-reduced-motion: reduce\)/,
      'the fade must respect reduced motion'
    );
    assert.match(
      source,
      /flashArrivals\(\);\s*watch\(\(\) => props\.messages\.length, flashArrivals\);/,
      'the panel flashes what just arrived as well as what lands while it stays open'
    );
    assert.match(
      source,
      /if \(flashedKeys\.has\(key\)\) return;/,
      'a message must never flash twice'
    );
    assert.match(
      source,
      /onBeforeUnmount\(\(\) => \{\s*flashTimers\.forEach/,
      'pending flash timers must be cleared with the component'
    );
  });

  test('the editor decoration and the message flash share one colour helper', () => {
    const editor = readSource('src/components/editor/MonacoEditor.vue');
    assert.match(editor, /import \{ transientHighlightColors \} from '@\/utils\/highlightColor'/);
    assert.match(editor, /const \{ background: bg, border \} = transientHighlightColors\(color\)/);
    assert.doesNotMatch(editor, /function hexToRgba/, 'the local copy must be gone');
  });

  test('executing a message-only statement stamps its arrival for the flash', async () => {
    setActivePinia(createPinia());
    queryService.executeQuery = async () => ({
      resultSets: [],
      messages: [
        { level: 'info', message: '(3 rows affected)', timestamp: new Date().toISOString() },
      ],
      affectedRows: 3,
      executionTimeMs: 4,
    });

    const before = Date.now();
    await useQueryStore().execute('conn-1', 'master', 'UPDATE t SET a = 1;');

    const message = useQueryStore().sessionMessages[0];
    assert.ok(message, 'the UPDATE message lands in the session log');
    assert.equal(message!.message, '(3 rows affected)');
    assert.equal(typeof message!.freshAt, 'number', 'the arrival stamp drives the flash');
    assert.ok(message!.freshAt! >= before, 'the stamp comes from the local clock');
    assert.ok(Date.now() - message!.freshAt! < 4000, 'it is still inside the arrival window');
  });
});
});

describe('editor_completion_settings', () => {
const storageData = new Map<string, string>();
// A hook, not a conditional install: every member gets its own store back.
before(() => {
  (globalThis as any).localStorage = {
    getItem: (key: string) => storageData.get(key) || null,
    setItem: (key: string, val: string) => storageData.set(key, val),
    removeItem: (key: string) => storageData.delete(key),
    clear: () => storageData.clear(),
  };
});

beforeEach(() => {
  storageData.clear();
  setActivePinia(createPinia());
});

test('settingsStore: editorAutoCompletion defaults to true, toggles, saves and resets', () => {
  const store = useSettingsStore();

  assert.equal(store.editorAutoCompletion, true);

  store.editorAutoCompletion = false;
  assert.equal(store.editorAutoCompletion, false);

  store.saveSettings();
  const saved = JSON.parse(storageData.get('sqlight_app_settings') || '{}');
  assert.equal(saved.editorAutoCompletion, false);

  store.resetToDefaults();
  assert.equal(store.editorAutoCompletion, true);
});

test('SettingsModal.vue: contains editorAutoCompletion toggle switch in Editor tab', () => {
  const content = readSource('src/components/modals/SettingsModal.vue');

  assert.match(
    content,
    /SqSwitch\s+v-model="settingsStore\.editorAutoCompletion"/,
    'SettingsModal must have a switch bound to editorAutoCompletion'
  );
});

test('SettingsModal.vue: displays Ctrl+Shift+A for completion shortcut in Keyboard Shortcuts', () => {
  const content = readSource('src/components/modals/SettingsModal.vue');

  assert.match(
    content,
    /Ctrl\+Shift\+A/,
    'SettingsModal shortcuts table must display Ctrl+Shift+A for code completion'
  );
  assert.doesNotMatch(
    content,
    /<kbd[^>]*>\s*Ctrl \+ Space\s*<\/kbd>/,
    'SettingsModal must not list Ctrl + Space as the completion shortcut'
  );
});

test('MonacoEditor.vue: registers Ctrl+Shift+A keybinding and syncs editorAutoCompletion', () => {
  const content = readSource('src/components/editor/MonacoEditor.vue');

  assert.match(
    content,
    /monaco\.KeyMod\.CtrlCmd\s*\|\s*monaco\.KeyMod\.Shift\s*\|\s*monaco\.KeyCode\.KeyA/,
    'MonacoEditor must bind CtrlCmd + Shift + KeyA'
  );

  assert.match(
    content,
    /settingsStore\.editorAutoCompletion/,
    'MonacoEditor must watch and apply settingsStore.editorAutoCompletion'
  );

  assert.match(
    content,
    /triggerSuggest,/,
    'MonacoEditor must expose triggerSuggest'
  );
});
});

describe('editor_background_image', () => {
const storageData = new Map<string, string>();
before(() => {
  globalThis.localStorage = {
    getItem: (key: string) => storageData.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storageData.set(key, String(value));
    },
    removeItem: (key: string) => {
      storageData.delete(key);
    },
    clear: () => storageData.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
});

beforeEach(() => {
  storageData.clear();
  setActivePinia(createPinia());
});

describe('editor background image service', () => {
  test('fitWithin scales down to the longest edge and never upscales', () => {
    assert.deepEqual(fitWithin(3200, 1600, 1600), { width: 1600, height: 800 });
    assert.deepEqual(fitWithin(1600, 3200, 1600), { width: 800, height: 1600 });
    // Already inside the box: keep the original pixel size so small PNGs stay crisp.
    assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
  });

  test('fitWithin reports unusable dimensions instead of producing NaN sizes', () => {
    assert.deepEqual(fitWithin(0, 0, 1600), { width: 0, height: 0 });
    assert.deepEqual(fitWithin(Number.NaN, 100, 1600), { width: 0, height: 0 });
    assert.deepEqual(fitWithin(100, 100, 0), { width: 0, height: 0 });
  });

  test('dataUrlByteSize measures the base64 payload and honours padding', () => {
    assert.equal(dataUrlByteSize('data:image/png;base64,AAAA'), 3);
    assert.equal(dataUrlByteSize('data:image/png;base64,AAA='), 2);
    assert.equal(dataUrlByteSize('data:image/png;base64,AA=='), 1);
  });

  test('only transparent-capable image types are accepted', () => {
    assert.deepEqual([...EDITOR_BACKGROUND_ACCEPTED_TYPES], ['image/png', 'image/jpeg', 'image/webp']);
    assert.equal(isAcceptedImageType('image/png'), true);
    assert.equal(isAcceptedImageType('image/webp'), true);
    assert.equal(isAcceptedImageType('image/gif'), false);
    assert.equal(isAcceptedImageType(''), false);
  });

  test('the storage budget stays well below the localStorage quota', () => {
    assert.ok(EDITOR_BACKGROUND_MAX_DATA_URL_BYTES <= 1_500_000);
    assert.ok(EDITOR_BACKGROUND_MAX_DIMENSION <= 2000);
  });
});

describe('editor background image settings', () => {
  test('defaults keep the backdrop off until the user picks a picture', () => {
    const store = useSettingsStore();

    assert.equal(store.editorBackgroundImage, '');
    assert.equal(store.editorBackgroundImageEnabled, false);
    assert.equal(store.editorBackgroundImageOpacity, 0.25);
    assert.equal(store.editorBackgroundImageSize, 60);
  });

  test('picking an image enables the backdrop and clearing it disables the layer', () => {
    const store = useSettingsStore();
    const dataUrl = 'data:image/png;base64,AAAA';

    store.setEditorBackgroundImage(dataUrl);
    assert.equal(store.editorBackgroundImage, dataUrl);
    assert.equal(store.editorBackgroundImageEnabled, true);

    store.setEditorBackgroundImageEnabled(false);
    assert.equal(store.editorBackgroundImageEnabled, false);
    assert.equal(store.editorBackgroundImage, dataUrl, 'disabling must keep the picked picture');

    store.setEditorBackgroundImage('');
    assert.equal(store.editorBackgroundImage, '');
    assert.equal(store.editorBackgroundImageEnabled, false);
  });

  test('opacity and size setters clamp out-of-range input', () => {
    const store = useSettingsStore();

    store.setEditorBackgroundImageOpacity(1.8);
    assert.equal(store.editorBackgroundImageOpacity, 1);
    store.setEditorBackgroundImageOpacity(-0.4);
    assert.equal(store.editorBackgroundImageOpacity, 0);
    store.setEditorBackgroundImageOpacity(0.35);
    assert.equal(store.editorBackgroundImageOpacity, 0.35);

    store.setEditorBackgroundImageSize(4);
    assert.equal(store.editorBackgroundImageSize, 10);
    store.setEditorBackgroundImageSize(500);
    assert.equal(store.editorBackgroundImageSize, 100);
    store.setEditorBackgroundImageSize(45);
    assert.equal(store.editorBackgroundImageSize, 45);
  });

  test('the backdrop survives a settings round-trip and resets to defaults', () => {
    const store = useSettingsStore();
    store.setEditorBackgroundImage('data:image/png;base64,AAAA');
    store.setEditorBackgroundImageOpacity(0.5);
    store.setEditorBackgroundImageSize(80);
    assert.equal(store.saveSettings(), true, 'a successful write must be reported to the caller');

    const saved = JSON.parse(storageData.get('sqlight_app_settings') || '{}');
    assert.equal(saved.editorBackgroundImage, 'data:image/png;base64,AAAA');
    assert.equal(saved.editorBackgroundImageEnabled, true);
    assert.equal(saved.editorBackgroundImageOpacity, 0.5);
    assert.equal(saved.editorBackgroundImageSize, 80);

    // A fresh store must hydrate the persisted backdrop.
    setActivePinia(createPinia());
    const hydrated = useSettingsStore();
    assert.equal(hydrated.editorBackgroundImage, 'data:image/png;base64,AAAA');
    assert.equal(hydrated.editorBackgroundImageEnabled, true);
    assert.equal(hydrated.editorBackgroundImageOpacity, 0.5);

    hydrated.resetToDefaults();
    assert.equal(hydrated.editorBackgroundImage, '');
    assert.equal(hydrated.editorBackgroundImageEnabled, false);
    assert.equal(hydrated.editorBackgroundImageOpacity, 0.25);
    assert.equal(hydrated.editorBackgroundImageSize, 60);
  });

  test('a rejected localStorage write is reported instead of thrown', () => {
    const store = useSettingsStore();
    const originalSetItem = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      assert.equal(store.saveSettings(), false);
    } finally {
      globalThis.localStorage.setItem = originalSetItem;
    }
  });

  test('a tampered stored opacity cannot push the layer outside 0-100%', () => {
    storageData.set(
      'sqlight_app_settings',
      JSON.stringify({ editorBackgroundImageOpacity: 12, editorBackgroundImageSize: 'nope' })
    );
    setActivePinia(createPinia());
    const store = useSettingsStore();

    assert.equal(store.editorBackgroundImageOpacity, 1);
    assert.equal(store.editorBackgroundImageSize, 60, 'non-numeric sizes fall back to the default');
  });
});

describe('SQL editor backdrop wiring', () => {
  test('MonacoEditor renders a bottom-right watermark behind a transparent editor', () => {
    const source = readSource('src/components/editor/MonacoEditor.vue');

    assert.match(source, /class="sqlight-editor-shell relative w-full h-full overflow-hidden"/);
    assert.match(
      source,
      /'sqlight-editor-transparent': isBackgroundImageActive/,
      'the transparency hook must follow the backdrop state'
    );
    assert.match(source, /class="sqlight-editor-watermark"/);
    assert.match(source, /aria-hidden="true"/, 'the decorative layer must stay out of the a11y tree');
    assert.match(
      source,
      /settingsStore\.editorBackgroundImageEnabled && Boolean\(settingsStore\.editorBackgroundImage\)/,
      'the backdrop needs both a picture and the enabled flag'
    );
    assert.match(source, /backgroundSize: `auto \$\{settingsStore\.editorBackgroundImageSize\}%`/);
    assert.match(source, /opacity: String\(settingsStore\.editorBackgroundImageOpacity\)/);
    // `relative` keeps Monaco's absolute children anchored to the host, but no z-index: any z-index
    // would open a stacking context and trap Monaco's context menu (see layer_order.test.ts).
    assert.match(
      source,
      /<div ref="editorContainer" class="relative w-full h-full overflow-hidden"/,
      'the editor host stays positioned without a z-index'
    );
  });

  test('the stylesheet clears both Monaco background surfaces and pins the watermark', () => {
    const css = readSource('src/assets/main.css');

    assert.match(css, /\.sqlight-editor-transparent \.monaco-editor,/);
    assert.match(css, /\.sqlight-editor-transparent \.monaco-editor \.monaco-editor-background,/);
    assert.match(css, /\.sqlight-editor-transparent \.monaco-editor \.margin \{/);
    assert.match(css, /background-color: transparent !important;/);

    const watermarkRule = css.match(/\.sqlight-editor-watermark \{([^}]*)\}/)?.[1] ?? '';
    assert.match(watermarkRule, /position: absolute;/);
    assert.match(
      watermarkRule,
      /inset: 0;/,
      'the layer must span the viewport, otherwise the picture has no box to paint into'
    );
    assert.match(watermarkRule, /background-position: right bottom;/);
    assert.match(watermarkRule, /pointer-events: none;/, 'the layer must not steal editor clicks');
  });

  test('the settings dialog exposes the backdrop controls from the editor tab', () => {
    const modal = readSource('src/components/modals/SettingsModal.vue');
    assert.match(modal, /import EditorBackgroundSettings from '\.\/settings\/EditorBackgroundSettings\.vue'/);
    assert.match(modal, /<EditorBackgroundSettings \/>/);

    const tab = readSource('src/components/modals/settings/EditorBackgroundSettings.vue');
    assert.match(tab, /import \{[\s\S]*prepareEditorBackgroundImage,[\s\S]*\} from '@\/services\/editorBackgroundService'/);
    assert.match(tab, /:accept="acceptedTypes"/);
    assert.match(tab, /const acceptedTypes = EDITOR_BACKGROUND_ACCEPTED_TYPES\.join\(','\)/);
    assert.match(tab, /type="file"/);
    assert.match(tab, /setEditorBackgroundImageEnabled\(\$event\)/);
    assert.match(tab, /setEditorBackgroundImageOpacity\(/);
    assert.match(tab, /setEditorBackgroundImageSize\(/);
    assert.match(tab, /useWorkspaceStore\(\)/, 'failures must surface through the shared toast channel');
    assert.match(tab, /catch \(error\) \{[\s\S]*errorMessageKey\(error\)/);
    assert.match(
      tab,
      /if \(!settingsStore\.saveSettings\(\)\)/,
      'a rejected localStorage write has to warn instead of silently dropping the backdrop'
    );
  });
});
});
