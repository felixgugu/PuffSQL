<template>
  <!-- Main Template Explorer Dialog -->
  <Dialog
    :visible="isOpen"
    @update:visible="(val) => !val && closeModal()"
    modal
    :closable="false"
    :dismissableMask="true"
    :showHeader="false"
    :class="dialogWindow.marker"
    class="w-full max-w-5xl h-[80vh] !bg-dark-850 overflow-hidden"
    contentClass="!p-0 !bg-dark-850 h-full flex flex-col"
    @show="dialogWindow.onShow"
    @hide="dialogWindow.onHide"
  >
    <!-- Top Header & Search Area -->
    <div class="sq-dialog-drag-handle p-3.5 border-b border-dark-700 bg-dark-900/80 flex flex-col space-y-2.5 flex-shrink-0">
      <div class="flex items-center space-x-2.5">
        <i class="pi pi-book text-warn text-base flex-shrink-0"></i>
        <span class="text-sm font-semibold text-dark-100 flex items-center space-x-2">
          <span>{{ $t('sqlTemplates.title') }}</span>
          <Tag :value="templateStore.allTemplates.length" severity="secondary" class="!font-mono !text-xxs !px-1.5 !py-0.2" />
        </span>

        <div class="h-4 w-px bg-dark-700 mx-1"></div>

        <!-- Search Input with IconField -->
        <IconField class="flex-1">
          <InputIcon class="pi pi-search text-accent" />
          <InputText
            ref="searchInputRef"
            v-model="templateStore.searchQuery"
            type="text"
            :placeholder="$t('sqlTemplates.searchPlaceholder')"
            class="w-full !bg-dark-800 !border-dark-700 font-mono !text-xs text-dark-100 placeholder-dark-500"
            @keydown.down.prevent="navigateDown"
            @keydown.up.prevent="navigateUp"
            @keydown.enter="handleEnterKey"
            @keydown.esc.prevent="closeModal"
          />
        </IconField>

        <Button
          v-if="templateStore.searchQuery"
          type="button"
          icon="pi pi-times"
          text
          size="small"
          severity="secondary"
          @click="clearSearch"
          v-tooltip.top="$t('sqlTemplates.clearSearchTooltip')"
          class="!w-7 !h-7 !p-0 !rounded-md !border-0 hover:!bg-dark-750"
        />

        <!-- Close Button -->
        <Button
          type="button"
          icon="pi pi-times"
          text
          size="small"
          severity="secondary"
          @click="closeModal"
          v-tooltip.top="$t('sqlTemplates.closeTooltip')"
          class="!w-7 !h-7 !p-0 !rounded-md !border-0 !shadow-none hover:!bg-rose-500/20 hover:!text-danger"
        />
      </div>

      <!-- Category Filter Chips -->
      <div class="flex items-center justify-between text-xxs text-dark-400 pt-0.5">
        <div class="flex items-center space-x-1.5 overflow-x-auto">
          <Button
            v-for="chip in categoryChips"
            :key="chip.category"
            type="button"
            size="small"
            :severity="templateStore.activeCategory === chip.category ? 'primary' : 'secondary'"
            :variant="templateStore.activeCategory === chip.category ? undefined : 'outlined'"
            @click="templateStore.activeCategory = chip.category"
            class="!text-xxs !py-1 !px-2.5"
          >
            <span>{{ chip.label }}</span>
            <span class="ml-1 opacity-70 font-mono">({{ chip.count }})</span>
          </Button>
        </div>

        <!-- Reload & Add New Buttons -->
        <div class="flex items-center space-x-1.5 flex-shrink-0">
          <Button
            type="button"
            :icon="templateStore.isLoading ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'"
            :label="$t('sqlTemplates.reloadBtn')"
            size="small"
            severity="secondary"
            outlined
            @click="handleReloadFromDisk"
            :disabled="templateStore.isLoading"
            v-tooltip.top="$t('sqlTemplates.reloadTooltip')"
            class="!text-xxs !py-1 !px-2"
          />

          <Button
            type="button"
            icon="pi pi-plus"
            :label="$t('sqlTemplates.addNewBtn')"
            size="small"
            severity="primary"
            @click="openAddTemplateModal"
            v-tooltip.top="$t('sqlTemplates.addNewTooltip')"
            class="!text-xxs !py-1 !px-2.5"
          />
        </div>
      </div>
    </div>

    <!-- Main Content Area: Split View (Left: List, Right: Preview) -->
    <div class="flex-1 flex overflow-hidden min-h-0 divide-x divide-dark-750">
      <!-- Left Pane: Templates List (40%) -->
      <div class="w-[40%] flex flex-col overflow-hidden bg-dark-900/40">
        <div class="px-3 py-1.5 border-b border-dark-750/70 text-xxs text-dark-400 flex items-center justify-between">
          <span>{{ $t('sqlTemplates.searchResults', { count: templateStore.filteredTemplates.length }) }}</span>
          <span class="text-dark-500">{{ $t('sqlTemplates.navHint') }}</span>
        </div>

        <!-- Scrollable List -->
        <div
          v-if="templateStore.filteredTemplates.length > 0"
          ref="listContainerRef"
          class="flex-1 overflow-y-auto p-1.5 space-y-1"
        >
          <div
            v-for="(tpl, idx) in templateStore.filteredTemplates"
            :key="tpl.id"
            :ref="(el) => setItemRef(el, idx)"
            @click="selectTemplate(tpl)"
            @mouseenter="hoverIndex = idx"
            :class="[
              'p-2.5 rounded-lg cursor-pointer transition-all border text-left group relative',
              templateStore.selectedTemplate?.id === tpl.id
                ? 'bg-brand-500/15 border-brand-500/40 text-dark-100 ring-1 ring-brand-500/30 shadow-xs'
                : 'bg-dark-800/60 hover:bg-dark-800 border-dark-750/60 hover:border-dark-700 text-dark-300 hover:text-dark-200'
            ]"
          >
            <div class="flex items-center justify-between space-x-1 mb-1">
              <!-- Category Badge -->
              <div class="flex items-center space-x-1.5 min-w-0">
                <Tag
                  :severity="getCategorySeverity(tpl.category, tpl.isCustom)"
                  :value="tpl.categoryLabel || tpl.category"
                  class="!text-xxs !font-medium !px-1.5 !py-0.5 uppercase tracking-wider"
                />

                <Tag
                  v-if="tpl.isCustom"
                  severity="danger"
                  :value="$t('sqlTemplates.customDoc')"
                  class="!text-xxs !font-medium !px-1.5 !py-0.5"
                />
              </div>

              <span class="text-dark-500 text-xxs font-mono flex-shrink-0">
                #{{ idx + 1 }}
              </span>
            </div>

            <!-- Template Title -->
            <div class="font-medium text-xs text-dark-100 group-hover:text-accent transition-colors line-clamp-1 mb-1">
              {{ tpl.title }}
            </div>

            <!-- Short Description -->
            <div class="text-xxs text-dark-400 line-clamp-2 leading-relaxed">
              {{ tpl.description }}
            </div>

            <!-- Tags -->
            <div v-if="tpl.tags && tpl.tags.length > 0" class="flex flex-wrap gap-1 mt-1.5">
              <span
                v-for="tag in tpl.tags.slice(0, 3)"
                :key="tag"
                class="text-xxs font-medium px-1.5 py-0.5 bg-dark-750/80 text-dark-400 rounded"
              >
                #{{ tag }}
              </span>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-else
          class="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2 text-dark-400"
        >
          <i class="pi pi-search text-3xl text-dark-600 mb-1"></i>
          <span class="text-xs text-dark-300 font-medium">{{ $t('sqlTemplates.notFound') }}</span>
          <span class="text-xxs text-dark-500 max-w-xs">
            {{ $t('sqlTemplates.notFoundSub') }}
          </span>
          <Button
            type="button"
            :label="$t('sqlTemplates.resetSearchBtn')"
            size="small"
            severity="secondary"
            outlined
            @click="templateStore.searchQuery = ''; templateStore.activeCategory = 'all'"
            class="mt-2 !text-xxs !py-1 !px-2.5"
          />
        </div>
      </div>

      <!-- Right Pane: Preview & Actions (60%) -->
      <div class="w-[60%] flex flex-col overflow-hidden bg-dark-900/70">
        <template v-if="templateStore.selectedTemplate">
          <!-- Header / Action Bar -->
          <div class="p-3.5 border-b border-dark-750 bg-dark-850/60 flex items-center justify-between flex-shrink-0">
            <div class="min-w-0 flex-1 pr-3">
              <div class="flex items-center space-x-2 mb-1">
                <Tag
                  :severity="getCategorySeverity(templateStore.selectedTemplate.category, templateStore.selectedTemplate.isCustom)"
                  :value="templateStore.selectedTemplate.categoryLabel || templateStore.selectedTemplate.category"
                  class="!text-xxs uppercase tracking-wider"
                />
                <Tag
                  v-if="templateStore.selectedTemplate.isCustom"
                  severity="danger"
                  :value="$t('sqlTemplates.externalCustomDoc')"
                  class="!text-xxs"
                />
              </div>
              <h3 class="text-sm font-semibold text-dark-100 truncate">
                {{ templateStore.selectedTemplate.title }}
              </h3>
            </div>

            <!-- Action Buttons -->
            <div class="flex items-center space-x-1.5 flex-shrink-0">
              <!-- Copy Button -->
              <Button
                type="button"
                :icon="hasCopied ? 'pi pi-check' : 'pi pi-copy'"
                :label="hasCopied ? $t('sqlTemplates.copied') : $t('sqlTemplates.copy')"
                size="small"
                severity="secondary"
                outlined
                @click="copyCode(templateStore.selectedTemplate.code)"
                v-tooltip.top="$t('sqlTemplates.copyTooltip')"
                class="!text-xs !py-1.5 !px-2.5"
              />

              <!-- Open in New Tab Button -->
              <Button
                type="button"
                icon="pi pi-external-link"
                :label="$t('sqlTemplates.openInNewTab')"
                size="small"
                severity="secondary"
                outlined
                @click="openInNewTab(templateStore.selectedTemplate)"
                v-tooltip.top="$t('sqlTemplates.openInNewTabTooltip')"
                class="!text-xs !py-1.5 !px-2.5"
              />

              <!-- Insert at Cursor (Primary) -->
              <Button
                type="button"
                icon="pi pi-arrow-down-left"
                :label="$t('sqlTemplates.insertAtCursor')"
                size="small"
                severity="primary"
                @click="insertIntoEditor(templateStore.selectedTemplate)"
                v-tooltip.top="$t('sqlTemplates.insertAtCursorTooltip')"
                class="!text-xs !py-1.5 !px-3 shadow-xs"
              />

              <!-- If Custom: Edit / Delete -->
              <template v-if="templateStore.selectedTemplate.isCustom">
                <Button
                  type="button"
                  icon="pi pi-pencil"
                  text
                  rounded
                  size="small"
                  severity="secondary"
                  @click="openEditTemplateModal(templateStore.selectedTemplate)"
                  v-tooltip.top="$t('sqlTemplates.editTemplateTooltip')"
                  class="!p-1 !w-7 !h-7"
                />

                <Button
                  type="button"
                  icon="pi pi-trash"
                  text
                  rounded
                  size="small"
                  severity="danger"
                  @click="handleDeleteTemplate(templateStore.selectedTemplate.id)"
                  v-tooltip.top="$t('sqlTemplates.deleteTemplateTooltip')"
                  class="!p-1 !w-7 !h-7"
                />
              </template>
            </div>
          </div>

          <!-- Preview Content Area -->
          <div class="flex-1 overflow-y-auto p-4 space-y-3.5">
            <!-- Usage Notes / Description Card -->
            <div class="p-3 bg-dark-800/80 border border-dark-700/80 rounded-lg text-dark-300 text-xs leading-relaxed space-y-1.5">
              <div class="flex items-center space-x-1.5 font-semibold text-warn text-xxs uppercase tracking-wider">
                <i class="pi pi-info-circle text-xs"></i>
                <span>{{ $t('sqlTemplates.usageNotes') }}</span>
              </div>
              <div class="text-dark-200">
                {{ templateStore.selectedTemplate.description }}
              </div>
              <!-- Tags -->
              <div v-if="templateStore.selectedTemplate.tags.length > 0" class="flex flex-wrap gap-1 pt-1">
                <span
                  v-for="t in templateStore.selectedTemplate.tags"
                  :key="t"
                  class="text-xxs px-1.5 py-0.5 bg-dark-750 text-dark-400 rounded border border-dark-700/60 font-mono"
                >
                  #{{ t }}
                </span>
              </div>
            </div>

            <!-- SQL Code View Box -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xxs text-dark-400 font-mono">
                <span>{{ $t('sqlTemplates.codePreview') }}</span>
                <span>{{ $t('sqlTemplates.enterToInsert') }}</span>
              </div>

              <div class="relative bg-dark-950 border border-dark-700 rounded-lg overflow-hidden group">
                <pre
                  class="p-3.5 text-xs font-mono text-dark-100 overflow-x-auto select-text leading-relaxed whitespace-pre font-light"
                ><code>{{ templateStore.selectedTemplate.code }}</code></pre>
              </div>
            </div>
          </div>
        </template>

        <!-- No Selection Placeholder -->
        <div
          v-else
          class="flex-1 flex flex-col items-center justify-center p-8 text-center text-dark-500 space-y-2"
        >
          <i class="pi pi-book text-4xl text-dark-700"></i>
          <span class="text-xs text-dark-400">{{ $t('sqlTemplates.noSelection') }}</span>
        </div>
      </div>
    </div>

    <!-- Bottom Footer: File Info & Keyboard Shortcuts Bar -->
    <div class="px-3.5 py-2 border-t border-dark-700 bg-dark-900/90 flex items-center justify-between text-xxs text-dark-400 flex-shrink-0">
      <!-- Left: Co-located File Information -->
      <div class="flex items-center space-x-2 min-w-0 flex-1 mr-4">
        <span class="flex items-center space-x-1 text-dark-400 flex-shrink-0">
          <i class="pi pi-file text-accent text-xs"></i>
          <span>{{ $t('sqlTemplates.customDocLabel') }}</span>
        </span>
        <span
          class="text-dark-300 font-mono truncate max-w-md bg-dark-800 px-1.5 py-0.5 rounded border border-dark-750 select-text"
          :title="templateStore.customFilePath || 'sql_custom_templates.json'"
        >
          {{ templateStore.customFilePath || $t('sqlTemplates.colocatedDefault') }}
        </span>

        <Button
          type="button"
          icon="pi pi-folder-open"
          :label="$t('sqlTemplates.revealInExplorer')"
          size="small"
          severity="secondary"
          outlined
          @click="handleRevealInExplorer"
          v-tooltip.top="$t('sqlTemplates.revealTooltip')"
          class="!text-xxs !py-0.5 !px-2"
        />
      </div>

      <!-- Right: Keyboard Hints -->
      <div class="flex items-center space-x-2.5 flex-shrink-0 text-dark-400">
        <span><kbd class="px-1 py-0.5 bg-dark-800 border border-dark-700 rounded text-dark-300 font-mono">↑</kbd> <kbd class="px-1 py-0.5 bg-dark-800 border border-dark-700 rounded text-dark-300 font-mono">↓</kbd> {{ $t('sqlTemplates.selectKbd') }}</span>
        <span><kbd class="px-1 py-0.5 bg-dark-800 border border-dark-700 rounded text-dark-300 font-mono">Enter</kbd> {{ $t('sqlTemplates.insertKbd') }}</span>
        <span><kbd class="px-1 py-0.5 bg-dark-800 border border-dark-700 rounded text-dark-300 font-mono">Esc</kbd> {{ $t('sqlTemplates.closeKbd') }}</span>
      </div>
    </div>
  </Dialog>

  <!-- Add / Edit Custom Template Dialog -->
  <Dialog
    v-model:visible="isCustomFormOpen"
    modal
    :header="editingTemplateId ? $t('sqlTemplates.editModalTitle') : $t('sqlTemplates.addModalTitle')"
    :class="formDialogWindow.marker"
    class="w-full max-w-xl !bg-dark-850"
    @show="formDialogWindow.onShow"
    @hide="formDialogWindow.onHide"
  >
    <form @submit.prevent="saveCustomTemplateForm" class="p-2 space-y-3 text-xs font-sans">
      <!-- Title Field -->
      <div class="space-y-1">
        <label class="block text-dark-300 font-medium">{{ $t('sqlTemplates.tplTitle') }} <span class="text-danger">*</span></label>
        <InputText
          v-model="formState.title"
          required
          type="text"
          :placeholder="$t('sqlTemplates.tplTitlePlaceholder')"
          size="small"
          class="w-full"
        />
      </div>

      <!-- Category & Tags Row -->
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1">
          <label class="block text-dark-300 font-medium">{{ $t('sqlTemplates.tplCategory') }}</label>
          <Select
            v-model="formState.category"
            :options="customCategoryOptions"
            optionLabel="label"
            optionValue="value"
            size="small"
            class="w-full"
          />
        </div>

        <div class="space-y-1">
          <label class="block text-dark-300 font-medium">{{ $t('sqlTemplates.tplTags') }}</label>
          <InputText
            v-model="formState.tagsInput"
            type="text"
            :placeholder="$t('sqlTemplates.tplTagsPlaceholder')"
            size="small"
            class="w-full font-mono"
          />
        </div>
      </div>

      <!-- Description Field -->
      <div class="space-y-1">
        <label class="block text-dark-300 font-medium">{{ $t('sqlTemplates.tplDesc') }}</label>
        <Textarea
          v-model="formState.description"
          rows="2"
          :placeholder="$t('sqlTemplates.tplDescPlaceholder')"
          size="small"
          class="w-full resize-none leading-relaxed"
        />
      </div>

      <!-- SQL Code Field -->
      <div class="space-y-1">
        <label class="block text-dark-300 font-medium">{{ $t('sqlTemplates.tplCode') }} <span class="text-danger">*</span></label>
        <Textarea
          v-model="formState.code"
          required
          rows="7"
          placeholder="SELECT * FROM dbo.YourTable..."
          size="small"
          class="w-full font-mono resize-y leading-relaxed !bg-dark-950"
        />
      </div>

      <!-- Modal Footer -->
      <div class="pt-3 flex items-center justify-between border-t border-dark-750">
        <span class="text-xxs text-dark-500">
          {{ $t('sqlTemplates.saveLocationNotice') }}
        </span>
        <div class="flex items-center space-x-2">
          <Button
            type="button"
            :label="$t('sqlTemplates.cancel')"
            severity="secondary"
            size="small"
            @click="isCustomFormOpen = false"
          />
          <Button
            type="submit"
            :label="$t('sqlTemplates.saveTemplate')"
            severity="primary"
            size="small"
          />
        </div>
      </div>
    </form>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import Dialog from 'primevue/dialog';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useSqlTemplateStore } from '@/stores/sqlTemplateStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useDialogWindow } from '@/composables/useDialogWindow';
import type { SqlTemplate, SqlTemplateCategory } from '@/types/sqlTemplate';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'insert', template: SqlTemplate): void;
  (e: 'open-in-new-tab', template: SqlTemplate): void;
}>();

// Two dialogs live in this component; each needs its own instance so their drag handles and
// resize zones never collide.
const dialogWindow = useDialogWindow();
const formDialogWindow = useDialogWindow();
const { t } = useI18n();
const templateStore = useSqlTemplateStore();
const workspaceStore = useWorkspaceStore();

const searchInputRef = ref<any>(null);
const listContainerRef = ref<HTMLDivElement | null>(null);
const itemRefs = ref<HTMLElement[]>([]);

const hoverIndex = ref<number>(0);
const hasCopied = ref<boolean>(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

// Sub-Modal State for Custom Template Form
const isCustomFormOpen = ref(false);
const editingTemplateId = ref<string | null>(null);
const formState = reactive({
  title: '',
  category: 'custom' as SqlTemplateCategory,
  tagsInput: '',
  description: '',
  code: '',
});

const customCategoryOptions = computed(() => [
  { label: t('sqlTemplates.catCustom'), value: 'custom' },
  { label: t('sqlTemplates.catBasic'), value: 'basic' },
  { label: t('sqlTemplates.catCte'), value: 'cte' },
  { label: t('sqlTemplates.catAdvanced'), value: 'advanced' },
  { label: t('sqlTemplates.catInspection'), value: 'inspection' },
  { label: t('sqlTemplates.catMaintenance'), value: 'maintenance' },
]);

function setItemRef(el: unknown, idx: number) {
  if (el) {
    itemRefs.value[idx] = el as HTMLElement;
  }
}

const categoryChips = computed<{ category: SqlTemplateCategory; label: string; count: number }[]>(() => {
  const counts = templateStore.categoryCounts;
  return [
    { category: 'all', label: t('sqlTemplates.catAll'), count: counts.all },
    { category: 'basic', label: t('sqlTemplates.catBasic'), count: counts.basic },
    { category: 'cte', label: t('sqlTemplates.catCte'), count: counts.cte },
    { category: 'advanced', label: t('sqlTemplates.catAdvanced'), count: counts.advanced },
    { category: 'inspection', label: t('sqlTemplates.catInspection'), count: counts.inspection },
    { category: 'maintenance', label: t('sqlTemplates.catMaintenance'), count: counts.maintenance },
    { category: 'custom', label: t('sqlTemplates.catCustom'), count: counts.custom },
  ];
});

function getCategorySeverity(category: SqlTemplateCategory, isCustom?: boolean): string {
  if (isCustom || category === 'custom') {
    return 'danger';
  }
  switch (category) {
    case 'basic':
      return 'success';
    case 'cte':
      return 'info';
    case 'advanced':
      return 'warn';
    case 'inspection':
      return 'help';
    case 'maintenance':
      return 'secondary';
    default:
      return 'secondary';
  }
}

function clearSearch() {
  templateStore.searchQuery = '';
  focusSearchInput();
}

function focusSearchInput() {
  const el = searchInputRef.value;
  if (!el) return;
  if (typeof el.focus === 'function') {
    el.focus();
  } else if (el.$el && typeof el.$el.focus === 'function') {
    el.$el.focus();
  }
}

function closeModal() {
  emit('close');
}

function selectTemplate(tpl: SqlTemplate) {
  templateStore.selectedTemplateId = tpl.id;
}

function navigateDown() {
  const list = templateStore.filteredTemplates;
  if (list.length === 0) return;
  const currIdx = list.findIndex((t) => t.id === templateStore.selectedTemplate?.id);
  const nextIdx = (currIdx + 1) % list.length;
  const target = list[nextIdx];
  if (target) {
    templateStore.selectedTemplateId = target.id;
    scrollToItem(nextIdx);
  }
}

function navigateUp() {
  const list = templateStore.filteredTemplates;
  if (list.length === 0) return;
  const currIdx = list.findIndex((t) => t.id === templateStore.selectedTemplate?.id);
  const prevIdx = (currIdx - 1 + list.length) % list.length;
  const target = list[prevIdx];
  if (target) {
    templateStore.selectedTemplateId = target.id;
    scrollToItem(prevIdx);
  }
}

function scrollToItem(idx: number) {
  nextTick(() => {
    const el = itemRefs.value[idx];
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  });
}

function handleEnterKey() {
  if (templateStore.selectedTemplate) {
    insertIntoEditor(templateStore.selectedTemplate);
  }
}

function insertIntoEditor(template: SqlTemplate) {
  emit('insert', template);
  closeModal();
}

function openInNewTab(template: SqlTemplate) {
  emit('open-in-new-tab', template);
  closeModal();
}

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    hasCopied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      hasCopied.value = false;
    }, 2000);
    workspaceStore.showToast(t('sqlTemplates.templateCopied'), 'success', 2000);
  } catch (e) {
    console.warn('Failed to copy code:', e);
  }
}

async function handleReloadFromDisk() {
  await templateStore.loadTemplates(true);
  workspaceStore.showToast(t('sqlTemplates.reloadTooltip'), 'success', 2500);
}

async function handleRevealInExplorer() {
  await templateStore.openInExplorer();
  workspaceStore.showToast(t('sqlTemplates.revealTooltip'), 'info', 2500);
}

function openAddTemplateModal() {
  editingTemplateId.value = null;
  formState.title = '';
  formState.category = 'custom';
  formState.tagsInput = '';
  formState.description = '';
  formState.code = '';
  isCustomFormOpen.value = true;
}

function openEditTemplateModal(tpl: SqlTemplate) {
  editingTemplateId.value = tpl.id;
  formState.title = tpl.title;
  formState.category = tpl.category;
  formState.tagsInput = tpl.tags.join(', ');
  formState.description = tpl.description;
  formState.code = tpl.code;
  isCustomFormOpen.value = true;
}

async function saveCustomTemplateForm() {
  const tags = formState.tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter((t) => Boolean(t));

  const categoryLabels: Record<string, string> = {
    custom: t('sqlTemplates.catCustom'),
    basic: t('sqlTemplates.catBasic'),
    cte: t('sqlTemplates.catCte'),
    advanced: t('sqlTemplates.catAdvanced'),
    maintenance: t('sqlTemplates.catMaintenance'),
  };

  if (editingTemplateId.value) {
    await templateStore.updateCustomTemplate(editingTemplateId.value, {
      title: formState.title.trim(),
      category: formState.category,
      categoryLabel: categoryLabels[formState.category] || t('sqlTemplates.catCustom'),
      tags,
      description: formState.description.trim(),
      code: formState.code.trim(),
    });
    workspaceStore.showToast(t('sqlTemplates.templateSaved'), 'success', 2200);
  } else {
    await templateStore.addCustomTemplate({
      title: formState.title.trim(),
      category: formState.category,
      categoryLabel: categoryLabels[formState.category] || t('sqlTemplates.catCustom'),
      tags,
      description: formState.description.trim(),
      code: formState.code.trim(),
    });
    workspaceStore.showToast(t('sqlTemplates.templateSaved'), 'success', 2200);
  }

  isCustomFormOpen.value = false;
}

async function handleDeleteTemplate(id: string) {
  const tpl = templateStore.allTemplates.find((t) => t.id === id);
  const title = tpl?.title || '';
  if (confirm(t('sqlTemplates.deleteConfirm', { title }))) {
    await templateStore.deleteCustomTemplate(id);
    workspaceStore.showToast(t('sqlTemplates.templateDeleted'), 'info', 2200);
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      templateStore.loadTemplates();
      nextTick(() => {
        focusSearchInput();
      });
    }
  }
);
</script>
