import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

/**
 * The working chrome carries no brand mark. A logo next to the connection picker and a fish in the
 * status bar are both decoration in a screen whose job is data; the product identifies itself in
 * the About panel, where a name and a version are the point.
 */
describe('brand marks', () => {
  test('the title bar has no logo cell', () => {
    const source = readSource('src/components/layout/AppHeader.vue');

    assert.doesNotMatch(source, /appIcon/, 'the header must not import or render the icon asset');
    assert.doesNotMatch(source, /<img\b/, 'no image belongs in the title bar');
    assert.doesNotMatch(
      source,
      /min-w-\[40px\]/,
      'the brand cell (and its width floor) is gone with the logo'
    );
    // The row keeps its contract: 40px tall, draggable, with the picker starting at the padding.
    assert.match(source, /data-tauri-drag-region="deep"/);
    assert.match(source, /class="h-10 bg-dark-850 border-b border-dark-700/);
  });

  test('the status bar shows the name and version as text, not a mark', () => {
    const source = readSource('src/components/layout/AppStatusBar.vue');

    assert.match(source, /PuffSQL v\{\{ appVersion \}\}/, 'the version stays readable');
    assert.doesNotMatch(source, /🐡|⭐|🚀/, 'no emoji stands in for a brand mark');
    assert.doesNotMatch(source, /<img\b/, 'the status bar is a single 24px line of text');
  });

  test('the About panel still carries the official icon', () => {
    // The one place identity belongs. It reuses the Tauri icon set rather than a duplicate copy.
    const source = readSource('src/components/modals/SettingsModal.vue');
    assert.match(source, /import appIcon from '\.\.\/\.\.\/\.\.\/src-tauri\/icons\/64x64\.png'/);
    assert.match(source, /<img[\s\S]*?:src="appIcon"[\s\S]*?alt="PuffSQL"/);

    assert.ok(existsSync(resolve(root, 'src-tauri/icons/64x64.png')), 'the Tauri 64px icon must exist');
    assert.ok(
      !existsSync(resolve(root, 'src/assets/app-icon.svg')) &&
        !existsSync(resolve(root, 'src/assets/app-icon-mark.svg')),
      'no duplicated brand icon should live in src/assets'
    );
  });

  test('no component renders an emoji as a structural icon', () => {
    const offenders: string[] = [];

    // Emoji in the two chrome strips are what this replaced; keep the scan narrow and explicit.
    for (const file of [
      'src/components/layout/AppHeader.vue',
      'src/components/layout/AppStatusBar.vue',
    ]) {
      const source = readSource(file);
      const template = source.slice(0, source.indexOf('</template>'));
      const matches = template.match(/[\u{1F300}-\u{1FAFF}]/gu) ?? [];
      if (matches.length > 0) offenders.push(`${file}: ${matches.join(' ')}`);
    }

    assert.deepEqual(offenders, [], 'the shell uses vector icons or nothing');
  });
});
