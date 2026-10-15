<template>
  <div
    v-if="aiChatStore.isChatOpen && aiChatStore.isMinimized"
    class="fixed bottom-6 right-6 z-[9999] animate-fadein select-none"
  >
    <div
      class="flex items-center space-x-2.5 px-4 py-2.5 rounded-md shadow-overlay border bg-dark-850 text-dark-100 transition-all duration-200 cursor-pointer"
      :class="aiChatStore.isGenerating ? 'border-primary' : 'border-dark-700'"
      @click="aiChatStore.restoreWindow()"
    >
      <!-- 動畫指示圖示 -->
      <div class="relative flex items-center justify-center">
        <Sparkles
          class="w-3.5 h-3.5 text-primary transition-transform"
          :class="{ 'animate-spin': aiChatStore.isGenerating }"
        />
        <span
          v-if="aiChatStore.isGenerating"
          class="absolute -top-1 -right-1 flex h-2 w-2"
        >
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" :style="{ backgroundColor: 'rgb(var(--color-accent))' }"></span>
          <span class="relative inline-flex rounded-full h-2 w-2" :style="{ backgroundColor: 'rgb(var(--color-accent))' }"></span>
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

        <SqChip
          v-if="aiChatStore.currentSql"
          label="已帶入 SQL"
          tone="accent"
          class="font-medium"
        />
      </div>

      <!-- 快速動作按鈕 -->
      <div class="flex items-center space-x-1 pl-1 border-l border-dark-700" @click.stop>
        <SqButton
          v-if="aiChatStore.isGenerating"
          size="sm"
          tone="danger"
          aria-label="中斷 AI 分析"
          v-tooltip.top="'中斷 AI 分析'"
          @click="aiChatStore.cancelGeneration()"
        >
          <template #icon><CircleStop class="w-3.5 h-3.5" /></template>
        </SqButton>
        <SqButton
          size="sm"
          aria-label="還原視窗"
          v-tooltip.top="'還原視窗'"
          @click="aiChatStore.restoreWindow()"
        >
          <template #icon><SquarePlus class="w-3.5 h-3.5" /></template>
        </SqButton>
        <SqButton
          size="sm"
          tone="danger"
          aria-label="關閉"
          v-tooltip.top="'關閉'"
          @click="aiChatStore.closeChat()"
        >
          <template #icon><X class="w-3.5 h-3.5" /></template>
        </SqButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import SqButton from '@/components/ui/SqButton.vue';
import { CircleStop, Sparkles, SquarePlus, X } from '@/components/icons';
import SqChip from '@/components/ui/SqChip.vue';
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
