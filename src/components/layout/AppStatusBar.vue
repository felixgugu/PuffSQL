<template>
  <footer class="h-6 bg-dark-900 border-t border-dark-700 flex items-center justify-between px-3 text-xxs text-dark-400 select-none flex-shrink-0 font-sans tabular-nums">
    <!-- Left: Connection & Server Info -->
    <div class="flex items-center space-x-2.5">
      <div class="flex items-center space-x-1.5">
        <span
          :class="[
            'w-2 h-2 rounded-full',
            connectionStore.status === 'connected' ? 'bg-ok' : 'bg-danger'
          ]"
        />
        <span class="text-dark-200 font-medium">
          {{ connectionStore.activeConnection?.name ?? $t('statusBar.disconnected') }}
        </span>
        <span class="text-dark-500">({{ connectionStore.activeConnection?.host }}:{{ connectionStore.activeConnection?.port }})</span>
      </div>

      <div class="h-3 w-px bg-dark-750" />

      <div class="flex items-center space-x-1">
        <Database class="w-3 h-3 text-dark-400" />
        <span class="text-warn font-mono font-medium">{{ connectionStore.activeDatabase }}</span>
      </div>

      <template v-if="connectionStore.activeSpid">
        <div class="h-3 w-px bg-dark-750" />
        <div class="flex items-center space-x-1" :title="$t('statusBar.spid', { spid: connectionStore.activeSpid })">
          <span class="text-dark-500">SPID:</span>
          <SqChip tone="neutral" :label="String(connectionStore.activeSpid)" class="font-mono font-medium" />
        </div>
      </template>
    </div>

    <!-- Right: Metrics & Environment -->
    <div class="flex items-center space-x-3 font-mono">
      <div class="flex items-center space-x-1.5">
        <span class="text-dark-500">{{ $t('common.status') }}:</span>
        <template v-if="queryStore.isCancelling">
          <SqChip tone="danger" :label="$t('common.running')" class="font-medium" />
        </template>
        <template v-else-if="queryStore.isExecuting">
          <SqChip tone="warn" :label="`${$t('statusBar.executing')} (${formattedElapsedTime})`" class="font-medium" />
        </template>
        <template v-else>
          <SqChip tone="ok" :label="$t('statusBar.ready')" class="font-medium" />
        </template>
      </div>

      <div class="h-3 w-px bg-dark-750" />

      <div class="flex items-center space-x-1">
        <span class="text-dark-500">Engine:</span>
        <span class="text-dark-300">MS SQL Server</span>
      </div>

      <div class="h-3 w-px bg-dark-750" />

      <div class="flex items-center space-x-1">
        <span class="text-accent">PuffSQL v{{ appVersion }}</span>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Database } from 'lucide-vue-next';
import SqChip from '@/components/ui/SqChip.vue';
import { useConnectionStore } from '@/stores/connectionStore';
import { useQueryStore } from '@/stores/queryStore';

const connectionStore = useConnectionStore();
const queryStore = useQueryStore();
/** Injected from package.json at build time, so the version is declared in exactly one place. */
const appVersion = __APP_VERSION__;

const formattedElapsedTime = computed(() => {
  const totalSeconds = Math.floor(queryStore.elapsedExecutionMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
});
</script>
