<template>
  <div class="w-full h-full flex flex-col bg-dark-900 overflow-hidden font-sans text-xs select-none">
    <!-- Subheader toolbar for Table Structure -->
    <div class="h-8 bg-dark-850 border-b border-dark-700 flex items-center justify-between px-2 text-xs flex-shrink-0 space-x-2">
      <div class="flex items-center space-x-2 min-w-0">
        <List class="w-3 h-3 text-structure flex-shrink-0" />
        <span class="font-semibold text-dark-100 truncate">{{ schema }}.{{ tableName }}</span>
        <span class="text-dark-600">|</span>
        <SqChip :label="$t('structure.columnsTag', { count: columns.length })" tone="neutral" />
        <SqChip v-if="pkCount > 0" :label="$t('structure.pkTag', { count: pkCount })" tone="warn" />
        <SqChip v-if="identityCount > 0" :label="$t('structure.identityTag', { count: identityCount })" tone="neutral" />

        <!-- Quick Filter Input -->
        <SqInput
          v-model="quickFilter"
          type="text"
          :placeholder="$t('structure.searchColumnsPlaceholder')"
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
          v-tooltip.top="$t('structure.copyTsvTooltip')"
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
          v-tooltip.top="$t('structure.copyJsonTooltip')"
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
          v-tooltip.top="$t('structure.copyMdTooltip')"
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
          @click="loadStructure"
          v-tooltip.top="$t('structure.reloadStructureTooltip')"
        >
          <template #icon><RefreshCw class="w-3.5 h-3.5" /></template>
        </SqButton>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center text-dark-400 space-x-2">
      <RotateCw class="w-4 h-4 animate-spin text-structure" />
      <span>{{ $t('structure.loadingStructure') }}</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex-1 p-4 text-danger">
      <div class="font-semibold mb-1">{{ $t('structure.loadFailed') }}</div>
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
            <span>{{ $t('structure.totalColumnsSummary', { count: columns.length }) }}</span>
            <span class="text-dark-600">|</span>
            <span>{{ $t('structure.pkColumnsSummary', { count: pkCount }) }}</span>
            <span class="text-dark-600">|</span>
            <span>{{ $t('structure.identityColumnsSummary', { count: identityCount }) }}</span>
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
      class="fixed z-50 bg-dark-800 border border-dark-700 rounded-md shadow-overlay py-1 w-64 text-xs font-sans text-dark-200 select-none"
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
        <span>{{ $t('structure.copyRowInfo') }}</span>
      </button>

      <button
        @click="copyCurrentRowAsJson"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <Braces class="w-3.5 h-3.5 text-ok" />
        <span>{{ $t('dataView.copyRowJson') }}</span>
      </button>

      <div class="my-1 border-t border-dark-750"></div>

      <!-- ALTER TABLE Section Header -->
      <div class="px-2.5 py-1 text-xxs text-structure font-semibold uppercase tracking-wider flex items-center justify-between">
        <span>{{ $t('structure.generateAlterHeader') }}</span>
        <span v-if="targetColumnName" class="text-dark-500 font-mono text-xxs font-medium truncate max-w-[110px]">
          {{ targetColumnName }}
        </span>
      </div>

      <!-- 1. ALTER COLUMN -->
      <div class="flex items-center hover:bg-dark-750 group transition-colors">
        <button
          type="button"
          @click="handleAlterColumnScript('alter')"
          class="flex-1 text-left px-2.5 py-1.5 hover:text-dark-100 flex items-center space-x-2 transition-colors min-w-0"
          :title="$t('structure.alterColumnTooltip')"
        >
          <Pencil class="w-3.5 h-3.5 text-warn flex-shrink-0" />
          <span class="truncate">{{ $t('structure.alterColumn') }}</span>
        </button>
        <button
          type="button"
          @click.stop="handleCopyAlterColumnScript('alter')"
          class="p-1.5 text-dark-400 hover:text-accent rounded hover:bg-dark-700 mr-1.5 transition-colors flex-shrink-0"
          :title="$t('structure.copyAlterTooltip')"
        >
          <Copy class="w-3 h-3" />
        </button>
      </div>

      <!-- 2. ADD COLUMN -->
      <div class="flex items-center hover:bg-dark-750 group transition-colors">
        <button
          type="button"
          @click="handleAlterColumnScript('add')"
          class="flex-1 text-left px-2.5 py-1.5 hover:text-dark-100 flex items-center space-x-2 transition-colors min-w-0"
          :title="$t('structure.addColumnTooltip')"
        >
          <Plus class="w-3.5 h-3.5 text-ok flex-shrink-0" />
          <span class="truncate">{{ $t('structure.addColumn') }}</span>
        </button>
        <button
          type="button"
          @click.stop="handleCopyAlterColumnScript('add')"
          class="p-1.5 text-dark-400 hover:text-accent rounded hover:bg-dark-700 mr-1.5 transition-colors flex-shrink-0"
          :title="$t('structure.copyAddTooltip')"
        >
          <Copy class="w-3 h-3" />
        </button>
      </div>

      <!-- 3. DROP COLUMN -->
      <div class="flex items-center hover:bg-dark-750 group transition-colors">
        <button
          type="button"
          @click="handleAlterColumnScript('drop')"
          class="flex-1 text-left px-2.5 py-1.5 hover:text-danger text-danger/90 flex items-center space-x-2 transition-colors min-w-0"
          :title="$t('structure.dropColumnTooltip')"
        >
          <Trash2 class="w-3.5 h-3.5 text-danger flex-shrink-0" />
          <span class="truncate">{{ $t('structure.dropColumn') }}</span>
        </button>
        <button
          type="button"
          @click.stop="handleCopyAlterColumnScript('drop')"
          class="p-1.5 text-dark-400 hover:text-danger rounded hover:bg-dark-700 mr-1.5 transition-colors flex-shrink-0"
          :title="$t('structure.copyDropTooltip')"
        >
          <Copy class="w-3 h-3" />
        </button>
      </div>

      <!-- 4. ALL ALTER TEMPLATES -->
      <div class="flex items-center hover:bg-dark-750 group transition-colors border-t border-dark-750/50">
        <button
          type="button"
          @click="handleAlterColumnScript('all')"
          class="flex-1 text-left px-2.5 py-1.5 hover:text-dark-100 flex items-center space-x-2 transition-colors min-w-0 text-structure"
          :title="$t('structure.allAlterTooltip')"
        >
          <FileCode class="w-3.5 h-3.5 text-structure flex-shrink-0" />
          <span class="truncate">{{ $t('structure.allAlterTemplate') }}</span>
        </button>
        <button
          type="button"
          @click.stop="handleCopyAlterColumnScript('all')"
          class="p-1.5 text-dark-400 hover:text-structure rounded hover:bg-dark-700 mr-1.5 transition-colors flex-shrink-0"
          :title="$t('structure.copyAllAlterTooltip')"
        >
          <Copy class="w-3 h-3" />
        </button>
      </div>

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
        <span>{{ $t('results.copySelectionAsJson') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import SqButton from '@/components/ui/SqButton.vue';
import SqInput from '@/components/ui/SqInput.vue';
import SqChip from '@/components/ui/SqChip.vue';
import {
  FileText,
  Copy,
  Braces,
  Plus,
  Trash2,
  Pencil,
  FileCode,
  Search,
  Check,
  FileSpreadsheet,
  List,
  RefreshCw,
  Table2,
} from 'lucide-vue-next';
import {
  generateAlterColumnSql,
  generateDropColumnSql,
  generateAddColumnSql,
  generateAllAlterTableTemplateSql,
  type AlterTableColumnOptions,
} from '@/utils/alterTableGenerator';
import type {
  TabulatorCellComponent,
  TabulatorColumnDefinition,
  TabulatorFormatter,
  TabulatorRowData,
} from 'tabulator-tables';
import { queryService } from '@/services/queryService';
import { useConnectionStore } from '@/stores/connectionStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatValueForDisplay } from '@/composables/useColumnAutoWidth';
import { useTabulatorTable } from '@/composables/useTabulatorTable';
import { useGridSelection } from '@/composables/useGridSelection';
import { useGridExport } from '@/composables/useGridExport';
import { buildBadge } from '@/utils/tabulatorColumns';
import type { ColumnDef, CellValue } from '@/types/query';

const props = defineProps<{
  schema: string;
  tableName: string;
}>();

const settingsStore = useSettingsStore();
const connectionStore = useConnectionStore();
const workspaceStore = useWorkspaceStore();

export interface ColumnStructureRow {
  ordinal: number;
  columnName: string;
  dataType: string;
  fullType: string;
  maxLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
  isNullable: string;
  /** `PK` when the column belongs to the primary key, otherwise an empty string. */
  isPrimaryKey: string;
  /** `YES` when the column is an identity column, otherwise an empty string. */
  isIdentity: string;
  defaultValue: string | null;
  collation: string | null;
  [key: string]: unknown;
}

const isLoading = ref(false);
const error = ref<string | null>(null);
const columns = ref<ColumnStructureRow[]>([]);
const quickFilter = ref('');
const gridContainerRef = ref<HTMLDivElement | null>(null);
const isHorizontalScrolling = ref(false);
let horizontalScrollTimer: ReturnType<typeof setTimeout> | null = null;
let lastScrollLeft = 0;

const pkCount = computed(() => columns.value.filter((c) => c.isPrimaryKey === 'PK').length);
const identityCount = computed(() => columns.value.filter((c) => c.isIdentity === 'YES').length);

// Cell Context Menu State
const contextMenu = reactive<{
  visible: boolean;
  x: number;
  y: number;
  colName: string;
  cellValue: unknown;
  rowIndex: number;
  selectedRow: ColumnStructureRow | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  colName: '',
  cellValue: null,
  rowIndex: -1,
  selectedRow: null,
});

const targetColumnName = computed(() => {
  return contextMenu.selectedRow?.columnName || contextMenu.colName || '';
});

// Adapter columns for export & selection
const exportColumns = computed<ColumnDef[]>(() => [
  { name: 'ordinal', dataType: 'int', nullable: false, ordinal: 1 },
  { name: 'isPrimaryKey', dataType: 'bit', nullable: false, ordinal: 2 },
  { name: 'columnName', dataType: 'nvarchar', nullable: false, ordinal: 3 },
  { name: 'dataType', dataType: 'nvarchar', nullable: false, ordinal: 4 },
  { name: 'fullType', dataType: 'nvarchar', nullable: false, ordinal: 5 },
  { name: 'isNullable', dataType: 'varchar', nullable: false, ordinal: 6 },
  { name: 'isIdentity', dataType: 'bit', nullable: false, ordinal: 7 },
  { name: 'defaultValue', dataType: 'nvarchar', nullable: true, ordinal: 8 },
  { name: 'maxLength', dataType: 'int', nullable: true, ordinal: 9 },
  { name: 'numericPrecision', dataType: 'int', nullable: true, ordinal: 10 },
  { name: 'numericScale', dataType: 'int', nullable: true, ordinal: 11 },
  { name: 'collation', dataType: 'nvarchar', nullable: true, ordinal: 12 },
]);

// Adapter row for the array based export helpers (array of arrays, display values only).
function exportRowFor(col: ColumnStructureRow): CellValue[] {
  return [
    col.ordinal,
    col.isPrimaryKey,
    col.columnName,
    col.dataType,
    col.fullType,
    col.isNullable,
    col.isIdentity,
    col.defaultValue,
    col.maxLength,
    col.numericPrecision,
    col.numericScale,
    col.collation,
  ];
}

const exportRows = computed<CellValue[][]>(() => columns.value.map(exportRowFor));

// Selection composable (Tabulator range based)
const selection = useGridSelection({
  getTable: () => grid.table.value,
  getContainer: () => gridContainerRef.value,
  getColumns: () => exportColumns.value,
  onCopySelected: () => gridExport.copySelectedCells(),
});

const {
  selectionStats,
  hasSelection,
  selectedColumnsCount,
  formatAggregateNumber,
  clearCellSelection,
} = selection;

// Export composable
const gridExport = useGridExport({
  getRows: () => exportRows.value,
  getColumns: () => exportColumns.value,
  selection,
  showToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error', duration?: number) =>
    workspaceStore.showToast(msg, type, duration),
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

/** Text node helper: formatters return DOM nodes so values are never injected as markup. */
function textNode(text: string, className?: string): Node {
  if (!className) return document.createTextNode(text);
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function dashForEmpty(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return '-';
  return String(value);
}

const pkBadgeFormatter: TabulatorFormatter = (cell) =>
  cell.getValue() === 'PK' ? buildBadge('PK', 'sqlight-badge sqlight-badge-pk') : textNode('');

const columnNameFormatter: TabulatorFormatter = (cell) => {
  const row = cell.getRow().getData() as unknown as ColumnStructureRow;
  const isPk = row?.isPrimaryKey === 'PK';
  return textNode(
    String(cell.getValue() ?? ''),
    isPk ? 'sqlight-column-name sqlight-column-name-pk' : 'sqlight-column-name'
  );
};

const nullableFormatter: TabulatorFormatter = (cell) =>
  cell.getValue() === 'YES'
    ? buildBadge('YES', 'sqlight-badge sqlight-badge-yes')
    : buildBadge('NO', 'sqlight-badge sqlight-badge-no');

const identityFormatter: TabulatorFormatter = (cell) =>
  cell.getValue() === 'YES'
    ? buildBadge('YES', 'sqlight-badge sqlight-badge-identity')
    : textNode('-', 'sqlight-badge-muted');

const defaultFormatter: TabulatorFormatter = (cell) => {
  const raw = cell.getValue();
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return textNode('NULL', 'sqlight-default-empty');
  }
  return textNode(String(raw), 'sqlight-default-value');
};

const maxLengthFormatter: TabulatorFormatter = (cell) => {
  const value = cell.getValue();
  if (value === -1) return textNode('MAX (-1)');
  return textNode(value === null || value === undefined ? '-' : String(value));
};

const dashFormatter: TabulatorFormatter = (cell) => textNode(dashForEmpty(cell.getValue()));

function buildColumnDefinitions(): TabulatorColumnDefinition[] {
  return [
    {
      field: 'ordinal',
      title: '#',
      width: 55,
      frozen: true,
      headerSort: true,
      hozAlign: 'center',
      cssClass: 'sqlight-cell-muted',
      formatter: (cell) => textNode(String(cell.getValue() ?? '')),
    },
    {
      field: 'isPrimaryKey',
      title: 'PK',
      width: 60,
      headerSort: true,
      hozAlign: 'center',
      formatter: pkBadgeFormatter,
    },
    {
      field: 'columnName',
      title: '欄位名稱 (Column Name)',
      width: 180,
      headerSort: true,
      formatter: columnNameFormatter,
    },
    {
      field: 'dataType',
      title: '基礎型別 (Data Type)',
      width: 125,
      headerSort: true,
      cssClass: 'sqlight-cell-datatype',
      formatter: (cell) => textNode(String(cell.getValue() ?? '')),
    },
    {
      field: 'fullType',
      title: '完整型別與長度 (Full Type)',
      width: 160,
      headerSort: true,
      cssClass: 'sqlight-cell-fulltype',
      formatter: (cell) => textNode(String(cell.getValue() ?? '')),
    },
    {
      field: 'isNullable',
      title: '可為 NULL',
      width: 95,
      headerSort: true,
      hozAlign: 'center',
      formatter: nullableFormatter,
    },
    {
      field: 'isIdentity',
      title: '自動識別 (Identity)',
      width: 120,
      headerSort: true,
      hozAlign: 'center',
      formatter: identityFormatter,
    },
    {
      field: 'defaultValue',
      title: '預設值 (Default)',
      width: 160,
      headerSort: true,
      formatter: defaultFormatter,
    },
    {
      field: 'maxLength',
      title: '最大長度 (Bytes)',
      width: 115,
      headerSort: true,
      hozAlign: 'right',
      cssClass: 'sqlight-cell-muted',
      formatter: maxLengthFormatter,
    },
    {
      field: 'numericPrecision',
      title: '精確度 (Precision)',
      width: 110,
      headerSort: true,
      hozAlign: 'right',
      cssClass: 'sqlight-cell-muted',
      formatter: dashFormatter,
    },
    {
      field: 'numericScale',
      title: '小數位數 (Scale)',
      width: 100,
      headerSort: true,
      hozAlign: 'right',
      cssClass: 'sqlight-cell-muted',
      formatter: dashFormatter,
    },
    {
      field: 'collation',
      title: '定序 (Collation)',
      width: 180,
      headerSort: true,
      cssClass: 'sqlight-cell-muted',
      formatter: (cell) => {
        const value = cell.getValue();
        if (value === null || value === undefined || String(value).trim() === '') {
          return textNode('-', 'sqlight-badge-muted');
        }
        return textNode(String(value), 'sqlight-collation-value');
      },
    },
  ];
}

// --------------------------------------------------------------------------
// Tabulator grid
// --------------------------------------------------------------------------

function buildQuickFilter(term: string): (data: TabulatorRowData) => boolean {
  const terms = term
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return (data) => {
    for (const needle of terms) {
      let matched = false;
      for (const value of Object.values(data)) {
        if (value === null || value === undefined) continue;
        if (formatValueForDisplay(value).toLowerCase().includes(needle)) {
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
  getRows: () => columns.value,
  getColumnSignature: () => 'table-structure',
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
    if (quickFilter.value) applyQuickFilterTerm(quickFilter.value);
  },
});

watch(
  () => [isLoading.value, error.value] as const,
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
  () => columns.value,
  async () => {
    await nextTick();
    await grid.sync();
  }
);

watch(quickFilter, (value) => {
  applyQuickFilterTerm(value);
});

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

async function loadStructure() {
  const connId = connectionStore.activeConnectionId;
  const db = connectionStore.activeDatabase;
  if (!connId || !db) {
    error.value = '未連線或未選擇資料庫';
    return;
  }

  isLoading.value = true;
  error.value = null;

  try {
    const escapedSchema = props.schema.replace(/'/g, "''");
    const escapedTable = props.tableName.replace(/'/g, "''");

    const sql = `
SELECT 
    c.ORDINAL_POSITION AS Ordinal,
    c.COLUMN_NAME AS ColumnName,
    c.DATA_TYPE AS DataType,
    CASE 
        WHEN c.DATA_TYPE IN ('nchar', 'nvarchar') THEN 
            c.DATA_TYPE + '(' + CASE WHEN c.CHARACTER_MAXIMUM_LENGTH = -1 THEN 'MAX' ELSE CAST(c.CHARACTER_MAXIMUM_LENGTH AS VARCHAR(10)) END + ')'
        WHEN c.DATA_TYPE IN ('char', 'varchar', 'binary', 'varbinary') THEN 
            c.DATA_TYPE + '(' + CASE WHEN c.CHARACTER_MAXIMUM_LENGTH = -1 THEN 'MAX' ELSE CAST(c.CHARACTER_MAXIMUM_LENGTH AS VARCHAR(10)) END + ')'
        WHEN c.DATA_TYPE IN ('decimal', 'numeric') THEN 
            c.DATA_TYPE + '(' + CAST(c.NUMERIC_PRECISION AS VARCHAR(10)) + ', ' + CAST(c.NUMERIC_SCALE AS VARCHAR(10)) + ')'
        WHEN c.DATA_TYPE IN ('datetime2', 'time', 'datetimeoffset') THEN 
            c.DATA_TYPE + '(' + CAST(c.DATETIME_PRECISION AS VARCHAR(10)) + ')'
        ELSE c.DATA_TYPE
    END AS FullType,
    c.CHARACTER_MAXIMUM_LENGTH AS MaxLength,
    c.NUMERIC_PRECISION AS NumericPrecision,
    c.NUMERIC_SCALE AS NumericScale,
    CASE WHEN c.IS_NULLABLE = 'YES' THEN 'YES' ELSE 'NO' END AS IsNullable,
    CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS IsPrimaryKey,
    ISNULL(COLUMNPROPERTY(OBJECT_ID(QUOTENAME(c.TABLE_SCHEMA) + '.' + QUOTENAME(c.TABLE_NAME)), c.COLUMN_NAME, 'IsIdentity'), 0) AS IsIdentity,
    c.COLUMN_DEFAULT AS DefaultValue,
    c.COLLATION_NAME AS Collation
FROM INFORMATION_SCHEMA.COLUMNS c
LEFT JOIN (
    SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
        ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
        AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
    WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
) pk ON c.TABLE_SCHEMA = pk.TABLE_SCHEMA 
    AND c.TABLE_NAME = pk.TABLE_NAME 
    AND c.COLUMN_NAME = pk.COLUMN_NAME
WHERE c.TABLE_SCHEMA = '${escapedSchema}' AND c.TABLE_NAME = '${escapedTable}'
ORDER BY c.ORDINAL_POSITION;
    `.trim();

    const res = await queryService.executeQuery(connId, db, sql, null);
    if (res.messages.some((m) => m.level === 'error')) {
      throw new Error(res.messages.find((m) => m.level === 'error')?.message || '查詢失敗');
    }

    const firstSet = res.resultSets[0];
    if (!firstSet) {
      columns.value = [];
      return;
    }

    const colIndexMap = new Map<string, number>();
    firstSet.columns.forEach((col, idx) => {
      colIndexMap.set(col.name.toLowerCase(), idx);
    });

    columns.value = firstSet.rows.map((row) => ({
      ordinal: Number(row[colIndexMap.get('ordinal') ?? 0] ?? 0),
      columnName: String(row[colIndexMap.get('columnname') ?? 1] ?? ''),
      dataType: String(row[colIndexMap.get('datatype') ?? 2] ?? ''),
      fullType: String(row[colIndexMap.get('fulltype') ?? 3] ?? ''),
      maxLength: row[colIndexMap.get('maxlength') ?? 4] != null ? Number(row[colIndexMap.get('maxlength') ?? 4]) : null,
      numericPrecision: row[colIndexMap.get('numericprecision') ?? 5] != null ? Number(row[colIndexMap.get('numericprecision') ?? 5]) : null,
      numericScale: row[colIndexMap.get('numericscale') ?? 6] != null ? Number(row[colIndexMap.get('numericscale') ?? 6]) : null,
      isNullable: String(row[colIndexMap.get('isnullable') ?? 7] ?? 'NO'),
      isPrimaryKey: Number(row[colIndexMap.get('isprimarykey') ?? 8] ?? 0) === 1 ? 'PK' : '',
      isIdentity: Number(row[colIndexMap.get('isidentity') ?? 9] ?? 0) === 1 ? 'YES' : '',
      defaultValue: row[colIndexMap.get('defaultvalue') ?? 10] != null ? String(row[colIndexMap.get('defaultvalue') ?? 10]) : null,
      collation: row[colIndexMap.get('collation') ?? 11] != null ? String(row[colIndexMap.get('collation') ?? 11]) : null,
    }));
    // Reloading drops the visible view state: sorting and filtering start over from the raw data.
    resetGridState();
  } catch (err: unknown) {
    console.error('Failed to load table structure:', err);
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    isLoading.value = false;
  }
}

/** Refresh resets sorting and the quick filter; column widths/order are kept. */
function resetGridState() {
  quickFilter.value = '';

  const table = grid.table.value;
  if (table) {
    table.clearSort();
    table.clearFilter();
  }
}

function handleCellContext(event: MouseEvent, cell: TabulatorCellComponent) {
  event.preventDefault();
  event.stopPropagation();

  contextMenu.x = Math.min(event.clientX, window.innerWidth - 275);
  contextMenu.y = Math.min(event.clientY, window.innerHeight - 350);
  contextMenu.colName = cell.getField();
  contextMenu.cellValue = cell.getValue();
  contextMenu.rowIndex = cell.getRow().getPosition() - 1;
  contextMenu.selectedRow = (cell.getRow().getData() as unknown as ColumnStructureRow) ?? null;
  contextMenu.visible = true;

  function closeMenu() {
    contextMenu.visible = false;
    document.removeEventListener('click', closeMenu);
  }
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);
}

function getAlterTableOptions(): AlterTableColumnOptions {
  const row = contextMenu.selectedRow;
  const colName = row?.columnName || contextMenu.colName || 'ColumnName';
  return {
    schema: props.schema,
    tableName: props.tableName,
    columnName: colName,
    dataType: row?.dataType,
    fullType: row?.fullType,
    isNullable: row?.isNullable,
    defaultValue: row?.defaultValue,
    database: connectionStore.activeDatabase,
  };
}

function handleAlterColumnScript(action: 'alter' | 'drop' | 'add' | 'all') {
  const opts = getAlterTableOptions();
  let sql = '';
  let title = '';
  let toastMsg = '';

  switch (action) {
    case 'alter':
      sql = generateAlterColumnSql(opts);
      title = `ALTER_${props.tableName}_${opts.columnName}.sql`;
      toastMsg = `已產生修改欄位 [${opts.columnName}] 語法`;
      break;
    case 'drop':
      sql = generateDropColumnSql(opts);
      title = `DROP_${props.tableName}_${opts.columnName}.sql`;
      toastMsg = `已產生刪除欄位 [${opts.columnName}] 語法`;
      break;
    case 'add':
      sql = generateAddColumnSql(opts);
      title = `ADD_${props.tableName}.sql`;
      toastMsg = `已產生新增欄位語法`;
      break;
    case 'all':
      sql = generateAllAlterTableTemplateSql(opts);
      title = `ALTER_${props.tableName}_Template.sql`;
      toastMsg = `已產生 ALTER TABLE 綜合樣板`;
      break;
  }

  workspaceStore.addSqlTab(
    sql,
    title,
    connectionStore.activeConnectionId || undefined,
    connectionStore.activeDatabase || undefined
  );
  workspaceStore.showToast(toastMsg, 'success', 2500);
  contextMenu.visible = false;
}

function handleCopyAlterColumnScript(action: 'alter' | 'drop' | 'add' | 'all') {
  const opts = getAlterTableOptions();
  let sql = '';
  let actionName = '';

  switch (action) {
    case 'alter':
      sql = generateAlterColumnSql(opts);
      actionName = `ALTER COLUMN [${opts.columnName}]`;
      break;
    case 'drop':
      sql = generateDropColumnSql(opts);
      actionName = `DROP COLUMN [${opts.columnName}]`;
      break;
    case 'add':
      sql = generateAddColumnSql(opts);
      actionName = 'ADD COLUMN';
      break;
    case 'all':
      sql = generateAllAlterTableTemplateSql(opts);
      actionName = 'ALTER TABLE 樣板';
      break;
  }

  try {
    navigator.clipboard?.writeText(sql);
    workspaceStore.showToast(`已複製 ${actionName} 語法至剪貼簿`, 'success', 2500);
  } catch (err) {
    console.warn('Failed to copy to clipboard:', err);
  }
  contextMenu.visible = false;
}

function copyCellValue() {
  exportCopyCellValue(contextMenu.cellValue);
}

function copyCurrentRow() {
  if (!contextMenu.selectedRow) return;
  exportCopyCurrentRow(exportRowFor(contextMenu.selectedRow));
}

function copyCurrentRowAsJson() {
  if (!contextMenu.selectedRow) return;
  exportCopyCurrentRowAsJson(exportColumns.value, exportRowFor(contextMenu.selectedRow));
}

onMounted(() => {
  loadStructure();
});

onBeforeUnmount(() => {
  if (horizontalScrollTimer) {
    clearTimeout(horizontalScrollTimer);
    horizontalScrollTimer = null;
  }
});

watch(
  () => [props.schema, props.tableName, connectionStore.activeConnectionId, connectionStore.activeDatabase],
  () => {
    loadStructure();
  }
);
</script>
