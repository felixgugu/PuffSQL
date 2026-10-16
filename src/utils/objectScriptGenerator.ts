import type { KeyColumnRef, TableConstraintItem, TableIndexItem, TableTriggerItem } from '@/types/schema';
import { escapeIdentifier } from './sqlGenerator';

/**
 * Object-level scripts for the Explorer: one statement per index, constraint or trigger, which is
 * what the right-click menu on those nodes produces. `generateCreateTableDdl` composes the same
 * builders into a single table script, so a table can be recreated from one tab.
 */
export interface ObjectScriptOptions {
  schema: string;
  table: string;
  /** Emits `USE [db];` in front of the statement when present. */
  database?: string;
}

/** Index types this generator can script; everything else gets an explanatory comment instead. */
const SCRIPTABLE_INDEX_TYPES = ['CLUSTERED', 'NONCLUSTERED'];

export function qualifiedName(schema: string, table: string): string {
  return `${escapeIdentifier(schema)}.${escapeIdentifier(table)}`;
}

export function useDatabaseHeader(database?: string): string {
  return database ? `USE ${escapeIdentifier(database)};\nGO\n\n` : '';
}

export function scriptTitleHeader(title: string): string {
  return `-- ============================================================
-- ${title}
-- 產生時間: ${new Date().toLocaleString()}
-- ============================================================
`;
}

export function formatKeyColumns(columns: KeyColumnRef[]): string {
  return columns
    .map((column) => `${escapeIdentifier(column.name)} ${column.descending ? 'DESC' : 'ASC'}`)
    .join(', ');
}

/** A plain column list — foreign keys and `REFERENCES` do not accept ASC / DESC. */
export function formatColumnList(columns: KeyColumnRef[]): string {
  return columns.map((column) => escapeIdentifier(column.name)).join(', ');
}

export function isScriptableIndex(index: TableIndexItem): boolean {
  return SCRIPTABLE_INDEX_TYPES.includes(index.typeDesc.toUpperCase());
}

/** `CLUSTERED` / `NONCLUSTERED` / `CLUSTERED COLUMNSTORE` → `NONCLUSTERED` for the badge. */
export function indexBadgeType(index: TableIndexItem): string {
  const type = index.typeDesc.toUpperCase();
  if (type.includes('COLUMNSTORE')) return 'COLUMNSTORE';
  return type;
}

/**
 * Recreates one index.
 *
 * A PRIMARY KEY / UNIQUE constraint is stored as an index, so scripting one has to produce the
 * `ALTER TABLE … ADD CONSTRAINT` form — `CREATE INDEX` with the same name would not be a constraint.
 */
export function generateIndexCreateScript(index: TableIndexItem, options: ObjectScriptOptions): string {
  const target = qualifiedName(options.schema, options.table);
  const name = escapeIdentifier(index.name);
  const keys = formatKeyColumns(index.columns.filter((column) => !column.isIncluded));

  if (index.isPrimaryKey) {
    return `ALTER TABLE ${target} ADD CONSTRAINT ${name} PRIMARY KEY ${indexClusteredKeyword(
      index
    )} (${keys});`;
  }
  if (index.isUniqueConstraint) {
    return `ALTER TABLE ${target} ADD CONSTRAINT ${name} UNIQUE ${indexClusteredKeyword(index)} (${keys});`;
  }
  if (!isScriptableIndex(index)) {
    return `-- 索引 ${name} 的型別為 ${index.typeDesc}，指令碼未自動產生，請於 SSMS 或手動撰寫。`;
  }

  const included = index.columns.filter((column) => column.isIncluded);
  const lines = [
    `CREATE ${index.isUnique ? 'UNIQUE ' : ''}${index.typeDesc.toUpperCase()} INDEX ${name}`,
    `    ON ${target} (${keys})`,
  ];
  if (included.length > 0) {
    lines.push(`    INCLUDE (${included.map((column) => escapeIdentifier(column.name)).join(', ')})`);
  }
  if (index.filterDefinition) {
    lines.push(`    WHERE ${index.filterDefinition}`);
  }

  const statement = `${lines.join('\n')};`;
  if (!index.isDisabled) {
    return statement;
  }
  return `${statement}

-- 來源資料庫的此索引為停用狀態
ALTER INDEX ${name} ON ${target} DISABLE;`;
}

function indexClusteredKeyword(index: TableIndexItem): string {
  // The index type carries this: sys.indexes reports a constraint's backing index the same way.
  return index.typeDesc.toUpperCase().startsWith('NONCLUSTERED') ? 'NONCLUSTERED' : 'CLUSTERED';
}

export function generateIndexDropScript(index: TableIndexItem, options: ObjectScriptOptions): string {
  const target = qualifiedName(options.schema, options.table);
  const name = escapeIdentifier(index.name);

  return `IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'${target}') AND name = N'${index.name.replace(
    /'/g,
    "''"
  )}')
    DROP INDEX ${name} ON ${target};`;
}

export function generateIndexRebuildScript(indexName: string, options: ObjectScriptOptions): string {
  return `ALTER INDEX ${escapeIdentifier(indexName)} ON ${qualifiedName(
    options.schema,
    options.table
  )} REBUILD WITH (ONLINE = ON);`;
}

export function generateIndexReorganizeScript(indexName: string, options: ObjectScriptOptions): string {
  return `ALTER INDEX ${escapeIdentifier(indexName)} ON ${qualifiedName(
    options.schema,
    options.table
  )} REORGANIZE;`;
}

/** `SET_NULL` → `SET NULL`, `NO_ACTION` → `NO ACTION`, … */
function referentialAction(action: string | null): string | null {
  if (!action) return null;
  const normalized = action.toUpperCase();
  if (normalized === 'NO_ACTION') return 'NO ACTION';
  return normalized.replace(/_/g, ' ');
}

/** Recreates one constraint with `ALTER TABLE`, the form that works for every kind. */
export function generateConstraintCreateScript(
  constraint: TableConstraintItem,
  options: ObjectScriptOptions
): string {
  const target = qualifiedName(options.schema, options.table);
  const name = escapeIdentifier(constraint.name);
      const keys = formatKeyColumns(constraint.keyColumns);

  switch (constraint.kind) {
    case 'PRIMARY_KEY':
      return `ALTER TABLE ${target} ADD CONSTRAINT ${name} PRIMARY KEY ${
        constraint.isClustered === false ? 'NONCLUSTERED' : 'CLUSTERED'
      } (${keys});`;
    case 'UNIQUE':
      return `ALTER TABLE ${target} ADD CONSTRAINT ${name} UNIQUE ${
        constraint.isClustered ? 'CLUSTERED' : 'NONCLUSTERED'
      } (${keys});`;
    case 'CHECK':
      return generateCheckConstraintScript(constraint, options);
    case 'DEFAULT':
      return constraint.definition && constraint.defaultColumn
        ? `ALTER TABLE ${target} ADD CONSTRAINT ${name} DEFAULT ${constraint.definition} FOR ${escapeIdentifier(
            constraint.defaultColumn
          )};`
        : `-- 預設值約束 ${name} 的定義無法讀取（可能缺少 VIEW DEFINITION 權限）`;
    case 'FOREIGN_KEY': {
      const referenced = constraint.refSchema && constraint.refTable
        ? `${escapeIdentifier(constraint.refSchema)}.${escapeIdentifier(constraint.refTable)}`
        : null;
      if (!referenced || constraint.refColumns.length === 0) {
        return `-- 外鍵 ${name} 的參照目標無法讀取`;
      }
      const actions: string[] = [];
      const onDelete = referentialAction(constraint.onDelete);
      const onUpdate = referentialAction(constraint.onUpdate);
      if (onDelete && onDelete !== 'NO ACTION') actions.push(`ON DELETE ${onDelete}`);
      if (onUpdate && onUpdate !== 'NO ACTION') actions.push(`ON UPDATE ${onUpdate}`);

      return [
        // `WITH NOCHECK` reproduces an untrusted foreign key: it stays enabled for new rows
        // without re-validating the ones already there.
        `ALTER TABLE ${target} ${constraint.isNotTrusted ? 'WITH NOCHECK ' : ''}ADD CONSTRAINT ${name} FOREIGN KEY (${formatColumnList(constraint.keyColumns)})`,
        `    REFERENCES ${referenced} (${constraint.refColumns
          .map((column) => escapeIdentifier(column))
          .join(', ')})${actions.length > 0 ? ` ${actions.join(' ')}` : ''};`,
      ].join('\n');
    }
    default:
      return `-- 未知的約束類型：${constraint.kind}`;
  }
}

/**
 * Recreates a CHECK constraint.
 *
 * `CREATE TABLE` cannot express an untrusted constraint, so those have to be added afterwards with
 * `WITH NOCHECK` — which keeps them enabled while skipping validation of existing rows. Without it
 * a recreated constraint would be stricter than the one it replaces.
 */
export function generateCheckConstraintScript(
  constraint: TableConstraintItem,
  options: ObjectScriptOptions
): string {
  if (!constraint.definition) {
    return `-- 條件約束 ${escapeIdentifier(constraint.name)} 的定義無法讀取（可能缺少 VIEW DEFINITION 權限）`;
  }

  return `ALTER TABLE ${qualifiedName(options.schema, options.table)} ${
    constraint.isNotTrusted ? 'WITH NOCHECK ' : ''
  }ADD CONSTRAINT ${escapeIdentifier(constraint.name)} CHECK ${constraint.definition};`;
}

export function generateConstraintDropScript(
  constraintName: string,
  options: ObjectScriptOptions
): string {
  return `ALTER TABLE ${qualifiedName(options.schema, options.table)} DROP CONSTRAINT ${escapeIdentifier(
    constraintName
  )};`;
}

/** `ALTER TABLE … NOCHECK CONSTRAINT`, used for constraints that are disabled or untrusted. */
export function generateNoCheckConstraintScript(
  constraintName: string,
  options: ObjectScriptOptions
): string {
  return `ALTER TABLE ${qualifiedName(options.schema, options.table)} NOCHECK CONSTRAINT ${escapeIdentifier(
    constraintName
  )};`;
}

/**
 * Recreates one trigger from its module definition.
 *
 * `sys.sql_modules.definition` already holds the full `CREATE TRIGGER` statement (including the
 * `ON [schema].[table]` clause), so it is emitted verbatim behind a guarded drop.
 */
export function generateTriggerCreateScript(
  trigger: TableTriggerItem,
  options: ObjectScriptOptions
): string {
  const name = escapeIdentifier(trigger.name);
  const lines = [
    `IF OBJECT_ID(N'${qualifiedLiteral(options.schema, trigger.name)}', N'TR') IS NOT NULL`,
    `    DROP TRIGGER ${name};`,
    'GO',
    '',
  ];

  if (trigger.definition) {
    lines.push(trigger.definition.trimEnd(), 'GO');
  } else {
    lines.push(
      `-- 觸發程序 ${name} 的定義無法讀取（可能為加密物件或缺少 VIEW DEFINITION 權限）`,
      'GO'
    );
  }

  if (trigger.isDisabled) {
    lines.push(
      '',
      '-- 來源資料庫的此觸發程序為停用狀態',
      `DISABLE TRIGGER ${name} ON ${qualifiedName(options.schema, options.table)};`,
      'GO'
    );
  }

  return lines.join('\n');
}

export function generateTriggerDropScript(triggerName: string, options: ObjectScriptOptions): string {
  return `IF OBJECT_ID(N'${qualifiedLiteral(options.schema, triggerName)}', N'TR') IS NOT NULL
    DROP TRIGGER ${escapeIdentifier(triggerName)};`;
}

/** `[dbo].[trg]` as a string literal (quotes doubled) for `OBJECT_ID(N'…')`. */
function qualifiedLiteral(schema: string, name: string): string {
  return `${escapeIdentifier(schema)}.${escapeIdentifier(name)}`.replace(/'/g, "''");
}
