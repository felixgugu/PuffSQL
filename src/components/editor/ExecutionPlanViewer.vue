<template>
  <div class="h-full flex flex-col bg-dark-900 overflow-hidden select-none">
    <!-- Top Toolbar -->
    <div class="h-10 bg-dark-850 border-b border-dark-700 px-3 flex items-center justify-between flex-shrink-0">
      <!-- Left: Title & Info -->
      <div class="flex items-center space-x-2 min-w-0">
        <div class="p-1 rounded bg-purple-500/15 text-plan border border-purple-500/30 flex-shrink-0">
          <Network class="w-3.5 h-3.5" />
        </div>
        <span class="font-medium text-xs text-dark-100 truncate">
          {{ tab.title }}
        </span>
        <SqChip
          v-if="tab.database"
          tone="neutral"
          class="font-mono"
        >
          {{ tab.database }}
        </SqChip>
        <span class="text-xxs text-dark-500 font-mono flex-shrink-0">
          {{ tab.executedAt }}
        </span>

        <!-- Toggle SQL Query Preview -->
        <SqButton
          type="button"
          size="sm"
          :tone="showSql ? 'accent' : 'neutral'"
          :variant="showSql ? 'solid' : 'outline'"
          :active="showSql"
          label="SQL"
          class="flex-shrink-0"
          @click="showSql = !showSql"
          v-tooltip.top="$t('executionPlan.viewSqlTooltip')"
        >
          <template #icon><FileCode class="w-3.5 h-3.5" /></template>
        </SqButton>
      </div>

      <!-- Right: View Mode, Zoom Controls, Copy & Download Actions -->
      <div class="flex items-center space-x-1.5 flex-shrink-0">
        <!-- View Mode Segmented Buttons -->
        <SqSegmented
          v-model="viewMode"
          :options="viewModeOptions"
          size="sm"
          aria-label="執行計畫檢視模式"
        />

        <!-- Zoom Controls (Only in Diagram mode) -->
        <div v-if="viewMode === 'diagram'" class="flex items-center rounded overflow-hidden border border-dark-700 bg-dark-800">
          <SqButton
            type="button"
            size="sm"
            :disabled="zoom <= 30"
            :aria-label="$t('executionPlan.zoomOutTooltip')"
            @click="zoomOut"
            v-tooltip.top="$t('executionPlan.zoomOutTooltip')"
          >
            <template #icon><ZoomOut class="w-3.5 h-3.5" /></template>
          </SqButton>
          <SqButton
            type="button"
            :label="`${zoom}%`"
            size="sm"
            class="font-mono min-w-[42px]"
            @click="resetZoom"
            v-tooltip.top="$t('executionPlan.zoomResetTooltip')"
          />
          <SqButton
            type="button"
            size="sm"
            :disabled="zoom >= 250"
            :aria-label="$t('executionPlan.zoomInTooltip')"
            @click="zoomIn"
            v-tooltip.top="$t('executionPlan.zoomInTooltip')"
          >
            <template #icon><ZoomIn class="w-3.5 h-3.5" /></template>
          </SqButton>
          <SqButton
            type="button"
            size="sm"
            :aria-label="$t('executionPlan.zoomFitTooltip')"
            @click="resetZoom"
            v-tooltip.top="$t('executionPlan.zoomFitTooltip')"
          >
            <template #icon><RefreshCw class="w-3.5 h-3.5" /></template>
          </SqButton>
        </div>

        <!-- Theme Switcher (Dark / Classic Light) -->
        <SqButton
          v-if="viewMode === 'diagram'"
          type="button"
          :label="planTheme === 'dark' ? $t('executionPlan.darkTheme') : $t('executionPlan.lightTheme')"
          size="sm"
          variant="outline"
          @click="togglePlanTheme"
          v-tooltip.top="planTheme === 'dark' ? $t('executionPlan.darkThemeTooltip') : $t('executionPlan.lightThemeTooltip')"
        >
          <template #icon>
            <Moon v-if="planTheme === 'dark'" class="w-3.5 h-3.5" />
            <Sun v-else class="w-3.5 h-3.5" />
          </template>
        </SqButton>

        <div class="h-4 w-px bg-dark-700 mx-0.5"></div>

        <!-- AI Plan Tuning Advice Button -->
        <SqButton
          type="button"
          :label="$t('executionPlan.aiAdvice')"
          size="sm"
          tone="accent"
          variant="outline"
          @click="requestAiPlanTuning"
          v-tooltip.top="$t('executionPlan.aiAdviceTooltip')"
        >
          <template #icon><Sparkles class="w-3.5 h-3.5" /></template>
        </SqButton>

        <!-- Copy Raw XML Button -->
        <SqButton
          type="button"
          :label="copied ? $t('executionPlan.copied') : $t('executionPlan.copyRawXml')"
          size="sm"
          variant="outline"
          @click="copyXml"
          v-tooltip.top="$t('executionPlan.copyRawXmlTooltip')"
        >
          <template #icon>
            <Check v-if="copied" class="w-3.5 h-3.5 text-ok" />
            <Copy v-else class="w-3.5 h-3.5" />
          </template>
        </SqButton>

        <!-- Save as .sqlplan File Button -->
        <SqButton
          type="button"
          size="sm"
          variant="outline"
          :aria-label="$t('executionPlan.saveSqlPlanTooltip')"
          @click="exportSqlPlanFile"
          v-tooltip.top="$t('executionPlan.saveSqlPlanTooltip')"
        >
          <template #icon><Download class="w-3.5 h-3.5" /></template>
        </SqButton>
      </div>
    </div>

    <!-- SQL Query Collapsible Drawer -->
    <div
      v-if="showSql && tab.querySql"
      class="bg-dark-850 border-b border-dark-700 px-4 py-2 flex items-start justify-between space-x-4 flex-shrink-0 text-xs select-text font-mono"
    >
      <div class="overflow-x-auto max-h-24 flex-1 text-dark-300 whitespace-pre-wrap leading-relaxed">
        {{ tab.querySql }}
      </div>
      <SqButton
        type="button"
        label="複製 SQL"
        size="sm"
        variant="outline"
        class="flex-shrink-0"
        @click="copySql"
        v-tooltip.top="'複製 SQL 語句'"
      >
        <template #icon><Copy class="w-3.5 h-3.5" /></template>
      </SqButton>
    </div>

    <!-- Main Content Area -->
    <div class="flex-1 relative overflow-hidden bg-dark-950 flex flex-col">
      <!-- Diagram View Mode -->
      <div
        v-show="viewMode === 'diagram'"
        class="w-full h-full flex flex-col relative overflow-hidden"
      >
        <!-- Loading State -->
        <div
          v-if="isRendering"
          class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-dark-900 space-y-2 text-dark-400 text-xs font-sans"
        >
          <RotateCw class="w-5 h-5 animate-spin text-plan" />
          <span>正在渲染執行計畫圖形...</span>
        </div>

        <!-- Render Error State -->
        <div
          v-if="renderError"
          class="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center space-y-3 bg-dark-900 text-dark-300 text-xs font-sans"
        >
          <div class="p-2 rounded-full bg-rose-500/20 text-danger">
            <AlertTriangle class="w-6 h-6" />
          </div>
          <div class="max-w-md">
            <h4 class="font-semibold text-dark-100 text-sm mb-1">圖形渲染失敗</h4>
            <p class="text-dark-400 text-xxs font-mono break-all mb-3">{{ renderError }}</p>
            <SqButton
              type="button"
              label="切換至原始 XML 模式檢視"
              tone="accent"
              variant="solid"
              @click="viewMode = 'xml'"
            />
          </div>
        </div>

        <!-- Diagram Scroll Canvas -->
        <div
          ref="scrollContainerRef"
          :class="[
            'flex-1 overflow-auto p-6 select-none plan-scroll-area',
            planTheme === 'dark' ? 'plan-scroll-dark' : 'plan-scroll-classic'
          ]"
        >
          <div
            class="plan-canvas-wrapper inline-block min-w-full"
            :style="{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top left',
              transition: 'transform 0.1s ease-out',
            }"
          >
            <!-- Diagram injection container -->
            <div
              ref="diagramContainerRef"
              :class="[
                'plan-render-canvas p-6 rounded-md shadow-xl inline-block min-w-[500px] transition-colors',
                planTheme === 'dark' ? 'theme-dark' : 'theme-classic'
              ]"
            />
          </div>
        </div>
      </div>

      <!-- Raw XML View Mode -->
      <div
        v-show="viewMode === 'xml'"
        class="w-full h-full flex flex-col overflow-hidden bg-dark-950 font-mono text-xs"
      >
        <div class="h-8 bg-dark-850 border-b border-dark-700 px-3 flex items-center justify-between text-xxs text-dark-400 flex-shrink-0">
          <div class="flex items-center space-x-2">
            <span>原始 ShowPlanXML 長度: {{ (tab.planXml.length / 1024).toFixed(1) }} KB</span>
            <span class="text-dark-600">|</span>
            <span>總行數: {{ xmlLines.length }} 行</span>
          </div>
          <div class="flex items-center space-x-2">
            <SqCheckbox v-model="wordWrap" id="xmlWordWrap">自動折行</SqCheckbox>
          </div>
        </div>

        <div class="flex-1 overflow-auto p-4 select-text">
          <pre
            :class="[
              'text-dark-200 font-mono text-xs leading-relaxed',
              wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
            ]"
          ><code>{{ formattedXmlContent }}</code></pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import SqButton from '@/components/ui/SqButton.vue';
import SqChip from '@/components/ui/SqChip.vue';
import SqSegmented from '@/components/ui/SqSegmented.vue';
import SqCheckbox from '@/components/ui/SqCheckbox.vue';
import {
  Network,
  RotateCw,
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileCode,
  Moon,
  RefreshCw,
  Sparkles,
  Sun,
  ZoomIn,
  ZoomOut,
} from '@/components/icons';
import type { ExecutionPlanTab } from '@/types/workspace';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAiChatStore } from '@/stores/aiChatStore';
import { formatXml } from '@/utils/planXmlParser';
import { savePlanToFile } from '@/utils/fileStorage';

const { t } = useI18n();

const viewModeOptions = computed(() => [
  { label: t('executionPlan.viewDiagram'), value: 'diagram' },
  { label: t('executionPlan.viewXml'), value: 'xml' },
]);

const props = defineProps<{
  tab: ExecutionPlanTab;
}>();

const workspaceStore = useWorkspaceStore();
const settingsStore = useSettingsStore();
const aiChatStore = useAiChatStore();

function requestAiPlanTuning() {
  aiChatStore.requestPlanAdvice({
    sql: props.tab.querySql,
    planXml: props.tab.planXml,
    durationMs: props.tab.durationMs,
    database: props.tab.database,
  });
}

const PLAN_THEME_STORAGE_KEY = 'sqlight_plan_theme';
const planTheme = ref<'dark' | 'classic'>(
  settingsStore.colorMode === 'light'
    ? 'classic'
    : (localStorage.getItem(PLAN_THEME_STORAGE_KEY) as 'dark' | 'classic') || 'dark'
);

// Watch for global colorMode changes to sync execution plan diagram
watch(
  () => settingsStore.colorMode,
  (mode) => {
    const target = mode === 'light' ? 'classic' : 'dark';
    if (planTheme.value !== target) {
      planTheme.value = target;
      nextTick(() => {
        if (viewMode.value === 'diagram' && isMounted) {
          renderPlan();
        }
      });
    }
  }
);

const viewMode = ref<'diagram' | 'xml'>('diagram');
const zoom = ref<number>(100);
const copied = ref<boolean>(false);
const showSql = ref<boolean>(false);
const wordWrap = ref<boolean>(true);
const isRendering = ref<boolean>(false);
const renderError = ref<string | null>(null);

const diagramContainerRef = ref<HTMLDivElement | null>(null);
const scrollContainerRef = ref<HTMLDivElement | null>(null);

function togglePlanTheme() {
  planTheme.value = planTheme.value === 'dark' ? 'classic' : 'dark';
  try {
    localStorage.setItem(PLAN_THEME_STORAGE_KEY, planTheme.value);
  } catch {
    // Ignore storage write errors
  }
  nextTick(() => {
    if (viewMode.value === 'diagram' && isMounted) {
      renderPlan();
    }
  });
}

// Formatted XML for Raw XML mode
const formattedXmlContent = computed(() => {
  return formatXml(props.tab.planXml);
});

const xmlLines = computed(() => {
  return formattedXmlContent.value.split('\n');
});

// Zoom Controls
function zoomIn() {
  if (zoom.value < 250) {
    zoom.value = Math.min(250, zoom.value + 15);
  }
}

function zoomOut() {
  if (zoom.value > 30) {
    zoom.value = Math.max(30, zoom.value - 15);
  }
}

function resetZoom() {
  zoom.value = 100;
}

// Copy XML to clipboard
async function copyXml() {
  try {
    await navigator.clipboard.writeText(props.tab.planXml);
    copied.value = true;
    workspaceStore.showToast('已複製原始 XML 執行計畫至剪貼簿', 'success', 2500);
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy XML:', err);
    workspaceStore.showToast('複製失敗，請手動選取 XML 複製', 'error');
  }
}

// Copy SQL to clipboard
async function copySql() {
  if (!props.tab.querySql) return;
  try {
    await navigator.clipboard.writeText(props.tab.querySql);
    workspaceStore.showToast('已複製 SQL 語句至剪貼簿', 'info', 2000);
  } catch (err) {
    console.error('Failed to copy SQL:', err);
  }
}

// Export as .sqlplan file (SSMS native format via Save File Picker)
async function exportSqlPlanFile() {
  try {
    const safeTitle = (props.tab.title || 'execution_plan')
      .replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
    const result = await savePlanToFile(props.tab.planXml, `${safeTitle}.sqlplan`);

    if (result.saved && result.fileName) {
      workspaceStore.showToast(`已成功儲存 .sqlplan 檔案至「${result.fileName}」`, 'success', 3000);
    }
  } catch (err) {
    console.error('Failed to export .sqlplan file:', err);
    workspaceStore.showToast('另存 .sqlplan 檔案失敗', 'error');
  }
}

// Dynamic rendering and native tooltip management
let isMounted = false;
let activeTooltip: HTMLElement | null = null;
let activeTarget: Element | null = null;
let hoverTimer: number | null = null;
const mousePos = { x: 0, y: 0 };

function handleMouseMove(e: MouseEvent) {
  mousePos.x = e.pageX;
  mousePos.y = e.pageY;
}

function getLineTooltip(polyline: Element, container: Element): HTMLElement | null {
  const nodeId = polyline.getAttribute('data-node-id');
  const xml = (container as any).xml as Document | undefined;
  if (!nodeId || !xml) return null;
  const relOp = xml.querySelector(`RelOp[NodeId="${nodeId}"]`);
  if (!relOp) return null;

  const actualRows = relOp.querySelector('RunTimeCountersPerThread')?.getAttribute('ActualRows');
  const actualRowsRead = relOp.querySelector('RunTimeCountersPerThread')?.getAttribute('ActualRowsRead');
  const estimatedRows = relOp.getAttribute('EstimateRows') || relOp.getAttribute('StatementEstRows');
  const estimatedRowSize = relOp.getAttribute('AvgRowSize');

  const div = document.createElement('div');
  div.className = 'qp-tt';
  let rowsHtml = '';
  if (actualRows != null) {
    rowsHtml += `<tr><th>Actual Number of Rows</th><td>${actualRows}</td></tr>`;
  }
  if (actualRowsRead != null) {
    rowsHtml += `<tr><th>Number of Rows Read</th><td>${actualRowsRead}</td></tr>`;
  }
  if (estimatedRows != null) {
    rowsHtml += `<tr><th>Estimated Number of Rows</th><td>${estimatedRows}</td></tr>`;
  }
  if (estimatedRowSize != null) {
    rowsHtml += `<tr><th>Estimated Row Size</th><td>${estimatedRowSize} B</td></tr>`;
  }
  div.innerHTML = `<div class="qp-tt-header">資料流 (Data Flow)</div><table><tbody>${rowsHtml}</tbody></table>`;
  return div;
}

function dismissTooltip() {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
  activeTarget = null;
  // Cleanup any lingering .qp-tt in document.body
  const tooltips = document.querySelectorAll('body > .qp-tt');
  tooltips.forEach((tt) => tt.remove());
}

function showNodeOrLineTooltip(target: Element) {
  if (!diagramContainerRef.value) return;

  // Dismiss any existing tooltip first
  dismissTooltip();

  let tooltip: HTMLElement | null = null;
  if (target.classList.contains('qp-node') || target.closest('.qp-node')) {
    const nodeEl = target.classList.contains('qp-node') ? target : target.closest('.qp-node')!;
    const tpl = nodeEl.querySelector('.qp-tt');
    if (tpl) {
      tooltip = tpl.cloneNode(true) as HTMLElement;
    }
  } else if (target.tagName.toLowerCase() === 'polyline') {
    tooltip = getLineTooltip(target, diagramContainerRef.value);
  }

  if (!tooltip) return;

  // Inject action buttons (Copy 📋, Close ✕) into header
  const header = tooltip.querySelector('.qp-tt-header');
  if (header && !header.querySelector('.qp-tt-actions')) {
    const actions = document.createElement('div');
    actions.className = 'qp-tt-actions';

    // 1. One-click copy button
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'qp-tt-copy-btn';
    copyBtn.innerHTML = '📋 複製';
    copyBtn.title = '複製此面板所有文字 (亦可直接以滑鼠反白選取 Ctrl+C)';
    copyBtn.setAttribute('aria-label', 'Copy tooltip content');
    copyBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        const clone = tooltip!.cloneNode(true) as HTMLElement;
        clone.querySelector('.qp-tt-actions')?.remove();
        const contentText = clone.innerText.trim();
        await navigator.clipboard.writeText(contentText);
        copyBtn.innerHTML = '✓ 已複製';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          if (copyBtn) {
            copyBtn.innerHTML = '📋 複製';
            copyBtn.classList.remove('copied');
          }
        }, 1800);
      } catch (err) {
        console.error('Failed to copy tooltip text:', err);
      }
    };
    actions.appendChild(copyBtn);

    // 2. Close button (✕)
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'qp-tt-close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = '關閉浮動視窗 (Esc / 點擊空白處)';
    closeBtn.setAttribute('aria-label', 'Close tooltip');
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      dismissTooltip();
    };
    actions.appendChild(closeBtn);

    header.appendChild(actions);
  }

  document.body.appendChild(tooltip);
  activeTooltip = tooltip;
  activeTarget = target;

  // Initial positioning relative to mouse cursor
  tooltip.style.left = `${mousePos.x + 10}px`;
  tooltip.style.top = `${mousePos.y + 10}px`;

  // Dynamic viewport edge clamping
  requestAnimationFrame(() => {
    if (!tooltip || !document.body.contains(tooltip)) return;
    const rect = tooltip.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const padding = 16;

    if (rect.bottom > viewportHeight - padding) {
      const newTop = Math.max(padding, viewportHeight - rect.height - padding);
      tooltip.style.top = `${newTop}px`;
    }
    if (rect.right > viewportWidth - padding) {
      const newLeft = Math.max(padding, viewportWidth - rect.width - padding);
      tooltip.style.left = `${newLeft}px`;
    }
  });
}

function handleContainerMouseOver(e: MouseEvent) {
  const targetEl = e.target as Element | null;
  if (!targetEl) return;
  const nodeOrLine = targetEl.closest('.qp-node') || (targetEl.tagName.toLowerCase() === 'polyline' ? targetEl : targetEl.closest('polyline'));
  if (!nodeOrLine) return;

  // If already showing or scheduling this target, do nothing
  if (activeTarget === nodeOrLine) return;

  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }

  // 300ms debounce
  hoverTimer = window.setTimeout(() => {
    showNodeOrLineTooltip(nodeOrLine);
  }, 300);
}

function handleContainerMouseOut(e: MouseEvent) {
  const targetEl = e.target as Element | null;
  if (!targetEl) return;
  const nodeOrLine = targetEl.closest('.qp-node') || (targetEl.tagName.toLowerCase() === 'polyline' ? targetEl : targetEl.closest('polyline'));
  if (!nodeOrLine) return;

  const related = e.relatedTarget as Element | null;
  if (related && (related === nodeOrLine || nodeOrLine.contains(related))) {
    return;
  }

  // Cancel debounce if cursor left before 300ms
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }

  // Note: If tooltip has ALREADY appeared, do NOT dismiss on mouseout!
  // It stays open until click outside, Esc, close button, or next tooltip.
}

function handleDocumentPointerDown(event: MouseEvent | PointerEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  // If clicking inside the active tooltip, don't dismiss (allow scrolling, selecting text, etc.)
  if (target.closest('.qp-tt')) return;
  // If clicking on a node or polyline, don't dismiss immediately (hover handles it)
  if (target.closest('.qp-node') || target.closest('polyline')) return;
  // Otherwise, dismiss active tooltip
  dismissTooltip();
}

function handleDocumentKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    dismissTooltip();
  }
}

async function renderPlan() {
  if (!diagramContainerRef.value || !props.tab.planXml) return;

  isRendering.value = true;
  renderError.value = null;

  try {
    // Ensure window.SVG fallback is available in case of strict-mode global receiver differences
    if (typeof window !== 'undefined' && !(window as any).SVG) {
      (window as any).SVG = {};
    }

    // Dynamic import to prevent SSR / Node.js unit test failures
    const qpModule = await import('html-query-plan');
    const showPlan = qpModule.showPlan || (qpModule as any).default?.showPlan;

    if (typeof showPlan !== 'function') {
      throw new Error('html-query-plan showPlan function could not be loaded');
    }

    dismissTooltip();
    diagramContainerRef.value.innerHTML = '';
    // Use jsTooltips: false so ExecutionPlanViewer handles native Vue tooltips reliably
    showPlan(diagramContainerRef.value, props.tab.planXml, { jsTooltips: false });
  } catch (err: any) {
    console.error('html-query-plan rendering failed:', err);
    renderError.value = err?.message || String(err);
  } finally {
    isRendering.value = false;
  }
}

watch(
  () => props.tab.planXml,
  () => {
    if (viewMode.value === 'diagram' && isMounted) {
      nextTick(() => {
        renderPlan();
      });
    }
  }
);

watch(viewMode, (newMode) => {
  if (newMode === 'diagram') {
    nextTick(() => {
      if (diagramContainerRef.value && !diagramContainerRef.value.hasChildNodes()) {
        renderPlan();
      }
    });
  } else {
    dismissTooltip();
  }
});

onMounted(() => {
  isMounted = true;
  window.addEventListener('mousemove', handleMouseMove, { passive: true });
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  document.addEventListener('keydown', handleDocumentKeyDown);

  if (diagramContainerRef.value) {
    diagramContainerRef.value.addEventListener('mouseover', handleContainerMouseOver);
    diagramContainerRef.value.addEventListener('mouseout', handleContainerMouseOut);
  }

  nextTick(() => {
    renderPlan();
  });
});

onBeforeUnmount(() => {
  isMounted = false;
  window.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  document.removeEventListener('keydown', handleDocumentKeyDown);

  if (diagramContainerRef.value) {
    diagramContainerRef.value.removeEventListener('mouseover', handleContainerMouseOver);
    diagramContainerRef.value.removeEventListener('mouseout', handleContainerMouseOut);
  }

  dismissTooltip();
});
</script>

<style>
/* Import html-query-plan stylesheet */
@import 'html-query-plan/css/qp.css';

/* Ensure in-node tooltip template inside the diagram canvas is completely hidden */
.plan-render-canvas .qp-node .qp-tt {
  display: none !important;
}

/* Tooltip floating layer enhancement (attached directly to body) */
body > .qp-tt,
.qp-tt {
  z-index: 9999 !important;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3) !important;
  border-radius: 6px !important;
  /* Semantic tokens keep the floating tooltip in sync with both colour modes and surface palette. */
  border: 1px solid rgb(var(--color-dark-600)) !important;
  background-color: rgb(var(--color-dark-800)) !important;
  color: rgb(var(--color-dark-100)) !important;
  padding: 10px 14px !important;
  min-width: 340px !important;
  max-width: min(600px, 85vw) !important;
  width: auto !important;
  max-height: min(520px, 75vh) !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  word-break: break-word !important;
  overflow-wrap: anywhere !important;
  scrollbar-width: thin;
  scrollbar-color: rgb(var(--color-dark-600)) transparent;
}

/* Enable mouse text selection inside tooltip (overrides body user-select: none) */
body > .qp-tt,
body > .qp-tt *,
.qp-tt,
.qp-tt * {
  user-select: text !important;
  -webkit-user-select: text !important;
}

/* Text containers show text selection I-beam cursor */
body > .qp-tt td,
body > .qp-tt th,
body > .qp-tt div {
  cursor: text;
}

/* Tooltip text selection highlight styling */
body > .qp-tt ::selection,
.qp-tt ::selection {
  background-color: rgb(var(--color-dark-600)) !important;
  color: rgb(var(--color-dark-100)) !important;
}

/* Tooltip custom scrollbar */
.qp-tt::-webkit-scrollbar {
  width: 6px;
}
.qp-tt::-webkit-scrollbar-track {
  background: transparent;
}
.qp-tt::-webkit-scrollbar-thumb {
  background: rgb(var(--color-dark-600));
  border-radius: 3px;
}
.qp-tt::-webkit-scrollbar-thumb:hover {
  background: rgb(var(--color-dark-500));
}

/* Tooltip internal text and elements wrap properly */
.qp-tt div {
  word-break: break-word !important;
  overflow-wrap: anywhere !important;
  white-space: normal !important;
}

.qp-tt-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  color: rgb(var(--color-dark-100)) !important;
  border-bottom: 2px solid rgb(var(--color-dark-600)) !important;
  padding-bottom: 6px !important;
  margin-bottom: 6px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
}

.qp-tt-actions {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  margin-left: auto !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}

.qp-tt-copy-btn {
  background: rgb(var(--color-dark-700)) !important;
  border: 1px solid rgb(var(--color-dark-600)) !important;
  color: rgb(var(--color-dark-200)) !important;
  font-size: 11px !important;
  line-height: 1 !important;
  padding: 3px 6px !important;
  border-radius: 4px !important;
  cursor: pointer !important;
  user-select: none !important;
  -webkit-user-select: none !important;
  transition: all 0.15s ease !important;
}

.qp-tt-copy-btn:hover {
  background: rgb(var(--color-dark-600)) !important;
  color: rgb(var(--color-dark-100)) !important;
}

.qp-tt-copy-btn.copied {
  background: #14532d !important;
  border-color: #22c55e !important;
  color: #4ade80 !important;
}

.qp-tt-close-btn {
  background: transparent !important;
  border: none !important;
  color: rgb(var(--color-dark-500)) !important;
  cursor: pointer !important;
  font-size: 16px !important;
  line-height: 1 !important;
  padding: 0 4px !important;
  border-radius: 4px !important;
  user-select: none !important;
  -webkit-user-select: none !important;
  transition: all 0.15s ease !important;
}

.qp-tt-close-btn:hover {
  background: rgb(var(--color-dark-700)) !important;
  color: rgb(var(--color-dark-100)) !important;
}


/* Tooltip table layout */
.qp-tt table {
  table-layout: fixed !important;
  width: 100% !important;
  margin-top: 8px !important;
  margin-bottom: 8px !important;
  border-collapse: collapse !important;
}

.qp-tt th,
.qp-tt td {
  border-bottom: 1px solid rgb(var(--color-dark-700)) !important;
  color: rgb(var(--color-dark-200)) !important;
  padding: 4px 6px !important;
  font-size: 11px !important;
  vertical-align: top !important;
}

.qp-tt th {
  width: 55% !important;
  color: rgb(var(--color-dark-500)) !important;
  text-align: left !important;
  word-break: break-word !important;
  overflow-wrap: anywhere !important;
}

.qp-tt td {
  width: 45% !important;
  text-align: right !important;
  word-break: break-word !important;
  overflow-wrap: anywhere !important;
}

/* ==========================================================================
   Execution Plan Canvas & Scroll Area Themes
   ========================================================================== */

.plan-scroll-area {
  transition: background-color 0.2s ease;
}

.plan-scroll-dark {
  background-color: #0b0f17;
  background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 16px 16px;
}

.plan-scroll-classic {
  background-color: #f1f5f9;
  background-image: radial-gradient(rgba(0, 0, 0, 0.06) 1px, transparent 1px);
  background-size: 16px 16px;
}

/* ==========================================================================
   Execution Plan Dark Theme Styles
   ========================================================================== */

/* Dark canvas surface */
.plan-render-canvas.theme-dark {
  background-color: #18181f !important;
  border: 1px solid #2d2d3a !important;
  color: #f0f0f5 !important;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4) !important;
}

/* Statement header card */
.plan-render-canvas.theme-dark .qp-statement-header {
  border: 1px solid #2d2d3a !important;
  background-color: #1e1e26 !important;
  border-radius: 6px !important;
  color: #f0f0f5 !important;
  padding: 8px 12px !important;
  margin-bottom: 16px !important;
}

.plan-render-canvas.theme-dark .qp-statement-header-row {
  color: #e2e8f0 !important;
}

.plan-render-canvas.theme-dark .missing-index {
  color: #4ade80 !important;
  font-weight: 500 !important;
}

/* Operator Node Cards */
.plan-render-canvas.theme-dark div.qp-node {
  background-color: #252532 !important;
  border: 1px solid #3c3c4e !important;
  border-radius: 6px !important;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35) !important;
  color: #f1f5f9 !important;
  padding: 6px 10px !important;
  transition: all 0.15s ease !important;
}

.plan-render-canvas.theme-dark div.qp-node:hover {
  background-color: #2d2d3e !important;
  border-color: #3b82f6 !important;
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.4) !important;
  cursor: pointer !important;
}

/* Node internal text styling */
.plan-render-canvas.theme-dark .qp-node > div {
  font-family: inherit !important;
  color: #f1f5f9 !important;
}

/* Operator Title (e.g. Clustered Index Seek) */
.plan-render-canvas.theme-dark .qp-node > div:nth-child(2) {
  font-weight: 600 !important;
  color: #ffffff !important;
  margin-top: 3px !important;
}

/* Sub-label (e.g. [PK_Users]) */
.plan-render-canvas.theme-dark .qp-node > div:nth-child(3) {
  color: #94a3b8 !important;
  font-size: 10.5px !important;
}

/* Cost percentage label (e.g. Cost: 50%) */
.plan-render-canvas.theme-dark .qp-node > div:last-of-type {
  color: #38bdf8 !important;
  font-weight: 600 !important;
}

/* SVG Connector Arrows / Polylines */
.plan-render-canvas.theme-dark .qp-root svg polyline {
  fill: #334155 !important;
  stroke: #64748b !important;
  stroke-width: 1px !important;
  transition: fill 0.15s ease, stroke 0.15s ease !important;
}

.plan-render-canvas.theme-dark .qp-root svg polyline:hover {
  fill: #3b82f6 !important;
  stroke: #60a5fa !important;
  cursor: pointer !important;
}

/* ==========================================================================
   Execution Plan Classic Light Theme Styles
   ========================================================================== */
.plan-render-canvas.theme-classic {
  /* The classic plan page keeps SSMS' yellow operator boxes but sits on the theme's raised
     surface instead of pure white. */
  background-color: #f8fafc !important;
  border: 1px solid #cbd5e1 !important;
  color: #0f172a !important;
}

.plan-render-canvas.theme-classic div.qp-node {
  background-color: #FFFFCC !important;
  border: 1px solid black !important;
  border-radius: 0px !important;
  color: #000000 !important;
}

.plan-render-canvas.theme-classic .qp-statement-header {
  border-color: black !important;
  background-color: transparent !important;
  color: #000000 !important;
}
</style>
