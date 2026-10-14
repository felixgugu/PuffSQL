import type { Directive, DirectiveBinding } from 'vue';
import { placeTooltip, type TooltipSide } from '@/utils/popoverPlacement';

/**
 * `v-tooltip.top="'…'"` / `v-tooltip.bottom="'…'"` — the app's one tooltip (replaces
 * `primevue/tooltip`).
 *
 * About 150 call sites already spell it this way, so the directive keeps PrimeVue's API exactly:
 * `top` / `bottom` / `left` / `right` modifiers, a plain string value, and an empty or missing
 * value meaning "no tooltip" — that last one matters, because several buttons compute their hint
 * and legitimately pass `''` while the control is busy.
 *
 * One element is shared by every anchor: a tooltip is only ever up for one trigger at a time, and
 * a singleton avoids both DOM churn and z-index drift. Placement comes from the unit tested
 * `placeTooltip`, so an edge-of-window trigger flips instead of pinning the tooltip over itself.
 */
const SHOW_DELAY_MS = 400;

interface TooltipState {
  text: string;
  side: TooltipSide;
}

const stateByElement = new WeakMap<HTMLElement, TooltipState>();
const teardownByElement = new WeakMap<HTMLElement, () => void>();

let panel: HTMLElement | null = null;
let owner: HTMLElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

/**
 * A tooltip answers a question the *user* asks — "what is this control?" — with the keyboard or
 * the mouse. It must not answer one the app asks itself: opening a dialog focuses its first
 * control programmatically, and without this flag every dialog would pop a hint the moment it
 * appeared.
 */
let keyboardNavigation = false;
let modalityTracked = false;

function trackModality() {
  if (modalityTracked || typeof window === 'undefined') return;
  modalityTracked = true;
  window.addEventListener('keydown', () => { keyboardNavigation = true; }, true);
  window.addEventListener('pointerdown', () => { keyboardNavigation = false; }, true);
}

function ensurePanel(): HTMLElement {
  if (panel && panel.isConnected) return panel;
  panel = document.createElement('div');
  panel.className = 'sq-tooltip';
  panel.setAttribute('role', 'tooltip');
  panel.hidden = true;
  document.body.appendChild(panel);
  return panel;
}

/** PrimeVue accepted `{ value }` objects as well as bare strings; keep accepting both. */
function readText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value?: unknown }).value;
    return inner == null ? '' : String(inner);
  }
  return value == null ? '' : String(value);
}

function readSide(binding: DirectiveBinding): TooltipSide {
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    if (binding.modifiers[side]) return side;
  }
  return 'top';
}

function reposition() {
  if (!panel || !owner || panel.hidden || !owner.isConnected) return;
  const { top, left } = placeTooltip({
    anchor: owner.getBoundingClientRect(),
    panel: { width: panel.offsetWidth, height: panel.offsetHeight },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    side: stateByElement.get(owner)?.side ?? 'top',
  });
  panel.style.top = `${Math.round(top)}px`;
  panel.style.left = `${Math.round(left)}px`;
}

function bindWindowListeners() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  // Capture phase: the tooltip must follow whatever scroll container the trigger lives in, and
  // scroll events from inner panes do not bubble.
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
}

function unbindWindowListeners() {
  if (!listening) return;
  listening = false;
  window.removeEventListener('scroll', reposition, true);
  window.removeEventListener('resize', reposition);
}

function hide() {
  if (showTimer !== null) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  owner = null;
  if (panel) panel.hidden = true;
  unbindWindowListeners();
}

function show(anchor: HTMLElement) {
  const state = stateByElement.get(anchor);
  if (!state?.text || !anchor.isConnected) return;
  const el = ensurePanel();
  owner = anchor;
  el.textContent = state.text;
  // Measure before positioning: `hidden` would report a zero-size box.
  el.hidden = false;
  reposition();
  bindWindowListeners();
}

function isMounted(el: HTMLElement) {
  return stateByElement.has(el);
}

const tooltip: Directive<HTMLElement, unknown> = {
  mounted(el, binding) {
    stateByElement.set(el, { text: readText(binding.value), side: readSide(binding) });
    trackModality();

    const onEnter = () => {
      if (showTimer !== null) clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        showTimer = null;
        show(el);
      }, SHOW_DELAY_MS);
    };
    const onLeave = () => {
      if (owner === el) hide();
      else if (showTimer !== null) {
        clearTimeout(showTimer);
        showTimer = null;
      }
    };
    // Keyboard users get the hint immediately once the control takes focus — but only when the
    // keyboard is what moved it.
    const onFocus = () => {
      if (keyboardNavigation) show(el);
    };
    const onBlur = () => {
      if (owner === el) hide();
    };
    // Acting on the control means the hint has done its job.
    const onActivate = () => {
      if (owner === el) hide();
    };

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('focus', onFocus);
    el.addEventListener('blur', onBlur);
    el.addEventListener('pointerdown', onActivate);
    el.addEventListener('click', onActivate);

    teardownByElement.set(el, () => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('focus', onFocus);
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('pointerdown', onActivate);
      el.removeEventListener('click', onActivate);
      if (owner === el) hide();
      else onLeave();
    });
  },

  updated(el, binding) {
    if (!isMounted(el)) return;
    const text = readText(binding.value);
    stateByElement.set(el, { text, side: readSide(binding) });
    if (!text) {
      if (owner === el) hide();
      return;
    }
    if (owner === el && panel) {
      panel.textContent = text;
      reposition();
    }
  },

  beforeUnmount(el) {
    teardownByElement.get(el)?.();
    teardownByElement.delete(el);
    stateByElement.delete(el);
  },
};

export default tooltip;
