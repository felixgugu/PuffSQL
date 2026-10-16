import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

/** Reads the first `z-N` / `z-index: N` value out of a source file. */
function zIndexOf(source: string, pattern: RegExp): number | null {
  const match = pattern.exec(source);
  return match ? Number(match[1]) : null;
}

/**
 * Layer order is invisible until something overlaps. Monaco draws its editor context menu with
 * `z-index: auto` and the app's splitters and header carry real z-indexes, so the menu used to be
 * painted under the divider between the editor and the results panel. These assertions state the
 * order the app relies on, reading the actual values so a re-scale keeps them honest.
 */
describe('layer order', () => {
  const splitter = zIndexOf(readSource('src/components/common/ResizableSplitter.vue'), /group z-(\d+)/);
  const header = zIndexOf(readSource('src/components/layout/AppHeader.vue'), /z-(\d+)/);
  const menuLayer = zIndexOf(readSource('src/components/ui/SqPopover.vue'), /z-index:\s*(\d+)/);

  test('the app layers are ordered chrome → menus → windows → tooltips → toasts', () => {
    assert.ok(splitter !== null && header !== null && menuLayer !== null, 'every layer must declare a z-index');
    assert.ok(splitter! < header!, 'the header sits above the splitters');
    assert.ok(header! < menuLayer!, 'menus sit above the chrome');

    const tooltip = zIndexOf(readSource('src/assets/main.css'), /\.sq-tooltip \{[\s\S]*?z-index:\s*(\d+)/);
    const toast = zIndexOf(readSource('src/components/ui/SqToast.vue'), /z-index:\s*(\d+)/);
    assert.ok(tooltip !== null && toast !== null, 'tooltips and toasts declare a z-index');
    assert.ok(menuLayer! < tooltip!, 'tooltips stay above menus');
    assert.ok(menuLayer! < toast!, 'toasts stay above menus');
  });

  test('the Monaco editor menu is lifted onto the menu layer, fixed variant included', () => {
    const css = readSource('src/assets/main.css');
    const block = /(\.context-view,[\s\S]*?)\{([^}]*)\}/.exec(css);
    const selectors = block?.[1] ?? '';
    const body = block?.[2] ?? '';

    assert.ok(body.length > 0, 'the shared .context-view rule must exist');
    assert.match(
      body,
      new RegExp(`z-index:\\s*${menuLayer!}\\s*!important`),
      'the editor menu shares the layer SqPopover/SqMenu use'
    );
    assert.match(
      selectors,
      /\.context-view\.fixed/,
      "Monaco's `all: initial` on `.context-view.fixed` must be overridden too"
    );
  });

  test('nothing between the editor and the app root opens a stacking context', () => {
    const editor = readSource('src/components/editor/MonacoEditor.vue');
    const host = /ref="editorContainer"[^>]*class="([^"]*)"/.exec(editor)?.[1] ?? '';
    const shell = /class="(sqlight-editor-shell[^"]*)"/.exec(editor)?.[1] ?? '';

    assert.ok(host.length > 0, 'the Monaco host element must exist');
    assert.ok(shell.length > 0, 'the editor shell element must exist');

    // A z-index (or a transform/filter) on either wrapper makes it a stacking context, and Monaco's
    // `.context-view` — which ships as `z-index: auto` — is then trapped inside it, however high the
    // menu's own z-index is. That is exactly how the right-click menu ended up under the dividers.
    for (const [label, classes] of [['editor host', host], ['editor shell', shell]] as const) {
      assert.doesNotMatch(classes, /(^|\s)z-/, `${label} must not carry a z-index utility`);
      assert.doesNotMatch(classes, /\b(transform|filter|contain|isolate)\b/, `${label} must stay plain`);
    }

    // The reason the host can drop its z-index: the backdrop it sits above is pinned at 0 and the
    // host comes later in tree order.
    assert.match(
      readSource('src/assets/main.css'),
      /\.sqlight-editor-watermark \{[\s\S]*?z-index: 0;/,
      'the watermark stays on its own layer behind the editor'
    );
  });
});
