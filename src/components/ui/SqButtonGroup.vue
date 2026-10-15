<template>
  <div class="sq-btn-group" role="group" :aria-label="ariaLabel">
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * Toolbar button group (SPEC §7 "button group").
 *
 * One hairline outline around the whole strip, with a 1px rule between the segments, so a cluster
 * of related actions reads as one control while every segment keeps its own hover/active/focus
 * behaviour. Segments are plain `SqButton`s (usually `variant="ghost"`); the group owns no padding
 * or gap, so the segments stay edge to edge.
 *
 * The group deliberately does **not** clip its children: `SqButton` draws its 2px focus ring
 * *outside* the button box, and `overflow: hidden` would cut it off. The inner corners are rounded
 * on the first and last segment instead.
 */
defineProps<{
  ariaLabel?: string;
}>();
</script>

<style scoped>
.sq-btn-group {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  border: 1px solid rgb(var(--color-dark-700));
  border-radius: 4px;
}

/* Square segments: the outline lives on the group, never on a segment. */
.sq-btn-group :deep(.sq-btn) {
  border-radius: 0;
}

/* The ring is part of the control, so a strip keeps the height of the buttons around it: the 1px
   border takes 1px top and bottom, and the segments give those 2px back (SPEC §5: 24 / 28 / 32).
   Without this a 28px strip would render 30px tall and sit 6px proud of a 24px select. */
.sq-btn-group :deep(.sq-btn--xs) { height: 18px; }
.sq-btn-group :deep(.sq-btn--sm) { height: 22px; }
.sq-btn-group :deep(.sq-btn--md) { height: 26px; }
.sq-btn-group :deep(.sq-btn--lg) { height: 30px; }

/* `SqButton` always carries a 1px border (transparent by default), so the divider between two
   segments is only a colour change — no extra element and no gap. */
.sq-btn-group :deep(.sq-btn + .sq-btn) {
  border-left-color: rgb(var(--color-dark-750));
}

.sq-btn-group :deep(.sq-btn:first-child) {
  border-top-left-radius: 3px;
  border-bottom-left-radius: 3px;
}

.sq-btn-group :deep(.sq-btn:last-child) {
  border-top-right-radius: 3px;
  border-bottom-right-radius: 3px;
}
</style>
