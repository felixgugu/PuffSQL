# 極簡改版設計包（minimal-ui 分支）

這個資料夾是「資料庫查詢軟體極簡風格 Web 介面」的設計交付物，對應分支 `minimal-ui`。

| 檔案 | 內容 |
|---|---|
| `SPEC.md` | **設計 source of truth**：色彩／字體／間距／圓角邊框陰影／元件規格／圖示／文案／動態／無障礙，含已驗證的對比數字。 |
| `PRIMEVUE-EVALUATION.md` | 「是否移除 PrimeVue 改用 Tailwind」的量化評估、選項比較、建議與分階段計畫。 |
| `preview.html` | 可互動的靜態樣張（單一檔案、無外部資源）：完整 App 外殼 + 元件樣張 + token 對比表。`#dark` 可看深色配對變體。 |
| `screens/preview-light.png`、`screens/preview-dark.png` | 樣張的渲染截圖（淺色／深色），供快速審閱。 |
| `../../design-system/puffsql/MASTER.md` | ui-ux-pro-max skill 產生的原始設計系統建議（保留備查；衝突時以 `SPEC.md` 為準）。 |

## 檢視方式

直接用瀏覽器開 `preview.html` 即可（不需要 dev server、不需要網路）。

重新產生截圖（Windows + Chrome）：

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --hide-scrollbars `
  --window-size=1500,1300 --screenshot="docs\design\minimal-ui\screens\preview-light.png" `
  "file:///G:/PuffSQL/docs/design/minimal-ui/preview.html"
# 深色：把網址改成 ...preview.html#dark，輸出檔名改成 preview-dark.png
```

## 設計決策摘要

- 淺色為預設：白畫布 + 淺灰外框 + 深灰文字；深色是配對變體（中性碳黑，非反相）。
- **單一操作藍 `#2E6F9E`**（低飽和鋼藍）：可操作訊號只有它，其餘一律中性灰。
- 層級靠 **1px 邊框 + 留白 + 字級**，不靠陰影；陰影只留給選單／對話框／tooltip／toast。
- 圓角只有 3／4／6px；無膠囊按鈕、無漸層、無玻璃、無裝飾插圖。
- 密度優先：控制項 24–32px、資料列 24px、工具列 36px、狀態列 24px；**不刪減任何既有資訊**。
- 介面繁體中文，SQL／資料庫術語保留英文；SQL 與資料值一律等寬字，數字 tabular-nums。

## 待你拍板（詳見 PRIMEVUE-EVALUATION.md §7）

1. **操作色**：採 SPEC 的 `#2E6F9E`（低飽和），或 skill 建議的 `#0369A1`（較鮮豔）。
2. **設定旋鈕**：是否同意「移除 4 個 PrimeVue preset、保留淺/深 + 中性表面色盤、固定操作色」。
3. **PrimeVue 去留**：是否同意 B 路線（先換葉節點元件與圖示，Dialog／Select／Menu／Toast 暫留 PrimeVue）。

## 下一步（拿到上面三個答案後）

依 `PRIMEVUE-EVALUATION.md` §5 的 P1 → P4 分階段實作：先落 token 層（`main.css` + `tailwind.config.js`），
再改外殼，再換圖示，最後逐個葉節點元件。每階段都跑 `npm test`（566 項）與 `npm run typecheck`，
並只提交該階段，確保任一階段可單獨回退。
