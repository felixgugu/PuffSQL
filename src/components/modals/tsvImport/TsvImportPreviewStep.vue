<template>
  <div class="flex-1 min-h-0 flex flex-col">
    <div class="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
      <!-- Summary -->
      <section class="rounded-md border border-dark-700 bg-dark-900/60 p-3">
        <div class="text-xxs font-semibold text-dark-300 tracking-wide mb-2">{{ $t('tsvImportModal.importSummary') }}</div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <div class="text-xxs text-dark-400">{{ $t('tsvImportModal.targetTable') }}</div>
            <div class="font-mono text-dark-100 truncate">
              {{ store.target?.schema }}.{{ store.target?.table }}
            </div>
            <div class="text-xxs text-dark-500 font-mono truncate">
              {{ store.target?.database }}
            </div>
          </div>
          <div>
            <div class="text-xxs text-dark-400">{{ $t('tsvImportModal.source') }}</div>
            <div class="text-dark-100 truncate">{{ store.sourceLabel }}</div>
          </div>
          <div>
            <div class="text-xxs text-dark-400">{{ $t('tsvImportModal.estimatedImport') }}</div>
            <div class="text-dark-100 font-mono">
              {{ $t('tsvImportModal.recordsAndCols', { count: validRowsText, cols: store.importColumns.length }) }}
            </div>
          </div>
          <div>
            <div class="text-xxs text-dark-400">{{ $t('tsvImportModal.settings') }}</div>
            <div class="text-dark-200">
              {{ store.skipHeader ? $t('tsvImportModal.skippedHeaderLabel') : $t('tsvImportModal.notSkippedHeaderLabel') }} ·
              {{ store.manualIdentity ? $t('tsvImportModal.manualIdentityLabel') : $t('tsvImportModal.autoIdentityLabel') }}
            </div>
          </div>
        </div>
      </section>

      <!-- Identity warning (non blocking: the database reports the error) -->
      <div
        v-if="store.identityInsertWarning"
        class="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xxs text-warn"
      >
        {{ store.identityInsertWarning }}
      </div>

      <!-- Validation failures -->
      <section
        v-if="store.validation && store.validation.errors.length > 0"
        class="rounded-md border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/25 p-3 space-y-2"
      >
        <div class="flex items-center justify-between">
          <div class="text-xxs font-semibold text-danger">
            {{ $t('tsvImportModal.validationFailedTitle') }}
          </div>
          <div class="text-xxs text-danger font-mono">
            {{ $t('tsvImportModal.totalRows', { total: store.validation.totalRows.toLocaleString(), valid: store.validation.validRows.toLocaleString(), invalid: store.validation.invalidRows.toLocaleString() }) }}
          </div>
        </div>
        <div class="overflow-x-auto max-h-72 rounded border border-rose-200 dark:border-rose-900/50">
          <table class="w-full text-xxs">
            <thead class="bg-rose-100 dark:bg-rose-950/60 text-danger sticky top-0">
              <tr>
                <th class="text-left px-3 py-1.5 font-medium w-20">{{ $t('tsvImportModal.errLine') }}</th>
                <th class="text-left px-3 py-1.5 font-medium w-24">{{ $t('tsvImportModal.errColumnPos') }}</th>
                <th class="text-left px-3 py-1.5 font-medium w-40">{{ $t('tsvImportModal.errColumn') }}</th>
                <th class="text-left px-3 py-1.5 font-medium">{{ $t('tsvImportModal.errRawValue') }}</th>
                <th class="text-left px-3 py-1.5 font-medium w-56">{{ $t('tsvImportModal.errReason') }}</th>
              </tr>
            </thead>
            <tbody class="font-mono">
              <tr v-for="(error, idx) in displayedErrors" :key="idx" class="border-t border-rose-200 dark:border-rose-900/30">
                <td class="px-3 py-1.5 text-danger">{{ error.line }}</td>
                <td class="px-3 py-1.5 text-danger">
                  {{ error.columnPosition || '-' }}
                </td>
                <td class="px-3 py-1.5 text-danger truncate">{{ error.column }}</td>
                <td class="px-3 py-1.5 text-danger/90 truncate max-w-[280px]">
                  {{ error.rawValue === NULL_SENTINEL ? 'NULL' : error.rawValue }}
                </td>
                <td class="px-3 py-1.5 font-sans text-danger">
                  {{ error.reason }}：{{ error.detail }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="hiddenErrorCount > 0" class="text-xxs text-danger">
          {{ $t('tsvImportModal.hiddenErrorCount', { max: MAX_DISPLAYED_ERRORS, count: hiddenErrorCount.toLocaleString() }) }}
        </div>
      </section>

      <!-- Preview -->
      <section
        v-else-if="store.validation"
        class="rounded-md border border-dark-700 bg-dark-900/60 overflow-hidden"
      >
        <div class="px-3 py-2 border-b border-dark-750 flex items-center justify-between">
          <div class="text-xxs font-semibold text-dark-300 tracking-wide">
            {{ $t('tsvImportModal.dataPreviewTitle', { preview: store.validation.preview.length, total: store.validation.totalRows.toLocaleString() }) }}
          </div>
          <div class="text-xxs text-dark-500">{{ $t('tsvImportModal.passedNotice') }}</div>
        </div>
        <div class="overflow-auto max-h-72">
          <table class="text-xxs font-mono">
            <thead class="bg-dark-850 text-dark-400 sticky top-0">
              <tr>
                <th class="text-left px-2 py-1.5 font-medium border-r border-dark-750">{{ $t('tsvImportModal.rowColHeader') }}</th>
                <th
                  v-for="column in store.importColumns"
                  :key="column.name"
                  class="text-left px-2 py-1.5 font-medium border-r border-dark-750 whitespace-nowrap"
                  :title="`${column.name} (${column.fullType})`"
                >
                  {{ column.name }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in store.validation.preview" :key="row.line" class="border-t border-dark-800">
                <td class="px-2 py-1 text-dark-500 border-r border-dark-800">{{ row.line }}</td>
                <td
                  v-for="(cell, idx) in row.cells"
                  :key="idx"
                  class="px-2 py-1 border-r border-dark-800 max-w-[220px] truncate"
                  :class="cell === NULL_SENTINEL ? 'text-dark-500 italic' : 'text-dark-100'"
                >
                  {{ cell === NULL_SENTINEL ? 'NULL' : cell }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Import progress -->
      <section
        v-if="store.isImporting"
        class="rounded-md border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/20 p-3 space-y-2"
      >
        <div class="flex items-center justify-between text-xxs text-ok">
          <span class="flex items-center space-x-1.5">
            <Loader2 class="w-3 h-3 animate-spin" />
            <span>{{ $t('tsvImportModal.importingNotice') }}</span>
          </span>
          <span class="font-mono">
            {{ store.importProgress.processedRows.toLocaleString() }} /
            {{ store.importProgress.totalRows.toLocaleString() }}
          </span>
        </div>
        <div class="h-1.5 rounded-[3px] bg-dark-800 overflow-hidden">
          <div
            class="h-full bg-ok transition-all duration-150"
            :style="{ width: `${store.importProgressPercent}%` }"
          ></div>
        </div>
      </section>

      <!-- Import result -->
      <section
        v-if="store.importResult"
        class="rounded-md border p-3 space-y-2"
        :class="
          store.importResult.rolledBack
            ? 'border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/25'
            : 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/20'
        "
      >
        <template v-if="!store.importResult.rolledBack">
          <div class="text-xs text-ok">
            {{ $t('tsvImportModal.successInserted', { count: store.importResult.insertedCount.toLocaleString(), ms: store.importResult.executionTimeMs }) }}
          </div>
        </template>
        <template v-else>
          <div class="text-xs text-danger">
            {{ $t('tsvImportModal.failedNotice', { count: store.importResult.errors.length.toLocaleString() }) }}
          </div>
          <div class="overflow-x-auto max-h-56 rounded border border-rose-200 dark:border-rose-900/50">
            <table class="w-full text-xxs">
              <thead class="bg-rose-100 dark:bg-rose-950/60 text-danger sticky top-0">
                <tr>
                  <th class="text-left px-3 py-1.5 font-medium w-20">{{ $t('tsvImportModal.errLine') }}</th>
                  <th class="text-left px-3 py-1.5 font-medium w-40">{{ $t('tsvImportModal.errColumn') }}</th>
                  <th class="text-left px-3 py-1.5 font-medium">{{ $t('tsvImportModal.dbMessage') }}</th>
                </tr>
              </thead>
              <tbody class="font-mono">
                <tr
                  v-for="(error, idx) in store.importResult.errors.slice(0, MAX_DISPLAYED_ERRORS)"
                  :key="idx"
                  class="border-t border-rose-200 dark:border-rose-900/30"
                >
                  <td class="px-3 py-1.5 text-danger">{{ error.line || '-' }}</td>
                  <td class="px-3 py-1.5 text-danger">{{ error.column || '-' }}</td>
                  <td class="px-3 py-1.5 text-danger/90">{{ error.message }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>

      <div
        v-if="store.importError"
        class="rounded-md border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/25 p-3 text-xxs text-danger font-mono break-all"
      >
        {{ store.importError }}
      </div>
    </div>

    <!-- Footer -->
    <div class="h-12 px-4 border-t border-dark-750 bg-dark-850 flex items-center justify-between flex-shrink-0">
      <div class="text-xxs text-dark-500">
        <span v-if="store.hasBlockingErrors">{{ $t('tsvImportModal.hasErrorsCannotImport') }}</span>
        <span v-else-if="!store.importResult">{{ $t('tsvImportModal.appendModeNotice') }}</span>
      </div>
      <div class="flex items-center space-x-2">
        <SqButton
          type="button"
          :label="$t('tsvImportModal.backBtn')"
          :disabled="store.isImporting"
          @click="emit('back')"
        >
          <template #icon><ArrowLeft class="w-3.5 h-3.5" /></template>
        </SqButton>
        <SqButton
          type="button"
          :label="$t('common.cancel')"
          :disabled="store.isImporting"
          @click="emit('cancel')"
        />
        <SqButton
          v-if="!store.importResult || store.importResult.rolledBack"
          type="button"
          :label="store.isImporting ? $t('tsvImportModal.importingBtn') : $t('tsvImportModal.startImport')"
          tone="accent"
          variant="solid"
          :loading="store.isImporting"
          :disabled="!store.canImport"
          v-tooltip.top="store.hasBlockingErrors ? $t('tsvImportModal.fixValidationHint') : ''"
          @click="store.startImport()"
        >
          <template #icon><Database class="w-3.5 h-3.5" /></template>
        </SqButton>
        <SqButton
          v-else
          type="button"
          :label="$t('tsvImportModal.close')"
          tone="ok"
          variant="solid"
          @click="emit('cancel')"
        >
          <template #icon><Check class="w-3.5 h-3.5" /></template>
        </SqButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SqButton from '@/components/ui/SqButton.vue';
import { ArrowLeft, Check, Database, Loader2 } from '@/components/icons';
import { MAX_DISPLAYED_ERRORS, NULL_SENTINEL } from '@/utils/tsvImport';
import { useTsvImportStore } from '@/stores/tsvImportStore';

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'cancel'): void;
}>();

const store = useTsvImportStore();

const displayedErrors = computed(() =>
  (store.validation?.errors ?? []).slice(0, MAX_DISPLAYED_ERRORS)
);
const hiddenErrorCount = computed(() =>
  Math.max(0, (store.validation?.errors.length ?? 0) - MAX_DISPLAYED_ERRORS)
);
const validRowsText = computed(() => {
  const validation = store.validation;
  if (!validation) return '0';
  return (validation.errors.length > 0 ? validation.validRows : validation.totalRows).toLocaleString();
});
</script>
