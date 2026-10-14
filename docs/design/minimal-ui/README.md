# 極簡改版設計包（minimal-ui 分支）

這個資料夾是「資料庫查詢軟體極簡風格 Web 介面」的設計交付物，對應分支 `minimal-ui`。

| 檔案 | 內容 |
|---|---|
| `SPEC.md` | **設計 source of truth**：色彩／字體／間距／圓角邊框陰影／元件規格／圖示／文案／動態／無障礙，含已驗證的對比數字。 |
| `PRIMEVUE-EVALUATION.md` | 「是否移除 PrimeVue 改用 Tailwind」的量化評估、選項比較、建議與分階段計畫。 |
| `preview.html` | 可互動的靜態樣張（單一檔案、無外部資源）：完整 App 外殼 + 元件樣張 + token 對比表。`#dark` 可看深色配對變體。 |
| `screens/preview-light.png`、`screens/preview-dark.png` | 樣張的渲染截圖（淺色／深色），供快速審閱。 |
| `screens/dialog-light.png`、`screens/dialog-dark.png`、`screens/dialog-overlay.png` | `SqDialog` 的真實渲染截圖：外框變體、語意強調外框、既有呼叫端元件（淺色／深色），以及疊在真實遮罩上的樣子。 |
| `screens/toast-light.png` | `SqToast` 的真實渲染截圖：四種語意色同時堆疊的樣子。 |
| `screens/tabs-light.png`、`screens/tabs-dark.png` | 五種類別的工作區分頁列（淺色／深色）：中性外框 + 活動分頁的類別頂線，並含一個非 SQL 的活動分頁。 |
| `screens/settings-appearance.png` | 設定對話框的外觀頁：語言、全域字型、深淺模式、中性表面色盤與即時預覽。 |
| `screens/dialog-connection.png` | 連線設定對話框：三張分組卡片、無陰影、1px 邊、6px 圓角（用來核對「避免過多卡片」這條）。 |
| `screens/workspace-results.png`、`screens/workspace-results-dark.png` | **真實執行過的查詢結果**（淺色／深色）：8 列 × 7 欄、24px 資料列、等寬資料值、`TRUE`／`FALSE` 與 `NULL` 的圖示化呈現、結果工具列與頁尾統計。 |
| `screens/panel-messages.png`、`screens/panel-history.png` | 執行訊息（等級晶片 + `Msg`／`Line` 編號）與查詢歷程（`[#n] [時間] 時長 筆數 資料庫` + SQL）——產品用途「檢視結果」與「追蹤查詢紀錄」的直接證據。 |
| `../../design-system/puffsql/MASTER.md` | ui-ux-pro-max skill 產生的原始設計系統建議（保留備查；衝突時以 `SPEC.md` 為準）。 |

## 檢視方式

### ui-ux-pro-max skill 使用紀錄

本設計由 `ui-ux-pro-max` skill 驅動（`G:/PuffSQL/.agents/skills/ui-ux-pro-max/SKILL.md`，
以 `python .agents/skills/ui-ux-pro-max/scripts/search.py` 呼叫）。skill 查詢與其造成的決定：

| skill 查詢 | 得到的指引 | 落實在哪裡 |
|---|---|---|
| `"minimalism density technical tool" --domain style` | Minimalism & Swiss Style：`text contrast measured`、`no unnecessary decorations`、`no box-shadow unless necessary`、`--accent-color: single primary only` | SPEC §3／§6 與 P1 token 層；單一操作藍 |
| `"blur purpose background dismissal" --domain style` | Glassmorphism 是**另一個**風格類別，需要「vibrant background」才成立；本產品是白／淺灰底 | P10：15 處 `backdrop-blur*` 全部移除 |
| `"glassmorphism blur decoration" --domain ux` | 回傳「Inline Validation」，與查詢意圖不符 | 依 skill 的 Query Contract **重試一次**改走 `style` 領域；仍不採用該結果，改用 skill 的 `blur-purpose`／`surface-readability` 規則 |
| 內建 Quick Reference §4 | `blur-purpose`（模糊只表示背景可關閉）、`primary-action`（一畫面一個主要 CTA）、`elevation-consistent`、`icon-style-consistent`、`effects-match-style` | P10 玻璃移除、分頁色彩統一、P9 兩個陰影 token、lucide 單一圖示家族 |
| 內建 Quick Reference §6 | `color-semantic`（語意 token，不在元件內寫死色票）、`number-tabular`、`line-height` | P9／P10 把 hex 收斂到 token；資料欄 tabular-nums |
| 內建 Quick Reference §1 | `color-contrast` 4.5:1、`focus-states`、`aria-labels`、`color-not-only`、`reduced-motion` | SPEC §11 與 `theme_contrast`／`motion_accessibility` 護欄 |
| 內建 Pre-Delivery Checklist「Layout」 | `4/8dp spacing rhythm` | P10 的級距護欄測試（並修掉 `py-0.2`、`w-4.5` 這兩個不存在的級距） |

skill 產生的完整設計系統原始輸出保留在 `design-system/puffsql/MASTER.md`；與本 SPEC 衝突時以
SPEC 為準，每條偏離都附理由（SPEC §12）。

直接用瀏覽器開 `preview.html` 即可（不需要 dev server、不需要網路）。

重新產生截圖（Windows + Chrome）：

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --hide-scrollbars `
  --window-size=1500,1300 --screenshot="docs\design\minimal-ui\screens\preview-light.png" `
  "file:///G:/PuffSQL/docs/design/minimal-ui/preview.html"
# 深色：把網址改成 ...preview.html#dark，輸出檔名改成 preview-dark.png
```

對話框、通知與提示的截圖另外用 `harness/dialog.html` 拍攝。它是一個 dev-only 的檢查頁，
掛載的是**真實的** `SqDialog`、`SqToast` 與呼叫端元件（不是示意圖），輸出仍寫到已 gitignore 的
`.design-preview/`：

```powershell
npm run dev   # 另一個視窗
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --hide-scrollbars `
  --user-data-dir=".design-preview\chrome" --virtual-time-budget=20000 --run-all-compositor-stages-before-draw `
  --window-size=1120,1830 `
  --screenshot="docs\design\minimal-ui\screens\dialog-light.png" `
  "http://localhost:1420/docs/design/minimal-ui/harness/dialog.html"
# #dark 為深色、#overlay 為真實遮罩、#pair/#window/#debug 為單一對話框與拖曳縮放整合的檢查視圖，
# #toast 為通知堆疊、#tooltip 以合成 hover 觸發真實提示
# #settings 為設定對話框、#connection 為連線對話框

# 工作區（含真實查詢結果）：workspace.html 在 iframe 內啟動真正的 App，送出 Ctrl+Enter 的
# keydown 讓它執行 seeded 的 SELECT，再把下方面板切到 ?tab=（results | messages | history | stats）
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --hide-scrollbars `
  --user-data-dir=".design-preview\ws" --virtual-time-budget=25000 --run-all-compositor-stages-before-draw `
  --window-size=1500,900 --screenshot="docs\design\minimal-ui\screens\workspace-results.png" `
  "http://localhost:1420/docs/design/minimal-ui/harness/workspace.html?tab=results"
# 深色：網址加上 &dark=1

# 分頁列：tabs.html 會寫入五種類別的分頁並可指定活動分頁（#sql_editor | #data | #struct | #plan | #er，
# 加 -dark 走深色）
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --hide-scrollbars `
  --user-data-dir=".design-preview\tabs" --virtual-time-budget=20000 --run-all-compositor-stages-before-draw `
  --window-size=1500,420 --screenshot="docs\design\minimal-ui\screens\tabs-light.png" `
  "http://localhost:1420/docs/design/minimal-ui/harness/tabs.html#data"
```

## 設計決策摘要

- 淺色為預設：白畫布 + 淺灰外框 + 深灰文字；深色是配對變體（中性碳黑，非反相）。
- **單一操作藍 `#2E6F9E`**（低飽和鋼藍）：可操作訊號只有它，其餘一律中性灰。
- 層級靠 **1px 邊框 + 留白 + 字級**，不靠陰影；陰影只留給選單／對話框／tooltip／toast。
- 圓角只有 3／4／6px；無膠囊按鈕、無漸層、無玻璃、無裝飾插圖。
- 密度優先：控制項 24–32px、資料列 24px、工具列 36px、狀態列 24px；**不刪減任何既有資訊**。
- 介面繁體中文，SQL／資料庫術語保留英文；SQL 與資料值一律等寬字，數字 tabular-nums。

## 進度與未定事項（詳見 PRIMEVUE-EVALUATION.md §5、§7）

**全部完成。** P1 token 層、P2 外殼、P3 圖示、P4 葉節點元件、P5 浮層元件、P6 Tooltip、
P7 Toast、P7b 主題與套件、P8 PrimeIcons、P9 表面收斂、P10 玻璃／漸層／級距。
`primevue` 與 `@primevue/themes` 已從 `package.json` 移除，`src/` 內 0 匯入，
`main.css` 內 0 條 `.p-*` 規則；主 JS 由 2.64 MB 降到 1,598 KB。量化前後對照見
`PRIMEVUE-EVALUATION.md` §9。

需要你決定的只剩一項：**設定裡是否保留 PrimeVue 的 theme preset／主色旋鈕**。
保留就等於允許第二個操作色，與「單一低飽和藍」的規範衝突；移除則可讓淺／深 + 中性表面色盤
成為唯一的外觀選項（詳見 §7）。
