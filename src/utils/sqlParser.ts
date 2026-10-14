export interface TableAliasMap {
  // Key: alias or tableName (lowercase) -> Value: actual tableName
  aliases: Map<string, string>;
  // List of all referenced table names (lowercase) in the query
  referencedTables: Set<string>;
}

const RESERVED_NON_ALIAS = new Set([
  'where', 'join', 'inner', 'left', 'right', 'full', 'outer', 'cross', 'on',
  'group', 'by', 'order', 'having', 'union', 'all', 'intersect', 'except',
  'limit', 'offset', 'fetch', 'next', 'rows', 'only', 'with', 'nolock',
  'as', 'set', 'select', 'and', 'or', 'not', 'in', 'between', 'like', 'is',
  'null', 'values', 'into', 'from', 'table', 'when', 'then', 'else', 'end',
  'case', 'exec', 'execute', 'declare', 'go',
]);

const SQL_RESERVED_IDENTIFIERS = new Set([
  'order', 'group', 'user', 'table', 'key', 'index', 'check', 'constraint',
  'primary', 'foreign', 'references', 'default', 'view', 'schema', 'database',
  'cursor', 'procedure', 'function', 'trigger', 'transaction', 'column',
]);

/**
 * Parses all table references and aliases from a SQL query string.
 * Supports:
 * - FROM [schema].[Table] [AS] alias
 * - JOIN [schema].[Table] [AS] alias
 * - FROM Table1 a, Table2 b
 */
export function parseTableAliases(sql: string): TableAliasMap {
  const aliases = new Map<string, string>();
  const referencedTables = new Set<string>();

  if (!sql) {
    return { aliases, referencedTables };
  }

  // Strip single-line and multi-line comments
  const cleanSql = sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

  // Regex matches: (FROM|JOIN)\s+([^\s,()]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_#@\[\]]+))?
  const fromJoinRegex = /\b(?:FROM|JOIN)\s+([a-zA-Z0-9_#@\.\[\]]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_#@\[\]]+))?/gi;

  let match: RegExpExecArray | null;
  while ((match = fromJoinRegex.exec(cleanSql)) !== null) {
    const rawTable = match[1];
    const rawAlias = match[2];

    if (!rawTable) continue;

    // Clean table name (e.g. [dbo].[Users] -> Users, dbo.Users -> Users)
    const tableParts = rawTable.split('.').map((p) => p.replace(/[\[\]]/g, '').trim());
    const tableName = tableParts[tableParts.length - 1] || '';
    if (!tableName) continue;

    const lowerTableName = tableName.toLowerCase();
    referencedTables.add(lowerTableName);
    // Self-mapping so "Users.col" works
    aliases.set(lowerTableName, tableName);

    // If schema is present (e.g. dbo.Users), map "dbo.users" -> "Users"
    if (tableParts.length > 1) {
      aliases.set(tableParts.join('.').toLowerCase(), tableName);
    }

    if (rawAlias) {
      const cleanAlias = rawAlias.replace(/[\[\]]/g, '').trim();
      const lowerAlias = cleanAlias.toLowerCase();
      if (!RESERVED_NON_ALIAS.has(lowerAlias)) {
        aliases.set(lowerAlias, tableName);
      }
    }
  }

  // Also check comma-separated tables in FROM clause: FROM TableA a, TableB b
  const commaFromRegex = /\bFROM\s+([^;]+?)(?:\bWHERE\b|\bGROUP\b|\bORDER\b|\bHAVING\b|\bJOIN\b|;|$)/i;
  const fromClauseMatch = commaFromRegex.exec(cleanSql);
  if (fromClauseMatch && fromClauseMatch[1]) {
    const tablesPart = fromClauseMatch[1];
    const items = tablesPart.split(',');
    for (const item of items) {
      const tokens = item.trim().split(/\s+/).filter(Boolean);
      if (tokens.length >= 1) {
        const rawTable = tokens[0] ?? '';
        const tableParts = rawTable.split('.').map((p) => p.replace(/[\[\]]/g, '').trim());
        const tableName = tableParts[tableParts.length - 1] || '';
        if (tableName && !RESERVED_NON_ALIAS.has(tableName.toLowerCase())) {
          const lowerTableName = tableName.toLowerCase();
          referencedTables.add(lowerTableName);
          aliases.set(lowerTableName, tableName);

          // Check if alias provided: TableA a or TableA AS a
          let aliasToken = tokens.length === 2 ? tokens[1] : tokens.length === 3 && tokens[1]?.toUpperCase() === 'AS' ? tokens[2] : null;
          if (aliasToken) {
            const cleanAlias = aliasToken.replace(/[\[\]]/g, '').trim();
            const lowerAlias = cleanAlias.toLowerCase();
            if (!RESERVED_NON_ALIAS.has(lowerAlias)) {
              aliases.set(lowerAlias, tableName);
            }
          }
        }
      }
    }
  }

  return { aliases, referencedTables };
}

export type QueryContextType = 'table' | 'column_or_expr' | 'join_keyword' | 'general';

export interface CursorContext {
  isDotTrigger: boolean;
  qualifier?: string;
  contextType: QueryContextType;
  /** Uppercase JOIN modifier (e.g. 'LEFT') when contextType is 'join_keyword'. */
  joinModifier?: string;
}

/** Keywords that expect a table source next. */
const TABLE_CONTEXT_KEYWORDS = new Set(['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE']);

/** Keywords that expect a column / expression next. */
const COLUMN_CONTEXT_KEYWORDS = new Set(['SELECT', 'WHERE', 'AND', 'OR', 'ON', 'SET', 'HAVING', 'BY']);

/** JOIN modifiers that expect another modifier or the JOIN keyword next. */
const JOIN_MODIFIER_KEYWORDS = new Set(['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER']);

/** How many tokens of the cursor prefix are inspected when looking for the governing keyword. */
const CONTEXT_SCAN_WINDOW = 6;

/** Only the tail of the document is relevant for keyword context detection. */
const CONTEXT_TAIL_LENGTH = 1000;

/**
 * Analyzes the text preceding the cursor (possibly spanning multiple lines)
 * to determine which kind of objects should be suggested.
 */
export function getCursorContext(textUntilCursor: string): CursorContext {
  const lastLine = textUntilCursor.slice(textUntilCursor.lastIndexOf('\n') + 1);

  // Check if cursor is immediately after a dot: e.g. "u." or "Users." or "[dbo]." or "u.a"
  const dotMatch = lastLine.match(/([a-zA-Z0-9_#@\[\]]+)\.\s*([a-zA-Z0-9_#@\[\]]*)$/);
  if (dotMatch && dotMatch[1]) {
    const qualifier = dotMatch[1].replace(/[\[\]]/g, '').trim();
    return {
      isDotTrigger: true,
      qualifier,
      contextType: 'column_or_expr',
    };
  }

  // Walk backwards from the cursor until a keyword decides the context. Tokens that are
  // not keywords (partial identifiers, operators, numbers) are skipped, so typing
  // "FROM Us" or breaking the line right after "JOIN" keeps the table context.
  const words = textUntilCursor
    .slice(-CONTEXT_TAIL_LENGTH)
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/[(),;]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const lastIndex = words.length - 1;
  const scanStart = Math.max(0, words.length - CONTEXT_SCAN_WINDOW);
  for (let i = words.length - 1; i >= scanStart; i -= 1) {
    const word = (words[i] ?? '').toUpperCase();
    if (!word) continue;

    if (TABLE_CONTEXT_KEYWORDS.has(word)) {
      return { isDotTrigger: false, contextType: 'table' };
    }

    if (COLUMN_CONTEXT_KEYWORDS.has(word)) {
      return { isDotTrigger: false, contextType: 'column_or_expr' };
    }

    if (JOIN_MODIFIER_KEYWORDS.has(word)) {
      return { isDotTrigger: false, contextType: 'join_keyword', joinModifier: word };
    }

    // The token touching the cursor is whatever the user is still typing, even when it
    // spells a keyword ("FROM Order", "FROM In" while typing "Inventory").
    if (i === lastIndex) continue;

    // Any other known keyword ends the search: we are no longer directly after a
    // clause keyword that would dictate table-only completion.
    if (RESERVED_NON_ALIAS.has(word.toLowerCase())) {
      break;
    }
  }

  return {
    isDotTrigger: false,
    contextType: 'general',
  };
}

/**
 * Wraps identifier in square brackets if it contains spaces, special characters, or is a reserved keyword.
 */
export function wrapIdentifierIfNeeded(name: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    if (SQL_RESERVED_IDENTIFIERS.has(name.toLowerCase())) {
      return `[${name}]`;
    }
    return name;
  }
  return `[${name}]`;
}
