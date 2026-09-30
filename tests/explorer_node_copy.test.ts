import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe('Explorer tree nodes: copy name via hover + Ctrl/Cmd + C', () => {
  test('the composable tracks the hovered node and copies through the clipboard', () => {
    const source = readSource('src/composables/useExplorerNodeCopy.ts');

    assert.match(
      source,
      /export function useExplorerNodeCopy\(\)/,
      'the copy behaviour must live in the reusable composable'
    );
    assert.match(
      source,
      /navigator\.clipboard\?\.writeText\(text\)/,
      'the composable should write the node name to the clipboard'
    );
    assert.match(
      source,
      /window\.addEventListener\('keydown', handleKeydown\)/,
      'the composable should listen for the copy shortcut'
    );
  });

  test('the copy shortcut is guarded against inputs, modifiers and empty targets', () => {
    const source = readSource('src/composables/useExplorerNodeCopy.ts');

    assert.match(
      source,
      /event\.key !== 'c' && event\.key !== 'C'/,
      'only the C key should trigger the copy shortcut'
    );
    const guardIdx = source.indexOf('if (isEditableTarget(event.target)) return;');
    const preventIdx = source.indexOf('event.preventDefault()');
    const copyIdx = source.indexOf('copyName(name)', preventIdx);

    assert.ok(guardIdx !== -1, 'the handler must ignore editable targets');
    assert.ok(preventIdx !== -1, 'the handler must prevent the native copy once it owns the gesture');
    assert.ok(
      guardIdx < preventIdx && guardIdx < copyIdx,
      'the editable guard must run before preventing defaults or copying'
    );
    assert.match(
      source,
      /tag === 'input' \|\| tag === 'textarea' \|\| tag === 'select'/,
      'form fields must keep their native clipboard behaviour'
    );
    assert.match(
      source,
      /el\.isContentEditable === true/,
      'contenteditable surfaces such as the editor must be excluded'
    );
  });

  test('AppSidebar wires hover tracking on every supported node type', () => {
    const source = readSource('src/components/layout/AppSidebar.vue');

    assert.match(
      source,
      /const \{ setHovered, clearHovered, copyName \} = useExplorerNodeCopy\(\);/,
      'AppSidebar should instantiate the copy composable'
    );
    assert.ok(
      countOccurrences(source, '@mouseenter="setHovered(') >= 5,
      'tables, views, columns, procedures and functions should all set the hovered name'
    );
    assert.equal(
      countOccurrences(source, '@mouseleave="clearHovered"'),
      countOccurrences(source, '@mouseenter="setHovered('),
      'every hovered node should clear its hover state on mouse leave'
    );
  });

  test('AppSidebar exposes a Copy Name entry for objects and columns', () => {
    const source = readSource('src/components/layout/AppSidebar.vue');

    assert.match(
      source,
      /function openColumnContextMenu\(event: MouseEvent, col: ColumnItem\)/,
      'columns should open their own context menu'
    );
    assert.match(
      source,
      /<ContextMenu ref="columnMenuRef" :model="columnMenuItems" \/>/,
      'the column context menu must be mounted'
    );
    assert.ok(
      countOccurrences(source, "t('sidebar.copyName')") >= 2,
      'both the object menu and the column menu should offer Copy Name'
    );
    assert.ok(
      countOccurrences(source, '@contextmenu.prevent="openColumnContextMenu(') >= 2,
      'both table and view columns should bind the column context menu'
    );
  });

  test('the toast message exists in both locales with a matching placeholder', () => {
    const en = readSource('src/i18n/locales/en.ts');
    const zh = readSource('src/i18n/locales/zh-TW.ts');

    assert.match(en, /nameCopied: 'Copied name: \{name\}'/, 'en must define nameCopied');
    assert.match(zh, /nameCopied: '已複製名稱：\{name\}'/, 'zh-TW must define nameCopied');
  });
});
