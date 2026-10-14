<template>
  <div class="w-full h-full flex flex-col bg-dark-900 text-dark-100 font-sans select-none overflow-hidden">
    <!-- Empty State -->
    <div
      v-if="!stats"
      class="flex-1 flex flex-col items-center justify-center p-6 text-center text-dark-400 space-y-3"
    >
      <div class="w-12 h-12 rounded-full bg-dark-800 border border-dark-700 flex items-center justify-center text-warn">
        <i class="pi pi-chart-bar text-xl"></i>
      </div>
      <div class="space-y-1 max-w-md">
        <div class="text-sm font-medium text-dark-200">{{ $t('stats.noStats') }}</div>
        <div class="text-xs text-dark-500 leading-relaxed">
          {{ $t('stats.enableStatsHint') }}
        </div>
      </div>
    </div>

    <!-- Active Stats Dashboard -->
    <div v-else class="flex-1 flex flex-col overflow-y-auto p-3 space-y-3 font-sans">
      <!-- Top Bar: Timestamp, SQL info, Actions -->
      <div class="flex items-center justify-between border-b border-dark-750 pb-2 flex-shrink-0 text-xs">
        <div class="flex items-center space-x-2 truncate">
          <span class="flex items-center space-x-1.5 text-warn font-medium">
            <i class="pi pi-chart-bar text-xs"></i>
            <span>{{ $t('stats.reportTitle') }}</span>
          </span>
          <span class="text-dark-600">|</span>
          <span class="text-dark-400 font-mono text-xxs">{{ $t('stats.time') }}: {{ stats.executedAt }}</span>
          <span class="text-dark-600">|</span>
          <span class="text-dark-400 truncate max-w-xs font-mono text-xxs" :title="stats.querySql">
            SQL: {{ stats.querySql.replace(/\s+/g, ' ').slice(0, 60) }}...
          </span>
        </div>

        <div class="flex items-center space-x-1.5 flex-shrink-0">
          <Button
            type="button"
            icon="pi pi-sparkles"
            :label="$t('stats.aiAdvice')"
            size="small"
            severity="help"
            outlined
            @click="requestAiStatsTuning"
            v-tooltip.top="$t('stats.aiAdviceTooltip')"
            class="!text-xxs !py-1 !px-2 text-plan border-purple-500/40 hover:bg-purple-950/30"
          />

          <Button
            type="button"
            icon="pi pi-copy"
            :label="$t('stats.copyReport')"
            size="small"
            severity="secondary"
            outlined
            @click="copyStatsMarkdown"
            v-tooltip.top="$t('stats.copyReportTooltip')"
            class="!text-xxs !py-1 !px-2"
          />

          <Button
            type="button"
            icon="pi pi-trash"
            text
            rounded
            size="small"
            severity="danger"
            @click="queryStore.clearExecutionStats()"
            v-tooltip.top="$t('stats.clearReportTooltip')"
            class="!w-7 !h-7 !p-0"
          />
        </div>
      </div>

      <!-- 1. KPI Metric Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 flex-shrink-0">
        <!-- CPU Time -->
        <div class="bg-dark-850 border border-dark-750 rounded p-2.5 flex flex-col justify-between h-full">
            <div class="flex items-center justify-between text-dark-400 text-xxs">
              <span>{{ $t('stats.cpuTimeCard') }}</span>
              <i class="pi pi-microchip text-warn text-xs"></i>
            </div>
            <div class="mt-1 flex items-baseline space-x-1 font-mono">
              <span class="text-lg font-bold text-dark-100">{{ stats.cpuTimeMs }}</span>
              <span class="text-dark-400 text-xxs">ms</span>
            </div>
            <div class="text-xxs text-dark-500 font-mono mt-0.5 truncate leading-normal">
              {{ $t('stats.compile', { ms: stats.compileCpuTimeMs ?? 0 }) }}
            </div>
        </div>

        <!-- Elapsed Time -->
        <div class="bg-dark-850 border border-dark-750 rounded p-2.5 flex flex-col justify-between h-full">
            <div class="flex items-center justify-between text-dark-400 text-xxs">
              <span>{{ $t('stats.elapsedTimeCard') }}</span>
              <i class="pi pi-clock text-info text-xs"></i>
            </div>
            <div class="mt-1 flex items-baseline space-x-1 font-mono">
              <span class="text-lg font-bold text-dark-100">{{ stats.elapsedTimeMs }}</span>
              <span class="text-dark-400 text-xxs">ms</span>
            </div>
            <div class="text-xxs text-dark-500 font-mono mt-0.5 truncate leading-normal">
              {{ $t('stats.compile', { ms: stats.compileElapsedTimeMs ?? 0 }) }}
            </div>
        </div>

        <!-- Logical Reads -->
        <div class="bg-dark-850 border border-dark-750 rounded p-2.5 flex flex-col justify-between h-full">
            <div class="flex items-center justify-between text-dark-400 text-xxs">
              <span>{{ $t('stats.logicalReadsCard') }}</span>
              <i class="pi pi-book text-ok text-xs"></i>
            </div>
            <div class="mt-1 flex items-baseline space-x-1 font-mono">
              <span class="text-lg font-bold text-ok">{{ stats.totalLogicalReads.toLocaleString() }}</span>
              <span class="text-dark-400 text-xxs">{{ $t('stats.pages') }}</span>
            </div>
            <div class="text-xxs text-ok font-mono mt-0.5 truncate leading-normal">
              {{ $t('stats.size', { size: extractByteSize(stats.logicalReadsFormatted) }) }}
            </div>
        </div>

        <!-- Physical Reads -->
        <div class="bg-dark-850 border border-dark-750 rounded p-2.5 flex flex-col justify-between h-full">
            <div class="flex items-center justify-between text-dark-400 text-xxs">
              <span>{{ $t('stats.physicalReadsCard') }}</span>
              <i class="pi pi-server text-plan text-xs"></i>
            </div>
            <div class="mt-1 flex items-baseline space-x-1 font-mono">
              <span class="text-lg font-bold text-dark-100">{{ stats.totalPhysicalReads.toLocaleString() }}</span>
              <span class="text-dark-400 text-xxs">{{ $t('stats.pages') }}</span>
            </div>
            <div class="text-xxs text-dark-500 font-mono mt-0.5 truncate leading-normal">
              {{ $t('stats.readAhead', { count: stats.totalReadAheadReads }) }}
            </div>
        </div>

        <!-- Physical Writes & LOB -->
        <div class="bg-dark-850 border border-dark-750 rounded p-2.5 flex flex-col justify-between h-full">
            <div class="flex items-center justify-between text-dark-400 text-xxs">
              <span>{{ $t('stats.writesAndLobCard') }}</span>
              <i class="pi pi-database text-structure text-xs"></i>
            </div>
            <div class="mt-1 flex items-baseline space-x-1 font-mono">
              <span class="text-lg font-bold text-dark-100">{{ stats.totalPhysicalWrites.toLocaleString() }}</span>
              <span class="text-dark-400 text-xxs">{{ $t('stats.pagesWritten') }}</span>
            </div>
            <div class="text-xxs text-dark-500 font-mono mt-0.5 truncate leading-normal">
              {{ $t('stats.lobReads', { count: stats.totalLobReads }) }}
            </div>
        </div>
      </div>

      <!-- 2. Health Insight Banner -->
      <Message
        v-if="hasHighIoAlert"
        severity="error"
        :closable="false"
        class="!text-xs"
      >
        {{ $t('stats.highIoAlert') }}
      </Message>
      <Message
        v-else-if="stats.totalLogicalReads > 0"
        severity="success"
        :closable="false"
        class="!text-xs"
      >
        {{ $t('stats.healthyBanner', { ratio: stats.cacheHitRatio }) }}
      </Message>

      <!-- 3. Per-Table IO Breakdown Table -->
      <div class="bg-dark-850 border border-dark-750 rounded-lg flex flex-col overflow-hidden flex-1 min-h-[160px]">
        <!-- Table Header -->
        <div class="h-8 px-3 bg-dark-800/80 border-b border-dark-750 flex items-center justify-between text-xs flex-shrink-0">
          <div class="flex items-center space-x-1.5 font-medium text-dark-200">
            <i class="pi pi-table text-accent text-xs"></i>
            <span>{{ $t('stats.tableBreakdown') }}</span>
            <SqChip :label="stats.tableStats.length" tone="neutral" class="font-mono" />
          </div>

          <!-- Quick Filter Input -->
          <SqInput
            v-model="tableFilterQuery"
            :placeholder="$t('stats.filterTablesPlaceholder')"
            size="sm"
            class="w-40 font-mono"
          >
            <template #prefix>
              <Search class="w-3.5 h-3.5 text-dark-500" />
            </template>
          </SqInput>
        </div>

        <!-- DataTable -->
        <div class="flex-1 overflow-auto font-mono text-xs">
          <DataTable
            :value="sortedTableStats"
            size="small"
            class="p-datatable-sm w-full"
            :rowClass="() => '!bg-dark-900 hover:!bg-dark-800/80 transition-colors'"
          >
            <template #empty>
              <div class="p-6 text-center text-dark-500 italic text-xs">
                {{ $t('stats.noTableIo') }}
              </div>
            </template>
            <Column field="tableName" :header="$t('stats.tableNameCol')" sortable class="!py-1.5 !px-3 font-sans font-medium text-dark-200" />
            <Column field="scanCount" :header="$t('stats.scanCountCol')" sortable class="!py-1.5 !px-2 text-right">
              <template #body="{ data }">
                <span :class="data.scanCount > 1 ? 'text-warn font-bold' : 'text-dark-300'">
                  {{ data.scanCount }}
                </span>
              </template>
            </Column>
            <Column field="logicalReads" :header="$t('stats.logicalReadsRatioCol')" sortable class="!py-1.5 !px-3 text-right w-44">
              <template #body="{ data }">
                <div class="flex items-center justify-end space-x-2">
                  <div class="w-16 bg-dark-750 rounded-full h-1.5 overflow-hidden flex-shrink-0">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="data.isHighIo ? 'bg-rose-500' : 'bg-brand-400'"
                      :style="{ width: `${getLogicalPercent(data.logicalReads)}%` }"
                    />
                  </div>
                  <span :class="data.isHighIo ? 'text-danger font-bold' : 'text-dark-200'">
                    {{ data.logicalReads.toLocaleString() }}
                  </span>
                </div>
              </template>
            </Column>
            <Column field="physicalReads" :header="$t('stats.physicalReadsCol')" sortable class="!py-1.5 !px-2 text-right text-dark-300">
              <template #body="{ data }">
                {{ data.physicalReads.toLocaleString() }}
              </template>
            </Column>
            <Column field="readAheadReads" :header="$t('stats.readAheadCol')" sortable class="!py-1.5 !px-2 text-right text-dark-400">
              <template #body="{ data }">
                {{ data.readAheadReads.toLocaleString() }}
              </template>
            </Column>
            <Column field="lobLogicalReads" :header="$t('stats.lobReadsCol')" sortable class="!py-1.5 !px-2 text-right text-dark-400">
              <template #body="{ data }">
                {{ data.lobLogicalReads.toLocaleString() }}
              </template>
            </Column>
            <Column field="bytesFormatted" :header="$t('stats.totalBytesCol')" sortable class="!py-1.5 !px-2 text-right font-medium text-dark-300" />
            <Column :header="$t('stats.statusCol')" class="!py-1.5 !px-3 text-center">
              <template #body="{ data }">
                <SqChip
                  :tone="data.isHighIo ? 'danger' : 'ok'"
                  :label="data.isHighIo ? 'High IO' : 'OK'"
                  class="font-medium"
                />
              </template>
            </Column>
          </DataTable>
        </div>
      </div>

      <!-- 4. Session Wait Stats (If any wait events captured) -->
      <div v-if="stats.waitStats.length > 0" class="bg-dark-850 border border-dark-750 rounded-lg p-2.5 flex flex-col space-y-2 flex-shrink-0">
        <div class="flex items-center space-x-1.5 text-xs font-medium text-dark-200">
          <i class="pi pi-bolt text-warn text-xs"></i>
          <span>{{ $t('stats.sessionWaitStats') }}</span>
        </div>

        <DataTable
          :value="stats.waitStats"
          size="small"
          class="p-datatable-sm w-full font-mono text-xxs"
          :rowClass="() => '!bg-dark-900'"
        >
          <Column field="waitType" :header="$t('stats.waitTypeCol')" class="!py-1 !px-2 text-dark-300 font-semibold" />
          <Column field="waitingTasksCount" :header="$t('stats.waitCountCol')" class="!py-1 !px-2 text-right text-dark-400" />
          <Column field="waitTimeMs" :header="$t('stats.totalWaitTimeCol')" class="!py-1 !px-2 text-right text-warn font-bold">
            <template #body="{ data }">
              {{ data.waitTimeMs }} ms
            </template>
          </Column>
          <Column field="maxWaitTimeMs" :header="$t('stats.maxWaitTimeCol')" class="!py-1 !px-2 text-right text-dark-400">
            <template #body="{ data }">
              {{ data.maxWaitTimeMs }} ms
            </template>
          </Column>
        </DataTable>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import SqChip from '@/components/ui/SqChip.vue';
import Message from 'primevue/message';
import SqInput from '@/components/ui/SqInput.vue';
import { Search } from 'lucide-vue-next';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import { useQueryStore } from '@/stores/queryStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useAiChatStore } from '@/stores/aiChatStore';

const { t } = useI18n();
const queryStore = useQueryStore();
const workspaceStore = useWorkspaceStore();
const aiChatStore = useAiChatStore();

const stats = computed(() => queryStore.activeExecutionStats);
const tableFilterQuery = ref('');

function requestAiStatsTuning() {
  if (!stats.value) return;
  const s = stats.value;
  const db = workspaceStore.activeTab?.database || queryStore.activeResultTab?.database;
  aiChatStore.requestStatsAdvice({
    sql: s.querySql,
    cpuTimeMs: s.cpuTimeMs,
    elapsedTimeMs: s.elapsedTimeMs,
    compileCpuTimeMs: s.compileCpuTimeMs,
    compileElapsedTimeMs: s.compileElapsedTimeMs,
    totalLogicalReads: s.totalLogicalReads,
    logicalReadsFormatted: s.logicalReadsFormatted,
    totalPhysicalReads: s.totalPhysicalReads,
    cacheHitRatio: s.cacheHitRatio,
    tableStats: s.tableStats,
    waitStats: s.waitStats,
    database: db,
  });
}

const hasHighIoAlert = computed(() => {
  return stats.value?.tableStats.some((t) => t.isHighIo) ?? false;
});

const sortedTableStats = computed(() => {
  if (!stats.value?.tableStats) return [];
  let list = stats.value.tableStats;

  const q = tableFilterQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter((t) => t.tableName.toLowerCase().includes(q));
  }
  return list;
});

function getLogicalPercent(reads: number): number {
  if (!stats.value?.totalLogicalReads || stats.value.totalLogicalReads === 0) return 0;
  return Math.min(100, Math.round((reads / stats.value.totalLogicalReads) * 100));
}

function extractByteSize(formatted: string): string {
  const match = formatted.match(/\(([^)]+)\)/);
  return match?.[1] || formatted;
}

function copyStatsMarkdown() {
  if (!stats.value) return;
  const s = stats.value;

  let md = `### 📊 PuffSQL 執行效能分析報告\n\n`;
  md += `- **執行時間**: ${s.executedAt}\n`;
  md += `- **CPU 耗時**: ${s.cpuTimeMs} ms (編譯: ${s.compileCpuTimeMs ?? 0} ms)\n`;
  md += `- **總執行耗時**: ${s.elapsedTimeMs} ms\n`;
  md += `- **總邏輯讀取**: ${s.totalLogicalReads.toLocaleString()} 頁 (${s.logicalReadsFormatted})\n`;
  md += `- **總實體讀取**: ${s.totalPhysicalReads.toLocaleString()} 頁\n`;
  md += `- **快取命中率**: ${s.cacheHitRatio}%\n\n`;

  if (s.tableStats.length > 0) {
    md += `| 資料表名稱 | 掃描次數 | 邏輯讀取 | 實體讀取 | 預讀 | 總計容量 |\n`;
    md += `| :--- | :---: | :---: | :---: | :---: | :---: |\n`;
    for (const t of s.tableStats) {
      md += `| ${t.tableName} | ${t.scanCount} | ${t.logicalReads} | ${t.physicalReads} | ${t.readAheadReads} | ${t.bytesFormatted} |\n`;
    }
    md += `\n`;
  }

  if (s.waitStats.length > 0) {
    md += `#### 等候事件 (Wait Stats)\n\n`;
    md += `| 等候類型 | 等候次數 | 總等候時間 (ms) | 最大單次 (ms) |\n`;
    md += `| :--- | :---: | :---: | :---: |\n`;
    for (const w of s.waitStats) {
      md += `| ${w.waitType} | ${w.waitingTasksCount} | ${w.waitTimeMs} | ${w.maxWaitTimeMs} |\n`;
    }
    md += `\n`;
  }

  md += `\`\`\`sql\n${s.querySql}\n\`\`\`\n`;

  try {
    navigator.clipboard?.writeText(md);
    workspaceStore.showToast(t('stats.copiedToast'), 'success', 2500);
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
  }
}
</script>
