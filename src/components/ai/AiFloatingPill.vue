<template>
  <div
    v-if="aiChatStore.isChatOpen && aiChatStore.isMinimized"
    class="fixed bottom-6 right-6 z-[9999] animate-fadein select-none"
  >
    <div
      class="flex items-center space-x-2.5 px-4 py-2.5 rounded-full shadow-2xl border bg-dark-850 text-dark-100 transition-all duration-200 cursor-pointer"
      :class="aiChatStore.isGenerating ? 'border-primary' : 'border-dark-700'"
      @click="aiChatStore.restoreWindow()"
    >
      <!-- 動畫指示圖示 -->
      <div class="relative flex items-center justify-center">
        <i
          class="pi pi-sparkles text-sm text-primary transition-transform"
          :class="{ 'animate-spin': aiChatStore.isGenerating }"
        />
        <span
          v-if="aiChatStore.isGenerating"
          class="absolute -top-1 -right-1 flex h-2 w-2"
        >
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" :style="{ backgroundColor: 'var(--p-primary-color)' }"></span>
          <span class="relative inline-flex rounded-full h-2 w-2" :style="{ backgroundColor: 'var(--p-primary-color)' }"></span>
        </span>
      </div>

      <!-- 文字狀態與耗時 -->
      <div class="flex items-center space-x-2 text-xs font-medium">
        <span v-if="aiChatStore.isGenerating">
          AI 分析中... ({{ aiChatStore.executionElapsedSeconds }}s)
        </span>
        <span v-else>
          AI 助手 (點擊展開)
        </span>

        <Tag
          v-if="aiChatStore.currentSql"
          value="已帶入 SQL"
          severity="info"
          class="!text-xxs !font-medium !py-0 !px-1.5"
        />
      </div>

      <!-- 快速動作按鈕 -->
      <div class="flex items-center space-x-1 pl-1 border-l border-dark-700" @click.stop>
        <Button
          v-if="aiChatStore.isGenerating"
          icon="pi pi-stop-circle"
          severity="danger"
          text
          rounded
          size="small"
          v-tooltip.top="'中斷 AI 分析'"
          class="!w-6 !h-6 !p-0 text-danger hover:text-danger"
          @click="aiChatStore.cancelGeneration()"
        />
        <Button
          icon="pi pi-window-maximize"
          severity="secondary"
          text
          rounded
          size="small"
          v-tooltip.top="'還原視窗'"
          class="!w-6 !h-6 !p-0"
          @click="aiChatStore.restoreWindow()"
        />
        <Button
          icon="pi pi-times"
          severity="secondary"
          text
          rounded
          size="small"
          v-tooltip.top="'關閉'"
          class="!w-6 !h-6 !p-0 hover:text-danger"
          @click="aiChatStore.closeChat()"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { useAiChatStore } from '@/stores/aiChatStore';

const aiChatStore = useAiChatStore();
</script>

<style scoped>
@keyframes fadein {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.animate-fadein {
  animation: fadein 0.18s ease-out forwards;
}
</style>
