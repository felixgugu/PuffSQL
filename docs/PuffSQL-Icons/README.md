# PuffSQL Icons

112 個原創 SVG 線框圖示，依提供的完整清單與順序製作。

- 24 × 24 viewBox、2px 筆畫、圓角端點與轉角、currentColor。
- svg/：112 個獨立 SVG，檔名與程式使用名稱一致。
- preview.html：離線總覽，支援名稱搜尋與明暗切換。
- sprite.svg：以原名稱作為 symbol id 的 SVG sprite。
- icons.json + PuffIcon.tsx：React / TypeScript 介面，需專案啟用 resolveJsonModule。

```tsx
import { PuffIcon } from './PuffIcon';
<PuffIcon name="Database" size={20} style={{ color: '#6366f1' }} />
```

獨立 SVG 建議 inline 使用以繼承 currentColor；以 img 載入時，無法繼承外部 CSS color。

```html
<svg width="24" height="24" aria-hidden="true"><use href="./sprite.svg#Database" /></svg>
```

圖示按鈕請在按鈕上提供 aria-label。Loader2 僅提供靜態圖形，可在應用程式中加入 CSS rotate 動畫並尊重 prefers-reduced-motion。

別名：AlertTriangle = TriangleAlert；PlusCircle = CirclePlus；Cog = Settings。其餘名稱保留個別圖形，包括 Pencil / Edit3、RefreshCw / RotateCw。
SquarePlus / SquareMinus 依名稱繪製為加減方框；若用於最大化與還原，需在應用程式提供對應提示文字。

本組為自行繪製的幾何圖示，並非 Lucide 官方套件。可自由用於 PuffSQL、修改與散布。
