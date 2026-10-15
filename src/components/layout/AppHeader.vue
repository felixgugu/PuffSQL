<template>
  <!-- The toolbar row doubles as the custom window title bar: empty areas are draggable (deep),
       while buttons/selects stay clickable because Tauri ignores interactive elements. -->
  <div
    data-tauri-drag-region="deep"
    class="h-10 bg-dark-850 border-b border-dark-700 px-2.5 flex items-center justify-between gap-2 select-none flex-shrink-0 relative z-30 font-sans text-xs"
  >
    <!-- Start: Connection / Database Pickers -->
    <div class="flex items-center space-x-2 flex-shrink-0">
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
        <!-- Editing, execution and plan controls moved into the SQL editor toolbar row above the editor. -->
        <!-- Open SQL File Button -->
        <SqButton :aria-label="$t('editor.openFile')" v-tooltip.bottom="$t('editor.openFile')" @click="$emit('open-sql-file')">
          <template #icon><FolderOpen class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- Save SQL File Button -->
        <SqButton :aria-label="$t('editor.saveFile')" v-tooltip.bottom="$t('editor.saveFile')" @click="$emit('save-sql-file')">
          <template #icon><Save class="w-3.5 h-3.5" /></template>
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
  Book,
  ChartLine,
  Check,
  Database,
  FolderOpen,
  PanelLeft,
  Plus,
  Save,
  Search,
  Settings,
  Sparkles,
  SquarePlus,
} from '@/components/icons';
import SqButton from '@/components/ui/SqButton.vue';
import SqChip from '@/components/ui/SqChip.vue';
import SqPopover from '@/components/ui/SqPopover.vue';
import WindowControls from '@/components/layout/WindowControls.vue';
// Single source of truth for the brand mark: the icon set shipped with the Tauri app.
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { resolveConnectionLabelColor } from '@/utils/connectionColor';
import { windowService } from '@/services/windowService';
import { DBA_QUERIES, type DbaQueryItem } from '@/utils/dbaQueries';
import type { ConnectionProfile } from '@/types/connection';

const workspaceStore = useWorkspaceStore();
const connectionStore = useConnectionStore();
const settingsStore = useSettingsStore();
/** Anchored popover state for the DBA toolbox: the trigger element drives the panel position. */
const isDbaPopoverOpen = ref(false);
const dbaAnchorEl = ref<HTMLElement | null>(null);

/** Windows 使用自繪標題列，其餘平台保留系統原生視窗裝飾。 */
const showWindowControls = windowService.isCustomTitleBar();

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
  (e: 'open-sql-file'): void;
  (e: 'save-sql-file'): void;
  (e: 'open-connection-modal'): void;
  (e: 'open-settings-modal'): void;
  (e: 'open-quick-finder'): void;
  (e: 'open-sql-templates'): void;
  (e: 'open-ai-chat'): void;
}>();

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
</script>
