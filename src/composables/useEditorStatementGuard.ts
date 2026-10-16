/**
 * Wires the statement guard into a Monaco editor: a Ban glyph in the glyph margin (left of the line
 * numbers) that disables — by commenting out — the dangerous statement it belongs to.
 *
 * The glyph only exists while the pointer is over the statement, except for statements that are
 * already disabled: those keep it pinned on their first line, so the state stays visible at a glance.
 */
import type * as Monaco from 'monaco-editor';
import { t } from '@/i18n';
import {
  analyzeGuardedStatements,
  buildToggleEdits,
  findGuardedStatementAtLine,
  type GuardedStatement,
} from '@/utils/sqlStatementGuard';

export const STATEMENT_GUARD_GLYPH_CLASS = 'sqlight-stmt-guard';
export const STATEMENT_GUARD_OFF_GLYPH_CLASS = 'sqlight-stmt-guard-off';

/** Typing pauses longer than this re-scan the script instead of rescanning on every keystroke. */
const RESCAN_DELAY_MS = 150;

export interface EditorStatementGuard {
  /** Drops every listener and decoration this composable owns. */
  dispose(): void;
}

export function useEditorStatementGuard(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor
): EditorStatementGuard {
  const decorations = editor.createDecorationsCollection();
  const listeners: Monaco.IDisposable[] = [];

  let statements: GuardedStatement[] = [];
  let analyzedVersion = -1;
  let hoveredLine: number | null = null;
  let rescanTimer: ReturnType<typeof setTimeout> | undefined;

  function modelVersion(): number {
    return editor.getModel()?.getVersionId() ?? -1;
  }

  function analyze(): void {
    const model = editor.getModel();
    if (!model) {
      statements = [];
      analyzedVersion = -1;
      return;
    }
    statements = analyzeGuardedStatements(model.getValue());
    analyzedVersion = model.getVersionId();
  }

  function ensureAnalyzed(): void {
    if (analyzedVersion !== modelVersion()) analyze();
  }

  function hoveredStatement(): GuardedStatement | null {
    return hoveredLine === null ? null : findGuardedStatementAtLine(statements, hoveredLine);
  }

  function render(): void {
    if (!editor.getModel()) {
      decorations.clear();
      return;
    }

    const anchors: Array<{ lineNumber: number; disabled: boolean }> = [];
    for (const statement of statements) {
      if (statement.disabled) anchors.push({ lineNumber: statement.startLine, disabled: true });
    }

    const hovered = hoveredStatement();
    if (hovered) {
      anchors.push({ lineNumber: hovered.startLine, disabled: hovered.disabled });
    }

    decorations.set(
      anchors.map((anchor) => ({
        range: new monaco.Range(anchor.lineNumber, 1, anchor.lineNumber, 1),
        options: {
          glyphMarginClassName: anchor.disabled
            ? `${STATEMENT_GUARD_GLYPH_CLASS} ${STATEMENT_GUARD_OFF_GLYPH_CLASS}`
            : STATEMENT_GUARD_GLYPH_CLASS,
          glyphMarginHoverMessage: {
            value: t(anchor.disabled ? 'editor.guardDisabledTooltip' : 'editor.guardDisableTooltip'),
          },
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      }))
    );
  }

  function refresh(): void {
    analyze();
    render();
  }

  function scheduleRescan(): void {
    if (rescanTimer !== undefined) clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => {
      rescanTimer = undefined;
      refresh();
    }, RESCAN_DELAY_MS);
  }

  /**
   * Toggling never touches the caret or the selection: Monaco itself ignores the gutter for text
   * placement (see MouseHandler._onMouseDown), so the click is a pure control click.
   */
  function toggleStatementAt(lineNumber: number): void {
    const model = editor.getModel();
    if (!model) return;

    const statement = findGuardedStatementAtLine(statements, lineNumber);
    if (!statement) return;

    const edits = buildToggleEdits(model.getValue(), statement, !statement.disabled);
    if (edits.length === 0) return;

    const selections = editor.getSelections() ?? [];
    editor.executeEdits(
      'statement-guard',
      edits.map((edit) => ({
        range: new monaco.Range(edit.lineNumber, edit.startColumn, edit.lineNumber, edit.endColumn),
        text: edit.text,
        forceMoveMarkers: true,
      })),
      () => selections
    );
    // One click is one undo step, not one step per commented line.
    editor.pushUndoStop();
    refresh();
  }

  listeners.push(
    editor.onMouseMove((e) => {
      const lineNumber = e.target.position?.lineNumber ?? null;
      if (lineNumber === hoveredLine) return;
      hoveredLine = lineNumber;
      ensureAnalyzed();
      render();
    })
  );

  listeners.push(
    editor.onMouseLeave(() => {
      if (hoveredLine === null) return;
      hoveredLine = null;
      render();
    })
  );

  listeners.push(
    editor.onMouseDown((e) => {
      if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      const lineNumber = e.target.position?.lineNumber;
      if (lineNumber === undefined) return;
      ensureAnalyzed();
      toggleStatementAt(lineNumber);
    })
  );

  listeners.push(editor.onDidChangeModelContent(() => scheduleRescan()));
  listeners.push(editor.onDidChangeModel(() => refresh()));

  refresh();

  return {
    dispose(): void {
      if (rescanTimer !== undefined) {
        clearTimeout(rescanTimer);
        rescanTimer = undefined;
      }
      for (const listener of listeners) listener.dispose();
      listeners.length = 0;
      decorations.clear();
    },
  };
}
