<template>
  <!--
    Shared empty state for the results area. Two genuinely different situations must not read the
    same: nothing has been run yet (onboarding: how do I get rows here?) versus a query that ran
    and matched nothing (confirmation: your statement was fine, the filter was not).

    `m-auto` on the child instead of `justify-center` on the flex parent: when the panel is too
    short for the content, centring would clip the top and hide it from the scroll area.
  -->
  <div class="flex-1 w-full flex overflow-auto p-4">
    <div class="m-auto flex flex-col items-center text-center max-w-[420px]">
      <div class="sq-empty-glyph">
        <component :is="glyph" class="w-5 h-5 stroke-[1.5]" aria-hidden="true" />
      </div>

      <p class="mt-2.5 text-xs font-medium text-dark-200">{{ title }}</p>
      <p class="mt-1 text-xxs leading-relaxed text-dark-400">{{ description }}</p>

      <ul v-if="variant === 'idle'" class="mt-3 flex flex-col gap-1 w-full max-w-[276px] text-left">
        <li v-for="hint in hints" :key="hint.keys" class="flex items-center gap-2">
          <kbd class="sq-empty-kbd">{{ hint.keys }}</kbd>
          <span class="text-xxs text-dark-400">{{ hint.label }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Inbox, SearchX } from 'lucide-vue-next';
import { shortcutLabel } from '@/utils/shortcutKeys';

const props = defineProps<{
  /** `idle`: no query has been run. `no-rows`: a query ran and returned zero rows. */
  variant: 'idle' | 'no-rows';
  /** Column count of the empty result set, used by the `no-rows` copy. */
  columnCount?: number;
}>();

const { t } = useI18n();

const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;

const glyph = computed(() => (props.variant === 'idle' ? Inbox : SearchX));

const title = computed(() =>
  props.variant === 'idle' ? t('results.emptyTitle') : t('results.emptyNoRowsTitle')
);

const description = computed(() =>
  props.variant === 'idle'
    ? t('results.emptyDesc')
    : t('results.emptyNoRowsDesc', { columns: props.columnCount ?? 0 })
);

/** Only real, currently-wired chords are advertised. */
const hints = computed(() => [
  { keys: shortcutLabel('Enter', userAgent), label: t('results.emptyHintRun') },
  { keys: shortcutLabel('Shift + Enter', userAgent), label: t('results.emptyHintRunAll') },
  { keys: shortcutLabel('P', userAgent), label: t('results.emptyHintFinder') },
  { keys: shortcutLabel('I', userAgent), label: t('results.emptyHintAi') },
]);
</script>

<style scoped>
.sq-empty-glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  color: rgb(var(--color-dark-400));
  background-color: rgb(var(--color-dark-800) / 0.9);
  border: 1px solid rgb(var(--color-dark-700));
  box-shadow: inset 0 1px 0 rgb(var(--color-dark-100) / 0.03);
}

.sq-empty-kbd {
  flex-shrink: 0;
  min-width: 118px;
  padding: 1px 5px;
  border-radius: 5px;
  border: 1px solid rgb(var(--color-dark-700));
  background-color: rgb(var(--color-dark-800));
  color: rgb(var(--color-dark-200));
  font-family: var(--app-font-sans);
  font-size: 0.6875rem;
  line-height: 16px;
  text-align: center;
  white-space: nowrap;
}
</style>
