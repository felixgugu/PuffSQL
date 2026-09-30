/**
 * Shared helpers for the three Tabulator grids.
 *
 * Everything here is a pure function (or a factory returning pure render callbacks) so the
 * editing/formatting rules can be unit tested without a browser, matching the project rule that
 * `utils/` stays free of Vue and IPC dependencies.
 *
 * Row data mapping: Tabulator is fed raw positional arrays, so a column for source index `n`
 * must use `field: "n"`. Numeric fields cannot be used because Tabulator's `_setFlatData` guards
 * on a truthy field name and would silently drop writes for `field: 0`.
 */

import type {
  TabulatorCellComponent,
  TabulatorColumnDefinition,
  TabulatorEditor,
  TabulatorFormatter,
} from 'tabulator-tables';
import type { CellValue, ColumnDef } from '@/types/query';
import { formatValueForDisplay } from '@/composables/useColumnAutoWidth';

/** Field backing the frozen `#` row-number column; never part of a data column range. */
export const ROW_INDEX_FIELD = '__sqlight_row';

const TEXT_TYPES = ['varchar', 'nvarchar', 'char', 'nchar', 'text', 'ntext'];
const NUMERIC_TYPES = ['int', 'bigint', 'smallint', 'tinyint', 'numeric', 'decimal', 'float', 'real'];
const BOOLEAN_TYPES = ['bit', 'boolean'];

export function fieldForColumnIndex(index: number): string {
  return String(index);
}

/** Resolves a Tabulator field back to the source column index, `undefined` for non data columns. */
export function columnIndexFromField(field: string | null | undefined): number | undefined {
  if (!field) return undefined;
  const index = Number(field);
  if (!Number.isInteger(index) || index < 0) return undefined;
  return index;
}

export function isBinaryCellValue(
  value: unknown
): value is { type: 'binary'; length?: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as { type?: unknown }).type === 'binary'
  );
}

/** Tooltip text mirrors the previous grid tooltips (`NULL`, `TRUE`, `[Binary n Bytes]`). */
export function cellTooltipText(value: CellValue): string {
  if (value === null || value === undefined) return 'NULL';
  if (isBinaryCellValue(value)) return `[Binary ${value.length ?? 0} Bytes]`;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

/**
 * Cells keep their own value-dependent styling. Tabulator only accepts a static string for
 * `cssClass`, so the classes are toggled from the formatter (which runs on every cell render)
 * and again whenever an edit changes a value.
 */
export function applyCellValueClasses(
  element: HTMLElement,
  value: CellValue,
  modified: boolean
): void {
  element.classList.toggle('sqlight-cell-modified', modified);
  element.classList.toggle('sqlight-cell-null', value === null || value === undefined);
  element.classList.toggle('sqlight-cell-bool-true', value === true);
  element.classList.toggle('sqlight-cell-bool-false', value === false);
  element.classList.toggle('sqlight-cell-binary', isBinaryCellValue(value));
}

export interface DataCellFormatterOptions {
  columnIndex: number;
  /** Reports whether this cell holds an uncommitted edit for the current result set. */
  isModified: (rowData: CellValue[] | undefined, columnIndex: number) => boolean;
}

/**
 * Formatter for result/data cells: applies the value-dependent classes and renders the display
 * text. A `Text` node is returned instead of an HTML string so user data is never injected as
 * markup (Tabulator writes string formatter results with `innerHTML`). Boolean values render as a
 * pill instead of saturated text, which keeps them legible on both themes.
 */
export function createDataCellFormatter(
  options: DataCellFormatterOptions
): TabulatorFormatter {
  return (cell) => {
    const value = cell.getValue() as CellValue;
    const rowData = cell.getRow().getData() as unknown as CellValue[];
    applyCellValueClasses(
      cell.getElement(),
      value,
      options.isModified(rowData, options.columnIndex)
    );

    if (typeof value === 'boolean') {
      return buildBadge(
        value ? 'TRUE' : 'FALSE',
        `sqlight-bool-badge ${value ? 'sqlight-bool-true' : 'sqlight-bool-false'}`
      );
    }

    // NULL reads as a labelled token rather than bare italic text, so it can never be mistaken for
    // the seven-character string "NULL" or for an empty string in a text column.
    if (value === null || value === undefined) {
      return buildBadge('NULL', 'sqlight-null-badge');
    }

    return document.createTextNode(formatValueForDisplay(value));
  };
}

/**
 * Tooltip provider that only fires when the rendered text is actually clipped, matching the
 * `tooltipShowMode: 'whenTruncated'` behaviour of the previous grid.
 */
export function createCellTooltip(): (event: MouseEvent, cell: TabulatorCellComponent) => HTMLElement | '' {
  return (_event, cell) => {
    const element = cell.getElement();
    if (element.scrollWidth <= element.clientWidth + 1) return '';
    const node = document.createElement('div');
    node.textContent = cellTooltipText(cell.getValue() as CellValue);
    return node;
  };
}

/**
 * Applies the previous inline editor rules: `NULL` clears the value, empty input clears nullable
 * non text columns, numeric and bit columns are converted to their JavaScript types.
 */
export function coerceEditedValue(raw: string, column: ColumnDef): CellValue {
  const trimmed = raw.trim();
  const dataType = column.dataType.toLowerCase();

  if (trimmed.toUpperCase() === 'NULL') {
    return null;
  }

  if (trimmed === '' && column.nullable && !TEXT_TYPES.includes(dataType)) {
    return null;
  }

  if (trimmed !== '' && !Number.isNaN(Number(trimmed)) && NUMERIC_TYPES.includes(dataType)) {
    return Number(trimmed);
  }

  if (BOOLEAN_TYPES.includes(dataType)) {
    if (trimmed === '1' || trimmed.toLowerCase() === 'true') return true;
    if (trimmed === '0' || trimmed.toLowerCase() === 'false') return false;
  }

  return raw;
}

/**
 * Inline editor for editable result cells. The value is coerced before being handed back to
 * Tabulator so `editorEmptyValue` conversion is never involved (Tabulator would otherwise turn
 * an explicit `NULL` into `undefined`).
 */
export function createCellEditor(column: ColumnDef): TabulatorEditor {
  return (cell, onRendered, success, cancel) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sqlight-cell-editor';
    input.spellcheck = false;

    const current = cell.getValue() as CellValue;
    input.value = current === null || current === undefined ? '' : String(current);

    let finished = false;

    const commit = () => {
      if (finished) return;
      finished = true;
      success(coerceEditedValue(input.value, column));
    };

    const abort = () => {
      if (finished) return;
      finished = true;
      cancel();
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        abort();
      }
    });
    // Committing on blur mirrors the previous grid's stop-editing-when-focus-leaves behaviour.
    input.addEventListener('blur', commit);

    onRendered(() => {
      input.focus();
      input.select();
    });

    return input;
  };
}

export interface RowIndexColumnOptions {
  rowCount: number;
  resizable?: boolean;
}

/** Frozen `#` column: `rownum` formatter keeps numbering correct under the virtual row window. */
export function buildRowIndexColumn(
  options: RowIndexColumnOptions
): TabulatorColumnDefinition {
  const digits = Math.max(2, String(Math.max(options.rowCount, 0)).length);
  return {
    field: ROW_INDEX_FIELD,
    title: '#',
    frozen: true,
    width: Math.max(60, digits * 10 + 36),
    minWidth: 48,
    resizable: options.resizable ?? true,
    headerSort: false,
    hozAlign: 'center',
    cssClass: 'sqlight-row-index-cell',
    headerTooltip: '點選此處全選表格 (Select All)',
    formatter: 'rownum',
  };
}

/** Header title with the primary-key / identity badge used by the result and data viewers. */
export function buildHeaderTitle(
  title: string,
  flags: { isPrimaryKey?: boolean; isIdentity?: boolean } = {}
): Node | string {
  if (!flags.isPrimaryKey && !flags.isIdentity) return title;

  const fragment = document.createDocumentFragment();
  const icon = document.createElement('span');
  icon.className = flags.isIdentity ? 'sqlight-header-identity-icon' : 'sqlight-header-pk-icon';
  fragment.appendChild(icon);
  fragment.appendChild(document.createTextNode(title));
  return fragment;
}

export interface DataColumnOptions {
  column: ColumnDef;
  columnIndex: number;
  width: number;
  minWidth?: number;
  headerTooltip: string;
  isPrimaryKey: boolean;
  isIdentity: boolean;
  /** Returns whether this column may be edited right now (result grid inline editing). */
  isEditable?: () => boolean;
  isModified?: (rowData: CellValue[] | undefined, columnIndex: number) => boolean;
  extraClass?: string;
}

/** Builds one positional-data column shared by the result grid and the table data viewer. */
export function buildDataColumn(options: DataColumnOptions): TabulatorColumnDefinition {
  const {
    column,
    columnIndex,
    width,
    minWidth = 70,
    headerTooltip,
    isPrimaryKey,
    isIdentity,
    isEditable,
    isModified,
    extraClass,
  } = options;

  const definition: TabulatorColumnDefinition = {
    field: fieldForColumnIndex(columnIndex),
    title: column.name,
    width,
    minWidth,
    resizable: true,
    headerSort: true,
    headerSortTristate: true,
    headerTooltip,
    cssClass: extraClass ?? '',
    titleFormatter: () => buildHeaderTitle(column.name, { isPrimaryKey, isIdentity }),
    tooltip: createCellTooltip(),
    formatter: createDataCellFormatter({
      columnIndex,
      isModified: isModified ?? (() => false),
    }),
  };

  if (isEditable) {
    definition.editable = () => isEditable();
    definition.editor = createCellEditor(column);
  }

  return definition;
}

/** Builds a `<span>` badge element (used by the structure viewer formatters). */
export function buildBadge(text: string, className: string): HTMLElement {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}
