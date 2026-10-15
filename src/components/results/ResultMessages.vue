<template>
  <div class="w-full h-full flex flex-col overflow-hidden font-mono text-xs">
    <!-- Subheader with Clear Action and Expand/Collapse All -->
    <div class="h-6 bg-dark-850 border-b border-dark-750 flex items-center justify-between px-3 text-xxs text-dark-400 select-none flex-shrink-0">
      <span>{{ $t('results.messagesInSession', { count: messages.length }) }}</span>
      <div class="flex items-center space-x-2">
        <SqButton
          v-if="hasErrorMessages"
          type="button"
          :label="$t('results.diagnoseLatestError')"
          size="sm"
          tone="accent"
          @click="handleDiagnoseLatestError"
          :v-tooltip.top="$t('results.diagnoseLatestErrorTooltip')"
        >
          <template #icon><Sparkles class="w-3.5 h-3.5" /></template>
        </SqButton>
        <span v-if="hasErrorMessages" class="text-dark-600">|</span>
        <SqButton
          type="button"
          :label="$t('results.physicalLog')"
          size="sm"
          @click="handleOpenLog"
          :v-tooltip.top="$t('results.openLogTooltip')"
        >
          <template #icon><FileText class="w-3.5 h-3.5" /></template>
        </SqButton>
        <span v-if="messages.length > 0" class="text-dark-600">|</span>
        <SqButton
          v-if="messages.length > 0"
          type="button"
          :label="isAllExpanded ? $t('common.collapseAll') : $t('common.expandAll')"
          size="sm"
          @click="toggleExpandAll"
        />
        <span v-if="messages.length > 0" class="text-dark-600">|</span>
        <SqButton
          v-if="messages.length > 0"
          type="button"
          :label="$t('common.clear')"
          size="sm"
          tone="danger"
          @click="$emit('clear')"
        />
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="messages.length === 0" class="flex-1 flex items-center justify-center text-dark-500 italic select-none">
      {{ $t('results.noMessages') }}
    </div>

    <!-- Messages List (Newest at the top) -->
    <div v-else class="flex-1 overflow-auto p-3 space-y-2 select-text" :style="flashVars">
      <div
        v-for="(msg, idx) in messages"
        :key="getMsgKey(msg, idx)"
        :class="[
          'p-2.5 rounded-md border flex flex-col space-y-1.5 transition-colors group',
          msg.level === 'error'
            ? 'bg-danger/8 border-danger/30 text-danger'
            : msg.level === 'warning'
            ? 'bg-warn/10 border-warn/30 text-warn'
            : 'bg-dark-850/60 border-dark-750 text-dark-200',
          { 'sq-message-flash': isFlashing(getMsgKey(msg, idx)) }
        ]"
      >
        <!-- Line 1: [序號][時間] 資訊與右上角操作按鈕 -->
        <div class="flex items-center justify-between text-xxs font-mono flex-shrink-0 gap-2">
          <div class="flex items-center space-x-2 flex-wrap min-w-0">
            <span class="text-accent font-bold font-mono">[{{ '#' + (msg.seq ?? (messages.length - idx)) }}]</span>
            <span class="text-dark-400 font-mono">[{{ formatTime(msg.timestamp) }}]</span>
            <SqChip
              :tone="msg.level === 'error' ? 'danger' : msg.level === 'warning' ? 'warn' : 'neutral'"
              :label="msg.level"
              class="uppercase tracking-wide font-semibold"
            />
            <span v-if="msg.code !== undefined && msg.code !== null" class="text-dark-400">
              Msg {{ msg.code }}
            </span>
            <span v-if="msg.lineNumber !== undefined && msg.lineNumber !== null" class="text-dark-400">
              Line {{ msg.lineNumber }}
            </span>
          </div>

          <!-- 右上角按鈕：AI 診斷、展開|收合 與 複製 -->
          <div class="flex items-center space-x-1 flex-shrink-0 select-none">
            <SqButton
              v-if="msg.level === 'error' || msg.level === 'warning'"
              type="button"
              :label="$t('results.aiDiagnose')"
              size="xs"
              tone="accent"
              class="font-medium"
              @click.stop="handleDiagnoseWithAi(msg)"
              :v-tooltip.top="$t('results.aiDiagnoseTooltip')"
            >
              <template #icon><Sparkles class="w-3 h-3" /></template>
            </SqButton>

            <SqButton
              type="button"
              size="sm"
              class="opacity-0 group-hover:opacity-100"
              :aria-label="isExpanded(getMsgKey(msg, idx)) ? $t('common.collapse') : $t('common.expand')"
              @click.stop="toggleExpand(getMsgKey(msg, idx))"
              :v-tooltip.top="isExpanded(getMsgKey(msg, idx)) ? $t('common.collapse') : $t('common.expand')"
            >
              <template #icon>
                <ChevronUp v-if="isExpanded(getMsgKey(msg, idx))" class="w-3.5 h-3.5" />
                <ChevronDown v-else class="w-3.5 h-3.5" />
              </template>
            </SqButton>

            <SqButton
              type="button"
              size="sm"
              class="opacity-0 group-hover:opacity-100"
              :aria-label="copiedKey === (msg.seq ?? idx) ? $t('common.copied') : $t('results.copyMessage')"
              @click.stop="copyMessage(msg.message, msg.seq ?? idx)"
              :v-tooltip.top="copiedKey === (msg.seq ?? idx) ? $t('common.copied') : $t('results.copyMessage')"
            >
              <template #icon>
                <Check v-if="copiedKey === (msg.seq ?? idx)" class="w-3.5 h-3.5 text-ok" />
                <Copy v-else class="w-3.5 h-3.5" />
              </template>
            </SqButton>
          </div>
        </div>

        <!-- Line 2: 執行訊息 (收合時為單行截斷二行高度，展開時為多行換行完整呈現) -->
        <div
          :class="[
            'font-mono select-text text-xs transition-all',
            isExpanded(getMsgKey(msg, idx))
              ? 'whitespace-pre-wrap leading-relaxed break-words'
              : 'truncate leading-normal'
          ]"
          :title="!isExpanded(getMsgKey(msg, idx)) ? msg.message : undefined"
        >
          {{ msg.message }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import SqButton from '@/components/ui/SqButton.vue';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Sparkles,
} from '@/components/icons';
import SqChip from '@/components/ui/SqChip.vue';
import type { SessionMessageItem, QueryMessage } from '@/types/query';
import type { SqlEditorTab } from '@/types/workspace';
import { queryService } from '@/services/queryService';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useAiChatStore } from '@/stores/aiChatStore';
import { useQueryStore } from '@/stores/queryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { transientHighlightColors } from '@/utils/highlightColor';

const props = defineProps<{
  messages: (SessionMessageItem | QueryMessage)[];
}>();

defineEmits<{
  (e: 'clear'): void;
}>();

const workspaceStore = useWorkspaceStore();
const aiChatStore = useAiChatStore();
const queryStore = useQueryStore();
const settingsStore = useSettingsStore();

const hasErrorMessages = computed(() => {
  return props.messages.some((m) => m.level === 'error');
});

function resolveMessageSql(msg: SessionMessageItem | QueryMessage): string {
  if (msg.sql && msg.sql.trim()) return msg.sql.trim();
  if (queryStore.activeResultTab?.sql) return queryStore.activeResultTab.sql.trim();
  if (workspaceStore.activeTab?.type === 'sql_editor') {
    return (workspaceStore.activeTab as SqlEditorTab).query?.trim() || '';
  }
  return '';
}

function handleDiagnoseWithAi(msg: SessionMessageItem | QueryMessage) {
  const sql = resolveMessageSql(msg);
  const db = workspaceStore.activeTab?.database || queryStore.activeResultTab?.database;
  aiChatStore.diagnoseError({
    message: msg.message,
    code: msg.code,
    lineNumber: msg.lineNumber,
    sql,
    database: db,
  });
}

function handleDiagnoseLatestError() {
  const latestError = props.messages.find((m) => m.level === 'error');
  if (latestError) {
    handleDiagnoseWithAi(latestError);
  }
}

async function handleOpenLog() {
  try {
    const path = await queryService.openQueryLogFile();
    workspaceStore.showToast(`已在預設編輯器開啟日誌：${path}`, 'info', 3000);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    workspaceStore.showToast(`開啟日誌檔失敗：${msg}`, 'error', 3500);
  }
}

const copiedKey = ref<string | number | null>(null);
let copyTimeout: ReturnType<typeof setTimeout> | null = null;

const expandedKeys = ref<Set<string | number>>(new Set());

function getMsgKey(msg: SessionMessageItem | QueryMessage, idx: number): string | number {
  return (msg as SessionMessageItem).id ?? msg.seq ?? idx;
}

/*
 * Messages that just arrived flash with the configured transient highlight colour, so a statement
 * that only produces messages (UPDATE / INSERT / DDL have no result grid) is as easy to spot as
 * an executed statement in the editor. Arrival is judged from the message's own stamp, so the
 * flash still happens when this panel is mounted only after the run switched the view here.
 */
/** A message may still flash while it arrived within this window. */
const FLASH_ARRIVAL_WINDOW_MS = 4000;
/** How long the wash itself stays on screen. */
const FLASH_DURATION_MS = 3000;
const flashingKeys = ref<Set<string | number>>(new Set());
/** Keys that already flashed (or arrived too long ago to flash): never flash twice. */
const flashedKeys = new Set<string | number>();
const flashTimers = new Map<string | number, ReturnType<typeof setTimeout>>();

/** Colour variables live on the list, so every flashed card inherits the same wash. */
const flashVars = computed(() => {
  const { background, border } = transientHighlightColors(
    settingsStore.editorHighlightColor || '#feffe0'
  );
  return { '--sq-flash-bg': background, '--sq-flash-border': border };
});

function isFlashing(key: string | number): boolean {
  return flashingKeys.value.has(key);
}

/** Keys of messages that arrived moments ago and have not flashed yet. */
function collectArrivals(): Array<string | number> {
  const now = Date.now();
  const keys: Array<string | number> = [];
  props.messages.forEach((msg, idx) => {
    const key = getMsgKey(msg, idx);
    if (flashedKeys.has(key)) return;
    const arrivedAt = (msg as SessionMessageItem).freshAt;
    if (typeof arrivedAt !== 'number' || now - arrivedAt > FLASH_ARRIVAL_WINDOW_MS) return;
    keys.push(key);
  });
  return keys;
}

function flashArrivals(): void {
  const keys = collectArrivals();
  if (keys.length === 0) return;

  const next = new Set(flashingKeys.value);
  for (const key of keys) {
    flashedKeys.add(key);
    next.add(key);
    const pending = flashTimers.get(key);
    if (pending) clearTimeout(pending);
    flashTimers.set(
      key,
      setTimeout(() => {
        flashTimers.delete(key);
        const current = new Set(flashingKeys.value);
        current.delete(key);
        flashingKeys.value = current;
      }, FLASH_DURATION_MS)
    );
  }
  flashingKeys.value = next;
}

// Messages that landed just before this list was mounted flash too; the watcher covers the ones
// that arrive while it stays open.
flashArrivals();
watch(() => props.messages.length, flashArrivals);

onBeforeUnmount(() => {
  flashTimers.forEach((timer) => clearTimeout(timer));
  flashTimers.clear();
});

function isExpanded(key: string | number): boolean {
  return expandedKeys.value.has(key);
}

function toggleExpand(key: string | number) {
  const next = new Set(expandedKeys.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedKeys.value = next;
}

const isAllExpanded = computed(() => {
  if (props.messages.length === 0) return false;
  return props.messages.every((msg, idx) => expandedKeys.value.has(getMsgKey(msg, idx)));
});

function toggleExpandAll() {
  if (isAllExpanded.value) {
    expandedKeys.value = new Set();
  } else {
    const next = new Set<string | number>();
    props.messages.forEach((msg, idx) => next.add(getMsgKey(msg, idx)));
    expandedKeys.value = next;
  }
}

async function copyMessage(text: string, key: string | number) {
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = key;
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      copiedKey.value = null;
    }, 1500);
  } catch (err) {
    console.error('Failed to copy message:', err);
  }
}

function formatTime(isoOrTime: string) {
  if (!isoOrTime) return '';
  try {
    const d = new Date(isoOrTime);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString();
    }
    return isoOrTime;
  } catch {
    return isoOrTime;
  }
}
</script>

<style scoped>
/*
 * The wash is painted by a pseudo-element behind the text, like the editor's line decoration, so
 * the card's own background and border keep their transcript colours untouched. It holds briefly,
 * then fades; the class itself is removed afterwards.
 */
.sq-message-flash {
  position: relative;
  isolation: isolate;
}

.sq-message-flash::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
  background-color: var(--sq-flash-bg);
  box-shadow: inset 2px 0 0 var(--sq-flash-border);
  animation: sqMessageFlash 2600ms ease-out forwards;
}

@keyframes sqMessageFlash {
  0% {
    opacity: 1;
  }
  35% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

/* Without the fade the wash simply stays until the class is dropped, then disappears. */
@media (prefers-reduced-motion: reduce) {
  .sq-message-flash::after {
    animation: none;
  }
}
</style>
