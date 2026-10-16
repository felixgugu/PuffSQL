import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

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
