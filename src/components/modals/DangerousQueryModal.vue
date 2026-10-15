<template>
  <SqDialog
    :visible="isOpen"
    dismissable-mask
    :class="dialogWindow.marker"
    class="w-full max-w-lg"
    @show="dialogWindow.onShow"
    @hide="dialogWindow.onHide"
    @update:visible="val => !val && $emit('cancel')"
  >
    <template #header>
      <ShieldCheck v-if="step === 2" class="w-4 h-4 text-danger animate-pulse" />
      <TriangleAlert v-else class="w-4 h-4 text-warn" />
      <span>
        {{ step === 2 ? $t('dangerousQuery.step2Title') : $t('dangerousQuery.step1Title') }}
      </span>
    </template>

    <!-- Modal Body -->
    <div class="space-y-4 text-xs py-1">
      <!-- Target Environment & Database Info -->
      <div class="flex items-center space-x-2 text-xxs font-mono bg-dark-900 p-2 rounded border border-dark-750">
        <div class="flex items-center space-x-1 text-dark-300">
          <span class="text-dark-500">{{ $t('dangerousQuery.connLabel') }}</span>
          <span class="font-semibold text-dark-100">{{ connectionName }}</span>
        </div>
        <span class="text-dark-600">/</span>
        <div class="flex items-center space-x-1 text-dark-300">
          <span class="text-dark-500">{{ $t('dangerousQuery.dbLabel') }}</span>
          <span class="font-semibold text-dark-100">{{ databaseName }}</span>
        </div>
      </div>

      <!-- Step 1 Content -->
      <template v-if="step === 1">
        <!-- Detected Keywords List -->
        <div class="space-y-1.5">
          <div class="text-dark-300 flex items-center justify-between">
            <span>{{ $t('dangerousQuery.detectedTitle') }}</span>
            <span class="text-xxs text-dark-500 font-mono">{{ $t('dangerousQuery.keywordsCount', { count: detectedKeywords.length }) }}</span>
          </div>
          <div class="flex items-center flex-wrap gap-1.5">
            <SqChip
              v-for="kw in detectedKeywords"
              :key="kw"
              tone="warn"
              :label="kw"
              class="font-mono font-bold"
            />
          </div>
        </div>

        <!-- SQL Code Preview -->
        <div class="space-y-1">
          <div class="text-dark-400 text-xxs flex items-center space-x-1">
            <FileCode class="w-3 h-3" />
            <span>{{ $t('dangerousQuery.sqlPreview') }}</span>
          </div>
          <pre class="bg-dark-950 p-2.5 rounded border border-dark-800 font-mono text-xxs text-dark-200 overflow-auto max-h-32 whitespace-pre-wrap select-text leading-relaxed">{{ sql }}</pre>
        </div>

        <!-- Prompt description -->
        <p class="text-dark-300 leading-relaxed bg-amber-500/15 border border-amber-500/30 p-2.5 rounded text-xxs" v-html="$t('dangerousQuery.promptDesc', { connection: connectionName })">
        </p>
      </template>

      <!-- Step 2 Content -->
      <template v-else>
        <!-- Dangerous Alert Box -->
        <div class="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-600/60 p-3.5 rounded-md space-y-2 text-danger leading-relaxed">
          <div class="flex items-center space-x-2 text-danger font-bold text-xs">
            <Ban class="w-4 h-4 flex-shrink-0" />
            <span>{{ $t('dangerousQuery.dangerAlertTitle') }}</span>
          </div>
          <p class="text-xxs text-danger/90 leading-relaxed" v-html="$t('dangerousQuery.dangerAlertDesc', { connection: connectionName, database: databaseName, keywords: detectedKeywords.join('、') })">
          </p>
        </div>

        <div class="text-center py-1">
          <span class="text-xs font-semibold text-dark-100">
            {{ $t('dangerousQuery.confirmQuestion') }}
          </span>
        </div>
      </template>
    </div>

    <!-- Modal Footer -->
    <template #footer>
      <div class="flex items-center justify-between w-full pt-2">
        <SqButton
          type="button"
          :label="step === 2 ? $t('dangerousQuery.abort') : $t('dangerousQuery.cancel')"
          @click="$emit('cancel')"
        />

        <SqButton
          v-if="step === 1"
          type="button"
          :label="$t('dangerousQuery.proceedStep1')"
          tone="warn"
          variant="outline"
          @click="$emit('proceed')"
        >
          <template #icon><ArrowRight class="w-3.5 h-3.5" /></template>
        </SqButton>

        <SqButton
          v-else
          type="button"
          :label="$t('dangerousQuery.execute')"
          tone="danger"
          variant="solid"
          @click="$emit('proceed')"
        >
          <template #icon><TriangleAlert class="w-3.5 h-3.5" /></template>
        </SqButton>
      </div>
    </template>
  </SqDialog>
</template>

<script setup lang="ts">
import { ArrowRight, Ban, FileCode, ShieldCheck, TriangleAlert } from '@/components/icons';
import SqDialog from '@/components/ui/SqDialog.vue';
import SqButton from '@/components/ui/SqButton.vue';
import SqChip from '@/components/ui/SqChip.vue';
import { useDialogWindow } from '@/composables/useDialogWindow';

const dialogWindow = useDialogWindow();

defineProps<{
  isOpen: boolean;
  step: 1 | 2;
  connectionName: string;
  databaseName: string;
  detectedKeywords: string[];
  sql: string;
}>();

defineEmits<{
  (e: 'proceed'): void;
  (e: 'cancel'): void;
}>();
</script>
