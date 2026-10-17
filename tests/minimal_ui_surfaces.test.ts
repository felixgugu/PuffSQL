import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { readCode, readSource, repoRoot, trackedSources } from './helpers/source';

describe('minimal_ui_surfaces', () => {
/**
 * The ER canvas and the execution-plan canvas draw *content*: a note or a table box is an object
 * on a diagram, and its shadow is what separates it from the diagram behind it. Everything else
 * is app chrome and follows SPEC §6.
 */
const CANVAS_CONTENT = [
  'src/components/editor/ErTextNode.vue',
  'src/components/editor/ErTableNode.vue',
  'src/components/editor/ExecutionPlanViewer.vue',
];

describe('the minimal surface rules hold across src', () => {
  test('radius is only ever 3, 4 or 6px (plus deliberate squares)', () => {
    const offenders: string[] = [];
    for (const file of trackedSources()) {
      const source = readSource(file);
      const matches = source.match(/\brounded-(sm|lg|xl|2xl|3xl)\b/g) ?? [];
      if (matches.length > 0) offenders.push(`${file}: ${matches.join(', ')}`);
    }

    assert.deepEqual(offenders, [], 'SPEC §6 allows 3 / 4 / 6px radii only');
  });

  test('shadows are only the two tokens, and only on floating layers', () => {
    const offenders: string[] = [];
    for (const file of trackedSources()) {
      if (CANVAS_CONTENT.includes(file)) continue;
      const source = readSource(file);
      const matches = source.match(/\bshadow-(2xl|xl|lg|md|sm|xs|inner)\b/g) ?? [];
      if (matches.length > 0) offenders.push(`${file}: ${matches.join(', ')}`);
    }

    assert.deepEqual(offenders, [], 'SPEC §6 allows only shadow-raised and shadow-overlay');
  });

  test('no status text falls back to a raw Tailwind hue', () => {
    // `text-emerald-400` on a 10% tint is ~1.9:1 in light mode. Semantic text goes through the
    // role tokens, whose light values are chosen to clear 4.5:1 on those same tints.
    const offenders: string[] = [];
    for (const file of trackedSources()) {
      const source = readSource(file);
      const matches = source.match(
        /\btext-(emerald|rose|amber|sky|purple|indigo|green|red|blue|violet)-[0-9]{2,3}\b/g
      ) ?? [];
      if (matches.length > 0) offenders.push(`${file}: ${matches.join(', ')}`);
    }

    assert.deepEqual(offenders, [], 'status text uses --color-ok / --color-warn / --color-danger');
  });
});

/**
 * Tailwind's default spacing scale. A class like `py-0.2` or `w-4.5` looks plausible and renders
 * nothing at all, which is how the Quick Object Finder's keycaps and the settings swatch silently
 * lost their padding and size.
 */
const SPACING_STEPS = new Set([
  '0', 'px', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11',
  '12', '14', '16', '20', '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72',
  '80', '96',
]);

const SPACING_PREFIXES = [
  'gap', 'gap-x', 'gap-y', 'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr',
  'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr', 'space-x', 'space-y',
];

/** Width/height utilities accept the spacing steps *and* Tailwind's named sizes. */
const SIZE_PREFIXES = ['w', 'h', 'min-w', 'min-h', 'max-w', 'max-h', 'size'];

const ALLOWED_NON_STEP = new Set([
  'auto', 'full', 'screen', 'min', 'max', 'fit', 'none', 'px',
  'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl',
  'dvh', 'svh', 'lvh', 'prose',
]);

describe('every utility class actually exists', () => {
  test('spacing and sizing utilities use real Tailwind steps', () => {
    const pattern = new RegExp(
      `(?<![\\w-])(?:${[...SPACING_PREFIXES, ...SIZE_PREFIXES].join('|')})-([a-z0-9./\\[\\]]+)\\b`,
      'g'
    );
    const offenders: string[] = [];

    for (const file of trackedSources()) {
      const source = readCode(file);
      const seen = new Set<string>();
      for (const match of source.matchAll(pattern)) {
        const value = match[1]!;
        // Arbitrary values, fractions, breakpoint prefixes and CSS variables are all deliberate.
        if (value.includes('[') || value.includes('/') || value.includes('$')) continue;
        if (ALLOWED_NON_STEP.has(value) || SPACING_STEPS.has(value)) continue;
        if (seen.has(match[0])) continue;
        seen.add(match[0]);
        offenders.push(`${file}: ${match[0]}`);
      }
    }

    assert.deepEqual(offenders, [], 'these classes generate no CSS at all');
  });
});

describe('no glass, no gradient, no translucent chrome', () => {
  test('nothing blurs what is behind it', () => {
    const offenders: string[] = [];
    for (const file of trackedSources()) {
      if (file.endsWith('.css')) continue;
      const source = readSource(file);
      if (/\bbackdrop-blur/.test(source)) offenders.push(file);
    }

    assert.deepEqual(offenders, [], 'SPEC §7: no glass effect anywhere in the app');
  });

  test('no gradient utilities are used', () => {
    const offenders: string[] = [];
    for (const file of trackedSources()) {
      const source = readSource(file);
      const matches = source.match(/\bbg-gradient-to-[a-z]+\b|\bbg-linear-[0-9]+\b/g) ?? [];
      if (matches.length > 0) offenders.push(`${file}: ${matches.join(', ')}`);
    }

    assert.deepEqual(offenders, [], 'SPEC §12: no gradients');
  });

  test('surfaces are opaque, not 80–99% translucent', () => {
    // A 90% surface is not glass on its own, but its contrast then depends on whatever sits behind
    // it, which is the property the spec rules out: layers separate by a 1px border, not by alpha.
    const offenders: string[] = [];
    for (const file of trackedSources()) {
      const source = readSource(file);
      const matches = source.match(/\bbg-[a-z0-9-]+\/(?:8[0-9]|9[0-9])\b/g) ?? [];
      if (matches.length > 0) offenders.push(`${file}: ${[...new Set(matches)].join(', ')}`);
    }

    assert.deepEqual(offenders, [], 'surfaces use a token colour, not alpha');
  });
});

describe('the PrimeVue dependency is gone', () => {
  test('nothing in src imports it', () => {
    const offenders: string[] = [];
    for (const file of trackedSources()) {
      const source = readSource(file);
      if (/from '(@?primevue[^']*)'/.test(source)) offenders.push(file);
    }
    assert.deepEqual(offenders, [], 'the PrimeVue migration is finished, not paused');
  });

  test('package.json no longer declares it', () => {
    const pkg = JSON.parse(readSource('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ].filter((name) => name.includes('primevue') || name.includes('primeuix'));
    assert.deepEqual(declared, [], 'no PrimeVue package may stay in the manifest');
  });

  test('no stylesheet rule targets a PrimeVue component class', () => {
    // `main.css` used to carry ~130 lines of `.p-*` overrides fighting the theme engine.
    const css = readSource('src/assets/main.css');
    const matches = css.match(/^\.[\w-]*\.p-[a-z-]+|^\.p-[a-z-]+/gm) ?? [];
    assert.deepEqual(matches, [], 'the app owns its own component classes now');
  });
});

describe('type and imagery follow the brief', () => {
  test('SQL and data values are monospace while chrome follows the configurable UI font', () => {
    // Data cells come from the grid's own font variable, which the settings dialog can point at a
    // different monospace family without touching the UI font.
    assert.match(
      readSource('src/styles/tabulatorTheme.css'),
      /font-family: var\(--sqlight-grid-font, ui-monospace[^)]*monospace\)/,
      'grid cells are monospace'
    );
    assert.match(
      readSource('src/components/results/ResultMessages.vue'),
      /font-mono/,
      'the messages panel is monospace'
    );
    for (const file of [
      'src/components/editor/TableDataViewer.vue',
      'src/components/editor/TableStructureViewer.vue',
      'src/components/modals/ExportSchemaModal.vue',
      'src/components/results/ExecutionStatsViewer.vue',
    ]) {
      assert.match(readSource(file), /font-mono/, `${file} shows SQL or data and must be monospace`);
    }
    assert.match(
      readSource('src/components/editor/MonacoEditor.vue'),
      /fontFamily: settingsStore\.editorFontFamily/,
      'the editor uses its own monospace setting'
    );

    // The chrome is the other half of the rule: it must follow --app-font-sans, never a pin.
    assert.match(readSource('tailwind.config.js'), /sans: \['var\(--app-font-sans\)'\]/);
    for (const file of [
      'src/components/layout/AppSidebar.vue',
      'src/components/layout/SqlFolderExplorer.vue',
      'src/components/editor/ErTableNode.vue',
      'src/components/editor/ErDiagramViewer.vue',
    ]) {
      assert.doesNotMatch(readSource(file), /font-mono/, `${file} is chrome, not data`);
    }
  });

  test('there is no decorative imagery beyond the brand mark', () => {
    // The brief rules out large decorative illustrations. The only images in the app are the
    // product mark and the preview of the background picture the user picked themselves.
    const ALLOWED = new Set([
      'src/components/layout/AppHeader.vue',
      'src/components/modals/SettingsModal.vue',
      'src/components/modals/settings/EditorBackgroundSettings.vue',
    ]);

    for (const file of trackedSources()) {
      if (!file.endsWith('.vue')) continue;
      if (!/<img\b/.test(readCode(file))) continue;
      assert.ok(ALLOWED.has(file), `${file} renders an image; the brief allows no illustrations`);
    }
  });

  test('numeric chrome uses tabular figures so counts do not jitter as they change', () => {
    // The grid strips out its data as monospace, so the numbers that still live in the UI font are
    // the ones that need this: a status bar whose SPID and latency reflow on every keystroke, a
    // results footer whose row count ticks up during a query, and the tab strips' counters.
    for (const [file, marker] of [
      ['src/components/layout/AppStatusBar.vue', 'tabular-nums'],
      ['src/components/results/ResultGridItem.vue', 'tabular-nums'],
      ['src/components/layout/AppBottomPanel.vue', 'tabular-nums'],
      ['src/components/layout/AppMain.vue', 'tabular-nums'],
    ] as const) {
      assert.match(readSource(file), new RegExp(marker), `${file} shows changing numbers`);
    }
  });

  test('the only gradient-like rules left are functional patterns', () => {
    const offenders: string[] = [];
    for (const file of trackedSources()) {
      if (!/\.(vue|css)$/.test(file)) continue;
      const source = readCode(file);
      if (/linear-gradient|radial-gradient/.test(source) && !PATTERN_FILES.has(file)) {
        offenders.push(file);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'a transparency checkerboard and the execution plan dot grid are the only two allowed'
    );
  });
});

/**
 * `.sqlight-checkerboard` shows a transparent PNG's alpha; `.plan-scroll-*` is the graph-paper
 * dot grid behind an execution plan. Both are 1-stop patterns that help read the content, not
 * colour ramps used as decoration.
 */
const PATTERN_FILES = new Set([
  'src/components/modals/settings/EditorBackgroundSettings.vue',
  'src/components/editor/ExecutionPlanViewer.vue',
]);
});

describe('minimal_ui_primitives', () => {
describe('minimal UI primitives (src/components/ui)', () => {
  test('SqChip fixes one size, one radius and one border, and only the tone varies', () => {
    const source = readSource('src/components/ui/SqChip.vue');

    assert.match(source, /height: 18px;/, 'one chip height');
    assert.match(source, /border-radius: 3px;/, 'the spec radius step');
    assert.match(source, /border: 1px solid;/, 'a hairline border');
    assert.match(source, /font-size: 11px;/, 'the spec label size');

    // Every tone resolves through the semantic tokens, never a raw Tailwind hue.
    for (const tone of ['neutral', 'accent', 'ok', 'warn', 'danger', 'plan', 'er', 'structure']) {
      assert.match(source, new RegExp(`\\.sq-chip--${tone} \\{`), `missing tone ${tone}`);
    }
    assert.match(source, /rgb\(var\(--color-accent\) \/ 0\.1\)/, 'accent tint from the token');
    assert.match(source, /rgb\(var\(--color-danger\) \/ 0\.3\)/, 'danger border from the token');
    assert.doesNotMatch(source, /#[0-9a-fA-F]{6}/, 'no hardcoded colours');
    assert.doesNotMatch(source, /primevue/, 'the primitive must not depend on PrimeVue');
  });

  test('SqInput owns the control contract: heights, hairline border and an accent focus ring', () => {
    const source = readSource('src/components/ui/SqInput.vue');

    assert.match(source, /\.sq-input--sm \{ height: 24px; \}/);
    assert.match(source, /\.sq-input--md \{ height: 28px; \}/);
    assert.match(source, /\.sq-input--lg \{ height: 32px; \}/);
    assert.match(source, /border: 1px solid rgb\(var\(--color-dark-700\)\)/, 'hairline border');
    assert.match(source, /border-radius: 4px;/, 'the spec control radius');
    assert.match(source, /outline: 2px solid rgb\(var\(--color-accent\)\)/, 'visible accent focus');
    assert.match(source, /name="prefix"/, 'prefix slot replaces IconField');
    assert.match(source, /name="suffix"/, 'suffix slot replaces InputIcon');
    assert.doesNotMatch(source, /primevue/, 'the primitive must not depend on PrimeVue');
  });

  test('the shell and results chrome use the primitives instead of PrimeVue Tag / InputText', () => {
    for (const file of [
      'src/components/layout/AppHeader.vue',
      'src/components/layout/AppSidebar.vue',
      'src/components/layout/AppStatusBar.vue',
      'src/components/results/ResultMessages.vue',
      'src/components/results/ResultGridItem.vue',
      'src/components/results/QueryHistory.vue',
    ]) {
      const source = readSource(file);
      assert.match(source, /components\/ui\/SqChip\.vue/, `${file} must import SqChip`);
      assert.doesNotMatch(source, /primevue\/tag/, `${file} must not import PrimeVue Tag`);
      assert.doesNotMatch(source, /\bTag\b(?=[^a-zA-Z-])/, `${file} must not render <Tag>`);
    }
  });

  test('SqButton owns the button contract: three variants, four heights, one focus ring', () => {
    const source = readSource('src/components/ui/SqButton.vue');

    for (const variant of ['solid', 'outline', 'ghost']) {
      assert.match(source, new RegExp(`\\.sq-btn--${variant}`), `missing variant ${variant}`);
    }
    assert.match(source, /\.sq-btn--xs \{ height: 20px;/, 'dense toolbar height');
    assert.match(source, /\.sq-btn--sm \{ height: 24px;/);
    assert.match(source, /\.sq-btn--md \{ height: 28px;/);
    assert.match(source, /\.sq-btn--lg \{ height: 32px;/);
    assert.match(source, /border-radius: 4px;/, 'the spec control radius');
    assert.match(source, /outline: 2px solid rgb\(var\(--color-accent\)\)/, 'visible accent focus');
    assert.match(source, /aria-label="\$attrs|aria-label: undefined|aria-label="ariaLabel"/, 'aria-label is passed through');
    // The only literal allowed is the label colour on a solid fill; every surface, border and
    // accent step must come from a token.
    const literals = [...source.matchAll(/#[0-9a-fA-F]{3,6}/g)].map((match) => match[0]);
    assert.deepEqual(
      [...new Set(literals)].sort(),
      ['#ffffff'],
      'solid-fill label colour is the only literal'
    );
  });

  test('the shell draws its buttons with SqButton and the icon set, not PrimeVue', () => {
    for (const file of [
      'src/components/layout/AppHeader.vue',
      'src/components/layout/AppSidebar.vue',
      'src/components/layout/AppBottomPanel.vue',
      'src/components/layout/AppMain.vue',
      'src/components/layout/SqlEditorToolbar.vue',
      'src/components/ui/SqButtonGroup.vue',
    ]) {
      const source = readSource(file);
      assert.doesNotMatch(source, /primevue\/button/, `${file} must not import PrimeVue Button`);
      assert.doesNotMatch(source, /\b<Button\b/, `${file} must not render <Button>`);
    }
  });

  test('no icon font survives anywhere in src', () => {
    // The PrimeIcons class names and their lookup table are gone: every icon in the app is a
    // generated SVG component, so a `pi pi-*` in a template would simply render nothing.
    for (const file of trackedSources()) {
      assert.doesNotMatch(readSource(file), /pi pi-/, `${file} still names a PrimeIcon`);
    }
    assert.equal(existsSync(resolve(repoRoot, 'src/components/ui/piIcons.ts')), false, 'the map is deleted');
  });

  test('SqSelect keeps the combobox/listbox contract and the footer slot', () => {
    const source = readSource('src/components/ui/SqSelect.vue');

    assert.match(source, /role="combobox"/, 'the trigger is a combobox');
    assert.match(source, /:aria-expanded="isOpen"/, 'the trigger announces its expanded state');
    assert.match(source, /role="listbox"/, 'the popup is a listbox');
    assert.match(source, /role="option"/, 'options are options');
    assert.match(source, /:aria-selected="isSelected\(option\)"/, 'selection is announced');

    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter']) {
      assert.match(source, new RegExp(`case '${key}':`), `handles ${key}`);
    }
    assert.match(source, /function handleTypeAhead/, 'typing jumps to the matching option');
    assert.match(source, /name="footer"/, 'a footer slot hosts actions like "new connection"');
    assert.match(source, /is-selected/, 'the selected option is highlighted');
  });

  test('no component still imports PrimeVue Select, Menu, Popover, Toolbar, Message or DataTable', () => {
    const files = [
      'src/components/layout/AppHeader.vue',
      'src/components/modals/SettingsModal.vue',
      'src/components/modals/TableFilterTab.vue',
      'src/components/modals/SqlTemplateModal.vue',
      'src/components/modals/QuickObjectFinderModal.vue',
      'src/components/common/FontFamilyPicker.vue',
      'src/components/results/ExecutionStatsViewer.vue',
      'src/components/editor/ErDiagramViewer.vue',
    ];

    for (const file of files) {
      const source = readSource(file);
      assert.doesNotMatch(
        source,
        /from 'primevue\/(select|menu|popover|toolbar|message|datatable|column|button|tag|inputtext|checkbox|toggleswitch|selectbutton|textarea|progressbar|badge|card|divider|inputnumber|password|iconfield|inputicon)'/,
        `${file} still imports a retired PrimeVue component`
      );
    }
  });

  test('the shell no longer renders PrimeIcons glyphs in its own markup', () => {
    for (const file of [
      'src/components/layout/AppStatusBar.vue',
      'src/components/layout/AppSidebar.vue',
    ]) {
      assert.doesNotMatch(readSource(file), /<i class="pi pi-/, `${file} still uses a PrimeIcon`);
    }
    // The header draws its own icons (database, DBA, run, …) from the app's icon set.
    const header = readSource('src/components/layout/AppHeader.vue');
    assert.doesNotMatch(header, /<i class="pi pi-/, 'the header must not use PrimeIcon elements');
    assert.match(header, /from '@\/components\/icons'/, 'the header draws its own icons from the icon set');
  });
});
});
