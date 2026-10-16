/**
 * explorer — merged from explorer_filter_history, explorer_node_copy, explorer_tree_state:
 * one file per component and layer instead of 3 files that all read the same sources.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { collapseAllTreeNodes, type ExplorerTreeState } from '../src/utils/explorerTreeState';
import { MAX_FILTER_HISTORY_ITEMS, STORAGE_EXPLORER_FILTER_HISTORY_KEY, addFilterHistoryItem, clearFilterHistory, loadFilterHistory, removeFilterHistoryItem, saveFilterHistory } from '../src/utils/filterHistory';
import { countOccurrences, readSource } from './helpers/source';

describe('explorer_filter_history', () => {
class MockStorage implements Storage {
  private store: Map<string, string> = new Map();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('filterHistory utility', () => {
  let mockStorage: MockStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();
  });

  test('loadFilterHistory: returns empty array when storage is empty', () => {
    const history = loadFilterHistory(mockStorage);
    assert.deepEqual(history, []);
  });

  test('loadFilterHistory: parses saved valid JSON array', () => {
    mockStorage.setItem(STORAGE_EXPLORER_FILTER_HISTORY_KEY, JSON.stringify(['Users', 'Orders']));
    const history = loadFilterHistory(mockStorage);
    assert.deepEqual(history, ['Users', 'Orders']);
  });

  test('loadFilterHistory: handles corrupted or invalid JSON gracefully', () => {
    mockStorage.setItem(STORAGE_EXPLORER_FILTER_HISTORY_KEY, '{invalid json}');
    const history = loadFilterHistory(mockStorage);
    assert.deepEqual(history, []);
  });

  test('loadFilterHistory: filters out non-strings and empty strings', () => {
    mockStorage.setItem(
      STORAGE_EXPLORER_FILTER_HISTORY_KEY,
      JSON.stringify(['Users', '', '   ', 123, null, 'Orders'])
    );
    const history = loadFilterHistory(mockStorage);
    assert.deepEqual(history, ['Users', 'Orders']);
  });

  test('addFilterHistoryItem: trims whitespace and adds to the front', () => {
    let history: string[] = [];
    history = addFilterHistoryItem(history, '  Orders  ');
    assert.deepEqual(history, ['Orders']);

    history = addFilterHistoryItem(history, 'Customers');
    assert.deepEqual(history, ['Customers', 'Orders']);
  });

  test('addFilterHistoryItem: ignores empty or whitespace-only inputs', () => {
    const history = ['Orders'];
    assert.deepEqual(addFilterHistoryItem(history, ''), ['Orders']);
    assert.deepEqual(addFilterHistoryItem(history, '   '), ['Orders']);
  });

  test('addFilterHistoryItem: deduplicates case-insensitively and promotes to front (LRU)', () => {
    let history = ['Orders', 'Users', 'Products'];
    // Adding 'users' (different case) should remove 'Users' from middle and put 'users' at front
    history = addFilterHistoryItem(history, 'users');
    assert.deepEqual(history, ['users', 'Orders', 'Products']);
  });

  test('addFilterHistoryItem: strictly caps at 30 items', () => {
    let history: string[] = [];
    for (let i = 1; i <= 35; i++) {
      history = addFilterHistoryItem(history, `Filter_${i}`);
    }

    assert.equal(history.length, MAX_FILTER_HISTORY_ITEMS);
    assert.equal(history.length, 30);
    // The most recent one should be at the front
    assert.equal(history[0], 'Filter_35');
    // The 30th item should be Filter_6 (Filter_1..Filter_5 were pushed out)
    assert.equal(history[29], 'Filter_6');
    assert.ok(!history.includes('Filter_5'));
  });

  test('removeFilterHistoryItem: removes specified item case-insensitively', () => {
    const history = ['Users', 'Orders', 'Products'];
    const updated = removeFilterHistoryItem(history, 'orders');
    assert.deepEqual(updated, ['Users', 'Products']);
  });

  test('saveFilterHistory and clearFilterHistory: correctly interact with storage', () => {
    const history = ['Table1', 'Table2'];
    saveFilterHistory(history, mockStorage);

    assert.equal(
      mockStorage.getItem(STORAGE_EXPLORER_FILTER_HISTORY_KEY),
      JSON.stringify(['Table1', 'Table2'])
    );

    clearFilterHistory(mockStorage);
    assert.equal(mockStorage.getItem(STORAGE_EXPLORER_FILTER_HISTORY_KEY), null);
    assert.deepEqual(loadFilterHistory(mockStorage), []);
  });

  test('AppSidebar.vue template and script integration for ComboBox and clear button', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const sidebarCode = fs.readFileSync(
      path.join(process.cwd(), 'src/components/layout/AppSidebar.vue'),
      'utf-8'
    );

    // Clear button (X)
    assert.ok(sidebarCode.includes('clearFilter'), 'AppSidebar should define clearFilter handler');
    assert.ok(sidebarCode.includes('v-if="filterQuery"'), 'AppSidebar should conditionally render clear button');

    // ComboBox toggle button and dropdown
    assert.ok(sidebarCode.includes('toggleHistoryDropdown'), 'AppSidebar should define toggleHistoryDropdown');
    assert.ok(sidebarCode.includes('isHistoryDropdownOpen'), 'AppSidebar should track dropdown open state');
    assert.ok(sidebarCode.includes('filterHistory'), 'AppSidebar should have reactive filterHistory list');

    // ComboBox item actions
    assert.ok(sidebarCode.includes('selectHistoryItem'), 'AppSidebar should support selecting history items');
    assert.ok(sidebarCode.includes('handleRemoveHistoryItem'), 'AppSidebar should support deleting single history item');
    assert.ok(sidebarCode.includes('handleClearAllHistory'), 'AppSidebar should support clearing all history');

    // Keyboard navigation
    assert.ok(sidebarCode.includes('handleKeyDown'), 'AppSidebar should handle Down Arrow navigation');
    assert.ok(sidebarCode.includes('handleKeyUp'), 'AppSidebar should handle Up Arrow navigation');
    assert.ok(sidebarCode.includes('handleKeyEnter'), 'AppSidebar should handle Enter commit/selection');
    assert.ok(sidebarCode.includes('handleKeyEsc'), 'AppSidebar should handle Escape to close or clear');

    // Outside click & debounce watcher
    assert.ok(sidebarCode.includes('handleDocumentPointerDown'), 'AppSidebar should handle outside pointerdown');
    assert.ok(sidebarCode.includes('debounceRecordTimer'), 'AppSidebar should debounce recording user input');
  });
});
});

describe('explorer_node_copy', () => {
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
      /:items="columnMenuItems"/,
      'the column context menu must be mounted (SqMenu since the P5 migration)'
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
});
});

describe('explorer_tree_state', () => {
describe('explorerTreeState utility', () => {
  test('collapseAllTreeNodes: collapses all connections, databases, folders, and tables', () => {
    const state: ExplorerTreeState = {
      expandedConns: {
        'conn-1': true,
        'conn-2': true,
      },
      expandedDbs: {
        'conn-1:dbA': true,
        'conn-1:dbB': true,
        'conn-2:dbC': true,
      },
      expandedFolders: {
        'conn-1:dbA:tables': true,
        'conn-1:dbA:views': true,
        'conn-1:dbA:procs': true,
      },
      expandedTables: {
        'conn-1:dbA:dbo.Users': true,
        'conn-1:dbA:dbo.Orders': true,
        'conn-2:dbC:sales.Customers': true,
      },
    };

    collapseAllTreeNodes(state);

    // Verify connections collapsed
    assert.deepEqual(state.expandedConns, {
      'conn-1': false,
      'conn-2': false,
    });

    // Verify databases collapsed
    assert.deepEqual(state.expandedDbs, {
      'conn-1:dbA': false,
      'conn-1:dbB': false,
      'conn-2:dbC': false,
    });

    // Verify folders reset
    assert.deepEqual(state.expandedFolders, {});

    // Verify tables collapsed
    assert.deepEqual(state.expandedTables, {
      'conn-1:dbA:dbo.Users': false,
      'conn-1:dbA:dbo.Orders': false,
      'conn-2:dbC:sales.Customers': false,
    });
  });

  test('collapseAllTreeNodes: respects collapseConnections = false', () => {
    const state: ExplorerTreeState = {
      expandedConns: {
        'conn-1': true,
        'conn-2': true,
      },
      expandedDbs: {
        'conn-1:dbA': true,
      },
      expandedFolders: {
        'conn-1:dbA:views': true,
      },
      expandedTables: {
        'conn-1:dbA:dbo.Users': true,
      },
    };

    collapseAllTreeNodes(state, { collapseConnections: false });

    // Connections should remain true
    assert.equal(state.expandedConns['conn-1'], true);
    assert.equal(state.expandedConns['conn-2'], true);

    // Databases, folders, and tables should be collapsed
    assert.equal(state.expandedDbs['conn-1:dbA'], false);
    assert.deepEqual(state.expandedFolders, {});
    assert.equal(state.expandedTables['conn-1:dbA:dbo.Users'], false);
  });

  test('collapseAllTreeNodes: explicitly marks knownConnectionIds as false', () => {
    const state: ExplorerTreeState = {
      expandedConns: {
        'conn-1': true,
      },
      expandedDbs: {},
      expandedFolders: {},
      expandedTables: {},
    };

    collapseAllTreeNodes(state, {
      collapseConnections: true,
      knownConnectionIds: ['conn-1', 'conn-2', 'conn-3'],
    });

    assert.equal(state.expandedConns['conn-1'], false);
    assert.equal(state.expandedConns['conn-2'], false);
    assert.equal(state.expandedConns['conn-3'], false);
  });

  test('collapseAllTreeNodes: handles empty records gracefully', () => {
    const state: ExplorerTreeState = {
      expandedConns: {},
      expandedDbs: {},
      expandedFolders: {},
      expandedTables: {},
    };

    assert.doesNotThrow(() => {
      collapseAllTreeNodes(state);
    });

    assert.deepEqual(state.expandedConns, {});
    assert.deepEqual(state.expandedDbs, {});
    assert.deepEqual(state.expandedFolders, {});
    assert.deepEqual(state.expandedTables, {});
  });
});
});
