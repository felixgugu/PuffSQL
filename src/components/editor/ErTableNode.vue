<template>
  <div
    class="w-full h-full rounded-md overflow-hidden flex flex-col font-sans transition-all select-none group relative border"
    :class="[
      isLightTheme
        ? 'bg-slate-50 border-slate-400 hover:border-brand-500/70 shadow-md shadow-slate-300/40 text-slate-800'
        : 'bg-dark-850 border-dark-700 hover:border-brand-500/70 shadow-xl shadow-black/40 text-dark-100',
      isSelected
        ? (isLightTheme ? 'ring-2 ring-brand-500 border-brand-500 shadow-brand-500/20' : 'ring-2 ring-brand-400 border-brand-400 shadow-brand-500/20')
        : ''
    ]"
  >
    <!-- Table Header -->
    <div
      class="h-8 px-2.5 flex items-center justify-between flex-shrink-0 cursor-move border-b"
      :class="isLightTheme ? 'bg-slate-100 border-slate-300' : 'bg-dark-800 border-dark-700/80'"
    >
      <div class="flex items-center space-x-1.5 min-w-0 flex-1">
        <Table2 class="w-3.5 h-3.5 flex-shrink-0" :class="isLightTheme ? 'text-ok' : 'text-ok'" />
        <span class="text-xxs font-sans truncate flex-shrink-0" :class="isLightTheme ? 'text-slate-600' : 'text-dark-400'">{{ nodeData.schema }}.</span>
        <span class="text-xs font-semibold truncate flex-1 font-sans" :class="isLightTheme ? 'text-slate-800' : 'text-dark-100'" :title="`${nodeData.schema}.${nodeData.table}`">
          {{ nodeData.table }}
        </span>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center space-x-0.5 ml-1 flex-shrink-0">
        <button
          type="button"
          @click.stop="removeTable"
          class="p-1 rounded transition-colors"
          :class="isLightTheme ? 'text-slate-600 hover:text-danger hover:bg-slate-200' : 'text-dark-400 hover:text-danger hover:bg-dark-750'"
          title="從畫布移除此表"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Columns List Body -->
    <div
      class="flex-1 overflow-x-hidden overflow-y-hidden text-xxs font-sans divide-y"
      :class="isLightTheme ? 'divide-slate-100' : 'divide-dark-800/60'"
    >
      <div
        v-for="col in visibleColumns"
        :key="col.name"
        class="h-6 px-2 flex items-center justify-between transition-colors relative"
        :class="[
          isLightTheme
            ? (col.isPrimaryKey ? 'bg-amber-50/70' : (col.isForeignKey ? 'bg-sky-50/70' : 'hover:bg-slate-50'))
            : (col.isPrimaryKey ? 'bg-amber-500/5' : (col.isForeignKey ? 'bg-sky-500/5' : 'hover:bg-dark-750/70')),
          nodeData.isEditMode && !isColumnChecked(col.name)
            ? (isLightTheme ? 'bg-slate-100/60' : 'bg-dark-950/40')
            : ''
        ]"
        :title="`${col.name} (${col.dataType}${col.maxLength ? `(${col.maxLength})` : ''}) ${col.isNullable ? 'NULL' : 'NOT NULL'}`"
      >
        <!-- Left Column Info: Checkbox, Icons & Name -->
        <div class="flex items-center space-x-1.5 min-w-0 flex-1 mr-2">
          <!-- Checkbox in Edit Mode -->
          <input
            v-if="nodeData.isEditMode"
            type="checkbox"
            :checked="isColumnChecked(col.name)"
            :disabled="isColumnConnected(col.name)"
            @click.stop="toggleColumn(col.name)"
            class="w-3 h-3 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            :class="isLightTheme ? 'bg-slate-50 border-slate-300 text-warn' : 'bg-dark-900 border-dark-600 text-warn'"
            :title="
              isColumnConnected(col.name)
                ? '此欄位已有外鍵或關聯連線，不可隱藏'
                : isColumnChecked(col.name)
                ? '已勾選 (點擊取消以隱藏)'
                : '未勾選 (檢視模式下將隱藏，不可連線)'
            "
          />

          <!-- PK / FK / Default Icon -->
          <Key v-if="col.isPrimaryKey" class="w-2.5 h-2.5 flex-shrink-0" :class="isLightTheme ? 'text-warn' : 'text-warn'" />
          <Link2 v-else-if="col.isForeignKey" class="w-2.5 h-2.5 flex-shrink-0" :class="isLightTheme ? 'text-info' : 'text-info'" />
          <div v-else class="w-2.5 h-2.5 flex items-center justify-center flex-shrink-0">
            <span class="w-1 h-1 rounded-full" :class="isLightTheme ? 'bg-slate-400' : 'bg-dark-500'"></span>
          </div>

          <span
            class="truncate"
            :class="[
              nodeData.isEditMode && !isColumnChecked(col.name)
                ? (isLightTheme ? 'text-slate-600 line-through' : 'text-[#cccccc]')
                : col.isPrimaryKey
                ? (isLightTheme ? 'text-warn font-semibold' : 'text-warn font-semibold')
                : col.isForeignKey
                ? (isLightTheme ? 'text-info' : 'text-info')
                : (isLightTheme ? 'text-slate-700' : 'text-dark-200')
            ]"
          >
            {{ col.name }}
          </span>
        </div>

        <!-- Right Column Info: Data Type -->
        <div
          class="flex items-center space-x-1 flex-shrink-0 text-xxs font-medium"
          :class="nodeData.isEditMode && !isColumnChecked(col.name)
            ? (isLightTheme ? 'text-slate-600/70' : 'text-[#cccccc]/70')
            : (isLightTheme ? 'text-slate-600' : 'text-dark-400')"
        >
          <span class="truncate max-w-[80px]" :title="col.dataType">
            {{ formatDataType(col) }}
          </span>
        </div>
      </div>

    </div>

    <!-- Edit Mode Sub-Toolbar (Column Selection Controls) -->
    <div
      v-if="nodeData.isEditMode"
      class="h-6 px-2 border-t flex items-center justify-between text-xxs select-none font-sans flex-shrink-0"
      :class="isLightTheme ? 'bg-slate-50 border-slate-300 text-slate-500' : 'bg-dark-900 border-dark-750 text-dark-400'"
    >
      <div class="flex items-center space-x-1">
        <CheckSquare class="w-3 h-3 flex-shrink-0" :class="isLightTheme ? 'text-warn' : 'text-warn'" />
        <span class="text-xxs font-medium">欄位 ({{ checkedCount }}/{{ nodeData.columns.length }})</span>
      </div>

      <div class="flex items-center space-x-1">
        <button
          type="button"
          @click.stop="checkAllColumns"
          class="px-1.5 py-0.5 rounded text-xxs font-medium transition-colors cursor-pointer border"
          :class="isLightTheme ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200' : 'bg-dark-800 hover:bg-dark-750 text-dark-200 hover:text-white border-dark-700'"
          title="全部勾選顯示"
        >
          全選
        </button>
        <button
          type="button"
          @click.stop="uncheckAllColumns"
          class="px-1.5 py-0.5 rounded text-xxs font-medium transition-colors cursor-pointer border"
          :class="isLightTheme ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200' : 'bg-dark-800 hover:bg-dark-750 text-dark-200 hover:text-white border-dark-700'"
          title="全部取消 (已有連線的欄位將自動保留)"
        >
          全取消
        </button>
      </div>
    </div>

    <!-- Drag Resize Grip Handle (View Mode Only, Height/Length Only) -->
    <div
      v-if="!nodeData.isEditMode"
      @mousedown.stop="startResize"
      @dblclick.stop="resetHeight"
      class="absolute bottom-0 right-0 w-3.5 h-3.5 flex items-center justify-center cursor-ns-resize select-none opacity-40 hover:opacity-100 z-10 transition-opacity"
      :class="isLightTheme ? 'text-slate-600 hover:text-slate-700' : 'text-dark-400 hover:text-dark-100'"
      title="拖曳以縮放長度 (高度)；雙擊重設為最適高度"
    >
      <svg class="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor">
        <circle cx="8" cy="8" r="1" />
        <circle cx="5" cy="8" r="1" />
        <circle cx="8" cy="5" r="1" />
        <circle cx="2" cy="8" r="1" />
        <circle cx="5" cy="5" r="1" />
        <circle cx="8" cy="2" r="1" />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, onMounted } from 'vue';
import { Table2, Key, Link2, X, CheckSquare } from '@/components/icons';
import type { Node } from '@antv/x6';
import type { ColumnItem } from '@/types/schema';
import { useSettingsStore } from '@/stores/settingsStore';

export interface ErTableColumn extends ColumnItem {
  isForeignKey?: boolean;
}

export interface ErTableNodeData {
  schema: string;
  table: string;
  isRoot?: boolean;
  isKeysOnly?: boolean;
  columns: ErTableColumn[];
  checkedColumns?: string[];
  isEditMode?: boolean;
  customHeight?: number;
  erTheme?: 'dark' | 'light';
}

const getNode = inject<() => Node>('getNode');
const node = getNode ? getNode() : null;

const settingsStore = useSettingsStore();

const nodeData = ref<ErTableNodeData>({
  schema: 'dbo',
  table: 'Table',
  isRoot: false,
  isKeysOnly: false,
  columns: [],
  checkedColumns: undefined,
  isEditMode: false,
});

const isLightTheme = computed(() => (nodeData.value.erTheme || settingsStore.erTheme) === 'light');

const isSelected = ref(false);
const connectedCols = ref<Set<string>>(new Set());

function getConnectedColumnNames(): Set<string> {
  const set = new Set<string>();
  if (!node) return set;
  const graph = node.model?.graph;
  if (!graph) return set;
  try {
    const edges = graph.getConnectedEdges(node) || [];
    for (const edge of edges) {
      const srcCell = edge.getSourceCell();
      const tgtCell = edge.getTargetCell();
      if (srcCell === node) {
        const p = edge.getSourcePortId() || '';
        const col = p.replace(/-(in|out)$/, '');
        if (col) set.add(col);
      }
      if (tgtCell === node) {
        const p = edge.getTargetPortId() || '';
        const col = p.replace(/-(in|out)$/, '');
        if (col) set.add(col);
      }
    }
  } catch (e) {
    console.warn('Failed to get connected edges:', e);
  }
  return set;
}

function refreshConnectedCols() {
  connectedCols.value = getConnectedColumnNames();
}

onMounted(() => {
  if (node) {
    const d = node.getData<ErTableNodeData>();
    if (d) {
      nodeData.value = { ...d };
    }
    node.on('change:data', ({ current }) => {
      if (current) {
        nodeData.value = { ...current };
        refreshConnectedCols();
      }
    });

    // Selection & Edge tracking
    const graph = node.model?.graph;
    if (graph) {
      graph.on('cell:selected', ({ cell }) => {
        if (cell === node) isSelected.value = true;
      });
      graph.on('cell:unselected', ({ cell }) => {
        if (cell === node) isSelected.value = false;
      });
      graph.on('edge:connected', refreshConnectedCols);
      graph.on('edge:removed', refreshConnectedCols);
      graph.on('edge:added', refreshConnectedCols);
      refreshConnectedCols();
    }
  }
});

const isColumnChecked = (colName: string): boolean => {
  if (nodeData.value.checkedColumns === undefined) return true;
  return nodeData.value.checkedColumns.includes(colName);
};

const isColumnConnected = (colName: string): boolean => {
  return connectedCols.value.has(colName);
};

const checkedCount = computed(() => {
  if (nodeData.value.checkedColumns === undefined) return nodeData.value.columns.length;
  return nodeData.value.columns.filter((c) => nodeData.value.checkedColumns?.includes(c.name)).length;
});

const visibleColumns = computed(() => {
  // In edit mode: show ALL columns so user can check/uncheck them
  if (nodeData.value.isEditMode) {
    return nodeData.value.columns;
  }
  // In view mode: show ONLY checked columns
  return nodeData.value.columns.filter((c) => isColumnChecked(c.name));
});

function formatDataType(col: ErTableColumn): string {
  if (col.maxLength && col.maxLength > 0) {
    return `${col.dataType}(${col.maxLength})`;
  }
  return col.dataType;
}

function checkAllColumns() {
  if (!node) return;
  const allNames = nodeData.value.columns.map((c) => c.name);
  nodeData.value.checkedColumns = allNames;
  node.setData({ ...nodeData.value, checkedColumns: allNames }, { overwrite: true });
}

function uncheckAllColumns() {
  if (!node) return;
  refreshConnectedCols();
  // Keep connected columns checked, uncheck all others
  const remaining = nodeData.value.columns
    .map((c) => c.name)
    .filter((name) => connectedCols.value.has(name));
  nodeData.value.checkedColumns = remaining;
  node.setData({ ...nodeData.value, checkedColumns: remaining }, { overwrite: true });
}

function toggleColumn(colName: string) {
  if (!node) return;
  if (isColumnConnected(colName)) return; // Protected

  const currentList = nodeData.value.checkedColumns !== undefined
    ? [...nodeData.value.checkedColumns]
    : nodeData.value.columns.map((c) => c.name);

  const idx = currentList.indexOf(colName);
  if (idx > -1) {
    currentList.splice(idx, 1);
  } else {
    currentList.push(colName);
  }

  nodeData.value.checkedColumns = currentList;
  node.setData({ ...nodeData.value, checkedColumns: currentList }, { overwrite: true });
}


function removeTable() {
  if (node) {
    node.remove();
  }
}

function getMinSafeHeight(): number {
  refreshConnectedCols();
  const HEADER_HEIGHT = 32;
  const ROW_HEIGHT = 24;
  const BORDER_OFFSET = 1;
  let maxIdx = -1;
  const cols = visibleColumns.value;
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    if (col && connectedCols.value.has(col.name)) {
      maxIdx = i;
    }
  }
  if (maxIdx >= 0) {
    return BORDER_OFFSET * 2 + HEADER_HEIGHT + (maxIdx + 1) * ROW_HEIGHT;
  }
  return 60;
}

function startResize(e: MouseEvent) {
  if (!node) return;
  e.preventDefault();
  e.stopPropagation();

  const graph = node.model?.graph;
  const zoom = graph ? graph.zoom() : 1;
  const startY = e.clientY;
  const currentSize = node.size();
  const startH = currentSize.height;
  const startW = currentSize.width;
  const minSafeH = getMinSafeHeight();

  function onMouseMove(moveEvent: MouseEvent) {
    const dy = (moveEvent.clientY - startY) / zoom;
    const newH = Math.max(minSafeH, Math.round(startH + dy));
    node?.setSize({ width: startW, height: newH });
  }

  function onMouseUp(upEvent: MouseEvent) {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);

    const dy = (upEvent.clientY - startY) / zoom;
    const finalH = Math.max(minSafeH, Math.round(startH + dy));
    node?.setSize({ width: startW, height: finalH });

    const current = node?.getData<ErTableNodeData>() || {};
    node?.setData({ ...current, customHeight: finalH }, { overwrite: true });
  }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function resetHeight() {
  if (!node) return;
  const current = node.getData<ErTableNodeData>() || {};
  node.setData({ ...current, customHeight: undefined }, { overwrite: true });
}
</script>
