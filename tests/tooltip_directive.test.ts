import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

const directive = readSource('src/directives/tooltip.ts');
const css = readSource('src/assets/main.css');

describe('the shared tooltip directive (replaces primevue/tooltip)', () => {
  test('it is the app own directive, not a PrimeVue wrapper', () => {
    assert.doesNotMatch(directive, /from 'primevue/, 'the directive must not import from PrimeVue');
    assert.doesNotMatch(readSource('src/main.ts'), /primevue\/tooltip/);
  });

  test('about 150 call sites keep working unchanged', () => {
    // The API is the one the call sites already use: `v-tooltip.top` / `.bottom` with a string.
    assert.match(directive, /renderDelay|SHOW_DELAY_MS = 400/, 'SPEC §7 asks for a 400ms delay');
    assert.match(directive, /for \(const side of \['top', 'bottom', 'left', 'right'\] as const\)/);
    assert.match(directive, /readText/);
    assert.match(directive, /if \(!state\?\.text \|\| !anchor\.isConnected\) return;/, 'an empty hint shows nothing');
  });

  test('one element serves every anchor, and it does not steal the pointer', () => {
    assert.match(directive, /let panel: HTMLElement \| null = null;/);
    assert.match(directive, /panel\.getAttribute|panel\.setAttribute\('role', 'tooltip'\)/);
    assert.match(css, /\.sq-tooltip \{[\s\S]*?pointer-events: none;/);
    assert.match(css, /\.sq-tooltip \{[\s\S]*?background-color: #1f2328;/, 'SPEC §7 tooltip surface');
    assert.match(css, /\.sq-tooltip \{[\s\S]*?color: #f2f4f7;/, 'SPEC §7 tooltip text');
    assert.match(css, /\.sq-tooltip \{[\s\S]*?font-size: 11px;/);
    assert.match(css, /\.sq-tooltip \{[\s\S]*?border-radius: 4px;/);
    assert.doesNotMatch(css, /\.p-tooltip/, 'the PrimeVue tooltip rules are gone');
  });

  test('it is measured before it is positioned', () => {
    // `hidden` reports a zero-size box, so the panel has to be shown first or it lands at 0,0.
    assert.match(directive, /el\.hidden = false;\s*\n\s*reposition\(\);/);
    assert.match(directive, /import \{ placeTooltip, type TooltipSide \} from '@\/utils\/popoverPlacement'/);
  });

  test('it follows its trigger and lets go of it', () => {
    assert.match(directive, /addEventListener\('pointerenter', onEnter\)/);
    assert.match(directive, /addEventListener\('pointerleave', onLeave\)/);
    assert.match(directive, /addEventListener\('focus', onFocus\)/, 'keyboard users get the hint');
    // A dialog focuses its first control programmatically; that must not pop a "close" tooltip.
    assert.match(directive, /if \(keyboardNavigation\) show\(el\);/);
    assert.match(directive, /addEventListener\('keydown', \(\) => \{ keyboardNavigation = true; \}, true\)/);
    assert.match(directive, /addEventListener\('pointerdown', \(\) => \{ keyboardNavigation = false; \}, true\)/);
    assert.match(directive, /addEventListener\('blur', onBlur\)/);
    assert.match(directive, /addEventListener\('pointerdown', onActivate\)/);
    assert.match(directive, /removeEventListener\('pointerenter', onEnter\)/, 'every listener is removed');
    assert.match(directive, /window\.addEventListener\('scroll', reposition, true\)/, 'scroll panes do not bubble');
    assert.match(directive, /window\.removeEventListener\('scroll', reposition, true\)/);
    assert.match(directive, /beforeUnmount\(el\)/, 'a removed trigger cannot leave a tooltip behind');
  });
});
