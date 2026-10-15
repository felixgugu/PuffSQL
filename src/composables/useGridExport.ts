import { ref, type Ref } from 'vue';
import type { ColumnDef, CellValue } from '@/types/query';
import { exportRowAsJson, exportRowsAsJson, exportRowsAsMarkdown } from '@/utils/exportFormatters';
import { formatCellForExport } from '@/composables/useColumnAutoWidth';
import type { UseGridSelectionReturn } from '@/composables/useGridSelection';
import { readCellValue } from '@/composables/useGridSelection';

export interface UseGridExportOptions {
  getRows: () => CellValue[][];
  getColumns: () => ColumnDef[];
  selection: UseGridSelectionReturn;
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error', duration?: number) => void;
  onMenuClose?: () => void;
}

export interface UseGridExportReturn {
  copiedTsv: Ref<boolean>;
  copiedCsv: Ref<boolean>;
  copiedJson: Ref<boolean>;
  copiedMd: Ref<boolean>;
  copyCellValue: (value: unknown) => void;
  copyColumnName: (name: string) => void;
  copyCurrentRow: (row: CellValue[] | null | undefined) => void;
  copyCurrentRowAsJson: (columns: ColumnDef[], row: CellValue[] | null | undefined) => void;
  copySelectedCells: () => void;
  copySelectedAsJson: () => void;
  copyAsTsv: () => void;
  copyAsCsv: () => void;
  copyAsJson: () => void;
  copyAsMarkdown: () => void;
}

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function useGridExport(options: UseGridExportOptions): UseGridExportReturn {
  const copiedTsv = ref(false);
  const copiedCsv = ref(false);
  const copiedJson = ref(false);
  const copiedMd = ref(false);

  /** The toolbar segments flash their label for two seconds after a successful copy. */
  function flashCopied(flag: Ref<boolean>) {
    flag.value = true;
    setTimeout(() => {
      flag.value = false;
    }, 2000);
  }

  function copyCellValue(value: unknown) {
    if (value !== null && value !== undefined) {
      navigator.clipboard.writeText(String(value));
    } else {
      navigator.clipboard.writeText('NULL');
    }
    options.onMenuClose?.();
  }

  function copyColumnName(name: string) {
    const text = (name ?? '').trim();
    if (!text) {
      options.showToast('無法取得欄位名稱', 'warning', 2000);
      options.onMenuClose?.();
      return;
    }
    navigator.clipboard.writeText(text);
    options.showToast(`已複製欄位名稱「${text}」至剪貼簿`, 'success', 2000);
    options.onMenuClose?.();
  }

  function copyCurrentRow(row: CellValue[] | null | undefined) {
    if (row && row.length > 0) {
      const rowStr = row.map(formatCellForExport).join('\t');
      navigator.clipboard.writeText(rowStr);
      options.showToast('已複製整列資料至剪貼簿 (TSV)', 'success', 2000);
    } else {
      options.showToast('查無資料列可供複製 (0 筆)', 'info', 2000);
    }
    options.onMenuClose?.();
  }

  function copyCurrentRowAsJson(columns: ColumnDef[], row: CellValue[] | null | undefined) {
    if (row && row.length > 0) {
      const jsonStr = exportRowAsJson(columns, row);
      navigator.clipboard.writeText(jsonStr);
      options.showToast('已複製目前列為 JSON 物件', 'success', 2000);
    } else {
      options.showToast('查無資料列可供複製 (0 筆)', 'info', 2000);
    }
    options.onMenuClose?.();
  }

  function copySelectedCells() {
    const rows = options.getRows();
    if (!rows.length) {
      options.showToast('查無資料可供選取與複製 (0 筆)', 'info', 2000);
      return;
    }

    const blocks = options.selection.getSelectionBlocks();
    if (blocks.length === 0) {
      options.showToast('尚未選取任何儲存格', 'warning', 2000);
      return;
    }

    const lines: string[] = [];
    let copiedCells = 0;

    blocks.forEach((block, blockIndex) => {
      if (blockIndex > 0) lines.push('');
      if (block.coversAllRows) {
        lines.push(block.columns.map((column) => column.title).join('\t'));
      }
      for (const row of block.rows) {
        const values = block.columns.map((column) =>
          formatCellForExport(readCellValue(row, column.field))
        );
        copiedCells += values.length;
        lines.push(values.join('\t'));
      }
    });

    navigator.clipboard.writeText(lines.join('\n'));
    options.showToast(`已複製選取內容 (${copiedCells.toLocaleString()} 格) 至剪貼簿`, 'success', 2000);
    options.onMenuClose?.();
  }

  function copySelectedAsJson() {
    const rows = options.getRows();
    if (!rows.length) {
      options.showToast('查無資料可供選取與複製 (0 筆)', 'info', 2000);
      return;
    }

    const blocks = options.selection.getSelectionBlocks();
    if (blocks.length === 0) {
      options.showToast('尚未選取任何儲存格', 'warning', 2000);
      return;
    }

    const parts: string[] = [];
    let rowTotal = 0;
    let columnTotal = 0;

    for (const block of blocks) {
      const cols = block.columns.map((column) => ({ name: column.title }));
      const rowsData = block.rows.map((row) =>
        block.columns.map((column) => readCellValue(row, column.field))
      );
      parts.push(exportRowsAsJson(cols, rowsData));
      rowTotal += rowsData.length;
      columnTotal = Math.max(columnTotal, cols.length);
    }

    navigator.clipboard.writeText(parts.join('\n'));
    options.showToast(`已複製選取為 JSON (${rowTotal} 列 x ${columnTotal} 欄)`, 'success', 2000);
    options.onMenuClose?.();
  }

  function copyAsTsv() {
    const rows = options.getRows();
    const columns = options.getColumns();
    if (!rows.length) {
      options.showToast('查無資料可供複製 (0 筆)', 'info', 2000);
      options.onMenuClose?.();
      return;
    }
    const visualIndices = options.selection.getVisualDataColIndices();
    const headers = visualIndices.map((cIdx) => columns[cIdx]?.name || '').join('\t');
    const rowsText = rows
      .map((row) => visualIndices.map((cIdx) => formatCellForExport(row[cIdx])).join('\t'))
      .join('\n');
    const fullText = `${headers}\n${rowsText}`;

    navigator.clipboard.writeText(fullText).then(() => {
      options.showToast(`已複製全表為 TSV (${rows.length} 筆)`, 'success', 2000);
      flashCopied(copiedTsv);
    });
    options.onMenuClose?.();
  }

  function copyAsCsv() {
    const rows = options.getRows();
    const columns = options.getColumns();
    if (!rows.length) {
      options.showToast('查無資料可供複製 (0 筆)', 'info', 2000);
      options.onMenuClose?.();
      return;
    }
    const visualIndices = options.selection.getVisualDataColIndices();
    const headers = visualIndices.map((cIdx) => escapeCsv(columns[cIdx]?.name || '')).join(',');
    const rowsText = rows
      .map((row) => visualIndices.map((cIdx) => escapeCsv(formatCellForExport(row[cIdx]))).join(','))
      .join('\n');
    const fullText = `${headers}\n${rowsText}`;

    navigator.clipboard.writeText(fullText).then(() => {
      options.showToast(`已複製全表為 CSV (${rows.length} 筆)`, 'success', 2000);
      flashCopied(copiedCsv);
    });
    options.onMenuClose?.();
  }

  function copyAsJson() {
    const rows = options.getRows();
    const columns = options.getColumns();
    if (!rows.length) {
      options.showToast('查無資料可供複製 (0 筆)', 'info', 2000);
      options.onMenuClose?.();
      return;
    }
    const visualIndices = options.selection.getVisualDataColIndices();
    const cols = visualIndices.map((cIdx) => ({ name: columns[cIdx]?.name || '' }));
    const rowsData = rows.map((r) => visualIndices.map((cIdx) => r[cIdx]));
    const jsonStr = exportRowsAsJson(cols, rowsData);
    navigator.clipboard.writeText(jsonStr).then(() => {
      options.showToast(`已複製全表為 JSON 物件陣列 (${rows.length} 筆)`, 'success', 2000);
      flashCopied(copiedJson);
    });
    options.onMenuClose?.();
  }

  function copyAsMarkdown() {
    const rows = options.getRows();
    const columns = options.getColumns();
    if (!rows.length) {
      options.showToast('查無資料可供複製 (0 筆)', 'info', 2000);
      options.onMenuClose?.();
      return;
    }
    const visualIndices = options.selection.getVisualDataColIndices();
    const cols = visualIndices.map((cIdx) => ({ name: columns[cIdx]?.name || '' }));
    const rowsData = rows.map((r) => visualIndices.map((cIdx) => r[cIdx]));
    const mdStr = exportRowsAsMarkdown(cols, rowsData);
    navigator.clipboard.writeText(mdStr).then(() => {
      options.showToast('已複製全表為 Markdown 表格', 'success', 2000);
      flashCopied(copiedMd);
    });
    options.onMenuClose?.();
  }

  return {
    copiedTsv,
    copiedCsv,
    copiedJson,
    copiedMd,
    copyCellValue,
    copyColumnName,
    copyCurrentRow,
    copyCurrentRowAsJson,
    copySelectedCells,
    copySelectedAsJson,
    copyAsTsv,
    copyAsCsv,
    copyAsJson,
    copyAsMarkdown,
  };
}
