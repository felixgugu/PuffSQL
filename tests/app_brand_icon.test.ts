import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

describe('AppHeader brand icon', () => {
  test('the SQLight wordmark is replaced by the application icon', () => {
    const source = readSource('src/components/layout/AppHeader.vue');

    assert.match(
      source,
      /import appIcon from '\.\.\/\.\.\/\.\.\/src-tauri\/icons\/64x64\.png'/,
      'the brand should use the icon asset shipped with the Tauri app'
    );
    assert.match(source, /:src="appIcon"/);
    assert.match(source, /alt="PuffSQL"/, 'the icon needs an accessible name');
    assert.match(source, /draggable="false"/, 'the icon must not start a native image drag inside the title bar');
    assert.doesNotMatch(source, />SQLight<\/span>/, 'the text brand should be gone');
  });

  test('the brand reuses the Tauri icon set instead of a duplicated copy', () => {
    assert.ok(existsSync(resolve(root, 'src-tauri/icons/64x64.png')), 'the Tauri 64px icon must exist');
    assert.ok(
      !existsSync(resolve(root, 'src/assets/app-icon.svg')) && !existsSync(resolve(root, 'src/assets/app-icon-mark.svg')),
      'no duplicated brand icon should live in src/assets'
    );
  });

  test('the brand icon fills the toolbar row and bleeds to the top/left/bottom edges', () => {
    const source = readSource('src/components/layout/AppHeader.vue');

    assert.match(
      source,
      /class="h-10 w-10 select-none"/,
      'the icon must fill the full 40px row height so no gap is left above or below it'
    );
    assert.match(
      source,
      /class="flex items-center justify-center h-10 min-w-\[40px\] flex-shrink-0 -ml-\[11px\] pr-2 border-r border-dark-700"/,
      'the brand cell must span the row, cancel the toolbar 10px padding + 1px left border and keep the divider'
    );
    assert.match(
      source,
      /class="h-10 bg-dark-850 border-b border-dark-700/,
      'the title bar row height itself must stay at 40px (plain flex row since P5)'
    );
  });

  test('the brand cell keeps a width floor and never shrinks', () => {
    const source = readSource('src/components/layout/AppHeader.vue');

    assert.match(
      source,
      /class="[^"]*min-w-\[40px\][^"]*flex-shrink-0[^"]*border-r border-dark-700[^"]*"/,
      'the brand cell must not collapse when the toolbar is squeezed'
    );
  });

  test('SettingsModal about tab renders the official brand icon', () => {
    const source = readSource('src/components/modals/SettingsModal.vue');
    assert.match(
      source,
      /import appIcon from '\.\.\/\.\.\/\.\.\/src-tauri\/icons\/64x64\.png'/,
      'SettingsModal should import the official app icon'
    );
    assert.match(
      source,
      /<img[\s\S]*?:src="appIcon"[\s\S]*?alt="PuffSQL"/,
      'SettingsModal about tab must render the official brand icon'
    );
  });
});
