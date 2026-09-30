import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SURFACE_PALETTES,
  THEME_ROLE_COLORS,
  buildThemeTokens,
} from '../src/services/themeManager';
import { buildEditorTheme } from '../src/utils/editorThemeTokens';
import { TAB_CATEGORY_THEMES } from '../src/utils/tabTheme';
import {
  contrastRatio,
  mixRgb,
  parseHexColor,
  relativeLuminance,
  resolveConnectionLabelColor,
  type RgbColor,
} from '../src/utils/connectionColor';

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

test('the light theme paints a soft grey canvas instead of pure white', () => {
  const SURFACE_STEPS = ['700', '750', '800', '850', '900', '950'] as const;

  for (const surface of SURFACES) {
    const tokens = buildThemeTokens(surface, 'light');
    for (const step of SURFACE_STEPS) {
      assert.notEqual(
        tokens[`--color-dark-${step}`],
        '255 255 255',
        `${surface}/light: dark-${step} must not be pure white`
      );
    }

    const canvas = relativeLuminance(tokensToRgba(tokens['--color-dark-900']!));
    const raised = relativeLuminance(tokensToRgba(tokens['--color-raised']!));
    const chrome = relativeLuminance(tokensToRgba(tokens['--color-dark-850']!));
    const panel = relativeLuminance(tokensToRgba(tokens['--color-dark-800']!));

    // A full-screen #ffffff canvas (luminance 1.0) is the glare the light theme avoids; the
    // chrome, panel and row steps stay below the canvas and only the raised overlay sits above it.
    assert.ok(canvas <= 0.93, `${surface}/light: canvas is too bright (${canvas.toFixed(3)})`);
    assert.ok(raised > canvas, `${surface}/light: the raised overlay must sit above the canvas`);
    assert.ok(chrome < canvas, `${surface}/light: chrome must stay below the canvas`);
    assert.ok(panel < chrome, `${surface}/light: panels must stay below the chrome`);
  }
});

test('light-mode overlays and popups use the raised token instead of hardcoded white', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf-8');

  for (const rule of [
    /html:not\(\.dark\) \.p-select-overlay \{[\s\S]*?background-color: rgb\(var\(--color-raised\)\)/,
    /html:not\(\.dark\) \.p-contextmenu,\s*\nhtml:not\(\.dark\) \.p-menu \{[\s\S]*?background-color: rgb\(var\(--color-raised\)\)/,
    /html:not\(\.dark\) \.p-tooltip \.p-tooltip-text \{[\s\S]*?background-color: rgb\(var\(--color-raised\)\)/,
  ]) {
    assert.match(css, rule, 'light overlay surfaces must resolve through --color-raised');
  }

  assert.doesNotMatch(
    css,
    /html:not\(\.dark\)[^{]*\{[^}]*background-color: #ffffff/,
    'the light theme must not hardcode white surfaces'
  );
});

test('role accent colours clear 4.5:1 on the light surfaces and on the dark surfaces', () => {
  const lightTokens = buildThemeTokens('slate', 'light');
  const darkTokens = buildThemeTokens('slate', 'dark');
  const lightSurfaces = ['--color-dark-900', '--color-dark-800'];
  const darkSurfaces = ['--color-dark-900', '--color-dark-750'];

  for (const role of Object.keys(THEME_ROLE_COLORS)) {
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

  for (const [role, hue] of Object.entries(hue500)) {
    for (const alpha of [0.15, 0.25]) {
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
  const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf-8');
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

test('inactive workspace tabs keep 3:1 icons in light mode', () => {
  // Composite of the inactive light tab background (rgba(226,232,240,0.45)) over the light
  // chrome surface (--color-dark-850 = #e9eef4).
  const tabStripSurface = { r: 230, g: 235, b: 242 };
  for (const theme of Object.values(TAB_CATEGORY_THEMES)) {
    const ratio = contrastRatio(parseHexColor(theme.iconColorLight)!, tabStripSurface);
    assert.ok(ratio >= 3, `${theme.type} light icon is ${ratio.toFixed(2)}:1`);

    const darkRatio = contrastRatio(parseHexColor(theme.iconColor)!, parseHexColor('#252530')!);
    assert.ok(darkRatio >= 3, `${theme.type} dark icon is ${darkRatio.toFixed(2)}:1`);
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
  const panelSurface = parseHexColor('#e2e8f0')!;

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
  return readFileSync(resolve(process.cwd(), GRID_THEME_CSS), 'utf-8');
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
    // changing the surface palette re-tones the grid together with the rest of the app.
    assert.match(block, /--sq-grid-bg: rgb\(var\(--color-dark-900\)\)/, `${mode} grid canvas`);
    assert.match(block, /--sq-grid-header-bg: rgb\(var\(--color-dark-850\)\)/, `${mode} header`);
    assert.match(
      block,
      /--sq-grid-header-hover: rgb\(var\(--color-dark-800\)\)/,
      `${mode} header hover`
    );
    assert.match(block, /--sq-grid-border: rgb\(var\(--color-dark-700\)\)/, `${mode} border`);
    assert.match(block, /--sq-grid-line: rgb\(var\(--color-dark-800\)\)/, `${mode} row separator`);
    assert.match(block, /--sq-grid-row-hover: rgb\(var\(--color-dark-800\)\)/, `${mode} row hover`);

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

test('index.html resolves the persisted colour mode before first paint', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');
  assert.match(html, /sqlight_app_settings/);
  assert.match(html, /classList\.toggle\('dark'/);
  assert.match(html, /style\.colorScheme/);
});

test('the stylesheet declares a colour-scheme for both modes', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf-8');
  assert.match(css, /color-scheme: light/);
  assert.match(css, /color-scheme: dark/);
});
