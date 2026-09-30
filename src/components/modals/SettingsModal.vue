<template>
  <Dialog
    :visible="isOpen"
    modal
    :dismissable-mask="true"
    :closable="true"
    :class="dialogWindow.marker"
    class="w-[860px] h-[80vh] max-w-[95vw] max-h-[92vh] font-sans"
    content-class="!p-0 flex flex-col overflow-hidden h-full"
    @show="dialogWindow.onShow"
    @hide="dialogWindow.onHide"
    @update:visible="val => !val && $emit('close')"
  >
    <template #header>
      <div class="flex items-center space-x-2">
        <i class="pi pi-cog text-accent text-base" />
        <span class="text-sm font-semibold text-dark-100">{{ $t('settingsModal.title') }}</span>
      </div>
    </template>

    <!-- Navigation Tabs -->
    <div class="flex border-b border-dark-750 bg-dark-850 px-5 pt-2 space-x-2 flex-shrink-0 text-xs">
      <Button
        v-for="tab in tabs"
        :key="tab.id"
        :label="tab.label"
        :icon="tab.icon"
        size="small"
        :severity="activeTab === tab.id ? 'primary' : 'secondary'"
        :text="activeTab !== tab.id"
        class="!text-xs !py-1 !px-2.5"
        @click="activeTab = tab.id"
      />
    </div>

    <!-- Modal Body -->
    <div class="p-6 overflow-y-auto flex-1 space-y-6 text-xs text-dark-200">
      <!-- Tab 0: Appearance & Theme Settings -->
      <div v-if="activeTab === 'theme'" class="space-y-6">
        <!-- Language Selector -->
        <div class="space-y-2.5 pb-4 border-b border-dark-800">
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="font-medium text-dark-100 block">{{ $t('settingsModal.language') }}</label>
              <span class="text-xxs text-dark-400">{{ $t('settingsModal.languageDesc') }}</span>
            </div>
            <Select
              :model-value="settingsStore.locale"
              :options="SUPPORTED_LOCALES"
              option-label="label"
              option-value="value"
              class="min-w-[240px] !text-xs !bg-dark-900 !border-dark-700"
              @update:model-value="handleLocaleChange"
            />
          </div>
        </div>

        <!-- Global UI Font -->
        <div class="space-y-2.5 pb-4 border-b border-dark-800">
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="font-medium text-dark-100 block">{{ $t('settingsModal.globalFont') }}</label>
              <span class="text-xxs text-dark-400">{{ $t('settingsModal.globalFontDesc') }}</span>
            </div>
            <FontFamilyPicker
              :model-value="settingsStore.globalFontFamily"
              :options="globalFontSelectOptions"
              :default-value="DEFAULT_GLOBAL_FONT_FAMILY"
              select-class="min-w-[240px] !text-xs !bg-dark-900 !border-dark-700"
              @update:model-value="handleGlobalFontChange"
            />
          </div>
          <div
            class="rounded-md border border-dark-750 bg-dark-900/70 px-3 py-2.5 text-sm text-dark-100"
            :style="{ fontFamily: settingsStore.globalFontFamily }"
          >
            PuffSQL 資料庫工具 · 查詢結果 · ABC 123
          </div>
          <span v-if="selectedGlobalFont" class="text-xxs text-dark-500 block">
            {{ selectedGlobalFont.description }}
          </span>
        </div>

        <!-- 1. Color Mode (Dark / Light) -->
        <div class="flex items-center justify-between pb-4 border-b border-dark-800">
          <div>
            <label class="font-medium text-dark-100 block">{{ $t('settingsModal.colorMode') }}</label>
            <span class="text-xxs text-dark-400">{{ $t('settingsModal.colorModeDesc') }}</span>
          </div>
          <SelectButton
            :model-value="settingsStore.colorMode"
            :options="[
              { label: $t('settingsModal.darkMode'), value: 'dark', icon: 'pi pi-moon' },
              { label: $t('settingsModal.lightMode'), value: 'light', icon: 'pi pi-sun' },
            ]"
            option-label="label"
            option-value="value"
            class="!text-xs"
            @update:model-value="val => val && settingsStore.setColorMode(val as 'dark' | 'light')"
          >
            <template #option="slotProps">
              <div class="flex items-center space-x-1.5 py-0.5 px-1">
                <i :class="slotProps.option.icon" class="text-xs" />
                <span>{{ slotProps.option.label }}</span>
              </div>
            </template>
          </SelectButton>
        </div>

        <!-- 2. Theme Preset (Aura, Lara, Nora, Material) -->
        <div class="space-y-2 pb-4 border-b border-dark-800">
          <div class="flex items-center justify-between">
            <div>
              <label class="font-medium text-dark-100 block">{{ $t('settingsModal.themePreset') }}</label>
              <span class="text-xxs text-dark-400">{{ $t('settingsModal.themePresetDesc') }}</span>
            </div>
            <span class="text-xxs font-mono text-accent font-semibold">{{ settingsStore.themePreset }}</span>
          </div>
          <div class="grid grid-cols-4 gap-2.5">
            <button
              v-for="preset in themePresets"
              :key="preset.id"
              type="button"
              class="flex flex-col items-start p-2.5 rounded border text-left transition-all cursor-pointer"
              :class="settingsStore.themePreset === preset.id
                ? 'border-brand-500 bg-brand-500/10 text-dark-100 ring-1 ring-brand-500'
                : 'border-dark-750 bg-dark-900/60 hover:border-dark-600 text-dark-300 hover:text-dark-200'"
              @click="settingsStore.setThemePreset(preset.id)"
            >
              <div class="flex items-center justify-between w-full mb-1">
                <span class="font-semibold text-xs text-dark-100">{{ preset.label }}</span>
                <i v-if="settingsStore.themePreset === preset.id" class="pi pi-check-circle text-accent text-xs" />
              </div>
              <span class="text-[11px] text-dark-400 leading-snug">{{ preset.desc }}</span>
            </button>
          </div>
        </div>

        <!-- 3. Primary Color Palette -->
        <div class="space-y-2.5 pb-4 border-b border-dark-800">
          <div class="flex items-center justify-between">
            <div>
              <label class="font-medium text-dark-100 block">{{ $t('settingsModal.primaryColor') }}</label>
              <span class="text-xxs text-dark-400">{{ $t('settingsModal.primaryColorDesc') }}</span>
            </div>
            <span class="text-xxs font-mono text-dark-300">{{ currentPrimaryLabel }}</span>
          </div>

          <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
            <button
              v-for="color in PRIMARY_COLOR_OPTIONS"
              :key="color.name"
              type="button"
              class="flex items-center space-x-2 p-1.5 rounded border transition-all cursor-pointer text-left"
              :class="settingsStore.primaryColor === color.name
                ? 'border-brand-500 bg-brand-500/15 ring-1 ring-brand-500 text-dark-100'
                : 'border-dark-750 bg-dark-900/50 hover:border-dark-600 text-dark-300 hover:text-dark-200'"
              @click="settingsStore.setPrimaryColor(color.name)"
            >
              <div
                class="w-4.5 h-4.5 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xxs shadow-xs"
                :style="{ backgroundColor: color.color }"
              >
                <i
                  v-if="settingsStore.primaryColor === color.name"
                  class="pi pi-check"
                  :style="{ color: pickReadableTextColor(color.color) }"
                />
              </div>
              <span class="text-xxs truncate">{{ color.label.split(' ')[0] }}</span>
            </button>
          </div>
        </div>

        <!-- 4. Surface Palette -->
        <div class="space-y-2.5 pb-4 border-b border-dark-800">
          <div class="flex items-center justify-between">
            <div>
              <label class="font-medium text-dark-100 block">{{ $t('settingsModal.surfaceColor') }}</label>
              <span class="text-xxs text-dark-400">{{ $t('settingsModal.surfaceColorDesc') }}</span>
            </div>
            <span class="text-xxs font-mono text-dark-300">{{ currentSurfaceLabel }}</span>
          </div>

          <div class="grid grid-cols-5 gap-2">
            <button
              v-for="surface in SURFACE_OPTIONS"
              :key="surface.name"
              type="button"
              class="flex flex-col p-2 rounded border transition-all cursor-pointer text-left space-y-1.5"
              :class="settingsStore.surfaceColor === surface.name
                ? 'border-brand-500 bg-brand-500/15 ring-1 ring-brand-500 text-dark-100'
                : 'border-dark-750 bg-dark-900/50 hover:border-dark-600 text-dark-300 hover:text-dark-200'"
              @click="settingsStore.setSurfaceColor(surface.name)"
            >
              <div class="flex items-center justify-between w-full">
                <span class="text-xxs font-semibold truncate">{{ surface.label.split(' ')[0] }}</span>
                <i v-if="settingsStore.surfaceColor === surface.name" class="pi pi-check-circle text-accent text-xxs" />
              </div>
              <div class="flex items-center space-x-1">
                <div
                  class="w-3.5 h-3.5 rounded border border-dark-600"
                  :style="{ backgroundColor: surface.sampleDark }"
                  title="Dark Surface"
                />
                <div
                  class="w-3.5 h-3.5 rounded border border-dark-300"
                  :style="{ backgroundColor: surface.sampleLight }"
                  title="Light Surface"
                />
                <span class="text-xxs font-medium text-dark-400 truncate">{{ surface.name }}</span>
              </div>
            </button>
          </div>
        </div>

        <!-- 5. Ripple Effect -->
        <div class="flex items-center justify-between pb-4 border-b border-dark-800">
          <div>
            <label class="font-medium text-dark-100 block">{{ $t('settingsModal.rippleEffect') }}</label>
            <span class="text-xxs text-dark-400">{{ $t('settingsModal.rippleEffectDesc') }}</span>
          </div>
          <ToggleSwitch
            :model-value="settingsStore.ripple"
            @update:model-value="val => handleRippleToggle(val)"
          />
        </div>

        <!-- 6. Live Component Preview -->
        <div class="space-y-2 p-3.5 rounded-lg border border-dark-750 bg-dark-900/80">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-dark-200 flex items-center space-x-1.5">
              <i class="pi pi-eye text-accent" />
              <span>{{ $t('settingsModal.livePreview') }}</span>
            </span>
            <span class="text-xxs text-dark-400">{{ $t('settingsModal.livePreviewDesc') }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2.5 pt-1">
            <Button label="主要按鈕" icon="pi pi-check" size="small" />
            <Button label="次要外框" severity="secondary" outlined size="small" />
            <Button label="文字按鈕" text size="small" />
            <Tag value="Tag 標籤" />
            <Badge value="99+" />
            <InputText placeholder="輸入框預覽..." size="small" class="w-32 !h-7 !text-xs" />
            <div class="flex items-center space-x-1.5 pl-2">
              <Checkbox :binary="true" :model-value="true" />
              <span class="text-xxs text-dark-300">核取方塊</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 1: Editor Settings -->
      <div v-else-if="activeTab === 'editor'" class="space-y-5">
        <!-- Font Size -->
        <div class="flex items-center justify-between">
          <div>
            <label class="font-medium text-dark-100 block">{{ $t('settingsModal.editorFontSize') }}</label>
            <span class="text-xxs text-dark-400">{{ $t('settingsModal.editorFontSizeDesc') }}</span>
          </div>
          <Select
            v-model="settingsStore.editorFontSize"
            :options="fontSizeOptions"
            option-label="label"
            option-value="value"
            class="!h-7 !text-xs !bg-dark-900 !border-dark-700 min-w-[90px]"
          />
        </div>

        <!-- Font Family -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="font-medium text-dark-100">{{ $t('settingsModal.editorFontFamily') }}</label>
            <span class="text-xxs text-dark-400 font-mono">{{ $t('settingsModal.editorFontFamilyDesc') }}</span>
          </div>
          <FontFamilyPicker
            v-model="settingsStore.editorFontFamily"
            :options="EDITOR_FONT_FAMILY_OPTIONS"
            :default-value="DEFAULT_EDITOR_FONT_FAMILY"
            preview
          />
        </div>

        <!-- Word Wrap -->
        <div class="flex items-center justify-between pt-2 border-t border-dark-800">
          <div>
            <label class="font-medium text-dark-100 block">{{ $t('settingsModal.editorWordWrap') }}</label>
            <span class="text-xxs text-dark-400">{{ $t('settingsModal.editorWordWrapDesc') }}</span>
          </div>
          <Select
            v-model="settingsStore.editorWordWrap"
            :options="[
              { label: '開啟 (On)', value: 'on' },
              { label: '關閉 (Off)', value: 'off' },
            ]"
            option-label="label"
            option-value="value"
            class="!h-7 !text-xs !bg-dark-900 !border-dark-700 min-w-[110px]"
          />
        </div>

        <!-- Tab Size -->
        <div class="flex items-center justify-between pt-2 border-t border-dark-800">
          <div>
            <label class="font-medium text-dark-100 block">{{ $t('settingsModal.editorTabSize') }}</label>
            <span class="text-xxs text-dark-400">{{ $t('settingsModal.editorTabSizeDesc') }}</span>
          </div>
          <Select
            v-model="settingsStore.editorTabSize"
            :options="[
              { label: '2 空格', value: 2 },
              { label: '4 空格', value: 4 },
            ]"
            option-label="label"
            option-value="value"
            class="!h-7 !text-xs !bg-dark-900 !border-dark-700 min-w-[90px]"
          />
        </div>

        <!-- Auto Completion Trigger Switch -->
        <div class="flex items-center justify-between pt-2 border-t border-dark-800">
          <div>
            <label class="font-medium text-dark-100 block">{{ $t('settingsModal.editorAutoCompletion') }}</label>
            <span class="text-xxs text-dark-400">{{ $t('settingsModal.editorAutoCompletionDesc') }}</span>
          </div>
          <ToggleSwitch v-model="settingsStore.editorAutoCompletion" />
        </div>

        <!-- Highlight Color -->
        <div class="flex items-center justify-between pt-2 border-t border-dark-800">
          <div>
            <label class="font-medium text-dark-100 block">{{ $t('settingsModal.editorHighlightColor') }}</label>
            <span class="text-xxs text-dark-400">{{ $t('settingsModal.editorHighlightColorDesc') }}</span>
          </div>
          <div class="flex items-center space-x-2">
            <input
              type="color"
              v-model="settingsStore.editorHighlightColor"
              class="w-7 h-7 rounded border border-dark-700 bg-dark-900 cursor-pointer p-0.5"
              title="選擇高亮顏色"
            />
            <InputText
              v-model="settingsStore.editorHighlightColor"
              class="w-20 !h-7 !bg-dark-900 !border-dark-700 !text-xs !font-mono text-center uppercase"
              placeholder="#feffe0"
            />
          </div>
        </div>

        <!-- Custom editor backdrop image (bottom-right aligned) -->
        <EditorBackgroundSettings />
      </div>

      <!-- Tab 2: Query & Results Settings -->
      <div v-else-if="activeTab === 'results'" class="space-y-5">
        <!-- Result grid font -->
        <div class="flex items-center justify-between pb-4 border-b border-dark-800">
          <div class="pr-4">
            <label class="font-medium text-dark-100 block">{{ $t('settingsModal.gridFont') }}</label>
            <span class="text-xxs text-dark-400">
              {{ $t('settingsModal.gridFontDesc') }}
            </span>
          </div>
          <FontFamilyPicker
            v-model="settingsStore.gridFontFamily"
            :options="GRID_FONT_FAMILY_OPTIONS"
            :default-value="DEFAULT_GRID_FONT_FAMILY"
            select-class="min-w-[240px] !text-xs !bg-dark-900 !border-dark-700 font-mono"
            preview
          />
        </div>

        <!-- Max Result Tabs -->
        <div class="flex items-center justify-between">
          <div class="pr-4">
            <label class="font-medium text-dark-100 block">{{ $t('settingsModal.maxResultTabs') }}</label>
            <span class="text-xxs text-dark-400">
              {{ $t('settingsModal.maxResultTabsDesc') }}
            </span>
          </div>
          <Select
            v-model="settingsStore.maxResultTabs"
            :options="[
              { label: '5 組', value: 5 },
              { label: '10 組 (預設)', value: 10 },
              { label: '15 組', value: 15 },
              { label: '20 組', value: 20 },
              { label: '30 組', value: 30 },
              { label: '50 組', value: 50 },
            ]"
            option-label="label"
            option-value="value"
            class="!h-7 !text-xs !bg-dark-900 !border-dark-700 min-w-[120px]"
          />
        </div>

        <!-- Default Max Rows -->
        <div class="flex items-center justify-between pt-2 border-t border-dark-800">
          <div class="pr-4">
            <label class="font-medium text-dark-100 block">{{ $t('settingsModal.defaultMaxRows') }}</label>
            <span class="text-xxs text-dark-400">{{ $t('settingsModal.defaultMaxRowsDesc') }}</span>
          </div>
          <Select
            v-model="settingsStore.defaultMaxRows"
            :options="[
              { label: '1,000 筆', value: 1000 },
              { label: '5,000 筆', value: 5000 },
              { label: '10,000 筆 (預設)', value: 10000 },
              { label: '50,000 筆', value: 50000 },
              { label: '無限制 (No Limit)', value: null },
            ]"
            option-label="label"
            option-value="value"
            class="!h-7 !text-xs !bg-dark-900 !border-dark-700 min-w-[140px]"
          />
        </div>


      </div>

      <!-- Tab 3: Table Filter -->
      <TableFilterTab v-else-if="activeTab === 'table_filter'" />

      <!-- Tab 4: AI Settings -->
      <AiSettingsTab v-else-if="activeTab === 'ai'" />

      <!-- Tab 5: About & Shortcuts -->
      <div v-else-if="activeTab === 'about'" class="space-y-4">
        <div class="bg-dark-900 border border-dark-750 p-4 rounded-lg space-y-3">
          <div class="flex items-center space-x-3">
            <img
              :src="appIcon"
              alt="PuffSQL"
              class="w-10 h-10 rounded-lg select-none shadow-sm flex-shrink-0"
              draggable="false"
            />
            <div>
              <div class="flex items-center space-x-2">
                <span class="font-bold text-dark-100 text-sm">PuffSQL</span>
                <Tag severity="info" value="v0.1.1" class="!text-xxs !font-mono !px-1.5 !py-0.5" />
              </div>
              <span class="text-xxs text-dark-400 font-mono">Lightweight & Fast SQL Client</span>
            </div>
          </div>
          <p class="text-xxs text-dark-400 leading-relaxed border-t border-dark-800 pt-2.5">
            {{ $t('settingsModal.aboutTitle') }}<br />
            {{ $t('settingsModal.aboutSubtitle') }}
          </p>
        </div>

        <!-- Keyboard Shortcuts -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-dark-100 text-xs">{{ $t('settingsModal.shortcutsTitle') }}</span>
            <span class="text-xxs text-dark-500 font-mono">{{ $t('settingsModal.shortcutsSubtitle') }}</span>
          </div>

          <div class="grid grid-cols-2 gap-2.5 text-xxs font-mono">
            <!-- Group 1: 查詢執行與中斷 -->
            <div class="bg-dark-900 p-2.5 rounded border border-dark-800 space-y-2">
              <div class="text-[11px] font-semibold text-ok flex items-center space-x-1.5 pb-1 border-b border-dark-800">
                <i class="pi pi-play text-xs"></i>
                <span>{{ $t('settingsModal.shortcutGroupRun') }}</span>
              </div>
              <div class="flex justify-between items-center py-0.5">
                <span class="text-dark-300">{{ $t('settingsModal.shortcutRunSelected') }}</span>
                <kbd class="bg-dark-800 px-1.5 py-0.5 rounded text-ok border border-dark-700">Ctrl + Enter</kbd>
              </div>
              <div class="flex justify-between items-center py-0.5">
                <span class="text-dark-300">{{ $t('settingsModal.shortcutRunAll') }}</span>
                <kbd class="bg-dark-800 px-1.5 py-0.5 rounded text-ok border border-dark-700">Ctrl+Shift+Enter</kbd>
              </div>
              <div class="flex justify-between items-center py-0.5">
                <span class="text-dark-300">{{ $t('settingsModal.shortcutCancel') }}</span>
                <kbd class="bg-dark-800 px-1.5 py-0.5 rounded text-danger border border-dark-700">Esc / Alt+Pause</kbd>
              </div>
            </div>

            <!-- Group 2: 分頁與檔案操作 -->
            <div class="bg-dark-900 p-2.5 rounded border border-dark-800 space-y-2">
              <div class="text-[11px] font-semibold text-info flex items-center space-x-1.5 pb-1 border-b border-dark-800">
                <i class="pi pi-folder text-xs"></i>
                <span>{{ $t('settingsModal.shortcutGroupTabs') }}</span>
              </div>
              <div class="flex justify-between items-center py-0.5">
                <span class="text-dark-300">{{ $t('settingsModal.shortcutNewTab') }}</span>
                <kbd class="bg-dark-800 px-1.5 py-0.5 rounded text-info border border-dark-700">Ctrl + N</kbd>
              </div>
              <div class="flex justify-between items-center py-0.5">
                <span class="text-dark-300">{{ $t('settingsModal.shortcutSaveFile') }}</span>
                <kbd class="bg-dark-800 px-1.5 py-0.5 rounded text-info border border-dark-700">Ctrl + S</kbd>
              </div>
              <div class="flex justify-between items-center py-0.5">
                <span class="text-dark-300">{{ $t('settingsModal.shortcutOpenFile') }}</span>
                <kbd class="bg-dark-800 px-1.5 py-0.5 rounded text-info border border-dark-700">Ctrl + O</kbd>
              </div>
            </div>

            <!-- Group 3: 編輯器輔助與格式化 -->
            <div class="bg-dark-900 p-2.5 rounded border border-dark-800 space-y-2">
              <div class="text-[11px] font-semibold text-warn flex items-center space-x-1.5 pb-1 border-b border-dark-800">
                <i class="pi pi-code text-xs"></i>
                <span>{{ $t('settingsModal.shortcutGroupEditor') }}</span>
              </div>
              <div class="flex justify-between items-center py-0.5">
                <span class="text-dark-300">{{ $t('settingsModal.shortcutCompletion') }}</span>
                <kbd class="bg-dark-800 px-1.5 py-0.5 rounded text-warn border border-dark-700">Ctrl+Shift+A</kbd>
              </div>
              <div class="flex justify-between items-center py-0.5">
                <span class="text-dark-300">{{ $t('settingsModal.shortcutFormat') }}</span>
                <kbd class="bg-dark-800 px-1.5 py-0.5 rounded text-warn border border-dark-700">Shift+Alt+F</kbd>
              </div>
              <div class="flex justify-between items-center py-0.5">
                <span class="text-dark-300">{{ $t('settingsModal.shortcutAi') }}</span>
                <kbd class="bg-dark-800 px-1.5 py-0.5 rounded text-warn border border-dark-700">Ctrl + I</kbd>
              </div>
              <div class="flex justify-between items-center py-0.5">
                <span class="text-dark-300">{{ $t('settingsModal.shortcutDuplicateLine') }}</span>
                <kbd class="bg-dark-800 px-1.5 py-0.5 rounded text-dark-200 border border-dark-700">Ctrl + D</kbd>
              </div>
              <div class="flex justify-between items-center py-0.5">
                <span class="text-dark-300">{{ $t('settingsModal.shortcutFindReplace') }}</span>
                <kbd class="bg-dark-800 px-1.5 py-0.5 rounded text-dark-200 border border-dark-700">Ctrl+F / Ctrl+H</kbd>
              </div>
            </div>

            <!-- Group 4: 檢索、結果與圖表 -->
            <div class="bg-dark-900 p-2.5 rounded border border-dark-800 space-y-2">
              <div class="text-[11px] font-semibold text-er flex items-center space-x-1.5 pb-1 border-b border-dark-800">
                <i class="pi pi-search text-xs"></i>
                <span>{{ $t('settingsModal.shortcutGroupExplore') }}</span>
              </div>
              <div class="flex justify-between items-center py-0.5">
                <span class="text-dark-300">{{ $t('settingsModal.shortcutQuickFinder') }}</span>
                <kbd class="bg-dark-800 px-1.5 py-0.5 rounded text-er border border-dark-700">Ctrl + P</kbd>
              </div>
              <div class="flex justify-between items-center py-0.5">
                <span class="text-dark-300">{{ $t('settingsModal.shortcutCopyCell') }}</span>
                <kbd class="bg-dark-800 px-1.5 py-0.5 rounded text-structure border border-dark-700">Ctrl + C</kbd>
              </div>
              <div class="flex justify-between items-center py-0.5">
                <span class="text-dark-300">{{ $t('settingsModal.shortcutSelectAllRows') }}</span>
                <kbd class="bg-dark-800 px-1.5 py-0.5 rounded text-structure border border-dark-700">Ctrl + A</kbd>
              </div>
              <div class="flex justify-between items-center py-0.5">
                <span class="text-dark-300">{{ $t('settingsModal.shortcutErDelete') }}</span>
                <kbd class="bg-dark-800 px-1.5 py-0.5 rounded text-dark-200 border border-dark-700">Del / Backspace</kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Footer -->
    <template #footer>
      <div class="px-5 py-2.5 border-t border-dark-750 bg-dark-800/80 flex items-center justify-between w-full">
        <Button
          type="button"
          :label="$t('settingsModal.resetDefaults')"
          severity="danger"
          size="small"
          text
          class="!text-xxs"
          @click="handleReset"
        />
        <Button
          type="button"
          :label="$t('settingsModal.done')"
          severity="primary"
          size="small"
          @click="$emit('close')"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import appIcon from '../../../src-tauri/icons/64x64.png';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import ToggleSwitch from 'primevue/toggleswitch';
import Badge from 'primevue/badge';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Tag from 'primevue/tag';
import { usePrimeVue } from 'primevue/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { useDialogWindow } from '@/composables/useDialogWindow';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@/i18n';
import {
  GLOBAL_FONT_OPTIONS,
  DEFAULT_GLOBAL_FONT_FAMILY,
  PRIMARY_COLOR_OPTIONS,
  SURFACE_OPTIONS,
  type ThemePresetName,
} from '@/services/themeManager';
import {
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_GRID_FONT_FAMILY,
  EDITOR_FONT_FAMILY_OPTIONS,
  GRID_FONT_FAMILY_OPTIONS,
} from '@/data/fontOptions';
import FontFamilyPicker from '@/components/common/FontFamilyPicker.vue';
import TableFilterTab from './TableFilterTab.vue';
import AiSettingsTab from './settings/AiSettingsTab.vue';
import EditorBackgroundSettings from './settings/EditorBackgroundSettings.vue';
import { pickReadableTextColor } from '@/utils/connectionColor';

defineProps<{
  isOpen: boolean;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const { t } = useI18n();
const primevue = usePrimeVue();
const settingsStore = useSettingsStore();
const dialogWindow = useDialogWindow();
const activeTab = ref<'theme' | 'editor' | 'results' | 'table_filter' | 'ai' | 'about'>('theme');

const tabs = computed(() => [
  { id: 'theme' as const, label: t('settingsModal.tabs.appearance'), icon: 'pi pi-palette' },
  { id: 'editor' as const, label: t('settingsModal.tabs.editor'), icon: 'pi pi-code' },
  { id: 'results' as const, label: t('settingsModal.tabs.results'), icon: 'pi pi-table' },
  { id: 'table_filter' as const, label: t('settingsModal.tabs.filter'), icon: 'pi pi-filter' },
  { id: 'ai' as const, label: t('settingsModal.tabs.ai'), icon: 'pi pi-sparkles' },
  { id: 'about' as const, label: t('settingsModal.tabs.about'), icon: 'pi pi-info-circle' },
]);

function handleLocaleChange(val: unknown) {
  if (val && typeof val === 'string') {
    settingsStore.setLocale(val as SupportedLocale, primevue.config);
  }
}

const themePresets: { id: ThemePresetName; label: string; desc: string }[] = [
  { id: 'Aura', label: 'Aura (現代)', desc: '精緻圓角與柔和光澤，PuffSQL 預設推薦' },
  { id: 'Lara', label: 'Lara (經典)', desc: '經典俐落 Prime 風格，清晰穩健' },
  { id: 'Nora', label: 'Nora (極簡)', desc: '高對比扁平線條，簡約素雅' },
  { id: 'Material', label: 'Material (質樸)', desc: 'Google Material 3 規範，流暢現代' },
];

const currentPrimaryLabel = computed(() => {
  const match = PRIMARY_COLOR_OPTIONS.find((c) => c.name === settingsStore.primaryColor);
  return match ? match.label : settingsStore.primaryColor;
});

const currentSurfaceLabel = computed(() => {
  const match = SURFACE_OPTIONS.find((s) => s.name === settingsStore.surfaceColor);
  return match ? match.label : settingsStore.surfaceColor;
});

const globalFontSelectOptions = GLOBAL_FONT_OPTIONS.map(({ label, value }) => ({
  label,
  value,
}));

const selectedGlobalFont = computed(() =>
  GLOBAL_FONT_OPTIONS.find((option) => option.value === settingsStore.globalFontFamily)
);

function handleGlobalFontChange(fontFamily: unknown) {
  if (typeof fontFamily === 'string' && fontFamily.trim()) {
    settingsStore.setGlobalFontFamily(fontFamily);
  }
}

function handleRippleToggle(val: boolean) {
  settingsStore.setRipple(val, primevue.config);
}

const fontSizeOptions = [
  { label: '12 px', value: 12 },
  { label: '13 px', value: 13 },
  { label: '14 px', value: 14 },
  { label: '15 px', value: 15 },
  { label: '16 px', value: 16 },
  { label: '18 px', value: 18 },
  { label: '20 px', value: 20 },
];

function handleReset() {
  if (confirm(t('settingsModal.resetConfirm'))) {
    settingsStore.resetToDefaults();
  }
}
</script>
