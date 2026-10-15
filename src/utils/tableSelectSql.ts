import { wrapIdentifierIfNeeded } from './sqlParser';

/**
 * Builds the plain single-line SELECT statement the app generates for a table.
 *
 * - One line, and no TOP clause: a silent row cap hides the fact that the query did not
 *   return everything, and the statement is a starting point for the user to edit.
 * - No database prefix: the statement runs against the database the tab is bound to.
 * - Identifiers stay bare unless they actually need brackets (spaces, special characters
 *   or reserved words), which is the same treatment the Explorer applies to column names.
 */
export function generateTableSelectSql(
  schema: string | null | undefined,
  table: string
): string {
  const parts: string[] = [];

  const cleanSchema = (schema || '').trim();
  const cleanTable = table.trim();

  if (cleanSchema) {
    parts.push(wrapIdentifierIfNeeded(cleanSchema));
  }
  parts.push(wrapIdentifierIfNeeded(cleanTable));

  return `SELECT * FROM ${parts.join('.')};\n`;
}
