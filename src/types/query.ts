export type CellValue = string | number | boolean | null | { type: 'binary'; length: number };

export interface ColumnDef {
  name: string;
  dataType: string;
  nullable: boolean;
  ordinal: number;
}

export interface ResultSet {
  columns: ColumnDef[];
  rows: CellValue[][];
  rowCount: number;
  totalCount?: number;
  isTruncated?: boolean;
}

export interface QueryMessage {
  level: 'info' | 'warning' | 'error';
  message: string;
  code?: number;
  lineNumber?: number;
  timestamp: string;
  id?: string;
  seq?: number;
  sql?: string;
}

export interface QueryResult {
  resultSets: ResultSet[];
  messages: QueryMessage[];
  affectedRows: number;
  executionTimeMs: number;
}

export interface QueryHistoryItem {
  id: string;
  connectionId: string;
  database: string;
  sql: string;
  executedAt: string;
  executionTimeMs: number;
  status: 'success' | 'error' | 'cancelled';
  affectedRows?: number;
  errorMessage?: string;
  seq?: number;
}

export interface SessionMessageItem {
  id: string;
  seq: number;
  level: 'info' | 'warning' | 'error';
  message: string;
  code?: number;
  lineNumber?: number;
  timestamp: string;
  sql?: string;
  /**
   * Client clock time (ms) at which this message entered the session log. UI only, never
   * persisted: the message list uses it to flash statements that just ran, including when the
   * panel only mounts after the message already arrived.
   */
  freshAt?: number;
}

export interface QueryResultTab {
  id: string;
  title: string;
  sql: string;
  result: QueryResult;
  executedAt: string;
  isPinned: boolean;
  durationMs: number;
  rowCount: number;
  connectionId?: string;
  database?: string;
  tableName?: string;
  schema?: string;
  seq?: number;
  isShowplan?: boolean;
}
