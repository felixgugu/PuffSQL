# 評估：極簡改版是否移除 PrimeVue、全面改用 Tailwind

> 搭配 `docs/design/minimal-ui/SPEC.md`（視覺規範）閱讀。所有數字取自 `minimal-ui` 分支現況：
> `npm run build` 產物、`src/` 靜態掃描，量測日期 2026-10-14。

## 結論（先看這一段）

**當時建議採「混合式」**：把高頻、純視覺的葉節點元件（Button / Tag / InputText / IconField /
InputIcon / Checkbox / ToggleSwitch / Textarea / SelectButton / Divider / Badge / Card /
ProgressBar）換成 `src/components/ui/` 底下自建的 Tailwind 元件；**保留 PrimeVue 負責**
Dialog、ContextMenu、Menu、Popover、Select（浮層與鍵盤導覽）、Toast＋Confirm、Tooltip，
直到自建替代品通過同一組無障礙驗收。同時**把 PrimeIcons 換成 lucide-vue-next**（與 PrimeVue
元件去留無關，屬獨立且高投報率的清理）。

不建議「一次全面移除 PrimeVue」，也不建議「留在 PrimeVue 只調參數」——理由在下面。

> **後記（2026-10-15）：這份評估的結論已經走完，而且比原建議更徹底——PrimeVue 已完全移除。**
> 混合式是**當時**在沒有自建基礎時的正確答案；等 Dialog／Select／Menu／Popover／ContextMenu／
> Tooltip／Toast 都有自建替代品並通過驗收後，最後剩下的主題引擎就成了唯一的依賴，於是連它一起
> 移除。最終結果與量測見文末「9. 最終結果」。

---

## 1. 現況盤點（量化證據）

| 指標 | 數值 | 意義 |
|---|---|---|
| 匯入 `primevue/*` 的 .vue 檔 | **35 / 43（81%）** | 幾乎每個畫面都受影響 |
| 使用到的 PrimeVue 元件種類 | **22** | button 31、tag 22、inputtext 13、dialog 10、select 6、iconfield/inputicon 各 6、checkbox 4、contextmenu 4、toggleswitch/selectbutton/textarea/config 各 3，其餘 1–2 |
| PrimeIcons 用法 | **335 處 `pi pi-*`** | 圖示字型，非 SVG |
| 產物中的圖示字型檔 | **約 284 KB**（primeicons woff2 34.3 + eot 83.2 + ttf 83.0 + woff 83.1） | 每次啟動都要帶的字型成本 |
| `src/assets/main.css` | **1,246 行**，其中 **130 行**是 `.p-*` 覆寫、**300 個 `!important`** | 樣式層正在與 PrimeVue 的優先權對抗 |
| 產物 CSS `index-*.css` | **140.6 KB**；1,789 個規則區塊中 **257 個**提到 `.p-*`、**314 個**是 `pi-*:before` 字形規則 | 將近 1/3 的規則不是我們的設計 |
| 主 JS chunk | **2.64 MB**（gzip 700 KB），PrimeVue 未獨立切出；`node_modules/primevue` 13.3 MB、`@primeuix/themes` 3.9 MB | 主題引擎與元件全在關鍵路徑上 |
| 直接使用 PrimeVue class 的檔案 | **26** | class 名稱散落各處，不是單一抽象層 |
| 測試檔涉及 PrimeVue 契約 | **7 / 74** | 測試衝擊可控（多為原始碼字串斷言） |

**現有抽象已經存在**：`src/services/themeManager.ts` 以 `@primevue/themes` 的 `definePreset`
把 PrimeVue 主題與自有的 `--color-*` token 併用，並對外提供 theme preset／主色／表面色三個設定。
換句話說，**設計 token 這一層我們已經有自己的來源**，PrimeVue 主要提供的是「元件 + 主題引擎」。

---

## 2. 三個選項

| | A. 保留 PrimeVue，只調整主題層 | B. 混合式（建議） | C. 全面移除 |
|---|---|---|---|
| 做法 | 用 `definePreset` + 現有 `--color-*` 覆寫把 Aura 改成極簡風 | 葉節點換自建 Tailwind 元件；浮層暫留 PrimeVue | 連 Dialog／Select／Menu／Toast 都以自建或 headless 重寫 |
| 視覺達標度 | 中：能改色與圓角，但 PrimeVue 的元件內距、陰影、狀態層仍需 `!important` 對抗 | 高：高頻元件完全照 SPEC 落地，`!important` 債停止成長 | 高：一致，但重寫期間容易出現行為落差 |
| 工作量 | 低（1 個主題檔 + 少量覆寫） | 中（約 13 個葉節點元件 + 呼叫端替換） | 高（再加 9 個行為型元件：焦點鎖定、定位、鍵盤、虛擬滾動） |
| 風險 | 低，但視覺天花板也低；`!important` 繼續累積 | 中：替換期間新舊並存需靠 SPEC 約束 | 高：Dialog 焦點鎖定、Select 鍵盤導覽、ContextMenu 定位都是回歸熱區 |
| 對 bundle | 幾乎不變 | 逐步下降（葉節點與 `pi-` 字型移除） | 最大下降，但可能需引入新依賴（headless 庫） |
| 測試影響 | 幾乎無 | 7 個契約測試需更新 | 同上 + 互動測試需補 |

**為什麼不選 A**：目前 300 個 `!important` 正是 A 路線走了很久的結果；極簡風要求「1px 邊框、
小圓角、無陰影、固定高度」，這些都是 PrimeVue 元件內部結構的對立面，繼續用覆寫會讓樣式更難維護。

**為什麼不選 C（現在）**：Dialog 的焦點鎖定／Esc／捲動鎖、Select 的鍵盤與定位、ContextMenu
的邊界翻轉、Toast 的佇列與自動消失，這些是「看起來簡單、壞掉很難發現」的行為；在沒有 E2E
測試護欄前重寫它們，風險與 A 路線的維護成本不成比例。等 B 完成、元件層有自建基礎後，再評估。

---

## 3. 元件去留對照

**Phase B 要換掉的（自建於 `src/components/ui/`）**

| PrimeVue | 現況用量 | 自建替代 | 備註 |
|---|---|---|---|
| `button` | 31 | `<SqButton>`（solid / outline / ghost / danger，24–32px） | 圖示按鈕強制 `aria-label` |
| `tag` | 22 | `<SqChip>`（中性／語意色，3px 圓角，非膠囊） | 取代現行 `Tag` 的 severity 用法 |
| `inputtext` / `textarea` | 13 / 3 | `<SqInput>` / `<SqTextarea>` | focus 用 2px outline，不用 box-shadow |
| `iconfield` + `inputicon` | 各 6 | `<SqInput>` 內建前綴／後綴插槽 | 移除 PrimeVue 的絕對定位包裝 |
| `checkbox` / `toggleswitch` | 4 / 3 | `<SqCheckbox>` / `<SqSwitch>`（原生 input + 樣式） | 鍵盤與 label 直接沿用原生語意，反而更穩 |
| `selectbutton` | 3 | `<SqSegmented>` | 面板檢視切換用（結果｜訊息｜歷程｜統計） |
| `divider` / `badge` / `card` / `progressbar` | 各 1 | CSS 邊框 / `<SqChip>` / 純容器 / 2px 進度條 | 都是純視覺，成本最低 |

**已完成退場**（B 路線實際走完的範圍）：`button`、`tag`、`inputtext`／`textarea`、
`iconfield`／`inputicon`、`checkbox`／`toggleswitch`、`selectbutton`、`divider`／`badge`／`card`／
`progressbar`、`toolbar`／`message`、`inputnumber`／`password`、`datatable`／`column`、
`select`、`popover`／`menu`、`contextmenu`、**`dialog`**。自建原語在 `src/components/ui/`：
`SqChip`、`SqInput`、`SqTextarea`、`SqCheckbox`、`SqSwitch`、`SqSegmented`、`SqButton`、
`SqPopover`、`SqMenu`、`SqSelect`、`SqDialog`，加上 `piIcons.ts` 與 `focusTrap.ts` 兩個工具。

**仍保留 PrimeVue 的部分（P6 之後的範圍）**：`tooltip`（1 個指令、約 150 個 `v-tooltip` 使用點）、
`toast` + `toastservice` + `usetoast`（`App.vue`、`AiSqlChatModal.vue`）、`config`（含 `ripple`、
`confirmationservice`，其中 `useConfirm` 已確認 0 使用點，屬可直接移除的死碼）、`@primevue/themes`
（`settingsStore` 的 themePreset／primaryColor 旋鈕）與 `primeicons`（仍有 121 處 `pi pi-*`）。

**圖示（獨立於 PrimeVue，先做）**：335 處 `pi pi-*` → `lucide-vue-next`。
做法：建立 `src/utils/iconMap.ts` 對照表（`pi-table` → `Table2`、`pi-database` → `Database`、
`pi-search` → `Search`、`pi-check` → `Check`、`pi-times` → `X`、`pi-copy` → `Copy`、
`pi-refresh` → `RefreshCw`、`pi-sparkles` → `Sparkles`、`pi-exclamation-triangle` → `TriangleAlert`、
`pi-wrench` → `Wrench`、`pi-clone` → `CopyPlus` …），以腳本掃描替換後人工核對，最後移除
`primeicons` 依賴與 `main.css` 的 314 條字形規則。

---

## 4. 設定功能的處理（需要產品決策）

目前設定提供三個與 PrimeVue 綁定的旋鈕：`themePreset`（Aura/Lara/Nora/Material）、
`primaryColor`、`surfaceColor`。極簡規範要求「單一低飽和藍」，與可任選主色的設計衝突。

建議：

1. **移除 4 個 PrimeVue preset 選擇器**（它們改的是別人的主題架構，與我們的 token 無關）。
2. **固定 `--accent`** 為 SPEC 的鋼藍；若要保留個人化，只保留「淺色／深色」與
   **中性表面色盤**（Slate／Gray／Zinc／Neutral，透過現有 `applyGlobalSurfaceVariables` 實作，
   不需 PrimeVue）。這保留了現有 `surfaceColor` 設定的價值，同時守住單一操作色原則。
3. `primaryColor` 選擇器移除；既有使用者設定值在載入時忽略即可（不需遷移腳本）。

---

## 5. 分階段計畫（每階段獨立可回退）

| 階段 | 內容 | 驗收 |
|---|---|---|
| **P0 現況基線** | 在分支上完成本規範與樣張；`npm test` / `typecheck` / `build` 全綠作為基線 | 本文件 + SPEC + preview.html；三項指令通過 |
| **P1 Token 層** | 依 SPEC §3–§6 改寫 `main.css` 的 `--surface-*` / `--text-*` / `--border-*` / `--accent` 與 tailwind.config 擴充；淺色為預設 | 全站換色不需改任何元件；深淺兩態對比依 SPEC 驗證 |
| **P2 外殼** | 標題列、側邊欄、分頁列、工具列、底部面板、狀態列套用 SPEC §7；移除面板陰影與裝飾 | 螢幕截圖與 SPEC 對照；無回歸（現有 566 測試） |
| **P3 圖示** | lucide 對照表 + 全數替換、移除 primeicons | `rg "pi pi-" src` 為 0；產物不再有 primeicons 字型檔 |
| **P4 葉節點元件** | 建立 `src/components/ui/` 並逐一替換 §3 表格元件 | 各元件的鍵盤／對比／密度符合 SPEC §11；`!important` 數量較基線下降 |
| **P5 浮層元件** | 自建 Dialog／Select／Menu／Popover／ContextMenu 並逐一替換（此時已有自建基礎） | 決策紀錄見 §5.1 |
| **P6 Tooltip／Toast** | 自建 `v-tooltip` 指令與 toast 服務，移除 `primevue/tooltip`／`toast*` | 使用點全部改指自建實作 |
| **P7 主題與套件** | 移除 `@primevue/themes` preset 旋鈕與 `primevue/config`／`ripple`／`confirmationservice`，`package.json` 不再有 `primevue` | `rg "primevue" src package.json` 為 0 |
| **P8 PrimeIcons** | 121 處 `pi pi-*` 換成 lucide、移除 `primeicons` 與其 314 條字形規則 | `rg "pi pi-" src` 為 0；產物無 primeicons 字型 |

每階段結束都跑 `npm test`（566 項）與 `npm run typecheck`，並且**只提交該階段**，
讓任何一階段都能單獨 revert。

### 5.1 P5 決策紀錄：自建 Dialog（2026-10-14）

**決策：自建 `SqDialog` 取代 PrimeVue Dialog，已於 10 個檔案、13 個渲染點完成。**

複評時列的風險是「焦點鎖定、Esc、點遮罩關閉、捲動鎖、定位」這些壞掉不容易發現的行為。實際盤點後
收斂成這樣處理：

| PrimeVue Dialog 的職責 | 實際使用情況 | SqDialog 的處理 |
|---|---|---|
| Teleport + 遮罩 | 全部 `modal` | `<Teleport to="body">` + 固定遮罩（`rgba(16,24,40,.32)`，無模糊） |
| 焦點鎖定／`focusOnShow` | 未設過參數，全用預設 | `utils/focusTrap.ts`：可聚焦清單 + `nextTrapIndex` 純函式環繞，關閉後焦點歸還原控制項 |
| Esc（`closeOnEscape`） | 預設 true；`ExportSchemaModal` 執行中其實不該關 | 獨立 `closeOnEscape` 開關，`ExportSchemaModal` 傳 `step !== 'running'` |
| 點遮罩關閉 | 8 處顯式開啟、2 處未開（維持原行為） | `dismissableMask`，且須「在遮罩上按下」才成立 |
| `header` / `#header` / `#footer` / `closable` | 全數使用 | 同名 prop 與 slot，`closable` 只管標題列按鈕 |
| `:pt` | 僅 `ConnectionModal` 1 處，用來在 PrimeVue 內部結構上覆寫內距與底色 | 直接移除：外框統一由 `.sq-dialog-surface` 決定，`contentClass` 保留給自帶版面的對話框 |
| 疊層 z-index | 巢狀對話框（範本庫）需要 | 模組層堆疊計數，1100 + 深度 |
| 進場轉場 | 有 | 僅透明度，150ms 內；`prefers-reduced-motion` 下 120ms。**不使用位移或縮放**，`show` 事件因此能拿到未變形的 `getBoundingClientRect` |
| 捲動鎖 | PrimeVue `blockScroll` 預設 false，本專案從未開啟 | 不實作，維持現狀 |

**為什麼最後決定自己做**：清單裡真正困難的只有焦點環繞，而它是 40 行純函式可測的邏輯；其餘都是
這個 App 已經在 `useDialogWindow`、`windowDrag`、`SqPopover` 裡走過的路。相對地，留著 PrimeVue
Dialog 就得讓 `!important` 與 `--p-dialog-*` 主題變數永遠留在關鍵路徑上。**這次沒有引入任何新依賴。**

**已知限制**：本環境無法在瀏覽器裡操作（只有 headless 截圖），所以拖曳、縮放、焦點環繞、Esc、
點遮罩關閉都是靠**純函式單元測試 + 原始碼契約測試 + headless 實拍**驗證（含 `useDialogWindow`
在 `show` 之後確實注入 8 個縮放區的 DOM 檢查），而不是互動測試。

---

## 6. 風險與對策

- **視覺回歸**：SPEC 已有可量測的驗收清單；P1/P2 以截圖比對（改版前後同尺寸）確認。
- **無障礙回歸**：葉節點替換改用原生 input/label，鍵盤與焦點語意不減；PrimeVue 浮層保留期間仍套用
  SPEC 的 focus 規範。既有 `tests/motion_accessibility.test.ts`、`theme_contrast.test.ts`
  是這條線的護欄，需隨 token 更名更新期望值。
- **測試契約**：7 個測試檔引用 PrimeVue class 字串；P2/P4 會需要同步更新（屬預期成本）。
- **設定相容**：既有使用者的 `primaryColor` / `themePreset` 值會被忽略；`surfaceColor` 沿用。

---

## 7. 需要你拍板的三件事

1. **操作色**：接受 SPEC 的單一鋼藍 `#2E6F9E`（低飽和、白字 5.41:1），或改用 skill 建議的
   `#0369A1`（飽和度較高）。
2. **設定旋鈕**：同意「移除 4 個 PrimeVue preset，保留淺/深 + 中性表面色盤，固定操作色」嗎？
3. **浮層元件**：同意 B 路線（保留 PrimeVue 的 Dialog/Select/Menu/Toast 直到有替代）嗎？

### 目前狀態

實作已依 §4 的建議先走：操作色固定為 SPEC 鋼藍（`#2A6791`，深色 `#8CB8DA`），
PrimeVue 的實心填色另拆 `--color-accent-fill`。第 3 點已在 §5.1 決策為「自建」並完成；
第 2 點的 preset 旋鈕仍在（P7 範圍），目前只是把預設值指向同一個鋼藍，**尚未移除**。
若你要走回「使用者可自選主色」，那條路徑會與「單一操作色」的規範衝突，需要你指名其一。

> **已結案（2026-10-15）**：第 1 點採 SPEC 的鋼藍。第 2 點與第 3 點都已完成——第 3 點是自建
> 浮層元件（§5.1），第 2 點在最後查核後發現 preset 與主色旋鈕只剩 PrimeVue 在讀，
> 對畫面已無任何影響，因此移除（見 §9）。若你想要「使用者自選主色」，那是新的需求，
> 與單一操作色的規範衝突，需要重新指名其一。

---

## 9. 最終結果（2026-10-15）

`primevue` 與 `@primevue/themes` 已從 `package.json` 移除，`src/` 內 0 匯入，
`main.css` 內 0 條 `.p-*` 規則。

| 指標 | P0 基線 | 完成後 |
|---|---|---|
| 匯入 `primevue/*` 的檔案 | 35 / 43（81%） | **0** |
| 使用到的 PrimeVue 元件種類 | 22 | **0** |
| `pi pi-*` 圖示用法 | 335 | **0** |
| 圖示字型檔 | 約 284 KB | **0** |
| `src/assets/main.css` | 1,246 行、300 個 `!important` | **876 行、129 個** |
| `main.css` 的 `.p-*` 覆寫 | 130 行 | **0** |
| 產物 CSS | 140.6 KB | **126.9 KB** |
| 主 JS chunk | 2.64 MB（gzip 700 KB） | **1,598 KB（gzip 476 KB）** |
| `node_modules` 的 PrimeVue 套件 | primevue 13.3 MB + @primeuix 3.9 MB | **0** |
| 測試 | 566 項 | **628 項** |

取代 PrimeVue 的是 12 個自建原語（`src/components/ui/`：SqChip、SqInput、SqTextarea、
SqCheckbox、SqSwitch、SqSegmented、SqButton、SqPopover、SqMenu、SqSelect、SqDialog、SqToast）
＋ 1 個指令（`v-tooltip`）＋ 3 個純函式工具（`focusTrap`、`popoverPlacement`、`windowGeometry`）。
葉節點改用原生 `input`／`label`，鍵盤與螢幕閱讀器語意不減；浮層則補上單元測試與契約測試
（`sq_dialog`、`tooltip_directive`、`toast_queue`、`minimal_ui_primitives`、`minimal_ui_surfaces`）。

**代價與已知限制**：本環境無法在瀏覽器內操作，拖曳、縮放、焦點環繞、點遮罩關閉等互動是靠
單元測試、原始碼契約測試與 headless 截圖驗證，而非互動測試。`main.css` 仍有 129 個 `!important`，
但對象已全部是我們自己的元件與 Monaco／Tabulator 的第三方樣式，不再有「與別人的主題引擎對抗」
那一類。
