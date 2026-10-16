<template>
  <SqDialog
    :visible="isOpen"
    @update:visible="(val) => !val && closeModal()"
    :closable="false"
    :dismissableMask="true"
    :showHeader="false"
    :class="dialogWindow.marker"
    class="w-full max-w-2xl h-[80vh] overflow-hidden"
    contentClass="!p-0 h-full flex flex-col overflow-hidden"
    @show="dialogWindow.onShow"
    @hide="dialogWindow.onHide"
  >
    <!-- Search Header Bar -->
    <div class="sq-dialog-drag-handle p-3 border-b border-dark-700 bg-dark-900/60 flex flex-col space-y-2.5 flex-shrink-0">
      <div class="flex items-center space-x-2">
        <SqInput
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          :placeholder="$t('quickFinder.placeholder')"
          size="lg"
          class="flex-1 font-mono"
          @keydown.down.prevent="navigateDown"
          @keydown.up.prevent="navigateUp"
          @keydown.enter="handleEnterKey($event)"
          @keydown.esc.prevent="closeModal"
        >
          <template #prefix>
            <Search class="w-3.5 h-3.5 text-accent" />
          </template>
        </SqInput>

        <SqButton
          v-if="searchQuery"
          type="button"
          :aria-label="$t('quickFinder.clearTooltip')"
          @click="clearSearch"
          v-tooltip.top="$t('quickFinder.clearTooltip')"
        >
          <template #icon><X class="w-3.5 h-3.5" /></template>
        </SqButton>

        <div class="h-4 w-px bg-dark-700 mx-0.5"></div>

        <!-- Refresh Button -->
        <SqButton
          type="button"
          :loading="isLoading"
          :aria-label="$t('quickFinder.refreshTooltip')"
          @click="refreshObjects"
          :disabled="isLoading"
          v-tooltip.top="$t('quickFinder.refreshTooltip')"
        >
          <template #icon><RefreshCw class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- Close Button -->
        <SqButton
          type="button"
          tone="danger"
          :aria-label="$t('quickFinder.closeTooltip')"
          @click="closeModal"
          v-tooltip.top="$t('quickFinder.closeTooltip')"
        >
          <template #icon><X class="w-3.5 h-3.5" /></template>
        </SqButton>
      </div>

      <!-- Scope Bar: Connection & Database Selector + Filter Chips -->
      <div class="flex items-center justify-between text-xxs text-dark-400 pt-0.5">
        <!-- Left: Target Connection & Database Switcher -->
        <div class="flex items-center space-x-2">
          <span class="flex items-center space-x-1">
            <Database class="w-3 h-3 text-ok" />
            <span class="text-dark-300 font-medium truncate max-w-[120px]">
              {{ connectionStore.activeConnection?.name || $t('quickFinder.unconnected') }}
            </span>
          </span>
          <span>/</span>
          <div class="flex items-center space-x-1">
            <Database class="w-3 h-3 text-warn" />
            <SqSelect
              v-if="availableDatabases.length > 0"
              v-model="currentDatabase"
              :options="availableDatabases"
              @update:model-value="handleDatabaseChange"
              size="sm"
              class="font-mono"
            >
              <template #value="slotProps">
                <span class="text-xs font-mono text-warn font-medium">{{ slotProps.value || 'master' }}</span>
              </template>
              <template #option="slotProps">
                <span class="text-xs font-mono py-0.5 text-dark-200">{{ slotProps.option }}</span>
              </template>
            </SqSelect>
            <span v-else class="text-warn font-medium font-mono">{{ currentDatabase || 'master' }}</span>
          </div>
        </div>

        <!-- Right: Type Filter Chips -->
        <div class="flex items-center space-x-1">
          <SqButton
            v-for="chip in filterChips"
            :key="chip.type"
            type="button"
            size="sm"
            :tone="activeTypeTab === chip.type ? 'accent' : 'neutral'"
            :variant="activeTypeTab === chip.type ? 'solid' : 'outline'"
            @click="activeTypeTab = chip.type"
            class="text-xxs"
          >
            <span>{{ chip.label }}</span>
            <span class="ml-1 opacity-70 font-mono">({{ chip.count }})</span>
          </SqButton>
        </div>
      </div>
    </div>

    <!-- Loading Progress State -->
    <div
      v-if="isLoading"
      class="flex-1 px-4 py-8 flex flex-col items-center justify-center space-y-2 text-dark-400"
    >
      <Loader2 class="w-6 h-6 animate-spin text-accent" />
      <span class="text-xs">{{ $t('quickFinder.loading') }}</span>
    </div>

    <!-- Empty State (No connection) -->
    <div
      v-else-if="!connectionStore.activeConnectionId || connectionStore.status !== 'connected'"
      class="flex-1 px-4 py-12 flex flex-col items-center justify-center space-y-2 text-dark-400"
    >
      <Database class="w-5 h-5 text-dark-600 mb-1" />
      <span class="text-xs text-dark-300 font-medium">{{ $t('quickFinder.noConnection') }}</span>
      <span class="text-xxs text-dark-500">{{ $t('quickFinder.noConnectionSub') }}</span>
    </div>

    <!-- Empty State (No matched objects) -->
    <div
      v-else-if="scoredResults.length === 0"
      class="flex-1 px-4 py-12 flex flex-col items-center justify-center space-y-1.5 text-dark-400"
    >
      <Search class="w-5 h-5 text-dark-600 mb-1" />
      <span class="text-xs text-dark-300">{{ $t('quickFinder.notFound', { query: searchQuery }) }}</span>
      <span class="text-xxs text-dark-500">{{ $t('quickFinder.notFoundSub') }}</span>
    </div>

    <!-- Results Scrollable List -->
    <div
      v-else
      ref="resultsListRef"
      class="flex-1 overflow-y-auto divide-y divide-dark-800/60 p-1 font-mono text-xs"
    >
      <div
        v-for="(res, idx) in scoredResults"
        :key="res.item.id"
        :ref="(el) => setItemRef(el, idx)"
        @mouseenter="activeIndex = idx"
        @click="handlePrimaryAction(res.item)"
        :class="[
          'flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors group relative',
          activeIndex === idx
            ? 'bg-brand-500/20 text-dark-100 ring-1 ring-brand-500/30'
            : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100'
        ]"
      >
        <!-- Left: Type Badge & Object Name with Highlights -->
        <div class="flex items-center space-x-2.5 min-w-0 flex-1 mr-3">
          <!-- Type Badge with Icon -->
          <SqChip
            :tone="
              res.item.type === 'table' ? 'neutral' :
              res.item.type === 'view' ? 'plan' :
              res.item.type === 'procedure' ? 'warn' : 'neutral'
            "
            class="font-medium uppercase tracking-wider"
          >
            <template #icon>
              <Table2 v-if="res.item.type === 'table'" class="w-3 h-3" />
              <List v-else-if="res.item.type === 'view'" class="w-3 h-3" />
              <Play v-else-if="res.item.type === 'procedure'" class="w-3 h-3" />
              <FileCode v-else class="w-3 h-3" />
            </template>
            <span>{{ res.item.type === 'table' ? 'TABLE' : res.item.type === 'view' ? 'VIEW' : res.item.type === 'procedure' ? 'PROC' : 'FUNC' }}</span>
          </SqChip>

          <!-- Highlighted Name -->
          <div class="truncate flex items-baseline space-x-0.5">
            <span class="text-dark-500 text-xxs">
              <span
                v-for="(chunk, cIdx) in getHighlightedSchemaChunks(res)"
                :key="`sch-${cIdx}`"
                :class="chunk.highlight ? 'text-warn font-bold underline decoration-amber-400/80' : ''"
              >{{ chunk.text }}</span>.</span>
            <span class="font-medium text-dark-100">
              <span
                v-for="(chunk, cIdx) in getHighlightedNameChunks(res)"
                :key="`nm-${cIdx}`"
                :class="chunk.highlight ? 'text-warn font-bold underline decoration-amber-400/80' : ''"
              >{{ chunk.text }}</span>
            </span>
          </div>
        </div>

        <!-- Right: Quick Action Buttons (Hover or Active) -->
        <div class="flex items-center space-x-1 flex-shrink-0">
          <!-- For Tables & Views: Open Data, Structure, SELECT -->
          <template v-if="res.item.type === 'table' || res.item.type === 'view'">
            <SqButton
              type="button"
              :label="$t('quickFinder.dataBtn')"
              size="sm"
              variant="outline"
              @click.stop="openTableData(res.item)"
              v-tooltip.top="$t('quickFinder.openDataTooltip')"
            >
              <template #icon><Table2 class="w-3.5 h-3.5" /></template>
            </SqButton>
            <SqButton
              type="button"
              :label="$t('quickFinder.structureBtn')"
              size="sm"
              variant="outline"
              @click.stop="openTableStructure(res.item)"
              v-tooltip.top="$t('quickFinder.openStructureTooltip')"
            >
              <template #icon><List class="w-3.5 h-3.5" /></template>
            </SqButton>
            <SqButton
              type="button"
              :label="$t('quickFinder.selectBtn')"
              size="sm"
              variant="outline"
              @click.stop="generateSelectQuery(res.item)"
              v-tooltip.top="$t('quickFinder.generateSelectTooltip')"
            >
              <template #icon><FileEdit class="w-3.5 h-3.5" /></template>
            </SqButton>
          </template>

          <!-- For Stored Procedures: Definition, EXEC -->
          <template v-else-if="res.item.type === 'procedure'">
            <SqButton
              type="button"
              :label="$t('quickFinder.definitionBtn')"
              size="sm"
              variant="outline"
              @click.stop="viewDefinition(res.item)"
              v-tooltip.top="$t('quickFinder.viewDefinitionTooltip')"
            >
              <template #icon><FileCode class="w-3.5 h-3.5" /></template>
            </SqButton>
            <SqButton
              type="button"
              :label="$t('quickFinder.execBtn')"
              size="sm"
              variant="outline"
              @click.stop="generateExecQuery(res.item)"
              v-tooltip.top="$t('quickFinder.generateExecTooltip')"
            >
              <template #icon><Play class="w-3.5 h-3.5" /></template>
            </SqButton>
          </template>

          <!-- For Functions: Definition, SELECT -->
          <template v-else-if="res.item.type === 'function'">
            <SqButton
              type="button"
              :label="$t('quickFinder.definitionBtn')"
              size="sm"
              variant="outline"
              @click.stop="viewDefinition(res.item)"
              v-tooltip.top="$t('quickFinder.viewDefinitionTooltip')"
            >
              <template #icon><FileCode class="w-3.5 h-3.5" /></template>
            </SqButton>
            <SqButton
              type="button"
              :label="$t('quickFinder.selectBtn')"
              size="sm"
              variant="outline"
              @click.stop="generateFuncSelectQuery(res.item)"
              v-tooltip.top="$t('quickFinder.generateFuncSelectTooltip')"
            >
              <template #icon><FileEdit class="w-3.5 h-3.5" /></template>
            </SqButton>
          </template>
        </div>
      </div>
    </div>

    <!-- Bottom Status & Keyboard Guide Footer -->
    <div class="h-9 px-3 border-t border-dark-700 bg-dark-900 flex items-center justify-between text-xxs text-dark-400 flex-shrink-0">
      <!-- Left: Shortcut Key hints -->
      <div class="flex items-center space-x-3">
        <span class="flex items-center space-x-1">
          <kbd class="px-1 py-0.5 rounded bg-dark-750 text-dark-300 font-mono border border-dark-700">↑↓</kbd>
          <span>{{ $t('quickFinder.navKbd') }}</span>
        </span>
        <span class="flex items-center space-x-1">
          <kbd class="px-1 py-0.5 rounded bg-dark-750 text-dark-300 font-mono border border-dark-700">↵</kbd>
          <span>{{ $t('quickFinder.openKbd') }}</span>
        </span>
        <span class="flex items-center space-x-1">
          <kbd class="px-1 py-0.5 rounded bg-dark-750 text-dark-300 font-mono border border-dark-700">Shift+↵</kbd>
          <span>{{ $t('quickFinder.structureKbd') }}</span>
        </span>
        <span class="flex items-center space-x-1">
          <kbd class="px-1 py-0.5 rounded bg-dark-750 text-dark-300 font-mono border border-dark-700">Ctrl+↵</kbd>
          <span>{{ $t('quickFinder.scriptKbd') }}</span>
        </span>
        <span class="flex items-center space-x-1">
          <kbd class="px-1 py-0.5 rounded bg-dark-750 text-dark-300 font-mono border border-dark-700">Esc</kbd>
          <span>{{ $t('quickFinder.closeKbd') }}</span>
        </span>
      </div>

      <!-- Right: Item Counter -->
      <div class="font-mono text-dark-500">
        {{ $t('quickFinder.displayCount', { shown: scoredResults.length, total: totalMatchingCount }) }}
      </div>
    </div>
  </SqDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import SqDialog from '@/components/ui/SqDialog.vue';
import SqInput from '@/components/ui/SqInput.vue';
import SqButton from '@/components/ui/SqButton.vue';
import SqSelect from '@/components/ui/SqSelect.vue';
import {
  Database,
  FileCode,
  FileEdit,
  List,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Table2,
  X,
} from '@/components/icons';
import SqChip from '@/components/ui/SqChip.vue';
import { useConnectionStore } from '@/stores/connectionStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useDialogWindow } from '@/composables/useDialogWindow';
import {
  filterAndRankQuickObjects,
  highlightMatchedChunks,
  type QuickFinderItem,
  type QuickFinderObjectType,
  type ScoredQuickFinderItem,
} from '@/utils/fuzzySearch';
import { generateTableSelectSql } from '@/utils/tableSelectSql';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const connectionStore = useConnectionStore();
const workspaceStore = useWorkspaceStore();
const schemaStore = useSchemaStore();
const settingsStore = useSettingsStore();
const dialogWindow = useDialogWindow();

const searchQuery = ref('');
const activeIndex = ref(0);
const activeTypeTab = ref<'all' | QuickFinderObjectType>('all');
const searchInputRef = ref<any>(null);
const resultsListRef = ref<HTMLDivElement | null>(null);
const itemRefs = ref<Record<number, HTMLElement>>({});

function clearSearch() {
  searchQuery.value = '';
  focusSearchInput();
}

function focusSearchInput() {
  const el = searchInputRef.value;
  if (!el) return;
  if (typeof el.focus === 'function') {
    el.focus();
  } else if (el.$el && typeof el.$el.focus === 'function') {
    el.$el.focus();
  }
}

function setItemRef(el: unknown, idx: number) {
  if (el && el instanceof HTMLElement) {
    itemRefs.value[idx] = el;
  }
}

const currentDatabase = ref('');

const availableDatabases = computed(() => {
  if (!connectionStore.activeConnectionId) return [];
  const list = connectionStore.getDatabases(connectionStore.activeConnectionId);
  return list.filter((db) => db === currentDatabase.value || !settingsStore.isDatabaseHidden(db));
});

const isLoading = computed(() => {
  const cId = connectionStore.activeConnectionId;
  const db = currentDatabase.value || connectionStore.activeDatabase;
  if (!cId || !db) return false;
  const key = `${cId}:${db}`;
  return !!(schemaStore.loadingTablesByDb[key] || schemaStore.loadingRoutinesByDb[key]);
});

// All objects loaded for active connection & selected database (excluding hidden tables)
const rawObjects = computed<QuickFinderItem[]>(() => {
  const cId = connectionStore.activeConnectionId;
  const db = currentDatabase.value || connectionStore.activeDatabase;
  if (!cId || !db) return [];
  const list = schemaStore.getDatabaseObjects(cId, db);
  return list.filter((o) => {
    if (o.type === 'table') {
      return !settingsStore.isTableHidden(o.name, o.schema);
    }
    return true;
  });
});

const { t } = useI18n();

const filterChips = computed(() => {
  const all = rawObjects.value;
  const tables = all.filter((o) => o.type === 'table').length;
  const views = all.filter((o) => o.type === 'view').length;
  const procs = all.filter((o) => o.type === 'procedure').length;
  const funcs = all.filter((o) => o.type === 'function').length;

  return [
    { type: 'all' as const, label: t('quickFinder.all'), count: all.length },
    { type: 'table' as const, label: t('quickFinder.tables'), count: tables },
    { type: 'view' as const, label: t('quickFinder.views'), count: views },
    { type: 'procedure' as const, label: t('quickFinder.procedures'), count: procs },
    { type: 'function' as const, label: t('quickFinder.functions'), count: funcs },
  ];
});

const scoredResults = computed<ScoredQuickFinderItem[]>(() => {
  return filterAndRankQuickObjects(
    rawObjects.value,
    searchQuery.value,
    activeTypeTab.value,
    100
  );
});

const totalMatchingCount = computed(() => {
  const all = rawObjects.value;
  if (activeTypeTab.value === 'all') return all.length;
  return all.filter((o) => o.type === activeTypeTab.value).length;
});

// Keep activeIndex within valid bounds when results change
watch(scoredResults, (newList) => {
  if (activeIndex.value >= newList.length) {
    activeIndex.value = 0;
  }
});

watch(
  () => props.isOpen,
  async (isOpen) => {
    if (isOpen) {
      currentDatabase.value = connectionStore.activeDatabase || 'master';
      activeIndex.value = 0;
      await nextTick();
      focusSearchInput();

      const cId = connectionStore.activeConnectionId;
      const db = currentDatabase.value;
      if (cId && db && connectionStore.status === 'connected') {
        const key = `${cId}:${db}`;
        if (schemaStore.tablesByDb[key] === undefined || schemaStore.routinesByDb[key] === undefined) {
          schemaStore.ensureDatabaseObjectsLoaded(cId, db).catch((err) => {
            console.warn('[QuickFinder] Error loading objects:', err);
          });
        }
      }
    }
  }
);

function getHighlightedSchemaChunks(res: ScoredQuickFinderItem) {
  return highlightMatchedChunks(res.item.schema, res.schemaIndices);
}

function getHighlightedNameChunks(res: ScoredQuickFinderItem) {
  return highlightMatchedChunks(res.item.name, res.nameIndices);
}

async function handleDatabaseChange() {
  if (!currentDatabase.value || !connectionStore.activeConnectionId) return;
  try {
    await connectionStore.switchDatabase(currentDatabase.value);
    await schemaStore.ensureDatabaseObjectsLoaded(
      connectionStore.activeConnectionId,
      currentDatabase.value
    );
  } catch (err) {
    console.error('Failed to switch database in QuickFinder:', err);
  }
}

async function refreshObjects() {
  const cId = connectionStore.activeConnectionId;
  const db = currentDatabase.value || connectionStore.activeDatabase;
  if (cId && db) {
    await schemaStore.ensureDatabaseObjectsLoaded(cId, db, true);
  }
}

function navigateDown() {
  if (scoredResults.value.length === 0) return;
  activeIndex.value = (activeIndex.value + 1) % scoredResults.value.length;
  scrollActiveItemIntoView();
}

function navigateUp() {
  if (scoredResults.value.length === 0) return;
  activeIndex.value =
    (activeIndex.value - 1 + scoredResults.value.length) % scoredResults.value.length;
  scrollActiveItemIntoView();
}

function scrollActiveItemIntoView() {
  nextTick(() => {
    const el = itemRefs.value[activeIndex.value];
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  });
}

function handleEnterKey(event: KeyboardEvent) {
  if (scoredResults.value.length === 0) return;
  const current = scoredResults.value[activeIndex.value]?.item;
  if (!current) return;

  event.preventDefault();

  if (event.shiftKey) {
    if (current.type === 'table' || current.type === 'view') {
      openTableStructure(current);
    } else {
      viewDefinition(current);
    }
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    if (current.type === 'table' || current.type === 'view') {
      generateSelectQuery(current);
    } else if (current.type === 'procedure') {
      generateExecQuery(current);
    } else if (current.type === 'function') {
      generateFuncSelectQuery(current);
    }
    return;
  }

  handlePrimaryAction(current);
}

function handlePrimaryAction(item: QuickFinderItem) {
  if (item.type === 'table' || item.type === 'view') {
    openTableData(item);
  } else {
    viewDefinition(item);
  }
}

function openTableData(item: QuickFinderItem) {
  workspaceStore.addTableDataTab(item.schema, item.name, item.connId, item.database);
  closeModal();
}

function openTableStructure(item: QuickFinderItem) {
  workspaceStore.addTableStructureTab(item.schema, item.name, item.connId, item.database);
  closeModal();
}

function generateSelectQuery(item: QuickFinderItem) {
  const sql = generateTableSelectSql(item.schema, item.name);
  workspaceStore.addSqlTab(sql, `${item.name}.sql`, item.connId, item.database);
  closeModal();
}

async function viewDefinition(item: QuickFinderItem) {
  try {
    const def = await schemaStore.getObjectDefinition(
      item.connId,
      item.database,
      item.schema,
      item.name
    );
    if (def) {
      workspaceStore.addSqlTab(def, `${item.schema}.${item.name}.sql`, item.connId, item.database);
      workspaceStore.showToast(`已載入 [${item.schema}].[${item.name}] 定義`, 'success', 2500);
    } else {
      const fallback = `USE [${item.database}];\nGO\n\nSELECT OBJECT_DEFINITION(OBJECT_ID(N'[${item.schema}].[${item.name}]')) AS [Definition];\n`;
      workspaceStore.addSqlTab(fallback, `${item.schema}.${item.name}.sql`, item.connId, item.database);
    }
  } catch (err) {
    console.error('Failed to view definition:', err);
  } finally {
    closeModal();
  }
}

function generateExecQuery(item: QuickFinderItem) {
  const sql = `-- 執行預存程序 [${item.schema}].[${item.name}]\nUSE [${item.database}];\nGO\n\nEXEC [${item.schema}].[${item.name}];\n`;
  workspaceStore.addSqlTab(sql, `EXEC_${item.name}.sql`, item.connId, item.database);
  closeModal();
}

function generateFuncSelectQuery(item: QuickFinderItem) {
  const sql = `-- 呼叫自訂函數 [${item.schema}].[${item.name}]\nUSE [${item.database}];\nGO\n\nSELECT [${item.schema}].[${item.name}]();\n`;
  workspaceStore.addSqlTab(sql, `FUNC_${item.name}.sql`, item.connId, item.database);
  closeModal();
}

function closeModal() {
  emit('close');
}
</script>
