<template>
  <SqDialog
    :visible="isOpen"
    dismissable-mask
    :class="dialogWindow.marker"
    class="w-full max-w-xl h-[80vh]"
    @show="dialogWindow.onShow"
    @hide="dialogWindow.onHide"
    @update:visible="val => !val && close()"
  >
    <template #header>
      <Database class="w-4 h-4 text-accent" />
      <span>
        {{ editProfile ? $t('connectionModal.editTitle') : (initialProfile ? $t('connectionModal.duplicateTitle') : $t('connectionModal.newTitle')) }}
      </span>
      <span class="text-xxs font-normal text-dark-400 font-mono">Microsoft SQL Server · TDS</span>
    </template>

    <form @submit.prevent="handleSave" class="space-y-4 text-xs">
      <!-- Quick Environment Preset Ribbon -->
      <div class="flex items-center justify-between px-3 py-2 rounded-md bg-dark-850/60 border border-dark-750/70">
        <span class="text-xxs font-medium text-dark-400 flex items-center gap-1.5">
          <Sparkles class="w-3 h-3 text-accent" />
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
                ? 'bg-dark-750 border-dark-600 text-dark-100'
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
      <div class="rounded-md bg-dark-850/50 border border-dark-750/80 p-3.5 space-y-3 transition-colors hover:border-dark-700">
        <div class="flex items-center justify-between text-xs font-semibold text-dark-200">
          <div class="flex items-center space-x-1.5">
            <Database class="w-3 h-3 text-accent" />
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
              <SqInput
                v-model="form.name"
                required
                placeholder="e.g. Local Development MSSQL"
                :invalid="isDuplicateName"
                class="w-full"
              />
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-dark-300 font-medium text-xxs">{{ $t('connectionModal.alias') }}</label>
              </div>
              <SqInput
                v-model="form.alias"
                placeholder="PROD, DEV"
                class="w-full font-mono uppercase"
              />
            </div>
          </div>

          <!-- Host, Port, Database Row -->
          <div class="grid grid-cols-5 gap-2.5">
            <div class="col-span-3">
              <label class="block text-dark-300 font-medium text-xxs mb-1">{{ $t('connectionModal.hostRequired') }}</label>
              <SqInput
                v-model="form.host"
                required
                placeholder="localhost or 127.0.0.1"
                class="w-full font-mono"
              />
            </div>
            <div class="col-span-2">
              <label class="block text-dark-300 font-medium text-xxs mb-1">{{ $t('connectionModal.portRequired') }}</label>
              <SqInput
                :model-value="String(form.port)"
                type="number"
                required
                class="w-full font-mono"
                @update:model-value="(value: string) => (form.port = Number(value))"
              />
            </div>
          </div>

          <div>
            <label class="block text-dark-300 font-medium text-xxs mb-1">{{ $t('connectionModal.defaultDatabaseRequired') }}</label>
            <SqInput
              v-model="form.database"
              required
              placeholder="master"
              class="w-full font-mono"
            />
          </div>
        </div>
      </div>

      <!-- Section 2: Authentication Card -->
      <div class="rounded-md bg-dark-850/50 border border-dark-750/80 p-3.5 space-y-3 transition-colors hover:border-dark-700">
        <div class="flex items-center space-x-1.5 text-xs font-semibold text-dark-200">
          <Lock class="w-3 h-3 text-accent" />
          <span>{{ $t('connectionModal.authLegend') }}</span>
        </div>

        <div class="grid grid-cols-2 gap-2.5 pt-0.5">
          <div>
            <label class="block text-dark-300 font-medium text-xxs mb-1">{{ $t('connectionModal.usernameRequired') }}</label>
            <SqInput
              v-model="form.username"
              required
              placeholder="sa"
              class="w-full font-mono"
            />
          </div>
          <div>
            <label class="block text-dark-300 font-medium text-xxs mb-1">{{ $t('connectionModal.passwordLabel') }}</label>
            <SqInput
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              class="w-full font-mono"
              :placeholder="editProfile ? $t('connectionModal.keepPasswordPlaceholder') : (initialProfile ? $t('connectionModal.reusePasswordPlaceholder') : $t('connectionModal.enterPasswordPlaceholder'))"
            >
              <template #suffix>
                <button
                  type="button"
                  class="flex items-center text-dark-500 hover:text-dark-200 transition-colors"
                  :aria-label="showPassword ? '隱藏密碼' : '顯示密碼'"
                  @click="showPassword = !showPassword"
                >
                  <Eye v-if="!showPassword" class="w-3.5 h-3.5" />
                  <EyeOff v-else class="w-3.5 h-3.5" />
                </button>
              </template>
            </SqInput>
          </div>
        </div>
      </div>

      <!-- Section 3: Security & Appearance Card -->
      <div class="rounded-md bg-dark-850/50 border border-dark-750/80 p-3.5 space-y-3 transition-colors hover:border-dark-700">
        <div class="flex items-center space-x-1.5 text-xs font-semibold text-dark-200">
          <ShieldCheck class="w-3 h-3 text-accent" />
          <span>{{ $t('connectionModal.securityLegend') }}</span>
        </div>

        <div class="space-y-3 pt-0.5">
          <!-- Modification Prompt Safe Guard Banner -->
          <div
            class="flex items-start space-x-3 p-2.5 rounded-md border transition-all"
            :class="[
              form.modificationPrompt
                ? 'bg-amber-500/10 border-amber-500/35'
                : 'bg-dark-900/40 border-dark-750/60'
            ]"
          >
            <SqSwitch v-model="form.modificationPrompt" class="mt-0.5 flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center space-x-2">
                <span
                  class="font-semibold text-xs transition-colors"
                  :class="form.modificationPrompt ? 'text-warn' : 'text-dark-200'"
                >
                  {{ $t('connectionModal.modificationPromptTitle') }}
                </span>
                <SqChip
                  :tone="form.modificationPrompt ? 'warn' : 'neutral'"
                  label="SAFE GUARD"
                  class="font-mono font-semibold"
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
              <SqCheckbox v-model="form.encrypt" id="encrypt-cb" />
              <label for="encrypt-cb" class="cursor-pointer text-xxs hover:text-dark-100 transition-colors">
                {{ $t('connectionModal.forceTls') }}
              </label>
            </div>
            <div class="flex items-center space-x-2 cursor-pointer select-none">
              <SqCheckbox v-model="form.trustServerCertificate" id="trust-cert-cb" />
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
                    'w-4 h-4 rounded-full border transition-all cursor-pointer',
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
                  class="w-3 h-3 rounded-[3px] border border-white/20"
                  :style="{ backgroundColor: form.color || '#64748b' }"
                />
              </label>
              <SqButton
                v-if="form.color"
                :label="$t('common.clear')"
                size="sm"
                @click="form.color = ''"
              />
            </div>

            <!-- Live Badge Preview -->
            <div class="ml-auto flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-dark-900 border border-dark-750 text-xxs">
              <span class="text-dark-500 font-mono text-xxs font-medium">{{ $t('connectionModal.preview') }}</span>
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :style="{ backgroundColor: form.color || '#64748b' }"
              />
              <span class="font-medium truncate max-w-[110px]" :style="{ color: connectionLabelColor || undefined }">
                {{ form.name.trim() || 'New Connection' }}
              </span>
              <SqChip
                v-if="form.alias.trim()"
                tone="neutral"
                :label="form.alias.trim()"
                class="font-mono font-medium uppercase"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Feedback Messages -->
      <transition enter-active-class="transition duration-200 ease-out" enter-from-class="opacity-0 -translate-y-1" enter-to-class="opacity-100 translate-y-0">
        <div
          v-if="testResult"
          class="p-2.5 rounded-md border flex items-start space-x-2.5 text-xs"
          :class="[
            testResult.success
              ? 'bg-ok/10 border-ok/30 text-ok'
              : 'bg-danger/10 border-danger/30 text-danger'
          ]"
        >
          <component
            :is="testResult.success ? CircleCheck : CircleX"
            class="mt-0.5 w-3.5 h-3.5 flex-shrink-0"
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
        <SqButton
          type="button"
          :label="$t('connectionModal.testButton')"
          variant="outline"
          :loading="isTesting"
          @click="handleTest"
        >
          <template #icon><Zap class="w-3.5 h-3.5" /></template>
        </SqButton>

        <div class="flex items-center space-x-2">
          <SqButton
            type="button"
            :label="$t('connectionModal.cancelButton')"
            @click="close"
          />
          <SqButton
            type="button"
            :label="$t('connectionModal.saveAndConnectButton')"
            tone="accent"
            variant="solid"
            :loading="isSaving"
            :disabled="isDuplicateName || !form.name.trim()"
            @click="handleSave"
          >
            <template #icon><Check class="w-3.5 h-3.5" /></template>
          </SqButton>
        </div>
      </div>
    </template>
  </SqDialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch, computed } from 'vue';
import SqDialog from '@/components/ui/SqDialog.vue';
import { useDialogWindow } from '@/composables/useDialogWindow';
import SqInput from '@/components/ui/SqInput.vue';
import { CircleCheck, CircleX, Database, Eye, EyeOff, Lock, ShieldCheck, Sparkles } from '@/components/icons';
import SqSwitch from '@/components/ui/SqSwitch.vue';
import SqCheckbox from '@/components/ui/SqCheckbox.vue';
import SqButton from '@/components/ui/SqButton.vue';
import { Check, Zap } from '@/components/icons';
import SqChip from '@/components/ui/SqChip.vue';
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

/** Reveals the password field: SqInput keeps the masking in a native input. */
const showPassword = ref(false);

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
