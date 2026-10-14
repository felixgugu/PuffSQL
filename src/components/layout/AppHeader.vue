<template>
  <!-- The toolbar row doubles as the custom window title bar: empty areas are draggable (deep),
       while buttons/selects stay clickable because Tauri ignores interactive elements. -->
  <Toolbar
    data-tauri-drag-region="deep"
    class="!h-10 !bg-dark-850 !border-b !border-dark-700 !rounded-none !px-2.5 !py-0 !flex-nowrap select-none flex-shrink-0 relative z-30 font-sans text-xs"
  >
    <!-- Start: Branding & Connection / Database Pickers -->
    <template #start>
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
        <Select
          :model-value="connectionStore.activeConnectionId"
          :options="connectionStore.connections"
          option-value="id"
          option-label="name"
          :placeholder="$t('sidebar.connections') + '...'"
          size="small"
          class="!h-7 !text-xs !bg-dark-800 !border-dark-600 hover:!border-dark-500 min-w-[160px] max-w-[220px]"
          :style="activeConnStyle"
          @update:model-value="val => handleSelectConnection(val as string)"
        >
          <template #value="slotProps">
            <div v-if="slotProps.value && connectionStore.activeConnection" class="flex items-center space-x-1.5 min-w-0">
              <i
                class="pi pi-server text-xs flex-shrink-0"
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
              <i
                class="pi pi-server text-xs flex-shrink-0"
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
              <i
                v-if="connectionStore.activeConnectionId === slotProps.option.id"
                class="pi pi-check text-accent text-xs ml-auto flex-shrink-0"
              />
            </div>
          </template>

          <template #footer>
            <div class="p-1 border-t border-dark-700">
              <Button
                :label="$t('sidebar.newConnection') + '...'"
                icon="pi pi-plus"
                size="small"
                text
                class="w-full !justify-start !text-xs !py-1"
                @click="handleOpenNewConnection"
              />
            </div>
          </template>
        </Select>

        <!-- Database Select -->
        <Select
          :model-value="connectionStore.activeDatabase"
          :options="filteredAvailableDatabases"
          :placeholder="$t('header.selectDatabase') + '...'"
          size="small"
          class="!h-7 !text-xs !bg-dark-800 !border-dark-600 hover:!border-dark-500 min-w-[130px] max-w-[180px]"
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
        </Select>
      </div>
    </template>

    <!-- End: Actions Toolbar & Settings -->
    <template #end>
      <div class="flex items-center justify-end space-x-1 min-w-0 overflow-hidden">
        <!-- Run / Stop Query Button -->
        <Button
          v-if="!queryStore.isExecuting"
          icon="pi pi-play"
          severity="primary"
          size="small"
          class="!h-7 !w-14 !p-0"
          v-tooltip.bottom="$t('header.runTooltip')"
          @click="$emit('run-query', 'current')"
        />
        <Button
          v-else
          :icon="queryStore.isCancelling ? 'pi pi-spin pi-spinner' : 'pi pi-stop'"
          severity="danger"
          size="small"
          class="!h-7 !w-14 !p-0"
          :disabled="queryStore.isCancelling"
          v-tooltip.bottom="queryStore.isCancelling ? $t('common.running') : $t('header.cancelQueryTooltip')"
          @click="$emit('cancel-query')"
        />

        <!-- Run All Statements Button -->
        <Button
          icon="pi pi-forward"
          severity="primary"
          size="small"
          outlined
          class="!h-7 !w-14 !p-0"
          :disabled="queryStore.isExecuting"
          v-tooltip.bottom="$t('header.runAllTooltip')"
          @click="$emit('run-query', 'all')"
        />

        <div class="w-px h-4 bg-dark-700 mx-0.5 flex-shrink-0" />

        <!-- SQL Editor Clipboard & Folding Actions -->
        <SqlEditorToolbarActions
          :disabled="workspaceStore.activeTab?.type !== 'sql_editor'"
          @action="handleSqlEditorAction"
        />

        <!-- Format SQL Button -->
        <Button
          icon="pi pi-align-left"
          severity="secondary"
          size="small"
          text
          class="!h-7 !w-7 !p-0"
          v-tooltip.bottom="$t('header.formatSqlTooltip')"
          @click="$emit('format-sql')"
        />

        <!-- Open SQL File Button -->
        <Button
          icon="pi pi-folder-open"
          severity="secondary"
          size="small"
          text
          class="!h-7 !w-7 !p-0"
          v-tooltip.bottom="$t('editor.openFile')"
          @click="$emit('open-sql-file')"
        />

        <!-- Save SQL File Button -->
        <Button
          icon="pi pi-save"
          severity="secondary"
          size="small"
          text
          class="!h-7 !w-7 !p-0"
          v-tooltip.bottom="$t('editor.saveFile')"
          @click="$emit('save-sql-file')"
        />

        <!-- New Query Tab Button -->
        <Button
          icon="pi pi-plus"
          severity="secondary"
          size="small"
          text
          class="!h-7 !w-7 !p-0 !text-accent"
          v-tooltip.bottom="$t('editor.newTab')"
          @click="workspaceStore.addSqlTab()"
        />

        <!-- Quick Object Finder Button (Ctrl + P) -->
        <Button
          icon="pi pi-search"
          severity="secondary"
          size="small"
          text
          class="!h-7 !w-7 !p-0"
          v-tooltip.bottom="$t('header.quickFinderTooltip')"
          @click="$emit('open-quick-finder')"
        />

        <!-- SQL Templates Library Button -->
        <Button
          icon="pi pi-book"
          severity="secondary"
          size="small"
          text
          class="!h-7 !w-7 !p-0"
          v-tooltip.bottom="$t('sqlTemplates.title')"
          @click="$emit('open-sql-templates')"
        />

        <!-- AI SQL Assistant Button -->
        <Button
          icon="pi pi-sparkles"
          severity="secondary"
          size="small"
          text
          class="!h-7 !w-7 !p-0"
          v-tooltip.bottom="$t('header.aiAssistantTooltip')"
          @click="$emit('open-ai-chat')"
        />

        <!-- DBA Diagnostics Toolbox Button & Popover -->
        <Button
          severity="secondary"
          size="small"
          text
          class="!h-7 !w-7 !p-0"
          aria-label="DBA 常用診斷維護工具箱"
          v-tooltip.bottom="'DBA 常用診斷維護工具箱'"
          @click="toggleDbaPopover"
        >
          <template #icon>
            <ChartLine class="w-3.5 h-3.5" />
          </template>
        </Button>

        <Popover ref="dbaPopoverRef">
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
        </Popover>

        <div class="w-px h-4 bg-dark-700 mx-0.5 flex-shrink-0" />

        <!-- Performance Analysis Toggle (SET STATISTICS IO, TIME ON) -->
        <Button
          icon="pi pi-gauge"
          size="small"
          :severity="queryStore.isStatsEnabled ? 'primary' : 'secondary'"
          :text="!queryStore.isStatsEnabled"
          class="!h-7 !w-7 !p-0"
          v-tooltip.bottom="'效能分析 (SET STATISTICS IO, TIME ON)'"
          @click="queryStore.toggleStatsEnabled()"
        />

        <!-- Estimated Execution Plan Toggle (SET SHOWPLAN_ALL ON) -->
        <Button
          icon="pi pi-sitemap"
          size="small"
          :severity="queryStore.isShowplanEnabled ? 'primary' : 'secondary'"
          :text="!queryStore.isShowplanEnabled"
          class="!h-7 !w-7 !p-0"
          v-tooltip.bottom="'預估執行計畫 (SET SHOWPLAN_ALL ON)'"
          @click="queryStore.toggleShowplanEnabled()"
        />

        <!-- Actual Execution Plan Toggle (SET STATISTICS XML ON) -->
        <Button
          icon="pi pi-share-alt"
          size="small"
          :severity="queryStore.isActualPlanEnabled ? 'primary' : 'secondary'"
          :text="!queryStore.isActualPlanEnabled"
          class="!h-7 !w-7 !p-0"
          v-tooltip.bottom="'實際執行計畫 (SET STATISTICS XML ON)'"
          @click="queryStore.toggleActualPlanEnabled()"
        />

        <!-- Max Rows Limit Selector -->
        <div class="flex items-center space-x-1 pl-1 text-dark-400 text-xxs font-mono">
          <span>Limit:</span>
          <Select
            :model-value="queryStore.maxRows ?? 'none'"
            :options="limitOptions"
            option-value="value"
            option-label="label"
            size="small"
            class="!h-6 !text-[11px] !bg-dark-800 !border-dark-700 min-w-[75px] font-mono"
            @update:model-value="onMaxRowsChange"
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
          </Select>
        </div>

        <div class="w-px h-4 bg-dark-700 mx-0.5 flex-shrink-0" />

        <!-- Toggle Sidebar -->
        <Button
          icon="pi pi-bars"
          size="small"
          :severity="workspaceStore.isSidebarOpen ? 'primary' : 'secondary'"
          :text="!workspaceStore.isSidebarOpen"
          class="!h-7 !w-7 !p-0"
          :v-tooltip.bottom="$t('header.toggleSidebar')"
          @click="workspaceStore.toggleSidebar()"
        />

        <!-- Toggle Bottom Results Panel -->
        <Button
          icon="pi pi-window-maximize"
          size="small"
          :severity="workspaceStore.isBottomPanelOpen ? 'primary' : 'secondary'"
          :text="!workspaceStore.isBottomPanelOpen"
          :disabled="workspaceStore.activeTab?.type === 'er_diagram'"
          class="!h-7 !w-7 !p-0"
          :v-tooltip.bottom="$t('header.toggleBottomPanel')"
          @click="workspaceStore.toggleBottomPanel()"
        />

        <!-- Settings Modal Trigger -->
        <Button
          icon="pi pi-cog"
          size="small"
          severity="secondary"
          text
          class="!h-7 !w-7 !p-0"
          :v-tooltip.bottom="$t('header.settingsTooltip')"
          @click="$emit('open-settings-modal')"
        />
      </div>

      <!-- Custom window controls (Windows only, where native decorations are hidden) -->
      <WindowControls v-if="showWindowControls" />
    </template>
  </Toolbar>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import Toolbar from 'primevue/toolbar';
import Button from 'primevue/button';
import Select from 'primevue/select';
import { ChartLine, Database } from 'lucide-vue-next';
import SqChip from '@/components/ui/SqChip.vue';
import Popover from 'primevue/popover';
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
const dbaPopoverRef = ref();

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
  dbaPopoverRef.value?.toggle(event);
}

function openDbaQuery(query: DbaQueryItem) {
  dbaPopoverRef.value?.hide();
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
