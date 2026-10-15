import { escapeIdentifier } from './sqlGenerator';

/**
 * Builds the plain single-line SELECT statement the app generates for a table.
 *
 * The statement is intentionally kept to one line and carries no TOP clause: it is a
 * starting point for the user to edit, and a silent row cap hides the fact that the
 * query did not return everything.
 */
export function generateTableSelectSql(
  db: string | null | undefined,
  schema: string | null | undefined,
  table: string
): string {
  const parts: string[] = [];

  const cleanDb = (db || '').trim();
  const cleanSchema = (schema || '').trim();
  const cleanTable = table.trim();

  if (cleanDb) {
    parts.push(escapeIdentifier(cleanDb));
  }
  if (cleanSchema) {
    parts.push(escapeIdentifier(cleanSchema));
  }
  parts.push(escapeIdentifier(cleanTable));

  return `SELECT * FROM ${parts.join('.')};\n`;
}
