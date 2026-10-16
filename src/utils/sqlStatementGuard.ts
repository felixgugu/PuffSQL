/**
 * Statement Guard: disables a dangerous statement by turning it into plain SQL comments.
 *
 * The disabled state lives in the text itself — a statement counts as disabled when every non-blank
 * line in its range starts with `--` — so it survives saving, copying and tab switches without a
 * second source of truth, and SQL Server skips the statement on its own when the whole script is
 * sent as one batch.
 */
import { detectDangerousSqlStatements, type DangerousSqlKeyword } from './sqlGuard';
import {
  listStatementRanges,
  parseSqlLines,
  type LineMeta,
  type SqlStatementRange,
} from './sqlStatementExtractor';

/** Inserted at column 1 of every code line of a disabled statement. */
export const STATEMENT_GUARD_MARKER = '-- ';

/**
 * Words a guarded statement can begin with. Comments never enter the live parse, so this list is
 * only used when reading a commented block back: it tells a statement the guard disabled apart from
 * a hand-written comment that happens to sit right above one (that comment line must stay a comment,
 * otherwise restoring the statement would turn it into code).
 */
const STATEMENT_START_KEYWORDS = new Set([
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'ALTER', 'CREATE', 'DROP', 'TRUNCATE',
  'WITH', 'EXEC', 'EXECUTE', 'DECLARE', 'SET', 'IF', 'ELSE', 'WHILE', 'BEGIN', 'END', 'TRY',
  'CATCH', 'GOTO', 'WAITFOR', 'RETURN', 'THROW', 'RAISERROR', 'PRINT', 'USE', 'GRANT', 'REVOKE',
  'DENY', 'BACKUP', 'RESTORE', 'DBCC', 'CHECKPOINT', 'KILL', 'COMMIT', 'ROLLBACK', 'SAVE',
  'TRAN', 'TRANSACTION', 'SHUTDOWN', 'RECONFIGURE', 'ENABLE', 'DISABLE',
]);

function startsStatement(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  if (/^[;([@#]/.test(trimmed)) return true;
  const word = /^[A-Za-z_]+/.exec(trimmed)?.[0];
  return word !== undefined && STATEMENT_START_KEYWORDS.has(word.toUpperCase());
}

export interface GuardedStatement extends SqlStatementRange {
  /** Keywords found in the statement's code, in the guard's own order. */
  keywords: DangerousSqlKeyword[];
  /** True when every non-blank line of the statement is commented out. */
  disabled: boolean;
}

/** A single-line insertion/removal, ready to be turned into a Monaco edit operation. */
export interface StatementLineEdit {
  lineNumber: number;
  startColumn: number;
  endColumn: number;
  text: string;
}

/**
 * A line only counts as guarded when the comment starts at column 1: the guard always writes its
 * marker there, and reading the state back has to recognise exactly what it can undo again.
 */
export function isGuardMarked(line: string): boolean {
  return line.startsWith('--');
}

/** A line carries no code: it is blank, or it is one of the guard's own commented lines. */
function isInertLine(line: string): boolean {
  return line.trim() === '' || isGuardMarked(line);
}

/**
 * Maximal windows of lines that hold no code at all — blank lines and commented lines. A statement
 * the guard disabled lives entirely inside one of these windows, which is where it can be read back:
 * the live parse reports nothing there, and the live parse is what keeps comments out of the code
 * path for every other statement.
 */
function commentedWindows(lines: string[]): SqlStatementRange[] {
  const windows: SqlStatementRange[] = [];
  let start = -1;
  let sawComment = false;

  for (let i = 0; i <= lines.length; i++) {
    const line = i < lines.length ? (lines[i] ?? '') : null;

    if (line !== null && isInertLine(line)) {
      if (start === -1) {
        start = i;
        sawComment = false;
      }
      if (line.trim() !== '') sawComment = true;
      continue;
    }

    if (start !== -1) {
      if (sawComment) windows.push({ startLine: start + 1, endLine: i });
      start = -1;
    }
  }

  return windows;
}

/** The code of one statement, with strings, comments and identifiers masked out. */
function statementCode(lineMetas: LineMeta[], range: SqlStatementRange): string {
  return lineMetas
    .slice(range.startLine - 1, range.endLine)
    .map((meta) => meta.codeOnly)
    .join('\n');
}

/**
 * Moves a statement's first line down to the first line that actually starts one. Whatever sits in
 * front of it — blank lines, a note, a stray comment a reader left there — is not part of the
 * statement, so the guard neither comments it out nor counts it in its range. The same rule on both
 * the live and the read-back side is what makes a toggle exactly reversible.
 */
function trimToStatementStart(lines: string[], range: SqlStatementRange): SqlStatementRange | null {
  let startLine = range.startLine;
  while (startLine <= range.endLine && !startsStatement(lines[startLine - 1] ?? '')) startLine++;
  return startLine <= range.endLine ? { startLine, endLine: range.endLine } : null;
}

/**
 * Lists the statements that carry a dangerous keyword (UPDATE, INSERT, DELETE, ALTER, CREATE, DROP,
 * TRUNCATE) together with their line range and their current disabled state.
 *
 * Live statements are read from the script as written, so a comment that merely mentions a keyword
 * is still just a comment. Disabled statements are invisible in that parse — every line is commented
 * — so they are read back per {@link commentedWindows} with one comment level removed, which
 * resolves to exactly the range the guard commented out in the first place.
 */
export function analyzeGuardedStatements(fullText: string): GuardedStatement[] {
  if (!fullText || !fullText.trim()) return [];

  const rawLines = fullText.split(/\r?\n/);
  const guarded: GuardedStatement[] = [];

  const { lineMetas } = parseSqlLines(fullText);
  for (const range of listStatementRanges(fullText)) {
    const trimmed = trimToStatementStart(rawLines, range);
    if (!trimmed) continue;

    const detection = detectDangerousSqlStatements(statementCode(lineMetas, trimmed));
    if (!detection.isDangerous) continue;

    guarded.push({
      ...trimmed,
      keywords: detection.detectedKeywords,
      disabled: false,
    });
  }

  for (const window of commentedWindows(rawLines)) {
    const inside = rawLines
      .slice(window.startLine - 1, window.endLine)
      .map((line) => (isGuardMarked(line) ? line.replace(/^-- ?/, '') : line));
    const local = inside.join('\n');
    const parsed = parseSqlLines(local);

    for (const range of listStatementRanges(local)) {
      const trimmed = trimToStatementStart(inside, range);
      if (!trimmed) continue;

      const detection = detectDangerousSqlStatements(statementCode(parsed.lineMetas, trimmed));
      if (!detection.isDangerous) continue;

      const offset = window.startLine - 1;
      guarded.push({
        startLine: trimmed.startLine + offset,
        endLine: trimmed.endLine + offset,
        keywords: detection.detectedKeywords,
        disabled: true,
      });
    }
  }

  return guarded.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
}

export function findGuardedStatementAtLine(
  statements: GuardedStatement[],
  lineNumber: number
): GuardedStatement | null {
  return statements.find((s) => lineNumber >= s.startLine && lineNumber <= s.endLine) ?? null;
}

/**
 * The edits that switch one statement between enabled and disabled.
 *
 * Disabling prefixes every non-blank line — including lines that already carry a comment — so
 * enabling removes exactly one comment level again and can never resurrect a line the user had
 * commented out themselves. Blank lines are never touched.
 */
export function buildToggleEdits(
  fullText: string,
  statement: SqlStatementRange,
  disabled: boolean
): StatementLineEdit[] {
  const lines = fullText.split(/\r?\n/);
  const edits: StatementLineEdit[] = [];

  for (let i = statement.startLine - 1; i < statement.endLine; i++) {
    const line = lines[i];
    if (line === undefined || line.trim() === '') continue;

    if (disabled) {
      edits.push({
        lineNumber: i + 1,
        startColumn: 1,
        endColumn: 1,
        text: STATEMENT_GUARD_MARKER,
      });
    } else if (isGuardMarked(line)) {
      const markerLength = line.startsWith(STATEMENT_GUARD_MARKER) ? STATEMENT_GUARD_MARKER.length : 2;
      edits.push({
        lineNumber: i + 1,
        startColumn: 1,
        endColumn: markerLength + 1,
        text: '',
      });
    }
  }

  return edits;
}
