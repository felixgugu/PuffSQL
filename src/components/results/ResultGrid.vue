<template>
  <div ref="containerRef" class="w-full h-full flex flex-col bg-dark-900 overflow-hidden font-sans text-xs select-none relative">
    <!-- Empty State (only when no query tab is active and no result sets) -->
    <div
      v-if="!tabId && (!resultSets || resultSets.length === 0)"
      class="flex-1 flex flex-col items-center justify-center text-dark-500 space-y-1"
    >
      <Inbox class="w-6 h-6 stroke-1" />
      <span>No rows returned</span>
    </div>

    <!-- Single Result Set (100% Height, No Splitters) -->
    <ResultGridItem
      v-else-if="effectiveResultSets.length === 1 && effectiveResultSets[0]"
      :key="itemKey(0)"
      :tab-id="tabId"
      :result-set="effectiveResultSets[0]"
      :set-index="0"
      :total-sets="1"
      :hide-toolbar="toolbarHidden"
      :duration-ms="durationMs"
      class="flex-1 w-full"
    />

    <!-- Multiple Result Sets (> 1): Always Stacked SSMS Multi-Grid View -->
    <div
      v-else
      class="flex-1 w-full flex flex-col overflow-hidden min-h-0"
    >
      <!-- If one grid is maximized -->
      <div
        v-if="maximizedIndex !== null && effectiveResultSets[maximizedIndex]"
        class="flex-1 w-full overflow-hidden"
      >
        <ResultGridItem
          :key="itemKey(maximizedIndex)"
          :tab-id="tabId"
          :result-set="effectiveResultSets[maximizedIndex]!"
          :set-index="maximizedIndex"
          :total-sets="effectiveResultSets.length"
          :is-maximized="true"
          :hide-toolbar="toolbarHidden"
          :duration-ms="durationMs"
          @toggle-maximize="toggleMaximize(maximizedIndex)"
        />
      </div>

      <!-- Normal Stacked Layout with Splitters -->
      <template v-else>
        <template v-for="(set, idx) in effectiveResultSets" :key="idx">
          <div
            :style="paneHeights[idx] ? { height: `${paneHeights[idx]}px` } : { flex: '1 1 0%' }"
            class="w-full min-h-[60px] flex-shrink-0 overflow-hidden"
          >
            <ResultGridItem
              :key="itemKey(idx)"
              :tab-id="tabId"
              :result-set="set"
              :set-index="idx"
              :total-sets="effectiveResultSets.length"
              :is-maximized="false"
              :hide-toolbar="toolbarHidden"
              :duration-ms="durationMs"
              @toggle-maximize="toggleMaximize(idx)"
            />
          </div>

          <!-- Draggable Horizontal Splitter between panes -->
          <ResizableSplitter
            v-if="idx < effectiveResultSets.length - 1"
            direction="vertical"
            :is-dragging="draggingSplitterIndex === idx"
            @pointerdown="onSplitterPointerDown(idx, $event)"
            @dblclick="resetEqualHeights"
          />
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { Inbox } from 'lucide-vue-next';
import ResizableSplitter from '@/components/common/ResizableSplitter.vue';
import ResultGridItem from '@/components/results/ResultGridItem.vue';
import { useGridLayoutStore } from '@/stores/gridLayoutStore';
import { rubberbandClamp, SPRING_PRESETS } from '@/utils/spring';
import { runSpring } from '@/composables/useMotion';
import type { ResultSet } from '@/types/query';

const props = defineProps<{
  resultSets: ResultSet[];
  tabId?: string | null;
  durationMs?: number;
}>();

const fallbackEmptyResultSet: ResultSet = {
  columns: [],
  rows: [],
  rowCount: 0,
};

const effectiveResultSets = computed<ResultSet[]>(() => {
  if (!props.resultSets || props.resultSets.length === 0) {
    return [fallbackEmptyResultSet];
  }
  return props.resultSets;
});

const containerRef = ref<HTMLDivElement | null>(null);
const maximizedIndex = ref<number | null>(null);

const gridLayoutStore = useGridLayoutStore();

/**
 * Per result tab view mode: hides the toolbar and info bar of every grid in this tab. The state
 * lives in the layout store so it survives switching between result tabs and bottom panel tabs,
 * and is dropped when the result tab closes. Single result sets and multi result sets both
 * default to hiding toolbars and share this toggle.
 */
const toolbarHidden = computed(
  () => (props.resultSets.length > 1 && gridLayoutStore.isToolbarHidden(props.tabId ?? null, true)) || gridLayoutStore.isToolbarHidden(props.tabId ?? null, true)
);


/** Component key doubles as the persistent layout key for the result set it renders. */
function itemKey(setIndex: number | null | undefined): string {
  return gridLayoutStore.layoutKey(props.tabId ?? null, setIndex ?? 0);
}

// Pixel heights for each stacked pane
const paneHeights = ref<number[]>([]);
const draggingSplitterIndex = ref<number | null>(null);
/** Set while a released splitter is springing back, so the observer does not fight the spring. */
const settlingSplitterIndex = ref<number | null>(null);

function toggleMaximize(index: number) {
  if (maximizedIndex.value === index) {
    maximizedIndex.value = null;
  } else {
    maximizedIndex.value = index;
  }
}

function getAvailableHeight(): number {
  if (!containerRef.value) return 0;
  const splittersTotal = Math.max(0, (effectiveResultSets.value.length - 1) * 6);
  const total = containerRef.value.clientHeight - splittersTotal;
  return Math.max(total, 60 * effectiveResultSets.value.length);
}

function resetEqualHeights() {
  if (effectiveResultSets.value.length <= 1) return;
  const available = getAvailableHeight();
  const count = effectiveResultSets.value.length;
  const equalH = Math.floor(available / count);
  const remainder = available - equalH * count;

  const heights: number[] = [];
  for (let i = 0; i < count; i++) {
    heights.push(equalH + (i === count - 1 ? remainder : 0));
  }
  paneHeights.value = heights;
}

function recalculateHeights() {
  const count = effectiveResultSets.value.length;
  if (count <= 1) {
    paneHeights.value = [];
    return;
  }

  const available = getAvailableHeight();
  const currentSum = paneHeights.value.reduce((a, b) => a + b, 0);

  if (paneHeights.value.length !== count || currentSum <= 0) {
    resetEqualHeights();
    return;
  }

  // Scale existing heights proportionally to fit new container dimensions
  const scale = available / currentSum;
  let allocated = 0;
  paneHeights.value = paneHeights.value.map((h, idx) => {
    if (idx === count - 1) {
      return Math.max(60, available - allocated);
    }
    const scaled = Math.max(60, Math.round(h * scale));
    allocated += scaled;
    return scaled;
  });
}

// Watch for effectiveResultSets changes to re-init heights
watch(
  () => effectiveResultSets.value,
  () => {
    maximizedIndex.value = null;
    nextTick(() => {
      resetEqualHeights();
    });
  },
  { deep: false }
);

// Splitter Dragging Logic
//
// The two panes trade height with each other, so the pair's total is what stays constant while
// the pointer moves. Past either end the splitter resists progressively instead of stopping
// dead, and releasing hands the pointer's velocity to a spring so the panes settle back onto
// the nearest limit without a seam.
let startDragY = 0;
let startTopH = 0;
let startBottomH = 0;
let activeSplitterIdx = -1;
let dragSamples: Array<{ y: number; time: number }> = [];
let cancelSplitterSettle: (() => void) | null = null;

/** Panes never settle below this; they may dip past it only while the pointer is resisting. */
const MIN_PANE_HEIGHT = 60;
/** Only the last few pointer samples count when measuring the release velocity. */
const VELOCITY_SAMPLE_WINDOW_MS = 120;
/** Ceiling for the handed-off velocity, so a fast flick cannot launch the panes. */
const MAX_RELEASE_VELOCITY = 800;
/** A rubber band has already absorbed most of the energy. */
const RELEASE_VELOCITY_SCALE = 0.35;
const RUBBER_BAND_CONSTANT = 0.35;

function splitterNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function samplePanePointer(y: number) {
  dragSamples.push({ y, time: splitterNow() });
  const cutoff = splitterNow() - VELOCITY_SAMPLE_WINDOW_MS;
  while (dragSamples.length > 2 && dragSamples[0]!.time < cutoff) {
    dragSamples.shift();
  }
}

/** Release velocity in px/s, measured over the last ~120ms rather than the whole gesture. */
function paneReleaseVelocity(): number {
  if (dragSamples.length < 2) return 0;
  const first = dragSamples[0]!;
  const last = dragSamples[dragSamples.length - 1]!;
  const elapsed = (last.time - first.time) / 1000;
  if (elapsed <= 0) return 0;
  const velocity = (last.y - first.y) / elapsed;
  return Math.max(Math.min(velocity, MAX_RELEASE_VELOCITY), -MAX_RELEASE_VELOCITY);
}

function stopSplitterSettle() {
  cancelSplitterSettle?.();
  cancelSplitterSettle = null;
  settlingSplitterIndex.value = null;
}

function onSplitterPointerDown(splitterIndex: number, event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();

  // Grabbing a splitter that is still settling takes over from the height on screen.
  stopSplitterSettle();

  activeSplitterIdx = splitterIndex;
  draggingSplitterIndex.value = splitterIndex;
  startDragY = event.clientY;

  // Ensure heights are initialized
  if (paneHeights.value.length !== effectiveResultSets.value.length) {
    resetEqualHeights();
  }

  startTopH = paneHeights.value[splitterIndex] || 100;
  startBottomH = paneHeights.value[splitterIndex + 1] || 100;
  dragSamples = [];
  samplePanePointer(event.clientY);

  // Keep receiving move/up events once the pointer leaves the splitter.
  const handle = event.currentTarget as HTMLElement | null;
  if (handle && typeof handle.setPointerCapture === 'function' && typeof event.pointerId === 'number') {
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Capture is a nicety; the document listeners below still track the drag.
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
  }
}

function onPointerMove(event: PointerEvent) {
  if (draggingSplitterIndex.value === null || activeSplitterIdx < 0) return;

  const deltaY = event.clientY - startDragY;
  samplePanePointer(event.clientY);

  const totalCombined = startTopH + startBottomH;

  // Past either end the pane keeps following the pointer, but with progressive resistance
  // instead of stopping dead at the edge.
  const newTopH = rubberbandClamp(
    startTopH + deltaY,
    MIN_PANE_HEIGHT,
    totalCombined - MIN_PANE_HEIGHT,
    totalCombined,
    RUBBER_BAND_CONSTANT
  );

  paneHeights.value[activeSplitterIdx] = Math.round(newTopH);
  paneHeights.value[activeSplitterIdx + 1] = Math.round(totalCombined - newTopH);
}

function onPointerUp() {
  const idx = activeSplitterIdx;
  const wasDragging = draggingSplitterIndex.value !== null;

  draggingSplitterIndex.value = null;
  activeSplitterIdx = -1;

  if (typeof document !== 'undefined') {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }

  if (!wasDragging || idx < 0) return;

  const velocity = paneReleaseVelocity();
  dragSamples = [];

  const startTop = paneHeights.value[idx] ?? 0;
  const totalCombined = startTop + (paneHeights.value[idx + 1] ?? 0);
  const restingTop = Math.round(
    Math.min(Math.max(startTop, MIN_PANE_HEIGHT), totalCombined - MIN_PANE_HEIGHT)
  );

  // Inside the limits there is no snap target: the panes stay where they were dropped.
  if (Math.abs(restingTop - startTop) < 0.5) return;

  settlingSplitterIndex.value = idx;

  cancelSplitterSettle = runSpring({
    from: startTop,
    to: restingTop,
    velocity: velocity * RELEASE_VELOCITY_SCALE,
    // The gesture carried momentum, so the snap back is allowed a little life.
    config: SPRING_PRESETS.momentum,
    onFrame: (value) => {
      const next = Math.round(value);
      paneHeights.value[idx] = next;
      // Derive the partner from the same total so the pair never drifts apart.
      paneHeights.value[idx + 1] = totalCombined - next;
    },
    onComplete: () => {
      paneHeights.value[idx] = restingTop;
      paneHeights.value[idx + 1] = totalCombined - restingTop;
      settlingSplitterIndex.value = null;
      cancelSplitterSettle = null;
    },
  });
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (containerRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (draggingSplitterIndex.value === null && settlingSplitterIndex.value === null) {
        recalculateHeights();
      }
    });
    resizeObserver.observe(containerRef.value);
  }
  nextTick(() => {
    resetEqualHeights();
  });
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  stopSplitterSettle();
  onPointerUp();
});
</script>
