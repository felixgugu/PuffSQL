<template>
  <div
    class="w-full h-full rounded-md shadow-xl border overflow-hidden flex flex-col font-sans transition-all relative select-none group cursor-move"
    :class="[
      themeClasses.container,
      isSelected ? 'ring-2 ring-brand-400 shadow-brand-500/20' : ''
    ]"
  >
    <!-- Card Header (Drag Handle) - Only visible in Edit Mode -->
    <div
      v-if="nodeData.isEditMode"
      class="h-7 px-2 flex items-center justify-between flex-shrink-0 cursor-move border-b select-none"
      :class="themeClasses.header"
    >
      <!-- Left: Icon & Color Palette -->
      <div class="flex items-center space-x-1.5">
        <Type class="w-3 h-3 flex-shrink-0 opacity-80" />
        <div class="flex items-center space-x-1 ml-1" @mousedown.stop @click.stop>
          <button
            v-for="colorOption in colorOptions"
            :key="colorOption.key"
            type="button"
            @click="setColor(colorOption.key)"
            class="w-2.5 h-2.5 rounded-full transition-transform hover:scale-125 cursor-pointer"
            :class="[
              colorOption.bgClass,
              (nodeData.color || 'dark') === colorOption.key
                ? (isLightTheme ? 'ring-1.5 ring-slate-800 scale-110 shadow-xs' : 'ring-1.5 ring-white scale-110 shadow-xs')
                : 'opacity-70 hover:opacity-100'
            ]"
            :title="`切換為 ${colorOption.label}`"
          />
        </div>
      </div>

      <!-- Right: Actions (Delete) -->
      <div class="flex items-center space-x-1" @mousedown.stop @click.stop>
        <button
          type="button"
          @click="removeNode"
          class="p-0.5 rounded hover:bg-black/20 text-current opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
          title="刪除此文字備註"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- View Mode Subtle Drag Bar (visible on hover) -->
    <div
      v-if="!nodeData.isEditMode"
      class="h-2.5 w-full flex items-center justify-center flex-shrink-0 cursor-move opacity-0 group-hover:opacity-40 hover:!opacity-80 transition-opacity select-none"
      title="拖曳以移動文字卡片"
    >
      <div class="w-6 h-0.5 rounded-full bg-current opacity-60"></div>
    </div>

    <!-- Card Body: Editable Textarea -->
    <div class="flex-1 w-full relative overflow-hidden px-2 pb-2 pt-0.5 flex flex-col cursor-text">
      <textarea
        ref="textareaRef"
        v-model="textContent"
        @input="handleTextInput"
        @mousedown.stop
        @click.stop
        @keydown.stop
        class="w-full flex-1 bg-transparent resize-none outline-none border-none text-xs font-sans leading-relaxed break-words"
        :class="themeClasses.textarea"
        placeholder="點擊輸入文字備註或說明..."
      ></textarea>
    </div>

    <!-- Drag Resize Grip Handle (Bottom-Right) -->
    <div
      @mousedown.stop="startResize"
      class="absolute bottom-0 right-0 w-3.5 h-3.5 flex items-center justify-center cursor-se-resize select-none opacity-40 hover:opacity-100 text-current z-10 transition-opacity"
      title="拖曳以縮放大小"
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
import { ref, computed, inject, onMounted } from 'vue';
import { Type, X } from '@/components/icons';
import type { Node } from '@antv/x6';
import { useSettingsStore } from '@/stores/settingsStore';

export type NoteColor = 'amber' | 'blue' | 'emerald' | 'purple' | 'rose' | 'dark';

export interface ErTextNodeData {
  text: string;
  color?: NoteColor;
  isEditMode?: boolean;
  erTheme?: 'dark' | 'light';
}

const getNode = inject<() => Node>('getNode');
const node = getNode ? getNode() : null;

const settingsStore = useSettingsStore();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const textContent = ref('');
const isSelected = ref(false);

const nodeData = ref<ErTextNodeData>({
  text: '',
  color: 'dark',
  isEditMode: false,
});

const isLightTheme = computed(() => (nodeData.value.erTheme || settingsStore.erTheme) === 'light');

const colorOptions: Array<{ key: NoteColor; label: string; bgClass: string }> = [
  { key: 'amber', label: '經典便箋黃', bgClass: 'bg-amber-400' },
  { key: 'blue', label: '科技藍', bgClass: 'bg-sky-400' },
  { key: 'emerald', label: '清新綠', bgClass: 'bg-emerald-400' },
  { key: 'purple', label: '高雅紫', bgClass: 'bg-purple-400' },
  { key: 'rose', label: '警示紅', bgClass: 'bg-rose-400' },
  { key: 'dark', label: '極簡深灰', bgClass: 'bg-zinc-400' },
];

const themeClasses = computed(() => {
  const c = nodeData.value.color || 'dark';
  const isLight = isLightTheme.value;

  if (isLight) {
    switch (c) {
      case 'blue':
        return {
          container: 'bg-sky-50 border-sky-300/80 hover:border-sky-400 text-info shadow-md shadow-sky-900/5',
          header: 'bg-sky-100 border-sky-200 text-info',
          textarea: 'text-info placeholder:text-info',
        };
      case 'emerald':
        return {
          container: 'bg-emerald-50 border-emerald-300/80 hover:border-emerald-400 text-ok shadow-md shadow-emerald-900/5',
          header: 'bg-emerald-100 border-emerald-200 text-ok',
          textarea: 'text-ok placeholder:text-ok',
        };
      case 'purple':
        return {
          container: 'bg-purple-50 border-purple-300/80 hover:border-purple-400 text-plan shadow-md shadow-purple-900/5',
          header: 'bg-purple-100 border-purple-200 text-plan',
          textarea: 'text-plan placeholder:text-plan',
        };
      case 'rose':
        return {
          container: 'bg-rose-50 border-rose-300/80 hover:border-rose-400 text-danger shadow-md shadow-rose-900/5',
          header: 'bg-rose-100 border-rose-200 text-danger',
          textarea: 'text-danger placeholder:text-danger',
        };
      case 'amber':
        return {
          container: 'bg-amber-50 border-amber-300/80 hover:border-amber-400 text-warn shadow-md shadow-amber-900/5',
          header: 'bg-amber-100 border-amber-200 text-warn',
          textarea: 'text-warn placeholder:text-warn',
        };
      case 'dark':
      default:
        return {
          container: 'bg-slate-100 border-slate-400 hover:border-slate-500 text-slate-800 shadow-md shadow-slate-900/5',
          header: 'bg-slate-200 border-slate-300 text-slate-700',
          textarea: 'text-slate-900 placeholder:text-slate-600',
        };
    }
  }

  switch (c) {
    case 'blue':
      return {
        container: 'bg-sky-950 border-sky-500/50 hover:border-sky-400 text-info',
        header: 'bg-sky-900 border-sky-500/30 text-info',
        textarea: 'text-info placeholder:text-info',
      };
    case 'emerald':
      return {
        container: 'bg-emerald-950 border-emerald-500/50 hover:border-emerald-400 text-ok',
        header: 'bg-emerald-900 border-emerald-500/30 text-ok',
        textarea: 'text-ok placeholder:text-ok',
      };
    case 'purple':
      return {
        container: 'bg-purple-950 border-purple-500/50 hover:border-purple-400 text-plan',
        header: 'bg-purple-900 border-purple-500/30 text-plan',
        textarea: 'text-plan placeholder:text-plan',
      };
    case 'rose':
      return {
        container: 'bg-rose-950 border-rose-500/50 hover:border-rose-400 text-danger',
        header: 'bg-rose-900 border-rose-500/30 text-danger',
        textarea: 'text-danger placeholder:text-danger',
      };
    case 'amber':
      return {
        container: 'bg-amber-950 border-amber-500/50 hover:border-amber-400 text-warn',
        header: 'bg-amber-900 border-amber-500/30 text-warn',
        textarea: 'text-warn placeholder:text-warn',
      };
    case 'dark':
    default:
      return {
        container: 'bg-dark-850 border-dark-700 hover:border-dark-600 text-dark-100',
        header: 'bg-dark-800 border-dark-700/80 text-dark-300',
        textarea: 'text-dark-100 placeholder:text-dark-500',
      };
  }
});

function handleTextInput() {
  if (!node) return;
  const current = node.getData<ErTextNodeData>() || {};
  node.setData({ ...current, text: textContent.value }, { overwrite: true });
}

function setColor(color: NoteColor) {
  if (!node) return;
  nodeData.value.color = color;
  const current = node.getData<ErTextNodeData>() || {};
  node.setData({ ...current, color }, { overwrite: true });
}

function removeNode() {
  if (node) {
    node.remove();
  }
}

function startResize(e: MouseEvent) {
  if (!node) return;
  e.preventDefault();
  e.stopPropagation();

  const graph = node.model?.graph;
  const zoom = graph ? graph.zoom() : 1;
  const startX = e.clientX;
  const startY = e.clientY;
  const currentSize = node.size();
  const startW = currentSize.width;
  const startH = currentSize.height;

  function onMouseMove(moveEvent: MouseEvent) {
    const dx = (moveEvent.clientX - startX) / zoom;
    const dy = (moveEvent.clientY - startY) / zoom;
    const newW = Math.max(140, Math.round(startW + dx));
    const newH = Math.max(70, Math.round(startH + dy));
    node?.setSize({ width: newW, height: newH });
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

onMounted(() => {
  if (node) {
    const d = node.getData<ErTextNodeData>();
    if (d) {
      nodeData.value = {
        text: d.text || '',
        color: d.color || 'dark',
        isEditMode: d.isEditMode ?? false,
        erTheme: d.erTheme,
      };
      textContent.value = d.text || '';
    }

    node.on('change:data', ({ current }) => {
      if (current) {
        nodeData.value = {
          text: current.text || '',
          color: current.color || 'dark',
          isEditMode: current.isEditMode ?? false,
          erTheme: current.erTheme,
        };
        if (textContent.value !== (current.text || '')) {
          textContent.value = current.text || '';
        }
      }
    });

    const graph = node.model?.graph;
    if (graph) {
      graph.on('cell:selected', ({ cell }) => {
        if (cell === node) isSelected.value = true;
      });
      graph.on('cell:unselected', ({ cell }) => {
        if (cell === node) isSelected.value = false;
      });
    }
  }
});
</script>
