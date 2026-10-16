# SQLight 修正進度

目標：依專案分析逐步修正執行正確性、DML 產生、查詢資源管理、資料保真及維護性。整體目標尚未完成。

## 已實作（2026-09-12）

- 每次 query IPC 必須指定 database；後端在同一個 session lock 內切換並執行，切換失敗即停止。
- 全域連線表改為短時間取用；不同連線使用各自的執行鎖。
- 切換成功後才更新前端顯示及持久化；過期連線回應不覆蓋最近選擇。
- SQL 分頁及表格瀏覽使用分頁綁定的連線／資料庫。刪除連線後的分頁不再靜默改綁其他伺服器。
- metadata 請求重新選擇指定資料庫，不依賴可能被使用者 USE 指令改變的快取狀態。
- encrypt 設定套用 Tiberius Required／Off。
- 結果逐列讀取，超出每個結果集上限後不保留或轉換資料；仍讀完伺服器串流。空結果集保留 metadata，串流中途錯誤保留已取得結果。
- bigint 超過 JS 安全整數範圍時輸出字串；datetime2/time 保留七位小數，datetimeoffset 使用驅動的時區轉換。
- DML 要求完整 PK metadata 才只使用 PK；否則用全投影欄位。UPDATE/DELETE 包含獨立交易及單筆影響數驗證，零筆／多筆時回滾。空列、缺欄、重名欄、無原始值的 binary 和不精確 JS 整數會拒絕產生。
- DML 省略 Identity 寫入；保留目標 database／connection。右鍵操作改以 event.data 找原始列，避免排序／篩選後誤用顯示索引。
- 語句擷取先遮蔽字串、識別字、巢狀註解，再判斷 GO。控制流程、變數與交易保留整個 batch；不因一般空白行移除 WHERE。空擷取結果不再退回執行整頁。
- 新增 npm test 及 Rust 核心測試。核心單元測試不引用 Tauri UI 啟動程式，避免 GNU 測試執行檔缺 Common Controls v6 manifest 的 TaskDialogIndirect 入口點問題。

## 已實作（2026-09-21）：寬表格水平捲軸拖曳效能

症狀：查詢結果欄位過多（實測 140 欄、約 1000 列）時，於 Tauri 桌面版拖曳水平捲軸非常慢。

量測（暫存區獨立 benchmark，使用 repo 內同一顆 ag-grid-community 36.1.0，重現同一組 grid options、pinned `#` 欄、每欄 valueGetter/valueFormatter/5 條 cellClassRules、Vue reactive 列資料、140 欄 × 1000 列）：

- 純 AG Grid 預設：frame 平均 16.7ms、p90 17.8ms、max 18.9ms（336 cells 在 DOM）。
- SQLight 完整設定：平均 16.7ms、p90 17.7ms、max 18.9ms。
- 加上捲動時選取高亮 DOM 掃描、Vue reactive 列資料、長文字欄位：皆維持 60fps。
- 快速拖曳（每 frame 跳約 17 欄）：平均 16.9ms、max 20.2ms。
- 對照組強制關閉欄虛擬化：3384 cells 在 DOM，仍為 16.7ms。

結論：目前 grid 設定與此資料規模本身不是瓶頸，欄虛擬化正常運作；因此改為「先量測、再依判準修正」，並移除已知的每幀額外成本。

已實作：

1. 新增 dev-only 診斷 `src/composables/useGridPerfDiag.ts`：即時 FPS/p95/max、DOM cell 數、DOM/可見/總欄數、viewport 寬度與 dpr，並內建「Run scroll benchmark」以 120 幀掃過整個水平範圍。啟用方式：`localStorage.setItem('sqlight.perfHud', '1')` 後重載，正式版不註冊任何程式碼。
2. `useGridSelection`：可見欄順序改為快取（欄位搬移／釘選／換結果集時失效）；無選取時捲動不再走訪 cell DOM；捲動高亮只處理可見列範圍；window `mousemove`/`mouseup` 改為僅在框選拖曳期間掛載。
3. `ResultGridItem`：交給 AG Grid 的 `rowData` 改為 `toRaw(...)`（避免 10 萬筆以上的深層 reactive proxy 與 ag-grid-vue3 的 deep watch）；`columnDefs` 以欄位簽章記憶化，避免 AG Grid 重套整個欄位模型；`#` 釘選欄改為不透明底色；選取高亮移除 inset box-shadow；水平捲動期間加 `.is-h-scrolling` 關閉裝飾性 transition。
4. `ResultGridItem`：`first-data-rendered` 後檢查欄虛擬化是否被抑制（AG Grid 在 `viewportRight === 0` 時會渲染全部欄位），必要時微調 viewport 觸發重算。

待確認（需實機量測）：

- 若 HUD 顯示 `virtualisation ok`、benchmark 亦順暢，但手動拖曳捲軸仍卡，代表瓶頸落在 WebView2 的原生捲軸拖曳繪製路徑，才進一步評估 `additionalBrowserArgs`（`--enable-gpu-rasterization` 等）並以同一 benchmark 前後比較。
- `TableDataViewer`（資料表瀏覽網格）尚未套用 raw rowData 與 `#` 欄不透明底色，如需一致化可後續處理。

## 已實作（2026-09-22）：AG Grid 官方 Scrolling Performance 對照

對照 AG Grid 官方 «Scrolling Performance»（v36.2.0）逐項檢查結果網格：

| 文章建議 | SQLight 現況 | 處置 |
| --- | --- | --- |
| Setting Expectations | 已有 dev-only HUD + 捲動 benchmark | 擴充 filter benchmark |
| Check / Defer / Avoid Cell Renderers | 結果網格完全沒有 cellRenderer，只用 valueGetter / valueFormatter | 無需處理 |
| Avoid Auto Height | 主題固定 rowHeight 28、headerHeight 30 | 無需處理 |
| Skip Off-screen Grids | `App.vue` 底部面板為 `v-if`，`AppBottomPanel` 分頁與 `AppMain` 編輯分頁皆為 `v-else-if`，同時只掛載一個網格；堆疊模式各窗格本身仍在可視區內 | 評估後不採用 `enableContentVisibilityAuto` |
| Configure Row Buffer | `columnBuffer: 4` 已調降，`rowBuffer` 維持預設 10 | 維持預設（量測後無垂直重繪症狀） |
| Debounce Vertical Scroll | 未設定 | 不採用（垂直捲動是核心操作，且症狀在水平方向） |
| Disable Row Highlighting | 已開 `suppressRowHoverHighlight` | 無需處理 |

已實作：

1. **移除 `:suppress-column-virtualisation="true"`**（2026-09-22 的 `2d56f02` 所加）。該設定會讓寬結果集把全部欄位鋪進 DOM，與同檔案的 `ensureColumnVirtualisation()` 修補、以及 HUD 的 `columnVirtualisationSuspected` 判準直接矛盾，是本輪最可能造成回歸的一行。
2. **新增 dev-only 合成結果集** `src/utils/perfGridFixture.ts`：固定種子的決定性產生器，型別混合 int / bigint / nvarchar / nvarchar(max) / bit / datetime2 / decimal / uniqueidentifier / varbinary，可為 NULL 的欄位每 17 列插入 NULL。`queryService.executeQuery` 在 `import.meta.env?.DEV` 且 SQL 帶有 `sqlight:perf-fixture` 區塊註解時直接回傳 fixture，不走 IPC，因此 Tauri 桌面版也能重現。已確認正式建置中查無 fixture 的任何痕跡（rollup 已移除整支模組）。
3. **擴充 `useGridPerfDiag`**：新增 `runFilterSettleBenchmark()` 與 HUD 上的「Run filter benchmark」按鈕，量測 quick filter 每次套用的主執行緒阻塞時間（`applyMs`）與下一次繪製的 settle 時間，並在結束後還原原本的 `quickFilterText`。
4. **Quick Filter debounce**：超過門檻的結果集改為 250ms debounce，門檻 10,000 列。輸入框綁 `quickFilterInput`，網格綁 debounce 後的 `quickFilter`；門檻以下維持即時篩選，timer 於 `onBeforeUnmount` 清除。

### 實機量測（2026-09-22，Tauri desktop，150 欄）

水平捲動 benchmark（120 幀）：

| 資料量 | avg | p95 | max | over32 |
| --- | --- | --- | --- | --- |
| 150 欄 × 1,000 列 | 16.67ms | 17.8ms | 24.8ms | 0 |
| 150 欄 × 50,000 列 | 16.68ms | 17.4ms | 23.3ms | 0 |

Quick filter benchmark（`applyMs` = 單次套用阻塞主執行緒的時間）：

| 資料量 | 1 | 12 | 123 | abc | zzzz | p95 |
| --- | --- | --- | --- | --- | --- | --- |
| 150 欄 × 1,000 列 | 1.2ms | 1.7ms | 17.3ms | 20.9ms | 17.7ms | 20.9ms |
| 150 欄 × 50,000 列 | 19.8ms | 57.2ms | 411ms | 497ms | 465ms | 497ms |

判讀：

- **捲動不是瓶頸**：兩個資料量都維持 60fps、`overBudgetFrames` 皆為 0，與 2026-09-21 的基準一致（avg 16.7ms / p95 17.8ms）。移除 `suppressColumnVirtualisation` 沒有讓捲動變差。max 由 18.9ms 變為 22.3～24.8ms 屬單一尖峰，p95 未變；同一設定重跑兩次的 p95 分別為 17.4ms 與 17.6ms，fixture 的重複性成立。
- **欄虛擬化已回復**（驗收關閉）：HUD 快照在兩個資料量下都相同 —— `cells 286 cols dom/visible/total 22/150/151`、`virtualisation ok`。150 個顯示欄只把 22 個放進 DOM（1780px viewport / 13884px 內容寬），且 1,000 列與 50,000 列的 DOM 足跡完全一致，代表 DOM 大小已與資料量脫鉤。對照 2026-09-21 停用欄虛擬化時的 3,384 cells（140 欄、不同 viewport），DOM cell 數降低約 92%。
- **Quick Filter 才是真瓶頸**：1,000 列時單次套用最高 20.9ms（可接受），50,000 列時變成 411～497ms。以兩點線性推估，單次套用達到 100ms 預算約在 10,000 列，正好是應用程式的預設 `maxRows`，因此 debounce 門檻訂在 10,000 列。debounce 不會降低單次成本，但會把「每敲一鍵各付一次」收斂成「停手後付一次」：輸入 `abc` 由 19.8 + 57.2 + 411ms 降為單次 411ms。
- **`cacheQuickFilter` 不採用**：官方語意是每列預先串接所有欄位值（含 value getter）後只做字串搜尋，對 150 欄 × 7.5M 次 valueGetter 的掃描確實對症，但它標記為 `@initial`，只能在建立網格時決定，而同一元件實例會因切換結果分頁／重新整理而換掉資料集，無法隨列數動態開關；加上每列約 1.5–2KB 的聚合字串，50,000 列約 75–90MB、無上限（`maxRows = none`）情境可達 GB 級。決策理由：5 萬列的篩選本來就應該下推成 SQL `WHERE` 由伺服器執行，用戶端 quick filter 只是已載回結果集的便利功能，不該為一個不應存在的用法付出 GB 級記憶體。
- **`rowBuffer` 維持預設 10**：沒有觀察到垂直重繪問題，且調整它是拿首次繪製時間去換一個尚未出現的症狀。

後續待辦：

- 移除 `suppressColumnVirtualisation` 後若出現可重現的渲染缺陷（捲動空白欄、釘選欄錯位、右鍵選單對錯儲存格）：先把 `columnBuffer` 由 4 提高到 8 再測；仍存在才改為條件式啟用（computed 初值 false，僅在重現出的確切條件下為 true，並註記症狀）。
- 尚未人工確認移除該行後的互動正確性：捲動時無空白欄、釘選 `#` 欄對齊、欄位拖曳排序、釘選切換、右鍵選單與 DML 產生、框選高亮、匯出。

## 已實作（2026-09-23）：深色／淺色佈景配色全面檢查

依 WCAG 2.1 對比準則檢查 5 種 surface × 深淺 2 種模式，完整報告見 `docs/theme-color-audit.md`。

量測到的問題（修正前）：深色 muted 文字 3.07–3.78:1、分隔線文字 2.29–2.36:1、淺色 muted 文字 4.34–4.40:1、淺色模式約 325 處沿用深色底用的亮 accent（1.5–4.0:1）、狀態色塊上的文字最低 1.12:1、分頁圖示 1.54–2.54:1、Tabulator 淺色 binary／modified 1.80／1.12:1、Monaco 淺色行號 2.56:1、連線標籤色最低 1.9:1。

已實作：

1. 文字色階整體位移一格（`buildThemeTokens()` 純函式 + `main.css` 靜態初值），muted 文字在深淺模式皆 ≥ 4.5:1，且 5 種 surface 全部通過。
2. 新增 8 個語意角色色（`accent/ok/danger/warn/info/plan/er/structure`）並全面替換 36 個檔案、456 處 accent 文字；淺色值以「白底、面板底、15–25% 同色系底色」三者最差情況選定。
3. 63 處深色專用色塊補上淺色版本（`bg-<hue>-50|100 dark:bg-<hue>-950/…`），錯誤／成功提示在淺色模式恢復可讀。
4. Tabulator（muted／binary／bool／modified／排序箭頭）、Monaco（抽出 `utils/editorThemeTokens.ts`）、分頁圖示（`iconColorLight`）、執行計畫 tooltip、連線標籤色（新增 `utils/connectionColor.ts`）等元件層修正。
5. 一致性：AI／資料檢視 modal 固定色碼改回 surface token、`border-dark-650`（Tailwind 未定義）改為 `border-dark-700`、對話框 ring 改為深淺分流、`index.html` 於首次繪製前套用已儲存的色彩模式並宣告 `color-scheme`。

## 已實作（2026-09-23）：多結果集「隱藏工具列」純資料檢視

一次查詢回傳多個 DataGrid 時，逐格檢視資料的可用高度被每個網格自己的工具列（快速篩選、複製、重新整理、DML）與下方統計列吃掉。於多結果集檢視列的「等分高度」左側新增「隱藏工具列」切換鈕。

- 切換後該結果分頁下所有網格（堆疊、最大化、分頁檢視皆同）同時隱藏上方工具列與下方資訊／統計列，只留標題列與資料區；按鈕再按一次（標籤變為「顯示工具列」）即還原。
- 狀態存放於 `gridLayoutStore`（`isToolbarHidden`／`setToolbarHidden`／`toggleToolbarHidden`），以結果分頁 ID 為 key，切換結果分頁、底部面板分頁或重繪網格都不會遺失，關閉該結果分頁時由 `clearTab` 一併清除。
- 單一結果集沒有此檢視列，維持原本的工具列；`ResultGrid` 端以 `resultSets.length > 1` 守門，避免舊狀態讓單一網格被鎖在無工具列的畫面。
- 雙擊分割線等分、拖曳分割線、欄寬與排序記憶皆不受影響（各網格容器高度不變，省下的高度直接給資料區）。
- 同一波調整：多結果集時每個網格工具列最左側的 `Result #N (N)` 標籤改回一般字重。PrimeVue Aura 的 `.p-tag` 預設 `font-weight: 700`，以 `!font-normal` 覆寫（與 AppMain／AppBottomPanel 的既有寫法一致）。

## 已實作（2026-09-23）：DataGrid 工具列字型回歸「外觀與主題」

症狀：`外觀與主題` 的「全域介面字型」對 DataGrid 沒有作用。原因是三個網格元件的根容器硬寫 `font-mono`（Tailwind 的 Fira Code 堆疊），工具列、快速篩選、列數與空狀態全部繼承它，等於自行跳脫 `--app-font-sans`。

邊界改為：`查詢與結果` 的「結果表格字型」只作用在表格內容（`.tabulator` 由 `--sqlight-grid-font` 決定），其餘屬於 DataGrid 外框的部分一律跟隨全域介面字型。

已實作：

1. `ResultGridItem`／`ResultGrid`／`TableDataViewer`／`TableStructureViewer` 根容器由 `font-mono` 改為 `font-sans`（`var(--app-font-sans)`）。
2. 工具列內會蓋掉容器字型的寫法一併移除：`Result #N (N)` 標籤的 `!font-mono`、三處快速篩選 `InputText` 的 `font-mono`、`N rows` 列數的 `font-mono`、`TableStructureViewer` 三個統計 Tag 的 `!font-mono`、多結果集分頁按鈕的列數 `font-mono`。PrimeVue 的 `.p-button`／`.p-inputtext` 都是 `font-family: inherit`，因此會直接吃到新設定。
3. 表格內容不受影響：`--sqlight-grid-font` 仍只綁在 `.sqlight-grid` 外框（`tests/grid_font_settings.test.ts` 既有斷言不變）。下方資訊列的統計數字、右鍵選單的欄名數值、Commit 對話框的 SQL 仍保留等寬字，因為它們顯示的是資料值／SQL，不是外框文案。

## 已實作（2026-09-23）：GO 批次執行與連線 Session 鎖定

解決先前「後端將整段含 GO 的 SQL 直接送交 TDS 導致語法錯誤」以及「前端迴圈執行多 batch 會釋放連線鎖導致 Session / 暫存表 / USE 狀態脫鉤」之問題。

1. **後端 T-SQL GO 解析器 (`src-tauri/src/drivers/mssql/batch.rs`)**：
   - 逐字元解析遮蔽單引號字串（`'...'`）、識別字（`[...]`、`"..."`）、單行註解（`--`）與支援巢狀之區塊註解（`/* /* ... */ */`）。
   - 精確辨識獨立行 `GO`（不分大小寫），支援重複次數 `GO <count>`（如 `GO 5`）與同移行註解（如 `GO 3 -- repeat`）。
   - 保留每個 batch 在完整指令稿中的 1-indexed `start_line`，用於伺服器錯誤行號映射。
   - 內建 `detect_use_database` 識別 `USE [dbname]` 並在切換成功後同步連線之 `current_database`。
2. **原子性 Session Lock 批次串行執行 (`connection.rs` / `connection_manager.rs`)**：
   - `ConnectionManager::execute_query` 在同一把 Mutex 連線鎖內完成目標資料庫驗證/切換與所有 batches 依序執行。
   - 暫存表 `#temp`、資料庫上下文 `USE`、交易 `BEGIN TRANSACTION` 跨 batch 完全保真，不受背景 metadata 或其他分頁請求插隊干擾。
   - 伺服器報錯時，以 `start_line + srv.line() - 1` 精確對齊回 Monaco 編輯器實際行號，並中斷後續 batches 執行。
   - 查詢取消（`KILL <spid>`）能即時中斷正在執行的 batch 並中止後續批次。
   - 聚合所有 batches 的 `result_sets`、`messages`，累加 `affected_rows` 並記錄完整耗時。
3. **前端調度與工具鏈強化 (`queryStore.ts` / `sqlStatementExtractor.ts`)**：
   - `sqlStatementExtractor.ts` 新增 `splitSqlBatchesWithMeta`，輸出 `{ sql, startLine, repeatCount }`；`splitSqlBatches` 自動展開重複次數。
   - `queryStore.execute` 將包含 GO 的腳本直接委任給後端單一 session lock 執行；僅在單一 batch 時注入效能統計腳本（避免跨 GO 變數失效）。

## 已實作（2026-09-30）：把邊緣阻力與回彈統一給所有 Dialog

回饋：「AI 與 資料檢視 只有這 2 個 Dialog 有超出邊界回彈的效果，其它的 Dialog 沒有? 請統一」。

前一節把橡皮筋保留給兩個浮動視窗、對話框維持硬夾，是刻意的差異化；回饋確認要一致，因此改為**所有 14 個視窗共用同一套拖曳手感**。

### 實作

1. 新增 `src/composables/windowDrag.ts`：把拖曳行為抽成一個不依賴 Vue 的 factory（`createWindowDrag(host, options)`，只處理數字），介面只有 `readPosition` / `writePosition` / `readSize` / `readViewport` / `isLocked` / `beginGesture`。橡皮筋、120ms 速度取樣、釋放速度交接、X／Y 兩條獨立彈簧、以及「抓取中斷彈簧」全部只實作一次。
2. `useDialogWindow`（12 個 PrimeVue 對話框）改為驅動這個 factory：`beginGesture` 把對話框從「遮罩置中」pin 成明確幾何，之後的位移一律走共用核心。原本 `useDialogWindow` 內嵌的硬夾算式刪除。
3. `useFloatingWindowDrag` 縮成薄轉接層（約 20 行），把 `pos` / `size` 兩個 reactive 物件接到同一顆核心；行為不再有第二份實作。
4. **縮放維持硬夾**：調整尺寸是在定義大小而非拋擲，而且最小尺寸本來就是硬性限制。

### 現在的一致性

| | 拖曳 | 縮放 |
| --- | --- | --- |
| 12 個 PrimeVue 對話框 | 邊緣漸進阻力 + 放手彈回 | 硬夾（畫面邊界 + 最小尺寸） |
| AI 對話、資料檢視 | 同上（同一份實作） | 硬夾（同一份 `resizeWindowRect`） |

所有視窗的**停留位置**共用 `windowBounds`／`clampWindowToViewport`，因此橡皮筋只造成手勢中的暫態超界，放手後一律完整落回畫面內。

### 驗證

- `tests/motion_accessibility.test.ts` 改為三條互相牽制的契約：共用核心必須同時具備橡皮筋、彈簧與速度交接，且兩者都由 `windowBounds` 推導；`useDialogWindow` 與 `useFloatingWindowDrag` 都必須走 `createWindowDrag` 且**不得**自行出現 `rubberbandClamp` / `runSpring`（防止再次分家）；縮放必須是 `resizeWindowRect` 且不得橡皮筋化。
- `npm test`：499 通過；`npm run typecheck`、`npm run build` 通過；已確認執行中的 dev server 提供新版模組。
- **待人工確認**：實機拖曳任一模態對話框（例如連線管理、系統設定）到四個邊界，確認阻力與彈回與 AI 對話／資料檢視一致。

## 已實作（2026-09-30）：浮動視窗恢復「邊緣阻力 + 放手彈回」

回饋：「我喜歡那種『推到邊緣有阻力、放手彈回來』的手感」。前一節的硬邊界修正把手感一起拿掉了，本節把兩者分開。

關鍵區分：**橡皮筋只是手勢進行中的暫態超界，彈簧一律落回共用的停留範圍。** 原本的缺陷從來不是橡皮筋，而是它當時夾的範圍允許視窗停在只剩 100×60px 的位置。

### 實作

1. `windowGeometry` 新增 `windowBounds(size, viewport)`——「這個尺寸的視窗可以停在哪些位置」的唯一定義（完整留在畫面內；視窗比畫面大時收斂為原點）。`clampWindowToViewport` 改為由它推導，因此硬夾的落點與橡皮筋的中心點必然一致，不會再各寫一份。
2. `useFloatingWindowDrag` 恢復：
   - 拖曳中以 `rubberbandClamp` 對 `windowBounds` 產生漸進阻力（常數 0.35，維度為視窗自身尺寸）。
   - 放手時把 120ms 視窗內的釋放速度交接給彈簧（`SPRING_PRESETS.momentum`，速度上限 900 px/s、縮放 0.35），X／Y 為兩條獨立彈簧。
   - 在範圍內放手則完全不動（視窗不滑行，符合桌面視窗行為）；只有超界才彈回。
   - 重新抓取時先取消進行中的彈簧，從畫面上的現值接手。
3. 對話框（`useDialogWindow`）維持硬夾——模態視窗滑出畫面比停在邊界更糟。兩者共用同一組停留範圍，差別只在外框手感。
4. 縮放維持硬夾：調整尺寸是在定義大小而非拋擲，且最小尺寸本來就是硬性限制。

### 驗證

- `tests/window_geometry.test.ts` 新增 3 項：停留範圍必須是完整containment（明確對照舊的 100×60 行為）、視窗過大時收斂為原點、`clampWindowToViewport` 的落點與 `windowBounds` 兩端一致。
- `tests/motion_accessibility.test.ts` 新增兩項契約：浮動視窗必須同時具備橡皮筋、彈簧與速度交接，且兩者都必須由 `windowBounds` 推導；對話框必須硬夾且不得出現橡皮筋。
- `npm test`：498 通過；`npm run typecheck` 通過；已確認執行中的 dev server 提供新版模組。
- **待人工確認**：實機拖曳 AI 對話／資料檢視到四個邊界，確認阻力與彈回手感，並確認放手後視窗完整落在畫面內。

## 已實作（2026-09-30）：修正 AI 對話／資料檢視視窗仍可拖出邊界

回報：「AI 與 資料檢視 這 2 個 Dialog 仍然可以拖出邊界?」——確認屬實，而且是兩個獨立缺陷，都在我先前寫的 `useFloatingWindowDrag` 與兩個視窗各自複製的縮放程式碼裡。

### 缺陷

1. **拖曳**：`useFloatingWindowDrag` 的邊界是「至少保留 100×60 px 可見」：
   `minLeft = -size.width + 100`、`maxLeft = innerWidth - 100`。所以視窗可以被拖到只剩右緣一小條留在畫面上，而這條規則與 12 個對話框的「完整保留在畫面內」互相矛盾。
2. **縮放**：兩個視窗各自複製了一份 8 方向縮放（共約 55 行 × 2），其中左／上分支是
   `pos.left = resizeStartLeft + dx`——**完全沒有對畫面邊界夾制**，往左拖就會把視窗推出畫面左側；而且超出範圍時是「整段忽略」而非夾到邊界，手感上會突然卡死。兩份複製還各自用了不同的最小寬度（AI 420、資料檢視 520）。

### 處置

1. **幾何規則抽成單一來源** `src/utils/windowGeometry.ts`（純函式，無 DOM 無 Vue 反應式）：
   - `clampWindowToViewport(rect, viewport)`：整個視窗夾在畫面內；當視窗比畫面大時夾到原點，而不是翻到對側。
   - `resizeWindowRect(start, edges, dx, dy, viewport, limits)`：每一條邊都做兩次夾制——不可越過畫面邊界、不可小於最小尺寸；超出範圍時是夾到邊界而非忽略。
2. `useDialogWindow`（12 個對話框）改用上述兩個函式，移除原本內嵌的算式。
3. `useFloatingWindowDrag` 改以共用的**停留範圍**為準（見下一節）。
4. 新增 `src/composables/useWindowResize.ts`：兩個浮動視窗共用的 8 方向縮放，取代兩份複製的程式碼。最小尺寸仍各自不同（AI 420、資料檢視 520），但規則與邊界完全一致。

第一次修正時我把浮動視窗的橡皮筋與回彈一起移除，改用硬邊界；後續依回饋確認手感要保留，改為「橡皮筋只作用於手勢中的暫態超界，彈簧一律落回共用停留範圍」——詳見下一節。

### 現在的一致性

全 app 14 個視窗（12 個 PrimeVue 對話框 + AI 對話 + 資料檢視）的**停留位置**都走同一組邊界規則：完整保留在畫面內、不可小於最小尺寸。兩者的差別只在外框手感：對話框硬夾（模態視窗滑出畫面比停在邊界更糟），浮動工具視窗在邊緣有漸進阻力並在放手後彈回。僅 3 個手寫浮層（TSV 精靈、AI 對話、資料檢視）保有各自的 `pos`/`size` 模型，因為它們不是 PrimeVue 對話框。

### 驗證

- 新增 `tests/window_geometry.test.ts` 8 項，直接對缺陷下測：四邊越界夾制、左／上邊界不得越過原點、縮到最小尺寸不得反轉、角落只動被抓住的兩條邊、8 個把手 × 4 個方向的極端拖曳都必須留在畫面內。
- `npm test`：494 通過；`npm run typecheck` 通過。
- 已向執行中的 dev server 確認新模組與新 CSS 皆已載入。
- **待人工確認**：實機拖曳／縮放 AI 對話與資料檢視，確認四邊都停在畫面邊界。

## 已實作（2026-09-30）：對話框統一樣式、可拖曳、不可越界、可縮放（不含最大／最小化）

### 現況盤點

全 app 共 14 個對話框：12 個 PrimeVue `<Dialog>`（散佈 9 個檔案）、1 個手寫 TSV 精靈浮層、2 個自製浮動工具視窗（AI 對話、資料檢視）。外框各自為政，實際使用的樣式有下列 6 種：

| 對話框 | 原本的外框寫法 |
| --- | --- |
| ConnectionModal | `!border !border-dark-700/80 !shadow-2xl` + pt root 再寫一次 |
| QuickObjectFinder / SqlTemplateModal | `!border !border-dark-700 shadow-2xl ring-1 ring-black/5 dark:ring-white/10` |
| ResultGridItem | `!border` + 依危險等級切換 `!border-rose-600/80` / `!border-amber-600/80` / `!border-dark-700` |
| TsvImportModal | `border border-dark-700 shadow-2xl` + inline borderRadius |
| AiSqlChatModal / DataViewModal | `border border-dark-700 shadow-2xl`（最大化時再覆寫為 `border-0 shadow-none`） |
| ConfirmModal / DangerousQueryModal / ExportSchemaModal / SettingsModal / SqlFolderExplorer ×2 / AiSettingsTab | 無（吃 PrimeVue 主題預設，因此與上面幾種都不一樣） |

拖曳與縮放則只有兩個自製視窗具備（且程式碼重複兩份），PrimeVue 對話框完全不能移動。

PrimeVue 4.5.5 的 Dialog 內建 `draggable` + `keepInViewport`，但：拖曳以 mousemove 實作、硬夾邊界、且**完全沒有 `resizable`**。混用會產生兩種手感，因此改為自製一套共用行為。

### 已實作

1. **共用外框**：`main.css` 新增唯一的對話框框架 —— `1px solid --color-dark-700`、主題 `--p-dialog-border-radius`、深淺分流的陰影。選擇器同時涵蓋 `.p-dialog:not(.p-dialog-maximized)` 與 `.sq-dialog-surface`，因此 PrimeVue 對話框與 3 個手寫浮層用的是同一條規則。所有對話框層級的 `border` / `shadow-2xl` / `ring-1 ring-black` 工具類別已從 12 個呼叫點移除，不再有第二個真實來源。
2. **語意強調仍在同一系統內**：ResultGridItem 的危險／警告外框改為 `sq-dialog-accent-danger` / `-warn`，由共用框架的變體提供，而不是自己再寫一次 border 與 shadow。
3. **共用視窗行為** `src/composables/useDialogWindow.ts`：
   - 由 `.p-dialog-header` 拖曳；`:showHeader="false"` 的對話框則以 `sq-dialog-drag-handle` 標記自己的標題列。
   - 8 方向邊角縮放，`@show` 時注入 8 個把手，`@hide` 時全部移除。
   - **不可越界**：拖曳在兩軸都夾在 `[0, 視窗尺寸 − 對話框尺寸]`；縮放則每條邊都夾在「不可超過畫面邊界」與「不可小於最小尺寸（預設 360×220）」之間。這裡刻意不用橡皮筋——模態視窗超出畫面比停在邊界更糟。
   - 手勢以 pointer 事件 + `setPointerCapture` 實作，新動作會先釋放前一個手勢的監聽。
   - 首次互動才把對話框從「遮罩置中」切換為明確的 fixed 幾何，並清掉 `max-w-*` / `max-h-*` 以免與縮放互斥。
4. **不含最大／最小化**：12 個 PrimeVue 對話框都沒有設定 `maximizable`（已加測試守門）。既有的兩個浮動工具視窗保留它們自己的最大化／縮小為膠囊功能，因為那是獨立且已驗證的功能，不在本次「統一」範圍內。
   - 若後續要讓它與其他對話框完全一致，把 `AiSqlChatModal` 與 `DataViewModal` 的兩個視窗按鈕移除即可，其餘行為不需改動。
5. **清除死碼**：`main.css` 的 `.ai-sql-chat-dialog` 區塊（舊版 AI 對話框樣式，已無任何元件使用）移除——它正是同一個視窗的第二份陰影定義。

### 驗證

- `npm test`：486 通過（新增 `tests/dialog_window.test.ts` 8 項：每個對話框都建立對應數量的視窗實例並在 show/hide 掛載卸載、對話框標籤不得自帶 border／shadow／ring、手寫浮層使用共用 surface、不得啟用 maximizable、拖曳與縮放的邊界夾制運算式、8 個把手樣式齊備、自製標題列的拖曳標記、危險強調仍在共用框架內、舊 `.ai-sql-chat-dialog` 不得復活；並更新 `tests/dialog_theme_and_size.test.ts` 的半徑選擇器期望值）。
- `npm run typecheck`、`npm run build`：通過；建置產物已確認輸出 `sq-dialog-surface`、`sq-dialog-resize-*`、`sq-dialog-accent-danger`、`sq-dialog-accent-warn`、`sq-dialog-drag-handle`、`sq-dialog-window`。
- Tauri 實機：14 個檔案的 HMR 全數套用無錯誤。
- **待人工確認**：實機拖曳與 8 方向縮放的手感、縮放後各對話框內容（滾動區、固定高度區）是否仍正確、以及最小尺寸對小對話框（如 ConfirmModal）是否合適。

## 已實作（2026-09-30）：Tauri 無法啟動 —— 建置快取殘留舊專案路徑

症狀：`npm run dev:tauri` 在 Rust 建置階段失敗，但 `npm run dev`（純網頁）完全正常。

```
error: failed to run custom build command for `puffsql v0.1.1 (G:\PuffSQL\src-tauri)`
failed to read plugin permissions: failed to read file
'\\?\G:\SQLight\src-tauri\target\x86_64-pc-windows-msvc\debug\build\tauri-…\out\permissions\app\autogenerated\commands\app_hide.toml'
系統找不到指定的路徑。 (os error 3)
```

根因：專案資料夾曾由 `G:\SQLight` 更名／搬移為 `G:\PuffSQL`。`tauri-build` 會把權限清單以**絕對路徑**寫入 `OUT_DIR`，例如
`src-tauri/target/debug/build/tauri-<hash>/out/tauri-core-permission-files` 的內容是
`["\\?\G:\SQLight\src-tauri\target\debug\build\tauri-<hash>\out\permissions\default.toml"]`。
`G:\SQLight` 已不存在，因此 build script 直接 exit 1，前端根本還沒被載入。

`src-tauri/.cargo/config.toml` 另外指定了 `build.target = "x86_64-pc-windows-msvc"`，
使快取分散在 `target/debug`、`target/release`、`target/x86_64-pc-windows-msvc` 三棵樹，全部都被污染。

處置：

1. `cargo clean`（`src-tauri/target` 已在 `.gitignore` 第 10 行，屬可重建產物）：`Removed 12730 files, 15.9GiB total`。
2. 重跑 `npm run dev:tauri`：`Finished dev profile … in 1m 38s`，`puffsql.exe` 正常啟動，無 permission 錯誤。

與程式碼無關的佐證：`git status -- src-tauri` 為空（本次未修改任何 Rust 檔案），且該路徑在資料夾改名時即已寫死。

後續注意：只要不再搬動專案資料夾就不會重現。若日後仍需搬移，先跑一次 `cargo clean`，或設定 `CARGO_TARGET_DIR` 指向 repo 外的固定路徑。

## 已實作（2026-09-30）：Apple 流體介面 —— 以彈簧與速度感取代固定時長動態

以 `apple-design` 技能（WWDC *Designing Fluid Interfaces* 的網路翻譯版）重新審視 UI 後的實作。稽核基準：全 repo `prefers-reduced-motion` / `-transparency` / `contrast` 命中數為 **0**；`setPointerCapture`、`will-change`、任何彈簧函式庫亦皆為 **0**；所有拖曳互動（分隔線、分頁重排、對話框移動、ER 畫布）都是 `Math.min/max` 硬夾。

### 修掉「以為有做、其實沒生效」的既有缺陷

1. `scale-102` 不是 Tailwind 縮放階梯（只有 95/100/105/110/125/150），[AppMain](src/components/layout/AppMain.vue) 與 [AppBottomPanel](src/components/layout/AppBottomPanel.vue) 拖曳分頁時的「目標放大」提示**完全沒有渲染任何 CSS**。改為 `scale-105`。
2. [ErDiagramViewer](src/components/editor/ErDiagramViewer.vue) 的邊屬性選單使用 `animate-in fade-in zoom-in-95`，這些類別來自 `tailwindcss-animate`，本專案未安裝且 `tailwind.config.js` 的 `plugins` 為空，因此該選單**沒有任何進場動畫、也沒有錨定原點**。改為自有的 `sqMenuIn` keyframe，並以 `transformOrigin` 綁定右鍵點擊座標，讓選單從被點擊的關聯線長出來。
3. [DataViewFloatingPill](src/components/modals/DataViewFloatingPill.vue) 以 `transition-[bottom]` 動畫 layout 屬性；改為 `transform`，並把進場動畫移到內層元素，避免兩者爭搶同一個 `transform`。
4. 分頁放開後的 50ms `setTimeout` 人工死區移除，改用一次性 `suppressClick` 吞掉拖曳尾隨的那個 click。
5. 分頁列改 `items-end`，消除作用中分頁 29px／非作用中 28px 造成整列位移的問題（29px 是刻意的「與面板融合」設計，保留）。

### 新增：速度感知的動態層

1. 新增 `src/utils/spring.ts`（純數學，無 DOM、無 Vue 反應式）：`springStep`（阻尼比／response → 剛度／阻尼係數，240Hz 子步進，單幀上限 1/30 秒）、`isSpringSettled`、`rubberband`、`rubberbandClamp`、`SPRING_PRESETS`。
2. 新增 `src/composables/useMotion.ts`：`runSpring()` 以 rAF 驅動，接手釋放速度；`prefersReducedMotion()` 或無 rAF 環境時直接結算，呼叫端不需第二條路徑。
3. `src/composables/useSplitter.ts` 重寫：`setPointerCapture`、120ms 速度取樣視窗、越界改漸進阻力、放手把速度交給彈簧回彈。`onPointerDown` 會先取消進行中的彈簧，因此**可中途重新抓取**，從畫面上的現值接手而非重新開始。
4. 新增 `src/composables/useFloatingWindowDrag.ts`：AI 對話與資料檢視兩份重複的拖曳程式碼收斂為一份，並依技能要求把 2D 位移**拆成 X／Y 兩條獨立彈簧**（單一 2D 彈簧在兩軸速度不同時會走鐘）。
5. 新增 `src/composables/useFlip.ts`：分頁重排改為 FLIP（量舊位置 → 重排 → 彈簧把位移收回），不再瞬間跳位；`cancelFlip` 讓重新抓取時能接管；過程會暫時關閉元素自身的 `transition`，避免兩者互相拉扯。
6. `ResultGrid` 多結果集的窗格分隔線改為同一套模型：兩窗格以固定總和互相交換高度，越界橡皮筋、放手彈簧回彈，並新增 `settlingSplitterIndex` 讓 `ResizeObserver` 在回彈期間不重算高度（避免與彈簧競態）。
7. `ResizableSplitter` 可見把手維持 1.5px，抓取區擴到約 10px。

### 新增：無障礙（三個訊號皆從 0 到有）

1. `prefers-reduced-motion: reduce`：停掉迴圈與位移（pulse／ping／bounce／進場 keyframe、PrimeVue 覆蓋層的縮放滑動改為 120ms 交叉淡入），保留色彩與透明度等有助理解的變化；`animate-spin` 放慢而非移除（轉圈承載「仍在工作」的狀態）。
2. `prefers-reduced-motion: no-preference`：按鈕在 pointer-down 立即 `scale(0.96)`，不加轉場。
3. `prefers-reduced-transparency: reduce`：移除 `backdrop-filter`（這些面本為 ≥90% 不透明或遮罩，拿掉模糊不犧牲對比）。
4. `prefers-contrast: more`：`:focus-visible` 加 2px 外框、細分隔線改為實線。
5. 新增查詢執行中的 2px 不定進度線於底部結果面板上緣（使用者的視線在結果區，不在工具列）；reduced motion 下降級為靜止色段。

### 刻意未採用

主外框（工具列／側欄／狀態列）的**半透明材質**未實作。Apple 該手法成立的前提是內容會從浮動 chrome 底下捲過；本專案為 flex 縱向佈局，chrome 底下沒有任何內容在跑，加 `backdrop-filter` 只會是裝飾性模糊並可能傷害文字銳利度。要做需先改版面結構。

### 驗證

- `npm test`：477 通過（新增 `tests/spring.test.ts` 8 項彈簧／橡皮筋數值行為、`tests/motion_accessibility.test.ts` 13 項無障礙與彈簧路徑契約；`tests/splitter.test.ts` 改為記錄新契約：越界橡皮筋、放手精準落回邊界、界內維持 1:1）。
- `npm run typecheck`、`npm run build`：通過；已確認建置產物實際輸出 `motion-reduce:transition-none`、`-inset-x-0.5`、`scale-105`、`will-change-transform`、`translate-y-14` 與四個 media query。
- Tauri 實機：HMR 套用上述編輯無錯誤；拖曳手感（分隔線回彈、分頁重排 FLIP、對話框邊緣橡皮筋）仍待人工確認。

## 已實作（2026-09-30）：結果面板檢視分層、可操作空狀態與 NULL 語意

### 緣起

把預設畫面（尚未執行任何查詢）與查詢後的畫面並排檢視後，三個問題最明顯：

1. **「結果」不是面板分頁的一員**。底部面板右側只有「訊息｜歷程｜統計」三個文字按鈕，結果區只能靠左側的結果分頁抵達。乾淨啟動時面板本體顯示結果區，卻沒有任何分頁處於選中狀態；更嚴重的是查詢失敗時 `queryStore` 會把面板切到「訊息」，若該次沒有任何結果集，畫面上就**沒有任何控制項能回到結果區**——這是一條實際走不回去的死路。
2. **空狀態沒有資訊**。只有一行置中的 “No rows returned”，既沒有說明這是「還沒執行」還是「執行了但沒有資料」，也沒有下一步可以做什麼。
3. **NULL 無法與資料區分**。資料格的 NULL 只是淡色斜體文字，與使用者資料中真正的字串 `NULL`、空字串在視覺上完全同形。

### 已實作

**1. 檢視分層：Level 2 改為分段控制器（Segmented Control）**

- 底部面板右側改為單一膠囊容器（`.sq-view-switch`），內含 **結果｜訊息｜歷程｜統計** 四個真實分頁；四種「同一個面板的不同檢視」外觀一致，與左側「不同的查詢結果」分頁卡在形態上明確區隔（對應 `docs/UI_UX_IMPROVEMENT_PROPOSALS.md` 維度二的 Level 2／Level 3-4 分層）。
- 選中的檢視永遠有指示，包含尚未執行任何查詢的預設狀態，也讓查詢失敗後能一鍵回到結果區。
- 容器色階分深淺兩態陳述：深色 chrome 由面板色**提亮**，淺色 chrome 由面板色**加深**，選中的藥丸一律使用 `--color-raised`（全 app 唯一「高於畫布」的表面 token），因此兩種模式都讀得出「凹槽 + 浮起的選中項」。
- 「顯示工具列」由文字按鈕改為圖示切換（`pi-eye` / `pi-eye-slash`，`severity=primary` 代表目前隱藏），與其他圖示切換一致；`aria-label` 與 tooltip 仍提供完整語意。
- 「訊息」只在有 error／warning 時顯示數量（`1 row affected` 這類 info 不計），避免每次執行都亮紅點而失去意義。

**2. 無障礙：真正的 tab 語意與鍵盤操作**

- 分段控制器為 `role="tablist"` + `role="tab"` / `aria-selected` / `aria-controls`，四個面板本體為 `role="tabpanel"` / `aria-labelledby`，id 由 `panelTabId()`／`panelViewId()` 產生。
- Roving tabindex（只有選中的分頁在 Tab 順序內）加上 `←` `→` `Home` `End` 鍵移動，符合原生分頁列的鍵盤預期。

**3. 可操作的空狀態**（新增共用元件 `src/components/results/ResultsEmptyState.vue`）

- 兩種語意不同的空狀態，不再共用一句話：
  - `idle`（尚未執行）：圖示 + 標題 + 說明 + 四組快捷鍵提示（`Ctrl/⌘ + Enter`、`Ctrl/⌘ + Shift + Enter`、`Ctrl/⌘ + P`、`Ctrl/⌘ + I`），且**只列出實際有接線的快捷鍵**。
  - `no-rows`（查詢成功但 0 列）：以「結果集有欄位」作為判準，文案帶出欄位數（`語句已順利執行（7 個欄位）…`），這是「語句沒問題、條件沒中」而不是「還沒開始」。
- 標題／說明原本已有 `results.emptyTitle` / `results.emptyDesc` 但從未被使用，文字改為不重複快捷鍵內容；新增 `emptyNoRowsTitle` / `emptyNoRowsDesc` / `emptyHint*` / `panelViews`（中英同步）。
- `ResultGrid`、`ResultGridItem` 兩處原本各自複製的裸空狀態改為共用此元件（`ResultGridItem` 以 `resultSetColumnCount` 判斷語意）。
- 版面用 `m-auto` 而非 `justify-center`：面板高度不足時內容不會被置中裁掉而無法捲動。
- 快捷鍵修飾鍵由新純函式 `src/utils/shortcutKeys.ts` 決定（`⌘` / `Ctrl`），macOS 使用者不會再被指示去按 Ctrl。

**4. 資料格 NULL 語意化**

- `createDataCellFormatter` 對 `null` / `undefined` 回傳 `.sqlight-null-badge`（斜體、淡色等寬、1px 細框、6% 底色），與 TRUE/FALSE 藥丸、與真正的字串 “NULL” 都能區分；仍保留 `.sqlight-cell-null` 這個由對比測試守護的 cell class，顏色沿用已驗證的 `--sq-grid-muted`。

**5. 順手修掉：提交按鈕的硬編碼中文**

- `ResultGridItem` 的 `提交 (n)` 改走 `results.commitWithCount` / `common.commit`，切換到英文介面時不再殘留中文。

### 驗證

- `npm test`：508 通過（新增 `tests/results_empty_state.test.ts` 8 項：修飾鍵標籤、空狀態雙語意與共用化、快捷鍵提示必須與 `App.vue` 實際接線一致、NULL 徽章與對比 token、提交標籤 i18n；`tests/result_panel_refactor.test.ts` 改為記錄新契約：四個檢視一律存在、分段控制器、`aria-selected`／roving tabindex／方向鍵、四個 `role="tabpanel"`；`tests/tab_label_weight.test.ts` 的字重契約改看 `.sq-view-tab.is-active`；`tests/global_font_scope.test.ts` 的空狀態錨點更新）。
- `npm run typecheck`、`npm run build`：通過；已確認建置產物實際輸出 `sq-view-switch`、`html:not(.dark) .sq-view-switch`、`sqlight-null-badge`、`sq-empty-kbd` 與新文案。
- 瀏覽器（Vite dev server + headless Chrome）實測 1600×1000、1366×768、1024×720 與深淺兩態截圖；以 `ArrowRight` 從「結果」切到「訊息」時，選中項、焦點與 `role="tabpanel"` 的 id／labelledby 皆同步。受測的「0 列」與「訊息紅點」是暫時改動 mock 後截圖確認，已還原（`git status` 中 `src/services/api.ts` 無差異）。
- **待人工確認**：Tauri 實機（含自繪標題列與視窗控制項）在 1024–1280 寬度下的面板比例與工具列溢出情形——本次未動 header，溢出為既有議題。

## 待完成與待審核

1. **DML 來源可靠性**：目前仍由 SQL 文字猜測來源；JOIN、別名／運算式、跨庫、跨 server、多結果集的來源應以可驗證 metadata 解析，不能僅依第一個表名。表格與結果面板應共用來源／DML 邏輯。確認 computed、rowversion 等不可寫欄位。
2. **查詢生命週期**：取消、逾時、連線建立逾時；取消後不能重用不完整協定 session，移除／中斷連線要停止或失效化正在執行與排隊的請求。目前移除 registry 不會終止已持有 Arc 的查詢。
3. **真實影響列數與 PRINT**：affected_rows 仍是回傳列數，需取得 TDS DONE 計數與 INFO 訊息。Tiberius 0.12.3 QueryStream 公開 API 只暴露 Metadata/Row，內部會忽略 DONE/INFO；不得重跑 SQL 或以 SELECT 筆數冒充 DML 影響筆數。
4. **資料與資源限制**：binary 真實內容／匯出、各型別 round-trip；結果歷史及 pin、查詢歷史／localStorage 的容量；大型欄位與多結果集的總量限制。現有逐列上限不限制伺服器執行工作或網路流量。
5. **前端狀態競態**：connect/switchDatabase 過期請求目前 return void，呼叫方仍可能更新當下 activeTab；需檢查使用者在等待期間切換分頁／伺服器的所有路徑。同步失敗要保留可辨識的目標並呈現錯誤。
6. **連線與持久化**：重複 connect 目前會重建 session；儲存密碼錯誤仍被忽略，JSON parse 失敗仍轉成空清單。需修正並驗證不遺失原設定。
7. **Schema/DDL**：來源名稱 escaping、相同表名跨 schema 的消歧；CREATE TABLE 目前仍簡化 Identity seed、PK 類型／順序、預設值與其他約束，需要明確界定腳本是否完整還原。
8. **共用邏輯及文件**：兩個大型表格元件的選取、統計、匯出及 DML 重複邏輯；README 連線池、百萬列效能、PRINT、DDL、防誤刪等宣稱需對齊驗證後的實作。
9. **完整驗證**：重跑前端測試、typecheck/build、Rust tests/check；增加真實 SQL Server 整合測試入口並驗證空集、多集、PRINT、DML、GO、取消／逾時、交易與型別。尚未使用任何使用者 SQL Server 或憑證，mock/unit tests 不能當作實機驗證。
10. **Tabulator 寬表格水平虛擬化評估**：AG Grid 遷移至 Tabulator 6 時沿用全欄渲染。需以 100~150 欄以上寬結果集（如 `sqlight:perf-fixture`）進行水平捲動壓力測試，量測 DOM cell 膨脹狀況與掉幀現象，評估啟用 `renderHorizontal: "virtual"` 之相容性（釘選欄、CSS 樣式與選取框）。
11. **ResultGridItem 與核心表格元件拆分重構**：`ResultGridItem.vue` 現已膨脹至 1675 行（違反 `AGENTS.md` 400 行原則），內部混雜 Tabulator 生命週期、右鍵 ContextMenu、DML Commit Modal、DataView Modal、內嵌編輯與匯出邏輯。需拆解出專屬子組件（如 `ResultGridContextMenu.vue`、`ResultGridCommitModal.vue`）與 Composables，降低維護成本與回歸風險。

## 驗證紀錄

- （2026-09-30）`npm test`：508 個通過（新增 `tests/results_empty_state.test.ts`；`result_panel_refactor`、`tab_label_weight`、`global_font_scope` 三支改為記錄結果面板分段控制器、可操作空狀態與 NULL 徽章的新契約）。`npm run typecheck`、`npm run build`：通過。
- （2026-09-30）`npm test`：499 個通過（拖曳行為統一至 `src/composables/windowDrag.ts`；`tests/motion_accessibility.test.ts` 改為「共用核心必須有橡皮筋／彈簧／速度交接」與「兩個轉接層不得自行實作」三條契約）。`npm run typecheck`、`npm run build`：通過。
- （2026-09-30）`npm test`：498 個通過（`tests/window_geometry.test.ts` 新增停留範圍 3 項、`tests/motion_accessibility.test.ts` 新增浮動視窗橡皮筋／彈簧與對話框硬夾兩項契約）。`npm run typecheck`：通過。
- （2026-09-30）`npm test`：494 個通過（新增 `tests/window_geometry.test.ts` 8 項視窗邊界與縮放夾制；更新 `tests/dialog_window.test.ts` 與 `tests/motion_accessibility.test.ts` 以反映視窗改為硬邊界、彈簧僅保留於分隔線）。`npm run typecheck`：通過。
- （2026-09-30）`npm test`：486 個通過（新增 `tests/dialog_window.test.ts`：對話框統一樣式與視窗行為的 8 項契約，見上一節；更新 `tests/dialog_theme_and_size.test.ts` 的半徑選擇器）。`npm run typecheck`、`npm run build`：通過。
- （2026-09-30）`cargo clean`（12,730 檔／15.9GiB）後 `npm run dev:tauri`：`Finished dev profile in 1m 38s`，`puffsql.exe` 啟動成功，先前的 `G:\SQLight\…app_hide.toml` permission 錯誤不再出現。
- （2026-09-30）`npm test`：477 個通過（新增 `tests/spring.test.ts`：臨界阻尼不超衝、阻尼 0.8 會超衝、速度交接在第一幀即前進、停頓 5 秒的幀不暴走、`rubberband` 單調且有界；新增 `tests/motion_accessibility.test.ts`：三個 accessibility media query 存在、reduced motion 停用迴圈動畫、reduced transparency 僅移除模糊不動底色、進度線的靜止降級、按壓回饋僅在 no-preference 生效、四個拖曳面皆具備 pointer capture／橡皮筋／彈簧、2D 拖曳拆成兩條彈簧、窗格分隔線不與 ResizeObserver 競態、分頁重排走 FLIP 且不得殘留放開後的計時器、不得使用未安裝的 tailwindcss-animate 類別與不存在的 `scale-102`、ER 選單錨定原點、膠囊以 transform 堆疊）。
- （2026-09-30）`npm run typecheck`、`npm run build`：通過；建置產物已確認輸出 `motion-reduce:transition-none`、`-inset-x-0.5`、`scale-105`、`will-change-transform`、`translate-y-14`、`prefers-reduced-motion:reduce|no-preference`、`prefers-reduced-transparency:reduce`、`prefers-contrast:more`、`sq-progress-line`、`sqProgressSlide`、`sq-menu-in`、`sqMenuIn`。
- （2026-09-23）`npm test`：389 個通過（新增 `tests/statements.test.ts` 的 `splitSqlBatchesWithMeta` 起始行號與 `GO <count>` 展開測試、更新 `tests/cancel_query.test.ts` 驗證後端單一 session lock 委任）。
- （2026-09-23）`cargo test`：23 個通過（新增 `drivers::mssql::batch::tests` 11 個單元測試，涵蓋各類 GO 邊界、註解/字串遮蔽、GO 次數、USE 資料庫偵測）。
- （2026-09-23）`cargo check`、`npm run typecheck`、`npm run build`：全數通過。

- （2026-09-23）`npm test`：388 個通過（新增 `tests/global_font_scope.test.ts` 三項：四個 DataGrid 根容器必須用 `font-sans` 且不得攜帶 `--sqlight-grid-font`、工具列區塊不得出現 `font-mono`、網格字型變數僅能綁在 `.sqlight-grid` 外框）。
- （2026-09-23）`npm test`：385 個通過（新增 `tests/grid_layout.test.ts` 兩項：「隱藏工具列」狀態為每結果分頁獨立且隨分頁關閉清除、以及按鈕位於「等分高度」左側並傳到全部 4 種網格容器且上下兩列都受 `hideToolbar` 控制；新增 `tests/tab_label_weight.test.ts` 一項：多結果集 `Result #N (N)` 標籤必須為一般字重且仍只在 `totalSets > 1` 出現）。
- （2026-09-23）`npm run typecheck`、`npm run build`：通過。
- （2026-09-23）`npm test`：370 個通過（新增 `tests/theme_contrast.test.ts`：5 surface × 深淺色階對比、角色色在純色與 15–25% 色塊底的對比、分頁圖示、Monaco 主題、連線標籤色、Tabulator CSS token 對比、啟動前套用色彩模式；並擴充 `tab_category_colors` 的淺色圖示斷言、更新 `grid_selection` 的排序箭頭期望值）。
- （2026-09-23）`npm run typecheck`、`npm run build`：通過。
- （2026-09-22）`npm test`：311 個通過（新增合成 fixture 的 spec 解析／維度／決定性／NULL 分佈／型別，以及「結果網格不得無條件停用欄虛擬化」「fixture 必須 dev-gated」「filter benchmark 必須還原 quickFilterText」「quick filter 必須 debounce 並清除 timer」四項回歸）。
- （2026-09-22）`npm run typecheck`、`npm run build`：通過；已確認 `dist/` 無 `sqlight:perf-fixture` 任何痕跡。
- （2026-09-22）Tauri 實機量測（150 欄 × 1,000 / 50,000 列）已完成，數據與判讀見上一節；欄虛擬化驗收關閉（`virtualisation ok`、dom/visible/total = 22/150/151）。`cacheQuickFilter` 決策為不採用（理由見上）。移除該行後的互動人工確認仍待補。
- （2026-09-21）`npm test`：271 個通過（新增 grid 捲動效能回歸：可見欄快取、無選取時零 DOM 走訪、raw rowData 交付、selection 高亮不繪製陰影、mousemove 僅延遲掛載）。
- （2026-09-21）`npm run typecheck`：通過。
- `npm test`：19 個通過（連線狀態／IPC、DML、語句擷取）。
- `cargo test --offline --manifest-path src-tauri/Cargo.toml --lib`：8 個通過（目標資料庫、不同連線並行、資料型別與逐列保留上限）。
- `npm run typecheck`：通過。
- `npm run build`：通過；仍有 bundle 過大及 workspaceStore 動／靜態 import 混用警告，列入後續整理。
- `cargo check --offline --manifest-path src-tauri/Cargo.toml`、`git diff --check`：通過。
- 已取得 esbuild 開發依賴安裝授權並更新 package-lock。
- MSVC 工具鏈存在但 link.exe 未安裝；不依賴 MSVC 執行上述已通過的 GNU 核心測試。

## 已實作（2026-10-14）：SQL 自動完成在 FROM／JOIN 之後仍列出大量欄位

症狀：在 `FROM`／`JOIN` 之後開始輸入表名（例如 `FROM Us`）、或把 `FROM` 斷行後在下一行輸入，快選器會退回「一般」情境並倒出全資料庫所有欄位。

根因：`getCursorContext` 只取「當前行」的最後一個 token，且必須緊貼關鍵字才算命中；一旦開始打表名或換行，尾端 token 不再是 `FROM`／`JOIN`，情境即降級為 `general`。`LEFT`／`INNER` 等 JOIN 修飾詞同樣落入 `general`（原本的第二 token 判斷是死碼）。

已實作：

1. `src/utils/sqlParser.ts`：`getCursorContext` 改為接收「游標前全文」，取最後 1000 字元、去註解後由尾端往前掃描最多 6 個 token，命中 table／column／join modifier 觸發詞即決定情境，遇到其他已知關鍵字停止；貼著游標的那個 token 一律視為「正在輸入」，因此 `FROM Order`、`FROM In`（`Inventory` 的前綴）不會被誤判成關鍵字。新增 `join_keyword` 情境與 `joinModifier` 欄位。
2. `src/utils/sqlCompletionProvider.ts`：改以 `fullSql.slice(0, model.getOffsetAt(position))` 取游標前全文；新增 `left/inner/right/full/cross/outer` 分支，只提示接續關鍵字（LEFT → `OUTER`、`JOIN`，INNER/CROSS/OUTER → `JOIN`）。table 分支維持只輸出 Table／View／schema，不含任何欄位項目。
3. `scripts/test.mjs`：esbuild 加入 `@` 與 `@/utils/monaco` alias，並新增 `tests/stubs/monaco.ts`，讓 provider 可在 Node 測試中被實際呼叫。

驗收：

- `npm test`：550 個通過（新增 `tests/sql_completion_context.test.ts`：情境判定矩陣、多行 FROM、點號觸發、關鍵字前綴表名，以及 provider 層「FROM／JOIN 之後不得出現 Field 項目」「LEFT／INNER 之後只有 JOIN 關鍵字」「WHERE 之後仍要有欄位」「別名點號只給該表欄位」）。
- `npm run typecheck`：通過。

已知取捨：游標緊貼的 token 一律視為輸入中，因此 `FROM t ORDER`／`FROM t GROUP`（尚未打 `BY`）會落到 table 情境（只列資料表，不再倒出欄位）。反向的誤判（把正在輸入的表名前綴當成關鍵字）會直接重現本次的回報症狀，故以此為準。

## 已實作（2026-10-14）：結果頁工具列依 DataGrid 數量自動開合、改用工具圖示

需求：查詢結果頁只有一個 DataGrid（只執行一條 SELECT）時自動開啟工具列；兩個以上 DataGrid 時維持隱藏；面板標頭的開合按鈕由眼睛圖示改為工具（扳手）圖示。

已實作：

1. `src/stores/gridLayoutStore.ts`：新增純函式 `defaultToolbarHiddenForCount(resultSetCount)`（`count > 1` 為隱藏，其餘為顯示），作為結果分頁工具列預設值的唯一來源。單一 DataGrid 與「沒有結果集」時的空佔位 DataGrid 都維持工具列開啟（沿用 3fc0f97「查詢結果為空時維持工具列顯示」的決定）。
2. `src/components/results/ResultGrid.vue`：`toolbarHidden` 改為以 `defaultToolbarHiddenForCount(props.resultSets.length)` 為預設，並移除原本 `(resultSets.length > 1 && …) || …` 的等效重複判斷（該式第二項已使第一項失效）。
3. `src/components/layout/AppBottomPanel.vue`：標頭按鈕的狀態與切換都改用同一組預設；按鈕改為 `pi pi-wrench`（狀態仍由 severity／tooltip／aria-label 表達）；按鈕顯示條件由「有結果集」放寬為「結果檢視中有資料格面板」，讓空佔位資料格的工具列也能被收合。

驗收：

- `npm test`：551 個通過（`tests/grid_layout.test.ts`：`defaultToolbarHiddenForCount` 的 0／1／2／3 邊界、單一與多結果集分頁的預設與覆寫、標頭與資料格共用同一預設、按鈕圖示為 `pi pi-wrench` 且不再出現 `pi pi-eye`、按鈕顯示條件）。
- `npm run typecheck`：通過。

## 已實作（2026-10-14）：查詢結果分頁保留模式切換鈕

需求：結果面板工具列新增一個「分頁」圖示的切換鈕（預設關閉）。開啟時結果分頁與原本一樣累積到上限後淘汰最舊的未釘選分頁；關閉時每次查詢只保留釘選分頁與最後一個結果分頁。

已實作：

1. `src/stores/settingsStore.ts`：新增持久化設定 `accumulateResultTabs`（預設 `false`），併入 `saveSettings()` payload、自動持久化 `watch` 清單、`resetToDefaults()` 與 store 回傳值。
2. `src/stores/queryStore.ts`：`insertNewTab()` 改走 `applyResultTabRetention()`——累積模式開啟時維持 `enforceResultLimit()`，關閉時走既有 `closeOtherResultTabs()`（保留釘選＋最新分頁，並清掉被關閉分頁的 grid layout 快取）；新增 `pruneResultTabsToActive()`，以及監看該設定、切換為關閉時立即清理的 `watch`。標頭按鈕與設定視窗因此共用同一個執行點。
3. `src/components/layout/AppBottomPanel.vue`：在扳手鈕旁新增 `pi pi-clone` 切換鈕（開啟為 `primary`、關閉為 `secondary`，aria-label 描述動作、tooltip 描述現況）。
4. `src/components/modals/SettingsModal.vue`：Results 區塊在「Results 歷史分頁保留上限」下方新增同一個 flag 的 `ToggleSwitch`。
5. `src/i18n/locales/{zh-TW,en}.ts`：新增 `results.keepResultTabs` / `results.keepResultTabsTooltip` / `results.singleResultTab` / `results.singleResultTabTooltip` 與 `settingsModal.accumulateResultTabs` / `settingsModal.accumulateResultTabsDesc`。

驗收：

- `npm test`：559 個通過（新增 `tests/result_tab_retention.test.ts`：預設值與持久化／重置、關閉時只留最新且被關閉分頁的 layout 快取已清、釘選在關閉模式與累積模式都不被淘汰、累積模式仍遵守上限並淘汰最舊未釘選、切成關閉時立即只留釘選＋目前檢視分頁且不跳動、`pruneResultTabsToActive()`、標頭與設定視窗的 UI 契約、兩種語系的文案齊備；`tests/structure_and_tabs.test.ts` 中依賴累積的案例改為明確開啟該設定）。
- `npm run typecheck`：通過。

## 已實作（2026-10-14）：訊息框套用「執行暫態高亮顏色」

需求：執行 UPDATE／INSERT／DDL 這類沒有查詢結果頁的語法時，訊息框中剛產生的訊息也要套用設定裡的「執行暫態高亮顏色」，數秒後淡出消失，才容易分辨剛剛執行了什麼。

已實作：

1. `src/utils/highlightColor.ts`（新增）：抽出 `hexToRgba()` 與 `transientHighlightColors()`（底色 0.22、左緣 0.85，與編輯器相同），`#rgb` 會展開、無法解析時退回預設 `#feffe0`。`MonacoEditor.vue` 改用它，移除原本的本地副本，兩處高亮數學自此同源。
2. `src/stores/queryStore.ts` + `src/types/query.ts`：session 訊息新增 `freshAt`（本機時鐘、僅 UI 用、不持久化）。執行結果訊息、取消訊息與錯誤訊息三條路徑都會蓋上抵達時間。
3. `src/components/results/ResultMessages.vue`：訊息以 `freshAt` 判斷是否「剛抵達」（4 秒視窗，且每個訊息只閃一次），閃爍卡片加 `sq-message-flash`，由卡片背後的偽元素（`isolation: isolate` + `z-index: -1`）上色，因此卡片本身的底色與邊框不受影響；偽元素 2.6 秒「先停住再淡出」，3 秒後由計時器移除 class。`prefers-reduced-motion: reduce` 時不淡出（停住直到移除 class）。面板只在事後才掛載（例如 UPDATE 之後自動切到訊息頁）也會閃，切換面板不會對舊訊息重播。

驗收：

- `npm test`：566 個通過（新增 `tests/result_message_flash.test.ts`：hex→rgba 與三碼／壞值退路、設定預設值、訊息以抵達時間而非掛載順序判定、淡出與 reduced-motion、每個訊息只閃一次、卸載時清除計時器、編輯器與訊息共用同一個色票助手、執行只有訊息的語句會蓋上 `freshAt`；`tests/sql_editor_toolbar_actions.test.ts` 的切片錨點由 `function hexToRgba` 改為 `function updateHighlightStyle`）。
- `npm run typecheck`：通過。

## 已實作（2026-10-15）：資料表拖曳產生的 SELECT 改為單行並移除 TOP 1000

需求：把資料表拖進 SQL 編輯器時，自動產生的語句改為一行，取消 `TOP 1000`，且不帶 database 名稱與中括弧。

已實作：

1. `src/utils/tableSelectSql.ts`（新增）：純函式 `generateTableSelectSql(schema, table)` 產生單行的 `SELECT * FROM schema.table;`。不帶 database 前綴（語句在分頁所綁定的資料庫上執行）；識別字沿用既有的 `wrapIdentifierIfNeeded()`，只有在含空白、特殊字元或屬保留字時才包中括弧，其餘維持原樣，與 Explorer 雙擊欄位名複製的行為一致；空的 schema 直接省略該段。結尾保留換行，讓拖曳插入後游標落在下一行，並維持既有插入邏輯的 `endsWith('\n')` 判斷。
2. `src/components/layout/AppSidebar.vue`：`handleTableDragStart()` 寫入 `application/sqlight-table` 與 `text/plain` 的拖曳 payload，以及右鍵「產生 SELECT 語法」的 `handleGenerateSelect()`，都改呼叫同一支產生器，移除各自的字串樣板。
3. `src/components/editor/MonacoEditor.vue`：拖曳落點在 payload 缺 `sql` 欄位時的備援樣板改用同一支產生器。
4. `src/components/layout/AppMain.vue`：分頁列與分頁項目兩個落點的備援樣板同步改用產生器；純文字落點的最後備援 `SELECT TOP 1000 * FROM sys.tables;` 一併改為 `SELECT * FROM sys.tables;`。
5. `src/components/modals/QuickObjectFinderModal.vue`：物件快搜的 SELECT 按鈕與 Ctrl+Enter 走同一支產生器。第 4、5 點雖非拖曳路徑，但產生的是同一個「單表 SELECT」語意，一併統一以免同一個使用意圖產生兩種語法。

後續調整（同日）：初版沿用 database 前綴並一律加中括弧，依需求改為不帶 database、識別字只在必要時加括弧。

驗收：

- `npm test`：635 個通過（`tests/drag_drop_table.test.ts` 改為匯入實作而非複製字串樣板，新增單行、無 `TOP`、結尾換行、無 database 前綴、必要時才加中括弧、空白 schema 省略的斷言）。
- `npm run typecheck`：通過。

## 已實作（2026-10-15）：SQL 編輯頁專屬工具列

需求：最上方標題列塞了 20 多個控制項；改成 SQL 編輯分頁在編輯區上方自帶一條工具列，把屬於編輯頁的按鈕移下來。

已實作：

1. `src/components/layout/SqlEditorToolbar.vue`（新增，並併入已刪除的 `SqlEditorToolbarActions.vue`）：36px（SPEC §5「編輯器工具列」）單列，`bg-dark-850` + 1px 下緣、無陰影、`flex-shrink-0`。左起為 Run／Stop 互換鈕、獨立的 Run All、細線分隔、剪下／複製／貼上、細線分隔、摺疊／展開／格式化；中段 `<div class="flex-1">` 彈性空白後，右側為 IO 統計、預估計畫、實際計畫三個開關與 Limit 選取器。按鈕尺寸、i18n key 與既有 tooltip 文案全部沿用原標題列的版本；剪貼三鍵不再有 ≤1440px 的隱藏規則。
2. `src/components/layout/AppMain.vue`：在 `sql_editor` 分頁分支內、Monaco 之前插入該列，事件直接接到自己的 `runQuery`／`queryStore.cancelQuery`／`formatCode`／`runEditorAction`，不再經 `App.vue` 轉發；因為列本身就在 `v-if` 分支內，切到資料表資料／結構、執行計畫或 ER 圖時整列不渲染。
3. `src/components/layout/AppHeader.vue`：移除 Run／Stop、Run All、剪貼摺疊叢集、格式化、IO 統計、預估計畫、實際計畫、Limit 與其 emit／import／`queryStore` 使用；標題列只留連線／資料庫選取、開檔／存檔、物件快搜、SQL 範本、AI 助手、DBA 工具箱、側欄／底部面板開關、設定與視窗控制，拖曳區與 `WindowControls` 契約不變。同日再移除標題列的「新增查詢分頁」按鈕：分頁列右端已有同樣的「+」且 `Ctrl + N` 也通，兩處重複；`editor.newTab` 只由 `AppMain` 的分頁列使用。
4. `src/App.vue`：移除已被搬走的 4 條事件綁定與 `handleSqlEditorAction`；`handleRunQuery`／`handleCancelQuery`／`handleFormatSql` 保留給全域快捷鍵（Ctrl+Enter、Ctrl+Shift+Enter、Shift+Alt+F、Esc／Alt+Pause）。

驗收：

- `npm test`：640 個通過（`tests/sql_editor_toolbar_actions.test.ts` 改指向新元件並驗證動作順序 cut→copy→paste→foldAll→unfoldAll、一律顯示、AppMain 直接接線；新增 `tests/sql_editor_toolbar_layout.test.ts` 驗證 36px chrome 列、右組順序、Run／Stop 互換、只在 SQL 分頁渲染、標題列不再持有這些控制項；`tests/minimal_ui_primitives.test.ts` 的檔案清單改指新元件）。
- `npm run typecheck`：通過。
- 視覺核對：以 `docs/design/minimal-ui/harness/workspace.html` 與 `tabs.html#data` 各截一張，確認 SQL 分頁的工具列分組與右靠 Limit 正確，非 SQL 分頁不出現該列。

## 已實作（2026-10-15）：工具列按鈕分組（分段容器）

需求：把同一組動作收進一條共用外框的分段容器；查詢結果的四個複製格式合成一組並移除圖示。

已實作：

1. `src/components/ui/SqButtonGroup.vue`（新增）：外框 1px `--color-dark-700`、4px 圓角、`role="group"` + `aria-label`、段與段之間以 `.sq-btn + .sq-btn` 的 1px `--color-dark-750` 左緣細線分隔（`SqButton` 本來就有 1px 透明邊框，只改顏色，不需要額外元素或 gap）。刻意不加 `overflow: hidden`，改把首／末段的內側圓角設為 3px，避免裁掉 `SqButton` 畫在盒子外的 2px accent focus ring。形狀沿用既有 `SqSegmented` 的分段控制語言，因此不觸動 SPEC §6「膠囊形僅限狀態點」。**外框的高度算進控制高度**：段在群組內各縮 2px（xs/sm/md/lg = 18/22/26/30），整條外緣維持 20/24/28/32；先前的版本讓 28px 的 md 段變成 30px 高的外框，旁邊 24px 的 Limit 下拉因此明顯矮一截（實測 30 vs 24），Limit 一併改為 `size="md"` 後，編輯工具列（Run／三條分段／Limit）在 28px、結果工具列（重新整理／複製分段）在 24px 完全對齊。
2. `src/components/layout/SqlEditorToolbar.vue`：`剪下／複製／貼上`、`摺疊／展開／格式化`、`IO 統計／預估執行計畫／實際執行計畫` 各成一條分段容器（`aria-label` 分別為剪貼、檢視與格式化、執行分析選項）；三顆執行分析仍維持獨立 toggle 語意（`aria-pressed` + accent）。列改為 `gap-1` 並讓群組各加 `ml-1`，群組之間只用間距分隔，細線只保留 Run All 之後那一條。Limit 選取器移除可見的「Limit:」字樣，改由 `header.maxRowsTooltip`（新增的 i18n key，zh-TW／en 皆有）以 `v-tooltip.bottom` 於 hover 提示，並同時作為 `aria-label`。
3. `src/components/results/ResultGridItem.vue` + `src/composables/useGridExport.ts`：Copy TSV／CSV／JSON／MD 收進同一條分段容器並移除四個圖示（FileSpreadsheet／FileText／FileCode／Table2 與成功時的 Check），Refresh 與最大化鈕留在容器外；`useGridExport` 新增 `copiedJson`／`copiedMd`（比照既有的 2 秒計時器，抽成 `flashCopied()`），四段在複製成功後一致顯示 `common.copied`（已複製／Copied）2 秒，並以 `min-w-[68px]`／`min-w-[52px]` 固定段寬避免回饋時整條重排。資料表資料／結構檢視器的匯出鈕本次不動。
4. `docs/design/minimal-ui/SPEC.md` §7 新增「按鈕群組（工具列分段）」條目。

驗收：

- `npm test`：647 個通過（新增 `tests/sq_button_group.test.ts` 驗證外框／圓角／段間細線／不裁切 focus ring／`role="group"`；新增 `tests/result_export_group.test.ts` 驗證四段無圖示、四段都會閃回饋、`copiedJson`／`copiedMd` 會設定且 2 秒後復位、空結果不閃；`tests/sql_editor_toolbar_layout.test.ts` 新增三個分段容器與「只剩一條細線」的斷言）。
- `npm run typecheck`：通過。

## 已實作（2026-10-15）：全站圖示改為自製集 PuffSQL-Icons

需求：把全站圖示從 `lucide-vue-next` 換成放在 `docs/PuffSQL-Icons` 的自製 SVG；第三方套件內建圖示暫不處理。

已實作：

1. `scripts/build-icons.mjs`（新增）：讀 `docs/PuffSQL-Icons/svg/*.svg` 產生 `src/components/icons/<Name>.vue` 與 `index.ts`。轉換只做必要的事——移除固定 `width`/`height`（尺寸由呼叫端的 `w-3.5 h-3.5` 決定）、固定 `viewBox="0 0 24 24"`（非 24 的來源包一層 `<g transform>` 縮放）、顏色一律 `currentColor`、`id`／`url(#…)` 加 `puffsql-<名稱>-` 前綴。新增 npm scripts `icons:build` 與 `icons:check`（後者驗證版控生成物與來源同步，供測試與 CI 使用）。
2. 對照結果：程式 112 個 distinct 圖示與圖集 112 個檔案一對一，**零缺口**（來源集根標籤 112 檔完全一致：24×24、`fill="none"`、`stroke="currentColor"`、`stroke-width="2"`、圓角端點），因此不需要補圖或風格轉換。詳見 `docs/icon-migration-report.md`。
3. 40 個檔案把 `from 'lucide-vue-next'` 改成 `from '@/components/icons'`，429 處模板完全沒動（元件名稱沿用原 lucide 名稱）；`lucide-vue-next` 自 `package.json` 與 node_modules 移除。
4. 護欄：新增 `tests/icon_codegen.test.ts`（生成器單元測試：縮放包裹、`currentColor` 正規化、`id` 前綴、index 排序）與 `tests/icon_set.test.ts`（不得再匯入第三方圖示套件、index 與資料夾一致、每個元件留在 24×24 且無硬編色、生成物與來源同步、宣告式檢查 `package.json` 無圖示套件）；`minimal_ui_primitives` 對 AppHeader 的斷言改指 `@/components/icons`；`grid_layout`／`result_tab_retention` 的圖示斷言因名稱沿用而維持。SPEC §8 與 checklist 同步改寫為自製集。

驗收：

- `npm test`：664 個通過；`npm run typecheck`、`npm run build`、`npm run icons:check` 皆通過。
- 視覺核對（既有 harness）：標題列、SQL 編輯工具列三條分段容器、物件總管、結果工具列與複製分段條、設定對話框，外觀與切換前一致（同為 2px 筆畫）。

## 已實作（2026-10-15）：品牌圖示改用新的 mascot，並修好 favicon 來源

需求：用新提供的品牌圖（河豚 mascot）重新產生整組應用程式圖示。

已實作：

1. 來源 `src-tauri/icons/icon-source.png`（1100 × 1100、32bpp ARGB、四角 alpha = 0 的透明背景）納入版控，作為日後重建的單一來源。
2. 以 `npx tauri icon src-tauri/icons/icon-source.png`（tauri-cli 2.11.4）重建 51 個檔案：Windows 桌面（`32x32`／`64x64`／`128x128`／`128x128@2x`／`icon.png`／`icon.ico`）、Windows Store（`StoreLogo` 與 `Square*Logo`）、macOS `icon.icns`，以及 android／ios 全套。應用程式只有兩處使用品牌圖示：Tauri 視窗／工作列圖示（`tauri.conf.json` 的 `bundle.icon`）與設定 → 關於面板引用的 `64x64.png`；標題列依規範不放 logo。
3. `index.html` 的 favicon 原本指向不存在的 `/vite.svg`（Vite 預設殘留，dev 與 build 都是 404），改指 `/src-tauri/icons/64x64.png`：Vite 會把它當資產處理，build 時複製成 `dist/assets/64x64-<hash>.png` 並改寫 `href`，因此不必在 `public/` 再放一份複製品（符合 `app_brand_icon` 對「品牌圖示不重複」的要求）。

驗收：

- `npm test`：664 個通過（`app_brand_icon` 仍要求 `src-tauri/icons/64x64.png` 存在且 About 面板引用它）。
- `npm run build`：通過；`dist/index.html` 的 favicon 指向 `dist/assets/64x64-*.png`（8060 bytes，已確認存在）。
- 視覺抽查：`128x128.png`、`32x32.png`（小尺寸仍可辨識）與 `icon.ico` 解出的內框皆為新圖。

## 已修正（2026-10-16）：標題列印出裸露的標籤殘骸

症狀：使用者截圖顯示「常用 SQL 範本庫」彈窗的標題列直接印出
`class="!w-7 !h-7 !p-0 !rounded-md !border-0 hover:!bg-dark-750" />`、
`v-tooltip.top="$t('sqlTemplates.reloadTooltip')" class="!text-xxs !py-1 !px-2" />` 這類原始模板文字；
物件快搜與篩選規則清單則是在每顆圖示鈕後面多出一個 `/>`。

根因：P4g（`b121b5f`，範本／物件快搜／AI 設定改用 SqButton）把 PrimeVue `<Button … />` 改寫成
`<SqButton …><template #icon>…</template></SqButton>` 時，舊自關閉標籤尾端的屬性行忘了刪。殘骸在模板裡是
合法的**文字內容**，所以 Vue 模板編譯、`vue-tsc` 與 `build` 全都不報錯，只在畫面上照字面印出來——
同一個 commit 訊息記錄過的「漏改結束標籤」會被編譯器擋下（Invalid end tag），這一種不會。

修正（3 檔 9 處）：

1. `src/components/modals/SqlTemplateModal.vue`：清除鈕後的 `class="!w-7 …"` 與 `/>`、重新載入鈕後的
   `v-tooltip`／`class` 兩行與 `/>`、新增自訂範本鈕後的 `/>`。重新載入鈕的 tooltip 語意還原成元件的
   `v-tooltip.top`（`sqlTemplates.reloadTooltip`，原本被留在舊標籤上）；`!text-xxs !py-1 !px-2` 這類覆寫
   依 SPEC §7 由 `size="sm"` 取代，不再寫回。
2. `src/components/modals/QuickObjectFinderModal.vue`：每列動作鈕後的 5 處 `/>`。
3. `src/components/modals/TableFilterTab.vue`：編輯規則鈕後的 1 處 `/>`。

護欄：新增 `tests/template_markup_leak.test.ts`，掃描所有版控 `.vue` 的 `<template>`：前一行已用 `>` 收尾、
這一行卻是 `/>` 或屬性時即失敗。對修正前的 HEAD 會準確列出上述 9 處（行號一致），對修正後為 0，
在 168 個 `.vue` 上零偽陽性（合法換行標籤的屬性只會接在 `<Component` 之後，不接在 `>` 之後）。

驗收：

- `npm test`：665 個通過（新增 1 個）；`npm run typecheck`、`npm run build` 皆通過。
- 視覺核對：沿用設計包 harness 手法（暫時掛載真實 `SqlTemplateModal`，截圖後即刪）在 headless Edge 截圖，
  標題列只剩分類籤、「重新載入」與「新增自訂範本」，無殘骸文字。
- 注意：`dist-portable/` 是修正前的建置產物，需重新 `npm run build:portable` 才會反映此修正。

## 已實作（2026-10-16）：完整 CREATE 指令碼，物件總管列出約束／索引／觸發程序

需求：右鍵「指令碼為 CREATE」原本只產生欄位與主鍵，缺 DEFAULT／CHECK／UNIQUE／FK／索引／觸發程序；展開資料表後只看得到欄位，希望把這些物件也列進樹上，用圖示與顏色區分即可，不必再分資料夾。

已實作：

1. 後端新增 `get_table_objects` 命令（`drivers/mssql/metadata_sql.rs` 純函式產生 SQL + `connection.rs` 解析、`ConnectionManager`、`schema_commands`、`lib.rs` 註冊）。單一批次七個結果集：欄位、PK／UNIQUE、CHECK、DEFAULT、FK、索引、觸發程序，一次往返取回；解析分組放在 Rust（避免 `STRING_AGG` 而需 SQL Server 2017），維持 2012 相容。欄位查詢仍以 `INFORMATION_SCHEMA.COLUMNS` 為基底（`maxLength` 語意不變），再 LEFT JOIN `sys.columns`／`sys.default_constraints`／`sys.computed_columns`／`sys.identity_columns` 補上 DEFAULT、定序、計算欄位運算式、PERSISTED 與 identity 種子／增量。
2. 物件總管：`loadedColumns` 快取改為 `tableObjects`（資料表與檢視表共用同一條展開路徑、同一份快照），新元件 `ExplorerObjectRows.vue` 在欄位列之後列出約束、索引、觸發程序——**不加資料夾**，以圖示＋語意色（PK `text-warn`／UQ `text-ok`／CK `text-info`／DF `text-plan`／FK `text-accent`／索引 `text-ok`／觸發程序 `text-warn`）＋右側徽章區分，鍵欄位、INCLUDE、篩選條件放在 tooltip。主鍵／唯一約束背後的索引不重複列出。
3. 右鍵動作（`explorerObjectMenuItems`）：複製名稱、產生 CREATE 語法、產生 DROP 語法；索引另有 REBUILD／REORGANIZE；觸發程序另有「檢視定義」（雙擊亦可，優先用快取中的 `sys.sql_modules.definition`，讀不到才退回 `OBJECT_DEFINITION`）。雙擊約束／索引直接產生其指令碼。
4. DDL 產生器：`generateCreateTableDdl` 改為組合式輸出——欄位（計算欄位 `AS (…) PERSISTED`、具名 DEFAULT、`COLLATE`、`IDENTITY(seed,inc)`）→ 索引 → 外鍵 → 觸發程序，順序即為可重播順序；PK／UNIQUE／CHECK／DEFAULT 內嵌 `CREATE TABLE` 並使用資料庫中的真實約束名稱（移除原本合成的 `PK_<table>` 與提示註解）；停用或未受信任的約束在腳本尾端補 `ALTER TABLE … NOCHECK CONSTRAINT`。物件層級指令碼抽到 `src/utils/objectScriptGenerator.ts`（索引／約束／觸發程序各 CREATE／DROP 與索引維護），非 rowstore 索引與讀不到定義的觸發程序改以中文註解說明，不產生錯誤 SQL。
5. i18n 新增 11 條（zh-TW／en 同步）：`scriptDrop`、`indexRebuild`、`indexReorganize`、`disabledObject`、`indexKeys`、`indexIncludes`、`indexFilter`、`references`、`dblclickViewDefinition`、`generatedObjectScript`、`objectScriptFailed`。

驗收：

- `npm test`：688 個通過（新增 `tests/ddl_generator.test.ts` 9 項、`tests/object_script_generator.test.ts` 14 項、`tests/table_objects.test.ts` 7 項來源守門）；`npm run typecheck`、`npm run build` 皆通過。
- `cargo test --lib`：29 個通過（`metadata_sql` 4 項：涵蓋七個結果集、2012 相容、識別字轉義、事件排序）；`cargo check` 通過。
- 手動核對：瀏覽器模式（mock payload）展開 Users 表可見約束／索引／觸發程序，右鍵產生完整 CREATE 腳本。

### 後續：在真實 SQL Server 上驗證，修掉 5 個只有真機才會現形的錯誤

症狀：使用者實際展開資料表時跳出 `載入物件失敗: Database error: Invalid column name 'is_disabled'.`

根因：目錄查詢與產生器只用單元測試的字串斷言驗證過，沒有真的送到伺服器。使用者提供本機 SQL Server 2022（127.0.0.1:1433 容器）的測試帳密後逐項驗證，共修掉：

1. `sys.key_constraints` 沒有 `is_disabled`／`is_not_trusted`：PK／UNIQUE 的停用狀態在**背後索引**（`ALTER TABLE … NOCHECK CONSTRAINT` 就是把該索引停用），而 trust 只有 CHECK／FOREIGN KEY 才有 → 改讀 `sys.indexes.is_disabled`，`is_not_trusted` 固定 false。`is_enforced` 是 SQL Server 2022 才有的欄位，不能拿來當相容解。
2. `sys.indexes` 沒有 `is_clustered`：叢集性一律由 `i.type = 1` 判定。
3. `sys.default_constraints` 沒有 `is_disabled`／`is_not_trusted`：DEFAULT 約束不會被停用或標記未受信任 → 移除這兩個欄位。
4. 欄位查詢不再用 `OBJECT_ID(schema + '.' + table)` / `COLUMNPROPERTY` 判斷 identity 與 computed（表名含空白或 `]` 時會解析失敗），改由 `sys.identity_columns`／`sys.computed_columns` 的 join 直接判定。
5. `CREATE TABLE` 不接受資料表層級的 `DEFAULT (…) FOR [col]`（那是 `ALTER TABLE ADD CONSTRAINT` 的語法），且**外鍵欄位清單不接受 `ASC`／`DESC`** → DEFAULT 改掛在欄位行（`[Qty] [int] NOT NULL CONSTRAINT [DF_Orders_Qty] DEFAULT ((1))`，名稱保留），FK／REFERENCES 改用純欄位清單。

同時修正兩個語意問題：「未受信任」先前用 `NOCHECK CONSTRAINT` 收尾，那其實是**停用**（重建後的約束會比原表寬鬆）→ CHECK 改用 `WITH NOCHECK ADD CONSTRAINT`、外鍵在語句中加 `WITH NOCHECK`，真正停用者才用 `NOCHECK CONSTRAINT`；相鄰觸發程序之間也不再出現 `GO` 後又一個 `GO`。

驗證方法（真機往返，非字串斷言）：

- 建立 `PuffSQL_Verify_Scratch`：自訂 identity 種子（100,5）、`PERSISTED` 計算欄位、具名 DEFAULT ×2、非預設定序欄位、PK／UNIQUE／CHECK／**未受信任的 CHECK**／FK（`ON DELETE SET NULL`）、篩選索引（DESC 鍵 + INCLUDE + WHERE）、兩個觸發程序（其中一個停用），外加表名含空白的 `[Order Details]`。
- 用 **Rust 端真實的 `get_table_objects`** 取得 payload（＝應用程式實際走的程式碼路徑）→ 前端 `generateCreateTableDdl` 產生腳本 → 在 `PuffSQL_Verify_Rebuilt` 重播 → 再以同一批次 dump 重建表的 payload，程式化逐欄位比對：**columns／constraints／indexes／triggers 完全一致（IDENTICAL）**，含 identity 種子、定序、計算欄位運算式、PERSISTED、約束名稱、鍵序 DESC、INCLUDE、篩選條件、trigger 事件與停用狀態。表名含空白的表同樣正確。
- 過程中另外發現「驗證工具」本身的兩個陷阱（與產品無關，但值得記下）：批次切分若用貪婪的 `\s*` 會吃掉註解行的換行，讓下一句被併進註解；以及 Windows PowerShell 5.1 的 `Get-Content` 預設以 ANSI 讀取無 BOM 的 UTF-8 `.sql`，中文位元組誤配對時會把換行吃掉。應用程式本身走 Rust（UTF-8）與 `batch.rs` 的狀態機，不受影響。

護欄：`metadata_sql` 新增 `catalog_lookups_only_use_columns_that_exist`（把上述不存在的欄位與 `is_clustered` 釘成禁止項，並要求 identity／computed 不得再用 `OBJECT_ID`）；`tests/ddl_generator.test.ts` 新增 DEFAULT 必須落在欄位行、`CREATE TABLE` 內不得出現 `FOR [col]`、未受信任／停用各自的正確語句、批次分隔不重複等斷言；`tests/object_script_generator.test.ts` 新增 FK 不得帶 ASC／DESC 與 CHECK 的 `WITH NOCHECK` 形式。

驗收：`cargo test --lib` 30 個通過；`npm test` 700 個通過；`npm run typecheck`、`npm run build` 通過。

測試資料：`PuffSQL_Verify_Scratch`（來源，含各種複雜物件）與 `PuffSQL_Verify_Rebuilt`（往返驗證用）依使用者指示保留在該 SQL Server 執行個體上，可隨時 `DROP DATABASE` 清除。

## 已修正（2026-10-16）：SQL 編輯器右鍵選單被壓在分隔線下面

症狀：在編輯器按右鍵，Monaco 的選單畫在分隔線（含編輯器與結果之間那條中隔線）下面。

根因有兩層，都在 CSS 堆疊規則上：

1. Monaco 自己的 `.context-view` 是 `position: absolute` 且**沒有 z-index**（`.context-view.fixed` 的 `all: initial` 還會把 z-index 再重設一次），所以任何帶 z-index 的 App 圖層都會蓋過它——分隔線是 `z-20`、標題列 `z-30`。
2. 更關鍵的是 `MonacoEditor.vue` 的編輯器容器帶了 `z-[1]`：那個 z-index 會**建立 stacking context**，把整棵 Monaco DOM（含選單）鎖在裡面，此時選單給多高的 z-index 都沒用。

修正：

- `src/components/editor/MonacoEditor.vue`：編輯器容器移除 `z-[1]`。它原本只是為了壓在背景浮水印之上，但浮水印是 `z-index: 0`、且容器在 DOM 順序中排在它後面，靠繪製順序就足夠；移除後編輯器到 App 根節點之間不再有任何 stacking context（以 CDP 走訪祖先鏈驗證：`stacking contexts above the editor: none`）。
- `src/assets/main.css`：Monaco 選單段落把 `.context-view`／`.context-view.fixed`／`.context-view.monaco-component` 的 `z-index` 設為 **1200**，也就是 `SqPopover`（因此 `SqMenu`）使用的選單圖層，仍低於浮動視窗（9990+）與 tooltip（11000）。

驗證：合成 `contextmenu` 事件 Monaco 會忽略，因此改用 CDP 送真實輸入、並在真實頁面注入與 Monaco 同結構的 `.context-view.fixed`，對每個 App 圖層做 `elementFromPoint` 命中測試。修正前三條分隔線（含 1156×6 的編輯器↔結果中隔線）、標題列與 SQL 工具列都由被覆蓋的一方勝出；修正後**全部由選單勝出**，選單 computed `z-index` = 1200、`position: fixed`。

護欄：新增 `tests/layer_order.test.ts`（3 項）——解析各圖層實際數值斷言 `splitter < header < menu < tooltip / toast` 的排序、確認 `.context-view.fixed` 有被覆寫（否則 `all: initial` 會清掉 z-index）、且編輯器容器與外殼不得再出現任何 z-index／transform／filter（就是這次的根因）。`tests/editor_background_image.test.ts` 原本釘住 `z-[1]` 的斷言改為「host 保持 positioned 但不帶 z-index」並註明原因。

驗收：`npm test` 通過（含上述 3 項新護欄）、`npm run typecheck`、`npm run build` 通過。

## 已修正（2026-10-16）：狀態列不再重複左上角的連線資訊

症狀：視窗左下角狀態列把連線資訊又講了一次——`● 連線名稱 (host:port) | ▤ 資料庫`——而左上角標題列已經有連線與資料庫兩個選單顯示同樣的名稱。

修正：`src/components/layout/AppStatusBar.vue` 移除該兩段（連線狀態燈 + 名稱 + host:port、資料庫名稱），左側只留狀態列獨有、標題列沒有顯示的 `SPID`；右側的執行狀態、Engine、版本不動。移除後 `Database` 圖示在該檔已無使用，一併移除 import。

取捨：連線狀態燈（綠／紅）也一起移除，因為標題列的連線選單本來就用綠色／灰色資料庫圖示表示連線狀態；`statusBar.disconnected` 這條 i18n 字串因此不再被引用（與檔內其他既有未引用字串相同處理，保留不刪以免動到兩份語系）。

驗收：`npm test` 703 項通過（`minimal_ui_primitives` 對狀態列「必須 import SqChip」的斷言仍成立，因為狀態與 SPID 仍用 SqChip）、`npm run typecheck`、`npm run build` 通過；以 headless 截圖核對：左下角只剩 `SPID: 55`，右下角為 `狀態／Engine／PuffSQL v0.2.0`。

## 已修正（2026-10-16）：物件總管子節點的徽章改為純文字

症狀：展開資料表後，約束／索引／觸發程序列右側的 `CK`／`PK`／`NONCLUSTERED` 等是帶外框的晶片，整排看起來像按鈕，而且晶片的內距與 1px 邊框把這些列撐得比上面的欄位列高，樹的節奏因此不齊（欄位列 20px、物件列約 24px，節距忽大忽小）。

修正：`src/components/layout/ExplorerObjectRows.vue` 的徽章改成純文字 `[PK]`／`[NONCLUSTERED]`／`[AFTER INSERT, UPDATE]`——移除 `border`／`bg`／`px`／`py`／`rounded`，只留 `text-xxs` 與色彩（一般 `text-dark-500`、停用 `text-warn`）；與欄位列右側的型別標籤同一種處理。

驗收：以 CDP 在真實頁面展開 `dbo.Users` 後量測 15 列子節點——欄位、約束、索引、觸發程序**一律 20px 高、節距 22px**（先前物件列因晶片而更高）；徽章 computed style 為 11px、`border-width: 0px`。`npm test` 703 項、`npm run typecheck`、`npm run build` 通過。

備註：`[AFTER INSERT, UPDATE]` 這類較長的標籤在側邊欄預設寬度下會壓縮同一列的物件名稱（完整內容仍在列的 tooltip）；把側邊欄拉寬即可，若需要也可以改成只顯示 `[AFTER]`／`[INSTEAD OF]`，事件留在 tooltip。

## 已修正（2026-10-16）：分頁一多，編輯器分頁標籤被水平捲軸切掉

症狀：開啟多個 SQL 分頁後，分頁列的標籤被水平捲軸壓縮、下緣被切。

根因有兩層：

1. `.query-tabs-scroll` 同時設了標準屬性 `scrollbar-width: thin` 與 `::-webkit-scrollbar { height: 4px }`。Chromium（WebView2 / dev 瀏覽器）在設了標準屬性時會**忽略** webkit 偽元素規則，實際套用的是它的 "thin" 捲軸（約 8px），比預期的 4px 多吃一倍高度。
2. 分頁列本身是 `h-9`（36px）再加 `.workspace-tab-bar { padding-top: 6px }`：36 − 6 − 1（下框線）= 29px 剛好放得下 28px 的分頁，一旦捲軸出現就只剩 21px，標籤就被 `overflow-y: hidden` 切掉。

修正（`src/components/layout/AppMain.vue`）：

- 分頁列 `h-9` → `h-10`（40px），`.workspace-tab-bar` 的 `padding-top` 6px → 4px：4 + 28（分頁）+ 4（捲軸）+ 1（框線）= 37 ≤ 40，捲軸出現時仍有餘裕。
- 移除 `.query-tabs-scroll` 的 `scrollbar-width` / `scrollbar-color`，讓既有的 `::-webkit-scrollbar { height: 4px }` 生效（並在原處留下註解說明原因，避免又被加回去）。

驗證：以 CDP 在真實頁面開 12 個分頁（強制水平溢出）後量測——分頁列 40px、padding-top 4px、水平捲軸 4px（`offsetHeight − clientHeight`）、分頁高 29px 且標籤完整未被切；截圖核對捲軸落在分頁下方，`Query 1.sql … DF_Orders_Status_dr…` 標籤全部可讀。`npm test` 703 項、`npm run typecheck`、`npm run build` 通過。

## 已實作（2026-10-16）：分頁支援滑鼠中鍵關閉

需求：分頁要能像瀏覽器一樣用滑鼠中鍵關閉。

已實作：兩條分頁列都加上中鍵關閉，且各自沿用原本的關閉路徑（不新增第二條關閉邏輯）：

- `AppMain.vue`（編輯器分頁）：分頁加 `@auxclick.middle.prevent="workspaceStore.closeTab(tab.id)"`——與該分頁的 × 鈕同一個 store action（最後一個分頁被關掉時的行為也一致：自動開一個新的查詢分頁）。
- `AppBottomPanel.vue`（結果分頁）：分頁加 `@auxclick.middle.prevent="queryStore.deleteResultTab(rtab.id)"`——同樣與其 × 鈕一致（最後一個結果分頁受保護，不關閉）。
- 兩條分頁列的捲動容器都加 `@mousedown.middle.prevent`，避免 Windows 在中鍵按下時啟動自動捲動。

中鍵不會啟用被點的分頁（瀏覽器行為）：關閉走的是 `auxclick`，而分頁只在 `@click`（左鍵）時才切換；`onTabPointerDown` 本來就有 `if (e.button !== 0) return;`，所以中鍵也不會開始拖曳排序。

驗證：以 CDP 送**真實**中鍵輸入（非合成事件）——

- 編輯器分頁：`["Query 1.sql","Query 2.sql","Query 3.sql"]` 對 `Query 2.sql` 按中鍵後變成 `["Query 1.sql","Query 3.sql"]`，且使用中的分頁仍停在 `Query 1.sql`（沒有被切換）。
- 結果分頁：`["3.Users","2.Users","1.Users"]` 對 `3.Users` 按中鍵後變成 `["2.Users","1.Users"]`；再對僅剩的那一個按中鍵維持 1 個（與 × 鈕一致）。

護欄：新增 `tests/tab_middle_click_close.test.ts`（2 項）——兩條分頁列的中鍵處理必須指向與 × 鈕相同的 store action、捲動容器必須吞掉中鍵的 mousedown、且 `onTabPointerDown` 必須保留左鍵以外的按鍵判斷。`npm test` 705 項、`npm run typecheck`、`npm run build` 通過。

## 已修正（2026-10-16）：左上角連線清單展開後擠在一起

症狀：點開左上角的連線選單，選項之間互相擠壓、文字看起來連成一串；被選取的那一列還出現**兩個**勾。

根因有兩層：

1. `SqSelect` 的選項是**固定高度** `height: 26px`（為單行設計），但連線選單的 `#option` slot 畫兩行——名稱一行、`username@host:port` 一行——兩行內容（約 33px）直接溢出 26px 的盒子，於是壓到上下相鄰的選項。
2. `SqSelect` 本身已經在選取項右側畫一個 `Check`，AppHeader 的 `#option` slot 又自己畫了一個，因此同一列出現兩個勾。

修正：

- `src/components/ui/SqSelect.vue`：`.sq-select__option` 的 `height: 26px` 改為 `min-height: 26px` 並加上 `padding: 3px 8px`。單行選項（例如資料庫清單）量起來仍是 26px 不變，兩行的 slot 則自然長高。
- `src/components/layout/AppHeader.vue`：連線選單的 `#option` slot 移除自己畫的 `Check`（選取狀態由 primitive 擁有）與多餘的 `py-0.5`，並移除已無使用的 `Check` import。

驗證：以 CDP 在真實頁面打開兩個選單量測——

- 連線清單：2 個選項各 **38.5px**（兩行 + 6px 內距），選取項 **1 個勾**、另一項 0 個；`min-height: 26px`、padding 3px、選項間距 1px。
- 資料庫清單：6 個單行選項**全部仍是 26px**（與修正前一致，無回歸）。
- 截圖核對：名稱與 `sa@host:port` 兩行分明、右側只有一個勾、頁尾「新增連線…」以細線分隔。

護欄：新增 `tests/sq_select_options.test.ts`（2 項）——選項必須用 `min-height` 而非固定 `height`、且必須保留垂直內距；連線選單的 `#option` slot 不得再畫自己的 `Check`、`Check` import 必須移除，而選取狀態由 `SqSelect` 負責。`npm test` 707 項、`npm run typecheck`、`npm run build` 通過。

## 已修正（2026-10-16）：送出含中文的 SQL 讓查詢卡死、停不了也不報錯

症狀：編輯器裡有一行中文（例如隨手打上的「無線滑鼠」）再接一段 `SELECT`，按 Ctrl+Enter 之後查詢永遠停在「執行中」，按取消沒反應，訊息面板也沒有任何錯誤。

根因（**Rust 端 panic，不是伺服器問題**）：`src-tauri/src/drivers/mssql/batch.rs` 的 `is_go_command` 用位元組切片判斷 GO：

```rust
let prefix = &trimmed[..2];        // ← 中文第 2 個位元組不是字元邊界
```

只要某一行以多位元組字元開頭（中文、重音字母、emoji），`&line[..2]` 就會 panic（`byte index 2 is not a char boundary`）。這個 panic 發生在 `execute_query` 的第一步（批次分割），於是 Tauri 命令的工作直接被殺掉——**前端 invoke 的 promise 永遠不會 settle**，所以畫面永遠是「執行中」、不會報錯、取消也無效（要取消的請求根本沒建立）。

同一支檔案裡 `detect_use_database` 的 `trimmed[..3]` 有同樣的位元組切片問題（emoji 開頭的行會 panic），`parse_go_count` 的 `trimmed[2..]` 也是。

修正：

1. `batch.rs` 新增 `starts_with_ascii_ci(text, prefix)`——以**位元組**比對 ASCII 關鍵字，永不切到字元中間（UTF-8 的續位元組不可能是 ASCII 字母）。`is_go_command`、`parse_go_count`、`detect_use_database` 都改用它在先，之後才做（此時已保證是 ASCII 邊界的）切片；`detect_use_database` 另外把 `as_bytes()[3]` 改成 `get(3)`。
2. `commands/query_commands.rs` 新增 `isolated()`：把查詢工作丟到自己的 task 並 **await 它的 join handle**。任何未來的 panic 都會轉成看得見的錯誤訊息（「內部錯誤：查詢工作已中止（…）」），而不是讓 UI 無聲卡死；`execute_query` 與 `cancel_query` 都走這條路。

驗證（對真實 SQL Server 2022，走應用程式自己的 Rust 路徑）：

- 修正前：`split_sql_batches("無線滑鼠\n\nSELECT * FROM SalesDemo.Products;")` **panic**（`batch.rs:209`）。
- 修正後：同一段 SQL 在 **0.79ms** 內回傳 `[error] Token error: 'Could not find stored procedure '無線滑鼠'.' … (code: 2812)`——也就是使用者期待的「直接報錯」。另以 SqlClient 直連確認過伺服器對這段批次本來就是立刻回兩個錯誤（`Could not find stored procedure '無線滑鼠'`、`Invalid object name 'SalesDemo.Products'`），所以問題完全在客戶端。

護欄：`batch.rs` 新增 3 項測試——`multibyte_lines_never_panic_the_splitter`（中文、重音字母、emoji、全形字母、單一中文字都不得 panic，且不被誤判為 GO／USE）、`go_and_use_detection_still_work_after_the_safe_prefix_check`（`GO`／`go 5`／`Go`／`goto`／裸 `use` 等邊界仍正確）、`a_stray_line_travels_with_the_statement_below_it`（記錄「游標在零散文字上時，該行會跟著下面以 `;` 結尾的語句一起送出」這個既有行為）。

驗收：`cargo test --lib` 33 項、`npm test` 707 項、`npm run typecheck`、`npm run build` 通過。

