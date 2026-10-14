import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setActivePinia, createPinia } from 'pinia';
import { useSettingsStore } from '../src/stores/settingsStore.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Mock localStorage for node environment
const storageData = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = {
    getItem: (key: string) => storageData.get(key) || null,
    setItem: (key: string, val: string) => storageData.set(key, val),
    removeItem: (key: string) => storageData.delete(key),
    clear: () => storageData.clear(),
  };
}

beforeEach(() => {
  storageData.clear();
  setActivePinia(createPinia());
});

test('settingsStore: editorAutoCompletion defaults to true, toggles, saves and resets', () => {
  const store = useSettingsStore();

  // 1. Initial default is true
  assert.equal(store.editorAutoCompletion, true);

  // 2. Toggle to false
  store.editorAutoCompletion = false;
  assert.equal(store.editorAutoCompletion, false);

  // 3. Save settings
  store.saveSettings();
  const saved = JSON.parse(storageData.get('sqlight_app_settings') || '{}');
  assert.equal(saved.editorAutoCompletion, false);

  // 4. Reset to defaults restores to true
  store.resetToDefaults();
  assert.equal(store.editorAutoCompletion, true);
});

test('SettingsModal.vue: contains editorAutoCompletion toggle switch in Editor tab', () => {
  const settingsModalPath = path.join(rootDir, 'src/components/modals/SettingsModal.vue');
  const content = fs.readFileSync(settingsModalPath, 'utf8');

  // Verify the switch bound to settingsStore.editorAutoCompletion exists (SqSwitch since P4d)
  assert.match(
    content,
    /SqSwitch\s+v-model="settingsStore\.editorAutoCompletion"/,
    'SettingsModal must have a switch bound to editorAutoCompletion'
  );
});

test('SettingsModal.vue: displays Ctrl+Shift+A for completion shortcut in Keyboard Shortcuts', () => {
  const settingsModalPath = path.join(rootDir, 'src/components/modals/SettingsModal.vue');
  const content = fs.readFileSync(settingsModalPath, 'utf8');

  // Verify shortcut display updated to Ctrl+Shift+A
  assert.match(
    content,
    /Ctrl\+Shift\+A/,
    'SettingsModal shortcuts table must display Ctrl+Shift+A for code completion'
  );
  assert.doesNotMatch(
    content,
    /<kbd[^>]*>\s*Ctrl \+ Space\s*<\/kbd>/,
    'SettingsModal must not list Ctrl + Space as the completion shortcut'
  );
});

test('MonacoEditor.vue: registers Ctrl+Shift+A keybinding and syncs editorAutoCompletion', () => {
  const monacoEditorPath = path.join(rootDir, 'src/components/editor/MonacoEditor.vue');
  const content = fs.readFileSync(monacoEditorPath, 'utf8');

  // Verify Ctrl+Shift+A command is registered
  assert.match(
    content,
    /monaco\.KeyMod\.CtrlCmd\s*\|\s*monaco\.KeyMod\.Shift\s*\|\s*monaco\.KeyCode\.KeyA/,
    'MonacoEditor must bind CtrlCmd + Shift + KeyA'
  );

  // Verify editorAutoCompletion is synced in watch
  assert.match(
    content,
    /settingsStore\.editorAutoCompletion/,
    'MonacoEditor must watch and apply settingsStore.editorAutoCompletion'
  );

  // Verify triggerSuggest is exposed
  assert.match(
    content,
    /triggerSuggest,/,
    'MonacoEditor must expose triggerSuggest'
  );
});
