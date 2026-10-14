import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

function readJson(relativePath: string): any {
  return JSON.parse(readSource(relativePath));
}

describe('custom window title bar (Windows)', () => {
  test('base config keeps native decorations and raises minWidth to 1368', () => {
    const config = readJson('src-tauri/tauri.conf.json');
    const window = config.app.windows[0];

    assert.equal(window.decorations, true, 'non-Windows platforms should keep native decorations');
    assert.equal(window.minWidth, 1368);
    assert.equal(window.resizable, true);
    assert.equal(window.title, 'PuffSQL - Lightweight SQL Client', 'window title stays for taskbar / Alt+Tab');
  });

  test('windows platform config hides decorations without changing other window fields', () => {
    const base = readJson('src-tauri/tauri.conf.json');
    const windows = readJson('src-tauri/tauri.windows.conf.json');

    // Platform configs are merged with JSON Merge Patch, so arrays are replaced wholesale and
    // the windows file has to repeat the full window definition.
    assert.equal(windows.app.windows.length, 1);
    assert.equal(windows.app.windows[0].decorations, false);
    assert.deepEqual(
      windows.app.windows[0],
      { ...base.app.windows[0], decorations: false },
      'tauri.windows.conf.json must not drift from the base window definition'
    );
  });

  test('capability grants the window control permissions to the main window', () => {
    const capability = readJson('src-tauri/capabilities/default.json');

    assert.equal(capability.windows.length, 1);
    assert.equal(capability.windows[0], 'main');

    const permissions: string[] = capability.permissions;
    for (const permission of [
      'core:default',
      'core:window:allow-start-dragging',
      'core:window:allow-minimize',
      'core:window:allow-toggle-maximize',
      'core:window:allow-close',
    ]) {
      assert.ok(permissions.includes(permission), `${permission} should be granted`);
    }
  });

  test('AppHeader turns the toolbar into a drag region and hosts the window controls', () => {
    const source = readSource('src/components/layout/AppHeader.vue');

    assert.match(source, /data-tauri-drag-region="deep"/, 'empty toolbar areas should drag the window');
    // The title bar is a plain flex row now (PrimeVue Toolbar retired in P5); it must still keep
    // its groups from wrapping so a squeezed window hides buttons instead of growing the bar.
    assert.match(
      source,
      /class="[^"]*flex items-center justify-between gap-2[^"]*"/,
      'the title bar stays a single non-wrapping row'
    );
    assert.match(source, /select-none flex-shrink-0/, 'the title bar must not shrink');
    assert.match(
      source,
      /class="flex items-center justify-end space-x-1 min-w-0 overflow-hidden"/,
      'end group should clip squeezed buttons so the window controls stay visible'
    );
    assert.match(source, /const showWindowControls = windowService\.isCustomTitleBar\(\)/);

    assert.match(
      source,
      /<!-- End: Actions Toolbar & Settings -->[\s\S]*?<WindowControls v-if="showWindowControls" \/>[\s\S]*?<\/div>\s*<\/div>\s*<\/template>/,
      'window controls must stay inside the end group of the title bar'
    );
  });

  test('WindowControls wires minimize, restore/maximize and close with accessible labels', () => {
    const source = readSource('src/components/layout/WindowControls.vue');

    for (const marker of [
      'windowService.minimize()',
      'windowService.toggleMaximize()',
      'windowService.close()',
      'windowService.isMaximized()',
      'windowService.onResized(',
    ]) {
      assert.ok(source.includes(marker), `${marker} should be wired in WindowControls`);
    }

    assert.match(source, /aria-label="最小化"/);
    assert.match(source, /:aria-label="isMaximized \? '還原' : '最大化'"/);
    assert.match(source, /aria-label="關閉"/);
    assert.ok(source.includes('w-[46px] shrink-0 h-10'), 'caption buttons should use the Windows 11 46x40 sizing');
    assert.equal(
      (source.match(/w-\[46px\] shrink-0 h-10/g) ?? []).length,
      3,
      'all three caption buttons must stay rigid so they never get squeezed'
    );
    assert.match(source, /hover:bg-\[#c42b1c\]/, 'close button should use the Windows 11 close hover color');
  });

  test('windowService keeps a browser fallback for every window call', () => {
    const source = readSource('src/services/windowService.ts');

    assert.match(source, /import \{ isTauri \} from '\.\/api'/);
    assert.match(source, /await import\('@tauri-apps\/api\/window'\)/, 'window API should be lazily loaded');
    const resolver = /async function resolveWindow\(\): Promise<Window \| null> \{[\s\S]*?if \(!isTauri\(\)\) return null;/.test(source);
    assert.ok(resolver, 'the shared window resolver should fall back in browser environments');
    for (const method of ['isMaximized', 'minimize', 'toggleMaximize', 'close', 'onResized']) {
      assert.ok(source.includes(`async ${method}(`), `${method} should be exposed by windowService`);
    }
    assert.match(source, /export const windowService/);
  });
});
