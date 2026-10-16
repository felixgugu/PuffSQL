/**
 * Monaco theme definitions, kept as pure data so the contrast regression test can assert them
 * without booting the editor. Syntax colours are chosen to clear 4.5:1 against their own
 * editor background (dark: the surface palette's 900 step, light: the palette's 100 step, the
 * soft grey canvas the rest of the light theme paints).
 */
import { DEFAULT_SURFACE, SURFACE_PALETTES } from '@/services/themeManager';

export interface MonacoRule {
  token: string;
  foreground: string;
  fontStyle?: string;
}

export interface MonacoThemeDefinition {
  base: 'vs-dark' | 'vs';
  rules: MonacoRule[];
  colors: Record<string, string>;
}

/** Dark syntax palette (>= 4.5:1 on every surface palette's 900 step). */
export const MONACO_DARK_RULES: MonacoRule[] = [
  { token: 'keyword', foreground: '38bdf8', fontStyle: 'bold' },
  { token: 'string', foreground: '34d399' },
  { token: 'number', foreground: 'fbbf24' },
  { token: 'comment', foreground: '94a3b8', fontStyle: 'italic' },
  { token: 'operator.sql', foreground: 'f472b6' },
];

/** Light syntax palette (>= 4.5:1 on every surface palette's 100 step). */
export const MONACO_LIGHT_RULES: MonacoRule[] = [
  { token: 'keyword', foreground: '0369a1', fontStyle: 'bold' },
  { token: 'string', foreground: '047857' },
  { token: 'number', foreground: 'b45309' },
  { token: 'comment', foreground: '475569', fontStyle: 'italic' },
  { token: 'operator.sql', foreground: 'be185d' },
];

/**
 * Monaco colour values must keep their leading `#`: `Color.Format.CSS.parseHex` rejects an
 * unprefixed hex string and the theme service then falls back to `Color.red` (#FF0000).
 */
export function buildEditorTheme(surfaceName: string, mode: 'dark' | 'light'): MonacoThemeDefinition {
  const pal = (SURFACE_PALETTES[surfaceName] ?? SURFACE_PALETTES[DEFAULT_SURFACE])!;

  if (mode === 'dark') {
    return {
      base: 'vs-dark',
      rules: MONACO_DARK_RULES,
      colors: {
        'editor.background': pal['900'],
        'editor.foreground': pal['50'],
        'editorLineNumber.foreground': pal['400'],
        'editorLineNumber.activeForeground': '#93c5fd',
        'editor.lineHighlightBackground': pal['800'],
        'editor.selectionBackground': '#2563eb40',
        'editorCursor.foreground': '#60a5fa',
        'menu.background': pal['800'],
        'menu.foreground': pal['200'],
        'menu.selectionBackground': pal['700'],
        'menu.selectionForeground': '#ffffff',
        'menu.selectionBorder': '#00000000',
        'menu.separatorBackground': pal['700'],
        'menu.border': pal['700'],
      },
    };
  }

  return {
    base: 'vs',
    rules: MONACO_LIGHT_RULES,
    colors: {
      'editor.background': pal['100'],
      'editor.foreground': pal['950'],
      'editorLineNumber.foreground': pal['500'],
      'editorLineNumber.activeForeground': '#2563eb',
      'editor.lineHighlightBackground': pal['200'],
      'editor.selectionBackground': '#bfdbfe80',
      'editorCursor.foreground': '#2563eb',
      'menu.background': pal['50'],
      'menu.foreground': pal['800'],
      'menu.selectionBackground': pal['200'],
      'menu.selectionForeground': pal['950'],
      'menu.selectionBorder': '#00000000',
      'menu.separatorBackground': pal['200'],
      'menu.border': pal['200'],
    },
  };
}
