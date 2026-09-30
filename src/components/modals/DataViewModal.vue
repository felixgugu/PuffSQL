<template>
  <Teleport to="body">
    <!-- 資料檢視浮動視窗（與 AI 對話視窗相同：可縮放、最小化、移動） -->
    <div
      v-if="dataViewStore.isOpen && !dataViewStore.isMinimized"
      ref="panelRef"
      class="fixed z-[9995] flex flex-col font-sans overflow-hidden animate-fade-in"
      :class="[
        dataViewStore.isMaximized
          ? 'inset-0 w-screen h-screen rounded-none'
          : 'sq-dialog-surface bg-dark-850 text-dark-100',
      ]"
      :style="
        dataViewStore.isMaximized
          ? { top: 0, left: 0, width: '100vw', height: '100vh', borderRadius: '0px' }
          : {
              top: `${pos.top}px`,
              left: `${pos.left}px`,
              width: `${size.width}px`,
              height: `${size.height}px`,
              borderRadius:
                'var(--p-dialog-border-radius, var(--p-overlay-modal-border-radius, var(--p-content-border-radius, 0.5rem)))',
            }
      "
    >
      <!-- Header / Drag Titlebar -->
      <div
        class="h-11 px-4 bg-dark-800 border-b border-dark-750 dark:border-dark-700 flex items-center justify-between flex-shrink-0 select-none"
        :class="dataViewStore.isMaximized ? 'cursor-default' : 'cursor-move'"
        @pointerdown="handleTitlePointerDown"
        @dblclick="dataViewStore.toggleMaximize()"
      >
        <!-- Left: Title & Row Indicator -->
        <div class="flex items-center space-x-2.5 min-w-0">
          <div class="w-6 h-6 rounded-md bg-sky-500/20 text-info flex items-center justify-center flex-shrink-0">
            <Table2 class="w-3.5 h-3.5" />
          </div>
          <span class="text-xs font-semibold text-dark-100 truncate">
            資料檢視
            <span v-if="dataViewStore.tableName" class="text-dark-400 font-normal ml-1">
              - {{ dataViewStore.tableName }}
            </span>
          </span>
          <Tag
            :value="`第 ${dataViewStore.currentDisplayIndex} 列 / 共 ${dataViewStore.totalRows} 列`"
            severity="secondary"
            class="!text-xxs !py-0.5 !px-1.5 font-mono"
          />
        </div>

        <!-- Middle: Row Navigation (Prev / Next) -->
        <div v-if="dataViewStore.totalRows > 1" class="flex items-center space-x-1" @pointerdown.stop>
          <Button
            type="button"
            icon="pi pi-chevron-left"
            severity="secondary"
            text
            rounded
            size="small"
            :disabled="!dataViewStore.hasPrevRow"
            v-tooltip.top="'檢視上一筆資料列 (Alt+Up)'"
            class="!w-6 !h-6 !p-0"
            @click="dataViewStore.goToPrevRow()"
          />
          <span class="text-xxs text-dark-400 font-mono select-none px-1">
            {{ dataViewStore.currentDisplayIndex }} / {{ dataViewStore.totalRows }}
          </span>
          <Button
            type="button"
            icon="pi pi-chevron-right"
            severity="secondary"
            text
            rounded
            size="small"
            :disabled="!dataViewStore.hasNextRow"
            v-tooltip.top="'檢視下一筆資料列 (Alt+Down)'"
            class="!w-6 !h-6 !p-0"
            @click="dataViewStore.goToNextRow()"
          />
        </div>

        <!-- Right: Window Actions (Maximize, Minimize, Close) -->
        <div class="flex items-center space-x-1" @pointerdown.stop>
          <Button
            type="button"
            :icon="dataViewStore.isMaximized ? 'pi pi-window-minimize' : 'pi pi-window-maximize'"
            severity="secondary"
            text
            rounded
            size="small"
            :title="dataViewStore.isMaximized ? '還原大小' : '最大化視窗'"
            v-tooltip.top="dataViewStore.isMaximized ? '還原大小' : '最大化視窗'"
            class="!w-7 !h-7 !p-0"
            @click="dataViewStore.toggleMaximize()"
          />
          <Button
            type="button"
            icon="pi pi-minus"
            severity="secondary"
            text
            rounded
            size="small"
            title="最小化至浮動標籤（不阻擋操作）"
            v-tooltip.top="'最小化至浮動標籤（不阻擋操作）'"
            class="!w-7 !h-7 !p-0"
            @click="dataViewStore.minimize()"
          />
          <Button
            type="button"
            icon="pi pi-times"
            severity="secondary"
            text
            rounded
            size="small"
            title="關閉 (Esc)"
            v-tooltip.top="'關閉 (Esc)'"
            class="!w-7 !h-7 !p-0 hover:text-danger"
            @click="dataViewStore.closeDataView()"
          />
        </div>
      </div>

      <!-- Toolbar (Sticky Header) -->
      <div class="px-4 py-2.5 bg-dark-850 border-b border-dark-750 flex items-center justify-between gap-3 flex-shrink-0">
        <!-- Filter Search Box -->
        <div class="flex-1 max-w-sm relative">
          <Search class="w-3.5 h-3.5 text-dark-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref="filterInputRef"
            :value="dataViewStore.filterText"
            @input="onFilterInput"
            type="text"
            placeholder="搜尋欄位名稱或值 (即時過濾)..."
            class="w-full pl-8 pr-7 py-1 text-xs bg-dark-900 border border-dark-700 rounded-md text-dark-100 placeholder-dark-500 focus:outline-none focus:border-sky-500 transition-colors"
          />
          <button
            v-if="dataViewStore.filterText"
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-200"
            @click="clearFilter"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Counter Indicator -->
        <div class="text-xxs text-dark-400 font-mono whitespace-nowrap">
          顯示 <span class="text-info font-medium">{{ dataViewStore.filteredFields.length }}</span> / {{ dataViewStore.allFields.length }} 欄
        </div>

        <!-- Copy Buttons Group -->
        <div class="flex items-center space-x-1.5 flex-shrink-0">
          <Button
            type="button"
            icon="pi pi-code text-ok"
            label="JSON"
            size="small"
            severity="secondary"
            outlined
            @click="handleCopyJson"
            v-tooltip.top="'複製原資料列為 JSON 物件'"
            class="!text-xxs !py-1 !px-2"
          />
          <Button
            type="button"
            icon="pi pi-file-excel text-ok"
            label="TSV"
            size="small"
            severity="secondary"
            outlined
            @click="handleCopyTsv"
            v-tooltip.top="'複製原資料列為 TSV (可直接貼入 Excel)'"
            class="!text-xxs !py-1 !px-2"
          />
          <Button
            type="button"
            icon="pi pi-table text-danger"
            label="Markdown"
            size="small"
            severity="secondary"
            outlined
            @click="handleCopyMarkdown"
            v-tooltip.top="'複製原資料列為 Markdown 表格'"
            class="!text-xxs !py-1 !px-2"
          />
        </div>
      </div>

      <!-- Table Container (Vertical Scrolling) -->
      <div
        ref="tableContainerRef"
        class="flex-1 overflow-y-auto overflow-x-hidden bg-dark-900/60 dark:bg-dark-900"
        @scroll="onTableScroll"
      >
        <!-- Empty State when filter matches nothing -->
        <div
          v-if="dataViewStore.filteredFields.length === 0"
          class="flex flex-col items-center justify-center py-16 text-dark-400 space-y-2 select-none"
        >
          <SearchX class="w-8 h-8 text-dark-500 stroke-1" />
          <span class="text-xs">查無符合「{{ dataViewStore.filterText }}」的欄位</span>
          <Button
            type="button"
            label="清除過濾條件"
            size="small"
            severity="secondary"
            text
            class="!text-xs !py-1"
            @click="clearFilter"
          />
        </div>

        <!-- Vertical Four-Column Table -->
        <table v-else class="w-full border-collapse text-left text-xs font-sans table-fixed">
          <!-- Table Header -->
          <thead class="sticky top-0 z-10 bg-dark-800 text-dark-300 font-medium text-xxs uppercase tracking-wider border-b border-dark-750 shadow-xs select-none">
            <tr>
              <th class="w-[24%] py-2 px-3.5 border-r border-dark-750">
                欄位名稱 (Column)
              </th>
              <th class="py-2 px-3.5 border-r border-dark-750">
                欄位值 (Value)
              </th>
              <th class="w-[15%] py-2 px-3.5 border-r border-dark-750">
                屬性 (Property)
              </th>
              <th class="w-[13%] py-2 px-3.5">
                可否空值 (Nullable)
              </th>
            </tr>
          </thead>

          <!-- Table Body -->
          <tbody class="divide-y divide-dark-750/70">
            <tr
              v-for="field in dataViewStore.filteredFields"
              :key="field.index"
              class="hover:bg-dark-750/40 transition-colors group"
            >
              <!-- 1. Column Name Cell (single line, never squished) -->
              <td class="w-[24%] py-2.5 px-3.5 align-top border-r border-dark-750/70 select-text">
                <div class="flex items-center space-x-1.5 flex-wrap">
                  <span class="font-mono font-medium text-dark-100 break-words">
                    {{ field.name }}
                  </span>
                  <span
                    v-if="field.isPrimaryKey"
                    class="text-xxs bg-amber-500/20 text-warn border border-amber-500/30 px-1.5 py-0.5 rounded font-sans font-semibold"
                    title="主鍵 (Primary Key)"
                  >
                    PK
                  </span>
                  <span
                    v-if="field.isIdentity"
                    class="text-xxs bg-sky-500/20 text-info border border-sky-500/30 px-1.5 py-0.5 rounded font-sans font-semibold"
                    title="識別欄位 (Identity)"
                  >
                    ID
                  </span>
                </div>
              </td>

              <!-- 2. Column Value Cell (Word break, format types, copyable) -->
              <td class="py-2.5 px-3.5 align-top select-text relative border-r border-dark-750/70">
                <div class="flex items-start justify-between group/val">
                  <!-- Value Display Area -->
                  <div class="flex-1 min-w-0 pr-8">
                    <!-- NULL -->
                    <span
                      v-if="field.specialType === 'null'"
                      class="italic text-dark-500 font-mono text-xs px-1.5 py-0.5 rounded bg-dark-800/80 border border-dark-750 inline-block select-none"
                    >
                      NULL
                    </span>

                    <!-- Empty String -->
                    <span
                      v-else-if="field.specialType === 'empty'"
                      class="italic text-dark-500 font-mono text-xs px-1.5 py-0.5 rounded border border-dashed border-dark-700 inline-block select-none"
                    >
                      (空字串)
                    </span>

                    <!-- Boolean -->
                    <span
                      v-else-if="field.specialType === 'boolean'"
                      class="inline-flex items-center px-1.5 py-0.5 rounded text-xxs font-semibold font-mono"
                      :class="field.value ? 'bg-emerald-100 dark:bg-emerald-950/70 text-ok border border-emerald-200 dark:border-emerald-800/60' : 'bg-rose-100 dark:bg-rose-950/70 text-danger border border-rose-200 dark:border-rose-800/60'"
                    >
                      {{ field.displayValue }}
                    </span>

                    <!-- Binary -->
                    <span
                      v-else-if="field.specialType === 'binary'"
                      class="bg-indigo-100 dark:bg-indigo-950/70 text-structure px-1.5 py-0.5 rounded text-xs border border-indigo-200 dark:border-indigo-800/50 font-mono inline-block"
                    >
                      {{ field.displayValue }}
                    </span>

                    <!-- JSON Object or String -->
                    <pre
                      v-else-if="field.specialType === 'json'"
                      class="font-mono text-xs text-info bg-dark-800/70 dark:bg-dark-800 p-2 rounded border border-dark-700 overflow-x-auto max-h-64 whitespace-pre-wrap break-words select-text"
                    >{{ field.formattedJson || field.displayValue }}</pre>

                    <!-- Normal Text / Numbers / Dates -->
                    <div
                      v-else
                      class="font-mono text-xs text-dark-100 whitespace-pre-wrap break-words leading-relaxed select-text"
                    >{{ field.displayValue }}</div>
                  </div>

                  <!-- Single Cell Copy Button (Hover display) -->
                  <button
                    type="button"
                    class="opacity-0 group-hover/val:opacity-100 transition-opacity p-1 text-dark-400 hover:text-info rounded hover:bg-dark-750"
                    title="複製此欄位值"
                    @click="copySingleValue(field)"
                  >
                    <Copy class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>

              <!-- 3. Property Cell (data type) -->
              <td class="w-[15%] py-2.5 px-3.5 align-top border-r border-dark-750/70 select-text">
                <span class="font-mono text-xxs text-dark-300 break-words leading-relaxed">
                  {{ field.dataType }}
                </span>
              </td>

              <!-- 4. Nullable Cell -->
              <td class="w-[13%] py-2.5 px-3.5 align-top">
                <span
                  class="inline-flex items-center px-1.5 py-0.5 rounded text-xxs font-mono font-semibold border"
                  :class="
                    field.nullable
                      ? 'bg-sky-500/10 text-info border-sky-500/30'
                      : 'bg-dark-800 text-dark-400 border-dark-700'
                  "
                >
                  {{ field.nullable ? 'NULL' : 'NOT NULL' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 8-Direction Resizers (僅在非最大化狀態顯示) -->
      <template v-if="!dataViewStore.isMaximized">
        <!-- Corner resizers -->
        <div class="resize-handle top-left" @pointerdown.stop="startResize($event, 'tl')" />
        <div class="resize-handle top-right" @pointerdown.stop="startResize($event, 'tr')" />
        <div class="resize-handle bottom-left" @pointerdown.stop="startResize($event, 'bl')" />
        <div class="resize-handle bottom-right" @pointerdown.stop="startResize($event, 'br')" />
        <!-- Edge resizers -->
        <div class="resize-handle top" @pointerdown.stop="startResize($event, 't')" />
        <div class="resize-handle bottom" @pointerdown.stop="startResize($event, 'b')" />
        <div class="resize-handle left" @pointerdown.stop="startResize($event, 'l')" />
        <div class="resize-handle right" @pointerdown.stop="startResize($event, 'r')" />
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { Table2, Search, X, SearchX, Copy } from 'lucide-vue-next';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { useDataViewStore } from '@/stores/dataViewStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useFloatingWindowDrag } from '@/composables/useFloatingWindowDrag';
import { useWindowResize } from '@/composables/useWindowResize';
import type { DataViewFieldItem } from '@/types/dataView';

const dataViewStore = useDataViewStore();
const workspaceStore = useWorkspaceStore();

const panelRef = ref<HTMLElement | null>(null);
const tableContainerRef = ref<HTMLDivElement | null>(null);
const filterInputRef = ref<HTMLInputElement | null>(null);

// 視窗定位與尺寸
const size = reactive({
  width: 880,
  height: Math.round(window.innerHeight * 0.82),
});

const pos = reactive({
  top: 80,
  left: 120,
});

function initPosition() {
  const initialW = Math.min(880, window.innerWidth - 60);
  const initialH = Math.min(Math.round(window.innerHeight * 0.82), window.innerHeight - 60);
  size.width = initialW;
  size.height = initialH;
  pos.left = Math.max(20, Math.round((window.innerWidth - initialW) / 2));
  pos.top = Math.max(20, Math.round((window.innerHeight - initialH) / 2));
}

// 視窗開啟時，若位置超出畫面則自動矯正
watch(
  () => dataViewStore.isOpen,
  (open) => {
    if (open) {
      if (pos.left + size.width > window.innerWidth || pos.top + size.height > window.innerHeight) {
        initPosition();
      }
    }
  }
);

// ========================
// 視窗拖曳移動邏輯 (Drag Move) — rubber-banded edges, spring settle, interruptible
// ========================
const { startDrag: handleTitlePointerDown, endDrag: stopWindowDrag } = useFloatingWindowDrag({
  pos,
  size,
  isLocked: () => dataViewStore.isMaximized,
});

// ========================
// 8 向邊緣與角落流暢拉伸 (Resize)
// ========================
const { startResize, endResize: onPointerUpResize } = useWindowResize({
  pos,
  size,
  isLocked: () => dataViewStore.isMaximized,
  minWidth: 520,
  minHeight: 320,
});

function onFilterInput(event: Event) {
  const target = event.target as HTMLInputElement;
  dataViewStore.setFilterText(target.value);
}

function clearFilter() {
  dataViewStore.setFilterText('');
  nextTick(() => {
    filterInputRef.value?.focus();
  });
}

function onTableScroll() {
  if (tableContainerRef.value) {
    dataViewStore.setScrollTop(tableContainerRef.value.scrollTop);
  }
}

// 還原捲動位置
watch(
  () => dataViewStore.isMinimized,
  (minimized) => {
    if (!minimized) {
      nextTick(() => {
        if (tableContainerRef.value && dataViewStore.scrollTop > 0) {
          tableContainerRef.value.scrollTop = dataViewStore.scrollTop;
        }
      });
    }
  }
);

async function copySingleValue(field: DataViewFieldItem) {
  const text = field.specialType === 'null' ? 'NULL' : field.displayValue;
  await navigator.clipboard.writeText(text);
  workspaceStore.showToast(`已複製 [${field.name}] 欄位值`, 'success', 1500);
}

async function handleCopyJson() {
  const ok = await dataViewStore.copyAsJson();
  if (ok) {
    workspaceStore.showToast('已複製資料列為 JSON 物件', 'success', 2000);
  }
}

async function handleCopyTsv() {
  const ok = await dataViewStore.copyAsTsv();
  if (ok) {
    workspaceStore.showToast('已複製資料列為 TSV (Excel 格式)', 'success', 2000);
  }
}

async function handleCopyMarkdown() {
  const ok = await dataViewStore.copyAsMarkdown();
  if (ok) {
    workspaceStore.showToast('已複製資料列為 Markdown 表格', 'success', 2000);
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (!dataViewStore.isOpen || dataViewStore.isMinimized) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    dataViewStore.closeDataView();
  } else if (e.altKey && e.key === 'ArrowUp') {
    e.preventDefault();
    dataViewStore.goToPrevRow();
  } else if (e.altKey && e.key === 'ArrowDown') {
    e.preventDefault();
    dataViewStore.goToNextRow();
  }
}

onMounted(() => {
  initPosition();
  window.addEventListener('resize', initPosition);
  window.addEventListener('keydown', handleKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', initPosition);
  window.removeEventListener('keydown', handleKeyDown);
  stopWindowDrag();
  onPointerUpResize();
});
</script>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.animate-fade-in {
  animation: fadeIn 0.15s ease-out forwards;
}

/* 8-Direction Resize Handles */
.resize-handle {
  position: absolute;
  z-index: 50;
}

/* Corners */
.resize-handle.top-left {
  top: 0;
  left: 0;
  width: 10px;
  height: 10px;
  cursor: nwse-resize;
}
.resize-handle.top-right {
  top: 0;
  right: 0;
  width: 10px;
  height: 10px;
  cursor: nesw-resize;
}
.resize-handle.bottom-left {
  bottom: 0;
  left: 0;
  width: 10px;
  height: 10px;
  cursor: nesw-resize;
}
.resize-handle.bottom-right {
  bottom: 0;
  right: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
}

/* Visual grip marks at bottom right corner */
.resize-handle.bottom-right::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 6px;
  height: 6px;
  border-right: 2px solid rgba(255, 255, 255, 0.35);
  border-bottom: 2px solid rgba(255, 255, 255, 0.35);
}

/* Edges */
.resize-handle.top {
  top: 0;
  left: 10px;
  right: 10px;
  height: 5px;
  cursor: ns-resize;
}
.resize-handle.bottom {
  bottom: 0;
  left: 10px;
  right: 14px;
  height: 5px;
  cursor: ns-resize;
}
.resize-handle.left {
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 5px;
  cursor: ew-resize;
}
.resize-handle.right {
  right: 0;
  top: 10px;
  bottom: 14px;
  width: 5px;
  cursor: ew-resize;
}
</style>
