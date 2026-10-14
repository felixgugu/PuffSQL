import Aura from '@primevue/themes/aura';
import Lara from '@primevue/themes/lara';
import Nora from '@primevue/themes/nora';
import Material from '@primevue/themes/material';
import { usePreset, updatePrimaryPalette, updateSurfacePalette, palette } from '@primevue/themes';
import type { AppSettings } from '@/stores/settingsStore';

export type ThemePresetName = 'Aura' | 'Lara' | 'Nora' | 'Material';

export const PRESET_MAP: Record<ThemePresetName, any> = {
  Aura,
  Lara,
  Nora,
  Material,
};

export interface ThemeColorOption {
  name: string;
  label: string;
  color: string;
  token: string;
}

export const PRIMARY_COLOR_OPTIONS: ThemeColorOption[] = [
  // The default option carries the minimal spec's steel blue so an out-of-the-box install shows
  // one accent colour across both our own tokens and PrimeVue's components.
  { name: 'blue', label: '鋼藍 (Steel Blue)', color: '#2a6791', token: '{blue}' },
  { name: 'emerald', label: '翡翠綠 (Emerald)', color: '#10b981', token: '{emerald}' },
  { name: 'green', label: '自然綠 (Green)', color: '#22c55e', token: '{green}' },
  { name: 'teal', label: '藍綠色 (Teal)', color: '#14b8a6', token: '{teal}' },
  { name: 'cyan', label: '青藍色 (Cyan)', color: '#06b6d4', token: '{cyan}' },
  { name: 'sky', label: '天空藍 (Sky)', color: '#0ea5e9', token: '{sky}' },
  { name: 'indigo', label: '深靛藍 (Indigo)', color: '#6366f1', token: '{indigo}' },
  { name: 'violet', label: '紫羅蘭 (Violet)', color: '#8b5cf6', token: '{violet}' },
  { name: 'purple', label: '高貴紫 (Purple)', color: '#a855f7', token: '{purple}' },
  { name: 'amber', label: '琥珀金 (Amber)', color: '#f59e0b', token: '{amber}' },
  { name: 'orange', label: '活力橘 (Orange)', color: '#f97316', token: '{orange}' },
  { name: 'rose', label: '玫瑰紅 (Rose)', color: '#f43f5e', token: '{rose}' },
];

export interface SurfaceOption {
  name: string;
  label: string;
  sampleDark: string;
  sampleLight: string;
  token: string;
}

export const SURFACE_OPTIONS: SurfaceOption[] = [
  // `sampleLight` mirrors the light canvas (palette 100) so the swatch shows the soft grey the
  // theme actually paints, not the near-white overlay tone.
  { name: 'slate', label: '微藍冷調 (Slate)', sampleDark: '#0f172a', sampleLight: '#f1f5f9', token: '{slate}' },
  { name: 'gray', label: '中性經典 (Gray)', sampleDark: '#111827', sampleLight: '#f3f4f6', token: '{gray}' },
  { name: 'zinc', label: '現代金屬 (Zinc)', sampleDark: '#18181b', sampleLight: '#f4f4f5', token: '{zinc}' },
  { name: 'neutral', label: '極簡純淨 (Neutral)', sampleDark: '#171717', sampleLight: '#f5f5f5', token: '{neutral}' },
  { name: 'stone', label: '微暖石灰 (Stone)', sampleDark: '#1c1917', sampleLight: '#f5f5f4', token: '{stone}' },
];

export interface GlobalFontOption {
  name: string;
  label: string;
  value: string;
  description: string;
}

export const GLOBAL_FONT_OPTIONS: GlobalFontOption[] = [
  {
    name: 'default',
    label: '預設 (Inter / System)',
    value: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft JhengHei UI", "Noto Sans TC", sans-serif',
    description: '沿用 PuffSQL 預設字型，缺少指定字型時自動回退至系統字型。',
  },
  {
    name: 'system',
    label: '系統預設 (System UI)',
    value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft JhengHei UI", "Noto Sans TC", sans-serif',
    description: '跟隨 Windows 或 macOS 的系統介面字型。',
  },
  {
    name: 'jhenghei',
    label: '微軟正黑體 (Microsoft JhengHei)',
    value: '"Microsoft JhengHei UI", "Microsoft JhengHei", system-ui, sans-serif',
    description: 'Windows 繁體中文環境常用的清晰介面字型。',
  },
  {
    name: 'noto-sans-tc',
    label: 'Noto Sans TC',
    value: '"Noto Sans TC", "Microsoft JhengHei UI", system-ui, sans-serif',
    description: '適合繁體中文閱讀的無襯線字型，需系統已安裝。',
  },
  {
    name: 'pingfang',
    label: '蘋方 (PingFang TC)',
    value: '"PingFang TC", "Microsoft JhengHei UI", system-ui, sans-serif',
    description: 'macOS 繁體中文預設字型，未安裝時回退至系統字型。',
  },
  {
    name: 'segoe-ui',
    label: 'Segoe UI',
    value: '"Segoe UI", "Microsoft JhengHei UI", system-ui, sans-serif',
    description: 'Windows 標準介面字型，拉丁文字顯示較為緊湊。',
  },
];

export const DEFAULT_GLOBAL_FONT_FAMILY = GLOBAL_FONT_OPTIONS[0]!.value;

export type SurfaceShade = '50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | '950';
export type SurfacePalette = Record<SurfaceShade, string>;

/**
 * Theme-aware semantic accent colours.
 *
 * Every hue used for text/icons must resolve per colour mode: the light values are the
 * 600/700 steps (>= 4.5:1 on white) and the dark values are the 300/400 steps
 * (>= 4.5:1 on the darkest and on the raised surface). Components must use the
 * `text-accent` / `text-ok` / ... Tailwind aliases instead of raw `text-ok`
 * so both themes keep the same perceived intent.
 */
export const THEME_ROLE_COLORS: Record<string, { dark: string; light: string }> = {
  // Light values are the steel-blue family from the minimal spec: every one of them clears 4.5:1
  // on the white canvas *and* on its own 15-25% status-chip tint. `accent` and `info` are the same
  // hue on purpose — the product has exactly one action colour.
  accent: { dark: '#8cb8da', light: '#2a6791' },
  ok: { dark: '#47cd89', light: '#027a48' },
  danger: { dark: '#f97066', light: '#b42318' },
  warn: { dark: '#fdb022', light: '#a94306' },
  info: { dark: '#8cb8da', light: '#2a6791' },
  plan: { dark: '#b692f6', light: '#6941c6' },
  er: { dark: '#67e3f9', light: '#0e7090' },
  structure: { dark: '#a4bcfd', light: '#3538cd' },
};

export const SURFACE_PALETTES: Record<string, SurfacePalette> = {
  slate: {
    '50': '#f8fafc',
    '100': '#f1f5f9',
    '200': '#e2e8f0',
    '300': '#cbd5e1',
    '400': '#94a3b8',
    '500': '#64748b',
    '600': '#475569',
    '700': '#334155',
    '800': '#1e293b',
    '900': '#0f172a',
    '950': '#020617',
  },
  gray: {
    '50': '#f9fafb',
    '100': '#f3f4f6',
    '200': '#e5e7eb',
    '300': '#d1d5db',
    '400': '#9ca3af',
    '500': '#6b7280',
    '600': '#4b5563',
    '700': '#374151',
    '800': '#1f2937',
    '900': '#111827',
    '950': '#030712',
  },
  zinc: {
    '50': '#fafafa',
    '100': '#f4f4f5',
    '200': '#e4e4e7',
    '300': '#d4d4d8',
    '400': '#a1a1aa',
    '500': '#71717a',
    '600': '#52525b',
    '700': '#3f3f46',
    '800': '#27272a',
    '900': '#18181b',
    '950': '#09090b',
  },
  neutral: {
    '50': '#fafafa',
    '100': '#f5f5f5',
    '200': '#e5e5e5',
    '300': '#d4d4d4',
    '400': '#a3a3a3',
    '500': '#737373',
    '600': '#525252',
    '700': '#404040',
    '800': '#262626',
    '900': '#171717',
    '950': '#0a0a0a',
  },
  stone: {
    '50': '#fafaf9',
    '100': '#f5f5f4',
    '200': '#e7e5e4',
    '300': '#d6d3d1',
    '400': '#a8a29e',
    '500': '#78716c',
    '600': '#57534e',
    '700': '#44403c',
    '800': '#292524',
    '900': '#1c1917',
    '950': '#0c0a09',
  },
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return [r, g, b];
}

function rgbStr(rgb: [number, number, number]): string {
  return `${rgb[0]} ${rgb[1]} ${rgb[2]}`;
}

function blendRgb(c1: [number, number, number], c2: [number, number, number], ratio = 0.5): [number, number, number] {
  return [
    Math.round(c1[0] * (1 - ratio) + c2[0] * ratio),
    Math.round(c1[1] * (1 - ratio) + c2[1] * ratio),
    Math.round(c1[2] * (1 - ratio) + c2[2] * ratio),
  ];
}

/**
 * Pulls a colour toward its own luminance grey. The dark shell must read as neutral charcoal, so
 * the surface palette only decides how dark it gets — never which hue it carries.
 */
function neutralizeRgb(rgb: [number, number, number], ratio: number): [number, number, number] {
  const grey = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return blendRgb(rgb, [grey, grey, grey], ratio);
}

const WHITE_RGB: [number, number, number] = [255, 255, 255];
const BLACK_RGB: [number, number, number] = [0, 0, 0];

export function applyGlobalSurfaceVariables(surfaceName: string, mode: 'dark' | 'light') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const pal = (SURFACE_PALETTES[surfaceName] ?? SURFACE_PALETTES['slate'])!;
  const vars = buildThemeTokens(surfaceName, mode);

  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(key, val);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('sqlight:surface-changed', {
        detail: { surface: surfaceName, mode, palette: pal },
      })
    );
  }
}

/**
 * Builds every `--color-*` custom property for one surface palette + colour mode.
 *
 * Kept as a pure function (no DOM access) so the contrast regression test can assert the
 * same values the runtime applies.
 *
 * Light mode is the primary design: the canvas is white, panel headers and tab strips sit one
 * notch below it, and the chrome (title bar, sidebars, toolbars, status bar) is the palette's 50
 * step. Hover, active-row and well steps deepen from there, and borders are hairlines on the 200
 * step (visible without shouting). Overlays are white like the canvas and separate from it through
 * their 1px outline and shadow instead of being brighter.
 *
 * Dark mode is the paired variant: a neutral charcoal shell whose surfaces only get lighter with
 * elevation (canvas < chrome < panel < hover), with the palette's hue pulled 85% toward grey. The
 * text steps keep the palette's own ramp, which is neutral by construction in every palette.
 */
export function buildThemeTokens(surfaceName: string, mode: 'dark' | 'light'): Record<string, string> {
  const pal = (SURFACE_PALETTES[surfaceName] ?? SURFACE_PALETTES['slate'])!;
  const isDark = mode === 'dark';

  const step = (shade: SurfaceShade): [number, number, number] => hexToRgb(pal[shade]);

  const vars: Record<string, string> = isDark
    ? (() => {
        const canvas = neutralizeRgb(step('900'), 0.85);
        return {
          '--color-dark-950': rgbStr(blendRgb(canvas, BLACK_RGB, 0.45)), // deepest wells
          '--color-dark-900': rgbStr(canvas), // main app canvas (editor, grid, results)
          '--color-dark-850': rgbStr(blendRgb(canvas, WHITE_RGB, 0.025)), // chrome
          '--color-dark-800': rgbStr(blendRgb(canvas, WHITE_RGB, 0.05)), // panels, inputs, row hover
          '--color-dark-750': rgbStr(blendRgb(canvas, WHITE_RGB, 0.075)), // active rows, dividers
          '--color-dark-700': rgbStr(blendRgb(canvas, WHITE_RGB, 0.16)), // borders
          '--color-dark-600': rgbStr(neutralizeRgb(step('500'), 0.5)), // separators (>= 3:1)
          '--color-dark-500': rgbStr(step('400')), // muted text / placeholder
          '--color-dark-400': rgbStr(step('300')), // secondary text
          '--color-dark-300': rgbStr(step('200')), // body text
          '--color-dark-200': rgbStr(step('100')), // high contrast text
          '--color-dark-100': rgbStr(step('50')), // brightest / prominent text
          '--color-raised': rgbStr(blendRgb(canvas, WHITE_RGB, 0.055)), // menus, dialogs, tooltips
        };
      })()
    : {
        '--color-dark-950': rgbStr(blendRgb(step('100'), step('200'), 0.5)), // inset wells
        '--color-dark-900': rgbStr(WHITE_RGB), // main app canvas (editor, grid, results)
        '--color-dark-850': rgbStr(step('50')), // chrome (title bar, sidebars, toolbars, status bar)
        '--color-dark-800': rgbStr(blendRgb(step('50'), WHITE_RGB, 0.55)), // panel headers, tab strips
        '--color-dark-750': rgbStr(blendRgb(step('100'), step('200'), 0.35)), // row hover, dividers
        '--color-dark-700': rgbStr(step('200')), // hairline borders
        '--color-dark-600': rgbStr(step('500')), // separators / hover borders (>= 3:1)
        '--color-dark-500': rgbStr(step('600')), // muted text / placeholder
        '--color-dark-400': rgbStr(step('700')), // secondary text
        '--color-dark-300': rgbStr(step('800')), // body text
        '--color-dark-200': rgbStr(step('900')), // high contrast text
        '--color-dark-100': rgbStr(step('950')), // brightest / prominent text
        '--color-raised': rgbStr(WHITE_RGB), // menus, dialogs, tooltips (outlined + shadowed)
      };

  for (const [role, colors] of Object.entries(THEME_ROLE_COLORS)) {
    vars[`--color-${role}`] = rgbStr(hexToRgb(isDark ? colors.dark : colors.light));
  }

  return vars;
}

let currentMode: 'dark' | 'light' = 'dark';
let currentSurfaceName = 'slate';

export const themeManager = {
  /**
   * Apply Theme Preset (Aura, Lara, Nora, Material)
   */
  applyThemePreset(presetName: ThemePresetName, primaryColor?: string, surfaceColor?: string) {
    const preset = PRESET_MAP[presetName] || Aura;
    try {
      usePreset(preset);
      if (primaryColor) {
        this.applyPrimaryColor(primaryColor);
      }
      if (surfaceColor) {
        this.applySurfaceColor(surfaceColor);
      }
    } catch (e) {
      console.warn(`[themeManager] Failed to apply preset "${presetName}":`, e);
    }
  },

  /**
   * Apply Primary Color Palette
   */
  applyPrimaryColor(colorNameOrHex: string) {
    if (!colorNameOrHex) return;
    try {
      const match = PRIMARY_COLOR_OPTIONS.find((c) => c.name === colorNameOrHex || c.color === colorNameOrHex);
      if (match) {
        updatePrimaryPalette(palette(match.token));
      } else if (colorNameOrHex.startsWith('#')) {
        updatePrimaryPalette(palette(colorNameOrHex));
      } else {
        updatePrimaryPalette(palette(`{${colorNameOrHex}}`));
      }
    } catch (e) {
      console.warn(`[themeManager] Failed to update primary palette "${colorNameOrHex}":`, e);
    }
  },

  /**
   * Apply Surface Color Palette
   */
  applySurfaceColor(surfaceName: string) {
    if (!surfaceName) return;
    currentSurfaceName = surfaceName;
    try {
      const match = SURFACE_OPTIONS.find((s) => s.name === surfaceName);
      const token = match ? match.token : `{${surfaceName}}`;
      const pal = palette(token) as Record<string, any>;
      // PrimeVue uses `surface.0` for light-mode form fields, content and overlay backgrounds and
      // for dark-mode text. The light scheme therefore gets the palette's 50 step (a soft grey
      // instead of pure white) while the dark scheme keeps the pure white text colour.
      updateSurfacePalette({
        light: {
          0: pal['50'],
          ...pal,
        },
        dark: {
          0: '#ffffff',
          ...pal,
        },
      });
    } catch (e) {
      console.warn(`[themeManager] Failed to update surface palette "${surfaceName}":`, e);
    }

    applyGlobalSurfaceVariables(currentSurfaceName, currentMode);
  },

  /**
   * Apply Dark / Light Color Mode
   */
  applyColorMode(mode: 'dark' | 'light') {
    currentMode = mode;
    const isDark = mode === 'dark';
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDark);
    }
    applyGlobalSurfaceVariables(currentSurfaceName, currentMode);
  },

  /**
   * Apply Ripple Effect
   */
  applyRipple(enabled: boolean, primevueConfig?: any) {
    if (primevueConfig) {
      primevueConfig.ripple = enabled;
    }
  },

  /**
   * Apply the global UI font family without affecting explicitly monospace areas
   * or the SQL editor, which uses its own editor font settings.
   */
  applyGlobalFontFamily(fontFamily: string) {
    if (typeof document === 'undefined') return;
    const value = fontFamily?.trim() || DEFAULT_GLOBAL_FONT_FAMILY;
    document.documentElement.style.setProperty('--app-font-sans', value);
  },

  /**
   * Initialize all theme settings from stored preferences
   */
  initTheme(settings: AppSettings, primevueConfig?: any) {
    currentMode = settings.colorMode || 'dark';
    currentSurfaceName = settings.surfaceColor || 'slate';
    this.applyColorMode(currentMode);
    this.applyThemePreset(settings.themePreset || 'Aura');
    this.applyPrimaryColor(settings.primaryColor || 'blue');
    this.applySurfaceColor(currentSurfaceName);
    this.applyRipple(settings.ripple ?? true, primevueConfig);
    this.applyGlobalFontFamily(settings.globalFontFamily || DEFAULT_GLOBAL_FONT_FAMILY);
  },
};
