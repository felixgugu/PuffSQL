<template>
  <span class="sq-chip" :class="`sq-chip--${tone}`">
    <span v-if="$slots.icon" class="sq-chip__icon"><slot name="icon" /></span>
    <span class="sq-chip__label"><slot>{{ label }}</slot></span>
  </span>
</template>

<script lang="ts">
/**
 * Minimal status chip (replaces PrimeVue Tag).
 *
 * One size, one radius and one border width for the whole product; only the tone changes. Tones
 * map onto the semantic roles in docs/design/minimal-ui/SPEC.md — `accent` is the single action
 * colour, and status is never carried by colour alone (the call site supplies a label or icon).
 */
export type SqChipTone =
  | 'neutral'
  | 'accent'
  | 'ok'
  | 'warn'
  | 'danger'
  | 'plan'
  | 'er'
  | 'structure';
</script>

<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: SqChipTone;
    /** Plain text label; the default slot wins when both are given. */
    label?: string | number;
  }>(),
  { tone: 'neutral' }
);
</script>

<style scoped>
.sq-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  padding: 0 6px;
  border: 1px solid;
  border-radius: 3px;
  font-family: var(--app-font-sans);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  flex-shrink: 0;
}

.sq-chip__icon {
  display: inline-flex;
  align-items: center;
}

.sq-chip--neutral {
  background-color: rgb(var(--color-dark-750));
  border-color: rgb(var(--color-dark-700));
  color: rgb(var(--color-dark-300));
}

.sq-chip--accent {
  background-color: rgb(var(--color-accent) / 0.1);
  border-color: rgb(var(--color-accent) / 0.3);
  color: rgb(var(--color-accent));
}

.sq-chip--ok {
  background-color: rgb(var(--color-ok) / 0.1);
  border-color: rgb(var(--color-ok) / 0.3);
  color: rgb(var(--color-ok));
}

.sq-chip--warn {
  background-color: rgb(var(--color-warn) / 0.1);
  border-color: rgb(var(--color-warn) / 0.3);
  color: rgb(var(--color-warn));
}

.sq-chip--danger {
  background-color: rgb(var(--color-danger) / 0.1);
  border-color: rgb(var(--color-danger) / 0.3);
  color: rgb(var(--color-danger));
}

.sq-chip--plan {
  background-color: rgb(var(--color-plan) / 0.1);
  border-color: rgb(var(--color-plan) / 0.3);
  color: rgb(var(--color-plan));
}

.sq-chip--er {
  background-color: rgb(var(--color-er) / 0.1);
  border-color: rgb(var(--color-er) / 0.3);
  color: rgb(var(--color-er));
}

.sq-chip--structure {
  background-color: rgb(var(--color-structure) / 0.1);
  border-color: rgb(var(--color-structure) / 0.3);
  color: rgb(var(--color-structure));
}
</style>
