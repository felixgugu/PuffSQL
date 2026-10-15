<template>
  <div class="flex flex-col h-full bg-dark-850 font-sans">
    <!-- Header & Toolbar -->
    <div class="h-9 px-3 border-b border-dark-700 flex items-center justify-between text-xs uppercase tracking-wider text-dark-400 bg-dark-850 flex-shrink-0 select-none">
      <!-- Left: Title -->
      <div class="flex items-center space-x-1.5">
        <FolderGit2 class="w-3.5 h-3.5 text-accent" />
        <span>{{ $t('sidebar.sqlFiles') }}</span>
      </div>

      <!-- Right: Toolbar (新增, 恢復排除, 重新整理, 全部收合) -->
      <div class="flex items-center space-x-1">
        <!-- 恢復取消監控的檔案 (Restore Excluded Items) -->
        <SqButton
          v-if="sqlFolderStore.excludedPaths.length > 0"
          size="sm"
          tone="warn"
          :aria-label="$t('sidebar.restoreExcludedPaths', { count: sqlFolderStore.excludedPaths.length })"
          v-tooltip.bottom="$t('sidebar.restoreExcludedPaths', { count: sqlFolderStore.excludedPaths.length })"
          @click="sqlFolderStore.restoreExcludedPaths"
        >
          <template #icon><Eye class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- 新增 (Add Folder) -->
        <SqButton
          size="sm"
          :disabled="sqlFolderStore.isLoading"
          :aria-label="$t('sidebar.addFolderTooltip')"
          v-tooltip.bottom="$t('sidebar.addFolderTooltip')"
          @click="handleAddFolder"
        >
          <template #icon><Plus class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- 重新整理 (Refresh) -->
        <SqButton
          size="sm"
          :loading="sqlFolderStore.isLoading"
          :disabled="sqlFolderStore.isLoading"
          :aria-label="$t('common.refresh')"
          v-tooltip.bottom="$t('common.refresh')"
          @click="handleRefreshAll"
        >
          <template #icon><RefreshCw class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- 全部收合 (Collapse All) -->
        <SqButton
          size="sm"
          :aria-label="$t('sidebar.collapseAll')"
          v-tooltip.bottom="$t('sidebar.collapseAll')"
          @click="sqlFolderStore.collapseAll"
        >
          <template #icon><ChevronsUp class="w-3.5 h-3.5" /></template>
        </SqButton>
      </div>
    </div>

    <!-- Tree Content Area -->
    <div class="flex-1 overflow-y-auto px-1.5 py-2 text-xs font-sans">
      <!-- Empty State -->
      <div
        v-if="sqlFolderStore.monitoredFolders.length === 0"
        class="py-6 px-3 text-center text-dark-400 space-y-2"
      >
        <FolderSearch class="w-8 h-8 text-dark-600 mx-auto stroke-1" />
        <div class="text-xxs leading-relaxed">
          {{ $t('sidebar.noMonitoredFolders') }}<br />
          {{ $t('sidebar.monitoredFoldersHint') }}
        </div>
        <SqButton
          type="button"
          size="sm"
          :label="$t('sidebar.addFolder')"
          variant="outline"
          @click="handleAddFolder"
        >
          <template #icon><FolderOpen class="w-3.5 h-3.5" /></template>
        </SqButton>
      </div>

      <!-- Monitored Folders List -->
      <div v-else class="space-y-1">
        <div
          v-for="folder in sqlFolderStore.monitoredFolders"
          :key="folder.id"
          class="space-y-0.5"
        >
          <!-- Root Folder Item -->
          <div
            @click="sqlFolderStore.toggleNode(folder.path)"
            @contextmenu.prevent="openRootFolderContextMenu($event, folder)"
            :class="[
              'flex items-center space-x-1.5 px-1.5 py-1 rounded cursor-pointer transition-colors group select-none',
              'hover:bg-dark-750 text-dark-200'
            ]"
            :title="`${folder.name}\n${folder.path}`"
          >
            <!-- Chevron -->
            <button
              type="button"
              @click.stop="sqlFolderStore.toggleNode(folder.path)"
              class="p-0.5 hover:bg-dark-700 text-dark-500 hover:text-dark-200 rounded transition-colors flex-shrink-0 flex items-center justify-center"
            >
              <component
                :is="sqlFolderStore.expandedNodes[folder.path] ? ChevronDown : ChevronRight"
                class="w-3 h-3"
              />
            </button>

            <!-- Folder Icon -->
            <component
              :is="sqlFolderStore.expandedNodes[folder.path] ? FolderOpen : Folder"
              class="w-3.5 h-3.5 text-warn flex-shrink-0"
            />

            <!-- Name & Path -->
            <span class="truncate flex-1 text-dark-100 text-xs">
              {{ folder.name }}
            </span>

            <!-- Actions on hover -->
            <div class="opacity-0 group-hover:opacity-100 flex items-center space-x-0.5 flex-shrink-0 transition-opacity">
              <!-- Single Refresh -->
              <button
                type="button"
                @click.stop="sqlFolderStore.refreshFolder(folder.path)"
                class="p-0.5 hover:bg-dark-700 text-dark-400 hover:text-dark-200 rounded"
                :title="$t('sidebar.refreshThisFolder')"
              >
                <RotateCw :class="['w-2.5 h-2.5', sqlFolderStore.refreshingPath === folder.path ? 'animate-spin text-accent' : '']" />
              </button>

              <!-- Remove from monitoring -->
              <button
                type="button"
                @click.stop="sqlFolderStore.unmonitorItem(folder.path, folder.name, true)"
                class="p-0.5 hover:bg-dark-700 text-dark-400 hover:text-danger rounded"
                :title="$t('sidebar.unmonitor')"
              >
                <X class="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

          <!-- Tree Children -->
          <div
            v-if="sqlFolderStore.expandedNodes[folder.path]"
            class="pl-1 border-l border-dark-750 ml-2"
          >
            <!-- Loading state -->
            <div
              v-if="!sqlFolderStore.folderTrees[folder.path] && sqlFolderStore.isLoading"
              class="py-1 px-2 text-xxs text-dark-500 flex items-center space-x-1.5"
            >
              <RotateCw class="w-2.5 h-2.5 animate-spin text-accent" />
              <span>{{ $t('sidebar.scanning') }}</span>
            </div>

            <!-- No .sql files -->
            <div
              v-else-if="!sqlFolderStore.folderTrees[folder.path]?.children || sqlFolderStore.folderTrees[folder.path]?.children?.length === 0"
              class="py-1 px-2 text-xxs text-dark-500 italic"
            >
              {{ $t('sidebar.noSqlFiles') }}
            </div>

            <!-- Children Nodes -->
            <template v-else>
              <SqlFileTreeNode
                v-for="child in sqlFolderStore.folderTrees[folder.path]?.children"
                :key="child.path"
                :node="child"
                :depth="0"
              />
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Context menu for folders & files -->
    <SqMenu
      v-model="nodeMenu.isOpen.value"
      :anchor-rect="nodeMenu.rect.value"
      :items="contextMenuItems"
      aria-label="資料夾與檔案選單"
    />

    <!-- Rename Modal -->
    <SqDialog
      v-model:visible="isRenameModalOpen"
      :header="targetNode?.isDir ? $t('sidebar.renameFolder') : $t('sidebar.renameFile')"
      :class="renameDialogWindow.marker"
      class="w-full max-w-md"
      @show="renameDialogWindow.onShow"
      @hide="renameDialogWindow.onHide"
    >
      <div class="space-y-3 text-xs py-1">
        <p class="text-dark-300 leading-relaxed">
          {{ $t('sidebar.promptNewName', { target: targetNode?.isDir ? $t('sidebar.folder') : $t('sidebar.file') }) }}
        </p>
        <div>
          <label class="block text-xxs text-dark-400 mb-1">{{ $t('sidebar.newName') }}</label>
          <SqInput
            id="rename-target-input"
            v-model="renameInput"
            :placeholder="targetNode?.isDir ? $t('sidebar.folderPlaceholder') : $t('sidebar.filePlaceholder')"
            class="w-full"
            @keyup.enter="handleConfirmRename"
          />
          <p v-if="renameError" class="text-danger text-xxs mt-1.5">{{ renameError }}</p>
          <p v-else-if="!targetNode?.isDir" class="text-dark-400 text-xxs mt-1.5">
            {{ $t('sidebar.sqlExtHint') }}
          </p>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-end space-x-2 pt-2">
          <SqButton
            type="button"
            :label="$t('common.cancel')"
            @click="isRenameModalOpen = false"
          />
          <SqButton
            type="button"
            :label="$t('common.confirm')"
            tone="accent"
            variant="solid"
            :disabled="!renameInput.trim() || isSubmittingRename"
            :loading="isSubmittingRename"
            @click="handleConfirmRename"
          >
            <template #icon><Check class="w-3.5 h-3.5" /></template>
          </SqButton>
        </div>
      </template>
    </SqDialog>

    <!-- Manual Path Input Modal (Alternative to native picker) -->
    <SqDialog
      v-model:visible="isManualPathModalOpen"
      :header="$t('sidebar.addFolderTitle')"
      :class="pathDialogWindow.marker"
      class="w-full max-w-md"
      @show="pathDialogWindow.onShow"
      @hide="pathDialogWindow.onHide"
    >
      <div class="space-y-3 text-xs py-1">
        <p class="text-dark-300 leading-relaxed">
          {{ $t('sidebar.manualPathPrompt') }}
        </p>
        <div>
          <label class="block text-xxs text-dark-400 mb-1">{{ $t('sidebar.folderFullPath') }}</label>
          <SqInput
            v-model="manualPathInput"
            :placeholder="$t('sidebar.manualPathPlaceholder')"
            class="w-full"
            @keyup.enter="handleConfirmManualPath"
          />
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-end space-x-2 pt-2">
          <SqButton
            type="button"
            :label="$t('common.cancel')"
            @click="isManualPathModalOpen = false"
          />
          <SqButton
            type="button"
            :label="$t('common.add')"
            tone="accent"
            variant="solid"
            :disabled="!manualPathInput.trim()"
            @click="handleConfirmManualPath"
          >
            <template #icon><Check class="w-3.5 h-3.5" /></template>
          </SqButton>
        </div>
      </template>
    </SqDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, provide, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import SqButton from '@/components/ui/SqButton.vue';
import SqInput from '@/components/ui/SqInput.vue';
import SqDialog from '@/components/ui/SqDialog.vue';
import SqMenu from '@/components/ui/SqMenu.vue';
import { useContextMenu } from '@/composables/useContextMenu';
import {
  Copy,
  EyeOff,
  FileEdit,
  FolderGit2,
  Pencil,
  RotateCw,
  Folder,
  FolderOpen,
  FolderSearch,
  ChevronRight,
  ChevronDown,
  X,
  Check,
  ChevronsUp,
  Eye,
  Plus,
  RefreshCw,
} from '@/components/icons';
import { useSqlFolderStore } from '@/stores/sqlFolderStore';
import { useDialogWindow } from '@/composables/useDialogWindow';
import type { MonitoredFolder, SqlFileNode } from '@/types/sqlFolder';
import SqlFileTreeNode from './SqlFileTreeNode.vue';

// Two dialogs live in this component; each needs its own instance.
const renameDialogWindow = useDialogWindow();
const pathDialogWindow = useDialogWindow();

interface ContextMenuTarget {
  name: string;
  path: string;
  isDir: boolean;
  isRoot: boolean;
  rawNode?: SqlFileNode;
}

const { t } = useI18n();
const sqlFolderStore = useSqlFolderStore();

const nodeMenu = useContextMenu();
const targetNode = ref<ContextMenuTarget | null>(null);

const isRenameModalOpen = ref(false);
const renameInput = ref('');
const renameError = ref('');
const isSubmittingRename = ref(false);

const isManualPathModalOpen = ref(false);
const manualPathInput = ref('');

onMounted(async () => {
  await sqlFolderStore.init();
});

function openNodeContextMenu(event: MouseEvent, node: SqlFileNode, isRoot = false) {
  targetNode.value = {
    name: node.name,
    path: node.path,
    isDir: node.is_dir,
    isRoot,
    rawNode: node,
  };
  nodeMenu.openAt(event);
}

provide('openSqlNodeContextMenu', openNodeContextMenu);

function openRootFolderContextMenu(event: MouseEvent, folder: MonitoredFolder) {
  openNodeContextMenu(
    event,
    {
      name: folder.name,
      path: folder.path,
      is_dir: true,
    },
    true
  );
}

function openRenameModal(target: ContextMenuTarget) {
  renameInput.value = target.name;
  renameError.value = '';
  isRenameModalOpen.value = true;
  nextTick(() => {
    const el = document.querySelector('#rename-target-input') as HTMLInputElement | null;
    if (el) {
      el.focus();
      if (!target.isDir && target.name.toLowerCase().endsWith('.sql')) {
        const dotIdx = target.name.lastIndexOf('.');
        el.setSelectionRange(0, dotIdx);
      } else {
        el.select();
      }
    }
  });
}

async function handleConfirmRename() {
  if (!targetNode.value) return;
  const input = renameInput.value.trim();
  if (!input) {
    renameError.value = t('sidebar.nameCannotBeEmpty');
    return;
  }
  if (/[\\/:*?"<>|]/.test(input)) {
    renameError.value = t('sidebar.invalidChars');
    return;
  }

  const target = targetNode.value;
  const finalName = !target.isDir && !input.toLowerCase().endsWith('.sql') ? `${input}.sql` : input;

  if (finalName === target.name) {
    isRenameModalOpen.value = false;
    return;
  }

  isSubmittingRename.value = true;
  try {
    const success = await sqlFolderStore.renameItem(target.path, finalName, target.isDir);
    if (success) {
      isRenameModalOpen.value = false;
    }
  } finally {
    isSubmittingRename.value = false;
  }
}

const contextMenuItems = computed(() => {
  const target = targetNode.value;
  if (!target) return [];

  const copyPathItem = {
    label: t('sidebar.copyFullPath'),
    icon: Copy,
    command: () => {
      try {
        navigator.clipboard.writeText(target.path);
      } catch {}
    },
  };

  const renameMenuItem = {
    label: t('sidebar.rename'),
    icon: Pencil,
    command: () => openRenameModal(target),
  };

  const unmonitorMenuItem = {
    label: t('sidebar.unmonitor'),
    icon: EyeOff,
    class: '!text-danger',
    command: () => sqlFolderStore.unmonitorItem(target.path, target.name, target.isRoot),
  };

  if (target.isDir) {
    return [
      {
        label: target.name,
        disabled: true,
      },
      { separator: true },
      {
        label: t('sidebar.refreshThisFolder'),
        icon: RefreshCw,
        command: () => {
          if (target.isRoot) {
            sqlFolderStore.refreshFolder(target.path);
          } else {
            sqlFolderStore.refreshAll();
          }
        },
      },
      renameMenuItem,
      copyPathItem,
      { separator: true },
      unmonitorMenuItem,
    ];
  }

  return [
    {
      label: target.name,
      disabled: true,
    },
    { separator: true },
    {
      label: t('sidebar.openInEditor'),
      icon: FileEdit,
      command: () => {
        if (target.rawNode) {
          sqlFolderStore.openFile(target.rawNode);
        }
      },
    },
    renameMenuItem,
    copyPathItem,
    { separator: true },
    unmonitorMenuItem,
  ];
});

async function handleAddFolder() {
  await sqlFolderStore.addFolder();
}

async function handleRefreshAll() {
  await sqlFolderStore.refreshAll();
}

async function handleConfirmManualPath() {
  const path = manualPathInput.value.trim();
  if (!path) return;
  const success = await sqlFolderStore.addFolder(path);
  if (success) {
    manualPathInput.value = '';
    isManualPathModalOpen.value = false;
  }
}
</script>
