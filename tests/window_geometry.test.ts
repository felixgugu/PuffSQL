import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampWindowToViewport,
  resizeWindowRect,
  windowBounds,
  type WindowRect,
} from '../src/utils/windowGeometry';

const VIEWPORT = { width: 1280, height: 800 };
const LIMITS = { minWidth: 360, minHeight: 220 };

/** A window comfortably smaller than the viewport, used as the "already placed" state. */
const PLACED: WindowRect = { left: 400, top: 200, width: 600, height: 400 };

describe('A window can never leave the viewport', () => {
  test('the resting range is full containment, not a partial-visibility sliver', () => {
    // The floating AI / data-view windows used to allow resting with only 100x60px on screen.
    assert.deepEqual(windowBounds({ width: 600, height: 400 }, VIEWPORT), {
      minLeft: 0,
      maxLeft: VIEWPORT.width - 600,
      minTop: 0,
      maxTop: VIEWPORT.height - 400,
    });
  });

  test('the resting range collapses to the origin when the window cannot fit', () => {
    assert.deepEqual(windowBounds({ width: 1600, height: 1000 }, VIEWPORT), {
      minLeft: 0,
      maxLeft: 0,
      minTop: 0,
      maxTop: 0,
    });
  });

  test('clamping agrees with the resting range at every edge', () => {
    // The rubber band is the transient part; this is what it must settle onto.
    const bounds = windowBounds(PLACED, VIEWPORT);
    assert.equal(clampWindowToViewport({ ...PLACED, left: -999 }, VIEWPORT).left, bounds.minLeft);
    assert.equal(clampWindowToViewport({ ...PLACED, left: 9999 }, VIEWPORT).left, bounds.maxLeft);
    assert.equal(clampWindowToViewport({ ...PLACED, top: -999 }, VIEWPORT).top, bounds.minTop);
    assert.equal(clampWindowToViewport({ ...PLACED, top: 9999 }, VIEWPORT).top, bounds.maxTop);
  });

  test('a window already inside is left untouched', () => {
    assert.deepEqual(clampWindowToViewport(PLACED, VIEWPORT), PLACED);
  });

  test('dragging past any edge stops with the whole window still visible', () => {
    // This is the bug the floating AI / data-view windows had: they allowed a 100x60 sliver to
    // stay on screen, and were not clamped at all on the top and left.
    const cases: Array<[string, WindowRect, WindowRect]> = [
      ['right', { ...PLACED, left: 900 }, { ...PLACED, left: VIEWPORT.width - PLACED.width }],
      ['left', { ...PLACED, left: -300 }, { ...PLACED, left: 0 }],
      ['bottom', { ...PLACED, top: 700 }, { ...PLACED, top: VIEWPORT.height - PLACED.height }],
      ['top', { ...PLACED, top: -120 }, { ...PLACED, top: 0 }],
    ];

    for (const [edge, input, expected] of cases) {
      const result = clampWindowToViewport(input, VIEWPORT);
      assert.deepEqual(result, expected, `dragging past the ${edge} edge must not escape`);
      assert.ok(result.left >= 0 && result.top >= 0, `${edge}: must not pass the origin`);
      assert.ok(
        result.left + result.width <= VIEWPORT.width,
        `${edge}: the right edge must stay on screen`
      );
      assert.ok(
        result.top + result.height <= VIEWPORT.height,
        `${edge}: the bottom edge must stay on screen`
      );
    }
  });

  test('a window larger than the viewport pins to the origin instead of flipping', () => {
    const huge: WindowRect = { left: 500, top: 500, width: 1600, height: 1000 };
    assert.deepEqual(clampWindowToViewport(huge, VIEWPORT), { ...huge, left: 0, top: 0 });
  });
});

describe('Resizing is clamped on every edge', () => {
  test('the right and bottom edges stop at the screen', () => {
    const result = resizeWindowRect(PLACED, 'rb', 900, 900, VIEWPORT, LIMITS);
    assert.equal(result.left + result.width, VIEWPORT.width);
    assert.equal(result.top + result.height, VIEWPORT.height);
  });

  test('the left and top edges stop at the origin', () => {
    // The old floating-window code assigned `left = startLeft + dx` with no floor at all, which
    // pushed the window off the left/top of the screen.
    const pulled = resizeWindowRect(
      { left: 100, top: 100, width: 600, height: 400 },
      'lt',
      -500,
      -500,
      VIEWPORT,
      LIMITS
    );
    assert.equal(pulled.left, 0, 'the left edge must not pass the origin');
    assert.equal(pulled.top, 0, 'the top edge must not pass the origin');
    assert.ok(pulled.width > 0 && pulled.height > 0);
  });

  test('shrinking stops at the minimum size instead of inverting the window', () => {
    const squeezed = resizeWindowRect(PLACED, 'rb', -5000, -5000, VIEWPORT, LIMITS);
    assert.equal(squeezed.width, LIMITS.minWidth);
    assert.equal(squeezed.height, LIMITS.minHeight);
    assert.equal(squeezed.left, PLACED.left, 'the anchored edge must not move');
    assert.equal(squeezed.top, PLACED.top, 'the anchored edge must not move');
  });

  test('corners move only the edges they were grabbed by', () => {
    const topLeft = resizeWindowRect(PLACED, 'tl', -60, -40, VIEWPORT, LIMITS);
    assert.equal(topLeft.left, PLACED.left - 60);
    assert.equal(topLeft.top, PLACED.top - 40);
    assert.equal(
      topLeft.left + topLeft.width,
      PLACED.left + PLACED.width,
      'the right edge must stay put'
    );
    assert.equal(
      topLeft.top + topLeft.height,
      PLACED.top + PLACED.height,
      'the bottom edge must stay put'
    );
  });

  test('every handle keeps the window inside the viewport', () => {
    const handles = ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'];
    const drags: Array<[number, number]> = [
      [4000, 4000],
      [-4000, -4000],
      [4000, -4000],
      [-4000, 4000],
    ];

    for (const handle of handles) {
      for (const [dx, dy] of drags) {
        const result = resizeWindowRect(PLACED, handle, dx, dy, VIEWPORT, LIMITS);
        const label = `${handle} dx=${dx} dy=${dy}`;

        assert.ok(result.left >= 0, `${label}: left escaped`);
        assert.ok(result.top >= 0, `${label}: top escaped`);
        assert.ok(result.width >= LIMITS.minWidth, `${label}: width below minimum`);
        assert.ok(result.height >= LIMITS.minHeight, `${label}: height below minimum`);
        assert.ok(result.left + result.width <= VIEWPORT.width + 1, `${label}: right escaped`);
        assert.ok(result.top + result.height <= VIEWPORT.height + 1, `${label}: bottom escaped`);
      }
    }
  });
});
