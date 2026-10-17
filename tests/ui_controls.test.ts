import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readCode, readSource } from './helpers/source';

describe('sq_button_group', () => {
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
});

describe('sq_select_options', () => {
/**
 * A two-line option used to collide with its neighbours: the option box was a fixed 26px while the
 * connection picker renders the server under the connection name. The height is now a minimum, so a
 * plain option keeps its 26px and a taller slot grows instead of overflowing.
 */
describe('SqSelect options', () => {
  test('the option box is a minimum height, not a fixed one', () => {
    const css = readSource('src/components/ui/SqSelect.vue');
    const rule = /\.sq-select__option \{([^}]*)\}/.exec(css)?.[1] ?? '';

    assert.ok(rule.length > 0, 'the option rule must exist');
    assert.match(rule, /min-height: 26px;/, 'single-line options keep their old 26px');
    assert.doesNotMatch(rule, /(^|\s)height: 26px;/, 'a fixed height clips two-line slots');
    assert.match(rule, /padding: 3px 8px;/, 'the vertical padding is what lets the box grow');
  });

  test('the selected option draws exactly one check', () => {
    // SqSelect renders the check itself, so a #option slot must not add a second one.
    const header = readSource('src/components/layout/AppHeader.vue');
    const optionSlot = /<template #option="slotProps">[\s\S]*?<\/template>/.exec(header)?.[0] ?? '';

    assert.ok(optionSlot.length > 0, 'the connection picker must keep its #option slot');
    assert.doesNotMatch(optionSlot, /<Check\b/, 'the slot must not draw its own check');
    assert.doesNotMatch(header, /\bCheck,/, 'the unused Check import must be gone');
    assert.match(
      readSource('src/components/ui/SqSelect.vue'),
      /<Check v-if="isSelected\(option\)"/,
      'the primitive owns the selected state'
    );
  });
});
});
