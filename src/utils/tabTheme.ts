import type { TabType } from '@/types/workspace';

/**
 * Per-category identity for workspace tabs.
 *
 * The minimal spec allows exactly one accent hue for actions, so a category does not get a colour
 * of its own: it points at the same role token its icon already uses. That keeps light and dark
 * handled by one contrast-verified token pair instead of two hand-picked hex palettes, and it
 * removes the case where a tab's icon and the accent line next to it were different greens.
 *
 * Categories stay distinguishable by glyph (`FileCode` / `Table2` / `TableProperties` / `Network`
 * / `Workflow`) *and* by accent, so the distinction never rests on colour alone.
 */
export interface TabCategoryTheme {
  type: TabType;
  label: string;
  /** A CSS custom-property reference, resolved per colour mode by themeManager. */
  accent: string;
}

const token = (name: string) => `rgb(var(${name}))`;

export const TAB_CATEGORY_THEMES: Record<TabType, TabCategoryTheme> = {
  sql_editor: {
    type: 'sql_editor',
    label: 'SQL 查詢',
    accent: token('--color-accent'),
  },
  table_data: {
    type: 'table_data',
    label: '表格資料',
    accent: token('--color-ok'),
  },
  table_structure: {
    type: 'table_structure',
    label: '表格結構',
    accent: token('--color-structure'),
  },
  execution_plan: {
    type: 'execution_plan',
    label: '執行計畫',
    accent: token('--color-plan'),
  },
  er_diagram: {
    type: 'er_diagram',
    label: 'ER 關聯圖',
    accent: token('--color-er'),
  },
};

const CANVAS = token('--color-dark-900');
const ACTIVE_TEXT = token('--color-dark-100');

/** The colour a SQL tab used to default to; saved settings holding it mean "no custom colour". */
const LEGACY_DEFAULT_SQL_TAB_BG = '#1e40af';

export interface TabStyleInput {
  type: TabType;
  isActive: boolean;
  customSqlBg?: string;
  customSqlText?: string;
}

function tabStyle({ type, isActive, customSqlBg, customSqlText }: TabStyleInput) {
  const theme = TAB_CATEGORY_THEMES[type] || TAB_CATEGORY_THEMES.sql_editor;
  // Only the SQL editor's active tab can be recoloured by the user; the others are not theirs to
  // paint, so a custom colour is ignored there.
  const custom = type === 'sql_editor' && customSqlBg && customSqlBg !== LEGACY_DEFAULT_SQL_TAB_BG
    ? customSqlBg
    : undefined;
  const accent = custom ?? theme.accent;
  const activeSurface = custom ?? CANVAS;
  const activeText = (custom && customSqlText) || ACTIVE_TEXT;

  if (isActive) {
    return {
      '--tab-bg': activeSurface,
      '--tab-hover-bg': activeSurface,
      '--tab-border': accent,
      '--tab-hover-border': accent,
      '--tab-top-accent': accent,
      '--tab-text': activeText,
      '--tab-hover-text': activeText,
      // The active tab merges into the content canvas, so its bottom edge is the canvas colour.
      '--tab-active-surface': activeSurface,
      '--tab-active-text': activeText,
    } satisfies Record<string, string>;
  }

  // Inactive tabs are pure chrome: no tint, a hairline border, and the category accent only as the
  // 2px line on top of an active tab.
  return {
    '--tab-bg': 'transparent',
    '--tab-hover-bg': token('--color-dark-750'),
    '--tab-border': token('--color-dark-700'),
    '--tab-hover-border': token('--color-dark-600'),
    // The custom SQL colour is for the tab you are looking at; an inactive tab stays neutral.
    '--tab-top-accent': theme.accent,
    '--tab-text': token('--color-dark-500'),
    '--tab-hover-text': token('--color-dark-200'),
    '--tab-active-surface': CANVAS,
    '--tab-active-text': ACTIVE_TEXT,
  } satisfies Record<string, string>;
}

/**
 * Computes the CSS variables for one workspace tab.
 *
 * The third parameter is either the custom SQL background or the light-mode flag — an older
 * signature the call sites still use.
 */
export function getTabThemeStyle(
  type: TabType,
  isActive: boolean,
  customSqlBgOrIsLight?: string | boolean,
  customSqlText?: string,
  _isLight = false
): Record<string, string> {
  const customSqlBg = typeof customSqlBgOrIsLight === 'string' ? customSqlBgOrIsLight : undefined;
  return tabStyle({ type, isActive, customSqlBg, customSqlText });
}
