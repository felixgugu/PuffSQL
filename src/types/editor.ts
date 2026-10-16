export type SqlEditorToolbarAction =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'unfoldAll'
  | 'foldAll';

/**
 * What a run command should execute.
 *
 * - `current`           the statement at the cursor (a selection wins, if there is one) — Ctrl+Enter
 * - `all`               every batch in the editor — Ctrl+Shift+Enter
 * - `selection-or-all`  the selection when there is one, otherwise the whole script — F5, as SSMS
 */
export type QueryRunMode = 'current' | 'all' | 'selection-or-all';
