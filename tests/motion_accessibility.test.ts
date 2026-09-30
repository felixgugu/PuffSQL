import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

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
    assert.match(block, /\.p-dialog-enter-active/);
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
    assert.match(block, /\.p-button:not\(:disabled\):not\(\.p-disabled\):active/);
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
