<template>
  <!-- The toolbar row doubles as the custom window title bar: empty areas are draggable (deep),
       while buttons/selects stay clickable because Tauri ignores interactive elements. -->
  <div
    data-tauri-drag-region="deep"
    class="h-10 bg-dark-850 border-b border-dark-700 px-2.5 flex items-center justify-between gap-2 select-none flex-shrink-0 relative z-30 font-sans text-xs"
  >
    <!-- Start: Branding & Connection / Database Pickers -->
    <div class="flex items-center space-x-2 flex-shrink-0">
        <!-- App Brand: bleeds to the title-bar edges (no top/left/bottom gap) at the full row height.
             The negative left margin cancels the toolbar's 10px horizontal padding plus its 1px left
             border, `pr-2` keeps the breathing room before the divider that separates the brand from
             the connection picker. -->
        <div
          class="flex items-center justify-center h-10 min-w-[40px] flex-shrink-0 -ml-[11px] pr-2 border-r border-dark-700"
        >
          <img
            :src="appIcon"
            alt="PuffSQL"
            class="h-10 w-10 select-none"
            draggable="false"
          />
        </div>

        <!-- Connection Select -->
        <SqSelect
          :model-value="connectionStore.activeConnectionId"
          :options="connectionStore.connections"
          option-value="id"
          option-label="name"
          :placeholder="$t('sidebar.connections') + '...'"
          size="sm"
          class="min-w-[160px] max-w-[220px]"
          :style="activeConnStyle"
          @update:model-value="val => handleSelectConnection(val as string)"
        >
          <template #value="slotProps">
            <div v-if="slotProps.value && connectionStore.activeConnection" class="flex items-center space-x-1.5 min-w-0">
              <Database
                class="w-3 h-3 flex-shrink-0"
                :class="connectionStore.status === 'connected' ? 'text-ok' : 'text-dark-400'"
                :title="connectionStore.status === 'connected' ? $t('sidebar.connected') : $t('sidebar.disconnected')"
              />
              <span
                class="font-semibold text-xs truncate text-dark-100"
                :style="activeConnNameStyle"
              >
                {{ connectionStore.activeConnection.name }}
              </span>
              <SqChip
                v-if="connectionStore.activeConnection.alias"
                tone="neutral"
                :label="connectionStore.activeConnection.alias"
                class="font-medium"
              />
            </div>
            <span v-else class="text-dark-400 text-xs">{{ $t('sidebar.connections') }}...</span>
          </template>

          <template #option="slotProps">
            <div class="flex items-center space-x-2 w-full py-0.5">
              <Database
                class="w-3 h-3 flex-shrink-0"
                :class="isOptionConnected(slotProps.option) ? 'text-ok' : 'text-dark-400'"
                :title="isOptionConnected(slotProps.option) ? $t('sidebar.connected') : $t('sidebar.disconnected')"
              />
              <div class="flex-1 min-w-0 flex flex-col">
                <div class="flex items-center space-x-1.5">
                  <span
                    class="font-medium text-xs truncate"
                    :style="getConnectionLabelStyle(slotProps.option)"
                  >{{ slotProps.option.name }}</span>
                  <SqChip
                    v-if="slotProps.option.alias"
                    tone="neutral"
                    :label="slotProps.option.alias"
                    class="font-medium"
                  />
                </div>
                <span class="text-xxs text-dark-400 font-mono truncate">
                  {{ slotProps.option.username ? `${slotProps.option.username}@` : '' }}{{ slotProps.option.host }}:{{ slotProps.option.port }}
                </span>
              </div>
              <Check
                v-if="connectionStore.activeConnectionId === slotProps.option.id"
                class="w-3 h-3 text-accent ml-auto flex-shrink-0"
              />
            </div>
          </template>

          <template #footer>
            <div class="p-1 border-t border-dark-700">
              <SqButton
                :label="$t('sidebar.newConnection') + '...'"
                size="sm"
                class="w-full justify-start"
                @click="handleOpenNewConnection"
              >
                <template #icon><Plus class="w-3.5 h-3.5" /></template>
              </SqButton>
            </div>
          </template>
        </SqSelect>

        <!-- Database Select -->
        <SqSelect
          :model-value="connectionStore.activeDatabase"
          :options="filteredAvailableDatabases"
          :placeholder="$t('header.selectDatabase') + '...'"
          size="sm"
          class="min-w-[130px] max-w-[180px]"
          @update:model-value="val => onDatabaseChange(val as string)"
        >
          <template #value="slotProps">
            <div class="flex items-center space-x-1.5 min-w-0">
              <Database class="w-3.5 h-3.5 text-dark-400 flex-shrink-0" />
              <span class="font-mono text-xs truncate text-warn font-semibold">
                {{ slotProps.value || $t('header.selectDatabase') + '...' }}
              </span>
            </div>
          </template>

          <template #option="slotProps">
            <div class="flex items-center space-x-1.5 font-mono text-xs py-0.5">
              <Database class="w-3.5 h-3.5 text-dark-400 flex-shrink-0" />
              <span class="truncate text-dark-200">{{ slotProps.option }}</span>
            </div>
          </template>
        </SqSelect>
    </div>

    <!-- End: Actions Toolbar & Settings -->
    <div class="flex items-center justify-end space-x-1 min-w-0 overflow-hidden">
        <!-- Run / Stop Query Button -->
        <SqButton
          v-if="!queryStore.isExecuting"
          tone="accent"
          variant="solid"
          class="w-14"
          :aria-label="$t('header.runTooltip')"
          v-tooltip.bottom="$t('header.runTooltip')"
          @click="$emit('run-query', 'current')"
        >
          <template #icon><Play class="w-3.5 h-3.5" /></template>
        </SqButton>
        <SqButton
          v-else
          tone="danger"
          variant="solid"
          class="w-14"
          :loading="queryStore.isCancelling"
          :disabled="queryStore.isCancelling"
          :aria-label="$t('header.cancelQueryTooltip')"
          v-tooltip.bottom="queryStore.isCancelling ? $t('common.running') : $t('header.cancelQueryTooltip')"
          @click="$emit('cancel-query')"
        >
          <template #icon><SquareMinus class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- Run All Statements Button -->
        <SqButton
          tone="accent"
          variant="outline"
          class="w-14"
          :disabled="queryStore.isExecuting"
          :aria-label="$t('header.runAllTooltip')"
          v-tooltip.bottom="$t('header.runAllTooltip')"
          @click="$emit('run-query', 'all')"
        >
          <template #icon><SkipForward class="w-3.5 h-3.5" /></template>
        </SqButton>

        <div class="w-px h-4 bg-dark-700 mx-0.5 flex-shrink-0" />

        <!-- SQL Editor Clipboard & Folding Actions -->
        <SqlEditorToolbarActions
          :disabled="workspaceStore.activeTab?.type !== 'sql_editor'"
          @action="handleSqlEditorAction"
        />

        <!-- Format SQL Button -->
        <SqButton :aria-label="$t('header.formatSqlTooltip')" v-tooltip.bottom="$t('header.formatSqlTooltip')" @click="$emit('format-sql')">
          <template #icon><AlignLeft class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- Open SQL File Button -->
        <SqButton :aria-label="$t('editor.openFile')" v-tooltip.bottom="$t('editor.openFile')" @click="$emit('open-sql-file')">
          <template #icon><FolderOpen class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- Save SQL File Button -->
        <SqButton :aria-label="$t('editor.saveFile')" v-tooltip.bottom="$t('editor.saveFile')" @click="$emit('save-sql-file')">
          <template #icon><Save class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- New Query Tab Button -->
        <SqButton tone="accent" :aria-label="$t('editor.newTab')" v-tooltip.bottom="$t('editor.newTab')" @click="workspaceStore.addSqlTab()">
          <template #icon><Plus class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- Quick Object Finder Button (Ctrl + P) -->
        <SqButton :aria-label="$t('header.quickFinderTooltip')" v-tooltip.bottom="$t('header.quickFinderTooltip')" @click="$emit('open-quick-finder')">
          <template #icon><Search class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- SQL Templates Library Button -->
        <SqButton :aria-label="$t('sqlTemplates.title')" v-tooltip.bottom="$t('sqlTemplates.title')" @click="$emit('open-sql-templates')">
          <template #icon><Book class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- AI SQL Assistant Button -->
        <SqButton :aria-label="$t('header.aiAssistantTooltip')" v-tooltip.bottom="$t('header.aiAssistantTooltip')" @click="$emit('open-ai-chat')">
          <template #icon><Sparkles class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- DBA Diagnostics Toolbox Button & Popover -->
        <SqButton
          aria-label="DBA 常用診斷維護工具箱"
          v-tooltip.bottom="'DBA 常用診斷維護工具箱'"
          @click="toggleDbaPopover"
        >
          <template #icon>
            <ChartLine class="w-3.5 h-3.5" />
          </template>
        </SqButton>

        <SqPopover
          v-model="isDbaPopoverOpen"
          :anchor="dbaAnchorEl"
          align="end"
          min-width="18rem"
          role="dialog"
          aria-label="DBA 診斷與維護指令庫"
        >
          <div class="w-72 font-sans text-xs select-none">
            <div class="px-2 py-1.5 text-xxs font-semibold uppercase tracking-wider text-dark-400 flex items-center justify-between border-b border-dark-750 mb-1">
              <div class="flex items-center space-x-1.5">
                <ChartLine class="w-3.5 h-3.5 text-accent" />
                <span>DBA 診斷與維護指令庫</span>
              </div>
              <span class="text-dark-500 font-mono">{{ DBA_QUERIES.length }} 項</span>
            </div>
            <div class="max-h-72 overflow-y-auto space-y-0.5">
              <div
                v-for="query in DBA_QUERIES"
                :key="query.id"
                class="px-2.5 py-1.5 rounded hover:bg-dark-750 text-dark-200 transition-colors flex flex-col space-y-0.5 cursor-pointer group"
                @click="openDbaQuery(query)"
              >
                <div class="flex items-center justify-between w-full">
                  <span class="font-medium text-dark-100 group-hover:text-danger transition-colors">
                    {{ query.title }}
                  </span>
                  <span :class="['text-xxs font-medium px-1.5 py-0.5 rounded border font-mono', query.badgeColor]">
                    {{ query.badge }}
                  </span>
                </div>
                <span class="text-xxs text-dark-400 leading-normal">
                  {{ query.description }}
                </span>
              </div>
            </div>
          </div>
        </SqPopover>

        <div class="w-px h-4 bg-dark-700 mx-0.5 flex-shrink-0" />

        <!-- Performance Analysis Toggle (SET STATISTICS IO, TIME ON) -->
        <SqButton
          :tone="queryStore.isStatsEnabled ? 'accent' : 'neutral'"
          :active="queryStore.isStatsEnabled"
          aria-label="效能分析 (SET STATISTICS IO, TIME ON)"
          v-tooltip.bottom="'效能分析 (SET STATISTICS IO, TIME ON)'"
          @click="queryStore.toggleStatsEnabled()"
        >
          <template #icon><Gauge class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- Estimated Execution Plan Toggle (SET SHOWPLAN_ALL ON) -->
        <SqButton
          :tone="queryStore.isShowplanEnabled ? 'accent' : 'neutral'"
          :active="queryStore.isShowplanEnabled"
          aria-label="預估執行計畫 (SET SHOWPLAN_ALL ON)"
          v-tooltip.bottom="'預估執行計畫 (SET SHOWPLAN_ALL ON)'"
          @click="queryStore.toggleShowplanEnabled()"
        >
          <template #icon><Network class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- Actual Execution Plan Toggle (SET STATISTICS XML ON) -->
        <SqButton
          :tone="queryStore.isActualPlanEnabled ? 'accent' : 'neutral'"
          :active="queryStore.isActualPlanEnabled"
          aria-label="實際執行計畫 (SET STATISTICS XML ON)"
          v-tooltip.bottom="'實際執行計畫 (SET STATISTICS XML ON)'"
          @click="queryStore.toggleActualPlanEnabled()"
        >
          <template #icon><Share2 class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- Max Rows Limit Selector -->
        <div class="flex items-center space-x-1 pl-1 text-dark-400 text-xxs font-mono">
          <span>Limit:</span>
          <SqSelect
            :model-value="queryStore.maxRows ?? 'none'"
            :options="limitOptions"
            option-value="value"
            option-label="label"
            size="sm"
            class="min-w-[75px] font-mono"
            @update:model-value="val => onMaxRowsChange(val as string | number)"
          >
            <template #value="slotProps">
              <span class="text-[11px] font-mono leading-none">
                {{ limitOptions.find(o => o.value === slotProps.value)?.label ?? (slotProps.value === 'none' ? 'No Limit' : slotProps.value) }}
              </span>
            </template>
            <template #option="slotProps">
              <span class="text-[11px] font-mono py-0.5">
                {{ slotProps.option.label }}
              </span>
            </template>
          </SqSelect>
        </div>

        <div class="w-px h-4 bg-dark-700 mx-0.5 flex-shrink-0" />

        <!-- Toggle Sidebar -->
        <SqButton
          :tone="workspaceStore.isSidebarOpen ? 'accent' : 'neutral'"
          :active="workspaceStore.isSidebarOpen"
          :aria-label="$t('header.toggleSidebar')"
          :v-tooltip.bottom="$t('header.toggleSidebar')"
          @click="workspaceStore.toggleSidebar()"
        >
          <template #icon><PanelLeft class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- Toggle Bottom Results Panel -->
        <SqButton
          :tone="workspaceStore.isBottomPanelOpen ? 'accent' : 'neutral'"
          :active="workspaceStore.isBottomPanelOpen"
          :disabled="workspaceStore.activeTab?.type === 'er_diagram'"
          :aria-label="$t('header.toggleBottomPanel')"
          :v-tooltip.bottom="$t('header.toggleBottomPanel')"
          @click="workspaceStore.toggleBottomPanel()"
        >
          <template #icon><SquarePlus class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- Settings Modal Trigger -->
        <SqButton
          :aria-label="$t('header.settingsTooltip')"
          :v-tooltip.bottom="$t('header.settingsTooltip')"
          @click="$emit('open-settings-modal')"
        >
          <template #icon><Settings class="w-3.5 h-3.5" /></template>
        </SqButton>

      <!-- Custom window controls (Windows only, where native decorations are hidden) -->
      <WindowControls v-if="showWindowControls" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import SqSelect from '@/components/ui/SqSelect.vue';
import {
  AlignLeft,
  Book,
  ChartLine,
  Check,
  Database,
  FolderOpen,
  Gauge,
  Network,
  PanelLeft,
  Play,
  Plus,
  Save,
  Search,
  Settings,
  Share2,
  SkipForward,
  Sparkles,
  SquareMinus,
  SquarePlus,
} from 'lucide-vue-next';
import SqButton from '@/components/ui/SqButton.vue';
import SqChip from '@/components/ui/SqChip.vue';
import SqPopover from '@/components/ui/SqPopover.vue';
import SqlEditorToolbarActions from '@/components/layout/SqlEditorToolbarActions.vue';
import WindowControls from '@/components/layout/WindowControls.vue';
// Single source of truth for the brand mark: the icon set shipped with the Tauri app.
import appIcon from '../../../src-tauri/icons/64x64.png';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useQueryStore } from '@/stores/queryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { resolveConnectionLabelColor } from '@/utils/connectionColor';
import { windowService } from '@/services/windowService';
import { DBA_QUERIES, type DbaQueryItem } from '@/utils/dbaQueries';
import type { ConnectionProfile } from '@/types/connection';
import type { SqlEditorToolbarAction } from '@/types/editor';

const workspaceStore = useWorkspaceStore();
const connectionStore = useConnectionStore();
const queryStore = useQueryStore();
const settingsStore = useSettingsStore();
/** Anchored popover state for the DBA toolbox: the trigger element drives the panel position. */
const isDbaPopoverOpen = ref(false);
const dbaAnchorEl = ref<HTMLElement | null>(null);

/** Windows 使用自繪標題列，其餘平台保留系統原生視窗裝飾。 */
const showWindowControls = windowService.isCustomTitleBar();

const limitOptions = [
  { label: '1,000', value: 1000 },
  { label: '5,000', value: 5000 },
  { label: '10,000', value: 10000 },
  { label: '50,000', value: 50000 },
  { label: 'No Limit', value: 'none' },
];

const activeConnStyle = computed(() => {
  const conn = connectionStore.activeConnection;
  if (!conn?.color) return {};
  return {
    borderColor: `${conn.color}aa`,
    boxShadow: `0 0 0 1px ${conn.color}44`,
  };
});

/** 連線名稱套用「標籤色彩」設定；未設定時沿用原本文字樣式。 */
function getConnectionLabelStyle(conn: ConnectionProfile | null | undefined): Record<string, string> {
  const color = resolveConnectionLabelColor(conn?.color?.trim(), settingsStore.colorMode);
  if (!color) return {};
  return { color };
}

const activeConnNameStyle = computed(() => getConnectionLabelStyle(connectionStore.activeConnection));

/** 該選項是否為「目前工作區使用中且已連線」的連線。 */
function isOptionConnected(option: ConnectionProfile): boolean {
  return connectionStore.activeConnectionId === option.id && connectionStore.status === 'connected';
}

const filteredAvailableDatabases = computed(() => {
  const current = connectionStore.activeDatabase;
  return connectionStore.availableDatabases.filter(
    (db) => db === current || !settingsStore.isDatabaseHidden(db)
  );
});

function toggleDbaPopover(event: Event) {
  const target = event.currentTarget as HTMLElement | null;
  if (target) dbaAnchorEl.value = target;
  isDbaPopoverOpen.value = !isDbaPopoverOpen.value;
}

function openDbaQuery(query: DbaQueryItem) {
  isDbaPopoverOpen.value = false;
  workspaceStore.addSqlTab(query.sql, `${query.title}.sql`);
  workspaceStore.showToast(`已載入「${query.title}」診斷指令，按下 Run 即可執行`, 'info', 2500);
}

const emit = defineEmits<{
  (e: 'run-query', mode?: 'current' | 'all'): void;
  (e: 'cancel-query'): void;
  (e: 'sql-editor-action', action: SqlEditorToolbarAction): void;
  (e: 'format-sql'): void;
  (e: 'open-sql-file'): void;
  (e: 'save-sql-file'): void;
  (e: 'open-connection-modal'): void;
  (e: 'open-settings-modal'): void;
  (e: 'open-quick-finder'): void;
  (e: 'open-sql-templates'): void;
  (e: 'open-ai-chat'): void;
}>();

function handleSqlEditorAction(action: SqlEditorToolbarAction) {
  emit('sql-editor-action', action);
}

async function handleSelectConnection(connId: string) {
  if (!connId || (connectionStore.activeConnectionId === connId && connectionStore.status === 'connected')) {
    return;
  }
  try {
    await connectionStore.connect(connId);
    workspaceStore.updateActiveTabConnection(connId, connectionStore.activeDatabase);
  } catch (err: unknown) {
    console.error('Failed to switch connection:', err);
    alert(`切換連線失敗: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function handleOpenNewConnection() {
  emit('open-connection-modal');
}

async function onDatabaseChange(newDb: string) {
  if (!newDb) return;
  await connectionStore.switchDatabase(newDb);
  workspaceStore.updateActiveTabDatabase(newDb);
}

function onMaxRowsChange(val: string | number) {
  queryStore.maxRows = val === 'none' ? null : Number(val);
}
</script>
