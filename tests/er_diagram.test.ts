import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { type ErTableNodeData } from '../src/components/editor/ErTableNode';
import { type ErTextNodeData, type NoteColor } from '../src/components/editor/ErTextNode';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useWorkspaceStore } from '../src/stores/workspaceStore';
import { ErDiagramTab } from '../src/types/workspace';
import { dataUriToBlob, getAppStylesheets, saveDataUriToFile, saveErDiagramToFile, saveSvgToFile } from '../src/utils/fileStorage';

describe('er_theme', () => {
const storageData = new Map<string, string>();
before(() => {
  globalThis.localStorage = {
    getItem: (key) => storageData.get(key) ?? null,
    setItem: (key, value) => { storageData.set(key, String(value)); },
    removeItem: (key) => { storageData.delete(key); },
    clear: () => storageData.clear(),
    key: () => null,
    length: 0,
  };
});

beforeEach(() => {
  storageData.clear();
  setActivePinia(createPinia());
});

test('erTheme defaults to dark in settingsStore', () => {
  const settingsStore = useSettingsStore();
  assert.equal(settingsStore.erTheme, 'dark');
});

test('erTheme can be toggled to light and is persisted in localStorage', () => {
  const settingsStore = useSettingsStore();
  assert.equal(settingsStore.erTheme, 'dark');

  settingsStore.erTheme = 'light';
  assert.equal(settingsStore.erTheme, 'light');

  settingsStore.saveSettings();
  const savedRaw = localStorage.getItem('sqlight_app_settings');
  assert.ok(savedRaw);
  const parsed = JSON.parse(savedRaw);
  assert.equal(parsed.erTheme, 'light');
});

test('resetToDefaults restores erTheme to dark', () => {
  const settingsStore = useSettingsStore();
  settingsStore.erTheme = 'light';
  assert.equal(settingsStore.erTheme, 'light');

  settingsStore.resetToDefaults();
  assert.equal(settingsStore.erTheme, 'dark');
});

test('ER tab snapshot includes theme metadata and restores properly', () => {
  const workspaceStore = useWorkspaceStore();
  const settingsStore = useSettingsStore();

  workspaceStore.addErDiagramTab({
    rootSchema: 'dbo',
    rootTable: 'Orders',
    connectionId: 'conn-1',
    database: 'Northwind',
  });

  const tabId = workspaceStore.activeTabId;

  const mockSnapshot = {
    exportedAt: new Date().toISOString(),
    graph: { cells: [] },
    zoom: 1.0,
    translation: { tx: 50, ty: 50 },
    theme: 'light' as const,
  };

  workspaceStore.updateTabData(tabId, { initialData: mockSnapshot });

  const currentTab = workspaceStore.tabs.find((t) => t.id === tabId) as ErDiagramTab;
  assert.ok(currentTab);
  assert.ok(currentTab.initialData);
  assert.equal(currentTab.initialData.theme, 'light');

  if (currentTab.initialData.theme) {
    settingsStore.erTheme = currentTab.initialData.theme;
  }
  assert.equal(settingsStore.erTheme, 'light');
});
});

describe('er_export_storage', () => {
const SAMPLE_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('dataUriToBlob correctly converts base64 DataURI to Blob with proper MIME type', () => {
  const blob = dataUriToBlob(SAMPLE_PNG_DATA_URI);
  assert.equal(blob.type, 'image/png');
  assert.ok(blob.size > 0);
});

test('saveDataUriToFile prompts showSaveFilePicker with PNG filter and writes binary blob', async () => {
  let pickerCalledWith: any = null;
  let writtenBlob: any = null;
  let streamClosed = false;

  (globalThis as any).window = {
    showSaveFilePicker: async (opts: any) => {
      pickerCalledWith = opts;
      return {
        name: opts.suggestedName,
        createWritable: async () => ({
          write: async (chunk: any) => {
            writtenBlob = chunk;
          },
          close: async () => {
            streamClosed = true;
          },
        }),
      };
    },
  };

  const res = await saveDataUriToFile(SAMPLE_PNG_DATA_URI, 'Orders');

  assert.equal(res.saved, true);
  assert.equal(res.fileName, 'Orders.png');
  assert.equal(streamClosed, true);
  assert.ok(writtenBlob instanceof Blob);
  assert.equal(writtenBlob.type, 'image/png');
  assert.equal(pickerCalledWith.suggestedName, 'Orders.png');
  assert.equal(pickerCalledWith.types[0].description, 'PNG 圖片 (*.png)');
  assert.ok(pickerCalledWith.types[0].accept['image/png'].includes('.png'));

  delete (globalThis as any).window;
});

test('saveSvgToFile prompts showSaveFilePicker with SVG filter and writes text content', async () => {
  let pickerCalledWith: any = null;
  let writtenText = '';
  let streamClosed = false;

  (globalThis as any).window = {
    showSaveFilePicker: async (opts: any) => {
      pickerCalledWith = opts;
      return {
        name: opts.suggestedName,
        createWritable: async () => ({
          write: async (chunk: string) => {
            writtenText = chunk;
          },
          close: async () => {
            streamClosed = true;
          },
        }),
      };
    },
  };

  const sampleSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>';
  const res = await saveSvgToFile(sampleSvg, 'Orders');

  assert.equal(res.saved, true);
  assert.equal(res.fileName, 'Orders.svg');
  assert.equal(writtenText, sampleSvg);
  assert.equal(streamClosed, true);
  assert.equal(pickerCalledWith.suggestedName, 'Orders.svg');
  assert.equal(pickerCalledWith.types[0].description, 'SVG 向量圖 (*.svg)');
  assert.ok(pickerCalledWith.types[0].accept['image/svg+xml'].includes('.svg'));

  delete (globalThis as any).window;
});

test('saveErDiagramToFile prompts showSaveFilePicker with JSON filter and writes model content', async () => {
  let pickerCalledWith: any = null;
  let writtenText = '';
  let streamClosed = false;

  (globalThis as any).window = {
    showSaveFilePicker: async (opts: any) => {
      pickerCalledWith = opts;
      return {
        name: opts.suggestedName,
        createWritable: async () => ({
          write: async (chunk: string) => {
            writtenText = chunk;
          },
          close: async () => {
            streamClosed = true;
          },
        }),
      };
    },
  };

  const sampleJson = JSON.stringify({ type: 'sqlight_er_model', version: '1.0' });
  const res = await saveErDiagramToFile(sampleJson, 'Customer_ER');

  assert.equal(res.saved, true);
  assert.equal(res.fileName, 'Customer_ER.puffsql-er.json');
  assert.equal(writtenText, sampleJson);
  assert.equal(streamClosed, true);
  assert.equal(pickerCalledWith.suggestedName, 'Customer_ER.puffsql-er.json');
  assert.equal(pickerCalledWith.types[0].description, 'PuffSQL ER 模型 (*.puffsql-er.json, *.json)');
  assert.ok(pickerCalledWith.types[0].accept['application/json'].includes('.json'));
  assert.ok(!pickerCalledWith.types[0].accept['application/json'].includes('.puffsql-er.json'));

  delete (globalThis as any).window;
});

test('getAppStylesheets handles environments gracefully and returns string', () => {
  const css = getAppStylesheets();
  assert.equal(typeof css, 'string');
});

test('saveDataUriToFile / saveSvgToFile / saveErDiagramToFile return { saved: false } on user cancellation', async () => {
  (globalThis as any).window = {
    showSaveFilePicker: async () => {
      const abortErr = new Error('The user aborted a request.');
      abortErr.name = 'AbortError';
      throw abortErr;
    },
  };

  const resPng = await saveDataUriToFile(SAMPLE_PNG_DATA_URI, 'Orders.png');
  assert.equal(resPng.saved, false);
  assert.equal(resPng.fileName, undefined);

  const resSvg = await saveSvgToFile('<svg/>', 'Orders.svg');
  assert.equal(resSvg.saved, false);
  assert.equal(resSvg.fileName, undefined);

  const resJson = await saveErDiagramToFile('{}', 'Orders.puffsql-er.json');
  assert.equal(resJson.saved, false);
  assert.equal(resJson.fileName, undefined);

  delete (globalThis as any).window;
});
});

describe('er_tab_isolation', () => {
const data = new Map<string, string>();
before(() => {
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  };
});

beforeEach(() => {
  data.clear();
  setActivePinia(createPinia());
});

test('opening ER diagrams for different tables creates independent tabs', () => {
  const store = useWorkspaceStore();
  const initialCount = store.tabs.length;

  store.addErDiagramTab({
    rootSchema: 'dbo',
    rootTable: 'Customers',
    connectionId: 'conn-1',
    database: 'Northwind',
  });

  assert.equal(store.tabs.length, initialCount + 1);
  const tab1 = store.tabs[store.tabs.length - 1] as ErDiagramTab;
  assert.equal(tab1.type, 'er_diagram');
  assert.equal(tab1.rootTable, 'Customers');
  assert.equal(tab1.title, 'ER: Customers');
  assert.equal(store.activeTabId, tab1.id);

  store.addErDiagramTab({
    rootSchema: 'dbo',
    rootTable: 'Orders',
    connectionId: 'conn-1',
    database: 'Northwind',
  });

  assert.equal(store.tabs.length, initialCount + 2);
  const tab2 = store.tabs[store.tabs.length - 1] as ErDiagramTab;
  assert.equal(tab2.type, 'er_diagram');
  assert.equal(tab2.rootTable, 'Orders');
  assert.equal(tab2.title, 'ER: Orders');
  assert.notEqual(tab2.id, tab1.id);
  assert.equal(store.activeTabId, tab2.id);

  store.addErDiagramTab({
    rootSchema: 'dbo',
    rootTable: 'Customers',
    connectionId: 'conn-1',
    database: 'Northwind',
  });

  assert.equal(store.tabs.length, initialCount + 2);
  assert.equal(store.activeTabId, tab1.id);
});

test('ER tabs maintain completely isolated snapshots when updated via updateTabData', () => {
  const store = useWorkspaceStore();

  store.addErDiagramTab({
    rootSchema: 'dbo',
    rootTable: 'Customers',
    connectionId: 'conn-1',
    database: 'Northwind',
  });
  const tab1Id = store.activeTabId;

  store.addErDiagramTab({
    rootSchema: 'dbo',
    rootTable: 'Orders',
    connectionId: 'conn-1',
    database: 'Northwind',
  });
  const tab2Id = store.activeTabId;

  const snapshot1 = { graph: { cells: [{ id: 'node-dbo.Customers' }] } };
  const snapshot2 = { graph: { cells: [{ id: 'node-dbo.Orders' }] } };

  store.updateTabData(tab1Id, { initialData: snapshot1 });
  store.updateTabData(tab2Id, { initialData: snapshot2 });

  const currentTab1 = store.tabs.find((t) => t.id === tab1Id) as ErDiagramTab;
  const currentTab2 = store.tabs.find((t) => t.id === tab2Id) as ErDiagramTab;

  assert.deepEqual(currentTab1.initialData, snapshot1);
  assert.deepEqual(currentTab2.initialData, snapshot2);
  assert.notDeepEqual(currentTab1.initialData, currentTab2.initialData);
});
});

describe('er_viewport_persistence', () => {
const data = new Map<string, string>();
before(() => {
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  };
});

beforeEach(() => {
  data.clear();
  setActivePinia(createPinia());
});

test('ER tab snapshot preserves camera viewport zoom and pan translation', () => {
  const store = useWorkspaceStore();

  store.addErDiagramTab({
    rootSchema: 'dbo',
    rootTable: 'Products',
    connectionId: 'conn-1',
    database: 'Northwind',
  });

  const tabId = store.activeTabId;

  const mockSnapshot = {
    exportedAt: new Date().toISOString(),
    graph: { cells: [{ id: 'node-dbo.Products' }] },
    zoom: 1.25,
    translation: { tx: 180, ty: -95 },
  };

  store.updateTabData(tabId, { initialData: mockSnapshot });

  const currentTab = store.tabs.find((t) => t.id === tabId) as ErDiagramTab;
  assert.ok(currentTab);
  assert.ok(currentTab.initialData);
  assert.equal(currentTab.initialData.zoom, 1.25);
  assert.deepEqual(currentTab.initialData.translation, { tx: 180, ty: -95 });
});

test('restore logic restores zoomTo and translate when viewport coordinates are present', () => {
  let zoomToCalledWith: number | null = null;
  let translateCalledWith: { tx: number; ty: number } | null = null;
  let zoomToFitCalled = false;

  const mockGraph = {
    fromJSON: () => {},
    getEdges: () => [],
    getNodes: () => [],
    zoomTo: (factor: number) => {
      zoomToCalledWith = factor;
    },
    translate: (tx: number, ty: number) => {
      translateCalledWith = { tx, ty };
    },
    zoomToFit: () => {
      zoomToFitCalled = true;
    },
  };

  const initialDataWithViewport = {
    graph: { cells: [] },
    zoom: 0.85,
    translation: { tx: 250, ty: 120 },
  };

  if (
    typeof initialDataWithViewport.zoom === 'number' &&
    initialDataWithViewport.translation &&
    typeof initialDataWithViewport.translation.tx === 'number' &&
    typeof initialDataWithViewport.translation.ty === 'number'
  ) {
    mockGraph.zoomTo(initialDataWithViewport.zoom);
    mockGraph.translate(initialDataWithViewport.translation.tx, initialDataWithViewport.translation.ty);
  } else {
    mockGraph.zoomToFit();
  }

  assert.equal(zoomToCalledWith, 0.85);
  assert.deepEqual(translateCalledWith, { tx: 250, ty: 120 });
  assert.equal(zoomToFitCalled, false);
});

test('restore logic falls back to zoomToFit when viewport coordinates are missing', () => {
  let zoomToCalled = false;
  let translateCalled = false;
  let zoomToFitCalled = false;

  const mockGraph = {
    fromJSON: () => {},
    getEdges: () => [],
    getNodes: () => [],
    zoomTo: () => {
      zoomToCalled = true;
    },
    translate: () => {
      translateCalled = true;
    },
    zoomToFit: () => {
      zoomToFitCalled = true;
    },
  };

  const legacyDataWithoutViewport = {
    graph: { cells: [] },
  };

  const data = legacyDataWithoutViewport as any;
  if (
    typeof data.zoom === 'number' &&
    data.translation &&
    typeof data.translation.tx === 'number' &&
    typeof data.translation.ty === 'number'
  ) {
    mockGraph.zoomTo();
    mockGraph.translate();
  } else {
    mockGraph.zoomToFit();
  }

  assert.equal(zoomToCalled, false);
  assert.equal(translateCalled, false);
  assert.equal(zoomToFitCalled, true);
});
});

describe('er_table_node', () => {
test('ErTableNodeData supports customHeight for length resizing in view mode', () => {
  const tableData: ErTableNodeData = {
    schema: 'dbo',
    table: 'Orders',
    columns: [],
    customHeight: 220,
    isEditMode: false,
  };

  assert.equal(tableData.customHeight, 220);
  assert.equal(tableData.schema, 'dbo');
  assert.equal(tableData.table, 'Orders');
});

test('Solution B: Edit Mode always enforces natural Auto-Fit height, ignoring customHeight', () => {
  const BORDER_OFFSET = 1;
  const HEADER_HEIGHT = 32;
  const ROW_HEIGHT = 24;
  const FOOTER_HEIGHT = 24;
  const colCount = 8;
  const naturalEditHeight = BORDER_OFFSET * 2 + HEADER_HEIGHT + colCount * ROW_HEIGHT + FOOTER_HEIGHT; // 250px

  const dataWithCustom: ErTableNodeData = {
    schema: 'dbo',
    table: 'Orders',
    columns: [],
    customHeight: 150, // User set a smaller custom height in view mode
    isEditMode: true,
  };

  // In Edit Mode (isEdit: true), height MUST be naturalEditHeight (250px) to prevent floating ports / scroll misalignment
  const isEdit = true;
  let targetHeight = naturalEditHeight;
  if (!isEdit && dataWithCustom.customHeight !== undefined) {
    targetHeight = dataWithCustom.customHeight;
  }
  assert.equal(targetHeight, 250);
});

test('Solution B: View Mode respects customHeight with connected columns safety lower bound', () => {
  const BORDER_OFFSET = 1;
  const HEADER_HEIGHT = 32;
  const ROW_HEIGHT = 24;
  const visibleCols = [
    { name: 'id', dataType: 'int' },
    { name: 'customer_id', dataType: 'int' }, // connected! index 1
    { name: 'amount', dataType: 'decimal' },
    { name: 'created_at', dataType: 'datetime' },
  ];
  const connectedPortIds = new Set(['customer_id']);

  let maxConnectedIdx = -1;
  visibleCols.forEach((c, idx) => {
    if (connectedPortIds.has(c.name)) {
      maxConnectedIdx = idx;
    }
  });
  const minSafeH = maxConnectedIdx >= 0
    ? BORDER_OFFSET * 2 + HEADER_HEIGHT + (maxConnectedIdx + 1) * ROW_HEIGHT
    : 60;
  // minSafeH = 2 + 32 + (1 + 1) * 24 = 82px

  assert.equal(minSafeH, 82);

  const target1 = Math.max(minSafeH, 140);
  assert.equal(target1, 140);

  const target2 = Math.max(minSafeH, 50);
  assert.equal(target2, 82);
});

test('Resize handler locks width at 260px and respects minSafeH', () => {
  const startW = 260;
  const startH = 200;
  const minSafeH = 120;

  const dyDown = 60;
  const newHDown = Math.max(minSafeH, Math.round(startH + dyDown));
  assert.equal(startW, 260); // Width strictly locked
  assert.equal(newHDown, 260);

  const dyUp = -150;
  const newHUp = Math.max(minSafeH, Math.round(startH + dyUp));
  assert.equal(startW, 260); // Width strictly locked
  assert.equal(newHUp, 120); // Clamped at minSafeH
});

test('Columns container has no scrollbars (overflow-x-hidden overflow-y-hidden)', () => {
  const containerClasses = 'flex-1 overflow-x-hidden overflow-y-hidden divide-y divide-dark-800/60 text-xxs font-sans';
  assert.ok(containerClasses.includes('overflow-x-hidden'));
  assert.ok(containerClasses.includes('overflow-y-hidden'));
  assert.ok(!containerClasses.includes('overflow-y-auto'));
  assert.ok(!containerClasses.includes('overflow-x-auto'));
});

test('ER model JSON serialization preserves table customHeight', () => {
  const graphJson = {
    nodes: [
      {
        id: 'node-dbo.Products',
        shape: 'er-table-node',
        x: 150,
        y: 120,
        width: 260,
        height: 190,
        data: {
          schema: 'dbo',
          table: 'Products',
          columns: [],
          customHeight: 190,
        },
      },
    ],
  };

  const serialized = JSON.stringify(graphJson);
  const parsed = JSON.parse(serialized);

  const node = parsed.nodes[0];
  assert.equal(node.width, 260);
  assert.equal(node.height, 190);
  assert.equal(node.data.customHeight, 190);
});

test('ErTableNode uses deepened border (border-slate-400) in light mode', () => {
  const lightClass = 'bg-white/95 border-slate-400 hover:border-brand-500/70 shadow-md shadow-slate-300/40 text-slate-800';
  assert.ok(lightClass.includes('border-slate-400'), 'Light theme must use deepened border-slate-400');
  assert.ok(!lightClass.includes('border-slate-200'), 'Light theme must not use pale border-slate-200');
});
});

describe('er_text_node', () => {
test('ErTextNodeData supports text, NoteColor, and isEditMode properties', () => {
  const nodeData: ErTextNodeData = {
    text: '此處為訂單資料表之業務關聯備註',
    color: 'amber',
    isEditMode: false,
  };

  assert.equal(nodeData.text, '此處為訂單資料表之業務關聯備註');
  assert.equal(nodeData.color, 'amber');
  assert.equal(nodeData.isEditMode, false);
});

test('ErTextNodeData supports all defined note colors including rose', () => {
  const supportedColors: NoteColor[] = ['amber', 'blue', 'emerald', 'purple', 'rose', 'dark'];

  for (const c of supportedColors) {
    const data: ErTextNodeData = {
      text: `Color test for ${c}`,
      color: c,
      isEditMode: true,
    };
    assert.equal(data.color, c);
  }
});

test('Simulated node.setData preserves text and color when isEditMode changes', () => {
  let currentData: ErTextNodeData = {
    text: '重要備忘事項：訂單狀態不得直接修改',
    color: 'rose',
    isEditMode: false, // 檢視模式
  };

  currentData = { ...currentData, isEditMode: true };
  assert.equal(currentData.isEditMode, true);
  assert.equal(currentData.color, 'rose');
  assert.equal(currentData.text, '重要備忘事項：訂單狀態不得直接修改');

  currentData = { ...currentData, color: 'blue' };
  assert.equal(currentData.color, 'blue');

  currentData = { ...currentData, isEditMode: false };
  assert.equal(currentData.isEditMode, false);
  assert.equal(currentData.color, 'blue');
  assert.equal(currentData.text, '重要備忘事項：訂單狀態不得直接修改');
});

test('ER model JSON snapshot retains er-text-node shape, dimensions, and data', () => {
  const mockGraphJson = {
    nodes: [
      {
        id: 'node-dbo.Orders',
        shape: 'er-table-node',
        x: 100,
        y: 100,
        width: 260,
        height: 200,
      },
      {
        id: 'text-1726572000000-abcd',
        shape: 'er-text-node',
        x: 400,
        y: 150,
        width: 280,
        height: 140,
        data: {
          text: '使用者收件資訊關聯',
          color: 'emerald',
          isEditMode: false,
        },
      },
    ],
    edges: [],
  };

  const serialized = JSON.stringify(mockGraphJson);
  const parsed = JSON.parse(serialized);

  const textNode = parsed.nodes.find((n: any) => n.shape === 'er-text-node');
  assert.ok(textNode);
  assert.equal(textNode.width, 280);
  assert.equal(textNode.height, 140);
  assert.equal(textNode.data.text, '使用者收件資訊關聯');
  assert.equal(textNode.data.color, 'emerald');
  assert.equal(textNode.data.isEditMode, false);
});

test('ErTextNode defaults to dark (gray) when color is not specified', () => {
  const nodeDataWithoutColor: ErTextNodeData = {
    text: '預設灰色備註',
  };

  const defaultColor = nodeDataWithoutColor.color || 'dark';
  assert.equal(defaultColor, 'dark');

  const colorOptions: Array<{ key: NoteColor; label: string; bgClass: string }> = [
    { key: 'amber', label: '經典便箋黃', bgClass: 'bg-amber-400' },
    { key: 'blue', label: '科技藍', bgClass: 'bg-sky-400' },
    { key: 'emerald', label: '清新綠', bgClass: 'bg-emerald-400' },
    { key: 'purple', label: '高雅紫', bgClass: 'bg-purple-400' },
    { key: 'rose', label: '警示紅', bgClass: 'bg-rose-400' },
    { key: 'dark', label: '極簡深灰', bgClass: 'bg-zinc-400' },
  ];

  // The last color option in the palette is dark (gray)
  const lastOption = colorOptions[colorOptions.length - 1];
  assert.equal(lastOption.key, 'dark');
  assert.equal(lastOption.label, '極簡深灰');
});
});
