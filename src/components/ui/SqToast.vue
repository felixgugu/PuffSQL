<template>
  <Teleport to="body">
    <div class="sq-toast" role="log" aria-live="polite" aria-relevant="additions">
      <TransitionGroup name="sq-toast-item">
        <div
          v-for="toast in toastStore.items"
          :key="toast.id"
          class="sq-toast__item"
          :class="`sq-toast__item--${toast.severity}`"
          :role="toast.severity === 'error' ? 'alert' : 'status'"
        >
          <component
            :is="SEVERITY_ICONS[toast.severity]"
            class="sq-toast__icon"
            aria-hidden="true"
          />
          <div class="sq-toast__text">
            <p class="sq-toast__summary">{{ toast.summary }}</p>
            <p v-if="toast.detail" class="sq-toast__detail">{{ toast.detail }}</p>
          </div>
          <SqButton
            class="sq-toast__close"
            size="xs"
            :aria-label="$t('common.close')"
            @click="toastStore.remove(toast.id)"
          >
            <template #icon><X class="w-3 h-3" /></template>
          </SqButton>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { CircleCheck, CircleX, Info, TriangleAlert, X } from '@/components/icons';
import type { Component } from 'vue';
import SqButton from '@/components/ui/SqButton.vue';
import { useToastStore, type ToastSeverity } from '@/stores/toastStore';

/**
 * The notification stack (replaces PrimeVue Toast).
 *
 * Bottom-right, four deep, each item a raised card with a 3px severity bar. The severity is never
 * carried by colour alone: every item also has its own icon and a summary line (SPEC §11), and an
 * error announces itself with `role="alert"` rather than waiting for a polite pause.
 */
const toastStore = useToastStore();

const SEVERITY_ICONS: Record<ToastSeverity, Component> = {
  info: Info,
  success: CircleCheck,
  warn: TriangleAlert,
  error: CircleX,
};
</script>

<style scoped>
.sq-toast {
  position: fixed;
  right: 1rem;
  bottom: 2rem; /* Floats 32px above the 24px status bar */
  z-index: 12000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 20rem;
  max-width: calc(100vw - 2rem);
  /* The stack is a corridor for the pointer, not a surface: only the cards take clicks. */
  pointer-events: none;
}

.sq-toast__item {
  pointer-events: auto;
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  border: 1px solid rgb(var(--color-dark-700));
  border-radius: 6px;
  background-color: rgb(var(--color-raised));
  box-shadow: var(--shadow-raised);
  color: rgb(var(--color-dark-200));
  font-size: 12px;
  line-height: 1.35;
  overflow: hidden;
}

/* The 3px severity bar. */
.sq-toast__item::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background-color: rgb(var(--color-accent));
}

.sq-toast__item--success::before {
  background-color: rgb(var(--color-ok));
}
.sq-toast__item--warn::before {
  background-color: rgb(var(--color-warn));
}
.sq-toast__item--error::before {
  background-color: rgb(var(--color-danger));
}

.sq-toast__icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-top: 1px;
  color: rgb(var(--color-accent));
}

.sq-toast__item--success .sq-toast__icon {
  color: rgb(var(--color-ok));
}
.sq-toast__item--warn .sq-toast__icon {
  color: rgb(var(--color-warn));
}
.sq-toast__item--error .sq-toast__icon {
  color: rgb(var(--color-danger));
}

.sq-toast__text {
  flex: 1 1 auto;
  min-width: 0;
}

.sq-toast__summary {
  margin: 0;
  font-weight: 600;
  color: rgb(var(--color-dark-100));
  word-break: break-word;
}

.sq-toast__detail {
  margin: 2px 0 0;
  color: rgb(var(--color-dark-300));
  word-break: break-word;
}

.sq-toast__close {
  flex-shrink: 0;
}

.sq-toast-item-enter-active,
.sq-toast-item-leave-active {
  transition: opacity 160ms ease-out, transform 160ms ease-out;
}

.sq-toast-item-enter-from,
.sq-toast-item-leave-to {
  opacity: 0;
  transform: translateX(8px);
}
</style>
