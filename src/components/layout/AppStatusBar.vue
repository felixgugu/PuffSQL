<template>
  <footer class="h-6 bg-dark-900 border-t border-dark-700 flex items-center justify-between px-3 text-xxs text-dark-400 select-none flex-shrink-0 font-sans tabular-nums">
    <!--
      Left: the session id only. The connection and database pickers already sit top-left in the
      header, so repeating the same two names down here (with the server's host and port) just said
      the same thing twice in one window.
    -->
    <div class="flex items-center space-x-2.5">
      <div
        v-if="connectionStore.activeSpid"
        class="flex items-center space-x-1"
        :title="$t('statusBar.spid', { spid: connectionStore.activeSpid })"
      >
        <span class="text-dark-500">SPID:</span>
        <SqChip tone="neutral" :label="String(connectionStore.activeSpid)" class="font-mono font-medium" />
      </div>
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
