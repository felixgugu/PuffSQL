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
