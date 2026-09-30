<template>
  <Dialog
    :visible="isOpen"
    modal
    :dismissable-mask="true"
    :closable="true"
    :class="dialogWindow.marker"
    class="w-full max-w-xl h-[80vh] font-sans !bg-dark-900 overflow-hidden flex flex-col"
    :pt="{
      // The frame itself comes from the shared dialog surface; only the fill is local.
      root: { class: '!bg-dark-900 flex flex-col' },
      header: { class: '!bg-dark-850/90 !border-b !border-dark-750 !px-5 !py-3.5 flex-shrink-0' },
      content: { class: '!bg-dark-900 !px-5 !py-4 flex-1 overflow-y-auto' },
      footer: { class: '!bg-dark-850/80 !border-t !border-dark-750 !px-5 !py-3 flex-shrink-0' }
    }"
    @show="dialogWindow.onShow"
    @hide="dialogWindow.onHide"
    @update:visible="val => !val && close()"
  >
    <!-- Custom Modern Header -->
    <template #header>
      <div class="flex items-center space-x-3">
        <div class="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shadow-sm shadow-accent/10 flex-shrink-0">
          <i class="pi pi-database text-base" />
        </div>
        <div>
          <h3 class="font-semibold text-sm text-dark-100 leading-tight">
            {{ editProfile ? $t('connectionModal.editTitle') : (initialProfile ? $t('connectionModal.duplicateTitle') : $t('connectionModal.newTitle')) }}
          </h3>
          <p class="text-xxs text-dark-400 mt-0.5 font-mono">
            Microsoft SQL Server · TDS Protocol
          </p>
        </div>
      </div>
    </template>

    <form @submit.prevent="handleSave" class="space-y-4 text-xs">
      <!-- Quick Environment Preset Ribbon -->
      <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-dark-850/60 border border-dark-750/70">
        <span class="text-xxs font-medium text-dark-400 flex items-center gap-1.5">
          <i class="pi pi-sparkles text-accent text-xxs" />
          環境快速範本
        </span>
        <div class="flex items-center space-x-1.5">
          <button
            v-for="env in ENVIRONMENT_PRESETS"
            :key="env.key"
            type="button"
            @click="applyEnvironmentPreset(env)"
            class="px-2 py-0.5 rounded-md text-xxs font-medium transition-all flex items-center space-x-1 border"
            :class="[
              form.alias === env.alias
                ? 'bg-dark-750 border-dark-600 text-dark-100 shadow-sm'
                : 'bg-dark-900/50 border-dark-800 text-dark-400 hover:text-dark-200 hover:border-dark-700'
            ]"
            :title="env.desc"
          >
            <span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: env.color }" />
            <span>{{ env.label }}</span>
          </button>
        </div>
      </div>

      <!-- Section 1: Server & Database Card -->
      <div class="rounded-xl bg-dark-850/50 border border-dark-750/80 p-3.5 space-y-3 transition-colors hover:border-dark-700">
        <div class="flex items-center justify-between text-xs font-semibold text-dark-200">
          <div class="flex items-center space-x-1.5">
            <i class="pi pi-server text-accent text-xs" />
            <span>{{ $t('connectionModal.serverAndDatabase') }}</span>
          </div>
          <span class="text-xxs font-medium text-dark-500 font-mono">* 為必填欄位</span>
        </div>

        <div class="space-y-2.5 pt-0.5">
          <!-- Connection Name & Alias Row -->
          <div class="grid grid-cols-3 gap-2.5">
            <div class="col-span-2">
              <div class="flex items-center justify-between mb-1">
                <label class="block text-dark-300 font-medium text-xxs">{{ $t('connectionModal.nameRequired') }}</label>
                <span v-if="isDuplicateName" class="text-danger text-xxs font-medium animate-pulse">
                  {{ $t('connectionModal.nameExists') }}
                </span>
              </div>
              <InputText
                v-model="form.name"
                required
                placeholder="e.g. Local Development MSSQL"
                :invalid="isDuplicateName"
                class="w-full !text-xs !bg-dark-900/90 !border-dark-700 hover:!border-dark-600 focus:!border-accent !rounded-lg font-sans !py-1.5 !px-2.5"
              />
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-dark-300 font-medium text-xxs">{{ $t('connectionModal.alias') }}</label>
              </div>
              <InputText
                v-model="form.alias"
                placeholder="PROD, DEV"
                class="w-full !text-xs !bg-dark-900/90 !border-dark-700 hover:!border-dark-600 focus:!border-accent !rounded-lg font-mono uppercase !py-1.5 !px-2.5"
              />
            </div>
          </div>

          <!-- Host, Port, Database Row -->
          <div class="grid grid-cols-5 gap-2.5">
            <div class="col-span-3">
              <label class="block text-dark-300 font-medium text-xxs mb-1">{{ $t('connectionModal.hostRequired') }}</label>
              <InputText
                v-model="form.host"
                required
                placeholder="localhost or 127.0.0.1"
                class="w-full !text-xs !bg-dark-900/90 !border-dark-700 hover:!border-dark-600 focus:!border-accent !rounded-lg font-mono !py-1.5 !px-2.5"
              />
            </div>
            <div class="col-span-2">
              <label class="block text-dark-300 font-medium text-xxs mb-1">{{ $t('connectionModal.portRequired') }}</label>
              <InputNumber
                v-model="form.port"
                :use-grouping="false"
                required
                class="w-full !text-xs font-mono"
                input-class="!text-xs !bg-dark-900/90 !border-dark-700 hover:!border-dark-600 focus:!border-accent !rounded-lg font-mono w-full !py-1.5 !px-2.5"
              />
            </div>
          </div>

          <div>
            <label class="block text-dark-300 font-medium text-xxs mb-1">{{ $t('connectionModal.defaultDatabaseRequired') }}</label>
            <InputText
              v-model="form.database"
              required
              placeholder="master"
              class="w-full !text-xs !bg-dark-900/90 !border-dark-700 hover:!border-dark-600 focus:!border-accent !rounded-lg font-mono !py-1.5 !px-2.5"
            />
          </div>
        </div>
      </div>

      <!-- Section 2: Authentication Card -->
      <div class="rounded-xl bg-dark-850/50 border border-dark-750/80 p-3.5 space-y-3 transition-colors hover:border-dark-700">
        <div class="flex items-center space-x-1.5 text-xs font-semibold text-dark-200">
          <i class="pi pi-lock text-accent text-xs" />
          <span>{{ $t('connectionModal.authLegend') }}</span>
        </div>

        <div class="grid grid-cols-2 gap-2.5 pt-0.5">
          <div>
            <label class="block text-dark-300 font-medium text-xxs mb-1">{{ $t('connectionModal.usernameRequired') }}</label>
            <InputText
              v-model="form.username"
              required
              placeholder="sa"
              class="w-full !text-xs !bg-dark-900/90 !border-dark-700 hover:!border-dark-600 focus:!border-accent !rounded-lg font-mono !py-1.5 !px-2.5"
            />
          </div>
          <div>
            <label class="block text-dark-300 font-medium text-xxs mb-1">{{ $t('connectionModal.passwordLabel') }}</label>
            <Password
              v-model="form.password"
              :toggle-mask="true"
              :feedback="false"
              fluid
              class="w-full !text-xs"
              input-class="!text-xs !bg-dark-900/90 !border-dark-700 hover:!border-dark-600 focus:!border-accent !rounded-lg font-mono w-full !py-1.5 !px-2.5"
              :placeholder="editProfile ? $t('connectionModal.keepPasswordPlaceholder') : (initialProfile ? $t('connectionModal.reusePasswordPlaceholder') : $t('connectionModal.enterPasswordPlaceholder'))"
            />
          </div>
        </div>
      </div>

      <!-- Section 3: Security & Appearance Card -->
      <div class="rounded-xl bg-dark-850/50 border border-dark-750/80 p-3.5 space-y-3 transition-colors hover:border-dark-700">
        <div class="flex items-center space-x-1.5 text-xs font-semibold text-dark-200">
          <i class="pi pi-shield text-accent text-xs" />
          <span>{{ $t('connectionModal.securityLegend') }}</span>
        </div>

        <div class="space-y-3 pt-0.5">
          <!-- Modification Prompt Safe Guard Banner -->
          <div
            class="flex items-start space-x-3 p-2.5 rounded-lg border transition-all"
            :class="[
              form.modificationPrompt
                ? 'bg-amber-500/10 border-amber-500/35 shadow-sm shadow-amber-500/5'
                : 'bg-dark-900/40 border-dark-750/60'
            ]"
          >
            <ToggleSwitch v-model="form.modificationPrompt" class="mt-0.5 flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center space-x-2">
                <span
                  class="font-semibold text-xs transition-colors"
                  :class="form.modificationPrompt ? 'text-warn' : 'text-dark-200'"
                >
                  {{ $t('connectionModal.modificationPromptTitle') }}
                </span>
                <Tag
                  :severity="form.modificationPrompt ? 'warn' : 'secondary'"
                  value="SAFE GUARD"
                  class="!text-xxs !px-1.5 !py-0 font-mono font-semibold"
                />
              </div>
              <p class="text-xxs text-dark-400 mt-1 leading-relaxed">
                {{ $t('connectionModal.modificationPromptDesc') }}
              </p>
            </div>
          </div>

          <!-- TLS & Certificate Options -->
          <div class="flex items-center space-x-5 text-dark-300 px-0.5">
            <div class="flex items-center space-x-2 cursor-pointer select-none">
              <Checkbox v-model="form.encrypt" :binary="true" input-id="encrypt-cb" />
              <label for="encrypt-cb" class="cursor-pointer text-xxs hover:text-dark-100 transition-colors">
                {{ $t('connectionModal.forceTls') }}
              </label>
            </div>
            <div class="flex items-center space-x-2 cursor-pointer select-none">
              <Checkbox v-model="form.trustServerCertificate" :binary="true" input-id="trust-cert-cb" />
              <label for="trust-cert-cb" class="cursor-pointer text-xxs hover:text-dark-100 transition-colors">
                {{ $t('connectionModal.trustSelfSigned') }}
              </label>
            </div>
          </div>

          <!-- Color Palette Picker & Live Preview -->
          <div class="pt-1.5 border-t border-dark-750/70 flex flex-wrap items-center gap-3">
            <div class="flex items-center space-x-2">
              <label class="text-dark-300 font-medium text-xxs">{{ $t('connectionModal.colorLabel') }}</label>
              <div class="flex items-center space-x-1.5">
                <button
                  v-for="preset in PRESET_COLORS"
                  :key="preset"
                  type="button"
                  @click="form.color = preset"
                  :style="{ backgroundColor: preset }"
                  :class="[
                    'w-4 h-4 rounded-full border transition-all cursor-pointer shadow-sm',
                    form.color.toLowerCase() === preset.toLowerCase()
                      ? 'border-white scale-125 ring-2 ring-accent/40 shadow-accent/20'
                      : 'border-dark-600 hover:scale-115 opacity-80 hover:opacity-100'
                  ]"
                  :title="preset"
                />
              </div>
              <label class="relative cursor-pointer flex items-center justify-center w-5 h-5 rounded-md border border-dark-600 bg-dark-900 hover:border-dark-400 transition-colors" :title="$t('connectionModal.customColorTooltip')">
                <input
                  type="color"
                  v-model="form.color"
                  class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <span
                  class="w-3 h-3 rounded-sm border border-white/20 shadow-xs"
                  :style="{ backgroundColor: form.color || '#64748b' }"
                />
              </label>
              <Button
                v-if="form.color"
                :label="$t('common.clear')"
                size="small"
                text
                severity="secondary"
                class="!text-xxs !py-0 !px-1.5 !text-dark-400 hover:!text-dark-200"
                @click="form.color = ''"
              />
            </div>

            <!-- Live Badge Preview -->
            <div class="ml-auto flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-dark-900 border border-dark-750 text-xxs shadow-inner">
              <span class="text-dark-500 font-mono text-xxs font-medium">{{ $t('connectionModal.preview') }}</span>
              <span
                class="w-2 h-2 rounded-full shrink-0 shadow-xs"
                :style="{ backgroundColor: form.color || '#64748b' }"
              />
              <span class="font-medium truncate max-w-[110px]" :style="{ color: connectionLabelColor || undefined }">
                {{ form.name.trim() || 'New Connection' }}
              </span>
              <Tag
                v-if="form.alias.trim()"
                severity="secondary"
                :value="form.alias.trim()"
                class="!text-xxs !px-1.5 !py-0 font-mono font-medium uppercase"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Feedback Messages -->
      <transition enter-active-class="transition duration-200 ease-out" enter-from-class="opacity-0 -translate-y-1" enter-to-class="opacity-100 translate-y-0">
        <div
          v-if="testResult"
          class="p-2.5 rounded-xl border flex items-start space-x-2.5 text-xs"
          :class="[
            testResult.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          ]"
        >
          <i
            class="mt-0.5 text-sm flex-shrink-0"
            :class="testResult.success ? 'pi pi-check-circle text-emerald-400' : 'pi pi-times-circle text-rose-400'"
          />
          <div class="flex-1 min-w-0">
            <span class="font-semibold block text-xs">
              {{ testResult.success ? $t('connectionModal.testSuccessTitle') : $t('connectionModal.testFailedTitle') }}
            </span>
            <span v-if="testResult.message" class="block text-xxs mt-0.5 font-mono leading-relaxed break-all">
              {{ testResult.message }}
            </span>
          </div>
        </div>
      </transition>
    </form>

    <!-- Modal Footer Actions -->
    <template #footer>
      <div class="flex items-center justify-between w-full">
        <Button
          type="button"
          :label="$t('connectionModal.testButton')"
          icon="pi pi-bolt"
          severity="secondary"
          size="small"
          outlined
          class="!text-xs !py-1.5 !px-3 hover:!bg-dark-750"
          :loading="isTesting"
          @click="handleTest"
        />

        <div class="flex items-center space-x-2">
          <Button
            type="button"
            :label="$t('connectionModal.cancelButton')"
            severity="secondary"
            size="small"
            text
            class="!text-xs !py-1.5 !px-3 hover:!bg-dark-750"
            @click="close"
          />
          <Button
            type="button"
            :label="$t('connectionModal.saveAndConnectButton')"
            icon="pi pi-check"
            severity="primary"
            size="small"
            class="!text-xs !py-1.5 !px-3.5 shadow-md shadow-brand-500/20"
            :loading="isSaving"
            :disabled="isDuplicateName || !form.name.trim()"
            @click="handleSave"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch, computed } from 'vue';
import Dialog from 'primevue/dialog';
import { useDialogWindow } from '@/composables/useDialogWindow';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Password from 'primevue/password';
import ToggleSwitch from 'primevue/toggleswitch';
import Checkbox from 'primevue/checkbox';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import type { ConnectionProfile } from '@/types/connection';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { generateDuplicateConnectionName } from '@/utils/connectionNameHelper';
import { resolveConnectionLabelColor } from '@/utils/connectionColor';

const props = defineProps<{
  isOpen: boolean;
  editProfile?: ConnectionProfile | null;
  initialProfile?: ConnectionProfile | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved', profile: ConnectionProfile): void;
}>();

const dialogWindow = useDialogWindow();
const connectionStore = useConnectionStore();
const settingsStore = useSettingsStore();

const PRESET_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ec4899', // Pink
];

interface EnvironmentPreset {
  key: string;
  label: string;
  alias: string;
  color: string;
  modificationPrompt: boolean;
  desc: string;
}

const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  {
    key: 'prod',
    label: '正式 (PROD)',
    alias: 'PROD',
    color: '#ef4444',
    modificationPrompt: true,
    desc: '生產正式環境：高警示紅色標籤，強制開啟危險指令保護',
  },
  {
    key: 'stage',
    label: '測試 (STAGE)',
    alias: 'STAGE',
    color: '#f59e0b',
    modificationPrompt: false,
    desc: '預備/整合測試環境：黃色警告標籤',
  },
  {
    key: 'dev',
    label: '開發 (DEV)',
    alias: 'DEV',
    color: '#10b981',
    modificationPrompt: false,
    desc: '日常開發環境：綠色標籤',
  },
  {
    key: 'local',
    label: '本機 (LOCAL)',
    alias: 'LOCAL',
    color: '#06b6d4',
    modificationPrompt: false,
    desc: '本機 Docker / LocalDB：青色標籤',
  },
];

function applyEnvironmentPreset(env: EnvironmentPreset) {
  form.alias = env.alias;
  form.color = env.color;
  form.modificationPrompt = env.modificationPrompt;
}

const form = reactive({
  name: '',
  alias: '',
  host: 'localhost',
  port: 1433,
  database: 'master',
  username: 'sa',
  password: '',
  encrypt: false,
  trustServerCertificate: true,
  color: '',
  modificationPrompt: false,
});

const isTesting = ref(false);
const isSaving = ref(false);
const testResult = ref<{ success: boolean; message?: string } | null>(null);

/** Connection labels use the user-picked colour but must stay readable on the current surface. */
const connectionLabelColor = computed(() =>
  resolveConnectionLabelColor(form.color?.trim(), settingsStore.colorMode)
);

const isDuplicateName = computed(() => {
  return connectionStore.isNameDuplicate(form.name, props.editProfile?.id);
});

watch(
  () => [props.isOpen, props.editProfile, props.initialProfile],
  () => {
    if (!props.isOpen) return;

    if (props.editProfile) {
      form.name = props.editProfile.name;
      form.alias = props.editProfile.alias || '';
      form.host = props.editProfile.host;
      form.port = props.editProfile.port;
      form.database = props.editProfile.database;
      form.username = props.editProfile.username;
      form.password = '';
      form.encrypt = props.editProfile.encrypt;
      form.trustServerCertificate = props.editProfile.trustServerCertificate;
      form.color = props.editProfile.color || '';
      form.modificationPrompt = props.editProfile.modificationPrompt ?? false;
    } else if (props.initialProfile) {
      form.name = generateDuplicateConnectionName(
        props.initialProfile.name,
        connectionStore.connections.map((c) => c.name)
      );
      form.alias = props.initialProfile.alias || '';
      form.host = props.initialProfile.host;
      form.port = props.initialProfile.port;
      form.database = props.initialProfile.database;
      form.username = props.initialProfile.username;
      form.password = '';
      form.encrypt = props.initialProfile.encrypt;
      form.trustServerCertificate = props.initialProfile.trustServerCertificate;
      form.color = props.initialProfile.color || '';
      form.modificationPrompt = props.initialProfile.modificationPrompt ?? false;
    } else {
      form.name = 'New SQL Server';
      form.alias = '';
      form.host = 'localhost';
      form.port = 1433;
      form.database = 'master';
      form.username = 'sa';
      form.password = '';
      form.encrypt = false;
      form.trustServerCertificate = true;
      form.color = '';
      form.modificationPrompt = false;
    }
    testResult.value = null;
  },
  { immediate: true }
);

function close() {
  testResult.value = null;
  emit('close');
}

async function handleTest() {
  isTesting.value = true;
  testResult.value = null;
  try {
    const copyFrom = props.initialProfile && !form.password.trim() ? props.initialProfile.id : undefined;
    await connectionStore.testConnection({
      id: props.editProfile?.id,
      name: form.name,
      alias: form.alias.trim() || undefined,
      engine: 'mssql',
      host: form.host,
      port: form.port,
      database: form.database,
      username: form.username,
      password: form.password,
      encrypt: form.encrypt,
      trustServerCertificate: form.trustServerCertificate,
      color: form.color.trim() || undefined,
      modificationPrompt: form.modificationPrompt,
      copyPasswordFrom: copyFrom,
    });
    testResult.value = { success: true, message: '已成功連線至 Microsoft SQL Server。' };
  } catch (err: unknown) {
    testResult.value = {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    isTesting.value = false;
  }
}

async function handleSave() {
  isSaving.value = true;
  try {
    const copyFrom = props.initialProfile && !form.password.trim() ? props.initialProfile.id : undefined;
    const saved = await connectionStore.saveConnection({
      id: props.editProfile?.id,
      name: form.name,
      alias: form.alias.trim() || undefined,
      engine: 'mssql',
      host: form.host,
      port: form.port,
      database: form.database,
      username: form.username,
      password: form.password,
      encrypt: form.encrypt,
      trustServerCertificate: form.trustServerCertificate,
      color: form.color.trim() || undefined,
      modificationPrompt: form.modificationPrompt,
      copyPasswordFrom: copyFrom,
    });
    await connectionStore.connect(saved.id);
    emit('saved', saved);
    close();
  } catch (err: unknown) {
    testResult.value = {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    isSaving.value = false;
  }
}
</script>
