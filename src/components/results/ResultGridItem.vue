<template>
  <div class="w-full h-full flex flex-col bg-dark-900 overflow-hidden font-sans text-xs select-none">
    <!-- Subheader Toolbar: Result Set Info, Quick Filter, Warnings, Actions -->
    <div
      v-if="!hideToolbar"
      class="h-8 bg-dark-850 border-b border-dark-700 flex items-center justify-between px-2 flex-shrink-0 space-x-2"
    >
      <!-- Left: Result Set Label & Quick Filter -->
      <div class="flex items-center space-x-2 min-w-0">
        <!-- Multiple Result Set Index Badge -->
        <Tag
          v-if="totalSets > 1"
          severity="info"
          :value="`Result #${setIndex + 1} (${resultSet.rowCount ?? resultSet.rows.length})`"
          class="!text-xxs !font-normal !px-2 !py-0.5 flex-shrink-0"
        >
          <template #icon>
            <i class="pi pi-table mr-1 text-xs"></i>
          </template>
        </Tag>

        <!-- Quick Filter Input (PrimeVue InputText has no built-in clear, so the icon is overlaid) -->
        <IconField class="w-44 sm:w-56">
          <InputIcon class="pi pi-search text-dark-500 text-xs" />
          <InputText
            v-model="quickFilterInput"
            type="text"
            :placeholder="hasRows ? $t('results.filterPlaceholder') : $t('results.noDataToSearch')"
            :disabled="!hasRows"
            size="small"
            class="w-full !bg-dark-900 !border-dark-700 !py-0.5 !pl-7 !pr-6 !text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            v-if="quickFilterInput"
            type="button"
            class="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center text-dark-500 hover:text-dark-100 transition-colors"
            :title="$t('results.clearFilter')"
            @click="clearQuickFilter"
          >
            <X class="w-3 h-3" />
          </button>
        </IconField>

        <!-- Truncation Warning Badge (when max rows limit reached) -->
        <Tag
          v-if="resultSet.isTruncated"
          severity="warn"
          :value="$t('results.truncatedWarning', { count: resultSet.rowCount.toLocaleString(), total: (resultSet.totalCount ?? resultSet.rowCount).toLocaleString() })"
          class="hidden md:flex !text-xxs font-sans truncate"
        >
          <template #icon>
            <i class="pi pi-exclamation-triangle mr-1 text-xs"></i>
          </template>
        </Tag>

        <!-- Estimated Plan Badge -->
        <Tag
          v-if="queryStore.activeResultTab?.isShowplan"
          severity="info"
          :value="$t('results.estimatedPlan')"
          class="hidden md:flex !text-xxs font-sans truncate"
        >
          <template #icon>
            <i class="pi pi-sitemap mr-1 text-xs"></i>
          </template>
        </Tag>

        <div class="h-3.5 w-px bg-dark-750 mx-1 flex-shrink-0"></div>

        <!-- Inline Editing Toolbar: Revert & Commit -->
        <div class="flex items-center space-x-1 flex-shrink-0">
          <template v-if="editability.canEdit">
            <!-- Revert Button -->
            <Button
              type="button"
              icon="pi pi-undo"
              :label="$t('common.revert')"
              size="small"
              :severity="modifiedCount > 0 ? 'warn' : 'secondary'"
              outlined
              :disabled="modifiedCount === 0 || !hasRows"
              @click="handleRevertChanges"
              :v-tooltip.top="$t('results.revertAllTooltip')"
              class="!text-xxs !py-0.5 !px-2 select-none"
            />

            <!-- Commit Button -->
            <Button
              type="button"
              icon="pi pi-check"
              :label="modifiedCount > 0 ? $t('results.commitWithCount', { count: modifiedCount }) : $t('common.commit')"
              size="small"
              :severity="modifiedCount > 0 ? 'success' : 'secondary'"
              :disabled="modifiedCount === 0 || !hasRows"
              @click="openCommitModal"
              :v-tooltip.top="$t('results.commitChangesTooltip')"
              class="!text-xxs !py-0.5 !px-2.5 font-semibold select-none shadow-xs"
            />
          </template>

          <!-- Read-only Indicator when editing is not supported -->
          <template v-else>
            <Tag
              severity="secondary"
              :value="editability.shortReason || $t('results.readOnly')"
              v-tooltip.top="editability.reason"
              class="!text-xxs select-none"
            >
              <template #icon>
                <i class="pi pi-lock mr-1 text-xs text-dark-500"></i>
              </template>
            </Tag>
          </template>
        </div>
      </div>

      <!-- Right: Copy Tools, Row Stats & Maximize Toggle -->
      <div class="flex items-center space-x-1.5 flex-shrink-0">
        <!-- Refresh Button -->
        <Button
          type="button"
          :icon="isRefreshing ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'"
          :label="isRefreshing ? $t('common.refreshing') : $t('common.refresh')"
          size="small"
          severity="secondary"
          outlined
          :disabled="isRefreshing"
          @click="handleRefresh"
          :v-tooltip.top="isRefreshing ? $t('common.refreshing') : $t('results.refreshTooltip')"
          class="!text-xxs !py-0.5 !px-2"
        />

        <!-- Copy to TSV (Excel friendly) -->
        <Button
          type="button"
          :icon="copiedTsv ? 'pi pi-check text-ok' : 'pi pi-file-excel text-ok'"
          :label="copiedTsv ? 'Copied!' : 'Copy TSV'"
          size="small"
          severity="secondary"
          outlined
          @click="copyAsTsv"
          :v-tooltip.top="$t('results.copyTsvTooltip')"
          class="!text-xxs !py-0.5 !px-2"
        />

        <!-- Copy to CSV -->
        <Button
          type="button"
          :icon="copiedCsv ? 'pi pi-check text-accent' : 'pi pi-file text-accent'"
          :label="copiedCsv ? 'Copied!' : 'CSV'"
          size="small"
          severity="secondary"
          outlined
          @click="copyAsCsv"
          :v-tooltip.top="$t('results.copyCsvTooltip')"
          class="!text-xxs !py-0.5 !px-2"
        />

        <!-- Copy as JSON -->
        <Button
          type="button"
          icon="pi pi-code text-er"
          label="JSON"
          size="small"
          severity="secondary"
          outlined
          @click="copyAsJson"
          :v-tooltip.top="$t('results.copyJsonTooltip')"
          class="!text-xxs !py-0.5 !px-2"
        />

        <!-- Copy as Markdown -->
        <Button
          type="button"
          icon="pi pi-table text-danger"
          label="MD"
          size="small"
          severity="secondary"
          outlined
          @click="copyAsMarkdown"
          :v-tooltip.top="$t('results.copyMdTooltip')"
          class="!text-xxs !py-0.5 !px-2"
        />


        <!-- Maximize / Restore Toggle (when multiple result sets) -->
        <Button
          v-if="totalSets > 1"
          type="button"
          :icon="isMaximized ? 'pi pi-window-minimize' : 'pi pi-window-maximize'"
          text
          rounded
          size="small"
          severity="secondary"
          @click="$emit('toggle-maximize')"
          :v-tooltip.top="isMaximized ? $t('results.restoreGrid') : $t('results.maximizeGrid')"
          class="!w-6 !h-6 !p-0 ml-1"
        />
      </div>
    </div>

    <!-- Empty State: idle (nothing run yet) vs a statement that matched zero rows -->
    <ResultsEmptyState
      v-if="!resultSet || resultSet.rows.length === 0"
      :variant="resultSetColumnCount > 0 ? 'no-rows' : 'idle'"
      :column-count="resultSetColumnCount"
    />

    <!-- Tabulator grid -->
    <div
      v-else
      ref="gridContainerRef"
      class="sqlight-grid flex-1 w-full overflow-hidden relative"
      :class="{ 'is-h-scrolling': isHorizontalScrolling }"
      :style="{ '--sqlight-grid-font': settingsStore.gridFontFamily }"
      @contextmenu.prevent
      @scroll.capture.passive="handleGridScroll"
    >
      <div ref="gridTableRef" class="w-full h-full"></div>
    </div>

    <!-- Excel-Grade Live Aggregate Bar -->
    <div
      v-if="!hideToolbar"
      class="h-6 bg-dark-850 border-t border-dark-700 flex items-center justify-between px-3 text-xxs font-sans text-dark-300 flex-shrink-0 select-none"
    >
      <!-- Left: Statistics or Default Summary -->
      <div class="flex items-center space-x-2.5 overflow-x-auto min-w-0">
        <template v-if="selectionStats">
          <div class="flex items-center space-x-1 font-semibold text-accent flex-shrink-0">
            <span>{{ $t('results.selected') }}:</span>
            <span v-if="selectedColumnsCount > 1" class="text-warn font-mono">
              {{ selectedColumnsCount }} {{ $t('results.columnsUnit') }}
            </span>
            <span class="font-mono text-dark-100">
              {{ selectedColumnsCount > 1 ? `(${selectionStats.totalCells.toLocaleString()} ${$t('results.cellsUnit')})` : `${selectionStats.totalCells.toLocaleString()} ${$t('results.cellsUnit')}` }}
            </span>
            <span v-if="selectionStats.numericCount > 0" class="text-dark-400 font-mono text-xxs font-medium">
              [{{ selectionStats.numericCount.toLocaleString() }} {{ $t('results.numericUnit') }}]
            </span>
          </div>

          <template v-if="selectionStats.numericCount > 0">
            <span class="text-dark-600 flex-shrink-0">|</span>
            <div class="flex-shrink-0">
              {{ $t('results.sum') }}: <strong class="font-mono text-ok">{{ formatAggregateNumber(selectionStats.sum) }}</strong>
            </div>
            <span class="text-dark-600 flex-shrink-0">|</span>
            <div class="flex-shrink-0">
              {{ $t('results.avg') }}: <strong class="font-mono text-info">{{ formatAggregateNumber(selectionStats.avg) }}</strong>
            </div>
            <span class="text-dark-600 flex-shrink-0">|</span>
            <div class="flex-shrink-0">
              {{ $t('results.min') }}: <strong class="font-mono text-warn">{{ formatAggregateNumber(selectionStats.min) }}</strong>
            </div>
            <span class="text-dark-600 flex-shrink-0">|</span>
            <div class="flex-shrink-0">
              {{ $t('results.max') }}: <strong class="font-mono text-plan">{{ formatAggregateNumber(selectionStats.max) }}</strong>
            </div>
          </template>

          <span class="text-dark-600 flex-shrink-0">|</span>
          <div class="flex-shrink-0">
            {{ $t('results.distinct') }}: <strong class="font-mono text-dark-100">{{ selectionStats.distinctCount.toLocaleString() }}</strong>
          </div>

          <Button
            type="button"
            :label="$t('common.clear')"
            text
            size="small"
            severity="secondary"
            @click="clearCellSelection"
            :v-tooltip.top="$t('results.clearSelectionTooltip')"
            class="!ml-1 !p-0 !text-xxs !font-medium !underline"
          />
        </template>

        <template v-else>
          <div class="flex items-center space-x-2 text-dark-400">
            <span>{{ $t('results.totalRows', { count: resultSet.rows.length.toLocaleString() }) }}</span>
            <span class="text-dark-600">|</span>
            <span>{{ $t('results.totalColumns', { count: resultSet.columns.length }) }}</span>
            <template v-if="displayDuration !== undefined">
              <span class="text-dark-600">|</span>
              <span>Duration: <strong class="text-accent font-mono">{{ displayDuration }}ms</strong></span>
            </template>
          </div>
        </template>
      </div>

    </div>

    <!-- Custom Context Menu for Cells & Column Pinning -->
    <div
      v-if="contextMenu.visible"
      :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
      class="fixed z-50 bg-dark-800 border border-dark-700 rounded shadow-xl py-1 w-52 text-xs font-sans text-dark-200 select-none"
      @click="contextMenu.visible = false"
    >
      <div class="px-2.5 py-1 text-xxs text-dark-400 border-b border-dark-750 font-mono truncate">
        {{ contextMenu.colName }}: {{ String(contextMenu.cellValue ?? 'NULL') }}
      </div>

      <button
        @click="copyCellValue"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <Copy class="w-3.5 h-3.5 text-accent" />
        <span>{{ $t('results.copyCell') }}</span>
      </button>

      <button
        @click="copyColumnName"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <Heading class="w-3.5 h-3.5 text-plan" />
        <span>{{ $t('results.copyColumnName') }}</span>
      </button>

      <button
        @click="copyCurrentRow"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <FileText class="w-3.5 h-3.5 text-ok" />
        <span>{{ $t('results.copyRow') }}</span>
      </button>

      <button
        @click="copyCurrentRowAsJson"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <Braces class="w-3.5 h-3.5 text-ok" />
        <span>{{ $t('results.copyRowJson') }}</span>
      </button>

      <button
        @click="openDataView"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <Eye class="w-3.5 h-3.5 text-info" />
        <span>{{ $t('results.dataView') }}</span>
      </button>

      <!-- Cell Editing Quick Actions in Context Menu -->
      <template v-if="isCurrentCellEditable">
        <div class="my-1 border-t border-dark-750"></div>
        <button
          v-if="isCurrentCellNullable && contextMenu.cellValue !== null"
          @click="setCellNull"
          class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-warn flex items-center space-x-2 transition-colors text-warn"
        >
          <Slash class="w-3.5 h-3.5" />
          <span>{{ $t('results.setNull') }}</span>
        </button>
        <button
          v-if="isCurrentCellModified"
          @click="revertSingleCell"
          class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-warn flex items-center space-x-2 transition-colors text-warn"
        >
          <Undo2 class="w-3.5 h-3.5" />
          <span>{{ $t('results.revertCell') }}</span>
        </button>
      </template>

      <div class="my-1 border-t border-dark-750"></div>

      <!-- Selection Copy (if selection active) -->
      <button
        v-if="hasSelection"
        @click="copySelectedCells"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <Copy class="w-3.5 h-3.5 text-accent" />
        <span>{{ $t('results.copySelection') }} ({{ selectionStats?.totalCells }} {{ $t('results.cellsUnit') }})</span>
      </button>

      <button
        v-if="hasSelection"
        @click="copySelectedAsJson"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <Braces class="w-3.5 h-3.5 text-er" />
        <span>{{ $t('results.copySelectionAsJson') }}</span>
      </button>

      <!-- DML SQL Generation Options -->
      <button
        @click="handleGenerateDml('INSERT')"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <PlusCircle class="w-3.5 h-3.5 text-info" />
        <span>{{ $t('results.generateInsert') }}</span>
      </button>

      <button
        @click="handleGenerateDml('UPDATE')"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <Edit3 class="w-3.5 h-3.5 text-warn" />
        <span>{{ $t('results.generateUpdate') }}</span>
      </button>

      <button
        @click="handleGenerateDml('DELETE')"
        class="w-full text-left px-2.5 py-1.5 hover:bg-dark-750 hover:text-dark-100 flex items-center space-x-2 transition-colors"
      >
        <Trash2 class="w-3.5 h-3.5 text-danger" />
        <span>{{ $t('results.generateDelete') }}</span>
      </button>
    </div>

    <!-- Commit Confirmation Modal -->
    <Dialog
      :visible="commitModal.visible"
      @update:visible="(val) => !val && closeCommitModal()"
      modal
      :closable="false"
      :dismissableMask="true"
      :showHeader="false"
      class="w-[92vw] max-w-5xl h-[88vh] max-h-[850px] !bg-dark-850 overflow-hidden flex flex-col"
      :class="[
        dialogWindow.marker,
        requiresModificationPrompt
          ? (commitModal.confirmStep === 2 ? 'sq-dialog-accent-danger' : 'sq-dialog-accent-warn')
          : ''
      ]"
      contentClass="!p-0 !bg-dark-850 h-full flex flex-col"
      @show="dialogWindow.onShow"
      @hide="dialogWindow.onHide"
    >
      <!-- Modal Header -->
      <div
        class="sq-dialog-drag-handle px-5 py-3.5 border-b flex items-center justify-between flex-shrink-0"
        :class="requiresModificationPrompt && commitModal.confirmStep === 2 ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50' : 'bg-dark-800 border-dark-750'"
      >
        <div class="flex items-center space-x-2.5">
          <div
            class="w-7 h-7 rounded-md flex items-center justify-center"
            :class="requiresModificationPrompt ? (commitModal.confirmStep === 2 ? 'bg-rose-100 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-700/60' : 'bg-amber-500/20 border border-amber-500/40') : 'bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-700/60'"
          >
            <i v-if="requiresModificationPrompt && commitModal.confirmStep === 2" class="pi pi-exclamation-triangle text-danger animate-pulse text-sm"></i>
            <i v-else-if="requiresModificationPrompt" class="pi pi-exclamation-triangle text-warn text-sm"></i>
            <i v-else class="pi pi-check text-ok text-sm"></i>
          </div>
          <div>
            <h3 class="font-semibold text-sm text-dark-100 leading-tight">
              {{ requiresModificationPrompt ? (commitModal.confirmStep === 2 ? '確認提交資料變更 (高危最終確認 2/2)' : '確認提交資料變更 (修改提示 1/2)') : '確認提交資料變更 (Commit Changes)' }}
            </h3>
            <p class="text-xxs text-dark-400 mt-0.5">
              {{ requiresModificationPrompt ? (commitModal.confirmStep === 2 ? '注意：此操作將直接更動目標資料庫！資料修改後可能無法復原' : '連線已啟用修改提示保護，請核實即將寫入資料庫的交易語法與異動範圍') : '請確認以下即將寫入資料庫的交易 T-SQL 語法與異動範圍' }}
            </p>
          </div>
        </div>
        <Button
          type="button"
          icon="pi pi-times"
          text
          size="small"
          severity="secondary"
          @click="closeCommitModal"
          v-tooltip.top="'關閉 (Esc)'"
          class="!w-7 !h-7 !p-0 !rounded-md !border-0 !shadow-none hover:!bg-rose-500/20 hover:!text-danger"
        />
      </div>

      <!-- Modal Body -->
      <div class="p-5 flex-1 flex flex-col min-h-0 space-y-3.5 text-xs bg-dark-900">
        <!-- Summary Info Strip -->
        <div class="bg-dark-850 border border-dark-750 rounded-md px-4 py-2.5 flex items-center justify-between font-mono flex-shrink-0">
          <div class="flex items-center space-x-2">
            <span class="text-dark-400 text-xxs">目標資料表: </span>
            <strong class="text-accent font-semibold text-xs">[{{ editability.targetTable?.schema }}].[{{ editability.targetTable?.tableName }}]</strong>
          </div>
          <div class="flex items-center space-x-3 text-dark-300 text-xxs">
            <span>異動列數: <strong class="text-ok font-semibold text-xs">{{ commitModal.rowCount }}</strong> 列</span>
            <span class="text-dark-600">|</span>
            <span>異動格數: <strong class="text-warn font-semibold text-xs">{{ commitModal.cellCount }}</strong> 格</span>
          </div>
        </div>

        <!-- Error Alert if any -->
        <div v-if="commitModal.error" class="bg-rose-100 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-danger p-3 rounded-md text-xs flex items-start space-x-2 flex-shrink-0">
          <i class="pi pi-exclamation-triangle text-danger flex-shrink-0 mt-0.5 text-sm"></i>
          <div class="flex-1 font-mono break-all whitespace-pre-wrap">{{ commitModal.error }}</div>
        </div>

        <!-- SQL Preview with Monaco Syntax Highlighting -->
        <div class="flex-1 flex flex-col min-h-0">
          <div class="text-xxs text-dark-400 mb-1.5 flex items-center justify-between flex-shrink-0">
            <span class="flex items-center space-x-1.5">
              <span class="font-medium text-dark-200">即將執行的安全交易 T-SQL 語法</span>
              <span class="text-dark-500">(含 @@ROWCOUNT 防護，任一列失敗自動完整 ROLLBACK)</span>
            </span>
            <Button
              type="button"
              icon="pi pi-copy"
              label="複製語法"
              size="small"
              severity="secondary"
              outlined
              @click="copyCommitSql"
              v-tooltip.top="'複製語法至剪貼簿'"
              class="!text-xxs !py-0.5 !px-2"
            />
          </div>

          <!-- Monaco SQL Code Viewer Container -->
          <div class="flex-1 min-h-[350px] border border-dark-750 rounded-md overflow-hidden relative shadow-inner">
            <SqlCodeViewer :code="commitModal.sql" language="sql" class="w-full h-full" />
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="px-5 py-3 border-t border-dark-750 flex items-center justify-between bg-dark-800 flex-shrink-0">
        <!-- Left: High Risk Warning / Standard Note -->
        <div v-if="requiresModificationPrompt" class="flex-1 min-w-0 mr-4">
          <div
            v-if="commitModal.confirmStep === 1"
            class="flex items-center space-x-2 px-3 py-1.5 rounded bg-amber-500/15 border border-amber-500/30 text-warn text-xxs leading-normal"
          >
            <i class="pi pi-exclamation-triangle text-warn shrink-0 text-sm"></i>
            <span>
              <strong>高危提醒 (1/2)：</strong>連線「{{ currentConnection?.name }}」已啟用修改提示防護。此操作將直接更動資料庫，需進行 <strong>2 次重複確認</strong> 才可提交！
            </span>
          </div>
          <div
            v-else
            class="flex items-center space-x-2 px-3 py-1.5 rounded bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-700/80 text-danger text-xxs leading-normal animate-pulse"
          >
            <i class="pi pi-exclamation-circle text-danger shrink-0 text-sm"></i>
            <span>
              <strong class="text-danger">高危提醒 (2/2 最終確認)：</strong>即將對目標資料表實施實體資料更動！資料修改後可能無法復原，請再次核實無誤後點擊執行。
            </span>
          </div>
        </div>
        <div v-else class="text-xxs text-dark-400">
          提示：所有異動包含在同一交易 (BEGIN TRAN) 中，任何錯誤均完整復原
        </div>

        <!-- Right: Buttons -->
        <div class="flex items-center space-x-2 shrink-0">
          <Button
            type="button"
            :label="requiresModificationPrompt && commitModal.confirmStep === 2 ? '放棄提交 (Esc)' : '取消'"
            size="small"
            severity="secondary"
            outlined
            @click="closeCommitModal"
            class="!text-xs !py-1.5 !px-3"
          />

          <!-- Guarded Step 1 Button -->
          <Button
            v-if="requiresModificationPrompt && commitModal.confirmStep === 1"
            type="button"
            icon="pi pi-arrow-right"
            iconPos="right"
            label="初次確認提交 (1/2)"
            size="small"
            severity="warn"
            @click="commitModal.confirmStep = 2"
            class="!text-xs !py-1.5 !px-4 font-semibold shadow-sm"
          />

          <!-- Guarded Step 2 Button -->
          <Button
            v-else-if="requiresModificationPrompt && commitModal.confirmStep === 2"
            type="button"
            :icon="commitModal.isExecuting ? 'pi pi-spin pi-spinner' : 'pi pi-exclamation-triangle'"
            :label="commitModal.isExecuting ? '提交執行中...' : '確定立即提交 (最終確認 2/2)'"
            size="small"
            severity="danger"
            :disabled="commitModal.isExecuting"
            @click="executeCommit"
            class="!text-xs !py-1.5 !px-4 font-bold shadow-md shadow-rose-950/50"
          />

          <!-- Standard Commit Button -->
          <Button
            v-else
            type="button"
            :icon="commitModal.isExecuting ? 'pi pi-spin pi-spinner' : 'pi pi-check'"
            :label="commitModal.isExecuting ? '提交執行中...' : `確認提交 (${commitModal.rowCount} 列 / ${commitModal.cellCount} 格)`"
            size="small"
            severity="success"
            :disabled="commitModal.isExecuting"
            @click="executeCommit"
            class="!text-xs !py-1.5 !px-4 font-medium shadow-sm"
          />
        </div>
      </div>
    </Dialog>
  </div>
</template>


<script setup lang="ts">
import { ref, computed, reactive, watch, toRaw, nextTick, onMounted, onBeforeUnmount } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import {
  Copy,
  FileText,
  PlusCircle,
  Edit3,
  Trash2,
  Braces,
  Slash,
  Undo2,
  Eye,
  Heading,
  X,
} from 'lucide-vue-next';
import type {
  TabulatorCellComponent,
  TabulatorColumnComponent,
  TabulatorColumnDefinition,
  TabulatorRowData,
} from 'tabulator-tables';
import { useSettingsStore } from '@/stores/settingsStore';
import { useQueryStore } from '@/stores/queryStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useDataViewStore } from '@/stores/dataViewStore';
import { useGridLayoutStore } from '@/stores/gridLayoutStore';
import { useDialogWindow } from '@/composables/useDialogWindow';
import { queryService } from '@/services/queryService';
import { checkTableEditability } from '@/utils/tableEditability';
import { generateBatchUpdateScript, type RowModification } from '@/utils/batchUpdateGenerator';
import SqlCodeViewer from '@/components/common/SqlCodeViewer.vue';
import ResultsEmptyState from '@/components/results/ResultsEmptyState.vue';
import {
  calculateColumnWidth,
  formatCellForExport,
  formatValueForDisplay,
} from '@/composables/useColumnAutoWidth';
import { useTabulatorTable } from '@/composables/useTabulatorTable';
import { useGridSelection } from '@/composables/useGridSelection';
import { useGridExport } from '@/composables/useGridExport';
import { startGridPerfDiag } from '@/composables/useGridPerfDiag';
import {
  ROW_INDEX_FIELD,
  applyCellValueClasses,
  buildDataColumn,
  buildRowIndexColumn,
} from '@/utils/tabulatorColumns';
import {
  generateInsertStatement,
  generateUpdateStatement,
  generateDeleteStatement,
  parseTargetTableFromSql,
  extractAllTableNamesFromSql,
  type ColumnInfo,
  type GenerateDmlParams,
} from '@/utils/sqlGenerator';
import type { ResultSet, CellValue, QueryResultTab } from '@/types/query';

const props = defineProps<{
  resultSet: ResultSet;
  setIndex: number;
  totalSets: number;
  queryTab?: QueryResultTab | null;
  isMaximized?: boolean;
  tabId?: string | null;
  /** Hides the grid toolbar and the info bar, leaving only the data area (multi result set view). */
  hideToolbar?: boolean;
  durationMs?: number;
}>();

defineEmits<{
  (e: 'toggle-maximize'): void;
}>();

const settingsStore = useSettingsStore();
const queryStore = useQueryStore();
const workspaceStore = useWorkspaceStore();
const connectionStore = useConnectionStore();
const schemaStore = useSchemaStore();
const dataViewStore = useDataViewStore();
const gridLayoutStore = useGridLayoutStore();
const dialogWindow = useDialogWindow();

const displayDuration = computed<number | undefined>(() => {
  if (props.durationMs !== undefined) return props.durationMs;
  if (props.queryTab?.durationMs !== undefined) return props.queryTab.durationMs;
  if (props.tabId) {
    const tab = queryStore.resultTabs.find((t) => t.id === props.tabId);
    if (tab) return tab.durationMs;
  }
  return queryStore.activeResultTab?.durationMs ?? queryStore.activeResult?.executionTimeMs;
});

// Quick filter input is debounced once the result set is big enough for a single filter pass to
// be felt. Measured on a 150 column result set: ~21ms per pass at 1k rows, ~497ms at 50k rows,
// so ~10k rows (also the app's default row cap) is where one pass reaches the ~100ms budget.
// Below the threshold the grid updates as you type, which is the nicer behaviour when it's free.
const QUICK_FILTER_DEBOUNCE_MS = 250;
const QUICK_FILTER_DEBOUNCE_ROW_THRESHOLD = 10000;

const quickFilterInput = ref('');
const quickFilter = ref('');
let quickFilterTimer: ReturnType<typeof setTimeout> | null = null;

watch(quickFilterInput, (value) => {
  if (quickFilterTimer) {
    clearTimeout(quickFilterTimer);
    quickFilterTimer = null;
  }

  if ((props.resultSet?.rows.length ?? 0) < QUICK_FILTER_DEBOUNCE_ROW_THRESHOLD) {
    quickFilter.value = value;
    return;
  }

  quickFilterTimer = setTimeout(() => {
    quickFilterTimer = null;
    quickFilter.value = value;
  }, QUICK_FILTER_DEBOUNCE_MS);
});

/**
 * Clear the quick filter immediately, bypassing the debounce so the grid resets without a lag
 * even on large result sets.
 */
function clearQuickFilter() {
  quickFilterInput.value = '';
  quickFilter.value = '';
  if (quickFilterTimer) {
    clearTimeout(quickFilterTimer);
    quickFilterTimer = null;
  }
}

const gridContainerRef = ref<HTMLDivElement | null>(null);

// Tabulator must not hold a Vue reactive proxy for the row data: with wide result sets the proxy
// cost is paid on every cell read. Raw arrays keep rendering on plain objects while all
// modification tracking stays in `modifiedCells`.
const gridRowData = computed<CellValue[][]>(() => {
  const rows = props.resultSet?.rows;
  return rows ? (toRaw(rows) as CellValue[][]) : [];
});

// Horizontal-scroll mode: while the user drags the horizontal scrollbar, decorative
// transitions inside the grid are switched off so each frame stays paint-cheap.
const isHorizontalScrolling = ref(false);
let horizontalScrollTimer: ReturnType<typeof setTimeout> | null = null;
let lastScrollLeft = 0;

function markHorizontalScrolling() {
  if (!isHorizontalScrolling.value) {
    isHorizontalScrolling.value = true;
  }
  if (horizontalScrollTimer) {
    clearTimeout(horizontalScrollTimer);
  }
  horizontalScrollTimer = setTimeout(() => {
    horizontalScrollTimer = null;
    isHorizontalScrolling.value = false;
  }, 150);
}

function handleGridScroll(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target || typeof target.scrollLeft !== 'number') return;
  if (target.scrollLeft !== lastScrollLeft) {
    lastScrollLeft = target.scrollLeft;
    markHorizontalScrolling();
  }
}

const currentTab = computed(() => props.queryTab ?? queryStore.activeResultTab);

// Stable key identifying this result set's remembered column layout (session only).
const layoutKey = computed(() =>
  gridLayoutStore.layoutKey(props.tabId ?? currentTab.value?.id ?? null, props.setIndex)
);

// Layout snapshots are debounced: a resize drag fires many events and every capture copies
// the whole column state array.
let captureTimer: ReturnType<typeof setTimeout> | null = null;

function captureLayoutNow() {
  if (captureTimer) {
    clearTimeout(captureTimer);
    captureTimer = null;
  }
  gridLayoutStore.capture(layoutKey.value, grid.table.value);
}

function scheduleLayoutCapture() {
  if (captureTimer) clearTimeout(captureTimer);
  captureTimer = setTimeout(() => {
    captureTimer = null;
    gridLayoutStore.capture(layoutKey.value, grid.table.value);
  }, 200);
}

const currentConnection = computed(() => {
  const connId = currentTab.value?.connectionId || connectionStore.activeConnectionId;
  return connectionStore.getConnectionById(connId) || connectionStore.activeConnection;
});

const requiresModificationPrompt = computed(() => {
  return currentConnection.value?.modificationPrompt ?? false;
});

const isRefreshing = ref(false);

/**
 * Refresh drops the visible view state: sorting and filtering are reset so the reloaded result
 * shows the raw data again. Column widths/order (the remembered layout) are deliberately kept.
 */
function resetGridState() {
  clearQuickFilter();

  const table = grid.table.value;
  if (table) {
    table.clearSort();
    table.clearFilter();
  }

  // Overwrite the remembered layout so a later rebuild does not restore the dropped sorters.
  gridLayoutStore.capture(layoutKey.value, table);
}

async function handleRefresh() {
  if (isRefreshing.value) return;
  const tab = currentTab.value;
  if (!tab) {
    workspaceStore.showToast('無法取得查詢分頁資訊', 'error', 2000);
    return;
  }

  isRefreshing.value = true;
  try {
    const res = await queryStore.refreshTabResultSet(tab.id, props.setIndex);
    if (res.success) {
      modifiedCells.value = {};
      resetGridState();
      grid.redraw(true);
      workspaceStore.showToast(`資料已重新整理（共 ${res.rowCount.toLocaleString()} 筆）`, 'success', 2000);
    } else {
      workspaceStore.showToast(`重新整理失敗: ${res.error || '未知錯誤'}`, 'error', 3500);
    }
  } catch (err: any) {
    workspaceStore.showToast(`重新整理失敗: ${err?.message || err}`, 'error', 3500);
  } finally {
    isRefreshing.value = false;
  }
}

// Check editability for this result set
const editability = computed(() => {
  return checkTableEditability({
    tab: currentTab.value,
    columns: props.resultSet.columns ?? [],
    getTableSchema: (tbl, cId, db) => {
      const conn = cId || currentTab.value?.connectionId || connectionStore.activeConnectionId || undefined;
      const dbase = db || currentTab.value?.database || connectionStore.activeDatabase || undefined;
      return schemaStore.getTable(tbl, conn, dbase);
    },
  });
});

// Set of lowercased identity column names
const identityColumnNames = computed<Set<string>>(() => {
  const tab = currentTab.value;
  const connId = tab?.connectionId || connectionStore.activeConnectionId || undefined;
  const db = tab?.database || connectionStore.activeDatabase || undefined;
  if (!connId || !db || !editability.value.targetTable) return new Set();

  const target = editability.value.targetTable;
  const tableSchema =
    schemaStore.getTable(target.tableName, connId, db) ||
    schemaStore.getTable(`${target.schema}.${target.tableName}`, connId, db);
  if (!tableSchema) return new Set();

  return new Set(
    tableSchema.columns.filter((c) => c.isIdentity).map((c) => c.name.toLowerCase())
  );
});

// Set of lowercased primary key column names
const primaryKeyColumnNames = computed<Set<string>>(() => {
  if (editability.value.pkColumns.length > 0) {
    return new Set(editability.value.pkColumns.map((c) => c.toLowerCase()));
  }

  const tab = currentTab.value;
  const connId = tab?.connectionId || connectionStore.activeConnectionId || undefined;
  const db = tab?.database || connectionStore.activeDatabase || undefined;
  if (!connId || !db) return new Set();

  const sql = tab?.sql || '';
  const parsedTables = extractAllTableNamesFromSql(sql);

  if (parsedTables.length === 0 && tab?.tableName) {
    parsedTables.push({ schema: tab.schema, tableName: tab.tableName });
  }

  const pkNames = new Set<string>();
  for (const t of parsedTables) {
    const tableSchema =
      schemaStore.getTable(t.tableName, connId, db) ||
      (t.schema ? schemaStore.getTable(`${t.schema}.${t.tableName}`, connId, db) : undefined);
    if (tableSchema) {
      for (const col of tableSchema.columns) {
        if (col.isPrimaryKey) {
          pkNames.add(col.name.toLowerCase());
        }
      }
    }
  }

  return pkNames;
});

/** Read-only columns (primary key / identity) can never be edited inline. */
function isColumnEditable(colIdx: number): boolean {
  const column = props.resultSet?.columns[colIdx];
  if (!column || !editability.value.canEdit) return false;
  const name = column.name.toLowerCase();
  return !primaryKeyColumnNames.value.has(name) && !identityColumnNames.value.has(name);
}

// Cell modification tracking
interface CellModification {
  rowKey: string;
  originalRowIndex: number;
  colIdx: number;
  colName: string;
  originalValue: CellValue;
  currentValue: CellValue;
  rowRef: CellValue[];
  pkWhere: Record<string, CellValue>;
}

const modifiedCells = ref<Record<string, CellModification>>({});
const modifiedCount = computed(() => Object.keys(modifiedCells.value).length);
const hasRows = computed(() => (props.resultSet?.rows?.length ?? 0) > 0);
/**
 * Separates "this tab has never run anything" from "the statement matched zero rows". A query
 * that returns no rows still ships its column metadata, so an empty grid with columns is a
 * finished statement, not an untouched one.
 */
const resultSetColumnCount = computed(() => props.resultSet?.columns?.length ?? 0);

const pkColumnIndices = computed<number[]>(() => {
  if (!props.resultSet || editability.value.pkColumns.length === 0) return [];
  const map = new Map<string, number>();
  props.resultSet.columns.forEach((c, idx) => map.set(c.name.toLowerCase(), idx));
  return editability.value.pkColumns
    .map((pk) => map.get(pk.toLowerCase()))
    .filter((idx): idx is number => idx !== undefined);
});

function getRowPkKey(row: CellValue[] | undefined): string {
  if (!row || pkColumnIndices.value.length === 0) return '';
  const indices = pkColumnIndices.value;
  let key = '';
  for (let i = 0; i < indices.length; i++) {
    if (i > 0) key += ':::';
    key += String(row[indices[i]!] ?? '');
  }
  return key;
}

function isCellModified(rowData: CellValue[] | undefined, colIdx: number): boolean {
  if (modifiedCount.value === 0 || !rowData) return false;
  const rowKey = getRowPkKey(rowData);
  if (!rowKey) return false;
  return `${rowKey}___col_${colIdx}` in modifiedCells.value;
}

/**
 * Records (or clears) the pending modification for one cell. Shared by the inline editor and the
 * "set NULL" context menu action so both paths produce identical commit statements.
 */
function recordModification(
  rowData: CellValue[],
  colIdx: number,
  previousValue: CellValue,
  nextValue: CellValue
): void {
  const rowKey = getRowPkKey(rowData);
  if (!rowKey || !props.resultSet) return;

  const cellKey = `${rowKey}___col_${colIdx}`;
  const existing = modifiedCells.value[cellKey];
  const originalValue = existing ? existing.originalValue : previousValue;

  if (nextValue === originalValue) {
    const copy = { ...modifiedCells.value };
    delete copy[cellKey];
    modifiedCells.value = copy;
    return;
  }

  const pkWhere: Record<string, CellValue> = {};
  for (const pkCol of editability.value.pkColumns) {
    const pColIdx = props.resultSet.columns.findIndex(
      (c) => c.name.toLowerCase() === pkCol.toLowerCase()
    );
    if (pColIdx >= 0) {
      pkWhere[pkCol] = rowData[pColIdx] ?? null;
    }
  }

  modifiedCells.value = {
    ...modifiedCells.value,
    [cellKey]: {
      rowKey,
      originalRowIndex: props.resultSet.rows.indexOf(rowData),
      colIdx,
      colName: props.resultSet.columns[colIdx]?.name ?? '',
      originalValue,
      currentValue: nextValue,
      rowRef: rowData,
      pkWhere,
    },
  };
}

// Clear modified cells when switching result sets or tabs
watch(
  () => [props.resultSet, queryStore.activeResultTabId],
  () => {
    modifiedCells.value = {};
  }
);

// Commit confirmation modal state
const commitModal = reactive({
  visible: false,
  isExecuting: false,
  error: '',
  sql: '',
  rowCount: 0,
  cellCount: 0,
  confirmStep: 1 as 1 | 2,
});

function closeCommitModal() {
  commitModal.visible = false;
  commitModal.confirmStep = 1;
  commitModal.error = '';
}

function handleRevertChanges() {
  if (!hasRows.value) {
    workspaceStore.showToast('目前無資料可供退回', 'info', 2000);
    return;
  }
  if (modifiedCount.value === 0 || !props.resultSet) return;

  for (const mod of Object.values(modifiedCells.value)) {
    mod.rowRef[mod.colIdx] = mod.originalValue;
  }
  const count = modifiedCount.value;
  modifiedCells.value = {};
  grid.redraw(true);
  workspaceStore.showToast(`已退回 ${count} 格修改，資料已還原`, 'info', 2000);
}

function openCommitModal() {
  if (!hasRows.value) {
    workspaceStore.showToast('目前無資料可供提交', 'info', 2000);
    return;
  }
  if (modifiedCount.value === 0 || !editability.value.canEdit || !editability.value.targetTable) return;

  const rowsMap = new Map<string, RowModification>();
  for (const mod of Object.values(modifiedCells.value)) {
    let rm = rowsMap.get(mod.rowKey);
    if (!rm) {
      rm = {
        rowIndex: mod.originalRowIndex,
        updates: {},
        pkWhere: mod.pkWhere,
      };
      rowsMap.set(mod.rowKey, rm);
    }
    rm.updates[mod.colName] = mod.currentValue;
  }

  const modifications = Array.from(rowsMap.values());
  const tab = currentTab.value;
  const db = tab?.database || connectionStore.activeDatabase || undefined;

  try {
    const sql = generateBatchUpdateScript({
      tableName: editability.value.targetTable.tableName,
      schema: editability.value.targetTable.schema,
      database: db,
      modifications,
    });

    commitModal.sql = sql;
    commitModal.rowCount = modifications.length;
    commitModal.cellCount = modifiedCount.value;
    commitModal.error = '';
    commitModal.isExecuting = false;
    commitModal.confirmStep = 1;
    commitModal.visible = true;
  } catch (err: any) {
    workspaceStore.showToast(`產生更新語法失敗: ${err?.message || err}`, 'error', 3500);
  }
}

async function executeCommit() {
  const tab = currentTab.value;
  const connId = tab?.connectionId || connectionStore.activeConnectionId || undefined;
  const db = tab?.database || connectionStore.activeDatabase || undefined;

  if (!connId || !db) {
    commitModal.error = '無法取得當前連線或資料庫資訊';
    return;
  }

  commitModal.isExecuting = true;
  commitModal.error = '';

  try {
    await queryService.executeQuery(connId, db, commitModal.sql);

    const rowCnt = commitModal.rowCount;
    const cellCnt = commitModal.cellCount;
    modifiedCells.value = {};
    grid.redraw(true);
    closeCommitModal();
    workspaceStore.showToast(`成功提交！已更新 ${rowCnt} 筆資料 (共 ${cellCnt} 格)`, 'success', 3000);
  } catch (err: any) {
    commitModal.error = err?.message || String(err);
  } finally {
    commitModal.isExecuting = false;
  }
}

function copyCommitSql() {
  if (!commitModal.sql) return;
  try {
    navigator.clipboard?.writeText(commitModal.sql);
    workspaceStore.showToast('已複製批次更新語法至剪貼簿', 'success', 2000);
  } catch (err) {
    // Ignore clipboard error
  }
}

// Cell context menu quick action computed and methods
const isCurrentCellEditable = computed(() => {
  if (!editability.value.canEdit || !contextMenu.visible) return false;
  const colIdx = getColIndex(contextMenu.colId);
  if (colIdx === undefined || !props.resultSet) return false;
  return isColumnEditable(colIdx);
});

const isCurrentCellNullable = computed(() => {
  if (!isCurrentCellEditable.value) return false;
  const colIdx = getColIndex(contextMenu.colId);
  if (colIdx === undefined || !props.resultSet) return false;
  return props.resultSet.columns[colIdx]?.nullable ?? true;
});

const isCurrentCellModified = computed(() => {
  if (!contextMenu.visible || !contextMenu.rowData) return false;
  const colIdx = getColIndex(contextMenu.colId);
  if (colIdx === undefined) return false;
  return isCellModified(contextMenu.rowData, colIdx);
});

function setCellNull() {
  if (!isCurrentCellEditable.value || !contextMenu.rowData || !props.resultSet) return;
  const colIdx = getColIndex(contextMenu.colId);
  if (colIdx === undefined) return;

  const oldVal: CellValue = contextMenu.rowData[colIdx] ?? null;
  if (oldVal === null) {
    contextMenu.visible = false;
    return;
  }

  contextMenu.rowData[colIdx] = null;
  recordModification(contextMenu.rowData, colIdx, oldVal, null);
  grid.redraw(true);
  contextMenu.visible = false;
}

function revertSingleCell() {
  if (!contextMenu.rowData || !props.resultSet) return;
  const colIdx = getColIndex(contextMenu.colId);
  if (colIdx === undefined) return;
  const rowKey = getRowPkKey(contextMenu.rowData);
  const cellKey = `${rowKey}___col_${colIdx}`;
  const mod = modifiedCells.value[cellKey];
  if (!mod) {
    contextMenu.visible = false;
    return;
  }

  mod.rowRef[colIdx] = mod.originalValue;
  const copy = { ...modifiedCells.value };
  delete copy[cellKey];
  modifiedCells.value = copy;

  grid.redraw(true);
  contextMenu.visible = false;
  workspaceStore.showToast(`已還原欄位 [${mod.colName}]`, 'info', 1500);
}

// Auto-fetch database schema if not yet loaded
watch(
  () => [currentTab.value?.connectionId, currentTab.value?.database] as const,
  ([cId, db]) => {
    const connId = cId || connectionStore.activeConnectionId;
    const database = db || connectionStore.activeDatabase;
    if (connId && database && !schemaStore.isDatabaseLoaded(connId, database)) {
      schemaStore.loadDatabaseSchema(connId, database).catch(() => {});
    }
  },
  { immediate: true }
);

// Selection composable (Tabulator range based)
const selection = useGridSelection({
  getTable: () => grid.table.value,
  getContainer: () => gridContainerRef.value,
  getColumns: () => props.resultSet.columns ?? [],
  onCopySelected: () => gridExport.copySelectedCells(),
});

const {
  selectionStats,
  hasSelection,
  selectedColumnsCount,
  getColIndex,
  formatAggregateNumber,
  clearCellSelection,
} = selection;

// Double-click copies the cell value on read-only cells (read-only result sets, PK/Identity
// columns). Editable cells keep their double-click-to-edit behaviour: Tabulator opens its editor
// on the same gesture, so the copy handler has to yield to it.
function handleCellDoubleClick(_event: MouseEvent, cell: TabulatorCellComponent) {
  const colIdx = getColIndex(cell.getField());
  if (colIdx === undefined || !props.resultSet) return;
  if (isColumnEditable(colIdx)) return;

  const colName = props.resultSet.columns[colIdx]?.name ?? '';
  const text = formatCellForExport(cell.getValue() as CellValue);

  navigator.clipboard.writeText(text).then(
    () => workspaceStore.showToast(`已複製「${colName}」的值至剪貼簿`, 'success', 1800),
    () => workspaceStore.showToast('複製失敗：無法寫入剪貼簿', 'warning', 2500)
  );
}

// Clear selection when result set changes
watch(
  () => props.resultSet,
  () => {
    clearCellSelection();
  }
);

// Custom cell context menu state
const contextMenu = reactive<{
  visible: boolean;
  x: number;
  y: number;
  colId: string;
  colName: string;
  cellValue: unknown;
  rowIndex: number;
  rowData: CellValue[] | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  colId: '',
  colName: '',
  cellValue: null,
  rowIndex: -1,
  rowData: null,
});

// Export composable
const gridExport = useGridExport({
  getRows: () => props.resultSet.rows ?? [],
  getColumns: () => props.resultSet.columns ?? [],
  selection,
  showToast: (msg, type, duration) => workspaceStore.showToast(msg, type, duration),
  onMenuClose: () => {
    contextMenu.visible = false;
  },
});

const {
  copiedTsv,
  copiedCsv,
  copyCellValue: exportCopyCellValue,
  copyColumnName: exportCopyColumnName,
  copyCurrentRow: exportCopyCurrentRow,
  copyCurrentRowAsJson: exportCopyCurrentRowAsJson,
  copySelectedCells,
  copySelectedAsJson,
  copyAsTsv,
  copyAsCsv,
  copyAsJson,
  copyAsMarkdown,
} = gridExport;

function copyCellValue() {
  exportCopyCellValue(contextMenu.cellValue);
}

function copyColumnName() {
  exportCopyColumnName(contextMenu.colName);
}

function copyCurrentRow() {
  const row = contextMenu.rowData || (contextMenu.rowIndex >= 0 && props.resultSet ? props.resultSet.rows[contextMenu.rowIndex] : null);
  exportCopyCurrentRow(row);
}

function copyCurrentRowAsJson() {
  const row = contextMenu.rowData || (contextMenu.rowIndex >= 0 && props.resultSet ? props.resultSet.rows[contextMenu.rowIndex] : null);
  if (row && props.resultSet) {
    exportCopyCurrentRowAsJson(props.resultSet.columns, row);
  }
}

function openDataView() {
  if (!hasRows.value) {
    workspaceStore.showToast('查無資料列可供檢視 (0 筆)', 'info', 2000);
    contextMenu.visible = false;
    return;
  }
  const row = contextMenu.rowData || (contextMenu.rowIndex >= 0 && props.resultSet ? props.resultSet.rows[contextMenu.rowIndex] : null);
  if (!row || !props.resultSet) {
    contextMenu.visible = false;
    return;
  }
  dataViewStore.openDataView({
    columns: props.resultSet.columns,
    row,
    rowIndex: contextMenu.rowIndex,
    totalRows: props.resultSet.rows.length,
    allRows: props.resultSet.rows,
    tableName: currentTab.value?.title || currentTab.value?.tableName,
  });
  contextMenu.visible = false;
}

// --------------------------------------------------------------------------
// Tabulator grid
// --------------------------------------------------------------------------

const gridIsActive = computed(() => !!props.resultSet && props.resultSet.rows.length > 0);

const gridColumnSignature = computed(() =>
  [
    props.resultSet?.columns.map((c) => `${c.name}|${c.dataType}|${c.nullable ? 1 : 0}`).join('\u0001') ?? '',
    [...primaryKeyColumnNames.value].sort().join(','),
    [...identityColumnNames.value].sort().join(','),
    editability.value.canEdit ? '1' : '0',
    String(props.resultSet?.rows.length ?? 0),
  ].join('\u0002')
);

function buildColumnDefinitions(): TabulatorColumnDefinition[] {
  if (!props.resultSet) return [];

  const firstRow = props.resultSet.rows[0];
  const dataColumns = props.resultSet.columns.map((col, colIdx) => {
    const isPk = primaryKeyColumnNames.value.has(col.name.toLowerCase());
    const isIdentity = identityColumnNames.value.has(col.name.toLowerCase());
    const isStmtText = col.name === 'StmtText';
    const firstVal = firstRow ? firstRow[colIdx] : undefined;
    const baseWidth = calculateColumnWidth(col.name, firstVal, isPk);
    const colWidth = isStmtText ? Math.max(baseWidth, 360) : baseWidth;

    return buildDataColumn({
      column: col,
      columnIndex: colIdx,
      width: colWidth,
      minWidth: isStmtText ? 200 : 70,
      headerTooltip: isPk
        ? `🔑 [主鍵 / Primary Key (唯讀)] 型別 (Type): ${col.dataType}${col.nullable ? ' | 可為 NULL' : ' | NOT NULL'} (拖曳表頭調整順序，點選表頭選取整欄)`
        : isIdentity
          ? `🔒 [識別欄位 / Identity (唯讀)] 型別 (Type): ${col.dataType} (拖曳表頭調整順序)`
          : `型別 (Type): ${col.dataType}${col.nullable ? ' | 可為 NULL' : ' | NOT NULL'}${editability.value.canEdit ? ' (雙擊可編輯)' : ''} (拖曳表頭調整順序)`,
      isPrimaryKey: isPk,
      isIdentity,
      isEditable: () => isColumnEditable(colIdx),
      isModified: isCellModified,
      extraClass: isStmtText ? 'sqlight-stmt-text' : undefined,
    });
  });

  return [buildRowIndexColumn({ rowCount: props.resultSet.rows.length }), ...dataColumns];
}

/** Visible data field names in display order; the quick filter scans exactly these. */
function dataFieldNames(): string[] {
  const table = grid.table.value;
  if (!table) return (props.resultSet?.columns ?? []).map((_, index) => String(index));
  return table
    .getColumns()
    .filter((column) => column.isVisible() && column.getField() !== ROW_INDEX_FIELD)
    .map((column) => column.getField());
}

/** Quick filter semantics: every whitespace separated term must match somewhere in the row. */
function buildQuickFilter(term: string): (data: TabulatorRowData) => boolean {
  const terms = term
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const fields = dataFieldNames();
  return (data) => {
    for (const needle of terms) {
      let matched = false;
      for (const field of fields) {
        const raw = (data as unknown as Record<string, CellValue>)[field];
        if (raw === null || raw === undefined) continue;
        if (formatValueForDisplay(raw).toLowerCase().includes(needle)) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }
    return true;
  };
}

function applyQuickFilterTerm(term: string) {
  const table = grid.table.value;
  if (!table) return;
  if (!term.trim()) {
    table.clearFilter();
    return;
  }
  table.setFilter(buildQuickFilter(term));
}

let disposeGridPerfDiag: (() => void) | null = null;
let movingRowIndexColumn = false;
let editSnapshot: { rowData: CellValue[]; colIdx: number; previousValue: CellValue } | null = null;

function handleColumnMoved(moved: TabulatorColumnComponent) {
  const table = grid.table.value;
  scheduleLayoutCapture();
  if (!table || movingRowIndexColumn) return;

  const indexColumn = table.getColumn(ROW_INDEX_FIELD);
  const firstVisible = table.getColumns().find((column) => column.isVisible());
  if (indexColumn && firstVisible && firstVisible !== indexColumn) {
    movingRowIndexColumn = true;
    // `move` takes a target column/field, not an index: drop the frozen column back in front of
    // whatever now leads the visible order.
    indexColumn.move(firstVisible);
    movingRowIndexColumn = false;
    workspaceStore.showToast('「#」欄為固定欄，無法移動', 'info', 1600);
  }
  void moved;
}

function handleCellEditing(cell: TabulatorCellComponent) {
  const colIdx = getColIndex(cell.getField());
  if (colIdx === undefined) return;
  editSnapshot = {
    rowData: cell.getRow().getData() as unknown as CellValue[],
    colIdx,
    previousValue: cell.getValue() as CellValue,
  };
}

function handleCellEdited(cell: TabulatorCellComponent) {
  const colIdx = getColIndex(cell.getField());
  const rowData = cell.getRow().getData() as unknown as CellValue[];
  if (colIdx === undefined || !props.resultSet) return;

  const snapshot = editSnapshot;
  editSnapshot = null;
  if (!snapshot || snapshot.rowData !== rowData || snapshot.colIdx !== colIdx) return;

  // Tabulator turns an empty editor result into `undefined`; the column semantics are `NULL`.
  const rawNext = cell.getValue() as CellValue;
  const nextValue = rawNext === undefined ? null : rawNext;

  recordModification(rowData, colIdx, snapshot.previousValue, nextValue);
  applyCellValueClasses(cell.getElement(), nextValue, isCellModified(rowData, colIdx));
}

/** Clicking the frozen `#` cell selects the whole row. */
function handleCellClick(_event: MouseEvent, cell: TabulatorCellComponent) {
  if (cell.getField() !== ROW_INDEX_FIELD) return;
  selection.selectRow(cell.getRow());
}

/** Clicking the `#` header selects the whole table. */
function handleHeaderClick(_event: MouseEvent, column: TabulatorColumnComponent) {
  if (column.getField() !== ROW_INDEX_FIELD) return;
  selection.selectAll();
}

function handleCellContext(event: MouseEvent, cell: TabulatorCellComponent) {
  event.preventDefault();
  event.stopPropagation();

  const menuWidth = 220;
  const menuHeight = 300;
  const x = Math.min(event.clientX, Math.max(0, window.innerWidth - menuWidth - 8));
  const y = Math.min(event.clientY, Math.max(0, window.innerHeight - menuHeight - 8));

  const field = cell.getField();
  const colIdx = getColIndex(field);
  const realColName =
    colIdx !== undefined && props.resultSet ? props.resultSet.columns[colIdx]?.name ?? field : '#';

  contextMenu.visible = true;
  contextMenu.x = x;
  contextMenu.y = y;
  contextMenu.colId = field;
  contextMenu.colName = realColName || '';
  contextMenu.cellValue = cell.getValue();
  contextMenu.rowIndex = cell.getRow().getPosition() - 1;
  contextMenu.rowData = cell.getRow().getData() as unknown as CellValue[];

  function closeMenu() {
    contextMenu.visible = false;
    document.removeEventListener('click', closeMenu);
  }
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);
}

const grid = useTabulatorTable({
  isActive: () => gridIsActive.value,
  getRows: () => gridRowData.value,
  getColumnSignature: () => gridColumnSignature.value,
  buildOptions: () => ({
    height: '100%',
    layout: 'fitData',
    // Per the migration decision the grid ships with Tabulator's default all-columns renderer;
    // `renderHorizontal: "virtual"` is the documented follow-up if 150 column scrolling suffers.
    renderHorizontal: 'basic',
    movableColumns: true,
    selectableRows: false,
    selectableRange: true,
    selectableRangeColumns: true,
    selectableRangeRows: false,
    selectableRangeInitializeDefault: false,
    selectableRangeAutoFocus: false,
    editTriggerEvent: 'dblclick',
    headerSortClickElement: 'icon',
    tooltipDelay: 150,
    index: '__sqlightRowId',
    rowHeight: 28,
    columns: buildColumnDefinitions(),
  }),
  onReady: (table) => {
    selection.attach(table);
    table.on('cellDblClick', handleCellDoubleClick);
    table.on('cellContext', handleCellContext);
    table.on('cellClick', handleCellClick);
    table.on('headerClick', handleHeaderClick);
    table.on('cellEditing', handleCellEditing);
    table.on('cellEdited', handleCellEdited);
    table.on('columnMoved', handleColumnMoved);
    table.on('columnResized', scheduleLayoutCapture);
    table.on('columnVisibilityChanged', scheduleLayoutCapture);
    table.on('dataSorted', scheduleLayoutCapture);

    // Restore the remembered layout when returning to a previously viewed result set.
    gridLayoutStore.restore(layoutKey.value, table);
    applyQuickFilterTerm(quickFilter.value);

    const container = gridContainerRef.value;
    if (container) {
      disposeGridPerfDiag?.();
      disposeGridPerfDiag = startGridPerfDiag({
        table,
        container,
        label: currentTab.value?.title,
        applyFilter: applyQuickFilterTerm,
        getFilter: () => quickFilter.value,
      });
    }
  },
});

watch([gridIsActive, gridColumnSignature], async () => {
  await nextTick();
  await grid.sync();
});

// `useTabulatorTable` builds the table into its own container element; the wrapper keeps the
// theme/scroll responsibilities.
const gridTableRef = grid.containerRef;

// The result set is usually already available when this component mounts, so the first build has
// to be triggered explicitly (the watchers only cover later changes).
onMounted(async () => {
  await nextTick();
  await grid.sync();
});

watch(
  () => gridRowData.value,
  async () => {
    await nextTick();
    await grid.sync();
  }
);

watch(quickFilter, (value) => {
  applyQuickFilterTerm(value);
});

function handleGenerateDml(type: 'INSERT' | 'UPDATE' | 'DELETE') {
  if (!hasRows.value) {
    workspaceStore.showToast('查無資料列可供產生 DML (0 筆)', 'info', 2000);
    contextMenu.visible = false;
    return;
  }
  const row = contextMenu.rowData || (contextMenu.rowIndex >= 0 && props.resultSet ? props.resultSet.rows[contextMenu.rowIndex] : null);
  if (!row || !props.resultSet) {
    contextMenu.visible = false;
    return;
  }

  const tab = currentTab.value;
  const sql = tab?.sql || '';
  const parsedTarget = parseTargetTableFromSql(sql);

  const tableName = parsedTarget?.tableName || tab?.tableName || tab?.title || 'TargetTable';
  let schema = parsedTarget?.schema || tab?.schema;

  const connId = tab?.connectionId || connectionStore.activeConnectionId || undefined;
  const db = tab?.database || connectionStore.activeDatabase || undefined;

  const tableSchema = connId && db
    ? (schemaStore.getTable(tableName, connId, db) || (schema ? schemaStore.getTable(`${schema}.${tableName}`, connId, db) : undefined))
    : undefined;

  if (!schema && tableSchema?.schema) {
    schema = tableSchema.schema;
  }
  if (!schema) {
    schema = 'dbo';
  }

  const primaryKeyColumns = tableSchema?.columns
    .filter((c) => c.isPrimaryKey)
    .map((c) => c.name);

  const pkColNames = new Set(
    primaryKeyColumns?.map((c) => c.toLowerCase()) ?? []
  );

  const identityColNames = new Set(
    tableSchema?.columns
      .filter((c) => c.isIdentity)
      .map((c) => c.name.toLowerCase()) ?? []
  );

  const columns: ColumnInfo[] = props.resultSet.columns.map((col) => ({
    name: col.name,
    dataType: col.dataType,
    isPrimaryKey: pkColNames.has(col.name.toLowerCase()),
    isIdentity: identityColNames.has(col.name.toLowerCase()),
  }));

  const dmlParams: GenerateDmlParams = {
    tableName,
    schema,
    database: db,
    columns,
    row,
    primaryKeyColumns,
  };

  let generated = '';
  try {
    if (type === 'INSERT') {
      generated = generateInsertStatement(dmlParams);
    } else if (type === 'UPDATE') {
      generated = generateUpdateStatement(dmlParams);
    } else if (type === 'DELETE') {
      generated = generateDeleteStatement(dmlParams);
    }

    try {
      navigator.clipboard?.writeText(generated);
    } catch (err) {
      // Ignore clipboard error
    }

    workspaceStore.addSqlTab(generated, `${type}: [${schema}].[${tableName}]`, connId, db);
    workspaceStore.showToast(`已建立 ${type} 語法並開啟新分頁（已複製至剪貼簿）`, 'success', 2500);
  } catch (err: any) {
    workspaceStore.showToast(`產生 ${type} 語法失敗: ${err?.message || err}`, 'error', 3500);
  }

  contextMenu.visible = false;
}

onBeforeUnmount(() => {
  captureLayoutNow();
  disposeGridPerfDiag?.();
  disposeGridPerfDiag = null;
  if (horizontalScrollTimer) {
    clearTimeout(horizontalScrollTimer);
    horizontalScrollTimer = null;
  }
  if (quickFilterTimer) {
    clearTimeout(quickFilterTimer);
    quickFilterTimer = null;
  }
});
</script>
