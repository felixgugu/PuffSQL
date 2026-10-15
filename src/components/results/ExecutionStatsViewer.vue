<template>
  <div class="w-full h-full flex flex-col bg-dark-900 text-dark-100 font-sans select-none overflow-hidden">
    <!-- Empty State -->
    <div
      v-if="!stats"
      class="flex-1 flex flex-col items-center justify-center p-6 text-center text-dark-400 space-y-3"
    >
      <div class="w-12 h-12 rounded-full bg-dark-800 border border-dark-700 flex items-center justify-center text-warn">
        <ChartColumn class="w-5 h-5" />
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
            <ChartColumn class="w-3 h-3" />
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
          <SqButton
            type="button"
            :label="$t('stats.aiAdvice')"
            size="sm"
            tone="accent"
            variant="outline"
            @click="requestAiStatsTuning"
            v-tooltip.top="$t('stats.aiAdviceTooltip')"
          >
            <template #icon><Sparkles class="w-3.5 h-3.5" /></template>
          </SqButton>

          <SqButton
            type="button"
            :label="$t('stats.copyReport')"
            size="sm"
            variant="outline"
            @click="copyStatsMarkdown"
            v-tooltip.top="$t('stats.copyReportTooltip')"
          >
            <template #icon><Copy class="w-3.5 h-3.5" /></template>
          </SqButton>

          <SqButton
            type="button"
            tone="danger"
            :aria-label="$t('stats.clearReportTooltip')"
            @click="queryStore.clearExecutionStats()"
            v-tooltip.top="$t('stats.clearReportTooltip')"
          >
            <template #icon><Trash2 class="w-3.5 h-3.5" /></template>
          </SqButton>
        </div>
      </div>

      <!-- 1. KPI Metric Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 flex-shrink-0">
        <!-- CPU Time -->
        <div class="bg-dark-850 border border-dark-750 rounded p-2.5 flex flex-col justify-between h-full">
            <div class="flex items-center justify-between text-dark-400 text-xxs">
              <span>{{ $t('stats.cpuTimeCard') }}</span>
              <Cpu class="w-3 h-3 text-warn" />
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
              <Clock class="w-3 h-3 text-info" />
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
              <Book class="w-3 h-3 text-ok" />
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
              <Database class="w-3 h-3 text-plan" />
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
              <HardDrive class="w-3 h-3 text-structure" />
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
      <!-- Inline note: one border + one tone, no card chrome (SPEC §7 訊息列) -->
      <div
        v-if="hasHighIoAlert"
        class="flex items-center gap-2 px-3 py-2 rounded border border-danger/30 bg-danger/8 text-danger text-xs"
      >
        <TriangleAlert class="w-3.5 h-3.5 flex-shrink-0" />
        <span>{{ $t('stats.highIoAlert') }}</span>
      </div>
      <div
        v-else-if="stats.totalLogicalReads > 0"
        class="flex items-center gap-2 px-3 py-2 rounded border border-ok/30 bg-ok/8 text-ok text-xs"
      >
        <CircleCheck class="w-3.5 h-3.5 flex-shrink-0" />
        <span>{{ $t('stats.healthyBanner', { ratio: stats.cacheHitRatio }) }}</span>
      </div>

      <!-- 3. Per-Table IO Breakdown Table -->
      <div class="bg-dark-850 border border-dark-750 rounded-md flex flex-col overflow-hidden flex-1 min-h-[160px]">
        <!-- Table Header -->
        <div class="h-8 px-3 bg-dark-800 border-b border-dark-750 flex items-center justify-between text-xs flex-shrink-0">
          <div class="flex items-center space-x-1.5 font-medium text-dark-200">
            <Table2 class="w-3 h-3 text-accent" />
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

        <!-- Per-table IO table: plain semantic table, sortable headers, hairline rows (SPEC §7) -->
        <div class="flex-1 overflow-auto font-mono text-xs">
          <table class="w-full border-collapse">
            <thead>
              <tr class="bg-dark-850 text-dark-400">
                <th
                  v-for="column in statColumns"
                  :key="column.key"
                  scope="col"
                  :aria-sort="ariaSortFor(column.key)"
                  :class="['h-7 px-3 border-b border-dark-700 font-sans font-medium whitespace-nowrap', column.align === 'right' ? 'text-right' : 'text-left']"
                >
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 hover:text-dark-100 transition-colors"
                    @click="toggleStatSort(column.key)"
                  >
                    {{ column.label }}
                    <component
                      :is="statSortDesc ? ChevronDown : ChevronUp"
                      v-if="statSortKey === column.key"
                      class="w-3 h-3"
                    />
                  </button>
                </th>
                <th scope="col" class="h-7 px-3 border-b border-dark-700 font-sans font-medium text-center whitespace-nowrap">
                  {{ $t('stats.statusCol') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="sortedTableStats.length === 0">
                <td :colspan="statColumns.length + 1" class="p-6 text-center text-dark-500 italic">
                  {{ $t('stats.noTableIo') }}
                </td>
              </tr>
              <tr
                v-for="data in sortedTableStats"
                :key="data.tableName"
                class="hover:bg-dark-800/60 transition-colors"
              >
                <td class="h-6 px-3 border-b border-dark-750 font-sans font-medium text-dark-200 truncate max-w-[240px]" :title="data.tableName">
                  {{ data.tableName }}
                </td>
                <td class="h-6 px-3 border-b border-dark-750 text-right">
                  <span :class="data.scanCount > 1 ? 'text-warn font-semibold' : 'text-dark-300'">
                    {{ data.scanCount }}
                  </span>
                </td>
                <td class="h-6 px-3 border-b border-dark-750 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <div class="w-16 bg-dark-750 h-1.5 overflow-hidden flex-shrink-0">
                      <div
                        class="h-full transition-all"
                        :class="data.isHighIo ? 'bg-danger' : 'bg-accent'"
                        :style="{ width: `${getLogicalPercent(data.logicalReads)}%` }"
                      />
                    </div>
                    <span :class="data.isHighIo ? 'text-danger font-semibold' : 'text-dark-200'">
                      {{ data.logicalReads.toLocaleString() }}
                    </span>
                  </div>
                </td>
                <td class="h-6 px-3 border-b border-dark-750 text-right text-dark-300">
                  {{ data.physicalReads.toLocaleString() }}
                </td>
                <td class="h-6 px-3 border-b border-dark-750 text-right text-dark-400">
                  {{ data.readAheadReads.toLocaleString() }}
                </td>
                <td class="h-6 px-3 border-b border-dark-750 text-right text-dark-400">
                  {{ data.lobLogicalReads.toLocaleString() }}
                </td>
                <td class="h-6 px-3 border-b border-dark-750 text-right font-medium text-dark-300">
                  {{ data.bytesFormatted }}
                </td>
                <td class="h-6 px-3 border-b border-dark-750 text-center">
                  <SqChip
                    :tone="data.isHighIo ? 'danger' : 'ok'"
                    :label="data.isHighIo ? 'High IO' : 'OK'"
                    class="font-medium"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 4. Session Wait Stats (If any wait events captured) -->
      <div v-if="stats.waitStats.length > 0" class="bg-dark-850 border border-dark-750 rounded-md p-2.5 flex flex-col space-y-2 flex-shrink-0">
        <div class="flex items-center space-x-1.5 text-xs font-medium text-dark-200">
          <Zap class="w-3 h-3 text-warn" />
          <span>{{ $t('stats.sessionWaitStats') }}</span>
        </div>

        <table class="w-full border-collapse font-mono text-xxs">
          <thead>
            <tr class="bg-dark-800 text-dark-400">
              <th scope="col" class="h-6 px-2 border-b border-dark-700 font-sans font-medium text-left">{{ $t('stats.waitTypeCol') }}</th>
              <th scope="col" class="h-6 px-2 border-b border-dark-700 font-sans font-medium text-right">{{ $t('stats.waitCountCol') }}</th>
              <th scope="col" class="h-6 px-2 border-b border-dark-700 font-sans font-medium text-right">{{ $t('stats.totalWaitTimeCol') }}</th>
              <th scope="col" class="h-6 px-2 border-b border-dark-700 font-sans font-medium text-right">{{ $t('stats.maxWaitTimeCol') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="wait in stats.waitStats" :key="wait.waitType">
              <td class="h-6 px-2 border-b border-dark-750 text-dark-300 font-semibold">{{ wait.waitType }}</td>
              <td class="h-6 px-2 border-b border-dark-750 text-right text-dark-400">{{ wait.waitingTasksCount }}</td>
              <td class="h-6 px-2 border-b border-dark-750 text-right text-warn font-semibold">{{ wait.waitTimeMs }} ms</td>
              <td class="h-6 px-2 border-b border-dark-750 text-right text-dark-400">{{ wait.maxWaitTimeMs }} ms</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import SqButton from '@/components/ui/SqButton.vue';
import { Book, ChartColumn, Clock, Copy, Cpu, Database, HardDrive, Sparkles, Table2, Trash2, Zap } from '@/components/icons';
import SqChip from '@/components/ui/SqChip.vue';
import { CircleCheck, TriangleAlert } from '@/components/icons';
import SqInput from '@/components/ui/SqInput.vue';
import { Search } from '@/components/icons';
import { ChevronDown, ChevronUp } from '@/components/icons';
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

/** Column sorting for the per-table IO table: one key + one direction, no PrimeVue DataTable. */
type TableStatSortKey =
  | 'tableName'
  | 'scanCount'
  | 'logicalReads'
  | 'physicalReads'
  | 'readAheadReads'
  | 'lobLogicalReads'
  | 'bytesFormatted';

const statSortKey = ref<TableStatSortKey>('logicalReads');
const statSortDesc = ref(true);

/** Header definitions for the per-table IO table. */
const statColumns: Array<{ key: TableStatSortKey; label: string; align: 'left' | 'right' }> = [
  { key: 'tableName', label: t('stats.tableNameCol'), align: 'left' },
  { key: 'scanCount', label: t('stats.scanCountCol'), align: 'right' },
  { key: 'logicalReads', label: t('stats.logicalReadsRatioCol'), align: 'right' },
  { key: 'physicalReads', label: t('stats.physicalReadsCol'), align: 'right' },
  { key: 'readAheadReads', label: t('stats.readAheadCol'), align: 'right' },
  { key: 'lobLogicalReads', label: t('stats.lobReadsCol'), align: 'right' },
  { key: 'bytesFormatted', label: t('stats.totalBytesCol'), align: 'right' },
];

function toggleStatSort(key: TableStatSortKey) {
  if (statSortKey.value === key) {
    statSortDesc.value = !statSortDesc.value;
    return;
  }
  statSortKey.value = key;
  // Text sorts ascending first; numbers start with the biggest offender on top.
  statSortDesc.value = key !== 'tableName' && key !== 'bytesFormatted';
}

function ariaSortFor(key: TableStatSortKey): 'ascending' | 'descending' | 'none' {
  if (statSortKey.value !== key) return 'none';
  return statSortDesc.value ? 'descending' : 'ascending';
}

const sortedTableStats = computed(() => {
  if (!stats.value?.tableStats) return [];
  let list = [...stats.value.tableStats];

  const q = tableFilterQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter((t) => t.tableName.toLowerCase().includes(q));
  }

  const key = statSortKey.value;
  list.sort((a, b) => {
    const left = a[key];
    const right = b[key];
    const result =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right));
    return statSortDesc.value ? -result : result;
  });

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
