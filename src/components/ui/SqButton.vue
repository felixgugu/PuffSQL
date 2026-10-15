<template>
  <button
    class="sq-btn"
    :class="[
      `sq-btn--${variant}`,
      `sq-btn--${tone}`,
      `sq-btn--${size}`,
      { 'sq-btn--icon-only': iconOnly, 'is-active': active, 'is-loading': loading },
    ]"
    :type="type"
    :disabled="disabled || loading"
    :aria-label="ariaLabel"
    :aria-pressed="active === undefined ? undefined : active"
    v-bind="$attrs"
    @click="$emit('click', $event)"
  >
    <span v-if="loading || $slots.icon" class="sq-btn__icon">
      <Loader2 v-if="loading" class="w-3.5 h-3.5 sq-btn__spinner" />
      <slot v-else name="icon" />
    </span>
    <span v-if="label || $slots.default" class="sq-btn__label">
      <slot>{{ label }}</slot>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue';
import { Loader2 } from '@/components/icons';

/**
 * Minimal button (replaces PrimeVue Button).
 *
 * Three variants × a tone, four heights (24 / 28 / 32px, plus 20px for dense toolbars), one
 * radius and one focus ring — see SPEC §7. The call site supplies the icon through the `#icon`
 * slot (a generated `@/components/icons` component), so no icon font and no `!w-7 !h-7 !p-0`
 * class soup is needed: an icon-only button is simply a button without a label.
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    label?: string;
    tone?: 'neutral' | 'accent' | 'danger' | 'warn' | 'ok' | 'plan';
    variant?: 'solid' | 'outline' | 'ghost';
    size?: 'xs' | 'sm' | 'md' | 'lg';
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    /** Toggle buttons pass their on/off state so it is exposed as `aria-pressed`. */
    active?: boolean;
    ariaLabel?: string;
  }>(),
  { tone: 'neutral', variant: 'ghost', size: 'md', type: 'button' }
);

defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

const slots = useSlots();
/**
 * An icon-only button is one with an icon and nothing to say. The `label` prop counts as text:
 * omitting it here is what once laid every labelled button out as a 28px square with its text
 * spilling out of the box.
 */
const iconOnly = computed(() => !slots.default && !slots.label && !props.label?.length);
</script>

<style scoped>
.sq-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: rgb(var(--color-dark-300));
  font-family: var(--app-font-sans);
  font-size: 12px;
  font-weight: 400;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out;
}

.sq-btn--xs { height: 20px; padding: 0 6px; font-size: 11px; }
.sq-btn--sm { height: 24px; padding: 0 8px; }
.sq-btn--md { height: 28px; }
.sq-btn--lg { height: 32px; padding: 0 12px; }

.sq-btn--icon-only { padding: 0; width: 28px; }
.sq-btn--icon-only.sq-btn--xs { width: 20px; }
.sq-btn--icon-only.sq-btn--sm { width: 24px; }
.sq-btn--icon-only.sq-btn--lg { width: 32px; }

.sq-btn__icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

/* Ghost: the default in dense toolbars — no chrome until you point at it. */
.sq-btn--ghost:hover:not(:disabled) {
  background-color: rgb(var(--color-dark-750));
  color: rgb(var(--color-dark-100));
}

.sq-btn--outline {
  border-color: rgb(var(--color-dark-700));
  color: rgb(var(--color-dark-200));
}

.sq-btn--outline:hover:not(:disabled) {
  background-color: rgb(var(--color-dark-750));
  border-color: rgb(var(--color-dark-600));
  color: rgb(var(--color-dark-100));
}

/* Solid accent: the one primary action per view. */
.sq-btn--solid.sq-btn--accent {
  background-color: rgb(var(--color-accent-fill));
  border-color: rgb(var(--color-accent-fill));
  color: #ffffff;
}

.sq-btn--solid.sq-btn--accent:hover:not(:disabled) {
  background-color: rgb(var(--color-accent-fill-hover));
  border-color: rgb(var(--color-accent-fill-hover));
}

.sq-btn--solid.sq-btn--danger {
  background-color: rgb(var(--color-danger));
  border-color: rgb(var(--color-danger));
  color: #ffffff;
}

.sq-btn--solid.sq-btn--danger:hover:not(:disabled) {
  filter: brightness(0.92);
}

/* Tone-coloured text/icons for ghost and outline variants. */
.sq-btn--ghost.sq-btn--accent,
.sq-btn--outline.sq-btn--accent,
.sq-btn.is-active.sq-btn--accent {
  color: rgb(var(--color-accent));
}
.sq-btn--ghost.sq-btn--danger,
.sq-btn--outline.sq-btn--danger { color: rgb(var(--color-danger)); }
.sq-btn--ghost.sq-btn--warn,
.sq-btn--outline.sq-btn--warn { color: rgb(var(--color-warn)); }
.sq-btn--ghost.sq-btn--ok,
.sq-btn--outline.sq-btn--ok { color: rgb(var(--color-ok)); }
.sq-btn--ghost.sq-btn--plan,
.sq-btn--outline.sq-btn--plan { color: rgb(var(--color-plan)); }

.sq-btn--ghost.sq-btn--accent:hover:not(:disabled),
.sq-btn--ghost.sq-btn--danger:hover:not(:disabled),
.sq-btn--ghost.sq-btn--warn:hover:not(:disabled),
.sq-btn--ghost.sq-btn--ok:hover:not(:disabled),
.sq-btn--ghost.sq-btn--plan:hover:not(:disabled) {
  background-color: rgb(var(--color-dark-750));
}

.sq-btn.is-active.sq-btn--accent {
  background-color: rgb(var(--color-accent) / 0.1);
}

.sq-btn:focus-visible {
  outline: 2px solid rgb(var(--color-accent));
  outline-offset: 1px;
}

.sq-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.sq-btn__spinner {
  animation: sq-btn-spin 900ms linear infinite;
}

@keyframes sq-btn-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .sq-btn__spinner { animation: none; }
}
</style>
