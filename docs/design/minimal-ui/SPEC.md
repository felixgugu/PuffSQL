# PuffSQL 極簡介面設計規範（minimal-ui 分支）

> 本文件是 `minimal-ui` 分支的**設計 source of truth**。`design-system/puffsql/MASTER.md` 是
> ui-ux-pro-max skill 產生的原始建議，本文件在其之上做產品化決策；凡兩者衝突，以本文件為準
> （差異與理由見文末「與 MASTER.md 的差異」）。
> 預覽樣張：`docs/design/minimal-ui/preview.html`
> PrimeVue 去留評估：`docs/design/minimal-ui/PRIMEVUE-EVALUATION.md`

---

## 1. 目標與範圍

**產品**：PuffSQL — 集中管理 SQL Server 連線，讓工程師、資料分析師與 DBA 探索資料結構、撰寫
SQL、執行查詢、檢視結果與追蹤查詢紀錄的桌面工具（Tauri + Vue 3 + Tailwind）。

**這份規範要解決的問題**：目前介面以深色為主、資訊密度高，但視覺語言偏重（多層灰階卡片、
玻璃與漸層、圓角與陰影不一致、PrimeVue 預設樣式與自訂覆寫混用）。目標是把它收斂成
「**專業、安靜、精準**」的極簡介面：**用邊框、留白與字級建立層級，不用裝飾**。

**不變的前提**：極簡 ≠ 降低資訊密度。現有每一個資料欄位（資料列數、耗時、SPID、IO 統計、
執行計畫、釘選與分頁狀態）都必須保留，只是改用更安靜的方式呈現。

---

## 2. 設計原則

1. **單一操作色**：整個產品只有一個藍（`--accent`）。所有「可操作」訊號用它，其餘一律中性灰。
2. **1px 與留白分層**：層級靠 1px 邊框、背景差一階與間距，不靠陰影堆疊；陰影只保留給浮動層。
3. **密度優先**：這是工作工具，控制項 24–32px、資料列 24px、工具列 36px；不為了「呼吸感」犧牲掃視效率。
4. **資料等寬**：SQL 與資料值用等寬字，數字用 tabular figures；文字與數字對齊比裝飾重要。
5. **動態只用來說明因果**：120–160ms、只動 transform/opacity、尊重 `prefers-reduced-motion`。

---

## 3. 色彩 token

沿用現有架構：`main.css` 以**通道三元組**宣告（`--color-x: R G B`），Tailwind 透過
`rgb(var(--color-x) / <alpha>)` 取用（`tailwind.config.js` 的 `withOpacity`）。
下表同時給 hex 與三元組，可直接落成 token；所有對比數字皆已用 WCAG 相對亮度公式程式化驗證。

### 3.1 淺色（主要設計目標）

**實作對照**：這些角色以現有 `--color-dark-*` 階梯承載（`main.css` 的 `:root` / `html.dark`
是首次繪製前的預設值，`themeManager.buildThemeTokens()` 在執行期依「表面色盤 + 模式」重新套用）。
下表列的是**預設 Slate 色盤**的實際值——這也是 `minimal-ui` 目前的預設外觀。

本文件後續章節用描述性名稱（canvas / chrome / panel / hover / well / raised / hairline /
separator / muted / secondary / primary）敘述設計意圖，對應的實作 token 如下，兩者指同一件事：

| 描述性名稱 | 實作 token | Tailwind 用法 |
|---|---|---|
| canvas | `--color-dark-900` | `bg-dark-900` |
| chrome | `--color-dark-850` | `bg-dark-850` |
| panel | `--color-dark-800` | `bg-dark-800` |
| hover / active / hairline-ish | `--color-dark-750` | `bg-dark-750` / `border-dark-750` |
| well | `--color-dark-950` | `bg-dark-950` |
| raised | `--color-raised` | `bg-raised` |
| hairline / border-control | `--color-dark-700` | `border-dark-700` |
| separator（非文字） | `--color-dark-600` | `border-dark-600` |
| primary / secondary / muted text | `--color-dark-100` / `-400` / `-500` | `text-dark-100` / `text-dark-400` / `text-dark-500` |
| accent | `--color-accent` | `text-accent` / `bg-brand-500`（填色） |

| 角色 | Token | Hex | 三元組 | 用途 |
|---|---|---|---|---|
| 畫布 | `--color-dark-900` | `#FFFFFF` | `255 255 255` | SQL 編輯器、結果資料格、主工作區、輸入框 |
| 外框 | `--color-dark-850` | `#F8FAFC` | `248 250 252` | 標題列、側邊欄、工具列、狀態列 |
| 面板 | `--color-dark-800` | `#FCFDFE` | `252 253 254` | 面板表頭、分頁列底、輸入框底 |
| 停留／選取 | `--color-dark-750` | `#ECF0F6` | `236 240 246` | hover 列、目前分頁、選取列、細分隔線 |
| 內凹 | `--color-dark-950` | `#EAEFF5` | `234 239 245` | 內縮井、程式碼預覽底、斑馬列 |
| 浮起 | `--color-raised` | `#FFFFFF` | `255 255 255` | 選單、對話框、tooltip、popover（靠 1px 邊 + 陰影區隔） |
| 細線／邊界 | `--color-dark-700` | `#E2E8F0` | `226 232 240` | 面板分隔、表格橫線、輸入框邊界 |
| 分隔（非文字） | `--color-dark-600` | `#64748B` | `100 116 139` | 較強的分隔與 hover 邊界（≥3:1） |
| 主文字 | `--color-dark-100` | `#020617` | `2 6 23` | 標題、儲存格數值、目前選項 |
| 次文字 | `--color-dark-400` | `#334155` | `51 65 85` | 一般說明、未選中分頁 |
| 弱文字 | `--color-dark-500` | `#475569` | `71 85 105` | 佔位字、單位、時間戳、次要標籤 |
| 操作色 | `--color-accent` | `#2A6791` | `42 103 145` | 主要按鈕、focus、選取框、連結 |
| 操作色（hover／按下） | `brand-600` / `brand-700` | `#235A7E` / `#1E4F70` | — | 主要按鈕 hover／按下填色 |
| 操作色（底） | `--accent-tint` | `rgba(42,103,145,.08–.10)` | — | 選取底、目前節點底 |
| 危險 | `--color-danger` | `#B42318` | `180 35 24` | 錯誤訊息、破壞性動作 |
| 警告 | `--color-warn` | `#A94306` | `169 67 6` | 警告訊息、資料截斷 |
| 成功 | `--color-ok` | `#027A48` | `2 122 72` | 連線成功、執行成功 |
| 計畫 | `--color-plan` | `#6941C6` | `105 65 198` | 執行計畫相關標記 |
| ER／結構 | `--color-er` / `--color-structure` | `#0E7090` / `#3538CD` | — | ER 圖與結構分頁的識別色（僅小面積） |

**為什麼操作色是 `#2A6791` 而不是 `#2E6F9E`**：`#2E6F9E` 在 25% 的藍色狀態標籤底上只有 4.19:1、
在自己的 16% 淡底上只有 4.35:1。`#2A6791` 是同一色家族再深一階，對畫布 6.09:1、對 25% 藍底
4.55:1、對各種色盤的 hover/選取面 5.3:1 以上，同時維持低飽和鋼藍的外觀。

**已驗證對比（淺色，實測）**：主文字 17.8:1、次文字 10.4:1、弱文字 7.6:1（於畫布），弱文字在最深
互動面仍有 6.6:1；操作色 6.09:1、白字於操作色填色 6.09:1；危險 6.57:1、警告 6.01:1、成功 5.41:1、
計畫 6.62:1（皆 ≥ 4.5:1）。跨 5 種表面色盤 × 2 模式的文字對比最差值為 **4.94:1**。

**邊界對比（淺色，非文字）**：細線 `#E2E8F0` 對畫布 1.23:1（裝飾線，不承載操作語意，符合
WCAG 1.4.11 的豁免）；分隔步 `#64748B` 對畫布 4.76:1；focus 指示為 2px `--accent`（對畫布 6.09:1 > 3:1 ✓）。

### 3.2 深色（配對變體，非反相）

深色沿用同一組角色名稱，只換值；底色改為中性碳黑（不使用藍色調底色），邊框必須比所在表面更亮。

| 角色 | Hex | 三元組 |
|---|---|---|
| `--color-dark-900`（畫布） | `#16171A` | `22 23 26` |
| `--color-dark-850`（外框） | `#1C1D20` | `28 29 32` |
| `--color-dark-800`（面板） | `#222325` | `34 35 37` |
| `--color-dark-750`（停留／分隔） | `#27282B` | `39 40 43` |
| `--color-dark-700`（邊界） | `#3B3C3F` | `59 60 63` |
| `--color-raised`（選單／對話框） | `#232427` | `35 36 39` |
| `--color-dark-600`（分隔，非文字，≥3:1） | `#6B737F` | `107 115 127` |
| `--color-dark-500`（弱文字） | `#94A3B8` | `148 163 184` |
| `--color-dark-400` / `300` / `200` / `100` | `#CBD5E1` / `#E2E8F0` / `#F1F5F9` / `#F8FAFC` | — |
| `--color-accent`（文字／圖示／選取框） | `#8CB8DA` | `140 184 218` |
| `--color-accent`（填色，白字） | `#2A6791` | `42 103 145` |
| `danger` / `warn` / `ok` | `#F97066` / `#FDB022` / `#47CD89` | — |
| `plan` / `er` / `structure` | `#B692F6` / `#67E3F9` / `#A4BCFD` | — |

深色表面階梯由色盤 900 階**去飽和 85%** 後推導（`themeManager.neutralizeRgb`）：換表面色盤只改變
炭黑的深淺，不會把整個外殼染藍；文字階梯沿用色盤本身的 ramp（各色盤本來就是中性灰）。

**已驗證對比（深色）**：主文字 11.9–16.1:1、次文字 7.5–10.7:1、弱文字 4.80:1（最差面為
`--surface-active`）；角色色文字 4.69–11.8:1；`--border-control` 對各表面 1.28–1.81:1、
`--border-strong` ≥1.69:1。

---

## 4. 字體與字級

| 用途 | 字族 |
|---|---|
| 介面 | `Inter, "Segoe UI", "Microsoft JhengHei UI", system-ui, sans-serif`（現有 `--app-font-sans` 已相符，不需改；Windows 會落到 Segoe UI + 微軟正黑體） |
| SQL 與資料值 | `"Fira Code", Consolas, "Cascadia Mono", monospace`（現有 Tailwind `font-mono` 已相符） |

字級（密度 9／10）：`11` 標籤與徽章 → `12` 介面預設 → `13` 編輯器與主要輸入 → `14` 區段標題 →
`16` 對話框標題 → `20` 空狀態標題。字重只用 400／500／600（`600` 僅限標題與目前選項）。
行高：介面 1.45、SQL 1.6、資料格 1.0（`24px` 固定列高）。
**數字一律 `font-variant-numeric: tabular-nums`**（列號、筆數、耗時、SPID、IO bytes）。

---

## 5. 間距與尺寸

間距階梯：`2 / 4 / 6 / 8 / 12 / 16 / 24 / 32`。

| 元素 | 高度 |
|---|---|
| 標題列（含視窗控制） | 40px |
| 工具列 / 編輯器工具列 | 36px |
| 分頁（SQL 分頁、結果分頁） | 28px（活動分頁 29px，含 1px 疊邊以併入畫布） |
| 控制項（sm / md / lg） | 24 / 28 / 32px |
| 資料格表頭 / 資料列 | 28 / 24px |
| 樹狀節點 | 24px |
| 訊息列 | 標題列 24px + 內容列（12px 等寬，`leading-normal`；展開為多行） |
| 狀態列 | 24px |
| 對話框表頭 / 頁尾 | 40 / 48px |
| 檢視器子標題列（資料／結構／執行計畫） | 32px |

水平內距：面板 `12px`、密集列 `8px`、對話框內容 `16px`、按鈕 `10px`（圖示按鈕為正方形）。

---

## 6. 圓角、邊框、陰影

- 圓角：`3px` 徽章／標籤、`4px` 按鈕／輸入／分頁／分段控制、`6px` 面板與對話框；膠囊形僅限狀態點。
- 邊框：一律 `1px solid`；focus 為 `2px` `--accent` 外框（`outline-offset: 1px`），不使用 box-shadow ring。
- 陰影：只有浮動層有陰影——`--shadow-raised: 0 1px 2px rgba(16,24,40,.06), 0 4px 12px rgba(16,24,40,.08)`
  （選單、tooltip、popover）與 `--shadow-overlay: 0 8px 24px rgba(16,24,40,.12)`（對話框）。
  **面板、卡片、工具列、資料格一律不加陰影**；禁用漸層、模糊玻璃、裝飾插圖。

---

## 7. 元件規格

- **按鈕**：主要（`--accent` 填色、白字，hover `--accent-hover`）、外框（1px `--border-control`、
  文字 `--text-primary`、hover `--surface-hover`）、文字／圖示（透明底、hover `--surface-hover`）、
  危險（`--danger` 填色）。圖示按鈕一律 24–28px 正方形並具備 `aria-label`。
- **輸入／文字域／下拉**：`28px`（sm 24、lg 32）、白底、1px `--border-control`、圓角 4；focus 換
  `--accent` 邊 + 2px outline；placeholder 用 `--text-muted`；錯誤在欄位下方以 `--danger` + 圖示呈現。
- **下拉浮層／選單／popover**：`--surface-raised`、1px `--border-hairline`、圓角 6、`--shadow-raised`；
  選項列高 26px，選取中 = `--accent-tint` 底 + `--accent` 文字 + 左側 12px 勾選圖示。
- **勾選／開關**：勾選框 14px、圓角 3、選中 `--accent` 填色 + 白勾；開關 32×18、滑鈕 14px。
- **分段控制（面板檢視切換）**：外框 1px 包住整組，活動段 = 白底 + 1px `--border-control` +
  `--text-primary`，非活動段 = 透明 + `--text-secondary`（不用填色標示，保持安靜）。
- **按鈕群組（工具列分段）**：同一組動作共用一個外框——外框 1px `--border-control`、4px 圓角，
  段與段之間 1px `--border-hairline`（借用 `SqButton` 自身的 1px 透明邊框改色，不再多一層 gap）。
  段為透明底 + 次文字，hover `--surface-hover`；帶狀態的段（toggle）沿用該按鈕的語意色
  （`--accent-tint` + `--accent`）。群組不裁切子元素，段的 focus ring 維持 2px `--accent` 完整可見；
  群組與群組之間只用間距分隔，不畫第二條線。**外框算在控制高度裡**：段的實際高度比同級控制少 2px
  （xs/sm/md/lg = 18/22/26/30），所以整條的外緣仍等於 20/24/28/32，與旁邊的按鈕、下拉完全對齊。
- **分頁**：活動分頁 = 畫布白底 + 上／左／右 1px，文字 `--text-primary`；非活動 = 透明 + 次文字，
  hover `--surface-hover`；關閉鈕只在 hover 或活動時出現。結果分頁為同語言的緊湊版本（含釘選圖示）。
- **樹狀（物件總管）**：列高 24px、縮排 12px/層、展開箭頭 12px；選取 = `--accent-tint` + `--accent` 文字
  （不加左側色條）；右側顯示物件型別與筆數於 `--text-muted`。
- **資料格**：表頭 28px（`--surface-chrome`、1px 下緣、可排序則顯示 caret）、列高 24px、
  儲存格左右 6px；斑馬列 `--surface-panel`、hover `--surface-hover`、選取 `--accent-tint`；
  僅有橫向 1px 分隔線（固定 `#` 欄右側例外）；數值右對齊 + tabular-nums；`NULL` 為斜體 `--text-muted`
  加虛線底；釘選欄右側 1px `--border-control`。
- **訊息列**：標題列 24px + 內容列（等寬 12px）；等級用**語意色晶片（tone + 文字標籤）**，
  再加上 `Msg` 編號與 `Line` 行號——狀態一律有文字，不靠顏色單獨傳達；
  剛執行的訊息以 `--accent-tint` 淡入淡出（沿用現行 3 秒暫態高亮，顏色改綁 `--accent`）。
- **對話框**：白底、圓角 6、1px 邊、`--shadow-overlay`、遮罩 `rgba(16,24,40,.32)`（**不使用模糊**）；
  表頭 40px + 標題 14px/600 + 右上關閉；頁尾右對齊「文字鈕 + 主要鈕」，破壞性動作在左並用 `--danger`。
- **Tooltip**：`#1F2328` 底、`#F2F4F7` 字、11px、圓角 4、延遲 400ms。
- **Toast**：白底卡片 + 3px 左側語意色條 + `--shadow-raised`，12px 文字，3–4 秒自動消失。
- **狀態列**：24px、`--surface-chrome`、12px `--text-muted`，區段以 1px 細線分隔，數字用等寬。
- **空狀態**：16px 圖示 + 12px 說明 + 選用文字鈕；不使用插圖。

---

## 8. 圖示

使用專案自製的 **PuffSQL-Icons**（來源 `docs/PuffSQL-Icons/svg`，112 顆，24 × 24 viewBox、
描邊 2px、圓角端點與轉角、色沿用文字色）：由 `npm run icons:build` 產生
`src/components/icons/*.vue`，全站只從 `@/components/icons` 具名匯入，不再依賴任何第三方圖示套件
（`icons:check` 與 `tests/icon_set.test.ts` 守住生成物與來源同步）。尺寸 token `12 / 14 / 16 / 20`。
**移除 PrimeIcons 字型**（歷史：335 處 `pi pi-*` 用法與 4 個字型檔共約 284KB；理由與成本見
PRIMEVUE-EVALUATION.md）。裝飾性圖示加 `aria-hidden="true"`，純圖示控制項必須有 `aria-label`
與狀態（`aria-pressed` / `aria-expanded`）。

---

## 9. 文案（繁體中文為主，保留英文術語）

規則：介面用繁體中文；**SQL 關鍵字、資料庫物件與業界慣用縮寫保留英文**，且不中英夾雜於同一詞
（例：「執行查詢」、「資料列」、「結構描述」、「檢視資料」；保留 `SELECT`、`WHERE`、`JOIN`、`SPID`、
`IO`、`執行計畫`、`Index`、`NULL`）。數字單位使用 `ms`、`s`、`rows`、`bytes`。
按鈕用動詞開頭（`執行`、`取消`、`匯出`、`連線`）；狀態用形容詞（`已連線`、`執行中`、`已取消`）。

---

## 10. 動態

時長 token：`--motion-fast: 120ms`（hover／按壓）、`--motion-base: 160ms`（展開、分頁切換）、
`--motion-slow: 240ms`（對話框進出，退出為進入的 60%）；緩動 `ease-out` 進入、`ease-in` 離開；
只動 `transform` / `opacity` / `background-color`；`prefers-reduced-motion: reduce` 時取消位移與淡入，
保留狀態立即呈現（現有 main.css 已具備這組媒體查詢，沿用）。

---

## 11. 無障礙（交付前必檢）

- 文字對比 ≥ 4.5:1（本文件所有色票已驗證，含 hover／選取面）。
- Focus 可見：2px `--accent` 外框，鍵盤可達所有操作；對話框焦點鎖定並可用 Esc 關閉。
- 不可只靠顏色傳達狀態（訊息等級、連線狀態、欄位錯誤都要有圖示或文字）。
- 圖示按鈕有 `aria-label`；清單／分頁具備正確 role（tablist/tab/tabpanel、tree/treeitem）。
- 表格支援排序並提供 `aria-sort`；`prefers-reduced-motion` 全部生效。

---

## 12. 與 MASTER.md 的差異（刻意偏離，附理由）

| MASTER.md 建議 | 本規範 | 理由 |
|---|---|---|
| Accent `#0369A1`（高飽和藍） | `#2A6791`（鋼藍） | 使用者要求「單一低飽和藍色」；且需在 25% 藍色狀態標籤底上仍達 4.5:1 |
| 警告 `#B54708`（amber-700） | `#A94306` | 同色相再深一階，才在實際使用的 `amber-500/25` 標籤底上達到 4.96:1 |
| 按鈕 padding 12/24、圓角 8、hover `translateY(-1px)` | 高度 28、內距 10、圓角 4、hover 換底色 | 桌面密集工具；位移 hover 會造成掃視抖動 |
| 卡片圓角 12 + `--shadow-md` + hover 放大 | 面板無圓角裝飾、無陰影、只有 1px 邊 | 使用者要求避免過多卡片與陰影 |
| Modal `backdrop-filter: blur(4px)` | 遮罩純色 `rgba(16,24,40,.32)` | 使用者要求避免玻璃效果 |
| Hero／CTA 版型與 Scroll Reveal | 不適用 | 這是工具型 App 外殼，沒有行銷頁與捲動敘事 |
| `--space-*` 8/12/16 為主的寬鬆間距 | 2/4/6/8/12 為主 | 密度 9/10 與資料格 24px 列高的需求 |

保留自 MASTER.md／skill 的部分：Minimalism & Swiss Style 風格定位、Inter 為介面字、
對比 ≥4.5:1、可見 focus、150–300ms 級動態、禁 emoji 圖示、禁用圖示字型改 SVG。

---

## 13. 驗收清單（實作後逐項核對）

### 實作進度（2026-10-14）

- **P1 token 層：已完成。** `themeManager.buildThemeTokens()` 依本規範重寫（淺色：白畫布 →
  面板 → 外框 → hover/well 的階梯；深色：去飽和炭黑），`main.css` 的 `:root` / `html.dark`
  同步為預設值，`tailwind.config.js` 的 `brand` 換成操作色家族，**預設色彩模式改為淺色**
  （`settingsStore` 與 `index.html` 的首繪腳本一起改），PrimeVue 的預設主色也指向同一個鋼藍。
  驗證：566 項測試通過（含重寫後的對比護欄 ×2、晶片底色 ×1、Tabulator 表面 ×1、預設模式 ×1）、
  `npm run typecheck`、`npm run build` 通過，並以 Vite dev + headless Chrome 實拍淺色與深色
  真實 App 畫面確認。
- **P2 外殼：已完成（2026-10-14）。** 標題列、側邊欄、分頁列、狀態列收斂為單一操作色 + 中性灰：
  執行／執行全部與三個模式開關改綁操作色，六個裝飾性色（開檔／存檔／快速尋找／範本／AI／DBA）
  改中性，側邊欄「使用中／已定位／待貼上」徽章改中性、開啟中列走選取態，分頁列移除陰影與
  拖曳 ring/scale，狀態列連線燈改 token。`rg` 掃描 `src/components/layout` 對寫死的 Tailwind
  色階已 0 命中。新增唯一允許的兩級陰影 token（`shadow-raised`／`shadow-overlay`）。
- **P3 圖示：部分完成。** 外殼自有標記中的 PrimeIcons 已全數換成 lucide（含 DBA 按鈕補上
  `aria-label`）。仍待處理：62 處 `<i class="pi ...">` 元素（主要在對話框與檢視器）與 128 個
  PrimeVue `icon="pi ..."` prop（依賴 P4 換掉元件後改用 `#icon` slot），完成後才移除 primeicons。
- **P4 葉節點元件：進行中。** 已建立 `src/components/ui/` 下的 6 個原語：`SqChip`（Tag）、
  `SqInput`（InputText／IconField／InputIcon）、`SqCheckbox`、`SqSwitch`（ToggleSwitch）、
  `SqSegmented`（SelectButton）、`SqTextarea`。**已全面退場的 PrimeVue 元件**：Tag、InputText、
  IconField、InputIcon、Divider（改 1px 分隔線）、Card（改 1px 邊框容器）、Checkbox、ToggleSwitch、
  SelectButton、Textarea、ProgressBar（改用既有 `.sq-progress-line`）、Badge（改用 SqChip）。
  表單類一律是原生 `<input>`／`<textarea>` 加 token 樣式，因此鍵盤、螢幕閱讀器與表單語意不變；
  focus 指示統一為 2px 操作色 outline，勾選／開啟態用 `accent-color` 吃同一個操作色。
  過程中一併移除標籤內的 emoji 圖示、把動態 severity 改為動態 tone，並修掉 SqInput 自身
  width 規則壓過呼叫端工具類的問題。
- 新增第 7 個原語 **`SqButton`**（三變體 × 五語意色 × 四高度、`#icon` slot、載入態與
  `aria-pressed`），並新增 `src/components/ui/piIcons.ts` 作為 PrimeIcons→lucide 的單一對照表。
  深色模式原本會讓實心填色與文字色共用 `--color-accent`（淺鋼藍），因此拆出
  `--color-accent-fill`／`--color-accent-fill-hover`：**填色不算文字色，另以白字對填色的
  4.5:1 驗證**。
  **Button 已全面退場：193 處渲染點全部改為 SqButton（外殼 → 結果區 → 編輯器檢視器 → 對話框），
  葉節點層到此結束。** 連同先前的 Tag／InputText／IconField／Divider／Card／Checkbox／
  ToggleSwitch／SelectButton／Textarea／ProgressBar／Badge，PrimeVue 只剩下行為型元件：
  dialog(10)、select(6)、contextmenu(4)、menu(1)、popover(1)、toolbar(1)、message(1)、
  inputnumber(1)、password(1)、datatable(1)、column(1)，以及工具類的 tooltip／toast／config／ripple
  （見 PRIMEVUE-EVALUATION.md §3、§5 的 P5 複評）。

- **P5 浮層元件：Dialog 已完成（2026-10-14）。** 新增第 8 個原語 **`SqDialog`**
  （`src/components/ui/SqDialog.vue`）＋ 純函式 `src/utils/focusTrap.ts`，10 個對話框（含
  `SqlTemplateModal` 與 `SqlFolderExplorer` 各 2 個、`AiSettingsTab` 內嵌 1 個，共 13 個渲染點）
  全數改用它；`primevue/dialog` 在 `src/` 已 0 匯入。它自有的行為契約：Teleport 到 body、
  `rgba(16,24,40,.32)` 純色遮罩（無模糊）、焦點鎖定（Tab 環繞）與關閉後焦點歸還、Escape、
  點遮罩關閉（需在遮罩上按下才成立，避免拖曳誤關）、標題列 40px + 14px/600 標題 + 右上關閉、
  頁尾右對齊；`closable`／`closeOnEscape`／`dismissableMask` 三個開關彼此獨立，
  `ExportSchemaModal` 因此在執行中仍顯示關閉鈕但拒絕 Esc 與遮罩關閉。**`show`／`hide` 於
  enter／leave 轉場結束後才發出**，`useDialogWindow` 的拖曳與 8 向縮放接著在同一個已定版元素上
  建立；`appear` 讓「掛載時就已開啟」的對話框也能取得拖曳區。外框（6px 圓角、1px 邊、
  `--shadow-overlay`）統一由 `main.css` 的 `.sq-dialog-surface` 提供，PrimeVue 主題變數
  `--p-dialog-border-radius` 與相關 `.p-dialog*` 覆寫全部移除（`main.css` 再少 130 行對抗式規則）。
  驗證：597 項測試（新增 `tests/sq_dialog.test.ts`）、`npm run typecheck`、`npm run build` 通過，
  並以 headless Chrome 實拍淺／深色外框表、真實遮罩與 `useDialogWindow` 掛載後的 8 個縮放區。

- **順帶修掉一個既有缺陷：`SqButton` 的 `iconOnly` 判斷漏了 `label` prop。** 由於標籤是靠 prop
  而非 slot 傳入，所有帶文字按鈕都被套上 `sq-btn--icon-only`（`width: 28px; padding: 0`），
  文字因而溢出按鈕方塊——先前只有內建圖示的按鈕看起來正常，所以 P4 的截圖與測試都沒抓到。
  現在 `iconOnly = !slots.default && !slots.label && !props.label?.length`。

- **P6 Tooltip 已完成（2026-10-14）。** 自建 `v-tooltip` 指令（`src/directives/tooltip.ts`），
  約 150 個使用點完全不需修改（沿用 PrimeVue 的 API：side 修飾詞、字串值、空字串＝不顯示）。
  全站共用一個 `.sq-tooltip` 元素、400ms 延遲、focus 立即顯示、`pointerleave`／`blur`／按下即收；
  定位用新增的 `placeTooltip`（`utils/popoverPlacement.ts`）置中與翻轉，並夾在視窗內。
  樣式依 SPEC §7（`#1F2328` / `#F2F4F7` / 11px / 4px，無箭頭）。同時清掉 P5 之前 Select／
  ContextMenu／Menu 遺留的 224 行死 CSS：`main.css` 由基線 1,246 行降到 938 行，
  `!important` 由 300 個降到 168 個。

- **P7a Toast 已完成（2026-10-14）。** 新增 `src/stores/toastStore.ts`（佇列、上限 4 張、
  `life: 0` 表示常駐）與 `src/components/ui/SqToast.vue`（右下、3px 語意色條 + 圖示 + 標題摘要、
  `--shadow-raised`、12px、`role="alert"` 用於錯誤、`aria-live="polite"` 其餘）。
  `workspaceStore.showToast(message, type, duration)` 的簽名與 156 個呼叫點不變，內部改為推入佇列
  （原本的單槽 `activeToast` 會被後一則蓋掉）；`App.vue` 的 toast 中繼 watcher 因此刪除。
  `main.css` 已無任何 `.p-*` 選擇器，`!important` 降到 128 個。

- **P3／P8 圖示完成（2026-10-15）。** 全站 `pi pi-*` 歸零：72 個 `<i class="pi …">` 標記改成
  lucide 元件（尺寸依 SPEC §8 的 12／14／16／20 就近換算，例如 `text-xs`→`w-3 h-3`、
  空狀態的 `text-3xl`／`text-4xl` 收斂為 `w-5 h-5`／`w-6 h-6`），36 個選單模型的 `icon: 'pi pi-…'`
  改成元件參考；`src/components/ui/piIcons.ts` 與 `SqMenu` 的字串圖示分支一併刪除
  （`SqMenuItem.icon` 現在只接受元件）。`primeicons` 已從 `main.ts` 與 `package.json` 移除。
  **產物不再有 284KB 的圖示字型**；CSS 140.6 → 131.2 KB、主 JS 2,640（P0 基線）→ 2,132 KB。

- 補充：P6 的 tooltip 指令在截圖複查時發現一個真實缺陷——對話框開啟時會程式化聚焦第一個控制項，
  而 focus 事件會立刻顯示提示，於是每個對話框一出現就在關閉鈕上冒出「關閉」提示。已加上鍵鼠模態
  追蹤：只有鍵盤造成的 focus（Tab）才顯示提示。這件事是靠 headless 實拍與 DOM 傾印發現的，
  測試與型別檢查都不會抓到。

- **P9 表面收斂（2026-10-15）。** 把 SPEC §6 的兩條規則真正掃乾淨，並加上護欄測試
  （`tests/minimal_ui_surfaces.test.ts`）：
  - **圓角**：`rounded-lg`(8px) 43 處、`rounded-xl`(12px) 5 處、`rounded-sm`(2px) 1 處全部換成
    允許的級距；兩個浮動膠囊（`AiFloatingPill`、`DataViewFloatingPill`）由 `rounded-full` 改
    `rounded-md`（SPEC 禁止膠囊按鈕）。狀態點／頭像／spinner 的 `rounded-full` 保留。
  - **陰影**：`shadow-2xl/xl/lg/md/sm/xs/inner` 共 34 處換成 `shadow-overlay`／`shadow-raised`
    或直接移除，含連帶失效的彩色陰影工具類（`shadow-amber-500/5` 這類沒有尺寸類時本來就不生效）。
    ER 節點與執行計畫畫布內的陰影刻意保留：那是畫布上的**內容**，陰影負責與畫布背景分離，
    不是 App 外殼。
  - **對比**：`ConnectionModal` 的測試結果橫幅原本用 `text-emerald-400`／`text-rose-400`
    （淺色模式下約 1.9:1），改走 `--color-ok`／`--color-danger` 與其 10%／30% tint；
    TSV 匯入進度條的實心填色 `bg-emerald-500` 改為 `bg-ok`。
  - 護欄測試會列出違規檔案與類別名，而不是只回報「有一項失敗」。

- **P10 玻璃、漸層、級距與最後的 PrimeVue 殘留（2026-10-15）。** 這一輪把 SPEC §12 的三條
  「刻意偏離」驗證成事實，而不是只寫在文件裡：
  - **玻璃效果歸零。** 15 處 `backdrop-blur*` 全部移除（ER 畫布節點、ER 提示列與右鍵選單、
    執行計畫載入遮罩、AI 建議下拉、TSV 精靈遮罩）。ER 節點的深色模式原本是
    `bg-*-950/40` + `backdrop-blur-md`——在任意畫布底色上文字對比無法預測——現在改為不透明
    `bg-*-950`（六種註記色在深色模式都實測 ≥ 5.6:1）。TSV 精靈的遮罩改成與其他對話框共用的
    `.sq-scrim`，全 App 只有一個遮罩色。
  - **不透明表面。** 29 處 80–99% 的半透明表面（對話框標題列／頁尾、畫布節點）改為不透明：
    半透明本身不是玻璃，但它讓對比取決於後面是什麼，這正是規範要排除的性質。
  - **漸層：只剩兩個功能性圖樣。** `rg` 掃描 Tailwind 漸層工具類為 0；剩下的 `linear-gradient`
    是透明 PNG 預覽的棋盤格、`radial-gradient` 是執行計畫畫布的 1px 點陣格線，兩者都是量測／
    對位用的圖樣而非裝飾漸層，已在文件中明列為唯二例外。
  - **修掉兩個「看起來像樣、其實沒有產生任何 CSS」的工具類**：`py-0.2`（7 處，Tailwind 沒有
    0.2 這一階，快選器的 kbd 標籤與側邊欄徽章因此完全沒有垂直內距）與 `w-4.5 h-4.5`（設定頁的
    表面色勾選標記沒有任何尺寸）。新增護欄測試會把所有 spacing／sizing 工具類對照 Tailwind
    真正的級距表，違規時列出檔案與類別名。
  - **最後的 PrimeVue 殘留清乾淨。** `:deep(.p-inputtext)`／`.p-select` 等 5 條死 CSS
    （TableFilterTab，該檔早已改用 SqInput／SqSelect）與 15 處 `var(--p-*)` 全部移除；
    那些讀取原本都 fallback 到 `#3b82f6`（Tailwind 藍），是系統裡唯一可能冒出「第二個操作藍」
    的地方。
  - **分頁類別色彩統一。** `utils/tabTheme.ts` 原本有 5 組飽和配色（每組 10 個 hex／rgba，
    含 active 背景 `#065f46`、`#155e75` 這種整塊色塊）＋淺色模式另一套 icon 色。現在每個類別只
    指向它圖示本來就在用的語意 token（`--color-accent` / `--color-ok` / `--color-structure` /
    `--color-plan` / `--color-er`）：活動分頁 = 畫布底 + 1px 邊 + 該類別的 2px 頂線，非活動分頁
    = 透明 + 細邊 + 次文字（深淺模式一致）。類別仍靠圖示字形與單一色相可分辨，而色相本身由
    `theme_contrast` 既有的 4.5:1 驗證負責，不再有兩套手挑色票。連線色覆寫與自訂 SQL 分頁色
    這兩個既有功能都保留。
  - 驗證：624 項測試（`tab_category_colors` 改寫為 token 契約、`theme_contrast` 改驗分頁底線
    對比）、`npm run typecheck`、`npm run build` 通過；產物 CSS 130.1 → 127.2 KB。
    截圖：`screens/tabs-light.png`、`screens/tabs-dark.png`（五種類別分頁 + 非 SQL 活動分頁）。

- **P7b PrimeVue 完全移除（2026-10-15）。完成「評估移除 PrimeVue」的最終狀態。**
  上一輪把 `var(--p-*)` 全部換掉之後做了一次查核，結果顯示設定裡的三個旋鈕已經**沒有作用**：
  `themePreset`（Aura／Lara／Nora／Material）、`primaryColor`（12 色）與 `ripple` 只餵給
  PrimeVue 的主題引擎，而全 App 已無任何讀取 `--p-*` 的地方、也無任何 PrimeVue 元件。
  留著無作用的設定比移除更糟——使用者改了「主要色彩」卻什麼都不會發生——所以移除屬於修錯，
  不是取捨。移除內容：
  - `themeManager`：拿掉 `@primevue/themes` 的 preset／palette 機制與 `ThemePresetName`、
    `PRIMARY_COLOR_OPTIONS`；保留 `colorMode`、全域字型這兩個真正由我們 token 驅動的設定。
    表面色盤其後再收斂為單一組 `DEFAULT_SURFACE = 'neutral'`（極簡純淨）：slate／gray／zinc／
    stone 四組色盤與外觀頁的色盤選擇器一併移除，規範中所有對比數字只需對這一組灰階負責。
  - `settingsStore`：移除 `themePreset`／`primaryColor`／`ripple` 與其 setter；`setLocale`
    不再需要 PrimeVue config。既有使用者存下來的舊值會被忽略（`loadSettings` 以預設值合併）。
  - `SettingsModal`：外觀頁移除 preset 卡、12 色主色盤與水波紋開關，只留語言、全域字型、
    深淺模式與即時預覽；選取態也拿掉 `ring-1`（規範不使用 box-shadow ring）。
  - `main.ts`：不再 `app.use(PrimeVue)`／`ConfirmationService`／`ripple` 指令。
    `ConfirmationService` 是死碼（`useConfirm` 0 使用點），`ripple` 只影響已不存在的 PrimeVue 元件。
  - 刪除 `src/i18n/primevue/{zh-TW,en}.ts` 與 `PrimeVue v4` 的介紹文字；
    `package.json` 移除 `primevue` 與 `@primevue/themes`。
  - 連線標籤色（`resolveConnectionLabelColor`）與自訂 SQL 分頁色仍保留，個人化沒有全部消失。
  **產物：主 JS 2,132 → 1,598 KB（gzip 562 → 476 KB）**，主要就是主題引擎與元件的份量；
  CSS 127.0  → 126.9 KB；`main.css` 已無任何 `.p-*` 選擇器。
  新增護欄：`src/` 不得再出現 `from 'primevue…'`、`package.json` 不得宣告 PrimeVue 套件、
  `main.css` 不得再出現 `.p-*` 規則。驗證：628 項測試、`npm run typecheck`、`npm run build` 通過。

- **P11 密度對齊與驗收清單（2026-10-15）。** 逐條核對 §13 的清單時，用 §5 的密度表對照實作，
  發現兩個真實落差：
  - **資料格列高是 28px，密度表承諾 24px。** 這是核心資料面，也是本簡報「以資料與操作效率為中心」
    最直接可量測的一條。三個檢視（資料、結構、結果）的 `rowHeight` 與 cell `line-height`
    一起改為 24px、表頭 30 → 28px；`grid_scroll_perf` 的「line-height 必須等於 rowHeight」
    斷言因此同時守住新的值。**實拍驗證：同樣高度下可見列數由 4 列增加到 5 列（+25%）。**
    12px 等寬字在 24px 列中仍有 2× 行距，`TRUE`／`FALSE` 標籤與 `NULL` 標籤都沒有被裁切。
  - **數字只有一處用 tabular figures。** 資料面本來就是等寬（數字自然對齊），但狀態列的 SPID／延遲、
    結果頁尾的列數／時長、以及兩條分頁列的計數都在 UI 字型裡，數值變動時會左右跳動。
    這四處加上 `tabular-nums`。
  - 密度表另外修正了兩列與實作不符的描述（分頁實際是 28px／活動 29px；訊息列是「標題列 24px +
    內容列」而非單列 24px），並補上檢視器子標題列 32px。
  - §13 的驗收清單全數逐條核對並標記，每一條都指向支撐它的測試或量測；順手修正清單裡過時的
    操作色數值（`#2E6F9E` → 實作的 `#2A6791`）。

- [x] 全站只有一個操作藍 `#2A6791`（及其 hover／tint）：`--color-accent` 與 `--color-info` 同色，
  破壞性動作用 `--color-danger`（§3 允許的語意色，非第二個主要操作色）。
  `minimal_ui_surfaces` 擋住 `text-*-400` 這類寫死色階，`theme_contrast` 驗證 4.5:1。
- [x] 淺色為預設：`settingsStore.DEFAULT_SETTINGS.colorMode = 'light'` 與 `index.html` 首繪腳本；
  畫布白、外框淺灰、深灰文字見 `main.css` 的 `:root`，深色為 `neutralizeRgb` 去飽和配對變體，
  兩態由 `theme_contrast` 逐階驗證。
- [x] 面板與工具列沒有任何陰影；陰影只出現在選單／對話框／tooltip／toast
  （`minimal_ui_surfaces` 只允許 `shadow-raised`／`shadow-overlay`，且灰階以外的畫布內容另列）。
- [x] 圓角只有 3／4／6px 三種；沒有膠囊按鈕（`minimal_ui_surfaces` 禁止 `rounded-sm/lg/xl/2xl/3xl`；
  `rounded-full` 僅保留給狀態點、頭像與 spinner）。
- [x] 數字使用 tabular figures 或等寬：資料格、訊息面板、SQL 預覽、IO 統計為等寬；
  狀態列／結果頁尾／分頁計數為 `tabular-nums`（兩者皆有 `minimal_ui_surfaces` 斷言）。
- [x] 資料列高 24px、控制項 24–32px、工具列 36px，符合 §5 密度表
  （`grid_scroll_perf` 綁定 `rowHeight` 與 cell line-height；`minimal_ui_primitives` 綁定按鈕高度）。
- [x] 訊息等級、連線狀態、欄位錯誤都有顏色以外的第二指示：訊息等級是語意色晶片 + 文字標籤
  （另有 `Msg`／`Line` 編號）、連線狀態為色點 + 文字、`TRUE`／`FALSE` 與 `NULL` 都有文字、
  `NULL` 另加斜體與虛線底。
- [x] 移除 PrimeIcons 後每個圖示都有等義的圖示（現為自製集 `@/components/icons`），
  且純圖示按鈕具備 `aria-label`。
- [x] focus 在淺色與深色都清楚可見：`outline: 2px solid rgb(var(--color-accent))`，而
  `--color-accent` 逐模式定義（`minimal_ui_primitives` 斷言 SqButton／SqInput 的 focus 規則）。
- [x] `prefers-reduced-motion: reduce` 下無位移／淡入動畫（`motion_accessibility`）。
- [x] 文案為繁體中文且 SQL／資料庫術語保留英文（見 §9 對照）；`zh-TW` 為預設字典，
  `i18n` 測試驗證兩語系鍵值對等。

> 以上每一條都由 `tests/` 內的原始碼契約測試或量測支撐，不是靠人工目視。唯一的視覺驗證是
> `screens/` 底下的 headless 截圖（本環境無法在瀏覽器內操作）。
