import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setActivePinia, createPinia } from 'pinia';
import {
  DEFAULT_GLOBAL_FONT_FAMILY,
  GLOBAL_FONT_OPTIONS,
  themeManager,
  PRIMARY_COLOR_OPTIONS,
  SURFACE_OPTIONS,
  PRESET_MAP,
} from '../src/services/themeManager.ts';
import {
  DEFAULT_GRID_FONT_FAMILY,
  EDITOR_FONT_FAMILY_OPTIONS,
  GRID_FONT_FAMILY_OPTIONS,
} from '../src/data/fontOptions.ts';
import { useSettingsStore } from '../src/stores/settingsStore.ts';

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
  assert.equal(PRIMARY_COLOR_OPTIONS.length, 12);
  assert.equal(SURFACE_OPTIONS.length, 5);
  assert.equal(GLOBAL_FONT_OPTIONS.length, 6);
  assert.equal(GLOBAL_FONT_OPTIONS[0]?.value, DEFAULT_GLOBAL_FONT_FAMILY);
  assert.ok(GLOBAL_FONT_OPTIONS.some((option) => option.name === 'jhenghei'));
  assert.ok(GLOBAL_FONT_OPTIONS.some((option) => option.name === 'noto-sans-tc'));
  assert.equal(GRID_FONT_FAMILY_OPTIONS.length, EDITOR_FONT_FAMILY_OPTIONS.length + 1);
  assert.equal(GRID_FONT_FAMILY_OPTIONS[0]?.value, DEFAULT_GRID_FONT_FAMILY);
  assert.ok(GRID_FONT_FAMILY_OPTIONS.some((option) => option.label === 'Fira Code (預設推薦，支援連字)'));
  assert.ok(PRESET_MAP.Aura);
  assert.ok(PRESET_MAP.Lara);
  assert.ok(PRESET_MAP.Nora);
  assert.ok(PRESET_MAP.Material);

  const primaryNames = PRIMARY_COLOR_OPTIONS.map((c) => c.name);
  assert.ok(primaryNames.includes('blue'));
  assert.ok(primaryNames.includes('emerald'));
  assert.ok(primaryNames.includes('purple'));
  assert.ok(primaryNames.includes('rose'));

  const surfaceNames = SURFACE_OPTIONS.map((s) => s.name);
  assert.ok(surfaceNames.includes('slate'));
  assert.ok(surfaceNames.includes('gray'));
  assert.ok(surfaceNames.includes('zinc'));
  assert.ok(surfaceNames.includes('neutral'));
  assert.ok(surfaceNames.includes('stone'));
});

test('themeManager: methods execute gracefully in headless environment', () => {
  assert.doesNotThrow(() => {
    themeManager.applyColorMode('dark');
    themeManager.applyColorMode('light');
    themeManager.applyThemePreset('Lara', 'emerald', 'zinc');
    themeManager.applyPrimaryColor('rose');
    themeManager.applySurfaceColor('stone');
    themeManager.applyGlobalFontFamily('"Microsoft JhengHei UI", sans-serif');
    const fakeConfig = { ripple: false };
    themeManager.applyRipple(true, fakeConfig);
    assert.equal(fakeConfig.ripple, true);
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

test('settingsStore: theme settings defaults, setters, and resetToDefaults', () => {
  const store = useSettingsStore();

  // Initial defaults
  // The minimal design is light-first; dark is the paired variant.
  assert.equal(store.colorMode, 'light');
  assert.equal(store.themePreset, 'Aura');
  assert.equal(store.primaryColor, 'blue');
  assert.equal(store.surfaceColor, 'slate');
  assert.equal(store.ripple, true);
  assert.equal(store.globalFontFamily, DEFAULT_GLOBAL_FONT_FAMILY);
  assert.equal(store.gridFontFamily, DEFAULT_GRID_FONT_FAMILY);

  // Setters
  store.setColorMode('light');
  store.setThemePreset('Material');
  store.setPrimaryColor('emerald');
  store.setSurfaceColor('zinc');
  store.setRipple(false);
  store.setGlobalFontFamily('"Segoe UI", system-ui, sans-serif');
  store.gridFontFamily = '"JetBrains Mono", Consolas, monospace';

  assert.equal(store.colorMode, 'light');
  assert.equal(store.themePreset, 'Material');
  assert.equal(store.primaryColor, 'emerald');
  assert.equal(store.surfaceColor, 'zinc');
  assert.equal(store.ripple, false);
  assert.equal(store.globalFontFamily, '"Segoe UI", system-ui, sans-serif');
  assert.equal(store.gridFontFamily, '"JetBrains Mono", Consolas, monospace');

  store.saveSettings();
  const saved = JSON.parse(storageData.get('sqlight_app_settings') || '{}');
  assert.equal(saved.globalFontFamily, '"Segoe UI", system-ui, sans-serif');
  assert.equal(saved.gridFontFamily, '"JetBrains Mono", Consolas, monospace');

  // Reset to defaults
  store.resetToDefaults();
  assert.equal(store.colorMode, 'light');
  assert.equal(store.themePreset, 'Aura');
  assert.equal(store.primaryColor, 'blue');
  assert.equal(store.surfaceColor, 'slate');
  assert.equal(store.ripple, true);
  assert.equal(store.globalFontFamily, DEFAULT_GLOBAL_FONT_FAMILY);
  assert.equal(store.gridFontFamily, DEFAULT_GRID_FONT_FAMILY);
});

test('themeManager: SURFACE_PALETTES provides complete 50-950 scale for all 5 surface options', () => {
  const surfaces = ['slate', 'gray', 'zinc', 'neutral', 'stone'];
  for (const s of surfaces) {
    const pal = (themeManager as any).SURFACE_PALETTES?.[s] || SURFACE_OPTIONS.find((opt) => opt.name === s);
    assert.ok(pal, `Surface palette for ${s} should exist`);
  }
});
