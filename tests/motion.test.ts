import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { useSplitter } from '../src/composables/useSplitter';
import { SPRING_PRESETS, isSpringSettled, rubberband, rubberbandClamp, springStep, type SpringConfig, type SpringState } from '../src/utils/spring';
import { clampWindowToViewport, resizeWindowRect, type WindowRect, windowBounds } from '../src/utils/windowGeometry';
import { readSource } from './helpers/source';

describe('spring', () => {
/** Run a spring at a steady 60fps and report where it went. */
function simulate(
  from: number,
  to: number,
  config: SpringConfig,
  velocity = 0,
  seconds = 1.5
): { final: SpringState; peak: number; frames: number } {
  const frame = 1 / 60;
  let state: SpringState = { value: from, velocity };
  let peak = from;
  let frames = 0;

  for (let elapsed = 0; elapsed < seconds; elapsed += frame) {
    state = springStep(state, to, config, frame);
    peak = Math.max(peak, state.value);
    frames += 1;
    if (isSpringSettled(state, to)) break;
  }

  return { final: state, peak, frames };
}

test('rubberbandClamp leaves in-bounds values untouched', () => {
  for (const value of [180, 260, 359, 500]) {
    assert.equal(rubberbandClamp(value, 180, 500, 320), value);
  }
});

test('rubberbandClamp resists progressively instead of stopping dead', () => {
  const justPast = rubberbandClamp(520, 180, 500, 320);
  const farPast = rubberbandClamp(900, 180, 500, 320);

  assert.ok(justPast > 500, 'the value must follow the pointer past the boundary');
  assert.ok(farPast > justPast, 'further overshoot must still move the surface');
  assert.ok(farPast < 900, 'the resistance must keep the overshoot short of the raw drag');

  const belowMin = rubberbandClamp(60, 180, 500, 320);
  assert.ok(belowMin < 180 && belowMin > 100, 'the lower boundary resists the same way');
});

test('rubberband is monotonic and asymptotic', () => {
  const dimension = 320;
  let previous = -1;

  for (const overshoot of [1, 10, 50, 200, 1000, 100000]) {
    const resisted = rubberband(overshoot, dimension);
    assert.ok(resisted > previous, 'resistance must grow with the overshoot');
    assert.ok(resisted < dimension, 'resistance can never exceed the dimension itself');
    previous = resisted;
  }
});

test('a critically damped spring settles on the target without overshoot', () => {
  const { final, peak } = simulate(0, 100, { damping: 1, response: 0.4 });

  assert.ok(Math.abs(final.value - 100) < 0.2, `expected ~100, got ${final.value}`);
  assert.ok(peak <= 100.5, `critically damped motion overshot to ${peak}`);
});

test('an under-damped spring overshoots, which is why bounce is reserved for momentum', () => {
  const { peak } = simulate(0, 100, { damping: 0.8, response: 0.4 });
  assert.ok(peak > 100.5, `expected the under-damped spring to overshoot, peaked at ${peak}`);
});

test('the spring continues at the handed-over velocity instead of restarting from rest', () => {
  const frame = 1 / 60;
  const fromRest = springStep({ value: 0, velocity: 0 }, 100, SPRING_PRESETS.momentum, frame);
  const thrown = springStep({ value: 0, velocity: 600 }, 100, SPRING_PRESETS.momentum, frame);

  assert.ok(
    thrown.value > fromRest.value,
    'handing the gesture its release velocity must move the value further on the first frame'
  );
  assert.ok(thrown.velocity > 0, 'the spring must carry the velocity forward, not discard it');
});

test('springStep tolerates a stalled frame without teleporting past the target', () => {
  const state = springStep({ value: 0, velocity: 0 }, 100, SPRING_PRESETS.move, 5);

  assert.ok(Number.isFinite(state.value) && Number.isFinite(state.velocity));
  assert.ok(state.value <= 100.01, `a 5s frame must not launch the value (got ${state.value})`);
});

test('isSpringSettled only reports rest once the value is genuinely there', () => {
  assert.equal(isSpringSettled({ value: 100, velocity: 0 }, 100), true);
  assert.equal(isSpringSettled({ value: 92, velocity: 0 }, 100), false);
  assert.equal(isSpringSettled({ value: 100, velocity: 250 }, 100), false);
});
});

describe('splitter', () => {
test('useSplitter supports dynamic maxSize function and allows sizes beyond 550px', () => {
  let mockWindowHeight = 1000;
  const splitter = useSplitter({
    direction: 'vertical',
    initialSize: 240,
    minSize: 100,
    maxSize: () => Math.max(200, mockWindowHeight - 100), // 900px
    reverse: true,
  });

  assert.equal(splitter.size.value, 240);

  // Simulate dragging upwards by 400px (reverse: delta = start - current = 400)
  // New size = 240 + 400 = 640px (exceeds previous 550px limit!)
  splitter.onPointerDown({ button: 0, clientY: 800 } as PointerEvent);
  splitter.onPointerMove({ clientY: 400 } as PointerEvent);

  assert.equal(splitter.size.value, 640, 'Should allow size to exceed 550px');
  assert.ok(splitter.size.value > 550);

  // Drag upwards further to 100px from top: delta = 800 - 100 = 700 -> size = 940 (capped at 900)
  splitter.onPointerMove({ clientY: 100 } as PointerEvent);
  assert.ok(
    splitter.size.value > 900,
    'Dragging past maxSize must rubber-band instead of stopping dead at the edge'
  );
  assert.ok(
    splitter.size.value < 1000,
    'The rubber band is asymptotic, so the panel must not run away past the limit'
  );

  // Drag downwards: delta = 800 - 1000 = -200 -> size = 40 (rubber-banded below minSize 100)
  splitter.onPointerMove({ clientY: 1000 } as PointerEvent);
  assert.ok(splitter.size.value < 100, 'Dragging past minSize must rubber-band too');
  assert.ok(splitter.size.value > 0, 'The panel must never invert or collapse to zero');

  // Releasing hands the overshoot to a spring, which settles back onto the nearest limit.
  splitter.onPointerUp();
  assert.equal(splitter.size.value, 100, 'The settle spring must land exactly on minSize');
  assert.equal(splitter.isDragging.value, false);
});

test('useSplitter supports static minSize and maxSize', () => {
  const splitter = useSplitter({
    direction: 'horizontal',
    initialSize: 260,
    minSize: 180,
    maxSize: 500,
  });

  assert.equal(splitter.size.value, 260);

  // Simulate dragging rightwards: delta = 100 -> size = 360
  splitter.onPointerDown({ button: 0, clientX: 200 } as PointerEvent);
  splitter.onPointerMove({ clientX: 300 } as PointerEvent);
  assert.equal(splitter.size.value, 360);

  // Drag rightwards past max: delta = 400 -> size = 660 (rubber-banded past 500)
  splitter.onPointerMove({ clientX: 600 } as PointerEvent);
  assert.ok(splitter.size.value > 500, 'Drag past max must rubber-band');
  assert.ok(splitter.size.value < 600, 'The overshoot must stay bounded');

  // Drag leftwards past min: delta = -200 -> size = 60 (rubber-banded below 180)
  splitter.onPointerMove({ clientX: 0 } as PointerEvent);
  assert.ok(splitter.size.value < 180, 'Drag past min must rubber-band');

  splitter.onPointerUp();
  assert.equal(splitter.size.value, 180, 'The settle spring must land exactly on minSize');
});

test('useSplitter keeps in-bounds dragging at 1:1 without any rubber band', () => {
  const splitter = useSplitter({
    direction: 'horizontal',
    initialSize: 260,
    minSize: 180,
    maxSize: 500,
  });

  splitter.onPointerDown({ button: 0, clientX: 200 } as PointerEvent);
  for (const clientX of [210, 240, 275, 310]) {
    splitter.onPointerMove({ clientX } as PointerEvent);
    assert.equal(
      splitter.size.value,
      260 + (clientX - 200),
      `size must track the pointer exactly at clientX=${clientX}`
    );
  }
  splitter.onPointerUp();
  assert.equal(splitter.size.value, 370, 'A release inside the limits must not move the panel');
});

test('useSplitter can opt out of the rubber band for a hard stop', () => {
  const splitter = useSplitter({
    direction: 'horizontal',
    initialSize: 260,
    minSize: 180,
    maxSize: 500,
    rubberBandConstant: 0,
  });

  splitter.onPointerDown({ button: 0, clientX: 200 } as PointerEvent);
  splitter.onPointerMove({ clientX: 900 } as PointerEvent);
  assert.equal(splitter.size.value, 500, 'rubberBandConstant: 0 restores the hard clamp');
  splitter.onPointerUp();
});

test('Double-click toggle maximize calculation logic', () => {
  const mockWindowHeight = 1080;
  const maxH = Math.max(200, mockWindowHeight - 100); // 980px
  assert.equal(maxH, 980);

  let currentSize = 240;
  let preMaximized = 240;

  if (currentSize >= maxH - 40) {
    currentSize = Math.max(100, preMaximized || 240);
  } else {
    preMaximized = currentSize;
    currentSize = maxH;
  }
  assert.equal(currentSize, 980);
  assert.equal(preMaximized, 240);

  if (currentSize >= maxH - 40) {
    currentSize = Math.max(100, preMaximized || 240);
  } else {
    preMaximized = currentSize;
    currentSize = maxH;
  }
  assert.equal(currentSize, 240);
});
});

describe('motion_accessibility', () => {
const css = readSource('src/assets/main.css');

function reducedMotionBlock(): string {
  return (
    /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}\n\n@media \(prefers-reduced-transparency/.exec(
      css
    )?.[1] ?? ''
  );
}

describe('Motion honours the operating system preferences', () => {
  test('the stylesheet answers all three accessibility signals', () => {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
    assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
    assert.match(css, /@media \(prefers-contrast: more\)/);
  });

  test('reduced motion drops the looping and travelling animations', () => {
    const block = reducedMotionBlock();
    assert.ok(block, 'the reduced-motion block must be locatable');

    for (const looping of [
      'animate-pulse',
      'animate-ping',
      'animate-bounce',
      'animate-fadein',
      'animate-fade-in',
    ]) {
      assert.ok(block.includes(`.${looping}`), `${looping} must be neutralised under reduced motion`);
    }
    assert.match(block, /animation: none !important/);

    // Overlays cross-fade instead of scaling and sliding.
    assert.match(block, /\.sq-dialog-enter-active/);
    assert.match(block, /transition-property: opacity !important/);
  });

  test('reduced transparency removes blur without dropping the surface colour', () => {
    const block =
      /@media \(prefers-reduced-transparency: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    assert.ok(block, 'the reduced-transparency block must be locatable');
    assert.match(block, /backdrop-filter: none !important/);
    assert.doesNotMatch(
      block,
      /background-color/,
      'the surfaces already carry an opaque token background, so only the blur is removed'
    );
  });

  test('the query progress hairline keeps reporting without motion', () => {
    assert.match(css, /\.sq-progress-line \{/);
    assert.match(css, /\.sq-progress-line::after \{[\s\S]*?animation: sqProgressSlide/);
    assert.match(
      reducedMotionBlock(),
      /\.sq-progress-line::after \{\s*animation: none !important;\s*\}/,
      'the progress line must fall back to a static segment'
    );
  });

  test('press feedback is instant and only skipped when motion is reduced', () => {
    const block =
      /@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    assert.ok(block, 'the press-feedback block must be locatable');
    assert.match(block, /\.sq-btn:not\(:disabled\):active/);
    assert.match(block, /transform: scale\(/);
  });
});

describe('Gesture-driven components route through the shared spring', () => {
  test('the splitter captures the pointer, rubber-bands and springs', () => {
    const source = readSource('src/composables/useSplitter.ts');
    assert.match(source, /runSpring\(/, 'the splitter must settle with a spring');
    assert.match(source, /velocity:/, 'the splitter must hand over the release velocity');
    assert.match(source, /setPointerCapture/, 'the splitter must capture the pointer');
    assert.match(source, /rubberbandClamp\(/, 'the splitter must rubber-band its edges');
  });

  test('the shared window drag rubber-bands and springs back onto the shared bounds', () => {
    const source = readSource('src/composables/windowDrag.ts');

    assert.match(source, /rubberbandClamp\(/, 'the drag must resist past the edge');
    assert.match(source, /runSpring\(/, 'the release must spring back');
    assert.match(source, /velocity:/, 'the spring must inherit the release velocity');
    assert.match(source, /setPointerCapture/, 'the drag must capture the pointer');

    // The resistance and the spring-back both have to be derived from the shared resting range,
    // which is what an earlier version got wrong by permitting a 100x60px sliver to stay visible.
    assert.match(source, /windowBounds\(/, 'the resistance must use the shared resting range');
    assert.match(source, /clampWindowToViewport\(/, 'the spring must land inside that range');
  });

  test('every window drag goes through that one implementation', () => {
    // Dialogs and floating tool windows differ only in how they expose their geometry, never in
    // how the gesture feels — so neither may grow a private copy of the drag.
    for (const file of [
      'src/composables/useDialogWindow.ts',
      'src/composables/useFloatingWindowDrag.ts',
    ]) {
      const source = readSource(file);
      assert.match(source, /createWindowDrag\(/, `${file} must use the shared window drag`);
      assert.doesNotMatch(
        source,
        /rubberbandClamp\(|runSpring\(/,
        `${file} must not reimplement the drag behaviour`
      );
    }
  });

  test('resizing stays a hard clamp so a window is never left below its minimum', () => {
    const source = readSource('src/composables/useDialogWindow.ts');
    assert.match(source, /resizeWindowRect\(/);
    assert.doesNotMatch(source, /rubberbandClamp\(/, 'resizing is sizing, not a throw');
  });

  test('the stacked grid panes rubber-band and settle without fighting the resize observer', () => {
    const source = readSource('src/components/results/ResultGrid.vue');
    assert.match(source, /rubberbandClamp\(/, 'the pane splitter must rubber-band its edges');
    assert.match(source, /runSpring\(\{/, 'the pane splitter must settle with a spring');
    assert.match(source, /setPointerCapture/, 'the pane splitter must capture the pointer');
    assert.match(
      source,
      /draggingSplitterIndex\.value === null && settlingSplitterIndex\.value === null/,
      'the ResizeObserver must not re-scale the panes while the settle spring is running'
    );
    assert.match(
      source,
      /paneHeights\.value\[idx \+ 1\] = totalCombined - next/,
      'the two panes must trade height from one exact total so they never drift apart'
    );
  });

  test('both floating windows share the drag implementation', () => {
    for (const file of [
      'src/components/modals/AiSqlChatModal.vue',
      'src/components/modals/DataViewModal.vue',
    ]) {
      const source = readSource(file);
      assert.match(source, /useFloatingWindowDrag\(\{/, `${file} must use the shared drag`);
      assert.doesNotMatch(
        source,
        /isDraggingMove/,
        `${file} must not keep its own copy of the drag state`
      );
    }
  });

  test('useSplitter still exposes the API its callers and tests rely on', () => {
    const source = readSource('src/composables/useSplitter.ts');
    for (const exported of ['size', 'isDragging', 'onPointerDown', 'onPointerMove', 'onPointerUp']) {
      assert.ok(source.includes(exported), `useSplitter must still expose ${exported}`);
    }
  });

  test('reordering a tab strip plays a FLIP pass instead of a jump cut', () => {
    const flip = readSource('src/composables/useFlip.ts');
    assert.match(flip, /prefersReducedMotion\(\)\) return/, 'FLIP must bail out under reduced motion');
    assert.match(flip, /el\.style\.transition = 'none'/, 'FLIP must suppress the element transition');

    for (const file of [
      'src/components/layout/AppMain.vue',
      'src/components/layout/AppBottomPanel.vue',
    ]) {
      const source = readSource(file);
      assert.match(source, /captureFlipRects\(/, `${file} must capture the pre-reorder layout`);
      assert.match(source, /playFlip\(/, `${file} must play the reorder`);
      assert.match(source, /data-flip-key/, `${file} must key its tabs for the FLIP pass`);
      assert.doesNotMatch(
        source,
        /setTimeout\(\(\) => \{\s*isPointerDragging/,
        `${file} must not keep a timer on the release path`
      );
    }
  });

  test('no component depends on animation utilities this project does not install', () => {
    // `animate-in` / `zoom-in-95` come from tailwindcss-animate, which is not a dependency, and
    // `scale-102` is not a Tailwind scale step. Both used to render nothing at all.
    const files = [
      'src/components/layout/AppMain.vue',
      'src/components/layout/AppBottomPanel.vue',
      'src/components/editor/ErDiagramViewer.vue',
      'src/components/modals/DataViewFloatingPill.vue',
    ];

    for (const file of files) {
      // Comments are allowed to talk about the utilities; only the markup matters.
      const source = readSource(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/<!--[\s\S]*?-->/g, '');
      assert.doesNotMatch(
        source,
        /animate-in|zoom-in-9/,
        `${file} must not use tailwindcss-animate utilities`
      );
      assert.doesNotMatch(source, /scale-102\b/, `${file} must not use a non-existent scale step`);
    }
  });
});

describe('Floating surfaces stay anchored and legible', () => {
  test('the ER edge menu scales out of the point that opened it', () => {
    const source = readSource('src/components/editor/ErDiagramViewer.vue');
    assert.match(source, /transformOrigin:/);
    assert.match(source, /edgeMenu\.originX = e\.clientX - edgeMenu\.x/);
    assert.match(source, /\.sq-menu-in \{/);
  });

  test('the stacked pill stacks with a transform, not a layout property', () => {
    const source = readSource('src/components/modals/DataViewFloatingPill.vue');
    assert.match(source, /transition-transform/);
    assert.doesNotMatch(source, /transition-\[bottom\]/);
    assert.match(source, /motion-reduce:transition-none/);
  });
});
});

describe('window_geometry', () => {
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
});
