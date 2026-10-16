<template>
  <div class="space-y-0.5">
    <div
      v-for="row in rows"
      :key="row.key"
      :data-object-kind="row.kind"
      :title="row.title"
      @dblclick.stop="$emit('open', row.kind, row.name)"
      @contextmenu.prevent="$emit('contextmenu', $event, row.kind, row.name)"
      @mouseenter="$emit('hover', row.name)"
      @mouseleave="$emit('hover', null)"
      class="flex items-center space-x-1.5 px-1.5 py-0.5 text-xxs rounded cursor-pointer select-none transition-colors group"
      :class="row.disabled ? 'text-dark-500 hover:text-dark-100 hover:bg-dark-750/70' : 'text-dark-400 hover:text-dark-100 hover:bg-dark-750/70'"
    >
      <component :is="row.icon" class="w-2.5 h-2.5 flex-shrink-0" :class="row.color" />
      <span class="truncate flex-1 text-dark-300 group-hover:text-dark-100">{{ row.name }}</span>
      <!--
        The kind reads as `[PK]` / `[NONCLUSTERED]` instead of a bordered chip. A box on every row
        made the list look like a column of buttons, and the chip's padding and border pushed the
        object rows taller than the column rows above them, which is what broke the tree's rhythm.
      -->
      <span
        class="text-xxs flex-shrink-0 font-sans"
        :class="row.disabled ? 'text-warn' : 'text-dark-500'"
      >
        [{{ row.badge }}]
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Component } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ConstraintKind, TableConstraintItem, TableIndexItem, TableTriggerItem } from '@/types/schema';
import { Braces, CircleCheck, Key, Link2, List, ShieldCheck, Zap } from '@/components/icons';
import { indexBadgeType } from '@/utils/objectScriptGenerator';

/**
 * Constraints, indexes and triggers of one table or view, listed as flat rows next to the columns.
 *
 * The Explorer deliberately does not nest them in folders: kind is carried by the icon colour, the
 * exact type by the badge on the right, and the full detail by the tooltip.
 */
const props = defineProps<{
  constraints: TableConstraintItem[];
  indexes: TableIndexItem[];
  triggers: TableTriggerItem[];
}>();

defineEmits<{
  (e: 'open', kind: 'constraint' | 'index' | 'trigger', name: string): void;
  (e: 'contextmenu', event: MouseEvent, kind: 'constraint' | 'index' | 'trigger', name: string): void;
  (e: 'hover', name: string | null): void;
}>();

const { t } = useI18n();

const KIND_ICONS: Record<ConstraintKind, { icon: Component; color: string; badge: string }> = {
  PRIMARY_KEY: { icon: Key, color: 'text-warn', badge: 'PK' },
  UNIQUE: { icon: CircleCheck, color: 'text-ok', badge: 'UQ' },
  CHECK: { icon: ShieldCheck, color: 'text-info', badge: 'CK' },
  DEFAULT: { icon: Braces, color: 'text-plan', badge: 'DF' },
  FOREIGN_KEY: { icon: Link2, color: 'text-accent', badge: 'FK' },
};

interface Row {
  key: string;
  kind: 'constraint' | 'index' | 'trigger';
  name: string;
  badge: string;
  title: string;
  icon: Component;
  color: string;
  disabled: boolean;
}

function constraintTitle(constraint: TableConstraintItem): string {
  const parts = [constraint.name];
  const keys = constraint.keyColumns.map((column) => column.name).join(', ');

  if (constraint.kind === 'FOREIGN_KEY') {
    const referenced = constraint.refTable
      ? `${constraint.refSchema ? `${constraint.refSchema}.` : ''}${constraint.refTable} (${constraint.refColumns.join(', ')})`
      : '?';
    parts.push(`${t('sidebar.references')} ${referenced}`);
  } else if (keys) {
    parts.push(keys);
  } else if (constraint.definition) {
    parts.push(constraint.definition);
  }
  if (constraint.isDisabled || constraint.isNotTrusted) {
    parts.push(t('sidebar.disabledObject'));
  }

  return parts.join(' · ');
}

function indexTitle(index: TableIndexItem): string {
  const keys = index.columns
    .filter((column) => !column.isIncluded)
    .map((column) => `${column.name} ${column.descending ? 'DESC' : 'ASC'}`);
  const included = index.columns.filter((column) => column.isIncluded).map((column) => column.name);
  const parts = [index.name];

  if (keys.length > 0) parts.push(`${t('sidebar.indexKeys')} ${keys.join(', ')}`);
  if (included.length > 0) parts.push(`${t('sidebar.indexIncludes')} ${included.join(', ')}`);
  if (index.filterDefinition) parts.push(`${t('sidebar.indexFilter')} ${index.filterDefinition}`);
  if (index.isDisabled) parts.push(t('sidebar.disabledObject'));

  return parts.join(' · ');
}

function triggerTitle(trigger: TableTriggerItem): string {
  const parts = [trigger.name, trigger.events.join(', ') || 'TRIGGER'];
  if (trigger.isDisabled) parts.push(t('sidebar.disabledObject'));
  parts.push(t('sidebar.dblclickViewDefinition', { name: trigger.name }));

  return parts.join(' · ');
}

const rows = computed<Row[]>(() => [
  ...props.constraints.map((constraint) => {
    const presentation = KIND_ICONS[constraint.kind] ?? KIND_ICONS.CHECK;
    return {
      key: `constraint:${constraint.name}`,
      kind: 'constraint' as const,
      name: constraint.name,
      badge: presentation.badge,
      title: constraintTitle(constraint),
      icon: presentation.icon,
      color: presentation.color,
      disabled: constraint.isDisabled,
    };
  }),
  // The index behind a PRIMARY KEY / UNIQUE constraint is already listed as that constraint.
  ...props.indexes
    .filter((index) => !index.isPrimaryKey && !index.isUniqueConstraint)
    .map((index) => ({
      key: `index:${index.name}`,
      kind: 'index' as const,
      name: index.name,
      badge: [index.isUnique ? 'UNIQUE' : null, indexBadgeType(index)].filter(Boolean).join(' '),
      title: indexTitle(index),
      icon: List,
      color: 'text-ok',
      disabled: index.isDisabled,
    })),
  ...props.triggers.map((trigger) => ({
    key: `trigger:${trigger.name}`,
    kind: 'trigger' as const,
    name: trigger.name,
    badge: `${trigger.isInsteadOf ? 'INSTEAD OF ' : 'AFTER '}${trigger.events.join(', ') || '—'}`,
    title: triggerTitle(trigger),
    icon: Zap,
    color: 'text-warn',
    disabled: trigger.isDisabled,
  })),
]);
</script>
