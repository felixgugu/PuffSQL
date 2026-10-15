<template>
  <div class="flex-1 min-h-0 flex flex-col">
    <div class="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
      <!-- Target table -->
      <section class="rounded-md border border-dark-700 bg-dark-900/60 p-3">
        <div class="flex items-center justify-between">
          <div class="text-xxs font-semibold text-dark-300 tracking-wide">{{ $t('tsvImportModal.targetTable') }}</div>
          <span v-if="store.isLoadingMetadata" class="text-xxs text-dark-400 flex items-center space-x-1">
            <Loader2 class="w-3 h-3 animate-spin" />
            <span>{{ $t('tsvImportModal.readingDefinitions') }}</span>
          </span>
        </div>
        <div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-mono">
          <span v-if="store.target?.connectionName" class="text-dark-300">
            {{ store.target.connectionName }}
          </span>
          <span class="text-dark-500">/</span>
          <span class="text-dark-200">{{ store.target?.database }}</span>
          <span class="text-dark-500">/</span>
          <span class="text-ok">
            {{ store.target?.schema }}.{{ store.target?.table }}
          </span>
        </div>
        <div v-if="store.metadataError" class="mt-2 text-xxs text-danger bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded px-2 py-1.5">
          {{ store.metadataError }}
        </div>
      </section>

      <!-- Data source -->
      <section class="rounded-md border border-dark-700 bg-dark-900/60 p-3 space-y-3">
        <div class="text-xxs font-semibold text-dark-300 tracking-wide">{{ $t('tsvImportModal.dataSource') }}</div>

        <div class="flex items-center space-x-2">
          <button
            type="button"
            class="px-3 py-1.5 rounded-md border text-xs transition-colors"
            :class="
              store.sourceMode === 'file'
                ? 'border-emerald-500/60 bg-emerald-500/15 text-ok'
                : 'border-dark-700 bg-dark-800 text-dark-300 hover:text-dark-100'
            "
            @click="store.setSourceMode('file')"
          >
            {{ $t('tsvImportModal.uploadFile') }}
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md border text-xs transition-colors"
            :class="
              store.sourceMode === 'paste'
                ? 'border-emerald-500/60 bg-emerald-500/15 text-ok'
                : 'border-dark-700 bg-dark-800 text-dark-300 hover:text-dark-100'
            "
            @click="store.setSourceMode('paste')"
          >
            {{ $t('tsvImportModal.pasteText') }}
          </button>
        </div>

        <!-- File picker -->
        <div v-if="store.sourceMode === 'file'" class="space-y-2">
          <div class="flex items-center space-x-2">
            <SqButton
              type="button"
              :label="$t('tsvImportModal.pickFileBtn')"
              size="sm"
              variant="outline"
              @click="pickFile"
            >
              <template #icon><ArrowUpFromLine class="w-3.5 h-3.5" /></template>
            </SqButton>
            <span v-if="store.fileName" class="text-xs font-mono text-dark-200 truncate">
              {{ store.fileName }}
            </span>
            <span v-else class="text-xxs text-dark-500">{{ $t('tsvImportModal.fileHint') }}</span>
          </div>
        </div>

        <!-- Paste textarea -->
        <textarea
          v-else
          :value="store.pastedText"
          rows="9"
          spellcheck="false"
          :placeholder="$t('tsvImportModal.pastePlaceholder')"
          class="w-full bg-dark-900 border border-dark-700 rounded-md p-2 text-xs font-mono text-dark-100 focus:outline-none focus:border-emerald-500/60 resize-none"
          @input="handlePasteInput"
        ></textarea>

        <div class="text-xxs text-dark-400 font-mono">
          {{ $t('tsvImportModal.currentSize', { size: formatBytes(sourceBytes) }) }}
        </div>

        <div v-if="localError" class="text-xxs text-danger bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded px-2 py-1.5">
          {{ localError }}
        </div>
      </section>

      <!-- Options -->
      <section class="rounded-md border border-dark-700 bg-dark-900/60 p-3 space-y-2">
        <div class="text-xxs font-semibold text-dark-300 tracking-wide">{{ $t('tsvImportModal.importSettings') }}</div>

        <label class="flex items-center space-x-2 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            class="accent-emerald-500"
            :checked="store.skipHeader"
            @change="store.setSkipHeader(($event.target as HTMLInputElement).checked)"
          />
          <span>{{ $t('tsvImportModal.skipHeader') }}</span>
        </label>

        <label
          class="flex items-center space-x-2 text-xs select-none"
          :class="store.manualIdentityAvailable ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'"
          :title="store.manualIdentityDisabledReason || ''"
        >
          <input
            type="checkbox"
            class="accent-emerald-500"
            :checked="store.manualIdentity"
            :disabled="!store.manualIdentityAvailable"
            @change="store.setManualIdentity(($event.target as HTMLInputElement).checked)"
          />
          <span>{{ $t('tsvImportModal.manualIdentity') }}</span>
        </label>

        <div class="text-xxs text-dark-400 pl-6">
          <template v-if="store.manualIdentityAvailable">
            {{ $t('tsvImportModal.manualIdentityEnabledDesc') }}
            <span v-if="store.identityColumnName" class="font-mono text-dark-200">
              （{{ store.identityColumnName }}）
            </span>
            {{ $t('tsvImportModal.manualIdentityUncheckedDesc') }}
          </template>
          <template v-else>{{ $t('tsvImportModal.manualIdentityUnavailable', { reason: store.manualIdentityDisabledReason }) }}</template>
        </div>

        <div
          v-if="store.identityInsertWarning"
          class="text-xxs text-warn bg-amber-500/15 border border-amber-500/30 rounded px-2 py-1.5"
        >
          {{ store.identityInsertWarning }}
        </div>
      </section>

      <!-- Expected columns -->
      <section class="rounded-md border border-dark-700 bg-dark-900/60 overflow-hidden">
        <div class="px-3 py-2 border-b border-dark-750 flex items-center justify-between">
          <div class="text-xxs font-semibold text-dark-300 tracking-wide">
            {{ $t('tsvImportModal.expectedColumns', { count: store.importColumns.length }) }}
          </div>
          <div class="text-xxs text-dark-500">{{ $t('tsvImportModal.generatedColumnsNotice') }}</div>
        </div>
        <div class="max-h-56 overflow-y-auto">
          <table class="w-full text-xxs">
            <thead class="bg-dark-850 text-dark-400 sticky top-0">
              <tr>
                <th class="text-left px-3 py-1.5 font-medium">{{ $t('tsvImportModal.colNum') }}</th>
                <th class="text-left px-3 py-1.5 font-medium">{{ $t('tsvImportModal.colName') }}</th>
                <th class="text-left px-3 py-1.5 font-medium">{{ $t('tsvImportModal.colType') }}</th>
                <th class="text-left px-3 py-1.5 font-medium">{{ $t('tsvImportModal.colRequired') }}</th>
                <th class="text-left px-3 py-1.5 font-medium">{{ $t('tsvImportModal.colNotes') }}</th>
              </tr>
            </thead>
            <tbody class="font-mono">
              <tr
                v-for="(column, idx) in store.importColumns"
                :key="column.name"
                class="border-t border-dark-800"
              >
                <td class="px-3 py-1.5 text-dark-500">{{ idx + 1 }}</td>
                <td class="px-3 py-1.5 text-dark-100">{{ column.name }}</td>
                <td class="px-3 py-1.5 text-dark-300">{{ column.fullType }}</td>
                <td class="px-3 py-1.5" :class="column.nullable ? 'text-dark-400' : 'text-warn'">
                  {{ column.nullable ? $t('tsvImportModal.nullable') : $t('tsvImportModal.notNull') }}
                </td>
                <td class="px-3 py-1.5 text-dark-400 font-sans">
                  <span v-if="column.isPrimaryKey" class="text-info">{{ $t('tsvImportModal.pk') }}</span>
                  <span v-if="column.isPrimaryKey && column.isIdentity"> · </span>
                  <span v-if="column.isIdentity" class="text-warn">
                    {{ $t('tsvImportModal.identityNote') }}
                  </span>
                  <span v-if="!column.isPrimaryKey && !column.isIdentity">—</span>
                </td>
              </tr>
              <tr v-if="store.importColumns.length === 0">
                <td colspan="5" class="px-3 py-3 text-center text-dark-500 font-sans">
                  {{ $t('tsvImportModal.noImportColumns') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- Footer -->
    <div class="h-12 px-4 border-t border-dark-750 bg-dark-850 flex items-center justify-end space-x-2 flex-shrink-0">
      <SqButton
        type="button"
        :label="$t('common.cancel')"
        @click="emit('cancel')"
      />
      <SqButton
        type="button"
        :label="store.isValidating ? $t('tsvImportModal.validatingBtn') : $t('tsvImportModal.nextBtn')"
        tone="accent"
        variant="solid"
        :loading="store.isValidating"
        :disabled="!store.canValidate || store.isValidating"
        v-tooltip.top="store.canValidate ? '' : $t('tsvImportModal.provideSourceHint')"
        @click="emit('next')"
      >
        <template #icon><ArrowRight class="w-3.5 h-3.5" /></template>
      </SqButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import SqButton from '@/components/ui/SqButton.vue';
import { ArrowRight, ArrowUpFromLine, Loader2 } from '@/components/icons';
import { checkUtf8File, openTsvFile } from '@/utils/fileStorage';
import { countUtf8Bytes, MAX_SOURCE_BYTES } from '@/utils/tsvImport';
import { useTsvImportStore } from '@/stores/tsvImportStore';

const { t } = useI18n();

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'next'): void;
}>();

const store = useTsvImportStore();
const localError = ref('');

const sourceBytes = computed(() => countUtf8Bytes(store.sourceText));

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function pickFile() {
  localError.value = '';
  const result = await openTsvFile();
  if (!result.opened || !result.fileName || result.content === undefined) return;

  const problem = checkUtf8File(result.content);
  if (problem) {
    localError.value = problem;
    return;
  }
  if (countUtf8Bytes(result.content) > MAX_SOURCE_BYTES) {
    localError.value = t('tsvImportModal.fileTooLarge');
    return;
  }
  store.setFile(result.fileName, result.content);
}

function handlePasteInput(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value;
  localError.value = '';
  if (countUtf8Bytes(value) > MAX_SOURCE_BYTES) {
    localError.value = t('tsvImportModal.pasteTooLarge');
    return;
  }
  store.setPastedText(value);
}
</script>
