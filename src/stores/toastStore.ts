import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * The app's notification channel (replaces PrimeVue Toast + ToastService).
 *
 * A queue rather than a single slot: several actions can report in quick succession (a copy, a
 * failed copy, a tab that opened), and the last one winning would silently swallow the rest.
 * Callers go through `workspaceStore.showToast`, which is the shape the rest of the app already
 * uses, or through `useToastStore().add` when they need a title of their own.
 */
export type ToastSeverity = 'info' | 'success' | 'warn' | 'error';

export interface AppToast {
  id: string;
  severity: ToastSeverity;
  /** Bold first line. Most callers pass the plain message here and leave `detail` empty. */
  summary: string;
  detail?: string;
  /** Auto-dismiss delay in ms. `0` keeps the toast up until it is closed by hand. */
  life: number;
}

export interface ToastInput {
  severity?: ToastSeverity;
  summary: string;
  detail?: string;
  life?: number;
}

export const DEFAULT_TOAST_LIFE = 3000;

/**
 * Four stacked toasts already reach from the status bar past the middle of the window; past that
 * the oldest retires early so the newest — the one the user just triggered — is always visible.
 */
const MAX_VISIBLE = 4;

export const useToastStore = defineStore('toast', () => {
  const items = ref<AppToast[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let sequence = 0;

  function remove(id: string) {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    items.value = items.value.filter((item) => item.id !== id);
  }

  function add(input: ToastInput): string {
    const id = `toast-${++sequence}`;
    const life = input.life ?? DEFAULT_TOAST_LIFE;
    items.value = [...items.value, {
      id,
      severity: input.severity ?? 'info',
      summary: input.summary,
      detail: input.detail,
      life,
    }];

    while (items.value.length > MAX_VISIBLE) {
      const oldest = items.value[0];
      if (!oldest) break;
      remove(oldest.id);
    }

    if (life > 0) {
      timers.set(id, setTimeout(() => remove(id), life));
    }
    return id;
  }

  function clear() {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    items.value = [];
  }

  return { items, add, remove, clear };
});
