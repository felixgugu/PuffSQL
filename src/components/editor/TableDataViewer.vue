<template>
  <div class="w-full h-full flex flex-col bg-dark-900 overflow-hidden font-sans text-xs select-none">
    <!-- Subheader toolbar for Table Data -->
    <div class="h-8 bg-dark-850 border-b border-dark-700 flex items-center justify-between px-2 text-xs flex-shrink-0 space-x-2">
      <div class="flex items-center space-x-2 min-w-0">
        <Table2 class="w-3 h-3 text-ok flex-shrink-0" />
        <span class="font-semibold text-dark-100 truncate">{{ schema }}.{{ tableName }}</span>
        <span class="text-dark-600">|</span>
        <span class="text-dark-400 text-xxs flex-shrink-0">
          <strong class="text-ok">{{ rows.length.toLocaleString() }}</strong> {{ $t('results.rowsUnit') || 'rows' }}
        </span>

        <!-- Quick Filter Input -->
        <SqInput
          v-model="quickFilter"
          type="text"
          :placeholder="$t('dataView.filterTableDataPlaceholder')"
          size="sm"
          class="w-40 sm:w-56 ml-2"
        >
          <template #prefix>
            <Search class="w-3.5 h-3.5 text-dark-500" />
          </template>
        </SqInput>
      </div>

      <div class="flex items-center space-x-1.5 flex-shrink-0">
        <!-- Copy TSV -->
        <SqButton
          type="button"
          :label="copiedTsv ? $t('common.copied') : 'Copy TSV'"
          size="sm"
          variant="outline"
          @click="copyAsTsv"
          v-tooltip.top="$t('dataView.copyAllTsvTooltip')"
        >
          <template #icon>
            <Check v-if="copiedTsv" class="w-3.5 h-3.5 text-ok" />
            <FileSpreadsheet v-else class="w-3.5 h-3.5" />
          </template>
        </SqButton>

        <!-- Copy JSON -->
        <SqButton
          type="button"
          label="JSON"
          size="sm"
          variant="outline"
          @click="copyAsJson"
          v-tooltip.top="$t('dataView.copyAllJsonTooltip')"
        >
          <template #icon><FileCode class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- Copy Markdown -->
        <SqButton
          type="button"
          label="MD"
          size="sm"
          variant="outline"
          @click="copyAsMarkdown"
          v-tooltip.top="$t('dataView.copyAllMdTooltip')"
        >
          <template #icon><Table2 class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- Reload Data -->
        <SqButton
          type="button"
          :label="$t('common.refresh')"
          size="sm"
          variant="outline"
          class="ml-1"
          :loading="isLoading"
          @click="loadData"
          v-tooltip.top="$t('dataView.reloadTableData')"
        >
          <template #icon><RefreshCw class="w-3.5 h-3.5" /></template>
        </SqButton>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center text-dark-400 space-x-2">
      <RotateCw class="w-4 h-4 animate-spin text-accent" />
      <span>{{ $t('dataView.loadingData') }}</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex-1 p-4 text-danger">
      <div class="font-semibold mb-1">{{ $t('dataView.errorQueryingTable') }}</div>
      <div class="font-mono text-xs bg-rose-50 dark:bg-rose-950/30 p-3 rounded border border-rose-200 dark:border-rose-900/50">{{ error }}</div>
    </div>

    <!-- Tabulator grid -->
    <div
      v-else
      ref="gridContainerRef"
      class="sqlight-grid flex-1 w-full overflow-hidden relative"
      :class="{ 'is-h-scrolling': isHorizontalScrolling }"
      :style="{ '--sqlight-grid-font': settingsStore.gridFontFamily }"
      @contextmenu.prevent
      @scroll.capture.passive="handleGridScroll"
    >
      <div ref="gridTableRef" class="w-full h-full"></div>
    </div>

    <!-- Excel-Grade Live Aggregate Bar -->
    <div class="h-6 bg-dark-850 border-t border-dark-700 flex items-center justify-between px-3 text-xxs font-sans text-dark-300 flex-shrink-0 select-none">
      <!-- Left: Statistics or Default Summary -->
      <div class="flex items-center space-x-2.5 overflow-x-auto min-w-0">
        <template v-if="selectionStats">
          <div class="flex items-center space-x-1 font-semibold text-accent flex-shrink-0">
            <span>{{ $t('results.selected') }}:</span>
            <span v-if="selectedColumnsCount > 1" class="text-warn font-mono">
              {{ selectedColumnsCount }} {{ $t('results.columnsUnit') }}
            </span>
            <span class="font-mono text-dark-100">
              {{ selectedColumnsCount > 1 ? `(${selectionStats.totalCells.toLocaleString()} ${$t('results.cellsUnit')})` : `${selectionStats.totalCells.toLocaleString()} ${$t('results.cellsUnit')}` }}
            </span>
            <span v-if="selectionStats.numericCount > 0" class="text-dark-400 font-mono text-xxs font-medium">
              [{{ selectionStats.numericCount.toLocaleString() }} {{ $t('results.numericUnit') }}]
            </span>
          </div>

          <template v-if="selectionStats.numericCount > 0">
            <span class="text-dark-600 flex-shrink-0">|</span>
            <div class="flex-shrink-0">
              {{ $t('results.sum') }}: <strong class="font-mono text-ok">{{ formatAggregateNumber(selectionStats.sum) }}</strong>
            </div>
            <span class="text-dark-600 flex-shrink-0">|</span>
            <div class="flex-shrink-0">
              {{ $t('results.avg') }}: <strong class="font-mono text-info">{{ formatAggregateNumber(selectionStats.avg) }}</strong>
            </div>
            <span class="text-dark-600 flex-shrink-0">|</span>
            <div class="flex-shrink-0">
              {{ $t('results.min') }}: <strong class="font-mono text-warn">{{ formatAggregateNumber(selectionStats.min) }}</strong>
            </div>
            <span class="text-dark-600 flex-shrink-0">|</span>
            <div class="flex-shrink-0">
              {{ $t('results.max') }}: <strong class="font-mono text-plan">{{ formatAggregateNumber(selectionStats.max) }}</strong>
            </div>
          </template>

          <span class="text-dark-600 flex-shrink-0">|</span>
          <div class="flex-shrink-0">
            {{ $t('results.distinct') }}: <strong class="font-mono text-dark-100">{{ selectionStats.distinctCount.toLocaleString() }}</strong>
          </div>

          <SqButton
            type="button"
            :label="$t('common.clear')"
            size="sm"
            @click="clearCellSelection"
            :v-tooltip.top="$t('results.clearSelectionTooltip')"
            class="!ml-1 !p-0 !text-xxs !font-medium !underline"
          />
        </template>

        <template v-else>
          <div class="flex items-center space-x-2 text-dark-400">
            <span>{{ $t('results.totalRows', { count: rows.length.toLocaleString() }) }}</span>
            <span class="text-dark-600">|</span>
            <span>{{ $t('results.totalColumns', { count: columns.length }) }}</span>
            <span class="text-dark-600">|</span>
            <span class="text-dark-500 italic text-xxs font-medium">{{ $t('results.selectionTip') }}</span>
          </div>
        </template>
      </div>

    </div>

    <!-- Custom Cell Context Menu -->
    <div
      v-if="contextMenu.visible"
      :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
      class="fixed z-50 bg-dark-800 border border-dark-700 rounded shadow-overlay py-1 w-52 text-xs font-sans text-dark-200 select-none"
      @click="contextMenu.visible = false"
    >
      <div class="px-2.5 py-1 text-xxs text-dark-400 border-b border-dark-750 font-mono truncate">
        {{ contextMenu.colName }}: {{ String(contextMenu.cellValue ?? 'NULL') }}
      </div>

      <button
        @click="copyCellValue"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <Copy class="w-3.5 h-3.5 text-accent" />
        <span>{{ $t('dataView.copyCell') }}</span>
      </button>

      <button
        @click="copyCurrentRow"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <FileText class="w-3.5 h-3.5 text-ok" />
        <span>{{ $t('dataView.copyRow') }}</span>
      </button>

      <button
        @click="copyCurrentRowAsJson"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <Braces class="w-3.5 h-3.5 text-ok" />
        <span>{{ $t('dataView.copyRowJson') }}</span>
      </button>

      <div class="my-1 border-t border-dark-750"></div>

      <!-- Selection Copy (if selection active) -->
      <button
        v-if="hasSelection"
        @click="copySelectedCells"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <Copy class="w-3.5 h-3.5 text-accent" />
        <span>{{ $t('results.copySelectionCells', { count: selectionStats?.totalCells }) }}</span>
      </button>

      <button
        v-if="hasSelection"
        @click="copySelectedAsJson"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <Braces class="w-3.5 h-3.5 text-er" />
        <span>{{ $t('dataView.copySelectionJson') }}</span>
      </button>

      <!-- DML SQL Generation Options -->
      <button
        @click="handleGenerateDml('INSERT')"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <PlusCircle class="w-3.5 h-3.5 text-info" />
        <span>{{ $t('dataView.createInsert') }}</span>
      </button>

      <button
        @click="handleGenerateDml('UPDATE')"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <Edit3 class="w-3.5 h-3.5 text-warn" />
        <span>{{ $t('dataView.createUpdate') }}</span>
      </button>

      <button
        @click="handleGenerateDml('DELETE')"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <Trash2 class="w-3.5 h-3.5 text-danger" />
        <span>{{ $t('dataView.createDelete') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onBeforeUnmount, nextTick, watch, markRaw } from 'vue';
import SqButton from '@/components/ui/SqButton.vue';
import SqInput from '@/components/ui/SqInput.vue';
import {
  FileText,
  Copy,
  PlusCircle,
  Edit3,
  Trash2,
  Braces,
  Search,
  Check,
  FileSpreadsheet,
  RefreshCw,
  Table2,
} from 'lucide-vue-next';
import type {
  TabulatorCellComponent,
  TabulatorColumnDefinition,
  TabulatorRowData,
} from 'tabulator-tables';
import { queryService } from '@/services/queryService';
import { useConnectionStore } from '@/stores/connectionStore';
import { useQueryStore } from '@/stores/queryStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { calculateColumnWidth, formatValueForDisplay } from '@/composables/useColumnAutoWidth';
import { useTabulatorTable } from '@/composables/useTabulatorTable';
import { useGridSelection } from '@/composables/useGridSelection';
import { useGridExport } from '@/composables/useGridExport';
import {
  ROW_INDEX_FIELD,
  buildDataColumn,
  buildRowIndexColumn,
} from '@/utils/tabulatorColumns';
import {
  generateInsertStatement,
  generateUpdateStatement,
  generateDeleteStatement,
  type ColumnInfo,
  type GenerateDmlParams,
} from '@/utils/sqlGenerator';
import type { ColumnDef, CellValue } from '@/types/query';

const props = defineProps<{
  schema: string;
  tableName: string;
}>();

const settingsStore = useSettingsStore();
const connectionStore = useConnectionStore();
const queryStore = useQueryStore();
const workspaceStore = useWorkspaceStore();
const schemaStore = useSchemaStore();

const isLoading = ref(false);
const error = ref<string | null>(null);
const columns = ref<ColumnDef[]>([]);
const rows = ref<CellValue[][]>([]);
const quickFilter = ref('');
const quickFilterApplied = ref('');
let quickFilterTimer: ReturnType<typeof setTimeout> | null = null;

// The debounce thresholds mirror the result grid: measured on a 150 column result set a single
// filter pass costs ~20ms at 1k rows and ~500ms at 50k rows, so ~10k rows is where it is felt.
const QUICK_FILTER_DEBOUNCE_MS = 250;
const QUICK_FILTER_DEBOUNCE_ROW_THRESHOLD = 10000;

const gridContainerRef = ref<HTMLDivElement | null>(null);
const isHorizontalScrolling = ref(false);
let horizontalScrollTimer: ReturnType<typeof setTimeout> | null = null;
let lastScrollLeft = 0;

// Set of lowercased primary key column names for this table
const primaryKeyColumnNames = computed<Set<string>>(() => {
  const connId = connectionStore.activeConnectionId;
  const db = connectionStore.activeDatabase;
  if (!connId || !db) return new Set();

  const tableSchema = schemaStore.getTable(props.tableName, connId, db) ||
    schemaStore.getTable(`${props.schema}.${props.tableName}`, connId, db);
  if (!tableSchema) return new Set();

  return new Set(
    tableSchema.columns
      .filter((c) => c.isPrimaryKey)
      .map((c) => c.name.toLowerCase())
  );
});

// Auto-fetch database schema if not yet loaded so primary keys show up promptly
watch(
  () => [connectionStore.activeConnectionId, connectionStore.activeDatabase] as const,
  ([connId, db]) => {
    if (connId && db && !schemaStore.isDatabaseLoaded(connId, db)) {
      schemaStore.loadDatabaseSchema(connId, db).catch(() => {});
    }
  },
  { immediate: true }
);

// Selection composable (Tabulator range based)
const selection = useGridSelection({
  getTable: () => grid.table.value,
  getContainer: () => gridContainerRef.value,
  getColumns: () => columns.value,
  onCopySelected: () => gridExport.copySelectedCells(),
});

const {
  selectionStats,
  hasSelection,
  selectedColumnsCount,
  getColIndex,
  formatAggregateNumber,
  clearCellSelection,
} = selection;

const contextMenu = reactive<{
  visible: boolean;
  x: number;
  y: number;
  colId: string;
  colName: string;
  cellValue: unknown;
  rowIndex: number;
  rowData: CellValue[] | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  colId: '',
  colName: '',
  cellValue: null,
  rowIndex: -1,
  rowData: null,
});

// Export composable
const gridExport = useGridExport({
  getRows: () => rows.value,
  getColumns: () => columns.value,
  selection,
  showToast: (msg, type, duration) => workspaceStore.showToast(msg, type, duration),
  onMenuClose: () => {
    contextMenu.visible = false;
  },
});

const {
  copiedTsv,
  copyCellValue: exportCopyCellValue,
  copyCurrentRow: exportCopyCurrentRow,
  copyCurrentRowAsJson: exportCopyCurrentRowAsJson,
  copySelectedCells,
  copySelectedAsJson,
  copyAsTsv,
  copyAsJson,
  copyAsMarkdown,
} = gridExport;

function copyCellValue() {
  exportCopyCellValue(contextMenu.cellValue);
}

function copyCurrentRow() {
  const row = contextMenu.rowData || (contextMenu.rowIndex >= 0 && rows.value ? rows.value[contextMenu.rowIndex] : null);
  exportCopyCurrentRow(row);
}

function copyCurrentRowAsJson() {
  const row = contextMenu.rowData || (contextMenu.rowIndex >= 0 && rows.value ? rows.value[contextMenu.rowIndex] : null);
  if (row) {
    exportCopyCurrentRowAsJson(columns.value, row);
  }
}

// --------------------------------------------------------------------------
// Tabulator grid
// --------------------------------------------------------------------------

function buildColumnDefinitions(): TabulatorColumnDefinition[] {
  const firstRow = rows.value[0];
  const dataColumns: TabulatorColumnDefinition[] = columns.value.map((col, colIdx) => {
    const isPk = primaryKeyColumnNames.value.has(col.name.toLowerCase());
    const firstVal = firstRow ? firstRow[colIdx] : undefined;
    return buildDataColumn({
      column: col,
      columnIndex: colIdx,
      width: calculateColumnWidth(col.name, firstVal, isPk),
      headerTooltip: isPk
        ? `🔑 [主鍵 / Primary Key] 型別 (Type): ${col.dataType}${col.nullable ? ' | 可為 NULL' : ' | NOT NULL'} (拖曳表頭調整順序，點選表頭選取整欄)`
        : `型別 (Type): ${col.dataType}${col.nullable ? ' | 可為 NULL' : ' | NOT NULL'} (拖曳表頭調整順序，點選表頭選取整欄)`,
      isPrimaryKey: isPk,
      isIdentity: false,
    });
  });

  return [buildRowIndexColumn({ rowCount: rows.value.length }), ...dataColumns];
}

/** Visible data field names in display order; the quick filter scans exactly these. */
function dataFieldNames(): string[] {
  const table = grid.table.value;
  if (!table) return columns.value.map((_, index) => String(index));
  return table
    .getColumns()
    .filter((column) => column.isVisible() && column.getField() !== ROW_INDEX_FIELD)
    .map((column) => column.getField());
}

function buildQuickFilter(term: string): (data: TabulatorRowData) => boolean {
  const terms = term
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const fields = dataFieldNames();
  return (data) => {
    for (const needle of terms) {
      let matched = false;
      for (const field of fields) {
        const raw = (data as unknown as Record<string, CellValue>)[field];
        if (raw === null || raw === undefined) continue;
        if (formatValueForDisplay(raw).toLowerCase().includes(needle)) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }
    return true;
  };
}

function applyQuickFilterTerm(term: string) {
  const table = grid.table.value;
  if (!table) return;
  if (!term.trim()) {
    table.clearFilter();
    return;
  }
  table.setFilter(buildQuickFilter(term));
}

const grid = useTabulatorTable({
  isActive: () => !isLoading.value && !error.value && columns.value.length > 0,
  getRows: () => rows.value,
  getColumnSignature: () =>
    `${columns.value.map((col) => `${col.name}|${col.dataType}|${col.nullable ? 1 : 0}`).join('\u0001')}\u0002${rows.value.length}`,
  buildOptions: () => ({
    height: '100%',
    layout: 'fitData',
    renderHorizontal: 'basic',
    movableColumns: true,
    selectableRows: false,
    selectableRange: true,
    selectableRangeColumns: true,
    selectableRangeRows: false,
    selectableRangeInitializeDefault: false,
    selectableRangeAutoFocus: false,
    headerSortClickElement: 'icon',
    tooltipDelay: 150,
    index: '__sqlightRowId',
    rowHeight: 28,
    columns: buildColumnDefinitions(),
  }),
  onReady: (table) => {
    selection.attach(table);
    table.on('cellContext', handleCellContext);
    table.on('cellClick', handleCellClick);
    table.on('headerClick', handleHeaderClick);
    applyQuickFilterTerm(quickFilterApplied.value);
  },
});

watch(
  () => [isLoading.value, error.value, gridColumnSignature()] as const,
  async () => {
    await nextTick();
    await grid.sync();
  }
);

// `useTabulatorTable` builds the table into its own container element.
const gridTableRef = grid.containerRef;

onMounted(async () => {
  await nextTick();
  await grid.sync();
});

watch(
  () => rows.value,
  async () => {
    await nextTick();
    await grid.sync();
  }
);

watch(quickFilter, (value) => {
  if (quickFilterTimer) {
    clearTimeout(quickFilterTimer);
    quickFilterTimer = null;
  }

  if (rows.value.length < QUICK_FILTER_DEBOUNCE_ROW_THRESHOLD) {
    quickFilterApplied.value = value;
    return;
  }

  quickFilterTimer = setTimeout(() => {
    quickFilterTimer = null;
    quickFilterApplied.value = value;
  }, QUICK_FILTER_DEBOUNCE_MS);
});

watch(quickFilterApplied, (value) => {
  applyQuickFilterTerm(value);
});

function gridColumnSignature(): string {
  return columns.value.map((col) => `${col.name}|${col.dataType}|${col.nullable ? 1 : 0}`).join('\u0001');
}

// While the horizontal scrollbar is dragged the grid repaints every frame, so decorative
// transitions are switched off until the scroll settles.
function markHorizontalScrolling() {
  if (!isHorizontalScrolling.value) {
    isHorizontalScrolling.value = true;
  }
  if (horizontalScrollTimer) {
    clearTimeout(horizontalScrollTimer);
  }
  horizontalScrollTimer = setTimeout(() => {
    horizontalScrollTimer = null;
    isHorizontalScrolling.value = false;
  }, 150);
}

function handleGridScroll(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target || typeof target.scrollLeft !== 'number') return;
  if (target.scrollLeft !== lastScrollLeft) {
    lastScrollLeft = target.scrollLeft;
    markHorizontalScrolling();
  }
}

onBeforeUnmount(() => {
  if (horizontalScrollTimer) {
    clearTimeout(horizontalScrollTimer);
    horizontalScrollTimer = null;
  }
  if (quickFilterTimer) {
    clearTimeout(quickFilterTimer);
    quickFilterTimer = null;
  }
});

function handleCellContext(event: MouseEvent, cell: TabulatorCellComponent) {
  event.preventDefault();
  event.stopPropagation();

  const menuWidth = 220;
  const menuHeight = 280;
  const x = Math.min(event.clientX, Math.max(0, window.innerWidth - menuWidth - 8));
  const y = Math.min(event.clientY, Math.max(0, window.innerHeight - menuHeight - 8));

  const field = cell.getField();
  const colIdx = getColIndex(field);
  const realColName = colIdx !== undefined ? columns.value[colIdx]?.name : '#';

  contextMenu.visible = true;
  contextMenu.x = x;
  contextMenu.y = y;
  contextMenu.colId = field;
  contextMenu.colName = realColName || '';
  contextMenu.cellValue = cell.getValue();
  contextMenu.rowIndex = cell.getRow().getPosition() - 1;
  contextMenu.rowData = cell.getRow().getData() as unknown as CellValue[];

  function closeMenu() {
    contextMenu.visible = false;
    document.removeEventListener('click', closeMenu);
  }
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);
}

/** Clicking the frozen `#` cell selects the whole row, matching the previous grid. */
function handleCellClick(_event: MouseEvent, cell: TabulatorCellComponent) {
  if (cell.getField() !== ROW_INDEX_FIELD) return;
  selection.selectRow(cell.getRow());
}

/** Clicking the `#` header selects the whole table. */
function handleHeaderClick(_event: MouseEvent, column: { getField(): string }) {
  if (column.getField() !== ROW_INDEX_FIELD) return;
  selection.selectAll();
}

function handleGenerateDml(type: 'INSERT' | 'UPDATE' | 'DELETE') {
  const row = contextMenu.rowData || (contextMenu.rowIndex >= 0 && rows.value ? rows.value[contextMenu.rowIndex] : null);
  if (!row) {
    contextMenu.visible = false;
    return;
  }

  const connId = connectionStore.activeConnectionId || undefined;
  const db = connectionStore.activeDatabase || undefined;
  const tableSchema = connId && db
    ? (schemaStore.getTable(props.tableName, connId, db) || schemaStore.getTable(`${props.schema}.${props.tableName}`, connId, db))
    : undefined;

  const primaryKeyColumns = tableSchema?.columns
    .filter((c) => c.isPrimaryKey)
    .map((c) => c.name);

  const pkColNames = new Set(
    primaryKeyColumns?.map((c) => c.toLowerCase()) ?? []
  );

  const identityColNames = new Set(
    tableSchema?.columns
      .filter((c) => c.isIdentity)
      .map((c) => c.name.toLowerCase()) ?? []
  );

  const cols: ColumnInfo[] = columns.value.map((col) => ({
    name: col.name,
    dataType: col.dataType,
    isPrimaryKey: pkColNames.has(col.name.toLowerCase()),
    isIdentity: identityColNames.has(col.name.toLowerCase()),
  }));

  const dmlParams: GenerateDmlParams = {
    tableName: props.tableName,
    schema: props.schema,
    database: db,
    columns: cols,
    row,
    primaryKeyColumns,
  };

  let generated = '';
  try {
    if (type === 'INSERT') {
      generated = generateInsertStatement(dmlParams);
    } else if (type === 'UPDATE') {
      generated = generateUpdateStatement(dmlParams);
    } else if (type === 'DELETE') {
      generated = generateDeleteStatement(dmlParams);
    }

    try {
      navigator.clipboard?.writeText(generated);
    } catch (err) {
      // Ignore clipboard error
    }

    workspaceStore.addSqlTab(generated, `${type}: [${props.schema}].[${props.tableName}]`, connId, db);
    workspaceStore.showToast(`已建立 ${type} 語法並開啟新分頁（已複製至剪貼簿）`, 'success', 2500);
  } catch (err: any) {
    workspaceStore.showToast(`產生 ${type} 語法失敗: ${err?.message || err}`, 'error', 3500);
  }

  contextMenu.visible = false;
}

async function loadData() {
  const connId = connectionStore.activeConnectionId;
  if (!connId) {
    error.value = 'No active connection';
    return;
  }

  isLoading.value = true;
  error.value = null;

  try {
    const limit = queryStore.maxRows ?? 10000;
    const db = props.schema ? connectionStore.activeDatabase || 'master' : 'master';
    const sql = `SELECT TOP ${limit} * FROM [${props.schema}].[${props.tableName}];`;
    const res = await queryService.executeQuery(connId, db, sql, limit);
    if (res.resultSets.length > 0 && res.resultSets[0]) {
      columns.value = res.resultSets[0].columns;
      rows.value = markRaw(res.resultSets[0].rows);
    } else {
      columns.value = [];
      rows.value = [];
    }
    // Reloading drops the visible view state: sorting and filtering start over from the raw data.
    resetGridState();
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    isLoading.value = false;
    clearCellSelection();
  }
}

/** Refresh resets sorting and the quick filter; column widths/order are kept. */
function resetGridState() {
  quickFilter.value = '';
  quickFilterApplied.value = '';
  if (quickFilterTimer) {
    clearTimeout(quickFilterTimer);
    quickFilterTimer = null;
  }

  const table = grid.table.value;
  if (table) {
    table.clearSort();
    table.clearFilter();
  }
}

onMounted(() => {
  loadData();
});

// Refresh when the table data changes elsewhere (e.g. a TSV import for this table).
const tableDataVersionKey = computed(() => {
  const connId = connectionStore.activeConnectionId ?? '';
  const database = connectionStore.activeDatabase || 'master';
  return `${connId}|${database}|${props.schema}|${props.tableName}`.toLowerCase();
});

watch(
  () => workspaceStore.tableDataVersions[tableDataVersionKey.value] ?? 0,
  (version, previous) => {
    if (version !== previous) {
      loadData();
    }
  }
);
</script>
