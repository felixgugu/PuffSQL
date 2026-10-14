import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import {
  type FilterRule,
  type FilterTarget,
  type HiddenTableRule,
  isTableHiddenByRules,
  isDatabaseHiddenByRules,
  testFilterPatternByRules,
  testTablePatternByRules,
} from '@/utils/tableFilter';

import { DEFAULT_GLOBAL_FONT_FAMILY, themeManager } from '@/services/themeManager';
import { DEFAULT_GRID_FONT_FAMILY } from '@/data/fontOptions';
import { type SupportedLocale, DEFAULT_LOCALE, setAppLocale } from '@/i18n';

export type { FilterRule, FilterTarget, HiddenTableRule, SupportedLocale };

export interface AppSettings {
  // Theme & Appearance
  colorMode: 'dark' | 'light';
  surfaceColor: string;
  globalFontFamily: string;
  locale: SupportedLocale;

  editorFontSize: number;
  editorFontFamily: string;
  editorWordWrap: 'on' | 'off';
  editorTabSize: number;
  editorAutoCompletion: boolean;
  maxResultTabs: number;
  /**
   * Result tab retention mode. On: result tabs accumulate up to `maxResultTabs` and the oldest
   * unpinned one is evicted. Off (default): only pinned tabs and the newest result tab survive.
   */
  accumulateResultTabs: boolean;
  defaultMaxRows: number | null;
  editorHighlightColor: string;
  /** PNG data URL painted behind the SQL editor, aligned to its bottom-right corner. */
  editorBackgroundImage: string;
  editorBackgroundImageEnabled: boolean;
  /** Backdrop opacity, 0-1. Keeps code readable when the artwork sits under the text. */
  editorBackgroundImageOpacity: number;
  /** Backdrop height as a percentage of the editor viewport (10-100). */
  editorBackgroundImageSize: number;
  gridFontFamily: string;
  erTheme: 'dark' | 'light';
  hiddenTableRules?: FilterRule[];
}

const STORAGE_KEY = 'sqlight_app_settings';

/** Coerces a persisted number into `[min, max]`, falling back when it is missing or not numeric. */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

const DEFAULT_SETTINGS: AppSettings = {
  // The minimal design is light-first: white canvas, light grey chrome. Dark is the paired variant.
  colorMode: 'light',
  surfaceColor: 'slate',
  globalFontFamily: DEFAULT_GLOBAL_FONT_FAMILY,
  locale: DEFAULT_LOCALE,

  editorFontSize: 13,
  editorFontFamily: '"Fira Code", Consolas, Monaco, monospace',
  editorWordWrap: 'on',
  editorTabSize: 2,
  editorAutoCompletion: true,
  maxResultTabs: 10,
  accumulateResultTabs: false,
  defaultMaxRows: 10000,
  editorHighlightColor: '#feffe0',
  editorBackgroundImage: '',
  editorBackgroundImageEnabled: false,
  editorBackgroundImageOpacity: 0.25,
  editorBackgroundImageSize: 60,
  gridFontFamily: DEFAULT_GRID_FONT_FAMILY,
  erTheme: 'dark',
  hiddenTableRules: [],
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.hiddenTableRules)) {
        parsed.hiddenTableRules = parsed.hiddenTableRules.map((r: any) => ({
          ...r,
          target: r.target || 'all',
        }));
      }
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load app settings from localStorage:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

export const useSettingsStore = defineStore('settings', () => {
  const initial = loadSettings();

  const colorMode = ref<'dark' | 'light'>(initial.colorMode || 'dark');
  const surfaceColor = ref<string>(initial.surfaceColor || 'slate');
  const globalFontFamily = ref<string>(initial.globalFontFamily || DEFAULT_GLOBAL_FONT_FAMILY);
  const locale = ref<SupportedLocale>(initial.locale || DEFAULT_LOCALE);

  const editorFontSize = ref<number>(initial.editorFontSize);
  const editorFontFamily = ref<string>(initial.editorFontFamily);
  const editorWordWrap = ref<'on' | 'off'>(initial.editorWordWrap);
  const editorTabSize = ref<number>(initial.editorTabSize);
  const editorAutoCompletion = ref<boolean>(initial.editorAutoCompletion ?? true);
  const maxResultTabs = ref<number>(initial.maxResultTabs);
  const accumulateResultTabs = ref<boolean>(initial.accumulateResultTabs ?? false);
  const defaultMaxRows = ref<number | null>(initial.defaultMaxRows);
  const editorHighlightColor = ref<string>(initial.editorHighlightColor || '#feffe0');
  const editorBackgroundImage = ref<string>(initial.editorBackgroundImage || '');
  const editorBackgroundImageEnabled = ref<boolean>(initial.editorBackgroundImageEnabled ?? false);
  const editorBackgroundImageOpacity = ref<number>(
    clampNumber(initial.editorBackgroundImageOpacity, 0, 1, DEFAULT_SETTINGS.editorBackgroundImageOpacity)
  );
  const editorBackgroundImageSize = ref<number>(
    clampNumber(initial.editorBackgroundImageSize, 10, 100, DEFAULT_SETTINGS.editorBackgroundImageSize)
  );
  const gridFontFamily = ref<string>(initial.gridFontFamily || DEFAULT_GRID_FONT_FAMILY);
  const erTheme = ref<'dark' | 'light'>(initial.erTheme || 'dark');
  const hiddenTableRules = ref<FilterRule[]>(
    initial.hiddenTableRules
      ? initial.hiddenTableRules.map((r) => ({ ...r, target: r.target || 'all' }))
      : []
  );

  function setColorMode(mode: 'dark' | 'light') {
    colorMode.value = mode;
    erTheme.value = mode;
    themeManager.applyColorMode(mode);
  }

  function setSurfaceColor(surface: string) {
    surfaceColor.value = surface;
    themeManager.applySurfaceColor(surface);
  }

  function setGlobalFontFamily(fontFamily: string) {
    globalFontFamily.value = fontFamily;
    themeManager.applyGlobalFontFamily(fontFamily);
  }

  function setLocale(newLocale: SupportedLocale) {
    locale.value = newLocale;
    setAppLocale(newLocale);
  }

  /**
   * Stores (or clears) the editor backdrop image. Selecting an image enables the backdrop so the
   * user sees the result immediately; clearing it disables the layer as well.
   */
  function setEditorBackgroundImage(dataUrl: string) {
    editorBackgroundImage.value = dataUrl || '';
    editorBackgroundImageEnabled.value = Boolean(dataUrl);
  }

  function setEditorBackgroundImageEnabled(enabled: boolean) {
    editorBackgroundImageEnabled.value = enabled;
  }

  function setEditorBackgroundImageOpacity(opacity: number) {
    editorBackgroundImageOpacity.value = clampNumber(
      opacity,
      0,
      1,
      DEFAULT_SETTINGS.editorBackgroundImageOpacity
    );
  }

  function setEditorBackgroundImageSize(size: number) {
    editorBackgroundImageSize.value = clampNumber(
      size,
      10,
      100,
      DEFAULT_SETTINGS.editorBackgroundImageSize
    );
  }

  function addFilterRule(pattern: string, target: FilterTarget = 'all', description?: string) {
    const trimmed = pattern.trim();
    if (!trimmed) return;
    hiddenTableRules.value.push({
      id: 'rule_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      pattern: trimmed,
      target,
      enabled: true,
      description: description?.trim() || undefined,
    });
  }

  function addHiddenTableRule(pattern: string, description?: string) {
    addFilterRule(pattern, 'all', description);
  }

  function removeHiddenTableRule(id: string) {
    hiddenTableRules.value = hiddenTableRules.value.filter((r) => r.id !== id);
  }

  function toggleHiddenTableRule(id: string, enabled?: boolean) {
    const rule = hiddenTableRules.value.find((r) => r.id === id);
    if (rule) {
      rule.enabled = enabled !== undefined ? enabled : !rule.enabled;
    }
  }

  function updateFilterRule(
    id: string,
    updates: {
      pattern?: string;
      target?: FilterTarget;
      enabled?: boolean;
      description?: string;
    }
  ) {
    const rule = hiddenTableRules.value.find((r) => r.id === id);
    if (!rule) return;
    if (updates.pattern !== undefined) {
      const trimmed = updates.pattern.trim();
      if (trimmed) {
        rule.pattern = trimmed;
      }
    }
    if (updates.target !== undefined) {
      rule.target = updates.target;
    }
    if (updates.enabled !== undefined) {
      rule.enabled = updates.enabled;
    }
    if (updates.description !== undefined) {
      rule.description = updates.description.trim() || undefined;
    }
  }

  function isTableHidden(tableName: string, schema?: string): boolean {
    return isTableHiddenByRules(hiddenTableRules.value, tableName, schema);
  }

  function isDatabaseHidden(databaseName: string): boolean {
    return isDatabaseHiddenByRules(hiddenTableRules.value, databaseName);
  }

  function testFilterPattern(
    name: string,
    target: 'database' | 'table',
    schema?: string
  ): { isHidden: boolean; matchedPattern?: string; matchedTarget?: FilterTarget } {
    return testFilterPatternByRules(hiddenTableRules.value, name, target, schema);
  }

  function testTablePattern(tableName: string, schema?: string): { isHidden: boolean; matchedPattern?: string } {
    return testTablePatternByRules(hiddenTableRules.value, tableName, schema);
  }

  /** Persists the current settings and reports whether the write actually succeeded. */
  function saveSettings(): boolean {
    const data: AppSettings = {
      colorMode: colorMode.value,
      surfaceColor: surfaceColor.value,
      globalFontFamily: globalFontFamily.value,
      locale: locale.value,
      editorFontSize: editorFontSize.value,
      editorFontFamily: editorFontFamily.value,
      editorWordWrap: editorWordWrap.value,
      editorTabSize: editorTabSize.value,
      editorAutoCompletion: editorAutoCompletion.value,
      maxResultTabs: maxResultTabs.value,
      accumulateResultTabs: accumulateResultTabs.value,
      defaultMaxRows: defaultMaxRows.value,
      editorHighlightColor: editorHighlightColor.value,
      editorBackgroundImage: editorBackgroundImage.value,
      editorBackgroundImageEnabled: editorBackgroundImageEnabled.value,
      editorBackgroundImageOpacity: editorBackgroundImageOpacity.value,
      editorBackgroundImageSize: editorBackgroundImageSize.value,
      gridFontFamily: gridFontFamily.value,
      erTheme: erTheme.value,
      hiddenTableRules: hiddenTableRules.value,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('Failed to persist settings:', e);
      return false;
    }
  }

  // Watch for any changes to auto-persist
  watch(
    [
      colorMode,
      surfaceColor,
      globalFontFamily,
      locale,
      editorFontSize,
      editorFontFamily,
      editorWordWrap,
      editorTabSize,
      editorAutoCompletion,
      maxResultTabs,
      accumulateResultTabs,
      defaultMaxRows,
      editorHighlightColor,
      editorBackgroundImage,
      editorBackgroundImageEnabled,
      editorBackgroundImageOpacity,
      editorBackgroundImageSize,
      gridFontFamily,
      erTheme,
      hiddenTableRules,
    ],
    () => {
      saveSettings();
    },
    { deep: true }
  );

  function resetToDefaults() {
    setColorMode(DEFAULT_SETTINGS.colorMode);
    setSurfaceColor(DEFAULT_SETTINGS.surfaceColor);
    setGlobalFontFamily(DEFAULT_SETTINGS.globalFontFamily);
    setLocale(DEFAULT_SETTINGS.locale);

    editorFontSize.value = DEFAULT_SETTINGS.editorFontSize;
    editorFontFamily.value = DEFAULT_SETTINGS.editorFontFamily;
    editorWordWrap.value = DEFAULT_SETTINGS.editorWordWrap;
    editorTabSize.value = DEFAULT_SETTINGS.editorTabSize;
    editorAutoCompletion.value = DEFAULT_SETTINGS.editorAutoCompletion;
    maxResultTabs.value = DEFAULT_SETTINGS.maxResultTabs;
    accumulateResultTabs.value = DEFAULT_SETTINGS.accumulateResultTabs;
    defaultMaxRows.value = DEFAULT_SETTINGS.defaultMaxRows;
    editorHighlightColor.value = DEFAULT_SETTINGS.editorHighlightColor;
    editorBackgroundImage.value = DEFAULT_SETTINGS.editorBackgroundImage;
    editorBackgroundImageEnabled.value = DEFAULT_SETTINGS.editorBackgroundImageEnabled;
    editorBackgroundImageOpacity.value = DEFAULT_SETTINGS.editorBackgroundImageOpacity;
    editorBackgroundImageSize.value = DEFAULT_SETTINGS.editorBackgroundImageSize;
    gridFontFamily.value = DEFAULT_SETTINGS.gridFontFamily;
    erTheme.value = DEFAULT_SETTINGS.erTheme;
    hiddenTableRules.value = [];
  }

  return {
    colorMode,
    surfaceColor,
    globalFontFamily,
    locale,
    setColorMode,
    setSurfaceColor,
    setGlobalFontFamily,
    setLocale,
    editorFontSize,
    editorFontFamily,
    editorWordWrap,
    editorTabSize,
    editorAutoCompletion,
    maxResultTabs,
    accumulateResultTabs,
    defaultMaxRows,
    editorHighlightColor,
    editorBackgroundImage,
    editorBackgroundImageEnabled,
    editorBackgroundImageOpacity,
    editorBackgroundImageSize,
    setEditorBackgroundImage,
    setEditorBackgroundImageEnabled,
    setEditorBackgroundImageOpacity,
    setEditorBackgroundImageSize,
    gridFontFamily,
    erTheme,
    hiddenTableRules,
    addFilterRule,
    addHiddenTableRule,
    updateFilterRule,
    removeFilterRule: removeHiddenTableRule,
    removeHiddenTableRule,
    toggleFilterRule: toggleHiddenTableRule,
    toggleHiddenTableRule,
    isTableHidden,
    isDatabaseHidden,
    testFilterPattern,
    testTablePattern,
    saveSettings,
    resetToDefaults,
  };
});
