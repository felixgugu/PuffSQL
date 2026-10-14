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

| 角色 | Token | Hex | 三元組 | 用途 |
|---|---|---|---|---|
| 畫布 | `--surface-canvas` | `#FFFFFF` | `255 255 255` | SQL 編輯器、結果資料格、主工作區 |
| 外框 | `--surface-chrome` | `#F7F8FA` | `247 248 250` | 標題列、側邊欄、工具列、狀態列 |
| 面板 | `--surface-panel` | `#FAFAFB` | `250 250 251` | 面板表頭、分頁列底、斑馬列 |
| 停留 | `--surface-hover` | `#F1F3F5` | `241 243 245` | hover 底色 |
| 選取 | `--surface-active` | `#EAEFF4` | `234 239 244` | 選取列、目前分頁、目前樹節點 |
| 內凹 | `--surface-well` | `#F3F4F6` | `243 244 246` | 內縮井、程式碼預覽底 |
| 浮起 | `--surface-raised` | `#FFFFFF` | `255 255 255` | 選單、對話框、tooltip、popover |
| 細線 | `--border-hairline` | `#E5E8EC` | `229 232 236` | 面板分隔、表格橫線（裝飾用） |
| 控制邊 | `--border-control` | `#C6CCD6` | `198 204 214` | 輸入框／下拉／外框按鈕邊界（滑過 `#AAB2C0`） |
| 強調邊 | `--border-strong` | `#98A2B3` | `152 162 179` | 拖曳目標、需要更明顯的邊界 |
| 主文字 | `--text-primary` | `#15181D` | `21 24 29` | 標題、儲存格數值、目前選項 |
| 次文字 | `--text-secondary` | `#454C57` | `69 76 87` | 一般說明、未選中分頁 |
| 弱文字 | `--text-muted` | `#616B7A` | `97 107 122` | 佔位字、單位、時間戳、次要標籤 |
| 操作色 | `--accent` | `#2E6F9E` | `46 111 158` | 主要按鈕、focus、選取文字與圖示、連結 |
| 操作色(停) | `--accent-hover` | `#275F88` | `39 95 136` | 主要按鈕 hover／按下 |
| 操作色(底) | `--accent-tint` | `rgba(46,111,158,.10)` | — | 選取底、目前節點底（按下 `.16`） |
| 危險 | `--danger` | `#B42318` | `180 35 24` | 錯誤訊息、破壞性動作 |
| 警告 | `--warn` | `#B54708` | `181 71 8` | 警告訊息、資料截斷 |
| 成功 | `--ok` | `#027A48` | `2 122 72` | 連線成功、執行成功 |
| 計畫 | `--plan` | `#6941C6` | `105 65 198` | 執行計畫相關標記 |
| ER／結構 | `--er` / `--structure` | `#0E7090` / `#3538CD` | — | ER 圖與結構分頁的識別色（僅小面積） |

**已驗證對比（淺色）**：主文字 17.8:1、次文字 8.7:1、弱文字 4.83:1（於畫布）／4.66:1（於最深
互動面 `#EAEFF4`）；`--accent` 於畫布 5.41:1、白字於 `--accent` 填色 5.41:1；危險 6.57:1、
警告 5.43:1、成功 5.41:1、計畫 6.62:1（皆 ≥ 4.5:1）。

**邊界對比（淺色，非文字）**：`--border-control` 1.61:1、`--border-hairline` 1.17:1（裝飾線，
不承載操作語意，符合 WCAG 1.4.11 的豁免）；focus 指示為 `--accent` 2px，對畫布 5.41:1（> 3:1 ✓）。
若日後要求輸入框邊界也達 3:1，把 `--border-control` 換成 `#8A94A6`（畫布 3.06:1）即可，其餘不需動。

### 3.2 深色（配對變體，非反相）

深色沿用同一組角色名稱，只換值；底色改為中性碳黑（不使用藍色調底色），邊框必須比所在表面更亮。

| 角色 | Hex | 三元組 |
|---|---|---|
| `--surface-canvas` | `#16181C` | `22 24 28` |
| `--surface-chrome` | `#1C1F24` | `28 31 36` |
| `--surface-panel` | `#22252B` | `34 37 43` |
| `--surface-hover` | `#282C33` | `40 44 51` |
| `--surface-active` | `#2F343C` | `47 52 60` |
| `--surface-raised` | `#24272E` | `36 39 46` |
| `--border-hairline` | `#303640` | `48 54 64` |
| `--border-control` | `#3D4450` | `61 68 80` |
| `--border-strong` | `#4E5665` | `78 86 101` |
| `--text-primary` | `#F2F4F7` | `242 244 247` |
| `--text-secondary` | `#C3C9D2` | `195 201 210` |
| `--text-muted` | `#98A1AE` | `152 161 174` |
| `--accent`（文字／圖示） | `#8CB8DA` | `140 184 218` |
| `--accent`（填色，白字） | `#2E6F9E` | `46 111 158` |
| `--danger` / `--warn` / `--ok` | `#F97066` / `#FDB022` / `#47CD89` | — |
| `--plan` / `--er` / `--structure` | `#B692F6` / `#67E3F9` / `#A4BCFD` | — |

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
| 分頁列（SQL 分頁、結果分頁） | 30px |
| 控制項（sm / md / lg） | 24 / 28 / 32px |
| 資料格表頭 / 資料列 | 28 / 24px |
| 樹狀節點 / 訊息列 | 24px |
| 狀態列 | 24px |
| 對話框表頭 / 頁尾 | 40 / 48px |

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
- **分頁**：活動分頁 = 畫布白底 + 上／左／右 1px，文字 `--text-primary`；非活動 = 透明 + 次文字，
  hover `--surface-hover`；關閉鈕只在 hover 或活動時出現。結果分頁為同語言的緊湊版本（含釘選圖示）。
- **樹狀（物件總管）**：列高 24px、縮排 12px/層、展開箭頭 12px；選取 = `--accent-tint` + `--accent` 文字
  （不加左側色條）；右側顯示物件型別與筆數於 `--text-muted`。
- **資料格**：表頭 28px（`--surface-chrome`、1px 下緣、可排序則顯示 caret）、列高 24px、
  儲存格左右 6px；斑馬列 `--surface-panel`、hover `--surface-hover`、選取 `--accent-tint`；
  僅有橫向 1px 分隔線（固定 `#` 欄右側例外）；數值右對齊 + tabular-nums；`NULL` 為斜體 `--text-muted`
  加虛線底；釘選欄右側 1px `--border-control`。
- **訊息列**：24px、等寬 12px；等級以 **4px 左側色條 + 圖示 + 文字** 三重表示（不可只靠顏色）；
  剛執行的訊息以 `--accent-tint` 淡入淡出（沿用現行 3 秒暫態高亮，顏色改綁 `--accent`）。
- **對話框**：白底、圓角 6、1px 邊、`--shadow-overlay`、遮罩 `rgba(16,24,40,.32)`（**不使用模糊**）；
  表頭 40px + 標題 14px/600 + 右上關閉；頁尾右對齊「文字鈕 + 主要鈕」，破壞性動作在左並用 `--danger`。
- **Tooltip**：`#1F2328` 底、`#F2F4F7` 字、11px、圓角 4、延遲 400ms。
- **Toast**：白底卡片 + 3px 左側語意色條 + `--shadow-raised`，12px 文字，3–4 秒自動消失。
- **狀態列**：24px、`--surface-chrome`、12px `--text-muted`，區段以 1px 細線分隔，數字用等寬。
- **空狀態**：16px 圖示 + 12px 說明 + 選用文字鈕；不使用插圖。

---

## 8. 圖示

改用 **lucide-vue-next**（已是專案依賴、SVG、可 tree-shake）：描邊固定 1.75px、色沿用文字色；
尺寸 token `12 / 14 / 16 / 20`。**移除 PrimeIcons 字型**（現有 335 處 `pi pi-*` 用法與 4 個字型檔
共約 284KB；理由與成本見 PRIMEVUE-EVALUATION.md）。裝飾性圖示加 `aria-hidden="true"`，
純圖示控制項必須有 `aria-label` 與狀態（`aria-pressed` / `aria-expanded`）。

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
| Accent `#0369A1`（高飽和藍） | `#2E6F9E`（鋼藍） | 使用者要求「單一低飽和藍色」；同色相降低飽和 5.4:1 仍合規 |
| 按鈕 padding 12/24、圓角 8、hover `translateY(-1px)` | 高度 28、內距 10、圓角 4、hover 換底色 | 桌面密集工具；位移 hover 會造成掃視抖動 |
| 卡片圓角 12 + `--shadow-md` + hover 放大 | 面板無圓角裝飾、無陰影、只有 1px 邊 | 使用者要求避免過多卡片與陰影 |
| Modal `backdrop-filter: blur(4px)` | 遮罩純色 `rgba(16,24,40,.32)` | 使用者要求避免玻璃效果 |
| Hero／CTA 版型與 Scroll Reveal | 不適用 | 這是工具型 App 外殼，沒有行銷頁與捲動敘事 |
| `--space-*` 8/12/16 為主的寬鬆間距 | 2/4/6/8/12 為主 | 密度 9/10 與資料格 24px 列高的需求 |

保留自 MASTER.md／skill 的部分：Minimalism & Swiss Style 風格定位、Inter 為介面字、
對比 ≥4.5:1、可見 focus、150–300ms 級動態、禁 emoji 圖示、禁用圖示字型改 SVG。

---

## 13. 驗收清單（實作後逐項核對）

- [ ] 全站只有一個操作藍 `#2E6F9E`（及其 hover／tint），沒有第二個彩色 CTA。
- [ ] 淺色為預設：畫布白、外框淺灰、深灰文字；深色為配對變體且對比另行驗證。
- [ ] 面板與工具列沒有任何陰影；陰影只出現在選單／對話框／tooltip／toast。
- [ ] 圓角只有 3／4／6px 三種；沒有膠囊按鈕。
- [ ] 所有數字欄位使用 tabular-nums；SQL 與資料值使用等寬字。
- [ ] 資料列高 24px、控制項 24–32px、工具列 36px，符合密度表。
- [ ] 訊息等級、連線狀態、欄位錯誤都有顏色以外的第二指示。
- [ ] 移除 PrimeIcons 後每個圖示都有等義的 lucide 圖示，且純圖示按鈕具備 `aria-label`。
- [ ] focus 在淺色與深色都清楚可見（2px `--accent`）。
- [ ] `prefers-reduced-motion: reduce` 下無位移／淡入動畫。
- [ ] 文案為繁體中文且 SQL／資料庫術語保留英文（見 §9 對照）。
