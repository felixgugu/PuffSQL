<template>
  <Teleport to="body">
    <div
      v-if="store.isOpen"
      class="sq-scrim fixed inset-0 z-[9990] flex items-center justify-center"
      @click.self="handleBackdropClick"
    >
      <div
        class="sq-dialog-surface w-[92vw] max-w-5xl h-[80vh] max-h-[880px] bg-dark-850 flex flex-col overflow-hidden text-dark-100"
      >
        <!-- Header -->
        <div
          class="h-11 px-4 bg-dark-800 border-b border-dark-750 flex items-center justify-between flex-shrink-0 select-none"
        >
          <div class="flex items-center space-x-2.5 min-w-0">
            <div class="w-6 h-6 rounded-md bg-emerald-500/20 text-ok flex items-center justify-center flex-shrink-0">
              <Upload class="w-3.5 h-3.5" />
            </div>
            <span class="text-xs font-semibold truncate">{{ $t('tsvImportModal.title') }}</span>
            <SqChip
              v-if="targetLabel"
              tone="neutral"
              :label="targetLabel"
              class="font-mono max-w-[320px] truncate"
            />
            <span class="text-xxs text-dark-400">{{ $t('tsvImportModal.stepProgress', { step: store.step }) }}</span>
          </div>
          <SqButton
            type="button"
            tone="danger"
            :disabled="store.isImporting"
            :aria-label="store.isImporting ? $t('tsvImportModal.cannotCloseWhileImporting') : $t('tsvImportModal.closeTooltip')"
            v-tooltip.top="store.isImporting ? $t('tsvImportModal.cannotCloseWhileImporting') : $t('tsvImportModal.closeTooltip')"
            @click="store.close()"
          >
            <template #icon><X class="w-3.5 h-3.5" /></template>
          </SqButton>
        </div>

        <!-- Body -->
        <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
          <TsvImportSourceStep v-if="store.step === 1" @cancel="store.close()" @next="handleNext" />
          <TsvImportPreviewStep v-else @back="store.backToSource()" @cancel="store.close()" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { Upload } from '@/components/icons';
import SqButton from '@/components/ui/SqButton.vue';
import { X } from '@/components/icons';
import SqChip from '@/components/ui/SqChip.vue';
import TsvImportSourceStep from '@/components/modals/tsvImport/TsvImportSourceStep.vue';
import TsvImportPreviewStep from '@/components/modals/tsvImport/TsvImportPreviewStep.vue';
import { useTsvImportStore } from '@/stores/tsvImportStore';

const store = useTsvImportStore();

const targetLabel = computed(() => {
  const target = store.target;
  if (!target) return '';
  return `${target.database} · ${target.schema}.${target.table}`;
});

function handleBackdropClick() {
  if (store.isImporting) return;
  store.close();
}

async function handleNext() {
  await store.validate();
}

function handleKeydown(event: KeyboardEvent) {
  if (!store.isOpen || event.key !== 'Escape') return;
  if (store.isImporting) return;
  event.preventDefault();
  store.close();
}

onMounted(() => window.addEventListener('keydown', handleKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown));
</script>
