<template>
  <div class="select-none text-xs">
    <!-- Folder Node -->
    <template v-if="node.is_dir">
      <div
        @click="toggleExpand"
        @contextmenu.prevent.stop="handleContextMenu"
        :class="[
          'flex items-center space-x-1.5 px-1.5 py-1 rounded cursor-pointer transition-colors group',
          'text-dark-300 hover:bg-dark-750 hover:text-dark-100'
        ]"
        :style="{ paddingLeft: `${depth * 14 + 6}px` }"
        :title="`${node.path} (${$t('sidebar.clickToExpand')})`"
      >
        <!-- Chevron -->
        <button
          type="button"
          @click.stop="toggleExpand"
          class="p-0.5 hover:bg-dark-700 text-dark-500 hover:text-dark-200 rounded transition-colors flex-shrink-0 flex items-center justify-center"
        >
          <component
            :is="isExpanded ? ChevronDown : ChevronRight"
            class="w-3 h-3"
          />
        </button>

        <!-- Folder Icon -->
        <component
          :is="isExpanded ? FolderOpen : Folder"
          class="w-3.5 h-3.5 text-warn/90 flex-shrink-0"
        />

        <!-- Folder Name -->
        <span class="truncate flex-1 text-dark-200 group-hover:text-dark-100">
          {{ node.name }}
        </span>

        <!-- Child count badge -->
        <span
          v-if="node.children && node.children.length > 0"
          class="text-xxs text-dark-500 font-sans flex-shrink-0 pr-1"
        >
          {{ countSqlFiles(node) }}
        </span>
      </div>

      <!-- Recursive Children -->
      <div v-if="isExpanded && node.children && node.children.length > 0">
        <SqlFileTreeNode
          v-for="child in node.children"
          :key="child.path"
          :node="child"
          :depth="depth + 1"
        />
      </div>
    </template>

    <!-- SQL File Node -->
    <template v-else>
      <div
        @click="handleFileClick"
        @contextmenu.prevent.stop="handleContextMenu"
        :class="[
          'flex items-center space-x-1.5 px-1.5 py-1 rounded cursor-pointer transition-colors group relative',
          isActiveFile
            ? 'bg-brand-500/20 text-accent border-l-2 border-brand-400'
            : 'text-dark-300 hover:bg-dark-750 hover:text-dark-100'
        ]"
        :style="{ paddingLeft: `${depth * 14 + 20}px` }"
        :title="`${node.path} (${$t('sidebar.clickToOpen')})`"
      >
        <FileCode class="w-3.5 h-3.5 text-accent flex-shrink-0" />

        <!-- File Name -->
        <span class="truncate flex-1 font-sans text-[11px] group-hover:text-dark-100">
          {{ node.name }}
        </span>

        <!-- File Size -->
        <span
          v-if="node.size !== undefined"
          class="text-xxs text-dark-500 font-sans flex-shrink-0 group-hover:text-dark-400 pr-1"
        >
          {{ formatByteSize(node.size) }}
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
} from '@/components/icons';
import type { SqlFileNode } from '@/types/sqlFolder';
import { useSqlFolderStore } from '@/stores/sqlFolderStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { SqlEditorTab } from '@/types/workspace';

interface Props {
  node: SqlFileNode;
  depth?: number;
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0,
});

const sqlFolderStore = useSqlFolderStore();
const workspaceStore = useWorkspaceStore();

const openContextMenu = inject<((event: MouseEvent, node: SqlFileNode) => void) | undefined>(
  'openSqlNodeContextMenu'
);

const isExpanded = computed(() => !!sqlFolderStore.expandedNodes[props.node.path]);

const isActiveFile = computed(() => {
  if (props.node.is_dir) return false;
  const activeTab = workspaceStore.activeTab;
  if (!activeTab || activeTab.type !== 'sql_editor') return false;
  return (activeTab as SqlEditorTab).filePath === props.node.path;
});

function toggleExpand() {
  if (props.node.is_dir) {
    sqlFolderStore.toggleNode(props.node.path);
  }
}

function handleFileClick() {
  if (!props.node.is_dir) {
    sqlFolderStore.openFile(props.node);
  }
}

function handleContextMenu(event: MouseEvent) {
  openContextMenu?.(event, props.node);
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countSqlFiles(folder: SqlFileNode): number {
  if (!folder.children) return 0;
  let count = 0;
  for (const child of folder.children) {
    if (child.is_dir) {
      count += countSqlFiles(child);
    } else {
      count++;
    }
  }
  return count;
}
</script>
