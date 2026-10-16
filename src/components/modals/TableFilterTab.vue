<template>
  <div class="space-y-4">
    <!-- Header & Notice -->
    <div class="bg-dark-900 border border-dark-750 p-3.5 rounded space-y-1">
      <div class="flex items-center space-x-2">
        <EyeOff class="w-3.5 h-3.5 text-accent" />
        <span class="font-semibold text-dark-100 text-xs">物件過濾規則 (Database & Table Filter Rules)</span>
      </div>
      <p class="text-xxs text-dark-400 leading-relaxed">
        設定符合條件的正規表示法（不區分大小寫），符合的資料庫或資料表將自側邊欄「物件總管」與「物件快搜」中隱藏。
        可指定套用目標為「全部」、「僅資料庫」或「僅資料表」，支援匹配資料庫名（如 <code class="text-dark-300">tempdb</code>）、表名（如 <code class="text-dark-300">bak_Users</code>）與全名（如 <code class="text-dark-300">dbo.bak_Users</code>）。
      </p>
    </div>

    <!-- Add Custom Rule Form -->
    <div class="bg-dark-900 border border-dark-800 rounded p-3 space-y-2">
      <div class="text-xxs font-medium text-dark-300">新增自訂規則 (Add Custom Rule)</div>
      <div class="grid grid-cols-12 gap-2 items-center">
        <!-- Target Scope Selector -->
        <div class="col-span-3">
          <SqSelect
            v-model="newTarget"
            :options="targetOptions"
            option-label="label"
            option-value="value"
            size="sm"
            class="w-full"
          />
        </div>

        <!-- Pattern Input -->
        <div class="col-span-4">
          <SqInput
            v-model="newPattern"
            type="text"
            placeholder="正規表示式 (例: ^(master|tempdb)$)"
            size="sm"
            @keydown.enter="handleAddRule"
            :invalid="!!patternError"
            class="w-full font-mono"
          />
        </div>

        <!-- Description Input -->
        <div class="col-span-3">
          <SqInput
            v-model="newDescription"
            type="text"
            placeholder="說明備註 (選填，例: 系統庫)"
            size="sm"
            @keydown.enter="handleAddRule"
            class="w-full"
          />
        </div>

        <!-- Add Button -->
        <div class="col-span-2">
          <SqButton
            type="button"
            label="新增"
            tone="accent"
            variant="solid"
            class="w-full"
            @click="handleAddRule"
            :disabled="!newPattern.trim() || !!patternError"
          >
            <template #icon><Plus class="w-3.5 h-3.5" /></template>
          </SqButton>
        </div>
      </div>
      <div v-if="patternError" class="text-danger text-xxs flex items-center space-x-1">
        <TriangleAlert class="w-3 h-3 flex-shrink-0" />
        <span>{{ patternError }}</span>
      </div>
    </div>

    <!-- Active Rules List -->
    <div class="space-y-1.5">
      <div class="flex items-center justify-between text-xxs font-medium text-dark-300">
        <span>已設定的過濾規則 ({{ settingsStore.hiddenTableRules.length }})</span>
        <span v-if="settingsStore.hiddenTableRules.length > 0" class="text-dark-500 text-xxs">勾選以啟用 / 取消勾選停用</span>
      </div>

      <div class="max-h-80 overflow-y-auto space-y-1.5 pr-1">
        <div
          v-if="settingsStore.hiddenTableRules.length === 0"
          class="py-6 text-center text-dark-500 text-xxs border border-dashed border-dark-800 rounded bg-dark-900/40"
        >
          目前尚未設定任何隱藏規則，所有資料庫與資料表皆正常顯示。
        </div>

        <div
          v-for="rule in settingsStore.hiddenTableRules"
          :key="rule.id"
        >
          <!-- Editing Mode -->
          <div
            v-if="editingRuleId === rule.id"
            class="px-3 py-2 bg-dark-850 border border-brand-500/60 rounded space-y-2"
          >
            <div class="grid grid-cols-12 gap-2 items-center">
              <!-- Target Scope Selector -->
              <div class="col-span-3">
                <SqSelect
                  v-model="editTarget"
                  :options="targetOptions"
                  option-label="label"
                  option-value="value"
                  size="sm"
                  class="w-full"
                />
              </div>

              <!-- Pattern Input -->
              <div class="col-span-4">
                <SqInput
                  v-model="editPattern"
                  type="text"
                  placeholder="正規表示式"
                  size="sm"
                  @keydown.enter="saveEditing"
                  @keydown.esc="cancelEditing"
                  :invalid="!!editPatternError"
                  class="w-full font-mono"
                />
              </div>

              <!-- Description Input -->
              <div class="col-span-3">
                <SqInput
                  v-model="editDescription"
                  type="text"
                  placeholder="說明備註 (選填)"
                  size="sm"
                  @keydown.enter="saveEditing"
                  @keydown.esc="cancelEditing"
                  class="w-full"
                />
              </div>

              <!-- Action Buttons: Save & Cancel -->
              <div class="col-span-2 flex items-center justify-end space-x-1.5">
                <SqButton
                  type="button"
                  label="儲存"
                  tone="accent"
                  variant="solid"
                  @click="saveEditing"
                  :disabled="!!editPatternError"
                  v-tooltip.top="'儲存修改 (Enter)'"
                >
                  <template #icon><Check class="w-3.5 h-3.5" /></template>
                </SqButton>
                <SqButton
                  type="button"
                  aria-label="取消 (Esc)"
                  @click="cancelEditing"
                  v-tooltip.top="'取消 (Esc)'"
                >
                  <template #icon><X class="w-3.5 h-3.5" /></template>
                </SqButton>
              </div>
            </div>
            <div v-if="editPatternError" class="text-danger text-xxs flex items-center space-x-1">
              <TriangleAlert class="w-3 h-3 flex-shrink-0" />
              <span>{{ editPatternError }}</span>
            </div>
          </div>

          <!-- Normal Display Mode -->
          <div
            v-else
            @dblclick="startEditing(rule)"
            class="flex items-center justify-between px-3 py-2 bg-dark-900 border border-dark-800 rounded hover:border-dark-700 transition-colors group cursor-default"
            title="雙擊即可快速編輯"
          >
            <div class="flex items-center space-x-2.5 min-w-0">
              <SqCheckbox
                :model-value="rule.enabled"
                @update:model-value="settingsStore.toggleFilterRule(rule.id)"
                v-tooltip.top="'切換啟用/停用'"
              />
              <!-- Target Scope Badge -->
              <SqChip
                :tone="rule.target === 'database' ? 'warn' : rule.target === 'table' ? 'neutral' : 'plan'"
                :label="rule.target === 'database' ? '資料庫' : rule.target === 'table' ? '資料表' : '全部'"
                class="font-medium"
              />
              <!-- Pattern -->
              <span
                :class="[
                  'font-mono text-xs px-1.5 py-0.5 rounded border transition-colors',
                  rule.enabled
                    ? 'bg-brand-500/10 text-accent border-brand-500/20'
                    : 'bg-dark-800 text-dark-500 border-dark-750 line-through'
                ]"
              >
                {{ rule.pattern }}
              </span>
              <!-- Description -->
              <span
                v-if="rule.description"
                :class="['text-xxs truncate', rule.enabled ? 'text-dark-400' : 'text-dark-500']"
              >
                {{ rule.description }}
              </span>
            </div>

            <!-- Actions: Edit & Delete -->
            <div class="flex items-center space-x-1 flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
              <SqButton
                type="button"
                :aria-label="'編輯此規則 (雙擊亦可)'"
                @click="startEditing(rule)"
                v-tooltip.top="'編輯此規則 (雙擊亦可)'"
              >
                <template #icon><Pencil class="w-3.5 h-3.5" /></template>
              </SqButton>
              <SqButton
                type="button"
                tone="danger"
                aria-label="刪除此規則"
                @click="settingsStore.removeFilterRule(rule.id)"
                v-tooltip.top="'刪除此規則'"
              >
                <template #icon><Trash2 class="w-3.5 h-3.5" /></template>
              </SqButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Live Regex Tester -->
    <div class="bg-dark-900 border border-dark-800 rounded p-3 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-xxs font-medium text-dark-300 flex items-center space-x-1.5">
          <Filter class="w-3 h-3 text-warn" />
          <span>即時比對測試器 (Live Tester)</span>
        </span>
        <span class="text-xxs text-dark-500">測試特定資料庫或資料表是否會被隱藏</span>
      </div>
      <div class="flex items-center space-x-2">
        <!-- Target Type for Tester -->
        <SqSegmented
          v-model="testTargetType"
          :options="testTargetOptions"
          size="sm"
          aria-label="測試目標類型"
        />

        <SqInput
          v-model="testName"
          type="text"
          :placeholder="testTargetType === 'database' ? '輸入資料庫名稱 (例: tempdb 或 DB_bak)' : '輸入資料表名稱 (例: bak_Orders 或 dbo.tmp_logs)'"
          size="sm"
          class="flex-1 font-mono"
        />
        <div v-if="testName.trim()" class="flex-shrink-0">
          <SqChip
            v-if="testResult.isHidden"
            tone="danger"
            :label="`將被隱藏 (符合: ${testResult.matchedPattern})`"
          >
            <template #icon>
              <EyeOff class="w-3 h-3" />
            </template>
          </SqChip>
          <SqChip
            v-else
            tone="ok"
            label="正常顯示 (Visible)"
          >
            <template #icon>
              <Eye class="w-3 h-3" />
            </template>
          </SqChip>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import SqSelect from '@/components/ui/SqSelect.vue';
import SqInput from '@/components/ui/SqInput.vue';
import SqButton from '@/components/ui/SqButton.vue';
import { Check, Filter, Pencil, Plus, Trash2, TriangleAlert, X } from '@/components/icons';
import SqCheckbox from '@/components/ui/SqCheckbox.vue';
import { Eye, EyeOff } from '@/components/icons';
import SqChip from '@/components/ui/SqChip.vue';
import SqSegmented from '@/components/ui/SqSegmented.vue';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  validateRegexPattern,
  type FilterRule,
  type FilterTarget,
} from '@/utils/tableFilter';

const settingsStore = useSettingsStore();

const targetOptions = [
  { label: '全部 (All: 庫與表)', value: 'all' as FilterTarget },
  { label: '僅資料庫 (Database)', value: 'database' as FilterTarget },
  { label: '僅資料表 (Table)', value: 'table' as FilterTarget },
];

const testTargetOptions = [
  { label: '測試資料庫', value: 'database' },
  { label: '測試資料表', value: 'table' },
];

const newTarget = ref<FilterTarget>('all');
const newPattern = ref('');
const newDescription = ref('');

// Inline editing state
const editingRuleId = ref<string | null>(null);
const editTarget = ref<FilterTarget>('all');
const editPattern = ref('');
const editDescription = ref('');

const editPatternError = computed(() => {
  const trimmed = editPattern.value.trim();
  if (!trimmed) return '規則不可為空';
  const val = validateRegexPattern(trimmed);
  return val.isValid ? '' : '正規表示法語法錯誤: ' + val.error;
});

function startEditing(rule: FilterRule) {
  editingRuleId.value = rule.id;
  editTarget.value = rule.target || 'all';
  editPattern.value = rule.pattern;
  editDescription.value = rule.description || '';
}

function cancelEditing() {
  editingRuleId.value = null;
}

function saveEditing() {
  if (editPatternError.value || !editingRuleId.value) return;
  settingsStore.updateFilterRule(editingRuleId.value, {
    pattern: editPattern.value.trim(),
    target: editTarget.value,
    description: editDescription.value.trim() || undefined,
  });
  editingRuleId.value = null;
}

const testTargetType = ref<'database' | 'table'>('database');
const testName = ref('');

const patternError = computed(() => {
  if (!newPattern.value.trim()) return '';
  const val = validateRegexPattern(newPattern.value);
  return val.isValid ? '' : '正規表示法語法錯誤: ' + val.error;
});

const testResult = computed(() => {
  const trimmed = testName.value.trim();
  if (!trimmed) return { isHidden: false };

  if (testTargetType.value === 'table') {
    const parts = trimmed.split('.');
    if (parts.length > 1) {
      const schema = parts[0];
      const table = parts.slice(1).join('.');
      return settingsStore.testFilterPattern(table, 'table', schema);
    }
    return settingsStore.testFilterPattern(trimmed, 'table');
  }

  return settingsStore.testFilterPattern(trimmed, 'database');
});

function handleAddRule() {
  if (patternError.value || !newPattern.value.trim()) return;
  settingsStore.addFilterRule(newPattern.value, newTarget.value, newDescription.value);
  newPattern.value = '';
  newDescription.value = '';
}
</script>

