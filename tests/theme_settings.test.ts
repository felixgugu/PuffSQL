import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setActivePinia, createPinia } from 'pinia';
import {
  ACCENT_COLOR,
  DEFAULT_GLOBAL_FONT_FAMILY,
  DEFAULT_SURFACE,
  SURFACE_PALETTES,
  THEME_ROLE_COLORS,
  GLOBAL_FONT_OPTIONS,
  themeManager,
} from '../src/services/themeManager.ts';
import {
  DEFAULT_GRID_FONT_FAMILY,
  EDITOR_FONT_FAMILY_OPTIONS,
  GRID_FONT_FAMILY_OPTIONS,
} from '../src/data/fontOptions.ts';
import { migrateStoredSettings, useSettingsStore } from '../src/stores/settingsStore.ts';

const storageData = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key) => storageData.get(key) ?? null,
  setItem: (key, value) => { storageData.set(key, String(value)); },
  removeItem: (key) => { storageData.delete(key); },
  clear: () => storageData.clear(),
  key: () => null,
  length: 0,
};

beforeEach(() => {
  storageData.clear();
  setActivePinia(createPinia());
});

test('themeManager: constants and options are defined correctly', () => {
  assert.equal(DEFAULT_SURFACE, 'neutral', 'one surface palette ships: 極簡純淨 (neutral)');
  assert.equal(GLOBAL_FONT_OPTIONS.length, 6);
  assert.equal(GLOBAL_FONT_OPTIONS[0]?.value, DEFAULT_GLOBAL_FONT_FAMILY);
  assert.ok(GLOBAL_FONT_OPTIONS.some((option) => option.name === 'jhenghei'));
  assert.ok(GLOBAL_FONT_OPTIONS.some((option) => option.name === 'noto-sans-tc'));
  assert.equal(GRID_FONT_FAMILY_OPTIONS.length, EDITOR_FONT_FAMILY_OPTIONS.length + 1);
  assert.equal(GRID_FONT_FAMILY_OPTIONS[0]?.value, DEFAULT_GRID_FONT_FAMILY);
  assert.ok(GRID_FONT_FAMILY_OPTIONS.some((option) => option.label === 'Fira Code (預設推薦，支援連字)'));

  assert.deepEqual(Object.keys(SURFACE_PALETTES), [DEFAULT_SURFACE]);

  // There is one accent colour, and the role table carries it for both modes.
  assert.equal(THEME_ROLE_COLORS.accent!.light, ACCENT_COLOR);
});

test('themeManager: methods execute gracefully in headless environment', () => {
  assert.doesNotThrow(() => {
    themeManager.applyColorMode('dark');
    themeManager.applyColorMode('light');
    // An unknown palette name (e.g. one left over from an older install) falls back, never throws.
    themeManager.applySurfaceColor('stone');
    themeManager.applyGlobalFontFamily('"Microsoft JhengHei UI", sans-serif');
  });
});

test('themeManager: applyGlobalFontFamily updates the root CSS variable', () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const properties = new Map<string, string>();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      documentElement: {
        style: {
          setProperty: (key: string, value: string) => properties.set(key, value),
        },
      },
    },
  });

  try {
    themeManager.applyGlobalFontFamily('"Noto Sans TC", sans-serif');
    assert.equal(properties.get('--app-font-sans'), '"Noto Sans TC", sans-serif');
  } finally {
    if (originalDocument) {
      Object.defineProperty(globalThis, 'document', originalDocument);
    } else {
      delete (globalThis as any).document;
    }
  }
});

test('settingsStore: appearance defaults, setters, and resetToDefaults', () => {
  const store = useSettingsStore();

  // The minimal design is light-first; dark is the paired variant.
  assert.equal(store.colorMode, 'light');
  assert.equal(store.surfaceColor, DEFAULT_SURFACE);
  assert.equal(store.globalFontFamily, DEFAULT_GLOBAL_FONT_FAMILY);
  assert.equal(store.gridFontFamily, DEFAULT_GRID_FONT_FAMILY);

  store.setColorMode('dark');
  store.setSurfaceColor(DEFAULT_SURFACE);
  store.setGlobalFontFamily('"Segoe UI", system-ui, sans-serif');
  store.gridFontFamily = '"JetBrains Mono", Consolas, monospace';

  assert.equal(store.colorMode, 'dark');
  assert.equal(store.surfaceColor, DEFAULT_SURFACE);
  assert.equal(store.globalFontFamily, '"Segoe UI", system-ui, sans-serif');
  assert.equal(store.gridFontFamily, '"JetBrains Mono", Consolas, monospace');

  store.saveSettings();
  const saved = JSON.parse(storageData.get('sqlight_app_settings') || '{}');
  assert.equal(saved.globalFontFamily, '"Segoe UI", system-ui, sans-serif');
  assert.equal(saved.gridFontFamily, '"JetBrains Mono", Consolas, monospace');

  store.resetToDefaults();
  assert.equal(store.colorMode, 'light');
  assert.equal(store.surfaceColor, DEFAULT_SURFACE);
  assert.equal(store.globalFontFamily, DEFAULT_GLOBAL_FONT_FAMILY);
  assert.equal(store.gridFontFamily, DEFAULT_GRID_FONT_FAMILY);
});

test('the appearance settings that only ever drove PrimeVue are gone', () => {
  const store = useSettingsStore() as unknown as Record<string, unknown>;
  for (const dead of ['themePreset', 'primaryColor', 'ripple']) {
    assert.equal(dead in store, false, `${dead} controlled nothing once PrimeVue left`);
  }

  const source = readFileSync(resolve(process.cwd(), 'src/services/themeManager.ts'), 'utf-8');
  assert.doesNotMatch(source, /@primevue\/themes|usePreset|updatePrimaryPalette|updateSurfacePalette/);
});

test('themeManager: exactly one surface palette ships, with a complete 50-950 scale', () => {
  assert.deepEqual(Object.keys(SURFACE_PALETTES), [DEFAULT_SURFACE]);

  const ramp = SURFACE_PALETTES[DEFAULT_SURFACE]!;
  for (const tone of ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']) {
    assert.match(ramp[tone as keyof typeof ramp] ?? '', /^#[0-9a-f]{6}$/, `tone ${tone} is defined`);
  }

  // The four other hues are gone from the file, not merely hidden from the picker.
  const source = readFileSync(resolve(process.cwd(), 'src/services/themeManager.ts'), 'utf-8');
  for (const gone of ['slate', 'gray', 'zinc', 'stone']) {
    assert.ok(!source.includes(`'${gone}'`), `the ${gone} palette must be deleted`);
  }
});

test('a settings file that still names a removed surface falls back to the shipped one', () => {
  const migrated = migrateStoredSettings({ colorMode: 'dark', surfaceColor: 'zinc' });

  assert.equal('surfaceColor' in migrated, false, 'the old palette name is dropped');
  assert.equal(migrated.colorMode, 'dark', 'the rest of the settings survive');
});
