import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { useToastStore, DEFAULT_TOAST_LIFE } from '../src/stores/toastStore';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

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
