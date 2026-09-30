<template>
  <Teleport to="body">
    <div
      v-if="dataViewStore.isOpen && dataViewStore.isMinimized"
      class="fixed bottom-6 right-6 z-[9998] select-none transition-transform duration-200 ease-out will-change-transform motion-reduce:transition-none"
      :class="isAiPillVisible ? '-translate-y-14' : 'translate-y-0'"
    >
      <!--
        The entrance animation lives on the inner surface: the outer element owns the stacking
        offset, so the two never animate the same `transform`.
      -->
      <div
        class="animate-fade-in flex items-center space-x-2.5 px-3.5 py-2 rounded-full shadow-2xl border border-sky-500/40 bg-dark-850 text-dark-100 hover:border-sky-400 transition-all duration-200 cursor-pointer group"
        @click="dataViewStore.restore()"
      >
        <!-- Icon -->
        <div class="w-6 h-6 rounded-full bg-sky-500/20 text-info flex items-center justify-center flex-shrink-0">
          <Eye class="w-3.5 h-3.5" />
        </div>

        <!-- Text Info -->
        <div class="flex items-center space-x-1.5 text-xs">
          <span class="font-medium text-dark-100">資料檢視</span>
          <span class="text-dark-400 font-mono text-xxs">
            #{{ dataViewStore.currentDisplayIndex }}
          </span>
          <Tag
            v-if="dataViewStore.filterText"
            value="過濾中"
            severity="warn"
            class="!text-xxs !font-medium !py-0 !px-1.5"
          />
        </div>

        <!-- Actions -->
        <div class="flex items-center space-x-0.5 pl-1 border-l border-dark-700" @click.stop>
          <Button
            type="button"
            icon="pi pi-window-maximize"
            severity="secondary"
            text
            rounded
            size="small"
            v-tooltip.top="'還原檢視視窗'"
            class="!w-6 !h-6 !p-0 hover:text-info"
            @click="dataViewStore.restore()"
          />
          <Button
            type="button"
            icon="pi pi-times"
            severity="secondary"
            text
            rounded
            size="small"
            v-tooltip.top="'關閉'"
            class="!w-6 !h-6 !p-0 hover:text-danger"
            @click="dataViewStore.closeDataView()"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Eye } from 'lucide-vue-next';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { useDataViewStore } from '@/stores/dataViewStore';
import { useAiChatStore } from '@/stores/aiChatStore';

const dataViewStore = useDataViewStore();
const aiChatStore = useAiChatStore();

// AI 助手最小化膠囊同時顯示時，資料檢視膠囊向上堆疊避免重疊
const isAiPillVisible = computed(() => aiChatStore.isChatOpen && aiChatStore.isMinimized);
</script>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.animate-fade-in {
  animation: fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>
