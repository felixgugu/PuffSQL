import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setActivePinia, createPinia } from 'pinia';

import {
  EDITOR_BACKGROUND_ACCEPTED_TYPES,
  EDITOR_BACKGROUND_MAX_DATA_URL_BYTES,
  EDITOR_BACKGROUND_MAX_DIMENSION,
  dataUrlByteSize,
  fitWithin,
  isAcceptedImageType,
} from '../src/services/editorBackgroundService.ts';
import { useSettingsStore } from '../src/stores/settingsStore.ts';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

const storageData = new Map<string, string>();
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

  test('both locales describe the backdrop setting', () => {
    for (const locale of ['src/i18n/locales/zh-TW.ts', 'src/i18n/locales/en.ts']) {
      const source = readSource(locale);
      for (const key of [
        'editorBackgroundImage',
        'editorBackgroundImageDesc',
        'editorBackgroundImageChoose',
        'editorBackgroundImageRemove',
        'editorBackgroundImageOpacity',
        'editorBackgroundImageSize',
        'editorBackgroundImageApplied',
        'editorBackgroundImageNotPersisted',
        'editorBackgroundImageTooLarge',
      ]) {
        assert.match(source, new RegExp(`\\b${key}:`), `${locale} is missing ${key}`);
      }
    }
  });
});
