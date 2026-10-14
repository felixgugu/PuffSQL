import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

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

  test('the shell draws its buttons with SqButton and lucide, not PrimeVue', () => {
    for (const file of [
      'src/components/layout/AppHeader.vue',
      'src/components/layout/AppSidebar.vue',
      'src/components/layout/AppBottomPanel.vue',
      'src/components/layout/AppMain.vue',
      'src/components/layout/SqlEditorToolbarActions.vue',
    ]) {
      const source = readSource(file);
      assert.doesNotMatch(source, /primevue\/button/, `${file} must not import PrimeVue Button`);
      assert.doesNotMatch(source, /\b<Button\b/, `${file} must not render <Button>`);
    }
  });

  test('the PrimeIcons lookup covers every icon the map is expected to resolve', () => {
    const map = readSource('src/components/ui/piIcons.ts');
    for (const key of ['pi-play', 'pi-stop', 'pi-search', 'pi-check', 'pi-times', 'pi-cog']) {
      assert.match(map, new RegExp(`'${key}':`), `icon map must cover ${key}`);
    }
    assert.match(map, /export function piIcon\(/, 'the map exposes a resolver for dynamic icons');
  });

  test('the shell no longer renders PrimeIcons glyphs in its own markup', () => {
    for (const file of [
      'src/components/layout/AppStatusBar.vue',
      'src/components/layout/AppSidebar.vue',
    ]) {
      assert.doesNotMatch(readSource(file), /<i class="pi pi-/, `${file} still uses a PrimeIcon`);
    }
    // The header keeps PrimeVue's own icon props for the actions P4 has not replaced yet, but its
    // database and DBA icons are lucide now.
    const header = readSource('src/components/layout/AppHeader.vue');
    assert.doesNotMatch(header, /<i class="pi pi-/, 'the header must not use PrimeIcon elements');
    assert.match(header, /from 'lucide-vue-next'/, 'the header draws its own icons with lucide');
  });
});
