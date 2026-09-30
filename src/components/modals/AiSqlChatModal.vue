<template>
  <Teleport to="body">
    <!-- AI SQL Assistant Floating Window -->
    <div
      v-if="aiChatStore.isChatOpen && !aiChatStore.isMinimized"
      ref="panelRef"
      class="fixed z-[9995] flex flex-col font-sans select-none overflow-hidden"
      :class="[
        isMaximized
          ? 'inset-0 w-screen h-screen rounded-none'
          : 'sq-dialog-surface bg-dark-850'
      ]"
      :style="isMaximized ? { top: 0, left: 0, width: '100vw', height: '100vh', borderRadius: '0px' } : {
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        borderRadius: 'var(--p-dialog-border-radius, var(--p-overlay-modal-border-radius, var(--p-content-border-radius, 0.5rem)))',
      }"
    >
      <!-- Top Header / Drag Titlebar -->
      <div
        class="h-10 px-3 bg-dark-850 dark:bg-dark-900 border-b border-dark-750 dark:border-dark-700 flex items-center justify-between flex-shrink-0"
        :class="isMaximized ? 'cursor-default' : 'cursor-move'"
        @pointerdown="handleTitlePointerDown"
        @dblclick="toggleMaximize"
      >
        <div class="flex items-center space-x-2">
          <i
            class="pi pi-sparkles text-sm"
            :class="aiChatStore.isGenerating ? 'animate-spin text-plan' : 'text-plan'"
          />
          <span class="text-xs font-semibold text-dark-100">{{ $t('aiSqlChat.title') }}</span>
        </div>

        <!-- 視窗控制按鈕組 (點擊不觸發拖曳) -->
        <div class="flex items-center space-x-1" @pointerdown.stop>
          <Button
            icon="pi pi-file-edit"
            severity="secondary"
            text
            rounded
            size="small"
            v-tooltip.top="$t('aiSqlChat.openLogTooltip')"
            class="!w-7 !h-7 !p-0 hover:text-plan"
            @click="handleOpenAiLog"
          />
          <Button
            icon="pi pi-trash"
            severity="secondary"
            text
            rounded
            size="small"
            v-tooltip.top="$t('aiSqlChat.clearHistoryTooltip')"
            class="!w-7 !h-7 !p-0"
            @click="aiChatStore.clearHistory()"
          />
          <Button
            :icon="isMaximized ? 'pi pi-window-minimize' : 'pi pi-window-maximize'"
            severity="secondary"
            text
            rounded
            size="small"
            v-tooltip.top="isMaximized ? $t('aiSqlChat.restoreSizeTooltip') : $t('aiSqlChat.maximizeTooltip')"
            class="!w-7 !h-7 !p-0"
            @click="toggleMaximize"
          />
          <Button
            icon="pi pi-minus"
            severity="secondary"
            text
            rounded
            size="small"
            v-tooltip.top="$t('aiSqlChat.minimizeTooltip')"
            class="!w-7 !h-7 !p-0"
            @click="aiChatStore.toggleMinimize()"
          />
          <Button
            icon="pi pi-times"
            severity="secondary"
            text
            rounded
            size="small"
            v-tooltip.top="$t('aiSqlChat.closeTooltip')"
            class="!w-7 !h-7 !p-0 hover:text-danger"
            @click="aiChatStore.closeChat()"
          />
        </div>
      </div>

      <!-- Main Chat Body -->
      <div class="flex-1 flex flex-col overflow-hidden bg-dark-900">
        <!-- 附帶 SQL 標籤欄 -->
        <div
          v-if="aiChatStore.currentSql"
          class="flex items-center justify-between px-3 py-1.5 border-b border-dark-750 dark:border-dark-800 bg-dark-850/60 dark:bg-dark-850/80 text-xs flex-shrink-0 relative"
        >
          <!-- 懸浮觸發區 (mouseover 浮動顯示完整 SQL) -->
          <div
            class="relative flex items-center space-x-2 cursor-pointer group select-none"
            @mouseenter="isSqlHovered = true"
            @mouseleave="isSqlHovered = false"
          >
            <Tag
              :value="aiChatStore.isSelectionOnly ? $t('aiSqlChat.selectionOnlyTag') : $t('aiSqlChat.fullPageTag')"
              severity="info"
              class="!text-xxs !font-medium !py-0.5 !px-1.5 flex-shrink-0"
            />
            <span class="text-dark-300 group-hover:text-plan truncate max-w-[360px] font-mono transition-colors flex items-center gap-1">
              {{ sqlPreviewText }}
              <i class="pi pi-eye text-xxs text-dark-400 group-hover:text-plan ml-0.5" />
            </span>

            <!-- Mouseover 浮動完整 SQL 預覽視窗 -->
            <Transition name="fade">
              <div
                v-if="isSqlHovered"
                class="absolute left-0 top-full mt-1.5 z-[9999] w-[520px] max-h-80 flex flex-col rounded-lg border border-dark-600 bg-dark-900/95 dark:bg-dark-950/95 backdrop-blur shadow-2xl overflow-hidden pointer-events-auto select-text"
                @mouseenter="isSqlHovered = true"
                @mouseleave="isSqlHovered = false"
              >
                <!-- 浮動卡片標題列 -->
                <div class="px-3 py-1.5 bg-dark-800 border-b border-dark-700 flex items-center justify-between text-xxs text-dark-300 select-none">
                  <span class="font-semibold text-plan flex items-center gap-1.5">
                    <i class="pi pi-code text-xs text-plan" />
                    {{ $t('aiSqlChat.attachedSqlTitle', { count: sqlLineCount }) }}
                  </span>
                  <div class="flex items-center space-x-2">
                    <button
                      type="button"
                      class="text-dark-300 hover:text-ok transition-colors flex items-center gap-1 cursor-pointer"
                      @click.stop="copySql(aiChatStore.currentSql)"
                    >
                      <i class="pi pi-copy text-xxs" />{{ $t('aiSqlChat.copyBtn') }}
                    </button>
                  </div>
                </div>
                <!-- 浮動卡片程式碼區 -->
                <pre class="p-3 overflow-y-auto max-h-72 m-0 text-[11px] font-mono leading-relaxed bg-black/40 text-ok whitespace-pre-wrap break-all select-text font-medium"><code>{{ aiChatStore.currentSql }}</code></pre>
              </div>
            </Transition>
          </div>

          <Button
            icon="pi pi-times"
            severity="secondary"
            text
            rounded
            size="small"
            v-tooltip.top="$t('aiSqlChat.removeSqlTooltip')"
            class="!w-5 !h-5 !p-0"
            @click="aiChatStore.clearSqlContext()"
          />
        </div>

        <!-- 訊息列表 -->
        <div ref="messagesContainerRef" class="flex-1 overflow-y-auto p-4 space-y-4 text-xs select-text">
          <!-- 歡迎提示 -->
          <div
            v-if="aiChatStore.messages.length === 0"
            class="flex flex-col items-center justify-center h-full text-center p-6 space-y-3 opacity-80 select-none"
          >
            <div class="w-12 h-12 rounded-full flex items-center justify-center bg-dark-800 text-plan">
              <i class="pi pi-sparkles text-xl" />
            </div>
            <div>
              <h4 class="font-semibold text-sm text-dark-100">{{ $t('aiSqlChat.welcomeTitle') }}</h4>
              <p class="text-dark-400 mt-1 max-w-sm leading-relaxed text-xs">
                {{ $t('aiSqlChat.welcomeSub') }}
              </p>
            </div>
          </div>

          <!-- 對話項目 -->
          <template v-for="(msg, idx) in aiChatStore.messages" :key="msg.id || idx">
            <!-- 使用者訊息 -->
            <div v-if="msg.role === 'user'" class="flex flex-col items-end space-y-1">
              <div
                class="max-w-[85%] rounded-lg px-3.5 py-2.5 shadow-sm text-xs leading-relaxed"
                :style="{
                  backgroundColor: 'var(--p-primary-color, #3b82f6)',
                  color: 'var(--p-primary-contrast-color, #ffffff)',
                }"
              >
                <div v-if="msg.sqlContext" class="mb-2 pb-1.5 border-b border-white/20 opacity-90 font-mono text-[11px] truncate">
                  <i class="pi pi-code mr-1" />{{ $t('aiSqlChat.userSqlTag') }}{{ msg.sqlContext.slice(0, 50) }}...
                </div>
                <div class="whitespace-pre-wrap select-text font-sans">{{ msg.content }}</div>
              </div>
              <span class="text-xxs text-dark-400 font-mono px-1 font-medium">
                {{ formatTime(msg.timestamp) }}
              </span>
            </div>

            <!-- AI 助手訊息 -->
            <div v-else-if="msg.role === 'assistant'" class="flex flex-col items-start space-y-1">
              <div class="max-w-[95%] rounded-lg px-3.5 py-2.5 shadow-sm text-xs leading-relaxed border border-dark-750 bg-dark-850 dark:bg-dark-800 text-dark-200 select-text">
                <div class="prose prose-invert max-w-none">
                  <template v-for="(segment, sIdx) in parseMessageSegments(msg.content)" :key="sIdx">
                    <div
                      v-if="segment.type === 'text'"
                      class="ai-markdown-body font-sans text-xs leading-relaxed mb-2"
                      v-html="renderMarkdownToHtml(segment.value)"
                    />

                    <!-- SQL Code Block -->
                    <div v-else-if="segment.type === 'sql'" class="my-2.5 rounded border border-dark-700 bg-dark-900 overflow-hidden select-none">
                      <div class="flex items-center justify-between px-3 py-1 text-[11px] border-b border-dark-750 bg-dark-800 text-black dark:text-plan">
                        <span class="font-mono font-semibold text-black dark:text-plan">{{ $t('aiSqlChat.suggestionTitle') }}</span>
                        <div class="flex items-center space-x-1.5">
                          <Button
                            :label="$t('aiSqlChat.copyBtn')"
                            icon="pi pi-copy"
                            severity="secondary"
                            text
                            size="small"
                            class="!text-xxs !font-medium !py-0.5 !px-1.5 !h-6"
                            @click="copySql(segment.value)"
                          />
                          <Button
                            :label="$t('aiSqlChat.openToNewTab')"
                            icon="pi pi-external-link"
                            severity="primary"
                            size="small"
                            class="!text-xxs !font-medium !py-0.5 !px-2 !h-6"
                            @click="openInNewTab(segment.value)"
                          />
                        </div>
                      </div>
                      <pre class="p-3 overflow-x-auto text-[11px] font-mono leading-relaxed bg-black/30 m-0 select-text"><code>{{ segment.value }}</code></pre>
                    </div>
                  </template>
                </div>

                <div v-if="msg.tokensUsed" class="mt-2 pt-1 border-t border-dark-750 flex justify-end">
                  <span class="text-xxs text-dark-400 font-mono font-medium">
                    {{ $t('aiSqlChat.tokensUsed', { count: msg.tokensUsed }) }}
                  </span>
                </div>
              </div>
              <span class="text-xxs text-dark-400 font-mono px-1 font-medium">
                {{ formatTime(msg.timestamp) }}
              </span>
            </div>
          </template>

          <!-- 運算中進度列 -->
          <div v-if="aiChatStore.isGenerating" class="flex items-center space-x-2 py-2 text-dark-400">
            <ProgressBar mode="indeterminate" class="w-24 !h-1.5" />
            <span class="text-[11px]">{{ $t('aiSqlChat.analyzing', { seconds: aiChatStore.executionElapsedSeconds }) }}</span>
            <Button
              :label="$t('aiSqlChat.abortBtn')"
              icon="pi pi-stop-circle"
              severity="danger"
              text
              size="small"
              class="!text-xxs !font-medium !py-0 !px-1.5 !h-5 ml-1"
              @click="aiChatStore.cancelGeneration()"
            />
          </div>
        </div>

        <!-- 快捷提示詞晶片 (純文字無圖示，點選填入輸入框) -->
        <div class="px-3 py-1.5 border-t border-dark-750 bg-dark-850/80 flex items-center space-x-2 overflow-x-auto flex-shrink-0 select-none scrollbar-none">
          <span class="text-[11px] text-dark-400 flex-shrink-0">
            {{ $t('aiSqlChat.quickPromptsLabel') }}
          </span>
          <Button
            v-for="chip in aiChatStore.quickPrompts"
            :key="chip.id"
            :label="chip.label"
            size="small"
            severity="secondary"
            outlined
            class="!text-[11px] !py-0.5 !px-2 !rounded-full flex-shrink-0 hover:border-purple-400 hover:text-plan transition-colors"
            :disabled="aiChatStore.isGenerating"
            @click="handleSelectQuickPrompt(chip.prompt)"
          />
        </div>

        <!-- 輸入文字框區塊 -->
        <div class="p-3 border-t border-dark-750 bg-dark-850/90 flex-shrink-0 select-none">
          <div class="relative flex items-end space-x-2">
            <Textarea
              ref="inputTextareaRef"
              v-model="inputQuery"
              rows="2"
              auto-resize
              :placeholder="$t('aiSqlChat.inputPlaceholder')"
              class="w-full !text-xs !p-2.5 font-sans !resize-none !bg-dark-900 !border-dark-700"
              :disabled="aiChatStore.isGenerating"
              @keydown.enter.exact.prevent="handleSubmit"
            />
            <Button
              icon="pi pi-send"
              severity="primary"
              class="!h-9 !w-9 !p-0 flex-shrink-0"
              :loading="aiChatStore.isGenerating"
              :disabled="!inputQuery.trim() || aiChatStore.isGenerating"
              @click="handleSubmit"
            />
          </div>
        </div>
      </div>

      <!-- 8-Direction Resizers (僅在非最大化狀態顯示) -->
      <template v-if="!isMaximized">
        <!-- Corner resizers -->
        <div class="resize-handle top-left" @pointerdown.stop="startResize($event, 'tl')" />
        <div class="resize-handle top-right" @pointerdown.stop="startResize($event, 'tr')" />
        <div class="resize-handle bottom-left" @pointerdown.stop="startResize($event, 'bl')" />
        <div class="resize-handle bottom-right" @pointerdown.stop="startResize($event, 'br')" />
        <!-- Edge resizers -->
        <div class="resize-handle top" @pointerdown.stop="startResize($event, 't')" />
        <div class="resize-handle bottom" @pointerdown.stop="startResize($event, 'b')" />
        <div class="resize-handle left" @pointerdown.stop="startResize($event, 'l')" />
        <div class="resize-handle right" @pointerdown.stop="startResize($event, 'r')" />
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import Tag from 'primevue/tag';
import ProgressBar from 'primevue/progressbar';
import { useToast } from 'primevue/usetoast';
import { useAiChatStore } from '@/stores/aiChatStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { aiLoggerService } from '@/services/aiLoggerService';
import { renderMarkdownToHtml } from '@/utils/markdownRenderer';
import { useFloatingWindowDrag } from '@/composables/useFloatingWindowDrag';
import { useWindowResize } from '@/composables/useWindowResize';

const { t } = useI18n();
const aiChatStore = useAiChatStore();
const workspaceStore = useWorkspaceStore();
const toast = useToast();

async function handleOpenAiLog() {
  try {
    await aiLoggerService.openAiLogFile();
  } catch (err) {
    console.warn('[AiSqlChatModal] 開啟 ai.log 失敗:', err);
  }
}

const panelRef = ref<HTMLElement | null>(null);
const messagesContainerRef = ref<HTMLElement | null>(null);
const inputTextareaRef = ref<any>(null);
const inputQuery = ref('');
const isMaximized = ref(false);
const isSqlHovered = ref(false);

// 視窗定位與尺寸 (預設高度 80vh，靠右下角排列)
const size = reactive({
  width: 720,
  height: Math.round(window.innerHeight * 0.8),
});

const pos = reactive({
  top: Math.max(20, window.innerHeight - Math.round(window.innerHeight * 0.8) - 40),
  left: Math.max(20, window.innerWidth - 720 - 40),
});

function initPosition() {
  const initialH = Math.min(Math.round(window.innerHeight * 0.8), window.innerHeight - 60);
  const initialW = Math.min(740, window.innerWidth - 60);
  size.width = initialW;
  size.height = initialH;
  pos.top = Math.max(20, window.innerHeight - initialH - 35);
  pos.left = Math.max(20, window.innerWidth - initialW - 35);
}

// 監聽視窗開啟時，若位置超出螢幕則自動矯正
watch(
  () => aiChatStore.isChatOpen,
  (open) => {
    if (open) {
      if (pos.left + size.width > window.innerWidth || pos.top + size.height > window.innerHeight) {
        initPosition();
      }
    }
  }
);

function toggleMaximize() {
  isMaximized.value = !isMaximized.value;
}

// ========================
// 視窗拖曳移動邏輯 (Drag Move) — rubber-banded edges, spring settle, interruptible
// ========================
const { startDrag: handleTitlePointerDown, endDrag: stopWindowDrag } = useFloatingWindowDrag({
  pos,
  size,
  isLocked: () => isMaximized.value,
});

// ========================
// 8 向邊緣與角落流暢拉伸 (Resize)
// ========================
const { startResize, endResize: onPointerUpResize } = useWindowResize({
  pos,
  size,
  isLocked: () => isMaximized.value,
  minWidth: 420,
  minHeight: 320,
});

const sqlPreviewText = computed(() => {
  if (!aiChatStore.currentSql) return '';
  const lines = aiChatStore.currentSql.trim().split('\n');
  const firstLine = lines[0] ?? '';
  return `${t('aiSqlChat.sqlLinesCount', { count: lines.length })} ${firstLine.slice(0, 45)}...`;
});

const sqlLineCount = computed(() => {
  if (!aiChatStore.currentSql) return 0;
  return aiChatStore.currentSql.trim().split('\n').length;
});

function handleSelectQuickPrompt(prompt: string) {
  inputQuery.value = prompt;
  nextTick(() => {
    inputTextareaRef.value?.$el?.focus?.() || inputTextareaRef.value?.focus?.();
  });
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function parseMessageSegments(content: string): Array<{ type: 'text' | 'sql'; value: string }> {
  const segments: Array<{ type: 'text' | 'sql'; value: string }> = [];
  const regex = /```(?:sql)?\s*([\s\S]*?)```/gi;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: content.substring(lastIndex, match.index),
      });
    }
    const sqlCode = match[1] ?? '';
    segments.push({
      type: 'sql',
      value: sqlCode.trim(),
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      value: content.substring(lastIndex),
    });
  }

  return segments;
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainerRef.value) {
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight;
    }
  });
}

watch(
  () => aiChatStore.messages.length,
  () => {
    scrollToBottom();
  }
);

function handleSubmit() {
  if (!inputQuery.value.trim() || aiChatStore.isGenerating) return;
  const q = inputQuery.value;
  inputQuery.value = '';
  aiChatStore.askQuestion(q);
  scrollToBottom();
}

async function copySql(sqlText: string) {
  try {
    await navigator.clipboard.writeText(sqlText);
    toast.add({
      severity: 'success',
      summary: t('aiSqlChat.copySuccess'),
      detail: t('aiSqlChat.copySuccessDetail'),
      life: 2000,
    });
  } catch {
    toast.add({
      severity: 'error',
      summary: t('aiSqlChat.copyFailed'),
      detail: t('aiSqlChat.copyFailedDetail'),
      life: 2500,
    });
  }
}

function openInNewTab(sqlText: string) {
  workspaceStore.addSqlTab(sqlText, 'AI Generated');
  toast.add({
    severity: 'info',
    summary: t('aiSqlChat.tabOpened'),
    detail: t('aiSqlChat.tabOpenedDetail'),
    life: 2000,
  });
}

onMounted(() => {
  initPosition();
  window.addEventListener('resize', initPosition);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', initPosition);
  stopWindowDrag();
  onPointerUpResize();
});
</script>

<style scoped>
/* 8-Direction Resize Handles */
.resize-handle {
  position: absolute;
  z-index: 50;
}

/* Corners */
.resize-handle.top-left {
  top: 0;
  left: 0;
  width: 10px;
  height: 10px;
  cursor: nwse-resize;
}
.resize-handle.top-right {
  top: 0;
  right: 0;
  width: 10px;
  height: 10px;
  cursor: nesw-resize;
}
.resize-handle.bottom-left {
  bottom: 0;
  left: 0;
  width: 10px;
  height: 10px;
  cursor: nesw-resize;
}
.resize-handle.bottom-right {
  bottom: 0;
  right: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
}

/* Visual grip marks at bottom right corner */
.resize-handle.bottom-right::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 6px;
  height: 6px;
  border-right: 2px solid rgba(255, 255, 255, 0.35);
  border-bottom: 2px solid rgba(255, 255, 255, 0.35);
}

/* Edges */
.resize-handle.top {
  top: 0;
  left: 10px;
  right: 10px;
  height: 5px;
  cursor: ns-resize;
}
.resize-handle.bottom {
  bottom: 0;
  left: 10px;
  right: 14px;
  height: 5px;
  cursor: ns-resize;
}
.resize-handle.left {
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 5px;
  cursor: ew-resize;
}
.resize-handle.right {
  right: 0;
  top: 10px;
  bottom: 14px;
  width: 5px;
  cursor: ew-resize;
}
</style>
