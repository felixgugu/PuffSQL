import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

/** Prose in a comment is not a rule; only markup and styles count. */
function readCode(relativePath: string): string {
  return readSource(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * SPEC §7 "button group": one hairline outline around the strip and a 1px rule between segments,
 * with 4px corners — the same language as SqSegmented, and deliberately not a pill (SPEC §6 keeps
 * capsule shapes for status dots only).
 */
describe('SqButtonGroup primitive', () => {
  test('one hairline outline, the spec radius, and a 1px rule between segments', () => {
    const source = readSource('src/components/ui/SqButtonGroup.vue');

    assert.match(source, /border: 1px solid rgb\(var\(--color-dark-700\)\)/, 'outline from the token');
    assert.match(source, /border-radius: 4px;/, 'the spec control radius');
    assert.match(
      source,
      /\.sq-btn-group :deep\(\.sq-btn \+ \.sq-btn\) \{\s*border-left-color: rgb\(var\(--color-dark-750\)\);/,
      'neighbours are divided by a colour change on the button border'
    );
    assert.doesNotMatch(source, /#[0-9a-fA-F]{6}/, 'no hardcoded colours');
    assert.doesNotMatch(source, /primevue/, 'the primitive must not depend on PrimeVue');
    assert.doesNotMatch(
      source,
      /\brounded-(sm|lg|xl|2xl|3xl)\b/,
      'the radius is a CSS value, never a Tailwind step the guardrails ban'
    );
  });

  test('the group never clips its children, so focus rings survive', () => {
    const source = readCode('src/components/ui/SqButtonGroup.vue');

    assert.doesNotMatch(source, /overflow/, 'overflow: hidden would cut off the 2px focus outline');
    assert.match(source, /:deep\(\.sq-btn:first-child\) \{\s*border-top-left-radius: 3px;\s*border-bottom-left-radius: 3px;/);
    assert.match(source, /:deep\(\.sq-btn:last-child\) \{\s*border-top-right-radius: 3px;\s*border-bottom-right-radius: 3px;/);
    assert.match(source, /:deep\(\.sq-btn\) \{\s*border-radius: 0;/, 'segments stay square inside the strip');
  });

  test('the strip is a labelled group of buttons, not a selection control', () => {
    const source = readSource('src/components/ui/SqButtonGroup.vue');

    assert.match(source, /role="group"/);
    assert.match(source, /:aria-label="ariaLabel"/);
    assert.match(source, /<slot \/>/);
    assert.doesNotMatch(source, /modelValue|aria-pressed/, 'each segment owns its own state');
  });

  test('a strip keeps the height of the controls around it', () => {
    const source = readCode('src/components/ui/SqButtonGroup.vue');
    const steps: Array<[string, number, number]> = [
      ['xs', 20, 18],
      ['sm', 24, 22],
      ['md', 28, 26],
      ['lg', 32, 30],
    ];

    for (const [size, outer, inner] of steps) {
      assert.match(
        source,
        new RegExp(`:deep\\(\\.sq-btn--${size}\\) \\{ height: ${inner}px; \\}`),
        `${size} segments are ${inner}px so the ${outer}px strip lines up with its neighbours`
      );
    }
  });
});
