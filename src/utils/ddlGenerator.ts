import type {
  ColumnItem,
  TableConstraintItem,
  TableIndexItem,
  TableTriggerItem,
} from '@/types/schema';
import { escapeIdentifier } from './sqlGenerator';
import {
  formatKeyColumns,
  generateCheckConstraintScript,
  generateConstraintCreateScript,
  generateIndexCreateScript,
  generateNoCheckConstraintScript,
  generateTriggerCreateScript,
  qualifiedName,
  scriptTitleHeader,
  useDatabaseHeader,
} from './objectScriptGenerator';

export interface DdlOptions {
  tableName: string;
  schema?: string;
  database?: string;
  columns: ColumnItem[];
  /**
   * Filled in by the Explorer from `get_table_objects`. Passing them turns the column list into a
   * script that rebuilds the table — constraints, indexes and triggers included.
   */
  constraints?: TableConstraintItem[];
  indexes?: TableIndexItem[];
  triggers?: TableTriggerItem[];
}

/**
 * Clauses that belong inside `CREATE TABLE`, in the order SQL Server expects them. DEFAULT
 * constraints are not in this list: `DEFAULT … FOR [col]` is an `ALTER TABLE` form, so a default is
 * attached to its column line instead (see `formatColumnDefinition`).
 */
const INLINE_CONSTRAINT_KINDS = ['PRIMARY_KEY', 'UNIQUE', 'CHECK'] as const;

/**
 * Format column data type according to SQL Server standards
 */
export function formatColumnDataType(col: ColumnItem): string {
  const dt = col.dataType.toLowerCase();

  if (dt === 'varchar' || dt === 'char') {
    if (col.maxLength === -1) {
      return `[${dt}](MAX)`;
    }
    if (col.maxLength && col.maxLength > 0) {
      return `[${dt}](${col.maxLength})`;
    }
    return `[${dt}]`;
  }

  if (dt === 'nvarchar' || dt === 'nchar') {
    if (col.maxLength === -1) {
      return `[${dt}](MAX)`;
    }
    if (col.maxLength && col.maxLength > 0) {
      return `[${dt}](${col.maxLength})`;
    }
    return `[${dt}]`;
  }

  if (dt === 'varbinary' || dt === 'binary') {
    if (col.maxLength === -1) {
      return `[${dt}](MAX)`;
    }
    if (col.maxLength && col.maxLength > 0) {
      return `[${dt}](${col.maxLength})`;
    }
    return `[${dt}]`;
  }

  if (dt === 'decimal' || dt === 'numeric') {
    if (col.precision != null) {
      const scale = col.scale != null ? col.scale : 0;
      return `[${dt}](${col.precision}, ${scale})`;
    }
    return `[${dt}](18, 2)`;
  }

  if (dt === 'datetime2' || dt === 'time' || dt === 'datetimeoffset') {
    if (col.scale != null && col.scale !== 7) {
      return `[${dt}](${col.scale})`;
    }
    return `[${dt}]`;
  }

  return `[${dt}]`;
}

/**
 * One column line, including the attributes only computed, identity and defaulted columns have.
 *
 * A named default is written as a column constraint (`[Qty] [int] NOT NULL CONSTRAINT [DF_x] DEFAULT
 * ((1))`) because `CREATE TABLE` has no table-level `DEFAULT … FOR` clause — that spelling only
 * exists in `ALTER TABLE`.
 */
function formatColumnDefinition(col: ColumnItem, defaultConstraint?: TableConstraintItem): string {
  const name = escapeIdentifier(col.name);

  if (col.isComputed) {
    // A computed column declares no type: its expression *is* the definition.
    if (!col.computedExpression) {
      return `    -- 計算欄位 ${name} 的運算式無法讀取，未納入指令碼`;
    }
    return `    ${name} AS ${col.computedExpression}${col.isPersisted ? ' PERSISTED' : ''}`;
  }

  const collation = col.collation ? ` COLLATE ${col.collation}` : '';
  const identity = col.isIdentity
    ? ` IDENTITY(${col.identitySeed ?? 1},${col.identityIncrement ?? 1})`
    : '';
  const nullable = col.isNullable ? 'NULL' : 'NOT NULL';
  const defaultClause = defaultConstraint
    ? defaultConstraint.definition
      ? ` CONSTRAINT ${escapeIdentifier(defaultConstraint.name)} DEFAULT ${defaultConstraint.definition}`
      : ` -- 預設值約束 ${escapeIdentifier(defaultConstraint.name)} 的定義無法讀取，未納入指令碼`
    : '';

  return `    ${name.padEnd(28)} ${formatColumnDataType(col).padEnd(16)}${collation}${identity} ${nullable}${defaultClause}`;
}

/** The constraint clauses that live inside `CREATE TABLE`. */
function formatInlineConstraint(constraint: TableConstraintItem): string | null {
  const name = escapeIdentifier(constraint.name);

  switch (constraint.kind) {
    case 'PRIMARY_KEY':
      return `    CONSTRAINT ${name} PRIMARY KEY ${
        constraint.isClustered === false ? 'NONCLUSTERED' : 'CLUSTERED'
      } (${formatKeyColumns(constraint.keyColumns)})`;
    case 'UNIQUE':
      return `    CONSTRAINT ${name} UNIQUE ${
        constraint.isClustered ? 'CLUSTERED' : 'NONCLUSTERED'
      } (${formatKeyColumns(constraint.keyColumns)})`;
    case 'CHECK':
      // An untrusted CHECK cannot be declared here: `CREATE TABLE` has no `WITH NOCHECK`, and
      // emitting it inline would make the recreated constraint stricter than the original. It is
      // added after the table instead.
      if (!constraint.definition) {
        return `    -- 條件約束 ${name} 的定義無法讀取，未納入指令碼`;
      }
      return constraint.isNotTrusted ? null : `    CONSTRAINT ${name} CHECK ${constraint.definition}`;
    default:
      return null;
  }
}

function section(title: string, statements: string[]): string | null {
  if (statements.length === 0) return null;

  // Trigger scripts already carry their own batch separators, so a separator is only inserted where
  // the previous statement did not end one — no `GO\nGO`.
  const body = statements.reduce(
    (acc, statement) => (acc === '' ? statement : `${acc}${acc.trimEnd().endsWith('GO') ? '\n\n' : '\nGO\n\n'}${statement}`),
    ''
  );
  const trailer = body.trimEnd().endsWith('GO') ? '' : '\nGO';
  return [`-- ---------- ${title} ----------`, body].join('\n') + trailer;
}

/**
 * A full `CREATE` script for one table.
 *
 * Order matters when the script is replayed: the table (with its key, check and default
 * constraints) first, then indexes, then foreign keys — a FK needs the referenced table to exist —
 * and finally triggers. Constraints that are disabled or untrusted in the source database are
 * listed at the end as `NOCHECK` statements, because `CREATE TABLE` cannot express that state.
 */
export function generateCreateTableDdl(options: DdlOptions): string {
  const schema = options.schema || 'dbo';
  const table = options.tableName;
  const constraints = options.constraints ?? [];
  const indexes = options.indexes ?? [];
  const triggers = options.triggers ?? [];
  const target = qualifiedName(schema, table);

  const defaultsByColumn = new Map(
    constraints
      .filter((constraint) => constraint.kind === 'DEFAULT' && constraint.defaultColumn)
      .map((constraint) => [constraint.defaultColumn as string, constraint])
  );

  const columnLines = options.columns.map((column) =>
    formatColumnDefinition(column, defaultsByColumn.get(column.name))
  );
  for (const kind of INLINE_CONSTRAINT_KINDS) {
    for (const constraint of constraints.filter((item) => item.kind === kind)) {
      const clause = formatInlineConstraint(constraint);
      if (clause) columnLines.push(clause);
    }
  }

  const scriptOptions = { schema, table };
  const sections: string[] = [`CREATE TABLE ${target} (\n${columnLines.join(',\n')}\n);`];

  // A PRIMARY KEY / UNIQUE constraint already appears as an index in sys.indexes; scripting both
  // would create it twice, so only secondary indexes are emitted here.
  const secondaryIndexes = indexes.filter((index) => !index.isPrimaryKey && !index.isUniqueConstraint);
  const indexSection = section(
    '索引 (Indexes)',
    secondaryIndexes.map((index) => generateIndexCreateScript(index, scriptOptions))
  );
  if (indexSection) sections.push(indexSection);

  const foreignKeySection = section(
    '外鍵 (Foreign Keys)',
    constraints
      .filter((constraint) => constraint.kind === 'FOREIGN_KEY')
      .map((constraint) => generateConstraintCreateScript(constraint, scriptOptions))
  );
  if (foreignKeySection) sections.push(foreignKeySection);

  const triggerSection = section(
    '觸發程序 (Triggers)',
    triggers.map((trigger) => generateTriggerCreateScript(trigger, scriptOptions))
  );
  if (triggerSection) sections.push(triggerSection);

  // Two different states, two different statements: `WITH NOCHECK ADD` reproduces "untrusted but
  // enabled" (CHECK only — foreign keys carry it inline above), `NOCHECK CONSTRAINT` reproduces
  // "disabled". A constraint that is both gets both, in that order.
  const untrustedChecks = constraints.filter(
    (constraint) => constraint.kind === 'CHECK' && constraint.isNotTrusted && constraint.definition
  );
  const disabled = constraints.filter((constraint) => constraint.isDisabled);
  const noCheckSection = section('來源資料庫中為未受信任或停用的約束', [
    ...untrustedChecks.map((constraint) => generateCheckConstraintScript(constraint, scriptOptions)),
    ...disabled.map((constraint) => generateNoCheckConstraintScript(constraint.name, scriptOptions)),
  ]);
  if (noCheckSection) sections.push(noCheckSection);

  return [
    scriptTitleHeader(`資料表結構 DDL 腳本: ${target}`),
    useDatabaseHeader(options.database),
    sections.join('\n\n'),
    '\n',
  ].join('');
}
