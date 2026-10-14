import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { placePanel } from '../src/utils/popoverPlacement';
import { placeTooltip } from '../src/utils/popoverPlacement';
import { useContextMenu } from '../src/composables/useContextMenu';

const VIEWPORT = { width: 1440, height: 900 };

describe('popover placement', () => {
  test('opens below the trigger with the configured gap', () => {
    const { top, left } = placePanel({
      anchor: { top: 100, bottom: 128, left: 200, right: 228 },
      panel: { width: 288, height: 240 },
      viewport: VIEWPORT,
    });

    assert.equal(top, 132, 'panel sits 4px under the trigger');
    assert.equal(left, 200, 'start alignment matches the trigger left edge');
  });

  test('flips above the trigger when there is no room below', () => {
    const { top } = placePanel({
      anchor: { top: 820, bottom: 848, left: 200, right: 228 },
      panel: { width: 288, height: 240 },
      viewport: VIEWPORT,
    });

    assert.equal(top, 576, 'panel is placed above: 820 - 240 - 4');
  });

  test('end alignment hangs the panel off the trigger right edge', () => {
    const { left } = placePanel({
      anchor: { top: 100, bottom: 128, left: 1000, right: 1028 },
      panel: { width: 288, height: 240 },
      viewport: VIEWPORT,
      align: 'end',
    });

    assert.equal(left, 740, '1028 - 288');
  });

  test('clamps to the viewport when the trigger sits near an edge', () => {
    const rightEdge = placePanel({
      anchor: { top: 100, bottom: 128, left: 1400, right: 1436 },
      panel: { width: 288, height: 240 },
      viewport: VIEWPORT,
    });
    assert.equal(rightEdge.left, 1440 - 288 - 8, 'clamped to the right margin');

    const leftEdge = placePanel({
      anchor: { top: 100, bottom: 128, left: 2, right: 30 },
      panel: { width: 288, height: 240 },
      viewport: VIEWPORT,
      align: 'end',
    });
    assert.equal(leftEdge.left, 8, 'clamped to the left margin');
  });

  test('a panel taller than the viewport never starts above the margin', () => {
    const { top } = placePanel({
      anchor: { top: 10, bottom: 38, left: 100, right: 128 },
      panel: { width: 200, height: 1200 },
      viewport: VIEWPORT,
    });

    assert.equal(top, 8, 'starts at the margin instead of going negative');
  });

  test('SqPopover delegates its placement to the tested helper', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/ui/SqPopover.vue'),
      'utf-8'
    );

    assert.match(source, /import \{ placePanel \} from '@\/utils\/popoverPlacement'/, 'uses the helper');
    assert.match(source, /placePanel\(\{/, 'computes the position through the helper');
    assert.match(source, /document\.addEventListener\('pointerdown', onPointerDown, true\)/, 'closes on outside pointer-down');
    assert.match(source, /event\.key === 'Escape'/, 'closes on Escape');
    assert.match(source, /window\.addEventListener\('scroll', onWindowChange, true\)/, 'follows scroll (capture)');
    assert.match(source, /onBeforeUnmount\(unbindListeners\)/, 'removes its listeners with the component');
  });

  test('SqMenu owns the keyboard contract for menu items', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/ui/SqMenu.vue'), 'utf-8');

    assert.match(source, /role="menu"/, 'the panel is a menu');
    assert.match(source, /role="menuitem"/, 'items are menuitems');
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      assert.match(source, new RegExp(`case '${key}':`), `handles ${key}`);
    }
    assert.match(source, /focusItem\('first'\)/, 'focus moves into the menu when it opens');
    assert.match(source, /:disabled="item\.disabled"/, 'disabled items are not clickable');
    assert.match(source, /is-danger/, 'destructive items use the danger tone');
  });

  test('useContextMenu anchors the menu at the pointer', () => {
    const { isOpen, rect, openAt, close } = useContextMenu();

    assert.equal(isOpen.value, false, 'menus start closed');
    assert.deepEqual(rect.value, { top: 0, bottom: 0, left: 0, right: 0 });

    openAt({ clientX: 320, clientY: 180 } as MouseEvent);
    assert.equal(isOpen.value, true);
    assert.deepEqual(
      rect.value,
      { top: 180, bottom: 180, left: 320, right: 320 },
      'a zero-size anchor at the cursor: placement still clamps it inside the viewport'
    );

    close();
    assert.equal(isOpen.value, false);
  });

  test('SqMenu takes icons as components, not as icon-font class names', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/ui/SqMenu.vue'), 'utf-8');

    assert.match(source, /icon\?: Component;/, 'the item model carries a component');
    assert.match(source, /<component :is="item\.icon"/, 'the item renders that component');
    assert.doesNotMatch(source, /piIcon|piIcons|pi pi-/, 'the PrimeIcons vocabulary is gone');
    assert.match(source, /anchorRect/, 'pointer-anchored menus are supported');
  });
});

describe('tooltip placement', () => {
  const TRIGGER = { top: 300, bottom: 328, left: 400, right: 428 };
  const PANEL = { width: 160, height: 24 };

  test('a bottom tooltip is centred under the trigger with the gap', () => {
    const { top, left, side } = placeTooltip({
      anchor: TRIGGER,
      panel: PANEL,
      viewport: VIEWPORT,
      side: 'bottom',
    });

    assert.equal(top, 334, '328 + 6');
    assert.equal(left, 334, 'centred on the trigger: 414 - 80');
    assert.equal(side, 'bottom');
  });

  test('a top tooltip sits above the trigger', () => {
    const { top, side } = placeTooltip({
      anchor: TRIGGER,
      panel: PANEL,
      viewport: VIEWPORT,
      side: 'top',
    });

    assert.equal(top, 270, '300 - 24 - 6');
    assert.equal(side, 'top');
  });

  test('a top tooltip flips below when the trigger is against the top edge', () => {
    const { top, side } = placeTooltip({
      anchor: { top: 2, bottom: 30, left: 400, right: 428 },
      panel: PANEL,
      viewport: VIEWPORT,
      side: 'top',
    });

    assert.equal(side, 'bottom', 'the tooltip would otherwise cover its own trigger');
    assert.equal(top, 36, '30 + 6');
  });

  test('a bottom tooltip flips above when there is no room below', () => {
    const { top, side } = placeTooltip({
      anchor: { top: 880, bottom: 908, left: 400, right: 428 },
      panel: PANEL,
      viewport: VIEWPORT,
      side: 'bottom',
    });

    assert.equal(side, 'top');
    assert.equal(top, 850, '880 - 24 - 6');
  });

  test('a tooltip on a trigger past the edge stays fully inside the viewport', () => {
    const { left } = placeTooltip({
      anchor: { top: 300, bottom: 328, left: 1420, right: 1440 },
      panel: PANEL,
      viewport: VIEWPORT,
      side: 'bottom',
    });

    assert.equal(left, 1440 - 160 - 8, 'clamped to the right margin');
  });
});
