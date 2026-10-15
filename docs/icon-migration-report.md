# 圖示集對照與更換報告 (Icon Migration Report)

> 對象：`docs/PuffSQL-Icons`（自製集）取代原本的 `lucide-vue-next`。執行日期 2026-10-15。

## 1. 結論

**112 / 112 全數對應，零缺口。** 原 lucide 名稱與自製集檔名一對一，沒有「程式用到但圖集沒有」的圖示，也沒有圖集多出來的檔案，因此直接完成切換並移除 `lucide-vue-next` 依賴。

| 項目 | 數值 |
| :--- | :--- |
| 程式使用的 distinct 圖示 | 112（40 個檔案、429 處引用） |
| 自製集 SVG 檔數 | 112（`docs/PuffSQL-Icons/svg`） |
| 缺口（程式有、圖集缺） | 0 |
| 圖集多出未使用（品牌 logo 等） | 0 |
| 生成的 Vue 元件 | 112 + `index.ts`（`src/components/icons`） |

## 2. 來源集規格檢查

112 個檔案的根 `<svg>` 標籤完全相同（僅一種寫法），規格與應用需求一致，不需要風格轉換：

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
     fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
```

- 24 × 24 viewBox、2px 筆畫、圓角端點與轉角、`currentColor`（與切換前的實際渲染一致，因此視覺重量不變）。
- 無 `<linearGradient>`／`<clipPath>` 之類需要 `id` 的節點，也沒有任何硬編色（`#hex`、`rgb()`）。
- 說明：SPEC §8 舊文寫「描邊固定 1.75px」，但 lucide 元件實際以預設 2px 渲染；本次以來源圖的 2px 為準，SPEC §8 已同步更正。

## 3. 別名與重複圖形

- **完全相同（byte-identical）**：`AlertTriangle` / `TriangleAlert`、`PlusCircle` / `CirclePlus`、`Cog` / `Settings`。程式兩邊都有使用，各自生成元件，切換後不會出現語意分歧。
- **名稱相近但圖形不同**：`Pencil` / `Edit3`、`RefreshCw` / `RotateCw`、`SquarePlus` / `SquareMinus`（後兩者依名稱畫成加減方框，程式用於「最大化／還原」結果網格，語意由 `results.maximizeGrid`／`results.restoreGrid` 的 tooltip 承擔）。
- `Loader2` 為靜態圖形；載入中的旋轉由 `SqButton` 的 `.sq-btn__spinner` CSS 類別負責，並在 `prefers-reduced-motion: reduce` 時關閉，與圖示來源無關。

## 4. 生成方式與護欄

- `npm run icons:build`：由 `scripts/build-icons.mjs` 讀 `docs/PuffSQL-Icons/svg/*.svg`，輸出 `src/components/icons/<Name>.vue` 與 `index.ts`（生成物進版控）。
- `npm run icons:check`：驗證版控中的生成物與來源一致（不一致時以非零碼結束）。
- 轉換內容：移除固定 `width`/`height`（尺寸交給呼叫端的 Tailwind class）、固定 `viewBox="0 0 24 24"`（非 24 的來源會包一層 `<g transform>` 縮放）、所有顏色轉 `currentColor`、`id` 與 `url(#…)` 加 `puffsql-<名稱>-` 前綴避免同頁多實例衝突。
- 護欄測試：`tests/icon_codegen.test.ts`（生成器單元測試）、`tests/icon_set.test.ts`（不得再匯入第三方圖示套件、index 與資料夾一致、每個元件留在 24×24 格線且無硬編色、生成物與來源同步）。

## 5. 未處理範圍

- 第三方套件內建圖示：Monaco（右鍵選單、code lens）、AntV X6（ER 畫布控制）、Tabulator（排序 caret 等）維持原樣。
- `WindowControls.vue` 的 4 個自繪視窗控制 SVG 維持原樣。
- `docs/PuffSQL-Icons` 內另外附的 `sprite.svg`、`icons.json`、`PuffIcon.tsx`、`preview.html` 為設計交付物，未接入應用程式。

## 6. 驗收紀錄

- `npm test`：664 個通過（新增 `icon_codegen` 8 項、`icon_set` 5 項）。
- `npm run typecheck`、`npm run build`、`npm run icons:check`：通過。
- 視覺核對（既有 harness × 深淺色）：標題列、SQL 編輯工具列三條分段、物件總管、結果工具列與複製分段條、設定對話框。

## 7. 授權

依 `docs/PuffSQL-Icons/README.md`：本組為自行繪製的幾何圖示，非 Lucide 官方套件，可自由用於 PuffSQL、修改與散布。
