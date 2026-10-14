import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hexToRgba, transientHighlightColors } from '../src/utils/highlightColor';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useQueryStore } from '../src/stores/queryStore';
import { queryService } from '../src/services/queryService';
import { setActivePinia, createPinia } from 'pinia';

const root = process.cwd();

const storageData = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key) => storageData.get(key) ?? null,
  setItem: (key, value) => { storageData.set(key, String(value)); },
  removeItem: (key) => { storageData.delete(key); },
  clear: () => storageData.clear(),
  key: () => null,
  length: 0,
};

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

describe('transient highlight colour', () => {
  test('converts the configured hex into the editor wash alphas', () => {
    assert.equal(hexToRgba('#feffe0', 0.22), 'rgba(254, 255, 224, 0.22)');
    assert.equal(hexToRgba('#ffffff', 1), 'rgba(255, 255, 255, 1)');

    const colors = transientHighlightColors('#feffe0');
    assert.equal(colors.background, 'rgba(254, 255, 224, 0.22)');
    assert.equal(colors.border, 'rgba(254, 255, 224, 0.85)');
  });

  test('accepts short hex and tolerates malformed input', () => {
    assert.equal(hexToRgba('#abc', 0.22), 'rgba(170, 187, 204, 0.22)');
    assert.equal(hexToRgba('', 0.22), 'rgba(254, 255, 224, 0.22)');
    assert.equal(hexToRgba('#fe', 0.22), 'rgba(254, 255, 224, 0.22)');
    assert.equal(hexToRgba('nope', 0.22), 'rgba(254, 255, 224, 0.22)');
  });

  test('the setting keeps the editor default', () => {
    setActivePinia(createPinia());
    assert.equal(useSettingsStore().editorHighlightColor, '#feffe0');
  });
});

describe('message log transient flash', () => {
  test('ResultMessages flashes new messages with the configured colour', () => {
    const source = readSource('src/components/results/ResultMessages.vue');

    assert.match(
      source,
      /transientHighlightColors\(\s*settingsStore\.editorHighlightColor/,
      'the flash must read the 執行暫態高亮顏色 setting'
    );
    assert.match(source, /'--sq-flash-bg': background/, 'the wash colour is passed as a variable');
    assert.match(source, /'--sq-flash-border': border/, 'the leading edge is passed as a variable');
    assert.match(
      source,
      /'sq-message-flash': isFlashing\(getMsgKey\(msg, idx\)\)/,
      'the flash class is driven per message key'
    );
  });

  test('new messages are recognised by arrival, not by mount order', () => {
    const source = readSource('src/components/results/ResultMessages.vue');

    assert.match(source, /const FLASH_ARRIVAL_WINDOW_MS = 4000;/, 'the arrival window is bounded');
    assert.match(source, /const FLASH_DURATION_MS = 3000;/, 'the wash lasts a few seconds');
    assert.match(source, /animation: sqMessageFlash \d+ms/, 'the wash fades out on its own');
    assert.match(
      source,
      /@media \(prefers-reduced-motion: reduce\)/,
      'the fade must respect reduced motion'
    );
    assert.match(
      source,
      /flashArrivals\(\);\s*watch\(\(\) => props\.messages\.length, flashArrivals\);/,
      'the panel flashes what just arrived as well as what lands while it stays open'
    );
    assert.match(
      source,
      /if \(flashedKeys\.has\(key\)\) return;/,
      'a message must never flash twice'
    );
    assert.match(
      source,
      /onBeforeUnmount\(\(\) => \{\s*flashTimers\.forEach/,
      'pending flash timers must be cleared with the component'
    );
  });

  test('the editor decoration and the message flash share one colour helper', () => {
    const editor = readSource('src/components/editor/MonacoEditor.vue');
    assert.match(editor, /import \{ transientHighlightColors \} from '@\/utils\/highlightColor'/);
    assert.match(editor, /const \{ background: bg, border \} = transientHighlightColors\(color\)/);
    assert.doesNotMatch(editor, /function hexToRgba/, 'the local copy must be gone');
  });

  test('executing a message-only statement stamps its arrival for the flash', async () => {
    setActivePinia(createPinia());
    queryService.executeQuery = async () => ({
      resultSets: [],
      messages: [
        { level: 'info', message: '(3 rows affected)', timestamp: new Date().toISOString() },
      ],
      affectedRows: 3,
      executionTimeMs: 4,
    });

    const before = Date.now();
    await useQueryStore().execute('conn-1', 'master', 'UPDATE t SET a = 1;');

    const message = useQueryStore().sessionMessages[0];
    assert.ok(message, 'the UPDATE message lands in the session log');
    assert.equal(message!.message, '(3 rows affected)');
    assert.equal(typeof message!.freshAt, 'number', 'the arrival stamp drives the flash');
    assert.ok(message!.freshAt! >= before, 'the stamp comes from the local clock');
    assert.ok(Date.now() - message!.freshAt! < 4000, 'it is still inside the arrival window');
  });
});
