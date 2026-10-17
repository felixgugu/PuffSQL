import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { useContextMenu } from '../src/composables/useContextMenu';
import { DEFAULT_TOAST_LIFE, useToastStore } from '../src/stores/toastStore';
import { placePanel, placeTooltip } from '../src/utils/popoverPlacement';
import { readSource } from './helpers/source';

describe('popover_placement', () => {
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
    const source = readSource('src/components/ui/SqPopover.vue');

    assert.match(source, /import \{ placePanel \} from '@\/utils\/popoverPlacement'/, 'uses the helper');
    assert.match(source, /placePanel\(\{/, 'computes the position through the helper');
    assert.match(source, /document\.addEventListener\('pointerdown', onPointerDown, true\)/, 'closes on outside pointer-down');
    assert.match(source, /event\.key === 'Escape'/, 'closes on Escape');
    assert.match(source, /window\.addEventListener\('scroll', onWindowChange, true\)/, 'follows scroll (capture)');
    assert.match(source, /onBeforeUnmount\(unbindListeners\)/, 'removes its listeners with the component');
  });

  test('SqMenu owns the keyboard contract for menu items', () => {
    const source = readSource('src/components/ui/SqMenu.vue');

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
    const source = readSource('src/components/ui/SqMenu.vue');

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
});

describe('tooltip_directive', () => {
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
});

describe('toast_queue', () => {
describe('the toast queue (replaces PrimeVue Toast)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  test('several reports in quick succession each keep their own card', () => {
    const toasts = useToastStore();

    toasts.add({ summary: '已複製', severity: 'success' });
    toasts.add({ summary: '已開啟新分頁', severity: 'info' });

    assert.equal(toasts.items.length, 2, 'the second toast must not replace the first');
    assert.deepEqual(
      toasts.items.map((item) => item.severity),
      ['success', 'info']
    );
  });

  test('a toast carries a summary line and defaults to a three second life', () => {
    const toasts = useToastStore();
    toasts.add({ summary: '提示', detail: '已複製「CustomerName」的值至剪貼簿' });

    assert.equal(toasts.items[0]!.summary, '提示');
    assert.equal(toasts.items[0]!.detail, '已複製「CustomerName」的值至剪貼簿');
    assert.equal(toasts.items[0]!.life, DEFAULT_TOAST_LIFE);
  });

  test('a zero life stays until it is dismissed', async () => {
    const toasts = useToastStore();
    const id = toasts.add({ summary: '需要處理', severity: 'error', life: 0 });

    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(toasts.items.length, 1, 'life 0 must not schedule a dismissal');

    toasts.remove(id);
    assert.equal(toasts.items.length, 0);
  });

  test('a toast leaves on its own', async () => {
    const toasts = useToastStore();
    toasts.add({ summary: '很快就好', life: 10 });

    assert.equal(toasts.items.length, 1);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(toasts.items.length, 0);
  });

  test('the stack is capped so the newest report is always visible', () => {
    const toasts = useToastStore();
    for (let i = 0; i < 6; i += 1) toasts.add({ summary: `訊息 ${i}`, life: 0 });

    assert.equal(toasts.items.length, 4, 'four cards is as deep as the stack goes');
    assert.equal(toasts.items[0]!.summary, '訊息 2', 'the oldest ones retired early');
    assert.equal(toasts.items[3]!.summary, '訊息 5', 'the newest one is still up');
  });

  test('clearing drops every card and cancels its timer', async () => {
    const toasts = useToastStore();
    toasts.add({ summary: 'a', life: 10 });
    toasts.add({ summary: 'b', life: 10 });
    toasts.clear();

    assert.equal(toasts.items.length, 0);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(toasts.items.length, 0, 'a cancelled timer must not resurrect an entry');
  });
});

describe('the toast surface', () => {
  test('no component imports the PrimeVue toast service any more', () => {
    for (const file of ['src/App.vue', 'src/components/modals/AiSqlChatModal.vue', 'src/main.ts']) {
      assert.doesNotMatch(readSource(file), /primevue\/toast|primevue\/usetoast/, `${file} still uses PrimeVue Toast`);
    }
    assert.doesNotMatch(readSource('src/assets/main.css'), /\.p-toast/, 'the PrimeVue toast CSS is gone');
  });

  test('severity is carried by an icon and a bar, never by colour alone', () => {
    const component = readSource('src/components/ui/SqToast.vue');

    assert.match(component, /SEVERITY_ICONS/);
    for (const severity of ['info', 'success', 'warn', 'error']) {
      assert.match(component, new RegExp(`^\\s+${severity}: `, 'm'), `missing icon for ${severity}`);
    }
    assert.match(component, /\.sq-toast__item::before \{[\s\S]*?width: 3px;/, 'SPEC §7 3px severity bar');
    assert.match(component, /\.sq-toast__item--error::before \{[\s\S]*?--color-danger/);
    assert.match(component, /box-shadow: var\(--shadow-raised\)/, 'the toast is a floating layer');
    assert.match(component, /role="alert"/, 'errors announce themselves');
    assert.match(component, /aria-live="polite"/, 'the rest wait for a polite pause');
  });

  test('the toast stack lives bottom-right above the status bar and takes no stray clicks', () => {
    const component = readSource('src/components/ui/SqToast.vue');

    assert.match(component, /bottom: 2rem;/);
    assert.match(component, /right: 1rem;/);
    assert.match(component, /z-index: 12000;/);
    assert.match(component, /pointer-events: none;/, 'the corridor between cards is click-through');
    assert.match(component, /\.sq-toast__item \{[\s\S]*?pointer-events: auto;/);
  });
});
});

describe('layer_order', () => {

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
});
