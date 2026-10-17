import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { useSqlFolderStore } from '../src/stores/sqlFolderStore';
import { useWorkspaceStore } from '../src/stores/workspaceStore';
import { sqlFolderService } from '../src/services/sqlFolderService';
import type { SqlEditorTab } from '../src/types/workspace';

const storageMap = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key) => storageMap.get(key) ?? null,
  setItem: (key, value) => {
    storageMap.set(key, String(value));
  },
  removeItem: (key) => {
    storageMap.delete(key);
  },
  clear: () => storageMap.clear(),
  key: () => null,
  length: 0,
};

beforeEach(() => {
  storageMap.clear();
  setActivePinia(createPinia());
});

test('sqlFolderStore: adds and persists monitored folder', async () => {
  const store = useSqlFolderStore();
  assert.equal(store.monitoredFolders.length, 0);

  const added = await store.addFolder('C:/MyProjects/SQL_Scripts');
  assert.equal(added, true);
  assert.equal(store.monitoredFolders.length, 1);
  assert.equal(store.monitoredFolders[0]?.name, 'SQL_Scripts');
  assert.equal(store.monitoredFolders[0]?.path, 'C:/MyProjects/SQL_Scripts');

  const raw = storageMap.get('sqlight_monitored_sql_folders');
  assert.ok(raw);
  assert.ok(raw.includes('SQL_Scripts'));

  const duplicateAdded = await store.addFolder('C:/MyProjects/SQL_Scripts');
  assert.equal(duplicateAdded, false);
  assert.equal(store.monitoredFolders.length, 1);
});

test('sqlFolderStore: removes folder from monitoring and clears cache', async () => {
  const store = useSqlFolderStore();
  await store.addFolder('C:/MyProjects/SQL_Scripts');
  assert.equal(store.monitoredFolders.length, 1);

  store.removeFolder('C:/MyProjects/SQL_Scripts');
  assert.equal(store.monitoredFolders.length, 0);
  assert.equal(store.folderTrees['C:/MyProjects/SQL_Scripts'], undefined);

  const raw = storageMap.get('sqlight_monitored_sql_folders');
  assert.equal(raw, '[]');
});

test('sqlFolderStore: collapses all expanded nodes', async () => {
  const store = useSqlFolderStore();
  store.expandedNodes['path/a'] = true;
  store.expandedNodes['path/b'] = true;

  store.collapseAll();
  assert.equal(store.expandedNodes['path/a'], false);
  assert.equal(store.expandedNodes['path/b'], false);
});

test('sqlFolderStore: openFile opens SQL in workspace editor and sets filePath', async () => {
  const folderStore = useSqlFolderStore();
  const workspaceStore = useWorkspaceStore();

  const fileNode = {
    name: '01_Init_Tables.sql',
    path: 'C:/MyScripts/SQL/01_Init_Tables.sql',
    is_dir: false,
  };

  await folderStore.openFile(fileNode);

  assert.ok(workspaceStore.activeTab);
  assert.equal(workspaceStore.activeTab?.type, 'sql_editor');
  assert.equal(workspaceStore.activeTab?.title, '01_Init_Tables.sql');

  const sqlTab = workspaceStore.activeTab as SqlEditorTab;
  assert.equal(sqlTab.filePath, 'C:/MyScripts/SQL/01_Init_Tables.sql');
  assert.equal(sqlTab.isDirty, false);

  // Calling openFile again on the same path switches tab without opening duplicate
  const firstTabId = sqlTab.id;
  const initialTabCount = workspaceStore.tabs.length;

  await folderStore.openFile(fileNode);
  assert.equal(workspaceStore.tabs.length, initialTabCount);
  assert.equal(workspaceStore.activeTabId, firstTabId);
});

test('sqlFolderService & workspace: direct in-place save overwrites file without prompt', async () => {
  const targetPath = 'C:/MyScripts/SQL/01_Init_Tables.sql';
  const newContent = 'SELECT 1 AS [Modified];';

  await sqlFolderService.writeFile(targetPath, newContent);

  const readBack = await sqlFolderService.readFile(targetPath);
  assert.equal(readBack, newContent);
});

test('sqlFolderStore: unmonitorItem excludes item from tree and restoreExcludedPaths recovers it', async () => {
  const store = useSqlFolderStore();
  await store.addFolder('C:/MyScripts/SQL');

  const tree = store.folderTrees['C:/MyScripts/SQL'];
  assert.ok(tree);
  assert.ok(tree.children?.some((c) => c.name === '01_Init_Tables.sql'));

  // Unmonitor 01_Init_Tables.sql (file)
  store.unmonitorItem('C:/MyScripts/SQL/01_Init_Tables.sql', '01_Init_Tables.sql', false);
  assert.equal(store.excludedPaths.length, 1);

  const filteredTree = store.folderTrees['C:/MyScripts/SQL'];
  assert.ok(filteredTree);
  assert.equal(filteredTree.children?.some((c) => c.name === '01_Init_Tables.sql'), false);

  store.restoreExcludedPaths();
  assert.equal(store.excludedPaths.length, 0);
  const restoredTree = store.folderTrees['C:/MyScripts/SQL'];
  assert.ok(restoredTree);
  assert.equal(restoredTree.children?.some((c) => c.name === '01_Init_Tables.sql'), true);
});

test('sqlFolderStore & workspaceStore: renameItem renames file and updates open tab title & filePath', async () => {
  const folderStore = useSqlFolderStore();
  const workspaceStore = useWorkspaceStore();

  const oldPath = 'C:/MyScripts/SQL/01_Init_Tables.sql';
  const newName = '01_Core_Tables.sql';
  const newPath = 'C:/MyScripts/SQL/01_Core_Tables.sql';

  await folderStore.openFile({
    name: '01_Init_Tables.sql',
    path: oldPath,
    is_dir: false,
  });

  const tab = workspaceStore.activeTab as SqlEditorTab;
  assert.ok(tab);
  assert.equal(tab.title, '01_Init_Tables.sql');
  assert.equal(tab.filePath, oldPath);

  const success = await folderStore.renameItem(oldPath, newName, false);
  assert.equal(success, true);

  assert.equal(tab.title, '01_Core_Tables.sql');
  assert.equal(tab.filePath, newPath);
});

test('workspaceStore: syncRenamedFolder updates filePaths of all tabs under renamed directory', () => {
  const workspaceStore = useWorkspaceStore();

  workspaceStore.addSqlTab('SELECT 1', 'file1.sql', undefined, undefined, 'C:/MyScripts/SQL/Migrations/01.sql');
  workspaceStore.addSqlTab('SELECT 2', 'file2.sql', undefined, undefined, 'C:/MyScripts/SQL/Procedures/proc.sql');

  workspaceStore.syncRenamedFolder('C:/MyScripts/SQL/Migrations', 'C:/MyScripts/SQL/V1_Migrations');

  const tab1 = workspaceStore.tabs.find((t) => t.title === 'file1.sql') as SqlEditorTab;
  const tab2 = workspaceStore.tabs.find((t) => t.title === 'file2.sql') as SqlEditorTab;

  assert.equal(tab1.filePath, 'C:/MyScripts/SQL/V1_Migrations/01.sql');
  assert.equal(tab2.filePath, 'C:/MyScripts/SQL/Procedures/proc.sql');
});

test('workspaceStore: renameTab on tab with filePath renames physical file on disk bi-directionally', async () => {
  const folderStore = useSqlFolderStore();
  const workspaceStore = useWorkspaceStore();

  const oldPath = 'C:/MyScripts/SQL/02_Seed_Data.sql';
  await folderStore.addFolder('C:/MyScripts/SQL');

  await folderStore.openFile({
    name: '02_Seed_Data.sql',
    path: oldPath,
    is_dir: false,
  });

  const tab = workspaceStore.activeTab as SqlEditorTab;
  assert.ok(tab);
  assert.equal(tab.title, '02_Seed_Data.sql');
  assert.equal(tab.filePath, oldPath);

  // Renamed from the tab header, so no file extension is typed.
  const success = await workspaceStore.renameTab(tab.id, '02_Seed_Production');
  assert.equal(success, true);

  assert.equal(tab.title, '02_Seed_Production.sql');
  assert.equal(tab.filePath, 'C:/MyScripts/SQL/02_Seed_Production.sql');

  // An unlinked (scratch) tab renames without touching disk.
  const unlinkedTabId = workspaceStore.addSqlTab('SELECT 1', 'Scratch.sql');
  await workspaceStore.renameTab(unlinkedTabId, 'NewScratch');
  const unlinkedTab = workspaceStore.tabs.find((t) => t.id === unlinkedTabId);
  assert.equal(unlinkedTab?.title, 'NewScratch');
});

test('workspaceStore: autoSaveSqlFiles automatically saves modified tabs with filePath', async () => {
  const workspaceStore = useWorkspaceStore();

  const file1Path = 'C:/MyScripts/SQL/auto1.sql';
  const file2Path = 'C:/MyScripts/SQL/auto2.sql';

  const tab1Id = workspaceStore.addSqlTab('SELECT 100;', 'auto1.sql', undefined, undefined, file1Path);
  workspaceStore.updateTabContent(tab1Id, 'SELECT 100 -- modified;');

  const tab2Id = workspaceStore.addSqlTab('SELECT 200;', 'auto2.sql', undefined, undefined, file2Path);

  const tab3Id = workspaceStore.addSqlTab('SELECT 300;', 'Scratch.sql');
  workspaceStore.updateTabContent(tab3Id, 'SELECT 300 -- modified;');

  const savedCount = await workspaceStore.autoSaveSqlFiles();

  assert.equal(savedCount, 1);

  const tab1 = workspaceStore.tabs.find((t) => t.id === tab1Id) as SqlEditorTab;
  const tab2 = workspaceStore.tabs.find((t) => t.id === tab2Id) as SqlEditorTab;
  const tab3 = workspaceStore.tabs.find((t) => t.id === tab3Id) as SqlEditorTab;

  assert.equal(tab1.isDirty, false);
  assert.equal(tab2.isDirty, false);
  assert.equal(tab3.isDirty, true);

  const content = await sqlFolderService.readFile(file1Path);
  assert.equal(content, 'SELECT 100 -- modified;');

  workspaceStore.stopAutoSaveTimer();
});



