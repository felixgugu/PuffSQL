<template>
  <div class="space-y-5">
    <!-- 提示卡片 -->
    <div
      class="p-3.5 rounded-lg border border-dark-700 bg-dark-850 flex items-start space-x-3 text-xs"
    >
      <i class="pi pi-sparkles text-base mt-0.5 text-plan" />
      <div class="space-y-1">
        <div class="font-semibold text-dark-100">AI SQL 助手自訂請求設定 (通用 cURL 範本)</div>
        <p class="text-dark-400 leading-relaxed text-xxs">
          您可以直接貼上任何 AI 廠商提供的標準 <code>curl</code> 請求範本。系統會自動替換 <code>&lt;token&gt;</code> 為您的 API Key，並在送出時將 <code>&lt;content&gt;</code> 自動替換與多輪追加至 <code>messages</code> 陣列中。
        </p>
      </div>
    </div>

    <!-- 1. API Key 設定 -->
    <div class="space-y-2 pb-4 border-b border-dark-800">
      <div class="flex items-center justify-between">
        <div>
          <label class="font-medium text-dark-100 block">API Key (Token) *</label>
          <span class="text-xxs text-dark-400">系統會自動將 cURL 中的 &lt;token&gt; 替換為此處填寫的金鑰</span>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <div class="relative flex-1">
          <InputText
            v-model="aiChatStore.config.apiKey"
            :type="showApiKey ? 'text' : 'password'"
            placeholder="請輸入 API Key (如 sk-...)"
            class="w-full !text-xs !bg-dark-900 !border-dark-750 font-mono pr-8"
          />
          <button
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-200 text-xs"
            @click="showApiKey = !showApiKey"
          >
            <i :class="showApiKey ? 'pi pi-eye-slash' : 'pi pi-eye'" />
          </button>
        </div>
        <Button
          label="測試連線 (Test)"
          icon="pi pi-bolt"
          severity="primary"
          size="small"
          class="!text-xs !py-1.5 flex-shrink-0"
          :loading="isTesting"
          :disabled="!aiChatStore.config.apiKey.trim() || isTesting"
          @click="handleTestConnection"
        />
      </div>

      <!-- 測試結果反饋 -->
      <div
        v-if="testResult"
        class="mt-2 p-2.5 rounded text-xs flex items-center space-x-2"
        :class="testResult.success ? 'bg-emerald-500/10 text-ok border border-emerald-500/30' : 'bg-rose-500/10 text-danger border border-rose-500/30'"
      >
        <i :class="testResult.success ? 'pi pi-check-circle text-ok' : 'pi pi-exclamation-triangle text-danger'" />
        <span class="flex-1 font-mono text-[11px]">{{ testResult.message }}</span>
      </div>
    </div>

    <!-- 2. cURL 請求初始內容 (Textarea) -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <div>
          <label class="font-medium text-dark-100 block">cURL 請求範本 (Request Template) *</label>
          <span class="text-xxs text-dark-400">支援貼上完整的 curl 命令；系統會保留自訂參數並維持多輪問答追加</span>
        </div>
        <Button
          label="還原預設範本"
          severity="secondary"
          text
          size="small"
          class="!text-xxs !p-0 hover:text-dark-100"
          @click="aiChatStore.resetCurlTemplate()"
        />
      </div>

      <Textarea
        v-model="aiChatStore.config.curlTemplate"
        rows="13"
        placeholder="請貼上完整的 curl 指令..."
        class="w-full !text-[11px] font-mono !bg-dark-900 !border-dark-750 !p-3 leading-relaxed !resize-y"
      />
    </div>

    <!-- 3. AI 請求記錄檔 (ai.log) -->
    <div class="pt-3 border-t border-dark-800 flex items-center justify-between">
      <div class="space-y-0.5">
        <div class="text-xs font-medium text-dark-200">AI 請求記錄檔 (ai.log)</div>
        <div class="text-xxs text-dark-400">每次發送 AI API 請求時自動記錄請求與回應內容，並於應用程式開啟時自動清空</div>
      </div>
      <Button
        label="開啟 ai.log"
        icon="pi pi-external-link"
        severity="secondary"
        size="small"
        class="!text-xs !py-1 flex-shrink-0"
        @click="handleOpenAiLog"
      />
    </div>

    <!-- 4. 快捷提問選項設定 (Quick Prompts) -->
    <div class="space-y-3 pt-4 border-t border-dark-800">
      <div class="flex items-center justify-between">
        <div>
          <label class="font-medium text-dark-100 block text-xs">快捷提問選項設定 (Quick Prompts)</label>
          <span class="text-xxs text-dark-400">自訂 AI SQL 智能助理的快捷提問按鈕，點選後會自動填入聊天輸入框</span>
        </div>
        <div class="flex items-center space-x-2">
          <Button
            label="還原預設選項"
            severity="secondary"
            text
            size="small"
            class="!text-xxs !p-0 hover:text-dark-100"
            @click="aiChatStore.resetQuickPrompts()"
          />
          <Button
            label="新增選項"
            icon="pi pi-plus"
            severity="primary"
            outlined
            size="small"
            class="!text-xs !py-1 !px-2.5 flex-shrink-0"
            @click="openAddPromptDialog"
          />
        </div>
      </div>

      <!-- 選項清單 -->
      <div class="space-y-2">
        <div
          v-for="item in aiChatStore.quickPrompts"
          :key="item.id"
          class="p-2.5 rounded-lg border border-dark-750 bg-dark-850/60 hover:border-dark-700 transition-colors flex items-start justify-between space-x-3"
        >
          <div class="flex-1 min-w-0 space-y-1">
            <div class="text-xs font-semibold text-plan font-sans">
              {{ item.label }}
            </div>
            <p class="text-[11px] text-dark-300 leading-relaxed break-words font-sans m-0">
              {{ item.prompt }}
            </p>
          </div>
          <div class="flex items-center space-x-1 flex-shrink-0 pt-0.5">
            <Button
              icon="pi pi-pencil"
              severity="secondary"
              text
              rounded
              size="small"
              v-tooltip.top="'修改此提示詞'"
              class="!w-6 !h-6 !p-0 hover:text-dark-100"
              @click="openEditPromptDialog(item)"
            />
            <Button
              icon="pi pi-trash"
              severity="secondary"
              text
              rounded
              size="small"
              v-tooltip.top="'刪除此選項'"
              class="!w-6 !h-6 !p-0 hover:text-danger"
              @click="handleDeletePrompt(item.id)"
            />
          </div>
        </div>

        <div
          v-if="aiChatStore.quickPrompts.length === 0"
          class="text-center py-6 border border-dashed border-dark-800 rounded-lg text-dark-400 text-xs"
        >
          尚無任何快捷提問選項，請點選上方「新增選項」或「還原預設選項」。
        </div>
      </div>
    </div>

    <!-- 新增 / 修改 快捷提問對話框 -->
    <Dialog
      v-model:visible="isPromptDialogVisible"
      :header="editingPromptId ? '修改快捷提問選項' : '新增快捷提問選項'"
      modal
      :class="dialogWindow.marker"
      :style="{ width: '520px' }"
      @show="dialogWindow.onShow"
      @hide="dialogWindow.onHide"
    >
      <div class="space-y-4 pt-2">
        <div class="space-y-1">
          <label class="text-xs font-medium text-dark-200 block">選項名稱 (按鈕標籤) *</label>
          <InputText
            v-model="promptForm.label"
            placeholder="例如：查詢最佳化、檢查死鎖風險..."
            class="w-full !text-xs !bg-dark-900 !border-dark-700"
          />
        </div>
        <div class="space-y-1">
          <label class="text-xs font-medium text-dark-200 block">提示詞內容 (Prompt) *</label>
          <Textarea
            v-model="promptForm.prompt"
            rows="5"
            placeholder="請輸入點選此快捷選項時，自動帶入聊天輸入框的提問內容..."
            class="w-full !text-xs !p-2.5 font-sans !bg-dark-900 !border-dark-700 leading-relaxed !resize-y"
          />
        </div>
      </div>
      <template #footer>
        <div class="flex items-center justify-end space-x-2 pt-2">
          <Button
            label="取消"
            severity="secondary"
            text
            size="small"
            class="!text-xs"
            @click="isPromptDialogVisible = false"
          />
          <Button
            label="儲存"
            icon="pi pi-check"
            severity="primary"
            size="small"
            class="!text-xs"
            :disabled="!promptForm.label.trim() || !promptForm.prompt.trim()"
            @click="savePromptDialog"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import Dialog from 'primevue/dialog';
import { useAiChatStore } from '@/stores/aiChatStore';
import { curlAiService } from '@/services/ai/curlAiService';
import { aiLoggerService } from '@/services/aiLoggerService';
import { useDialogWindow } from '@/composables/useDialogWindow';
import type { AiQuickPrompt } from '@/types/ai';

const aiChatStore = useAiChatStore();
const dialogWindow = useDialogWindow();

const showApiKey = ref(false);
const isTesting = ref(false);
const testResult = ref<{ success: boolean; message: string } | null>(null);

const isPromptDialogVisible = ref(false);
const editingPromptId = ref<string | null>(null);
const promptForm = reactive({
  label: '',
  prompt: '',
});

function openAddPromptDialog() {
  editingPromptId.value = null;
  promptForm.label = '';
  promptForm.prompt = '';
  isPromptDialogVisible.value = true;
}

function openEditPromptDialog(item: AiQuickPrompt) {
  editingPromptId.value = item.id;
  promptForm.label = item.label;
  promptForm.prompt = item.prompt;
  isPromptDialogVisible.value = true;
}

function handleDeletePrompt(id: string) {
  aiChatStore.deleteQuickPrompt(id);
}

function savePromptDialog() {
  const lbl = promptForm.label.trim();
  const pmt = promptForm.prompt.trim();
  if (!lbl || !pmt) return;

  if (editingPromptId.value) {
    aiChatStore.updateQuickPrompt(editingPromptId.value, lbl, pmt);
  } else {
    aiChatStore.addQuickPrompt(lbl, pmt);
  }
  isPromptDialogVisible.value = false;
}

async function handleTestConnection() {
  isTesting.value = true;
  testResult.value = null;
  try {
    const res = await curlAiService.testConnection(aiChatStore.config);
    testResult.value = res;
  } catch (err: unknown) {
    testResult.value = {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    isTesting.value = false;
  }
}

async function handleOpenAiLog() {
  try {
    await aiLoggerService.openAiLogFile();
  } catch (err) {
    console.warn('[AiSettingsTab] 開啟 ai.log 失敗:', err);
  }
}
</script>
