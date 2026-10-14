import { monaco } from '@/utils/monaco';
import { useSchemaStore } from '@/stores/schemaStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { SQL_KEYWORDS, SQL_FUNCTIONS, SQL_SNIPPETS } from './sqlKeywords';
import {
  parseTableAliases,
  getCursorContext,
  wrapIdentifierIfNeeded,
} from './sqlParser';
import type { languages, IRange } from 'monaco-editor';

let isProviderRegistered = false;
let providerDisposable: monaco.IDisposable | null = null;

/**
 * Keywords that may legally follow a JOIN modifier, e.g. "LEFT " -> OUTER / JOIN.
 * Kept as plain keyword text so we do not duplicate the SQL_KEYWORDS snippets.
 */
const JOIN_MODIFIER_CONTINUATIONS: Record<string, string[]> = {
  INNER: ['JOIN'],
  LEFT: ['OUTER', 'JOIN'],
  RIGHT: ['OUTER', 'JOIN'],
  FULL: ['OUTER', 'JOIN'],
  CROSS: ['JOIN'],
  OUTER: ['JOIN'],
};

export function setupSqlCompletionProvider(): void {
  if (isProviderRegistered) return;

  providerDisposable = monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' ', '[', '(', ','],

    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range: IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const fullSql = model.getValue();
      const textUntilCursor = fullSql.slice(0, model.getOffsetAt(position));

      const cursorContext = getCursorContext(textUntilCursor);
      const schemaStore = useSchemaStore();
      const connStore = useConnectionStore();

      const activeConnId = connStore.activeConnectionId;
      const activeDb = connStore.activeDatabase;
      const tables = schemaStore.getSchema(activeConnId ?? undefined, activeDb);

      const { aliases, referencedTables } = parseTableAliases(fullSql);
      const suggestions: languages.CompletionItem[] = [];

      // =========================================================================
      // Case 1: Dot Trigger (e.g. "u." or "Users." or "dbo.")
      // =========================================================================
      if (cursorContext.isDotTrigger && cursorContext.qualifier) {
        const rawQual = cursorContext.qualifier;
        const lowerQual = rawQual.toLowerCase();

        // 1.1 Check if qualifier matches a table alias or table name in the query
        const resolvedTableName = aliases.get(lowerQual) || rawQual;
        const lowerResolved = resolvedTableName.toLowerCase();

        const targetTable = tables.find(
          (t) =>
            t.name.toLowerCase() === lowerResolved ||
            `${t.schema}.${t.name}`.toLowerCase() === lowerResolved
        );

        if (targetTable) {
          // Suggest columns belonging exclusively to this resolved table
          for (const col of targetTable.columns) {
            suggestions.push({
              label: col.name,
              kind: monaco.languages.CompletionItemKind.Field,
              detail: `${col.dataType}${col.maxLength ? `(${col.maxLength === -1 ? 'max' : col.maxLength})` : ''}${col.isPrimaryKey ? ' • PK' : ''}`,
              documentation: {
                value: [
                  `**Column**: \`${col.name}\``,
                  `- **Table**: \`${targetTable.schema}.${targetTable.name}\``,
                  `- **Data Type**: \`${col.dataType}\``,
                  `- **Nullable**: ${col.isNullable ? 'Yes' : 'No'}`,
                  col.isPrimaryKey ? '- **Primary Key**: Yes 🔑' : '',
                  col.isIdentity ? '- **Identity**: Yes' : '',
                ]
                  .filter(Boolean)
                  .join('\n'),
              },
              insertText: wrapIdentifierIfNeeded(col.name),
              sortText: col.isPrimaryKey ? `0_${col.name}` : `1_${col.name}`,
              range,
            });
          }
          return { suggestions };
        }

        // 1.2 Check if qualifier is a schema name (e.g. "dbo.")
        const schemaTables = tables.filter(
          (t) => t.schema.toLowerCase() === lowerQual
        );
        if (schemaTables.length > 0) {
          for (const t of schemaTables) {
            suggestions.push({
              label: t.name,
              kind:
                t.kind === 'VIEW'
                  ? monaco.languages.CompletionItemKind.Interface
                  : monaco.languages.CompletionItemKind.Class,
              detail: `${t.kind === 'VIEW' ? 'View' : 'Table'} (${t.columns.length} cols)`,
              documentation: `Schema: ${t.schema} | Name: ${t.name}`,
              insertText: wrapIdentifierIfNeeded(t.name),
              sortText: `0_${t.name}`,
              range,
            });
          }
          return { suggestions };
        }

        // If qualifier could not be matched, return empty so as not to clutter
        return { suggestions };
      }

      // =========================================================================
      // Case 2: Table Context (Preceding keyword is FROM, JOIN, INTO, UPDATE)
      // =========================================================================
      if (cursorContext.contextType === 'table') {
        // High priority: Tables and Views in the active database
        for (const t of tables) {
          suggestions.push({
            label: t.name,
            kind:
              t.kind === 'VIEW'
                ? monaco.languages.CompletionItemKind.Interface
                : monaco.languages.CompletionItemKind.Class,
            detail: `${t.kind === 'VIEW' ? 'View' : 'Table'} • ${t.schema} (${t.columns.length} cols)`,
            documentation: {
              value: [
                `**${t.kind === 'VIEW' ? 'View' : 'Table'}**: \`${t.schema}.${t.name}\``,
                `**Columns**: ${t.columns.map((c) => c.name).slice(0, 10).join(', ')}${t.columns.length > 10 ? '...' : ''}`,
              ].join('\n\n'),
            },
            insertText: wrapIdentifierIfNeeded(t.name),
            sortText: `0_${t.name}`,
            range,
          });
        }

        // Suggest unique schemas (e.g. dbo)
        const schemas = Array.from(new Set(tables.map((t) => t.schema)));
        for (const s of schemas) {
          suggestions.push({
            label: s,
            kind: monaco.languages.CompletionItemKind.Module,
            detail: 'Schema',
            insertText: wrapIdentifierIfNeeded(s),
            sortText: `1_${s}`,
            range,
          });
        }

        return { suggestions };
      }

      // =========================================================================
      // Case 2.5: JOIN Modifier Context (Preceding keyword is LEFT, INNER, OUTER, ...)
      // =========================================================================
      if (cursorContext.contextType === 'join_keyword') {
        const continuations =
          JOIN_MODIFIER_CONTINUATIONS[cursorContext.joinModifier ?? ''] ?? ['JOIN'];

        for (const kw of continuations) {
          suggestions.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: 'JOIN clause keyword',
            insertText: kw,
            sortText: `0_${kw}`,
            range,
          });
        }

        return { suggestions };
      }

      // =========================================================================
      // Case 3: Column / Expression Context or General Typing
      // =========================================================================

      // 3.1 Prioritize columns from tables referenced in the current query
      const referencedColumnsAdded = new Set<string>();
      for (const t of tables) {
        if (referencedTables.has(t.name.toLowerCase())) {
          for (const col of t.columns) {
            const dedupKey = `${t.name}.${col.name}`.toLowerCase();
            if (!referencedColumnsAdded.has(dedupKey)) {
              referencedColumnsAdded.add(dedupKey);
              suggestions.push({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                detail: `${col.dataType} • ${t.name}${col.isPrimaryKey ? ' (PK)' : ''}`,
                documentation: {
                  value: `Table: \`${t.name}\` | Type: \`${col.dataType}\`${col.isPrimaryKey ? ' | Primary Key' : ''}`,
                },
                insertText: wrapIdentifierIfNeeded(col.name),
                sortText: col.isPrimaryKey ? `0_0_${col.name}` : `0_1_${col.name}`,
                range,
              });
            }
          }
        }
      }

      // 3.2 SQL Server Built-in Functions
      for (const fn of SQL_FUNCTIONS) {
        suggestions.push({
          label: fn.name,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: fn.detail,
          documentation: fn.documentation,
          insertText: fn.snippet || `${fn.name}()`,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: `1_${fn.name}`,
          range,
        });
      }

      // 3.3 SQL Keywords
      for (const kw of SQL_KEYWORDS) {
        suggestions.push({
          label: kw.name,
          kind: monaco.languages.CompletionItemKind.Keyword,
          detail: kw.detail,
          insertText: kw.snippet || kw.name,
          insertTextRules: kw.snippet
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          sortText: `2_${kw.name}`,
          range,
        });
      }

      // 3.4 Tables & Views from active database
      for (const t of tables) {
        suggestions.push({
          label: t.name,
          kind:
            t.kind === 'VIEW'
              ? monaco.languages.CompletionItemKind.Interface
              : monaco.languages.CompletionItemKind.Class,
          detail: `${t.kind === 'VIEW' ? 'View' : 'Table'} • ${t.schema}`,
          insertText: wrapIdentifierIfNeeded(t.name),
          sortText: `3_${t.name}`,
          range,
        });
      }

      // 3.5 All remaining columns in the database (if not already added)
      for (const t of tables) {
        for (const col of t.columns) {
          const dedupKey = `${t.name}.${col.name}`.toLowerCase();
          if (!referencedColumnsAdded.has(dedupKey)) {
            suggestions.push({
              label: col.name,
              kind: monaco.languages.CompletionItemKind.Field,
              detail: `${col.dataType} • ${t.name}`,
              insertText: wrapIdentifierIfNeeded(col.name),
              sortText: `4_${col.name}`,
              range,
            });
          }
        }
      }

      // 3.6 Code Snippets
      for (const snip of SQL_SNIPPETS) {
        suggestions.push({
          label: snip.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: snip.detail,
          documentation: snip.documentation,
          insertText: snip.snippet,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: `5_${snip.label}`,
          range,
        });
      }

      return { suggestions };
    },
  });

  isProviderRegistered = true;
}

export function disposeSqlCompletionProvider(): void {
  if (providerDisposable) {
    providerDisposable.dispose();
    providerDisposable = null;
    isProviderRegistered = false;
  }
}
