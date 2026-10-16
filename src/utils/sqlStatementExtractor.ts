export interface ExtractedStatement {
  sql: string;
  isSelection: boolean;
  range?: {
    startLineNumber: number;
    endLineNumber: number;
  };
}

export interface LineMeta {
  lineIndex: number;
  codeOnly: string;
  isGo: boolean;
  goCount?: number;
  isBlank: boolean;
}

/**
 * Parses SQL text character-by-character to mask:
 * - String literals: '...' (with '' escapes)
 * - Bracketed identifiers: [...] (with ]] escapes)
 * - Quoted identifiers: "..." (with "" escapes)
 * - Single line comments: -- ...
 * - Multi-line comments: /* ... *\/ (including nested comments!)
 *
 * This accurately detects GO batch boundaries and statement boundaries.
 */
export function parseSqlLines(fullText: string): { lines: string[]; lineMetas: LineMeta[] } {
  const lines = fullText.split(/\r?\n/);
  const lineMetas: LineMeta[] = [];

  let inSingleQuote = false;
  let inBracket = false;
  let inDoubleQuote = false;
  let commentDepth = 0;
  let inLineComment = false;

  let currentLineIndex = 0;
  let currentLineCode = '';

  let i = 0;
  const len = fullText.length;

  while (i < len) {
    const ch = fullText[i];
    const nextCh = i + 1 < len ? fullText[i + 1] : '';

    if (ch === '\n' || (ch === '\r' && nextCh === '\n')) {
      if (ch === '\r') i++;
      if (inLineComment) inLineComment = false;

      const trimmedCode = currentLineCode.trim();
      const goMatch =
        commentDepth === 0 &&
        !inSingleQuote &&
        !inBracket &&
        !inDoubleQuote &&
        /^GO(?:\s+(\d+))?(?:\s+--.*)?$/i.exec(trimmedCode);
      const isGo = Boolean(goMatch);
      const goCount = goMatch && goMatch[1] ? parseInt(goMatch[1], 10) : 1;
      const isBlank = (lines[currentLineIndex] ?? '').trim() === '';

      lineMetas.push({
        lineIndex: currentLineIndex,
        codeOnly: currentLineCode,
        isGo,
        goCount: isGo ? goCount : undefined,
        isBlank,
      });

      currentLineIndex++;
      currentLineCode = '';
      i++;
      continue;
    }

    if (inLineComment) {
      i++;
      continue;
    }

    if (commentDepth > 0) {
      if (ch === '/' && nextCh === '*') {
        commentDepth++;
        i += 2;
        continue;
      }
      if (ch === '*' && nextCh === '/') {
        commentDepth--;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (inSingleQuote) {
      if (ch === "'") {
        if (nextCh === "'") {
          i += 2;
          continue;
        }
        inSingleQuote = false;
      }
      i++;
      continue;
    }

    if (inBracket) {
      if (ch === ']') {
        if (nextCh === ']') {
          i += 2;
          continue;
        }
        inBracket = false;
      }
      i++;
      continue;
    }

    if (inDoubleQuote) {
      if (ch === '"') {
        if (nextCh === '"') {
          i += 2;
          continue;
        }
        inDoubleQuote = false;
      }
      i++;
      continue;
    }

    if (ch === '-' && nextCh === '-') {
      inLineComment = true;
      i += 2;
      continue;
    }

    if (ch === '/' && nextCh === '*') {
      commentDepth = 1;
      i += 2;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      i++;
      continue;
    }

    if (ch === '[') {
      inBracket = true;
      i++;
      continue;
    }

    if (ch === '"') {
      inDoubleQuote = true;
      i++;
      continue;
    }

    currentLineCode += ch;
    i++;
  }

  if (currentLineIndex < lines.length) {
    const trimmedCode = currentLineCode.trim();
    const goMatch =
      commentDepth === 0 &&
      !inSingleQuote &&
      !inBracket &&
      !inDoubleQuote &&
      /^GO(?:\s+(\d+))?(?:\s+--.*)?$/i.exec(trimmedCode);
    const isGo = Boolean(goMatch);
    const goCount = goMatch && goMatch[1] ? parseInt(goMatch[1], 10) : 1;
    const isBlank = (lines[currentLineIndex] ?? '').trim() === '';

    lineMetas.push({
      lineIndex: currentLineIndex,
      codeOnly: currentLineCode,
      isGo,
      goCount: isGo ? goCount : undefined,
      isBlank,
    });
  }

  return { lines, lineMetas };
}

/** A batch carrying transactions, variables or control blocks has to be executed intact. */
const CONTROL_FLOW_OR_TRANSACTION =
  /\b(BEGIN\s+TRAN|\bBEGIN\s+TRANSACTION|\bBEGIN\s+TRY|\bBEGIN\s+CATCH|\bIF\b|\bWHILE\b|\bDECLARE\b|\bSET\s+@)\b/i;

export interface SqlStatementRange {
  /** 1-based, inclusive. */
  startLine: number;
  /** 1-based, inclusive. */
  endLine: number;
}

/**
 * Collects the statements of one GO batch. A batch that carries control flow or transactions stays
 * whole (T-SQL cannot split it); otherwise a statement begins right after the line holding the
 * previous ';' and ends at the line holding the next one. Blank lines never terminate a statement,
 * and blank edge lines belong to no statement at all.
 */
function collectBatchRanges(
  lineMetas: LineMeta[],
  batchStart: number,
  batchEnd: number,
  out: SqlStatementRange[]
): void {
  let bStart = batchStart;
  while (bStart <= batchEnd && lineMetas[bStart]?.isBlank) bStart++;
  let bEnd = batchEnd;
  while (bEnd >= bStart && lineMetas[bEnd]?.isBlank) bEnd--;
  if (bStart > bEnd) return;

  const batchCode = lineMetas
    .slice(bStart, bEnd + 1)
    .map((m) => m.codeOnly)
    .join('\n');

  if (CONTROL_FLOW_OR_TRANSACTION.test(batchCode)) {
    out.push({ startLine: bStart + 1, endLine: bEnd + 1 });
    return;
  }

  let stmtStart = bStart;
  for (let i = bStart; i <= bEnd; i++) {
    const endsHere = i === bEnd || lineMetas[i]?.codeOnly.includes(';');
    if (!endsHere) continue;

    let s = stmtStart;
    while (s <= i && lineMetas[s]?.isBlank) s++;
    let e = i;
    while (e >= s && lineMetas[e]?.isBlank) e--;
    if (s <= e) {
      out.push({ startLine: s + 1, endLine: e + 1 });
    }
    stmtStart = i + 1;
  }
}

/**
 * Enumerates every execution unit in the script, one entry per statement, using exactly the
 * boundaries the cursor-based extractor resolves: GO separates batches, a batch with transactions
 * or control flow stays whole, everything else splits on top-level semicolons.
 */
export function listStatementRanges(fullText: string): SqlStatementRange[] {
  if (!fullText || !fullText.trim()) return [];

  const { lineMetas } = parseSqlLines(fullText);
  if (lineMetas.length === 0) return [];

  const ranges: SqlStatementRange[] = [];
  let batchStart = 0;
  for (let i = 0; i <= lineMetas.length; i++) {
    if (i < lineMetas.length && !lineMetas[i]?.isGo) continue;
    collectBatchRanges(lineMetas, batchStart, i - 1, ranges);
    batchStart = i + 1;
  }
  return ranges;
}

/**
 * Extracts the single SQL statement or execution unit at the current cursor position,
 * or returns the active selection if present.
 */
export function extractStatementAtCursor(
  fullText: string,
  cursorLineNumber: number,
  selectionText?: string
): ExtractedStatement {
  // 1. If user has actively selected text, return the selection directly
  if (selectionText && selectionText.trim()) {
    return {
      sql: selectionText.trim(),
      isSelection: true,
    };
  }

  if (!fullText || !fullText.trim()) {
    return { sql: '', isSelection: false };
  }

  const lines = fullText.split(/\r?\n/);
  const cursorLine = Math.max(1, Math.min(cursorLineNumber, lines.length));

  // A cursor on a GO line, or on a blank line between statements, resolves to no statement.
  const range = listStatementRanges(fullText).find(
    (r) => cursorLine >= r.startLine && cursorLine <= r.endLine
  );
  if (!range) {
    return { sql: '', isSelection: false };
  }

  return {
    sql: lines.slice(range.startLine - 1, range.endLine).join('\n').trim(),
    isSelection: false,
    range: {
      startLineNumber: range.startLine,
      endLineNumber: range.endLine,
    },
  };
}

export interface SqlBatchItem {
  sql: string;
  startLine: number;
  repeatCount: number;
}

/**
 * Splits a full SQL script into separate executable batches with line numbers and repeat counts.
 */
export function splitSqlBatchesWithMeta(fullText: string): SqlBatchItem[] {
  if (!fullText || !fullText.trim()) return [];

  const { lines, lineMetas } = parseSqlLines(fullText);
  if (lineMetas.length === 0) return [];

  const batches: SqlBatchItem[] = [];
  let currentBatchLines: { lineIndex: number; text: string }[] = [];

  for (let i = 0; i < lineMetas.length; i++) {
    const meta = lineMetas[i];
    if (meta?.isGo) {
      const repeatCount = meta.goCount && meta.goCount > 0 ? meta.goCount : 1;
      const flushed = flushBatchItem(currentBatchLines, repeatCount);
      if (flushed) {
        batches.push(flushed);
      }
      currentBatchLines = [];
    } else {
      currentBatchLines.push({ lineIndex: i, text: lines[i] ?? '' });
    }
  }

  const finalFlushed = flushBatchItem(currentBatchLines, 1);
  if (finalFlushed) {
    batches.push(finalFlushed);
  }

  return batches;
}

function flushBatchItem(
  batchLines: { lineIndex: number; text: string }[],
  repeatCount: number
): SqlBatchItem | null {
  if (batchLines.length === 0) return null;

  const firstIdx = batchLines.findIndex((l) => l.text.trim() !== '');
  if (firstIdx === -1) return null;

  let lastIdx = batchLines.length - 1;
  while (lastIdx >= firstIdx && (batchLines[lastIdx]?.text ?? '').trim() === '') {
    lastIdx--;
  }

  if (firstIdx > lastIdx) return null;

  const selected = batchLines.slice(firstIdx, lastIdx + 1);
  const sql = selected.map((l) => l.text).join('\n').trim();
  if (!sql) return null;

  return {
    sql,
    startLine: (selected[0]?.lineIndex ?? 0) + 1,
    repeatCount,
  };
}

/**
 * Splits a full SQL script into separate executable batches by detecting GO boundaries.
 * Accurately ignores 'GO' inside string literals, comments, or bracketed identifiers.
 * Respects repeat count (e.g. GO 5 repeats the batch 5 times).
 */
export function splitSqlBatches(fullText: string): string[] {
  const metaBatches = splitSqlBatchesWithMeta(fullText);
  const result: string[] = [];
  for (const b of metaBatches) {
    for (let r = 0; r < b.repeatCount; r++) {
      result.push(b.sql);
    }
  }
  return result;
}

/**
 * Splits SQL text into individual statements by top-level semicolons.
 * Protects semicolons inside:
 * - Single-quoted strings: '...' (with '' escapes)
 * - Bracketed identifiers: [...] (with ]] escapes)
 * - Quoted identifiers: "..." (with "" escapes)
 * - Single-line comments: -- ...
 * - Multi-line comments: /* ... *\/ (including nested)
 */
export function splitSqlStatements(fullText: string): string[] {
  if (!fullText || !fullText.trim()) return [];

  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inBracket = false;
  let inDoubleQuote = false;
  let commentDepth = 0;
  let inLineComment = false;

  const len = fullText.length;
  for (let i = 0; i < len; i++) {
    const ch = fullText[i]!;
    const nextCh = i + 1 < len ? fullText[i + 1]! : '';

    if (inLineComment) {
      current += ch;
      if (ch === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (commentDepth > 0) {
      current += ch;
      if (ch === '/' && nextCh === '*') {
        commentDepth++;
        current += nextCh;
        i++;
      } else if (ch === '*' && nextCh === '/') {
        commentDepth--;
        current += nextCh;
        i++;
      }
      continue;
    }

    if (ch === '-' && nextCh === '-') {
      inLineComment = true;
      current += ch + nextCh;
      i++;
      continue;
    }

    if (ch === '/' && nextCh === '*') {
      commentDepth = 1;
      current += ch + nextCh;
      i++;
      continue;
    }

    if (inSingleQuote) {
      current += ch;
      if (ch === "'") {
        if (nextCh === "'") {
          current += nextCh;
          i++;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    if (inBracket) {
      current += ch;
      if (ch === ']') {
        if (nextCh === ']') {
          current += nextCh;
          i++;
        } else {
          inBracket = false;
        }
      }
      continue;
    }

    if (inDoubleQuote) {
      current += ch;
      if (ch === '"') {
        if (nextCh === '"') {
          current += nextCh;
          i++;
        } else {
          inDoubleQuote = false;
        }
      }
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      continue;
    }

    if (ch === '[') {
      inBracket = true;
      current += ch;
      continue;
    }

    if (ch === '"') {
      inDoubleQuote = true;
      current += ch;
      continue;
    }

    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += ch;
  }

  const finalTrimmed = current.trim();
  if (finalTrimmed) {
    statements.push(finalTrimmed);
  }

  return statements;
}
