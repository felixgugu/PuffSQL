import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

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
    // lucide component, so a `pi pi-*` in a template would simply render nothing.
    const files = execSync('git ls-files "src/*"', { encoding: 'utf-8' })
      .split('\n')
      .filter((line) => line.trim().length > 0);

    for (const file of files) {
      if (!existsSync(resolve(root, file))) continue;
      assert.doesNotMatch(readSource(file), /pi pi-/, `${file} still names a PrimeIcon`);
    }
    assert.equal(existsSync(resolve(root, 'src/components/ui/piIcons.ts')), false, 'the map is deleted');
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
    // The header keeps PrimeVue's own icon props for the actions P4 has not replaced yet, but its
    // database and DBA icons are lucide now.
    const header = readSource('src/components/layout/AppHeader.vue');
    assert.doesNotMatch(header, /<i class="pi pi-/, 'the header must not use PrimeIcon elements');
    assert.match(header, /from 'lucide-vue-next'/, 'the header draws its own icons with lucide');
  });
});
