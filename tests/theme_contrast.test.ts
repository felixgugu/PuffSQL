import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { DEFAULT_GRID_FONT_FAMILY, EDITOR_FONT_FAMILY_OPTIONS, GRID_FONT_FAMILY_OPTIONS } from '../src/data/fontOptions';
import { ACCENT_COLOR, DEFAULT_GLOBAL_FONT_FAMILY, DEFAULT_SURFACE, GLOBAL_FONT_OPTIONS, SURFACE_PALETTES, THEME_ROLE_COLORS, buildThemeTokens, themeManager } from '../src/services/themeManager';
import { migrateStoredSettings, useSettingsStore } from '../src/stores/settingsStore';
import { type TabType } from '../src/types/workspace';
import { contrastRatio, mixRgb, parseHexColor, relativeLuminance, resolveConnectionLabelColor, type RgbColor } from '../src/utils/connectionColor';
import { buildEditorTheme } from '../src/utils/editorThemeTokens';
import { TAB_CATEGORY_THEMES, getTabThemeStyle } from '../src/utils/tabTheme';
import { readSource } from './helpers/source';

describe('theme_contrast', () => {
const SURFACES = Object.keys(SURFACE_PALETTES);
const TEXT_STEPS = ['100', '200', '300', '400', '500'] as const;
const BACKGROUND_STEPS = ['750', '800', '850', '900'] as const;

function channelsToRgb(value: string): RgbColor {
  const [r, g, b] = value.trim().split(/\s+/).map(Number);
  return { r: r ?? 0, g: g ?? 0, b: b ?? 0 };
}

function tokensToRgba(hexOrChannels: string): RgbColor {
  const hex = parseHexColor(hexOrChannels);
  if (hex) return hex;
  return channelsToRgb(hexOrChannels);
}

function ratioForTokens(foreground: string, background: string): number {
  return contrastRatio(tokensToRgba(foreground), tokensToRgba(background));
}

test('every surface palette keeps the text steps at or above 4.5:1 in both colour modes', () => {
  for (const surface of SURFACES) {
    for (const mode of ['dark', 'light'] as const) {
      const tokens = buildThemeTokens(surface, mode);
      for (const step of TEXT_STEPS) {
        for (const background of BACKGROUND_STEPS) {
          const ratio = ratioForTokens(tokens[`--color-dark-${step}`]!, tokens[`--color-dark-${background}`]!);
          assert.ok(
            ratio >= 4.5,
            `${surface}/${mode}: dark-${step} on dark-${background} is ${ratio.toFixed(2)}:1`
          );
        }
      }
    }
  }
});

test('the separator step clears 3:1 as a non-text affordance and is never a body text colour', () => {
  for (const surface of SURFACES) {
    for (const mode of ['dark', 'light'] as const) {
      const tokens = buildThemeTokens(surface, mode);
      const ratio = ratioForTokens(tokens['--color-dark-600']!, tokens['--color-dark-900']!);
      assert.ok(ratio >= 3, `${surface}/${mode}: dark-600 on dark-900 is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('the light theme paints a white canvas with grey chrome, panels and hover rows below it', () => {
  const BELOW_CANVAS_STEPS = ['700', '750', '800', '850', '950'] as const;

  for (const surface of SURFACES) {
    const tokens = buildThemeTokens(surface, 'light');

    // The minimal design is light-first: the editor / grid / results canvas is pure white.
    assert.equal(
      tokens['--color-dark-900'],
      '255 255 255',
      `${surface}/light: the canvas must be white`
    );

    // Every other surface steps *down* from the canvas so full-screen grey stays comfortable,
    // and the raised overlay is white as well: it separates from the canvas through its 1px
    // outline and shadow, not by being brighter.
    for (const step of BELOW_CANVAS_STEPS) {
      const value = tokens[`--color-dark-${step}`]!;
      assert.notEqual(value, '255 255 255', `${surface}/light: dark-${step} must not be white`);
      assert.ok(
        relativeLuminance(tokensToRgba(value)) < 1,
        `${surface}/light: dark-${step} must sit below the white canvas`
      );
    }
    assert.equal(tokens['--color-raised'], '255 255 255');

    const chrome = relativeLuminance(tokensToRgba(tokens['--color-dark-850']!));
    const panel = relativeLuminance(tokensToRgba(tokens['--color-dark-800']!));
    const hover = relativeLuminance(tokensToRgba(tokens['--color-dark-750']!));

    // Panel headers sit between the canvas and the chrome; hover rows deepen past both so a
    // hovered row is always perceptible (the grid suite pins the numeric threshold).
    assert.ok(panel > chrome, `${surface}/light: panels must stay lighter than the chrome`);
    assert.ok(hover < chrome, `${surface}/light: hover rows must deepen past the chrome`);
  }
});

test('every floating surface resolves through the raised token instead of hardcoded white', () => {
  // SqPopover is the single source of the raised surface: menus, selects and every context menu
  // are built on it, so one assertion covers them all.
  assert.match(
    readSource('src/components/ui/SqPopover.vue'),
    /background-color: rgb\(var\(--color-raised\)\)/,
    'popovers, menus, selects and context menus all sit on SqPopover'
  );
  assert.match(
    readSource('src/components/ui/SqDialog.vue'),
    /background-color: rgb\(var\(--color-raised\)\)/,
    'a dialog is a floating layer too and uses the same surface'
  );
  assert.match(
    readSource('src/components/layout/AppSidebar.vue'),
    /bg-raised/,
    'the sidebar dropdown uses the same surface'
  );

  const css = readSource('src/assets/main.css');
  assert.doesNotMatch(
    css,
    /html:not\(\.dark\)[^{]*\{[^}]*background-color: #ffffff/,
    'the light theme must not hardcode white surfaces'
  );
  // The tooltip is the deliberate exception: SPEC §7 asks for one dark chip in both modes, with
  // #F2F4F7 text on #1F2328.
  assert.match(
    css,
    /\.sq-tooltip \{[\s\S]*?background-color: #1f2328;[\s\S]*?color: #f2f4f7;/,
    'the tooltip keeps its own fixed surface'
  );
});

test('role accent colours clear 4.5:1 on the light surfaces and on the dark surfaces', () => {
  const lightTokens = buildThemeTokens('slate', 'light');
  const darkTokens = buildThemeTokens('slate', 'dark');
  const lightSurfaces = ['--color-dark-900', '--color-dark-800'];
  const darkSurfaces = ['--color-dark-900', '--color-dark-750'];
  // Solid *fills* are not text colours: their contract is that the label drawn on top stays
  // legible (asserted below), not that the fill itself contrasts with the canvas.
  const FILL_ROLES = new Set(['accent-fill', 'accent-fill-hover']);

  for (const role of Object.keys(THEME_ROLE_COLORS)) {
    if (FILL_ROLES.has(role)) continue;
    for (const background of lightSurfaces) {
      const ratio = ratioForTokens(lightTokens[`--color-${role}`]!, lightTokens[background]!);
      assert.ok(ratio >= 4.5, `light ${role} on ${background} is ${ratio.toFixed(2)}:1`);
    }
    for (const background of darkSurfaces) {
      const ratio = ratioForTokens(darkTokens[`--color-${role}`]!, darkTokens[background]!);
      assert.ok(ratio >= 4.5, `dark ${role} on ${background} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('the solid accent fill keeps its white label legible in both modes', () => {
  const white = parseHexColor('#ffffff')!;

  for (const mode of ['light', 'dark'] as const) {
    const tokens = buildThemeTokens('slate', mode);
    for (const role of ['accent-fill', 'accent-fill-hover']) {
      const ratio = contrastRatio(white, tokensToRgba(tokens[`--color-${role}`]!));
      assert.ok(ratio >= 4.5, `${mode} white label on ${role} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('role accent colours stay readable on their own 15-25% status chip tints', () => {
  const lightTokens = buildThemeTokens('slate', 'light');
  const white = parseHexColor('#ffffff')!;
  // The 500 step of each hue is what the `bg-<hue>-500/15|25` status chips paint with.
  const hue500: Record<string, string> = {
    accent: '#3b82f6',
    ok: '#10b981',
    danger: '#f43f5e',
    warn: '#f59e0b',
    info: '#0ea5e9',
    plan: '#a855f7',
    er: '#06b6d4',
    structure: '#6366f1',
  };
  // Only the alphas the interface actually paints. Blue-family chips (accent / info) are the
  // strongest tint in the app at 25%, which is what the steel blue was tuned against.
  const chipAlphas: Record<string, number[]> = {
    accent: [0.25],
    ok: [0.15],
    danger: [0.15],
    warn: [0.15, 0.25],
    info: [0.25],
    plan: [0.15, 0.25],
    er: [0.15],
    structure: [0.15],
  };

  for (const [role, hue] of Object.entries(hue500)) {
    for (const alpha of chipAlphas[role]!) {
      const surface = mixRgb(white, parseHexColor(hue)!, alpha);
      const ratio = contrastRatio(tokensToRgba(lightTokens[`--color-${role}`]!), surface);
      assert.ok(
        ratio >= 4.5,
        `light ${role} on its ${alpha * 100}% tint is ${ratio.toFixed(2)}:1`
      );
    }
  }
});

test('role colour definitions stay in sync between themeManager and the stylesheet', () => {
  const css = readSource('src/assets/main.css');
  const darkBlock = /html\.dark,\s*\n\s*\.dark \{([\s\S]*?)\n {2}\}/.exec(css)?.[1] ?? '';
  const rootBlock = /:root \{([\s\S]*?)\n {2}\}/.exec(css)?.[1] ?? '';

  for (const [role, colors] of Object.entries(THEME_ROLE_COLORS)) {
    const darkRgb = channelsToRgb(colors.dark ? hexToChannels(colors.dark) : '0 0 0');
    const lightRgb = channelsToRgb(colors.light ? hexToChannels(colors.light) : '0 0 0');
    assert.match(
      darkBlock,
      new RegExp(`--color-${role}: ${darkRgb.r} ${darkRgb.g} ${darkRgb.b};`),
      `dark --color-${role} drifted from THEME_ROLE_COLORS`
    );
    assert.match(
      rootBlock,
      new RegExp(`--color-${role}: ${lightRgb.r} ${lightRgb.g} ${lightRgb.b};`),
      `light --color-${role} drifted from THEME_ROLE_COLORS`
    );
  }
});

function hexToChannels(hex: string): string {
  const rgb = parseHexColor(hex)!;
  return `${rgb.r} ${rgb.g} ${rgb.b}`;
}

test('tab category accents clear 3:1 on the tab strip in both modes', () => {
  // Inactive tabs are transparent over the chrome surface, so the tab strip *is* dark-850 — read
  // from the tokens rather than restated, so the strip and the check cannot drift apart.
  for (const mode of ['light', 'dark'] as const) {
    const strip = tokensToRgba(buildThemeTokens('slate', mode)['--color-dark-850']!);

    for (const theme of Object.values(TAB_CATEGORY_THEMES)) {
      const role = /var\(--color-([a-z-]+)\)/.exec(theme.accent)?.[1];
      assert.ok(role, `${theme.type} accent must be a role token`);
      const resolved = THEME_ROLE_COLORS[role!];
      assert.ok(resolved, `${role} must exist in THEME_ROLE_COLORS`);

      const ratio = contrastRatio(parseHexColor(resolved[mode])!, strip);
      assert.ok(ratio >= 3, `${theme.type} ${mode} accent is ${ratio.toFixed(2)}:1 on the tab strip`);
    }
  }
});

test('Monaco themes keep syntax and gutter colours readable', () => {
  for (const surface of SURFACES) {
    const dark = buildEditorTheme(surface, 'dark');
    // Monaco rejects hex strings without a leading '#' and silently falls back to #FF0000.
    for (const value of Object.values(dark.colors)) {
      assert.ok(
        /^#[0-9a-fA-F]{3,8}$/.test(value),
        `dark theme colour "${value}" must be a #-prefixed hex value`
      );
    }
    const darkBackground = parseHexColor(dark.colors['editor.background'])!;
    assert.ok(darkBackground, 'dark editor background must parse');
    for (const rule of dark.rules) {
      const ratio = contrastRatio(parseHexColor(`#${rule.foreground}`)!, darkBackground);
      assert.ok(ratio >= 4.5, `dark ${rule.token} on ${surface} is ${ratio.toFixed(2)}:1`);
    }
    assert.ok(
      contrastRatio(parseHexColor(dark.colors['editorLineNumber.foreground'])!, darkBackground) >= 3,
      `dark line numbers on ${surface} lost their 3:1 affordance`
    );

    const light = buildEditorTheme(surface, 'light');
    for (const value of Object.values(light.colors)) {
      assert.ok(
        /^#[0-9a-fA-F]{3,8}$/.test(value),
        `light theme colour "${value}" must be a #-prefixed hex value`
      );
    }
    const lightBackground = parseHexColor(light.colors['editor.background'])!;
    for (const rule of light.rules) {
      const ratio = contrastRatio(parseHexColor(`#${rule.foreground}`)!, lightBackground);
      assert.ok(ratio >= 4.5, `light ${rule.token} on ${surface} is ${ratio.toFixed(2)}:1`);
    }
    assert.ok(
      contrastRatio(parseHexColor(light.colors['editorLineNumber.foreground'])!, lightBackground) >= 3,
      `light line numbers on ${surface} lost their 3:1 affordance`
    );
  }
});

test('connection labels stay readable in light mode without touching the stored colour', () => {
  const presets = ['#ef4444', '#f97316', '#eab308', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
  // Read the surface the label actually sits on instead of pinning a hex that can drift.
  const panelSurface = tokensToRgba(buildThemeTokens('slate', 'light')['--color-dark-800']!);

  for (const preset of presets) {
    assert.equal(resolveConnectionLabelColor(preset, 'dark'), preset, 'dark mode keeps the raw colour');
    const light = resolveConnectionLabelColor(preset, 'light')!;
    const ratio = contrastRatio(parseHexColor(light)!, panelSurface);
    assert.ok(ratio >= 4.5, `${preset} -> ${light} is ${ratio.toFixed(2)}:1 on the light panel`);
  }

  assert.equal(resolveConnectionLabelColor(undefined, 'light'), undefined);
  assert.equal(resolveConnectionLabelColor('not-a-colour', 'light'), 'not-a-colour');
});

const GRID_THEME_CSS = 'src/styles/tabulatorTheme.css';

function readGridTheme(): string {
  return readSource(GRID_THEME_CSS);
}

function readGridBlock(css: string, mode: 'dark' | 'light'): string {
  const selector = mode === 'dark' ? 'html\\.dark \\.tabulator' : 'html:not\\(\\.dark\\) \\.tabulator';
  return new RegExp(`${selector} \\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? '';
}

function readGridVar(block: string, name: string): string {
  return new RegExp(`--${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim() ?? '';
}

/**
 * Grid backgrounds and text are declared as references to the app's semantic tokens
 * (`rgb(var(--color-dark-800))`) so they follow the selected surface palette, so every grid
 * contrast check has to resolve them against that palette first.
 */
function resolveGridColor(value: string, tokens: Record<string, string>): RgbColor {
  const reference = /^rgb\(var\((--[a-z0-9-]+)\)\)$/.exec(value)?.[1];
  if (!reference) return tokensToRgba(value);
  const resolved = tokens[reference];
  assert.ok(resolved, `grid colour "${value}" must resolve to a declared token`);
  return tokensToRgba(resolved!);
}

test('tabulator surfaces are driven by the app colour tokens in both themes', () => {
  const css = readGridTheme();

  for (const mode of ['dark', 'light'] as const) {
    const block = readGridBlock(css, mode);
    assert.ok(block.length > 0, `the ${mode} grid block must exist`);

    // The grid canvas, chrome and separators are the shell's surfaces, not a fixed zinc ramp, so
    // changing the surface palette re-tones the grid together with the rest of the app. Row lines
    // ride the hairline step and hover rows the hover step, which is what keeps a hovered even row
    // readable now that the light panel sits next to white.
    assert.match(block, /--sq-grid-bg: rgb\(var\(--color-dark-900\)\)/, `${mode} grid canvas`);
    assert.match(block, /--sq-grid-header-bg: rgb\(var\(--color-dark-850\)\)/, `${mode} header`);
    assert.match(
      block,
      /--sq-grid-header-hover: rgb\(var\(--color-dark-750\)\)/,
      `${mode} header hover`
    );
    assert.match(block, /--sq-grid-border: rgb\(var\(--color-dark-700\)\)/, `${mode} border`);
    assert.match(block, /--sq-grid-line: rgb\(var\(--color-dark-700\)\)/, `${mode} row separator`);
    assert.match(block, /--sq-grid-row-hover: rgb\(var\(--color-dark-750\)\)/, `${mode} row hover`);

    // Text resolves through the ramp the token suite already proves at >= 4.5:1.
    assert.match(block, /--sq-grid-fg: rgb\(var\(--color-dark-300\)\)/, `${mode} body text`);
    assert.match(block, /--sq-grid-muted: rgb\(var\(--color-dark-500\)\)/, `${mode} muted text`);
    assert.match(
      block,
      /--sq-grid-header-text: rgb\(var\(--color-dark-500\)\)/,
      `${mode} header text`
    );

    // Zebra striping is a real surface in both modes; the dark theme used to opt out of it.
    assert.match(
      block,
      /--sq-grid-row-stripe: rgb\(var\(--color-dark-850\)\)/,
      `${mode} zebra stripe`
    );
    assert.doesNotMatch(
      block,
      /--sq-grid-row-stripe:\s*transparent/,
      `${mode} zebra stripe must paint a surface`
    );
  }
});

test('tabulator value styling keeps its contrast on every surface palette', () => {
  const css = readGridTheme();
  const amber = parseHexColor('#f59e0b')!;

  for (const surface of SURFACES) {
    for (const mode of ['dark', 'light'] as const) {
      const block = readGridBlock(css, mode);
      const tokens = buildThemeTokens(surface, mode);
      const gridColor = (name: string) => resolveGridColor(readGridVar(block, name), tokens);
      const label = `${surface}/${mode}`;

      const bg = gridColor('sq-grid-bg');
      const header = gridColor('sq-grid-header-bg');
      const hover = gridColor('sq-grid-row-hover');
      const stripe = gridColor('sq-grid-row-stripe');

      // The value-dependent accents stay literal colours, so they are the part the token ramp
      // cannot vouch for. They are painted on the canvas and - since the zebra stripe landed - on
      // every second row as well.
      for (const [name, value] of [
        ['bool true', gridColor('sq-grid-bool-true-accent')],
        ['bool false', gridColor('sq-grid-bool-false-accent')],
        ['binary', gridColor('sq-grid-binary-accent')],
      ] as const) {
        for (const [backgroundName, background] of [
          ['canvas', bg],
          ['stripe', stripe],
        ] as const) {
          const ratio = contrastRatio(value, background);
          assert.ok(
            ratio >= 4.5,
            `${label}: ${name} on the ${backgroundName} is ${ratio.toFixed(2)}:1`
          );
        }
      }

      // The sort arrow is a non-text affordance sitting on the header surface.
      const sortArrow = contrastRatio(gridColor('sq-grid-sort-icon'), header);
      assert.ok(sortArrow >= 3, `${label}: sort arrow on the header is ${sortArrow.toFixed(2)}:1`);

      // The modified-cell tint is translucent, so measure the composed colour over every row
      // surface the cell can sit on (rgba(245,158,11,0.15) composited over the row colour).
      const modifiedText = gridColor('sq-grid-modified-text');
      for (const [surfaceName, background] of [
        ['canvas', bg],
        ['stripe', stripe],
        ['hover', hover],
      ] as const) {
        const ratio = contrastRatio(modifiedText, mixRgb(background, amber, 0.15));
        assert.ok(
          ratio >= 4.5,
          `${label}: modified text on the ${surfaceName} is ${ratio.toFixed(2)}:1`
        );
      }

      // The zebra stripe has to be perceptible without turning into a high-contrast band, and a
      // hovered even row still has to read as hovered.
      const stripeOnCanvas = contrastRatio(stripe, bg);
      assert.ok(
        stripeOnCanvas >= 1.04 && stripeOnCanvas <= 1.6,
        `${label}: the zebra stripe is ${stripeOnCanvas.toFixed(3)}:1 against the canvas`
      );
      const hoverOnStripe = contrastRatio(hover, stripe);
      assert.ok(
        hoverOnStripe >= 1.04,
        `${label}: the row hover is ${hoverOnStripe.toFixed(3)}:1 against the stripe`
      );
    }
  }

  const sortOpacity =
    /\[aria-sort='none'\][\s\S]*?\.tabulator-col-sorter \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.doesNotMatch(
    sortOpacity,
    /opacity/,
    'the inactive sort arrow must not fade below its measured contrast'
  );
});

test('the grid selection palette is declared per mode and consumed through its variables', () => {
  const css = readGridTheme();

  const dark = readGridBlock(css, 'dark');
  assert.match(dark, /--sq-grid-range-fill: rgba\(140, 184, 218, 0\.20\)/, 'dark selection area tint');
  assert.match(dark, /--sq-grid-range-active-fill: rgba\(140, 184, 218, 0\.38\)/, 'dark active cell tint');
  assert.match(dark, /--sq-grid-range-border: #8cb8da/, 'dark selection border');
  assert.match(dark, /--sq-grid-range-handle: #8cb8da/, 'dark drag handle');
  assert.match(dark, /--sq-grid-range-text: #ffffff/, 'dark selection text');

  const light = readGridBlock(css, 'light');
  assert.match(light, /--sq-grid-range-fill: rgba\(42, 103, 145, 0\.08\)/, 'light selection area tint');
  assert.match(light, /--sq-grid-range-border: #2a6791/, 'light selection border');
  assert.match(light, /--sq-grid-range-handle: #2a6791/, 'light drag handle');

  // The rules that consume the variables are mode independent.
  const cellRule =
    /\.tabulator-row \.tabulator-cell\.tabulator-range-selected \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(cellRule, /background-color: var\(--sq-grid-range-fill\)/);
  assert.match(cellRule, /color: var\(--sq-grid-range-text\)/);

  const outlineRule =
    /\.tabulator-range-overlay \.tabulator-range \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(outlineRule, /border: var\(--sq-grid-range-border-width\) solid var\(--sq-grid-range-border\)/);

  const activeRule = /\.tabulator-range-cell-active \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(activeRule, /background-color: var\(--sq-grid-range-active-fill\)/);
  assert.match(activeRule, /border: 2px solid var\(--sq-grid-range-border\)/);

  const handleRule =
    /\.tabulator-range\.tabulator-range-active::after \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(handleRule, /width: 4px;/, 'the drag handle is a 4x4 square');
  assert.match(handleRule, /height: 4px;/);
  assert.match(handleRule, /border-radius: 0;/);
  assert.match(handleRule, /background-color: var\(--sq-grid-range-handle\)/);
});

test('the light grid palette keeps its sort affordance and value accents', () => {
  const css = readGridTheme();
  const light = readGridBlock(css, 'light');

  // The sort arrow is the only sort affordance, and the token test above measures its contrast.
  assert.match(light, /--sq-grid-sort-icon: #64748b/);
  assert.match(light, /--sq-grid-sort-icon-hover: #1e293b/);

  // Structural rules that ride the palette instead of restating a colour.
  assert.match(
    css,
    /\.tabulator \.tabulator-header,\s*\n\.tabulator \.tabulator-footer \{\s*\n\s*border-color: var\(--sq-grid-border\)/,
    'the header must keep the 1px structural line'
  );
  assert.match(css, /\.tabulator-row:hover \{\s*\n\s*background-color: var\(--sq-grid-row-hover\)/);

  // Accents that read as neon on white get solid, contrast-safe replacements.
  assert.match(light, /--sq-grid-pk-accent: #b45309/);
  assert.match(light, /--sq-grid-identity-accent: #0e7490/);
  assert.match(light, /--sq-grid-type-accent: #0369a1/);
  assert.match(light, /--sq-grid-fulltype-accent: #047857/);
});

test('boolean values render as theme aware pills', () => {
  const columns = readSource('src/utils/tabulatorColumns.ts');
  assert.match(columns, /sqlight-bool-badge \$\{value \? 'sqlight-bool-true' : 'sqlight-bool-false'\}/);

  const css = readGridTheme();
  const truePill = /html:not\(\.dark\) \.sqlight-bool-badge\.sqlight-bool-true \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(truePill, /border: 1px solid #a7f3d0/);
  assert.match(truePill, /background-color: #ecfdf5/);
  assert.match(truePill, /color: #059669/);

  const falsePill = /html:not\(\.dark\) \.sqlight-bool-badge\.sqlight-bool-false \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(falsePill, /background-color: #e2e8f0/);
  assert.match(falsePill, /color: #475569/);

  // The structure viewer badges get the same treatment.
  for (const [selector, background, text] of [
    ['\\.sqlight-badge-pk', '#fffbeb', '#b45309'],
    ['\\.sqlight-badge-yes', '#ecfdf5', '#059669'],
    ['\\.sqlight-badge-no', '#e2e8f0', '#475569'],
    ['\\.sqlight-badge-identity', '#ecfeff', '#0e7490'],
  ] as const) {
    const rule = new RegExp(`html:not\\(\\.dark\\) ${selector} \\{([\\s\\S]*?)\\n\\}`, 'g').exec(css)?.[1] ?? '';
    assert.match(rule, new RegExp(`background-color: ${background}`), `${selector} background`);
    assert.match(rule, new RegExp(`color: ${text}`), `${selector} text colour`);
  }
});

test('index.html resolves the persisted colour mode before first paint', () => {
  const html = readSource('index.html');
  assert.match(html, /sqlight_app_settings/);
  assert.match(html, /classList\.toggle\('dark'/);
  assert.match(html, /style\.colorScheme/);
});

test('the stylesheet declares a colour-scheme for both modes', () => {
  const css = readSource('src/assets/main.css');
  assert.match(css, /color-scheme: light/);
  assert.match(css, /color-scheme: dark/);
});
});

describe('theme_settings', () => {
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

  const source = readSource('src/services/themeManager.ts');
  assert.doesNotMatch(source, /@primevue\/themes|usePreset|updatePrimaryPalette|updateSurfacePalette/);
});

test('themeManager: exactly one surface palette ships, with a complete 50-950 scale', () => {
  assert.deepEqual(Object.keys(SURFACE_PALETTES), [DEFAULT_SURFACE]);

  const ramp = SURFACE_PALETTES[DEFAULT_SURFACE]!;
  for (const tone of ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']) {
    assert.match(ramp[tone as keyof typeof ramp] ?? '', /^#[0-9a-f]{6}$/, `tone ${tone} is defined`);
  }

  // The four other hues are gone from the file, not merely hidden from the picker.
  const source = readSource('src/services/themeManager.ts');
  for (const gone of ['slate', 'gray', 'zinc', 'stone']) {
    assert.ok(!source.includes(`'${gone}'`), `the ${gone} palette must be deleted`);
  }
});

test('a settings file that still names a removed surface falls back to the shipped one', () => {
  const migrated = migrateStoredSettings({ colorMode: 'dark', surfaceColor: 'zinc' });

  assert.equal('surfaceColor' in migrated, false, 'the old palette name is dropped');
  assert.equal(migrated.colorMode, 'dark', 'the rest of the settings survive');
});
});

describe('tab_category_colors', () => {
const ALL_TAB_TYPES: TabType[] = [
  'sql_editor',
  'table_data',
  'table_structure',
  'execution_plan',
  'er_diagram',
];

/** Reads the role name out of an `rgb(var(--color-ok))` style reference. */
function roleOf(value: string): string {
  const match = /var\(--color-([a-z-]+)\)/.exec(value);
  assert.ok(match, `${value} must reference a colour token`);
  return match[1]!;
}

test('each workspace tab type is distinct, and every accent is a role token', () => {
  assert.equal(Object.keys(TAB_CATEGORY_THEMES).length, 5);

  const accents = new Set<string>();
  for (const type of ALL_TAB_TYPES) {
    const theme = TAB_CATEGORY_THEMES[type];
    assert.ok(theme, `Theme for ${type} must exist`);
    assert.equal(theme.type, type);
    assert.ok(theme.label, `Label for ${type} must exist`);

    assert.match(theme.accent, /^rgb\(var\(--color-[a-z-]+\)\)$/, `${type} accent must be a token`);
    assert.ok(
      THEME_ROLE_COLORS[roleOf(theme.accent)],
      `${type} accent must resolve in the theme role table`
    );
    accents.add(theme.accent);
  }

  assert.equal(accents.size, 5, 'All 5 categories must stay visually distinct');
});

test('the category palette holds no raw colour values', () => {
  const source = readSource('src/utils/tabTheme.ts');
  // The one exception is the sentinel for a legacy saved setting.
  const hexes = [...source.matchAll(/#[0-9a-fA-F]{3,8}/g)].map((match) => match[0]);
  assert.deepEqual(hexes, ['#1e40af'], 'only the legacy-default sentinel may be a literal');
  assert.doesNotMatch(source, /--p-primary-color/, 'PrimeVue theme variables are gone');
});

test('inactive tabs are neutral chrome so the accent stays the only colour signal', () => {
  for (const type of ALL_TAB_TYPES) {
    const style = getTabThemeStyle(type, false);
    assert.equal(style['--tab-bg'], 'transparent');
    assert.equal(style['--tab-border'], 'rgb(var(--color-dark-700))');
    assert.equal(style['--tab-text'], 'rgb(var(--color-dark-500))');
    assert.equal(style['--tab-hover-bg'], 'rgb(var(--color-dark-750))');
    assert.equal(style['--tab-hover-text'], 'rgb(var(--color-dark-200))');
    // The category only shows while the tab is the one you are looking at.
    assert.equal(style['--tab-top-accent'], TAB_CATEGORY_THEMES[type].accent);
  }
});

test('an active tab is canvas plus its own accent, never a coloured block', () => {
  for (const type of ALL_TAB_TYPES) {
    const style = getTabThemeStyle(type, true);
    assert.equal(style['--tab-active-surface'], 'rgb(var(--color-dark-900))');
    assert.equal(style['--tab-active-text'], 'rgb(var(--color-dark-100))');
    assert.equal(style['--tab-border'], TAB_CATEGORY_THEMES[type].accent);
    assert.equal(style['--tab-top-accent'], TAB_CATEGORY_THEMES[type].accent);
  }
});

test('the custom SQL tab colour overrides that tab only', () => {
  const customBg = '#4338ca';
  const customText = '#fef08a';

  const activeSqlStyle = getTabThemeStyle('sql_editor', true, customBg, customText);
  assert.equal(activeSqlStyle['--tab-active-surface'], customBg);
  assert.equal(activeSqlStyle['--tab-active-text'], customText);
  assert.equal(activeSqlStyle['--tab-border'], customBg);

  // Other categories are not the user's to paint, and a custom colour never reaches an inactive tab.
  assert.equal(
    getTabThemeStyle('table_data', true, customBg, customText)['--tab-active-surface'],
    'rgb(var(--color-dark-900))'
  );
  assert.equal(
    getTabThemeStyle('sql_editor', false, customBg, customText)['--tab-top-accent'],
    TAB_CATEGORY_THEMES.sql_editor.accent
  );

  // A saved setting still holding the old default means "no custom colour".
  assert.equal(
    getTabThemeStyle('sql_editor', true, '#1e40af')['--tab-active-surface'],
    'rgb(var(--color-dark-900))'
  );
});

test('the active tab wears its accent on the top, left and right border in both tab strips', () => {
  // One contract for the editor strip and the result strip: only the active tab takes the
  // theme/connection accent, it takes it on three sides, and its bottom merges into the panel.
  for (const [file, item] of [
    ['src/components/layout/AppMain.vue', 'query-tab-item'],
    ['src/components/layout/AppBottomPanel.vue', 'result-tab-item'],
  ] as const) {
    const source = readSource(file);
    for (const side of ['top', 'left', 'right']) {
      assert.match(
        source,
        new RegExp(`\\.${item}\\.active-tab\\s*\\{[\\s\\S]*?border-${side}-color:\\s*var\\(--tab-top-accent[\\s\\S]*?!important`),
        `${item}: the active tab must take the accent on its ${side} border`
      );
    }
  }

  const panelSrc = readSource('src/components/layout/AppBottomPanel.vue');
  assert.match(
    panelSrc,
    /queryStore\.activeResultTabId === rtab\.id\s*\?\s*'[^']*active-tab[^']*'/,
    'the active result tab must receive the active-tab class'
  );
  // The result strip additionally merges its active tab into the panel below it.
  assert.match(
    panelSrc,
    /\.result-tab-item\.active-tab\s*\{[\s\S]*?border-bottom-color:\s*transparent\s*!important/,
    'the bottom border must go transparent so the tab merges into the panel'
  );
  assert.match(
    panelSrc,
    /\.result-tab-item\.active-tab\s*\{[\s\S]*?margin-bottom:\s*-1px/,
    'the tab must overlap the panel by 1px'
  );
  assert.match(panelSrc, /getResultTabTopAccent/, 'the theme/connection accent is resolved by a helper');
  assert.match(panelSrc, /getResultTabConnectionColor/, 'a connection colour overrides the theme accent');
  assert.match(panelSrc, /borderLeftColor:\s*topAccent/);
  assert.match(panelSrc, /borderRightColor:\s*topAccent/);
});
});
