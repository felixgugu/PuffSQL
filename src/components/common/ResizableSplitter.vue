<template>
  <div
    :class="[
      'select-none transition-colors duration-100 flex-shrink-0 relative group z-20',
      direction === 'horizontal'
        ? 'w-1.5 cursor-col-resize'
        : 'h-1.5 cursor-row-resize',
      isDragging ? 'bg-brand-500' : 'bg-dark-700 hover:bg-dark-600'
    ]"
    @pointerdown="$emit('pointerdown', $event)"
    @dblclick="$emit('dblclick', $event)"
  >
    <!--
      The visible handle stays hairline-thin, but the grab area is ~10px wide. The cursor is
      already the affordance here, so widening the target costs nothing and makes the splitter
      feel far less fiddly. Presses land on this child and bubble to the handler above.
    -->
    <div
      aria-hidden="true"
      :class="[
        'absolute z-10',
        direction === 'horizontal'
          ? '-inset-x-0.5 inset-y-0 cursor-col-resize'
          : 'inset-x-0 -inset-y-0.5 cursor-row-resize'
      ]"
    />

    <!-- Visual grip indicator line on hover -->
    <div
      v-if="direction === 'horizontal'"
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-6 rounded bg-dark-500 group-hover:bg-brand-300 transition-colors duration-100 pointer-events-none"
    />
    <div
      v-else
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-0.5 w-6 rounded bg-dark-500 group-hover:bg-brand-300 transition-colors duration-100 pointer-events-none"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  direction: 'horizontal' | 'vertical';
  isDragging?: boolean;
}>();

defineEmits<{
  (e: 'pointerdown', event: PointerEvent): void;
  (e: 'dblclick', event: MouseEvent): void;
}>();
</script>
