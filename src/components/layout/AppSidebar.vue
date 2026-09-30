<template>
  <aside ref="sidebarRootRef" class="h-full bg-dark-850 flex flex-col overflow-hidden select-none border-r border-dark-700 relative">
    <!-- Sidebar Header -->
    <div class="h-9 px-3 border-b border-dark-700 flex items-center justify-between text-xs uppercase tracking-wider text-dark-400 bg-dark-850 flex-shrink-0">
      <div class="flex items-center space-x-1.5">
        <Server class="w-3.5 h-3.5 text-accent" />
        <span>Explorer</span>
      </div>
      <div class="flex items-center space-x-1">
        <Button
          icon="pi pi-compass"
          severity="secondary"
          size="small"
          text
          rounded
          class="!h-6 !w-6 !p-0"
          :v-tooltip.bottom="$t('results.locateInExplorer')"
          @click="handleLocateCurrentTable"
        />
        <Button
          icon="pi pi-plus"
          severity="secondary"
          size="small"
          text
          rounded
          class="!h-6 !w-6 !p-0"
          :v-tooltip.bottom="$t('sidebar.newConnection')"
          @click="$emit('open-connection-modal')"
        />
        <Button
          :icon="isRefreshing ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'"
          severity="secondary"
          size="small"
          text
          rounded
          class="!h-6 !w-6 !p-0"
          :v-tooltip.bottom="$t('sidebar.refresh')"
          @click="refreshCurrent"
        />
        <Button
          icon="pi pi-angle-double-up"
          severity="secondary"
          size="small"
          text
          rounded
          class="!h-6 !w-6 !p-0"
          :v-tooltip.bottom="$t('common.collapse')"
          @click="handleCollapseAll"
        />
      </div>
    </div>

    <!-- Filter Search Box with ComboBox & Clear Button -->
    <div ref="filterContainerRef" class="p-2 border-b border-dark-700 flex-shrink-0 relative">
      <div class="relative flex items-center">
        <i class="pi pi-search text-dark-500 absolute left-2 pointer-events-none text-xs" />
        <InputText
          ref="filterInputRef"
          v-model="filterQuery"
          @keydown.enter.stop="handleKeyEnter"
          @keydown.down.prevent="handleKeyDown"
          @keydown.up.prevent="handleKeyUp"
          @keydown.esc.stop="handleKeyEsc"
          @blur="handleInputBlur"
          :placeholder="$t('sidebar.filterPlaceholder')"
          class="w-full !bg-dark-900 !border-dark-700 !rounded !px-2 !py-1 !pl-7 !pr-12 !text-xs !text-dark-100 !font-sans"
        />

        <!-- Right Buttons inside Input -->
        <div class="absolute right-1 flex items-center space-x-0.5">
          <!-- Clear Button (X) -->
          <button
            v-if="filterQuery"
            type="button"
            @click.stop="clearFilter"
            class="p-0.5 text-dark-400 hover:text-dark-100 hover:bg-dark-750 rounded transition-colors"
            :title="$t('sidebar.filterClear')"
          >
            <X class="w-3 h-3" />
          </button>

          <!-- ComboBox Dropdown Toggle Arrow -->
          <button
            type="button"
            @click.stop="toggleHistoryDropdown"
            :class="[
              'p-0.5 rounded transition-colors',
              isHistoryDropdownOpen ? 'text-accent bg-dark-750' : 'text-dark-400 hover:text-dark-200 hover:bg-dark-750'
            ]"
            :title="$t('sidebar.filterHistory')"
          >
            <ChevronDown :class="['w-3 h-3 transition-transform duration-150', isHistoryDropdownOpen ? 'rotate-180' : '']" />
          </button>
        </div>
      </div>

      <!-- ComboBox Dropdown Menu -->
      <div
        v-if="isHistoryDropdownOpen"
        class="absolute left-2 right-2 top-full mt-1 z-50 bg-dark-800 border border-dark-700 rounded-md shadow-2xl py-1 text-xs font-sans text-dark-200 select-none overflow-hidden"
      >
        <!-- Dropdown Header -->
        <div class="px-2.5 py-1 text-xxs text-dark-400 border-b border-dark-750 flex items-center justify-between font-sans">
          <span class="flex items-center space-x-1">
            <History class="w-3 h-3 text-accent" />
            <span>{{ $t('sidebar.filterHistoryTitle') }}</span>
          </span>
          <span v-if="filterHistory.length > 0" class="text-xxs px-1 py-0.2 bg-dark-700 text-dark-300 rounded font-sans">
            {{ filterHistory.length }}
          </span>
        </div>

        <!-- History List -->
        <div
          v-if="filterHistory.length > 0"
          ref="historyListRef"
          class="max-h-56 overflow-y-auto py-0.5 font-sans"
        >
          <div
            v-for="(item, idx) in filterHistory"
            :key="item"
            @mousedown.prevent
            @click="selectHistoryItem(item)"
            @mouseenter="highlightedHistoryIndex = idx"
            :class="[
              'px-2.5 py-1.5 flex items-center justify-between cursor-pointer group transition-colors',
              highlightedHistoryIndex === idx
                ? 'bg-dark-700 text-dark-100'
                : 'hover:bg-dark-750 text-dark-300'
            ]"
          >
            <div class="flex items-center space-x-2 min-w-0 flex-1 mr-2">
              <Clock class="w-3 h-3 text-dark-500 group-hover:text-dark-400 flex-shrink-0" />
              <span class="text-xs truncate">{{ item }}</span>
            </div>
            <button
              type="button"
              @click.stop="handleRemoveHistoryItem(item)"
              class="p-0.5 text-dark-500 hover:text-danger rounded opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
              :title="$t('sidebar.deleteHistoryItem')"
            >
              <X class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="px-3 py-4 text-center text-dark-500 text-xs font-sans">
          {{ $t('sidebar.noFilterHistory') }}
        </div>

        <!-- Dropdown Footer -->
        <div
          v-if="filterHistory.length > 0"
          class="border-t border-dark-750 px-2.5 py-1 flex items-center justify-between bg-dark-850/60 font-sans"
        >
          <span class="text-xxs text-dark-500">{{ $t('sidebar.pressEnterToApply') }}</span>
          <button
            type="button"
            @mousedown.prevent
            @click.stop="handleClearAllHistory"
            class="text-xxs text-dark-400 hover:text-danger transition-colors"
          >
            {{ $t('sidebar.clearAllHistory') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Tree Content Area -->
    <div class="flex-1 overflow-y-auto px-1.5 py-2 text-xs font-sans">
      <!-- Section: Connections -->
      <div
        v-for="conn in connectionStore.connections"
        :key="conn.id"
        class="mb-2"
      >
        <!-- Connection Header Item -->
        <div
          @click="toggleConnectionExpand(conn.id)"
          @contextmenu.prevent="openConnContextMenu($event, conn)"
          :class="[
            'flex items-center space-x-1 px-1.5 py-1 rounded cursor-pointer group transition-colors relative',
            connectionStore.activeConnectionId === conn.id ? 'bg-dark-800 text-dark-100' : 'hover:bg-dark-750 text-dark-300'
          ]"
          :title="`${conn.name} - 點擊展開/收合 (切換工作連線請使用上方選單)`"
        >
          <!-- Direction chevron -->
          <button
            type="button"
            @click.stop="toggleConnectionExpand(conn.id)"
            class="p-0.5 hover:bg-dark-700 text-dark-500 hover:text-dark-200 rounded transition-colors flex-shrink-0 flex items-center justify-center"
            :title="$t('sidebar.expandCollapse')"
          >
            <component
              :is="expandedConns[conn.id] ? ChevronDown : ChevronRight"
              class="w-3 h-3"
            />
          </button>
          <Server
            :class="[
              'w-3.5 h-3.5 flex-shrink-0',
              connectionStore.activeConnectionId === conn.id && connectionStore.status === 'connected'
                ? 'text-ok'
                : 'text-dark-500'
            ]"
          />

          <span
            class="font-sans truncate flex-1"
            :style="getConnectionNameStyle(conn)"
          >{{ conn.name }}</span>

          <!-- Status indicator (when active in workspace) -->
          <Tag
            v-if="connectionStore.activeConnectionId === conn.id && connectionStore.status === 'connected'"
            severity="success"
            :value="$t('sidebar.inUse')"
            class="!text-xxs !font-normal !px-1.5 !py-0 flex-shrink-0 mr-1"
            :title="$t('sidebar.currentActiveConn')"
          />

          <!-- Action Buttons on Hover -->
          <div
            class="hidden group-hover:flex items-center space-x-0.5 flex-shrink-0 ml-1"
            @click.stop
          >
            <!-- Refresh connection -->
            <button
              type="button"
              @click.stop="handleRefreshConn(conn)"
              class="p-1 hover:bg-dark-700 text-dark-400 hover:text-dark-200 rounded transition-colors"
              :title="$t('sidebar.refresh')"
            >
              <RotateCw :class="['w-3 h-3', refreshingConnId === conn.id ? 'animate-spin text-accent' : '']" />
            </button>

            <!-- Edit Connection Settings -->
            <button
              type="button"
              @click.stop="handleEditConn(conn)"
              class="p-1 hover:bg-dark-700 text-dark-400 hover:text-dark-200 rounded transition-colors"
              :title="$t('sidebar.editConnection')"
            >
              <Settings class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- Connection Children: Databases -->
        <div v-if="expandedConns[conn.id]" class="pl-3.5 mt-1 space-y-0.5 border-l border-dark-750 ml-2">
          <div
            v-for="db in getFilteredDatabases(conn.id)"
            :key="db"
            class="space-y-0.5"
          >
            <!-- Database Item -->
            <div
              @click="toggleDatabaseExpand(conn.id, db)"
              @contextmenu.prevent="openDbContextMenu($event, conn, db)"
              :class="[
                'flex items-center space-x-1 px-1.5 py-0.5 rounded cursor-pointer transition-colors group',
                connectionStore.activeConnectionId === conn.id && connectionStore.activeDatabase === db
                  ? 'bg-amber-500/15 text-warn'
                  : 'text-dark-300 hover:bg-dark-750 hover:text-dark-100'
              ]"
              :title="`${db} - 點擊展開/收合，右鍵開啟選單 (匯出結構 CSV 等)`"
            >
              <!-- Direction Chevron Button -->
              <button
                type="button"
                @click.stop="toggleDatabaseExpand(conn.id, db)"
                class="p-0.5 hover:bg-dark-700 text-dark-500 hover:text-dark-200 rounded transition-colors flex-shrink-0 flex items-center justify-center"
                :title="$t('sidebar.expandCollapse')"
              >
                <component
                  :is="expandedDbs[`${conn.id}:${db}`] ? ChevronDown : ChevronRight"
                  class="w-2.5 h-2.5"
                />
              </button>
              <Database class="w-3 h-3 text-warn flex-shrink-0" />
              <span class="truncate flex-1">{{ db }}</span>
              <!-- Active database indicator -->
              <span
                v-if="connectionStore.activeConnectionId === conn.id && connectionStore.activeDatabase === db"
                class="text-xxs px-1.5 py-0.5 rounded bg-amber-500/15 text-warn font-sans border border-amber-500/30 flex-shrink-0 mr-1"
                :title="$t('sidebar.currentActiveDb')"
              >
                {{ $t('sidebar.inUse') }}
              </span>
            </div>

            <!-- Database Categories & Object Tree -->
            <div v-if="expandedDbs[`${conn.id}:${db}`]" class="pl-3.5 border-l border-dark-750 ml-2 space-y-1">
              <!-- Loading state -->
              <div
                v-if="loadingTablesByDb[`${conn.id}:${db}`] || schemaStore.loadingRoutinesByDb[`${conn.id}:${db}`]"
                class="py-1 px-1.5 text-xxs text-dark-400 flex items-center space-x-1.5"
              >
                <RotateCw class="w-3 h-3 animate-spin text-accent" />
                <span>{{ $t('sidebar.loadingObjects') }}</span>
              </div>

              <div v-else class="space-y-1">
                <!-- 1. 資料表 (Tables) -->
                <div class="space-y-0.5">
                  <div
                    @click="toggleFolder(conn.id, db, 'tables')"
                    class="flex items-center space-x-1 px-1.5 py-0.5 rounded cursor-pointer text-dark-400 hover:text-dark-200 hover:bg-dark-750 transition-colors"
                  >
                    <component
                      :is="isFolderExpanded(conn.id, db, 'tables') ? ChevronDown : ChevronRight"
                      class="w-2.5 h-2.5 text-dark-500"
                    />
                    <component
                      :is="isFolderExpanded(conn.id, db, 'tables') ? FolderOpen : Folder"
                      class="w-3 h-3 text-accent"
                    />
                    <span class="font-sans text-dark-200">{{ $t('sidebar.tables') }}</span>
                    <span class="text-xxs text-dark-500 font-sans">({{ getFilteredTables(conn.id, db).length }})</span>
                  </div>

                  <!-- Tables List -->
                  <div
                    v-if="isFolderExpanded(conn.id, db, 'tables')"
                    class="pl-3.5 border-l border-dark-750 ml-2 space-y-0.5"
                  >
                    <div
                      v-if="getFilteredTables(conn.id, db).length === 0"
                      class="py-0.5 px-1.5 text-xxs text-dark-500 italic"
                    >
                      {{ $t('sidebar.noTables') }}
                    </div>

                    <div
                      v-else
                      v-for="table in getFilteredTables(conn.id, db)"
                      :key="`${conn.id}:${db}:${table.schema}.${table.name}`"
                      class="space-y-0.5"
                    >
                      <!-- Table Item -->
                      <div
                        :id="`tree-node-${tableKey(conn.id, db, table.schema, table.name)}`"
                        draggable="true"
                        @dragstart="handleTableDragStart($event, conn.id, db, table.schema, table.name)"
                        @click="toggleTable(conn.id, db, table.schema, table.name)"
                        @contextmenu.prevent="openContextMenu($event, conn.id, db, table.schema, table.name, 'TABLE')"
                        @mouseenter="setHovered(table.name)"
                        @mouseleave="clearHovered"
                        :class="[
                          'flex items-center space-x-1 px-1.5 py-0.5 rounded cursor-pointer select-none group transition-all duration-150',
                          activeLocatedKey === tableKey(conn.id, db, table.schema, table.name)
                            ? 'bg-brand-500/25 ring-1 ring-brand-400 text-accent shadow-md shadow-brand-500/10'
                            : 'hover:bg-dark-750 text-dark-300 hover:text-dark-100'
                        ]"
                        :title="`${table.schema}.${table.name} (Table)`"
                      >
                        <component
                          :is="isTableExpanded(conn.id, db, table.schema, table.name) ? ChevronDown : ChevronRight"
                          class="w-2.5 h-2.5 text-dark-500 group-hover:text-dark-300 flex-shrink-0"
                        />
                        <Table2 class="w-3 h-3 text-accent flex-shrink-0" />
                        <span class="text-dark-400 text-xxs flex-shrink-0">{{ table.schema }}.</span>
                        <span class="truncate flex-1">{{ table.name }}</span>
                        <span
                          v-if="activeLocatedKey === tableKey(conn.id, db, table.schema, table.name)"
                          class="text-xxs px-1.5 py-0.5 bg-brand-600 text-white rounded font-sans flex-shrink-0 animate-pulse ml-1"
                        >
                          {{ $t('sidebar.located') }}
                        </span>
                      </div>

                      <!-- Columns List -->
                      <div
                        v-if="isTableExpanded(conn.id, db, table.schema, table.name)"
                        class="pl-3.5 border-l border-dark-750 ml-2 space-y-0.5"
                      >
                        <div
                          v-if="loadingColumns[tableKey(conn.id, db, table.schema, table.name)]"
                          class="py-0.5 px-1 text-xxs text-dark-400 flex items-center space-x-1.5"
                        >
                          <RotateCw class="w-2.5 h-2.5 animate-spin text-accent" />
                          <span>{{ $t('sidebar.loadingColumns') }}</span>
                        </div>

                        <div
                          v-else-if="getTableColumns(conn.id, db, table.schema, table.name).length === 0"
                          class="py-0.5 px-1 text-xxs text-dark-500 italic"
                        >
                          {{ $t('sidebar.noColumns') }}
                        </div>

                        <div
                          v-else
                          v-for="col in getTableColumns(conn.id, db, table.schema, table.name)"
                          :key="col.name"
                          @dblclick.stop="handleColumnDoubleClick(col)"
                          @contextmenu.prevent="openColumnContextMenu($event, col)"
                          @mouseenter="setHovered(col.name)"
                          @mouseleave="clearHovered"
                          class="flex items-center space-x-1.5 px-1.5 py-0.5 text-xxs rounded cursor-pointer select-none transition-colors group"
                          :class="[
                            isPendingColumn(col.name)
                              ? 'bg-brand-500/25 text-accent border border-brand-500/40 shadow-xs'
                              : 'text-dark-400 hover:text-dark-100 hover:bg-dark-750/70'
                          ]"
                          :title="$t('sidebar.doubleClickToPaste', { name: col.name })"
                        >
                          <Key v-if="col.isPrimaryKey" class="w-2.5 h-2.5 text-warn flex-shrink-0" />
                          <Columns v-else class="w-2.5 h-2.5 text-dark-500 group-hover:text-dark-300 flex-shrink-0" />
                          <span :class="[col.isPrimaryKey ? 'text-warn' : 'text-dark-300 group-hover:text-dark-100']" class="truncate flex-1">
                            {{ col.name }}
                          </span>
                          <span class="text-dark-500 lowercase font-sans text-xxs flex-shrink-0">
                            {{ col.dataType }}
                          </span>
                          <span
                            v-if="isPendingColumn(col.name)"
                            class="text-xxs px-1.5 py-0.5 bg-brand-500/30 text-accent rounded border border-brand-400/40 flex-shrink-0 animate-pulse"
                          >
                            {{ $t('sidebar.pendingPaste') }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 2. 檢視表 (Views) -->
                <div class="space-y-0.5">
                  <div
                    @click="toggleFolder(conn.id, db, 'views')"
                    class="flex items-center space-x-1 px-1.5 py-0.5 rounded cursor-pointer text-dark-400 hover:text-dark-200 hover:bg-dark-750 transition-colors"
                  >
                    <component
                      :is="isFolderExpanded(conn.id, db, 'views') ? ChevronDown : ChevronRight"
                      class="w-2.5 h-2.5 text-dark-500"
                    />
                    <component
                      :is="isFolderExpanded(conn.id, db, 'views') ? FolderOpen : Folder"
                      class="w-3 h-3 text-plan"
                    />
                    <span class="font-sans text-dark-200">{{ $t('sidebar.views') }}</span>
                    <span class="text-xxs text-dark-500 font-sans">({{ getFilteredViews(conn.id, db).length }})</span>
                  </div>

                  <!-- Views List -->
                  <div
                    v-if="isFolderExpanded(conn.id, db, 'views')"
                    class="pl-3.5 border-l border-dark-750 ml-2 space-y-0.5"
                  >
                    <div
                      v-if="getFilteredViews(conn.id, db).length === 0"
                      class="py-0.5 px-1.5 text-xxs text-dark-500 italic"
                    >
                      {{ $t('sidebar.noViews') }}
                    </div>

                    <div
                      v-else
                      v-for="view in getFilteredViews(conn.id, db)"
                      :key="`${conn.id}:${db}:${view.schema}.${view.name}`"
                      class="space-y-0.5"
                    >
                      <!-- View Item -->
                      <div
                        :id="`tree-node-${tableKey(conn.id, db, view.schema, view.name)}`"
                        draggable="true"
                        @dragstart="handleTableDragStart($event, conn.id, db, view.schema, view.name)"
                        @click="toggleTable(conn.id, db, view.schema, view.name)"
                        @contextmenu.prevent="openContextMenu($event, conn.id, db, view.schema, view.name, 'VIEW')"
                        @mouseenter="setHovered(view.name)"
                        @mouseleave="clearHovered"
                        :class="[
                          'flex items-center space-x-1 px-1.5 py-0.5 rounded cursor-pointer select-none group transition-all duration-150',
                          activeLocatedKey === tableKey(conn.id, db, view.schema, view.name)
                            ? 'bg-purple-500/25 ring-1 ring-purple-400 text-plan shadow-md shadow-purple-500/10'
                            : 'hover:bg-dark-750 text-dark-300 hover:text-dark-100'
                        ]"
                        :title="`${view.schema}.${view.name} (View)`"
                      >
                        <component
                          :is="isTableExpanded(conn.id, db, view.schema, view.name) ? ChevronDown : ChevronRight"
                          class="w-2.5 h-2.5 text-dark-500 group-hover:text-dark-300 flex-shrink-0"
                        />
                        <FileText class="w-3 h-3 text-plan flex-shrink-0" />
                        <span class="text-dark-400 text-xxs flex-shrink-0">{{ view.schema }}.</span>
                        <span class="truncate flex-1">{{ view.name }}</span>
                        <span
                          v-if="activeLocatedKey === tableKey(conn.id, db, view.schema, view.name)"
                          class="text-xxs px-1.5 py-0.5 bg-purple-600 text-white rounded font-sans flex-shrink-0 animate-pulse ml-1"
                        >
                          {{ $t('sidebar.located') }}
                        </span>
                      </div>

                      <!-- View Columns -->
                      <div
                        v-if="isTableExpanded(conn.id, db, view.schema, view.name)"
                        class="pl-3.5 border-l border-dark-750 ml-2 space-y-0.5"
                      >
                        <div
                          v-if="loadingColumns[tableKey(conn.id, db, view.schema, view.name)]"
                          class="py-0.5 px-1 text-xxs text-dark-400 flex items-center space-x-1.5"
                        >
                          <RotateCw class="w-2.5 h-2.5 animate-spin text-accent" />
                          <span>{{ $t('sidebar.loadingColumns') }}</span>
                        </div>

                        <div
                          v-else-if="getTableColumns(conn.id, db, view.schema, view.name).length === 0"
                          class="py-0.5 px-1 text-xxs text-dark-500 italic"
                        >
                          {{ $t('sidebar.noColumns') }}
                        </div>

                        <div
                          v-else
                          v-for="col in getTableColumns(conn.id, db, view.schema, view.name)"
                          :key="col.name"
                          @dblclick.stop="handleColumnDoubleClick(col)"
                          @contextmenu.prevent="openColumnContextMenu($event, col)"
                          @mouseenter="setHovered(col.name)"
                          @mouseleave="clearHovered"
                          class="flex items-center space-x-1.5 px-1.5 py-0.5 text-xxs rounded cursor-pointer select-none transition-colors group"
                          :class="[
                            isPendingColumn(col.name)
                              ? 'bg-brand-500/25 text-accent border border-brand-500/40 shadow-xs'
                              : 'text-dark-400 hover:text-dark-100 hover:bg-dark-750/70'
                          ]"
                          :title="$t('sidebar.doubleClickToPaste', { name: col.name })"
                        >
                          <Columns class="w-2.5 h-2.5 text-dark-500 group-hover:text-dark-300 flex-shrink-0" />
                          <span class="text-dark-300 group-hover:text-dark-100 truncate flex-1">
                            {{ col.name }}
                          </span>
                          <span class="text-dark-500 lowercase font-sans text-xxs flex-shrink-0">
                            {{ col.dataType }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 3. 預存程序 (Stored Procedures) -->
                <div class="space-y-0.5">
                  <div
                    @click="toggleFolder(conn.id, db, 'procs')"
                    class="flex items-center space-x-1 px-1.5 py-0.5 rounded cursor-pointer text-dark-400 hover:text-dark-200 hover:bg-dark-750 transition-colors"
                  >
                    <component
                      :is="isFolderExpanded(conn.id, db, 'procs') ? ChevronDown : ChevronRight"
                      class="w-2.5 h-2.5 text-dark-500"
                    />
                    <component
                      :is="isFolderExpanded(conn.id, db, 'procs') ? FolderOpen : Folder"
                      class="w-3 h-3 text-warn"
                    />
                    <span class="font-sans text-dark-200">{{ $t('sidebar.storedProcedures') }}</span>
                    <span class="text-xxs text-dark-500 font-sans">({{ getFilteredProcedures(conn.id, db).length }})</span>
                  </div>

                  <!-- Procedures List -->
                  <div
                    v-if="isFolderExpanded(conn.id, db, 'procs')"
                    class="pl-3.5 border-l border-dark-750 ml-2 space-y-0.5"
                  >
                    <div
                      v-if="getFilteredProcedures(conn.id, db).length === 0"
                      class="py-0.5 px-1.5 text-xxs text-dark-500 italic"
                    >
                      {{ $t('sidebar.noStoredProcedures') }}
                    </div>

                    <div
                      v-else
                      v-for="proc in getFilteredProcedures(conn.id, db)"
                      :key="`${conn.id}:${db}:${proc.schema}.${proc.name}`"
                      :id="`tree-node-${tableKey(conn.id, db, proc.schema, proc.name)}`"
                      @contextmenu.prevent="openContextMenu($event, conn.id, db, proc.schema, proc.name, 'PROCEDURE')"
                      @mouseenter="setHovered(proc.name)"
                      @mouseleave="clearHovered"
                      @dblclick="handleViewDefinition(conn.id, db, proc.schema, proc.name)"
                      :class="[
                        'flex items-center space-x-1 px-1.5 py-0.5 rounded cursor-pointer group transition-all duration-150',
                        activeLocatedKey === tableKey(conn.id, db, proc.schema, proc.name)
                          ? 'bg-amber-500/25 ring-1 ring-amber-400 text-warn shadow-md shadow-amber-500/10'
                          : 'hover:bg-dark-750 text-dark-300 hover:text-dark-100'
                      ]"
                      :title="`${proc.schema}.${proc.name} (Stored Procedure)`"
                    >
                      <Cog class="w-3 h-3 text-warn flex-shrink-0" />
                      <span class="text-dark-400 text-xxs flex-shrink-0">{{ proc.schema }}.</span>
                      <span class="truncate flex-1">{{ proc.name }}</span>
                      <span
                        v-if="activeLocatedKey === tableKey(conn.id, db, proc.schema, proc.name)"
                        class="text-xxs px-1.5 py-0.5 bg-amber-700 text-white rounded font-sans flex-shrink-0 animate-pulse ml-1"
                      >
                        {{ $t('sidebar.located') }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- 4. 函數 (Functions) -->
                <div class="space-y-0.5">
                  <div
                    @click="toggleFolder(conn.id, db, 'funcs')"
                    class="flex items-center space-x-1 px-1.5 py-0.5 rounded cursor-pointer text-dark-400 hover:text-dark-200 hover:bg-dark-750 transition-colors"
                  >
                    <component
                      :is="isFolderExpanded(conn.id, db, 'funcs') ? ChevronDown : ChevronRight"
                      class="w-2.5 h-2.5 text-dark-500"
                    />
                    <component
                      :is="isFolderExpanded(conn.id, db, 'funcs') ? FolderOpen : Folder"
                      class="w-3 h-3 text-info"
                    />
                    <span class="font-sans text-dark-200">{{ $t('sidebar.functions') }}</span>
                    <span class="text-xxs text-dark-500 font-sans">({{ getFilteredFunctions(conn.id, db).length }})</span>
                  </div>

                  <!-- Functions List -->
                  <div
                    v-if="isFolderExpanded(conn.id, db, 'funcs')"
                    class="pl-3.5 border-l border-dark-750 ml-2 space-y-0.5"
                  >
                    <div
                      v-if="getFilteredFunctions(conn.id, db).length === 0"
                      class="py-0.5 px-1.5 text-xxs text-dark-500 italic"
                    >
                      {{ $t('sidebar.noFunctions') }}
                    </div>

                    <div
                      v-else
                      v-for="func in getFilteredFunctions(conn.id, db)"
                      :key="`${conn.id}:${db}:${func.schema}.${func.name}`"
                      :id="`tree-node-${tableKey(conn.id, db, func.schema, func.name)}`"
                      @contextmenu.prevent="openContextMenu($event, conn.id, db, func.schema, func.name, 'FUNCTION')"
                      @mouseenter="setHovered(func.name)"
                      @mouseleave="clearHovered"
                      @dblclick="handleViewDefinition(conn.id, db, func.schema, func.name)"
                      :class="[
                        'flex items-center space-x-1 px-1.5 py-0.5 rounded cursor-pointer group transition-all duration-150',
                        activeLocatedKey === tableKey(conn.id, db, func.schema, func.name)
                          ? 'bg-sky-500/25 ring-1 ring-sky-400 text-info shadow-md shadow-sky-500/10'
                          : 'hover:bg-dark-750 text-dark-300 hover:text-dark-100'
                      ]"
                      :title="`${func.schema}.${func.name} (Function)`"
                    >
                      <Code2 class="w-3 h-3 text-info flex-shrink-0" />
                      <span class="text-dark-400 text-xxs flex-shrink-0">{{ func.schema }}.</span>
                      <span class="truncate flex-1">{{ func.name }}</span>
                      <span
                        v-if="activeLocatedKey === tableKey(conn.id, db, func.schema, func.name)"
                        class="text-xxs px-1.5 py-0.5 bg-sky-700 text-white rounded font-sans flex-shrink-0 animate-pulse ml-1"
                      >
                        {{ $t('sidebar.located') }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Draggable Vertical Splitter between Explorer and SQL Files -->
    <ResizableSplitter
      direction="vertical"
      :is-dragging="sqlFolderSplitter.isDragging.value"
      @pointerdown="sqlFolderSplitter.onPointerDown"
      @dblclick="resetFolderSplitter"
    />

    <!-- SQL Files Monitor Section -->
    <SqlFolderExplorer
      :style="{ height: `${sqlFolderSplitter.size.value}px` }"
      class="flex-shrink-0"
    />

    <!-- PrimeVue Context Menus -->
    <ContextMenu ref="objectMenuRef" :model="objectMenuItems" />
    <ContextMenu ref="connMenuRef" :model="connMenuItems" />
    <ContextMenu ref="dbMenuRef" :model="dbMenuItems" />
    <ContextMenu ref="columnMenuRef" :model="columnMenuItems" />

    <!-- Export Schema CSV Modal -->
    <ExportSchemaModal
      :is-open="isExportSchemaModalOpen"
      :connection-id="exportSchemaTarget.connId"
      :database="exportSchemaTarget.database"
      :connection-name="exportSchemaTarget.connName"
      @close="isExportSchemaModalOpen = false"
    />

    <!-- Delete Connection Confirm Modal -->
    <ConfirmModal
      :is-open="isDeleteModalOpen"
      :title="$t('sidebar.deleteConnection')"
      :message="$t('sidebar.deleteConnectionConfirm', { name: connToDelete?.name || '' })"
      :confirm-text="$t('common.delete')"
      :cancel-text="$t('common.cancel')"
      :is-danger="true"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </aside>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, reactive, nextTick, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import ContextMenu from 'primevue/contextmenu';
import Tag from 'primevue/tag';
import {
  Server,
  RotateCw,
  ChevronDown,
  ChevronRight,
  Database,
  Table2,
  FileText,
  Key,
  Columns,
  Settings,
  X,
  Folder,
  FolderOpen,
  Cog,
  Code2,
  History,
  Clock,
} from 'lucide-vue-next';
import ConfirmModal from '@/components/common/ConfirmModal.vue';
import ExportSchemaModal from '@/components/modals/ExportSchemaModal.vue';
import ResizableSplitter from '@/components/common/ResizableSplitter.vue';
import SqlFolderExplorer from './SqlFolderExplorer.vue';
import { useSplitter } from '@/composables/useSplitter';
import { useConnectionStore } from '@/stores/connectionStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTsvImportStore } from '@/stores/tsvImportStore';
import { schemaService } from '@/services/schemaService';

const { t } = useI18n();
import { connectionService } from '@/services/connectionService';
import { wrapIdentifierIfNeeded } from '@/utils/sqlParser';
import { resolveConnectionLabelColor } from '@/utils/connectionColor';
import { generateCreateTableDdl } from '@/utils/ddlGenerator';
import { collapseAllTreeNodes } from '@/utils/explorerTreeState';
import { useExplorerNodeCopy } from '@/composables/useExplorerNodeCopy';
import {
  loadFilterHistory,
  saveFilterHistory,
  addFilterHistoryItem,
  removeFilterHistoryItem,
  clearFilterHistory,
} from '@/utils/filterHistory';
import type { TableItem, ColumnItem, RoutineItem } from '@/types/schema';
import type { ConnectionProfile } from '@/types/connection';
import type { ExtractedTableIdentifier } from '@/utils/sqlIdentifierExtractor';

const emit = defineEmits<{
  (e: 'open-connection-modal'): void;
  (e: 'edit-connection', profile: ConnectionProfile): void;
  (e: 'duplicate-connection', profile: ConnectionProfile): void;
  (e: 'request-locate-table'): void;
}>();

const connectionStore = useConnectionStore();
const workspaceStore = useWorkspaceStore();
const tsvImportStore = useTsvImportStore();
const schemaStore = useSchemaStore();
const settingsStore = useSettingsStore();

// Explorer 節點複製名稱（hover + Ctrl/Cmd + C）
const { setHovered, clearHovered, copyName } = useExplorerNodeCopy();

const sidebarRootRef = ref<HTMLElement | null>(null);

const STORAGE_FOLDER_SPLITTER_KEY = 'sqlight_sql_folder_splitter_height';
function getSavedFolderSplitterHeight(): number {
  try {
    const saved = localStorage.getItem(STORAGE_FOLDER_SPLITTER_KEY);
    if (saved) {
      const val = parseInt(saved, 10);
      if (!isNaN(val) && val >= 60 && val <= 800) return val;
    }
  } catch {}
  return 220;
}

const sqlFolderSplitter = useSplitter({
  direction: 'vertical',
  initialSize: getSavedFolderSplitterHeight(),
  minSize: 70,
  maxSize: () => {
    const totalH = sidebarRootRef.value?.clientHeight || 600;
    return Math.max(100, totalH - 150);
  },
  reverse: true,
  onResize: (newSize) => {
    try {
      localStorage.setItem(STORAGE_FOLDER_SPLITTER_KEY, String(Math.round(newSize)));
    } catch {}
  },
});

function resetFolderSplitter() {
  sqlFolderSplitter.size.value = 220;
  try {
    localStorage.setItem(STORAGE_FOLDER_SPLITTER_KEY, '220');
  } catch {}
}

/** 連線名稱套用「標籤色彩」設定；未設定時沿用節點原本的文字樣式。 */
function getConnectionNameStyle(conn: ConnectionProfile): Record<string, string> {
  const color = resolveConnectionLabelColor(conn.color?.trim(), settingsStore.colorMode);
  if (!color) return {};
  return { color };
}

function isPendingColumn(colName: string): boolean {
  if (!workspaceStore.pendingColumnToInsert) return false;
  const wrapped = wrapIdentifierIfNeeded(colName);
  return (
    workspaceStore.pendingColumnToInsert === wrapped ||
    workspaceStore.pendingColumnToInsert === colName
  );
}

function handleColumnDoubleClick(col: ColumnItem) {
  const colText = wrapIdentifierIfNeeded(col.name);
  workspaceStore.setPendingColumnToInsert(colText);
  try {
    navigator.clipboard?.writeText(colText);
  } catch (err) {
    // Ignore clipboard access errors
  }
  workspaceStore.showToast(t('sidebar.rememberedColumn', { col: colText }), 'info', 2500);
}

const filterQuery = ref('');
const filterHistory = ref<string[]>(loadFilterHistory());
const isHistoryDropdownOpen = ref(false);
const highlightedHistoryIndex = ref(-1);
const filterContainerRef = ref<HTMLElement | null>(null);
const filterInputRef = ref<HTMLInputElement | null>(null);
const historyListRef = ref<HTMLElement | null>(null);
let debounceRecordTimer: ReturnType<typeof setTimeout> | null = null;

function recordCurrentFilter(query?: string) {
  const target = (query !== undefined ? query : filterQuery.value).trim();
  if (!target) return;
  filterHistory.value = addFilterHistoryItem(filterHistory.value, target);
  saveFilterHistory(filterHistory.value);
}

function clearFilter() {
  filterQuery.value = '';
  isHistoryDropdownOpen.value = false;
  highlightedHistoryIndex.value = -1;
  nextTick(() => {
    filterInputRef.value?.focus();
  });
}

function toggleHistoryDropdown() {
  isHistoryDropdownOpen.value = !isHistoryDropdownOpen.value;
  highlightedHistoryIndex.value = -1;
  if (isHistoryDropdownOpen.value) {
    nextTick(() => {
      filterInputRef.value?.focus();
    });
  }
}

function selectHistoryItem(item: string) {
  filterQuery.value = item;
  recordCurrentFilter(item);
  isHistoryDropdownOpen.value = false;
  highlightedHistoryIndex.value = -1;
  nextTick(() => {
    filterInputRef.value?.focus();
  });
}

function handleRemoveHistoryItem(item: string) {
  filterHistory.value = removeFilterHistoryItem(filterHistory.value, item);
  saveFilterHistory(filterHistory.value);
  if (highlightedHistoryIndex.value >= filterHistory.value.length) {
    highlightedHistoryIndex.value = filterHistory.value.length - 1;
  }
}

function handleClearAllHistory() {
  clearFilterHistory();
  filterHistory.value = [];
  highlightedHistoryIndex.value = -1;
  isHistoryDropdownOpen.value = false;
}

function scrollHighlightedIntoView() {
  nextTick(() => {
    const listEl = historyListRef.value;
    if (!listEl) return;
    const items = listEl.children;
    if (highlightedHistoryIndex.value >= 0 && items[highlightedHistoryIndex.value]) {
      (items[highlightedHistoryIndex.value] as HTMLElement).scrollIntoView({
        block: 'nearest',
      });
    }
  });
}

function handleKeyDown() {
  if (!isHistoryDropdownOpen.value) {
    isHistoryDropdownOpen.value = true;
    highlightedHistoryIndex.value = filterHistory.value.length > 0 ? 0 : -1;
    scrollHighlightedIntoView();
    return;
  }
  if (filterHistory.value.length === 0) return;
  if (highlightedHistoryIndex.value < filterHistory.value.length - 1) {
    highlightedHistoryIndex.value++;
  } else {
    highlightedHistoryIndex.value = 0;
  }
  scrollHighlightedIntoView();
}

function handleKeyUp() {
  if (!isHistoryDropdownOpen.value) return;
  if (filterHistory.value.length === 0) return;
  if (highlightedHistoryIndex.value > 0) {
    highlightedHistoryIndex.value--;
  } else {
    highlightedHistoryIndex.value = filterHistory.value.length - 1;
  }
  scrollHighlightedIntoView();
}

function handleKeyEnter() {
  if (isHistoryDropdownOpen.value && highlightedHistoryIndex.value >= 0) {
    const selected = filterHistory.value[highlightedHistoryIndex.value];
    if (selected) {
      selectHistoryItem(selected);
      return;
    }
  }
  recordCurrentFilter();
  isHistoryDropdownOpen.value = false;
  highlightedHistoryIndex.value = -1;
}

function handleKeyEsc() {
  if (isHistoryDropdownOpen.value) {
    isHistoryDropdownOpen.value = false;
    highlightedHistoryIndex.value = -1;
  } else if (filterQuery.value) {
    clearFilter();
  }
}

function handleInputBlur() {
  if (debounceRecordTimer) {
    clearTimeout(debounceRecordTimer);
    debounceRecordTimer = null;
  }
  recordCurrentFilter();
}

// Debounce record when user pauses typing
watch(filterQuery, (newVal) => {
  if (debounceRecordTimer) {
    clearTimeout(debounceRecordTimer);
    debounceRecordTimer = null;
  }
  const trimmed = (newVal || '').trim();
  if (trimmed.length >= 2) {
    debounceRecordTimer = setTimeout(() => {
      recordCurrentFilter(trimmed);
    }, 1200);
  }
});

// Click outside handling for dropdown
function handleDocumentPointerDown(event: PointerEvent) {
  if (!isHistoryDropdownOpen.value) return;
  const target = event.target as Node | null;
  if (filterContainerRef.value && target && !filterContainerRef.value.contains(target)) {
    isHistoryDropdownOpen.value = false;
    highlightedHistoryIndex.value = -1;
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  if (debounceRecordTimer) {
    clearTimeout(debounceRecordTimer);
  }
  if (highlightTimer) {
    clearTimeout(highlightTimer);
  }
});
const isRefreshing = ref(false);
const refreshingConnId = ref<string | null>(null);
const expandedConns = reactive<Record<string, boolean>>({});
const expandedDbs = reactive<Record<string, boolean>>({});
const expandedFolders = reactive<Record<string, boolean>>({});
const expandedTables = reactive<Record<string, boolean>>({});
const loadedColumns = reactive<Record<string, ColumnItem[]>>({});
const tablesByDb = schemaStore.tablesByDb;
const loadingTablesByDb = schemaStore.loadingTablesByDb;
const loadingColumns = reactive<Record<string, boolean>>({});
const activeLocatedKey = ref<string | null>(null);
let highlightTimer: ReturnType<typeof setTimeout> | null = null;

function handleLocateCurrentTable() {
  emit('request-locate-table');
}

function handleCollapseAll() {
  const knownConnectionIds = connectionStore.connections.map((c) => c.id);
  collapseAllTreeNodes(
    {
      expandedConns,
      expandedDbs,
      expandedFolders,
      expandedTables,
    },
    {
      collapseConnections: true,
      knownConnectionIds,
    }
  );

  // If a filter query is active, clear it so nodes aren't forced open by the search
  if (filterQuery.value) {
    filterQuery.value = '';
    isHistoryDropdownOpen.value = false;
    highlightedHistoryIndex.value = -1;
  }

  // Clear any active locate highlight
  if (activeLocatedKey.value) {
    activeLocatedKey.value = null;
  }
}

function isFolderExpanded(connId: string, db: string, folder: 'tables' | 'views' | 'procs' | 'funcs'): boolean {
  if (filterQuery.value.trim()) {
    return true;
  }
  const key = `${connId}:${db}:${folder}`;
  if (expandedFolders[key] === undefined) {
    return folder === 'tables';
  }
  return !!expandedFolders[key];
}

function toggleFolder(connId: string, db: string, folder: 'tables' | 'views' | 'procs' | 'funcs') {
  const key = `${connId}:${db}:${folder}`;
  expandedFolders[key] = !isFolderExpanded(connId, db, folder);
}

function getFilteredDatabases(connId: string): string[] {
  const dbs = connectionStore.getDatabases(connId);
  return dbs.filter((db) => {
    if (connectionStore.activeConnectionId === connId && connectionStore.activeDatabase === db) {
      return true;
    }
    return !settingsStore.isDatabaseHidden(db);
  });
}

function getFilteredTables(connId: string, db: string): TableItem[] {
  const key = `${connId}:${db}`;
  const list = (tablesByDb[key] || []).filter(
    (t) => t.kind === 'BASE TABLE' && !settingsStore.isTableHidden(t.name, t.schema)
  );
  const q = filterQuery.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (t) => t.name.toLowerCase().includes(q) || t.schema.toLowerCase().includes(q)
  );
}

function getFilteredViews(connId: string, db: string): TableItem[] {
  const key = `${connId}:${db}`;
  const list = (tablesByDb[key] || []).filter((t) => t.kind === 'VIEW');
  const q = filterQuery.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (t) => t.name.toLowerCase().includes(q) || t.schema.toLowerCase().includes(q)
  );
}

function getFilteredProcedures(connId: string, db: string): RoutineItem[] {
  const key = `${connId}:${db}`;
  const list = (schemaStore.routinesByDb[key] || []).filter((r) => r.kind === 'PROCEDURE');
  const q = filterQuery.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (r) => r.name.toLowerCase().includes(q) || r.schema.toLowerCase().includes(q)
  );
}

function getFilteredFunctions(connId: string, db: string): RoutineItem[] {
  const key = `${connId}:${db}`;
  const list = (schemaStore.routinesByDb[key] || []).filter((r) => r.kind === 'FUNCTION');
  const q = filterQuery.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (r) => r.name.toLowerCase().includes(q) || r.schema.toLowerCase().includes(q)
  );
}


// Delete connection state
const isDeleteModalOpen = ref(false);
const connToDelete = ref<ConnectionProfile | null>(null);

function handlePromptDelete(conn: ConnectionProfile) {
  connContextMenu.visible = false;
  connToDelete.value = conn;
  isDeleteModalOpen.value = true;
}

async function confirmDelete() {
  if (connToDelete.value) {
    try {
      await connectionStore.deleteConnection(connToDelete.value.id);
    } catch (err) {
      console.error('Failed to delete connection:', err);
    } finally {
      connToDelete.value = null;
      isDeleteModalOpen.value = false;
    }
  }
}

function cancelDelete() {
  connToDelete.value = null;
  isDeleteModalOpen.value = false;
}

// Object Context Menu
const contextMenu = reactive<{
  visible: boolean;
  x: number;
  y: number;
  connId: string;
  database: string;
  schema: string;
  tableName: string;
  objectType: 'TABLE' | 'VIEW' | 'PROCEDURE' | 'FUNCTION';
}>({
  visible: false,
  x: 0,
  y: 0,
  connId: '',
  database: '',
  schema: '',
  tableName: '',
  objectType: 'TABLE',
});

// Connection Context Menu
const connContextMenu = reactive<{
  visible: boolean;
  x: number;
  y: number;
  conn: ConnectionProfile | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  conn: null,
});

onMounted(async () => {
  await connectionStore.loadConnections();
  if (connectionStore.activeConnectionId) {
    expandedConns[connectionStore.activeConnectionId] = true;
    expandedDbs[`${connectionStore.activeConnectionId}:${connectionStore.activeDatabase}`] = true;
    if (connectionStore.status === 'connected') {
      await loadDatabaseTables(connectionStore.activeConnectionId, connectionStore.activeDatabase);
    }
  }
});

async function loadDatabaseTables(connId: string, db: string, force = false) {
  try {
    // Ensure backend session exists without mutating frontend activeConnectionId or activeDatabase
    await connectionService.connect(connId);
    await Promise.all([
      schemaStore.loadDatabaseTables(connId, db, force),
      schemaStore.loadDatabaseRoutines(connId, db, force),
    ]);
  } catch (err: unknown) {
    console.error(`Failed to load tables for ${connId}:${db}:`, err);
    alert(`載入資料庫 [${db}] 的物件失敗: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function refreshCurrent() {
  isRefreshing.value = true;
  try {
    await connectionStore.refreshDatabases();
    if (connectionStore.activeConnectionId && connectionStore.activeDatabase) {
      schemaStore.loadDatabaseSchema(connectionStore.activeConnectionId, connectionStore.activeDatabase, true).catch(() => {});
      schemaStore.loadDatabaseRoutines(connectionStore.activeConnectionId, connectionStore.activeDatabase, true).catch(() => {});
      await loadDatabaseTables(connectionStore.activeConnectionId, connectionStore.activeDatabase, true);
    }
  } catch (err: unknown) {
    console.error('Refresh current failed:', err);
    alert(`重新整理失敗: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    isRefreshing.value = false;
  }
}

async function handleRefreshConn(conn: ConnectionProfile) {
  connContextMenu.visible = false;
  refreshingConnId.value = conn.id;
  try {
    if (connectionStore.activeConnectionId !== conn.id || connectionStore.status !== 'connected') {
      await connectionStore.connect(conn.id);
      expandedConns[conn.id] = true;
    } else {
      await connectionStore.refreshDatabases(conn.id);
    }

    // Refresh all currently expanded databases for this connection
    const dbs = connectionStore.getDatabases(conn.id);
    for (const db of dbs) {
      const dbKey = `${conn.id}:${db}`;
      if (expandedDbs[dbKey]) {
        schemaStore.loadDatabaseSchema(conn.id, db, true).catch(() => {});
        schemaStore.loadDatabaseRoutines(conn.id, db, true).catch(() => {});
        await loadDatabaseTables(conn.id, db, true);
      }
    }
  } catch (err: unknown) {
    console.error('Failed to refresh connection:', err);
    alert(`連線或更新資料庫失敗: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    refreshingConnId.value = null;
  }
}

function handleEditConn(conn: ConnectionProfile) {
  connContextMenu.visible = false;
  emit('edit-connection', conn);
}

function handleDuplicateConn(conn: ConnectionProfile) {
  connContextMenu.visible = false;
  emit('duplicate-connection', conn);
}

async function handleDisconnect() {
  connContextMenu.visible = false;
  try {
    await connectionStore.disconnect();
  } catch (err) {
    console.warn('Disconnect error:', err);
  }
}

function toggleConnectionExpand(connId: string) {
  expandedConns[connId] = !expandedConns[connId];
}

async function toggleDatabaseExpand(connId: string, db: string) {
  const dbKey = `${connId}:${db}`;
  expandedDbs[dbKey] = !expandedDbs[dbKey];
  if (expandedDbs[dbKey]) {
    await loadDatabaseTables(connId, db);
  }
}

function tableKey(connId: string, db: string, schema: string, tableName: string) {
  return `${connId}:${db}:${schema}.${tableName}`;
}

function isTableExpanded(connId: string, db: string, schema: string, tableName: string) {
  return !!expandedTables[tableKey(connId, db, schema, tableName)];
}

async function toggleTable(connId: string, db: string, schema: string, tableName: string) {
  const key = tableKey(connId, db, schema, tableName);
  expandedTables[key] = !expandedTables[key];

  if (expandedTables[key] && !loadedColumns[key]) {
    loadingColumns[key] = true;
    try {
      const cols = await schemaService.getColumns(
        connId,
        schema,
        tableName,
        db
      );
      loadedColumns[key] = cols;
    } catch (err: unknown) {
      console.error('Failed to load columns:', err);
      alert(`載入欄位失敗: ${err instanceof Error ? err.message : String(err)}`);
      expandedTables[key] = false;
    } finally {
      loadingColumns[key] = false;
    }
  }
}

function getTableColumns(connId: string, db: string, schema: string, tableName: string) {
  return loadedColumns[tableKey(connId, db, schema, tableName)] ?? [];
}

const objectMenuRef = ref();
const connMenuRef = ref();
const dbMenuRef = ref();
const columnMenuRef = ref();

const objectMenuItems = computed(() => {
  const isTable = contextMenu.objectType === 'TABLE';
  const isView = contextMenu.objectType === 'VIEW';
  const isProc = contextMenu.objectType === 'PROCEDURE';
  const isFunc = contextMenu.objectType === 'FUNCTION';

  const items: any[] = [
    {
      label: t('sidebar.copyName'),
      icon: 'pi pi-copy',
      command: () => copyName(contextMenu.tableName),
    },
    { separator: true },
  ];
  if (isTable || isView) {
    items.push({
      label: isTable ? t('sidebar.openData') : t('sidebar.openViewData'),
      icon: 'pi pi-table',
      command: handleOpenData,
    });
    items.push({
      label: t('sidebar.tableStructure'),
      icon: 'pi pi-list',
      command: handleOpenStructure,
    });
  }
  if (isTable) {
    items.push({
      label: t('sidebar.erModel'),
      icon: 'pi pi-sitemap',
      command: () => handleOpenErDiagram(2),
    });
    if (workspaceStore.activeTab?.type === 'er_diagram') {
      items.push({
        label: t('sidebar.addToCurrentEr'),
        icon: 'pi pi-plus-circle',
        command: handleAddToCurrentErDiagram,
      });
    }
  }
  if (isTable || isView) {
    items.push({
      label: t('sidebar.generateSelect'),
      icon: 'pi pi-file-edit',
      command: handleGenerateSelect,
    });
  }
  if (isTable) {
    items.push({
      label: t('sidebar.scriptCreate'),
      icon: 'pi pi-file',
      command: handleGenerateCreateTableDdl,
    });
    items.push({
      label: t('sidebar.importTsv'),
      icon: 'pi pi-upload',
      command: handleTsvImport,
    });
  }
  if (isView || isProc || isFunc) {
    items.push({
      label: t('sidebar.viewDefinition'),
      icon: 'pi pi-code',
      command: () => handleViewDefinition(contextMenu.connId, contextMenu.database, contextMenu.schema, contextMenu.tableName),
    });
  }
  if (isProc) {
    items.push({
      label: t('sidebar.generateExec'),
      icon: 'pi pi-play',
      command: handleGenerateExec,
    });
  }
  if (isFunc) {
    items.push({
      label: t('sidebar.generateFuncSelect'),
      icon: 'pi pi-file-edit',
      command: handleGenerateFuncSelect,
    });
  }
  return items;
});

const connMenuItems = computed(() => {
  const conn = connContextMenu.conn;
  if (!conn) return [];
  const items: any[] = [
    {
      label: conn.name,
      disabled: true,
    },
    { separator: true },
    {
      label: t('sidebar.refresh'),
      icon: 'pi pi-refresh',
      command: () => handleRefreshConn(conn),
    },
    {
      label: t('sidebar.editConnection'),
      icon: 'pi pi-pencil',
      command: () => handleEditConn(conn),
    },
    {
      label: t('sidebar.duplicateConnection'),
      icon: 'pi pi-copy',
      command: () => handleDuplicateConn(conn),
    },
  ];

  if (connectionStore.activeConnectionId === conn.id && connectionStore.status === 'connected') {
    items.push({
      label: t('sidebar.disconnect'),
      icon: 'pi pi-power-off',
      command: handleDisconnect,
    });
  }

  items.push({ separator: true });
  items.push({
    label: t('sidebar.deleteConnection'),
    icon: 'pi pi-trash',
    class: '!text-danger',
    command: () => handlePromptDelete(conn),
  });

  return items;
});

const dbContextMenu = reactive<{
  conn: ConnectionProfile | null;
  database: string;
}>({
  conn: null,
  database: '',
});

const isExportSchemaModalOpen = ref(false);
const exportSchemaTarget = reactive<{
  connId: string;
  database: string;
  connName: string;
}>({
  connId: '',
  database: '',
  connName: '',
});

function openDbContextMenu(event: MouseEvent, conn: ConnectionProfile, db: string) {
  dbContextMenu.conn = conn;
  dbContextMenu.database = db;
  dbMenuRef.value?.show(event);
}

function handleOpenExportSchemaModal(conn: ConnectionProfile, database: string) {
  exportSchemaTarget.connId = conn.id;
  exportSchemaTarget.database = database;
  exportSchemaTarget.connName = conn.name;
  isExportSchemaModalOpen.value = true;
}

const dbMenuItems = computed(() => {
  const conn = dbContextMenu.conn;
  const db = dbContextMenu.database;
  if (!conn || !db) return [];

  const items: any[] = [
    {
      label: db,
      disabled: true,
    },
    { separator: true },
    {
      label: t('sidebar.exportDbSchemaCsv'),
      icon: 'pi pi-file-export',
      command: () => handleOpenExportSchemaModal(conn, db),
    },
    {
      label: t('sidebar.refreshObjects'),
      icon: 'pi pi-refresh',
      command: () => loadDatabaseTables(conn.id, db, true),
    },
  ];

  if (connectionStore.activeConnectionId !== conn.id || connectionStore.activeDatabase !== db) {
    items.push({
      label: t('sidebar.setAsCurrentDb'),
      icon: 'pi pi-database',
      command: async () => {
        if (connectionStore.activeConnectionId !== conn.id) {
          await connectionStore.connect(conn.id);
        }
        await connectionStore.switchDatabase(db);
      },
    });
  }

  return items;
});

// Column Context Menu (複製名稱)
const columnContextMenu = reactive<{ columnName: string }>({
  columnName: '',
});

const columnMenuItems = computed(() => [
  {
    label: t('sidebar.copyName'),
    icon: 'pi pi-copy',
    command: () => copyName(columnContextMenu.columnName),
  },
]);

function openColumnContextMenu(event: MouseEvent, col: ColumnItem) {
  columnContextMenu.columnName = col.name;
  columnMenuRef.value?.show(event);
}

function openContextMenu(
  event: MouseEvent,
  connId: string,
  db: string,
  schema: string,
  tableName: string,
  objectType: 'TABLE' | 'VIEW' | 'PROCEDURE' | 'FUNCTION' = 'TABLE'
) {
  contextMenu.connId = connId;
  contextMenu.database = db;
  contextMenu.schema = schema;
  contextMenu.tableName = tableName;
  contextMenu.objectType = objectType;
  objectMenuRef.value?.show(event);
}

function openConnContextMenu(event: MouseEvent, conn: ConnectionProfile) {
  connContextMenu.conn = conn;
  connMenuRef.value?.show(event);
}

async function handleOpenData() {
  if (contextMenu.connId && connectionStore.activeConnectionId !== contextMenu.connId) {
    try {
      await connectionStore.connect(contextMenu.connId);
    } catch (e) {
      console.warn('Connect failed:', e);
    }
  }
  if (contextMenu.database && connectionStore.activeDatabase !== contextMenu.database) {
    try {
      await connectionStore.switchDatabase(contextMenu.database);
    } catch (e) {
      console.warn('Switch DB failed:', e);
    }
  }
  workspaceStore.addTableDataTab(
    contextMenu.schema,
    contextMenu.tableName,
    contextMenu.connId,
    contextMenu.database
  );
  contextMenu.visible = false;
}

async function handleOpenStructure() {
  if (contextMenu.connId && connectionStore.activeConnectionId !== contextMenu.connId) {
    try {
      await connectionStore.connect(contextMenu.connId);
    } catch (e) {
      console.warn('Connect failed:', e);
    }
  }
  if (contextMenu.database && connectionStore.activeDatabase !== contextMenu.database) {
    try {
      await connectionStore.switchDatabase(contextMenu.database);
    } catch (e) {
      console.warn('Switch DB failed:', e);
    }
  }
  workspaceStore.addTableStructureTab(
    contextMenu.schema,
    contextMenu.tableName,
    contextMenu.connId,
    contextMenu.database
  );
  contextMenu.visible = false;
}

function handleTableDragStart(e: DragEvent, connId: string, db: string, schema: string, table: string) {
  if (!e.dataTransfer) return;
  const dbPrefix = db ? `[${db}].` : '';
  const sql = `SELECT TOP 1000\n  *\nFROM ${dbPrefix}[${schema}].[${table}];\n`;
  e.dataTransfer.setData(
    'application/sqlight-table',
    JSON.stringify({ connId, db, schema, table, sql })
  );
  e.dataTransfer.setData('text/plain', sql);
  e.dataTransfer.effectAllowed = 'copyMove';
}

async function handleOpenErDiagram(depth: 1 | 2 = 2) {
  if (contextMenu.connId && connectionStore.activeConnectionId !== contextMenu.connId) {
    try {
      await connectionStore.connect(contextMenu.connId);
    } catch (e) {
      console.warn('Connect failed:', e);
    }
  }
  if (contextMenu.database && connectionStore.activeDatabase !== contextMenu.database) {
    try {
      await connectionStore.switchDatabase(contextMenu.database);
    } catch (e) {
      console.warn('Switch DB failed:', e);
    }
  }

  workspaceStore.addErDiagramTab({
    rootSchema: contextMenu.schema,
    rootTable: contextMenu.tableName,
    depth,
    connectionId: contextMenu.connId,
    database: contextMenu.database,
  });
  contextMenu.visible = false;
}

function handleAddToCurrentErDiagram() {
  window.dispatchEvent(
    new CustomEvent('sqlight:add-table-to-er', {
      detail: {
        schema: contextMenu.schema,
        table: contextMenu.tableName,
        connId: contextMenu.connId,
        database: contextMenu.database,
      },
    })
  );
  contextMenu.visible = false;
}

async function handleGenerateSelect() {
  if (contextMenu.connId && connectionStore.activeConnectionId !== contextMenu.connId) {
    try {
      await connectionStore.connect(contextMenu.connId);
    } catch (e) {
      console.warn('Connect failed:', e);
    }
  }
  if (contextMenu.database && connectionStore.activeDatabase !== contextMenu.database) {
    try {
      await connectionStore.switchDatabase(contextMenu.database);
    } catch (e) {
      console.warn('Switch DB failed:', e);
    }
  }
  const dbPrefix = contextMenu.database ? `[${contextMenu.database}].` : '';
  const sql = `SELECT TOP 1000\n  *\nFROM ${dbPrefix}[${contextMenu.schema}].[${contextMenu.tableName}];\n`;
  workspaceStore.addSqlTab(
    sql,
    `${contextMenu.tableName}.sql`,
    contextMenu.connId,
    contextMenu.database
  );
  contextMenu.visible = false;
}

async function handleTsvImport() {
  const { connId, database, schema, tableName } = contextMenu;
  if (!connId || !database || !schema || !tableName) return;
  const connection = connectionStore.getConnectionById(connId);
  await tsvImportStore.open({
    connId,
    connectionName: connection?.name,
    database,
    schema,
    table: tableName,
  });
}

async function handleGenerateCreateTableDdl() {
  const { connId, database, schema, tableName } = contextMenu;
  const key = tableKey(connId, database, schema, tableName);
  let cols = loadedColumns[key];
  if (!cols || cols.length === 0) {
    try {
      cols = await schemaService.getColumns(connId, schema, tableName, database);
      loadedColumns[key] = cols;
    } catch (err) {
      console.error('Failed to get columns for DDL:', err);
    }
  }

  const ddl = generateCreateTableDdl({
    tableName,
    schema,
    database,
    columns: cols || [],
  });

  workspaceStore.addSqlTab(ddl, `${tableName}_ddl.sql`);
  workspaceStore.showToast(t('sidebar.generatedCreateTable', { schema, table: tableName }), 'success', 2500);
  contextMenu.visible = false;
}

async function handleViewDefinition(connId: string, database: string, schema: string, name: string) {
  try {
    if (connectionStore.activeConnectionId !== connId) {
      await connectionStore.connect(connId);
    }
    const def = await schemaStore.getObjectDefinition(connId, database, schema, name);
    if (def) {
      workspaceStore.addSqlTab(def, `${schema}.${name}.sql`);
      workspaceStore.showToast(t('sidebar.loadedSqlDef', { schema, name }), 'success', 2500);
    } else {
      const fallback = `-- 提示：未能直接讀取到 OBJECT_DEFINITION（可能為加密物件或缺少 VIEW DEFINITION 權限）
USE [${database}];
GO

SELECT OBJECT_DEFINITION(OBJECT_ID(N'[${schema}].[${name}]')) AS [Definition];
GO
`;
      workspaceStore.addSqlTab(fallback, `${schema}.${name}.sql`);
      workspaceStore.showToast(t('sidebar.cannotReadDef'), 'info', 2500);
    }
  } catch (err) {
    console.error('Failed to load object definition:', err);
  }
  contextMenu.visible = false;
}

function handleGenerateExec() {
  const { database, schema, tableName } = contextMenu;
  const sql = `-- ============================================================
-- 執行預存程序: [${schema}].[${tableName}]
-- 產生時間: ${new Date().toLocaleString()}
-- ============================================================
USE [${database}];
GO

DECLARE @RC int;
-- TODO: 如有參數請在此宣告與傳入：
-- DECLARE @Param1 int;

EXECUTE @RC = [${schema}].[${tableName}]
  -- @Param1 = @Param1
;

SELECT @RC AS [Return Code];
GO
`;
  workspaceStore.addSqlTab(sql, `EXEC_${tableName}.sql`);
  workspaceStore.showToast(t('sidebar.generatedExecTemplate', { schema, table: tableName }), 'success', 2500);
  contextMenu.visible = false;
}

function handleGenerateFuncSelect() {
  const { database, schema, tableName } = contextMenu;
  const sql = `-- ============================================================
-- 呼叫函數: [${schema}].[${tableName}]
-- 產生時間: ${new Date().toLocaleString()}
-- ============================================================
USE [${database}];
GO

-- 若為純量函數 (Scalar Function):
SELECT [${schema}].[${tableName}]() AS [Result];

-- 若為資料表值函數 (Table-valued Function):
-- SELECT * FROM [${schema}].[${tableName}]();
GO
`;
  workspaceStore.addSqlTab(sql, `SELECT_${tableName}.sql`);
  workspaceStore.showToast(t('sidebar.generatedFuncTemplate', { schema, table: tableName }), 'success', 2500);
  contextMenu.visible = false;
}

async function locateTable(options: ExtractedTableIdentifier & { database?: string; connectionId?: string }) {
  const targetConnId =
    options.connectionId ||
    workspaceStore.activeTab?.connectionId ||
    connectionStore.activeConnectionId;

  if (!targetConnId) {
    workspaceStore.showToast(t('sidebar.noConnCannotLocate'), 'warning', 2500);
    return;
  }

  const targetDb =
    options.database ||
    workspaceStore.activeTab?.database ||
    connectionStore.activeDatabase ||
    'master';

  // Ensure connection is active
  if (connectionStore.activeConnectionId !== targetConnId || connectionStore.status !== 'connected') {
    try {
      await connectionStore.connect(targetConnId);
    } catch (err: unknown) {
      workspaceStore.showToast(
        t('sidebar.connFailed', { error: err instanceof Error ? err.message : String(err) }),
        'error',
        3000
      );
      return;
    }
  }

  // Ensure database tables and routines are loaded
  const dbKey = `${targetConnId}:${targetDb}`;
  if (!tablesByDb[dbKey] || tablesByDb[dbKey].length === 0) {
    await loadDatabaseTables(targetConnId, targetDb);
  }

  const allTables = tablesByDb[dbKey] || [];
  const lowerTable = options.table.toLowerCase();
  const lowerSchema = options.schema?.toLowerCase();

  let matchedType: 'TABLE' | 'VIEW' | 'PROCEDURE' | 'FUNCTION' = 'TABLE';
  let matchedSchema = '';
  let matchedName = '';

  // 1. Search in BASE TABLE
  const matchedTable = allTables.find((t) => {
    if (t.kind !== 'BASE TABLE') return false;
    if (lowerSchema) {
      return t.schema.toLowerCase() === lowerSchema && t.name.toLowerCase() === lowerTable;
    }
    return t.name.toLowerCase() === lowerTable;
  });

  if (matchedTable) {
    matchedType = 'TABLE';
    matchedSchema = matchedTable.schema;
    matchedName = matchedTable.name;
  } else {
    // 2. Search in VIEW
    const matchedView = allTables.find((t) => {
      if (t.kind !== 'VIEW') return false;
      if (lowerSchema) {
        return t.schema.toLowerCase() === lowerSchema && t.name.toLowerCase() === lowerTable;
      }
      return t.name.toLowerCase() === lowerTable;
    });

    if (matchedView) {
      matchedType = 'VIEW';
      matchedSchema = matchedView.schema;
      matchedName = matchedView.name;
    } else {
      // 3. Search in ROUTINES (Procedures / Functions) as a helpful fallback
      const routines = schemaStore.routinesByDb[dbKey] || [];
      const matchedRoutine = routines.find((r) => {
        if (lowerSchema) {
          return r.schema.toLowerCase() === lowerSchema && r.name.toLowerCase() === lowerTable;
        }
        return r.name.toLowerCase() === lowerTable;
      });

      if (matchedRoutine) {
        matchedType = matchedRoutine.kind === 'PROCEDURE' ? 'PROCEDURE' : 'FUNCTION';
        matchedSchema = matchedRoutine.schema;
        matchedName = matchedRoutine.name;
      }
    }
  }

  if (!matchedName) {
    const displayTarget = options.schema ? `${options.schema}.${options.table}` : options.table;
    workspaceStore.showToast(
      t('sidebar.objectNotFoundInDb', { db: targetDb, target: displayTarget }),
      'warning',
      3000
    );
    return;
  }

  // If a filter is currently active and hides this matched object, clear the filter
  if (filterQuery.value.trim()) {
    const q = filterQuery.value.trim().toLowerCase();
    if (!matchedName.toLowerCase().includes(q) && !matchedSchema.toLowerCase().includes(q)) {
      filterQuery.value = '';
    }
  }

  // Expand parent Connection and Database
  expandedConns[targetConnId] = true;
  expandedDbs[`${targetConnId}:${targetDb}`] = true;

  // Expand folder according to matched type
  if (matchedType === 'TABLE') {
    expandedFolders[`${targetConnId}:${targetDb}:tables`] = true;
  } else if (matchedType === 'VIEW') {
    expandedFolders[`${targetConnId}:${targetDb}:views`] = true;
  } else if (matchedType === 'PROCEDURE') {
    expandedFolders[`${targetConnId}:${targetDb}:procs`] = true;
  } else if (matchedType === 'FUNCTION') {
    expandedFolders[`${targetConnId}:${targetDb}:funcs`] = true;
  }

  const targetKey = tableKey(targetConnId, targetDb, matchedSchema, matchedName);

  // If table or view, expand it and load columns if not loaded
  if (matchedType === 'TABLE' || matchedType === 'VIEW') {
    expandedTables[targetKey] = true;
    if (!loadedColumns[targetKey]) {
      loadingColumns[targetKey] = true;
      schemaService
        .getColumns(targetConnId, matchedSchema, matchedName, targetDb)
        .then((cols) => {
          loadedColumns[targetKey] = cols;
        })
        .catch((err) => {
          console.warn('Failed to load columns for located table:', err);
        })
        .finally(() => {
          loadingColumns[targetKey] = false;
        });
    }
  }

  // Set highlight
  activeLocatedKey.value = targetKey;

  // Scroll into view
  await nextTick();
  setTimeout(() => {
    const el = document.getElementById(`tree-node-${targetKey}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 60);

  // Reset highlight after 3.5s
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    if (activeLocatedKey.value === targetKey) {
      activeLocatedKey.value = null;
    }
  }, 3500);

  const typeDesc =
    matchedType === 'TABLE' ? t('sidebar.tables') :
    matchedType === 'VIEW' ? t('sidebar.views') :
    matchedType === 'PROCEDURE' ? t('sidebar.storedProcedures') : t('sidebar.functions');

  workspaceStore.showToast(
    t('sidebar.locatedObject', { type: typeDesc, schema: matchedSchema, name: matchedName }),
    'success',
    2500
  );
}

defineExpose({
  locateTable,
  collapseAll: handleCollapseAll,
});
</script>
