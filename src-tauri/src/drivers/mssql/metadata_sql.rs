//! Metadata SQL for one table or view node in the Explorer.
//!
//! [`table_objects_batch`] is a single batch whose result sets arrive in this fixed order, which is
//! how `MssqlConnection::get_table_objects` reads them back:
//!
//! | # | Result set | Shape |
//! |---|---|---|
//! | 0 | columns | one row per column, in ordinal order |
//! | 1 | PRIMARY KEY / UNIQUE | one row per key column, grouped by constraint name |
//! | 2 | CHECK | one row per constraint |
//! | 3 | DEFAULT | one row per constraint |
//! | 4 | FOREIGN KEY | one row per referencing column pair, in constraint order |
//! | 5 | indexes | one row per key or included column, grouped by index name |
//! | 6 | triggers | one row per trigger, with its event list and definition |
//!
//! Everything stays inside SQL Server 2012 compatibility: no `STRING_AGG`, and `FOR XML PATH`
//! (`.value('.', …)`) for the trigger event list, the same technique the Explorer schema export
//! already relies on.

/// Quotes a string literal for the catalog queries (`'` is doubled).
fn literal(value: &str) -> String {
    format!("N'{}'", value.replace('\'', "''"))
}

/// Columns of a table or view, including the parts the DDL script needs.
///
/// `INFORMATION_SCHEMA.COLUMNS` stays the base of this query so `CHARACTER_MAXIMUM_LENGTH` keeps
/// meaning "characters" (`nvarchar(50)` → 50) exactly as it always has for the grid, the TSV import
/// and the ER diagram; the `sys.*` joins only add the attributes that schema catalog cannot report
/// (default, collation, computed expression, persisted flag, identity seed / increment).
pub fn columns_select(schema: &str, table: &str) -> String {
    format!(
        r#"
SELECT
    c.COLUMN_NAME,
    c.DATA_TYPE,
    CAST(c.CHARACTER_MAXIMUM_LENGTH AS INT) AS CHARACTER_MAXIMUM_LENGTH,
    CAST(c.NUMERIC_PRECISION AS INT) AS NUMERIC_PRECISION,
    CAST(c.NUMERIC_SCALE AS INT) AS NUMERIC_SCALE,
    CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS IS_NULLABLE,
    CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS IS_PRIMARY_KEY,
    CASE WHEN ic.object_id IS NULL THEN 0 ELSE 1 END AS IS_IDENTITY,
    CASE WHEN cc.object_id IS NULL THEN 0 ELSE 1 END AS IS_COMPUTED,
    CASE WHEN c.DATA_TYPE IN ('timestamp', 'rowversion') THEN 1 ELSE 0 END AS IS_ROW_VERSION,
    ISNULL(dc.definition, N'') AS DEFAULT_DEFINITION,
    ISNULL(c.COLLATION_NAME, N'') AS COLLATION_NAME,
    ISNULL(cc.definition, N'') AS COMPUTED_EXPRESSION,
    CAST(ISNULL(cc.is_persisted, 0) AS INT) AS IS_PERSISTED,
    CAST(ic.seed_value AS BIGINT) AS IDENTITY_SEED,
    CAST(ic.increment_value AS BIGINT) AS IDENTITY_INCREMENT
FROM INFORMATION_SCHEMA.COLUMNS c
LEFT JOIN (
    SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
        ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
        AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
    WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
) pk ON c.TABLE_SCHEMA = pk.TABLE_SCHEMA
    AND c.TABLE_NAME = pk.TABLE_NAME
    AND c.COLUMN_NAME = pk.COLUMN_NAME
LEFT JOIN sys.objects so
    ON so.name = c.TABLE_NAME
    AND SCHEMA_NAME(so.schema_id) = c.TABLE_SCHEMA
    AND so.is_ms_shipped = 0
LEFT JOIN sys.columns sc
    ON sc.object_id = so.object_id AND sc.name = c.COLUMN_NAME
LEFT JOIN sys.default_constraints dc
    ON dc.object_id = sc.default_object_id
LEFT JOIN sys.computed_columns cc
    ON cc.object_id = sc.object_id AND cc.column_id = sc.column_id
LEFT JOIN sys.identity_columns ic
    ON ic.object_id = sc.object_id AND ic.column_id = sc.column_id
WHERE c.TABLE_SCHEMA = {schema} AND c.TABLE_NAME = {table}
ORDER BY c.ORDINAL_POSITION;
"#,
        schema = literal(schema),
        table = literal(table)
    )
}

/// PRIMARY KEY and UNIQUE constraints with their key columns, in key order.
///
/// `sys.key_constraints` carries no enabled/trusted flag of its own — `ALTER TABLE … NOCHECK
/// CONSTRAINT` switches off the backing index, so that index is where the state is read from, and
/// trust is a concept only CHECK and FOREIGN KEY constraints have.
pub fn key_constraints_select(schema: &str, table: &str) -> String {
    format!(
        r#"
SELECT
    kc.name AS CONSTRAINT_NAME,
    CASE kc.type WHEN 'PK' THEN 'PRIMARY_KEY' ELSE 'UNIQUE' END AS CONSTRAINT_KIND,
    CAST(i.is_disabled AS INT) AS IS_DISABLED,
    CASE WHEN i.type = 1 THEN 1 ELSE 0 END AS IS_CLUSTERED,
    c.name AS COLUMN_NAME,
    CAST(ISNULL(ic.is_descending_key, 0) AS INT) AS IS_DESCENDING,
    CAST(ISNULL(ic.key_ordinal, 0) AS INT) AS KEY_ORDINAL
FROM sys.key_constraints kc
INNER JOIN sys.objects o ON o.object_id = kc.parent_object_id
INNER JOIN sys.indexes i
    ON i.object_id = kc.parent_object_id AND i.index_id = kc.unique_index_id
LEFT JOIN sys.index_columns ic
    ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
LEFT JOIN sys.columns c
    ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE SCHEMA_NAME(o.schema_id) = {schema} AND o.name = {table} AND o.is_ms_shipped = 0
ORDER BY kc.name, ic.key_ordinal;
"#,
        schema = literal(schema),
        table = literal(table)
    )
}

/// CHECK constraints with their predicate.
pub fn check_constraints_select(schema: &str, table: &str) -> String {
    format!(
        r#"
SELECT
    cc.name AS CONSTRAINT_NAME,
    CAST(cc.is_disabled AS INT) AS IS_DISABLED,
    CAST(cc.is_not_trusted AS INT) AS IS_NOT_TRUSTED,
    ISNULL(cc.definition, N'') AS DEFINITION
FROM sys.check_constraints cc
INNER JOIN sys.objects o ON o.object_id = cc.parent_object_id
WHERE SCHEMA_NAME(o.schema_id) = {schema} AND o.name = {table} AND o.is_ms_shipped = 0
ORDER BY cc.name;
"#,
        schema = literal(schema),
        table = literal(table)
    )
}

/// DEFAULT constraints with the column each one belongs to.
///
/// A DEFAULT constraint has no enabled or trusted state to read, so those two fields stay at their
/// defaults on the Rust side.
pub fn default_constraints_select(schema: &str, table: &str) -> String {
    format!(
        r#"
SELECT
    dc.name AS CONSTRAINT_NAME,
    ISNULL(dc.definition, N'') AS DEFINITION,
    c.name AS COLUMN_NAME
FROM sys.default_constraints dc
INNER JOIN sys.objects o ON o.object_id = dc.parent_object_id
LEFT JOIN sys.columns c
    ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE SCHEMA_NAME(o.schema_id) = {schema} AND o.name = {table} AND o.is_ms_shipped = 0
ORDER BY dc.name;
"#,
        schema = literal(schema),
        table = literal(table)
    )
}

/// FOREIGN KEY constraints, one row per referencing column pair.
pub fn foreign_keys_select(schema: &str, table: &str) -> String {
    format!(
        r#"
SELECT
    fk.name AS CONSTRAINT_NAME,
    CAST(fk.is_disabled AS INT) AS IS_DISABLED,
    CAST(fk.is_not_trusted AS INT) AS IS_NOT_TRUSTED,
    fk.delete_referential_action_desc AS ON_DELETE,
    fk.update_referential_action_desc AS ON_UPDATE,
    rs.name AS REF_SCHEMA,
    ro.name AS REF_TABLE,
    pc.name AS FROM_COLUMN,
    rc.name AS TO_COLUMN,
    fkc.constraint_column_id AS CONSTRAINT_COLUMN_ID
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
INNER JOIN sys.objects po ON po.object_id = fk.parent_object_id
INNER JOIN sys.columns pc
    ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
INNER JOIN sys.objects ro ON ro.object_id = fk.referenced_object_id
INNER JOIN sys.schemas rs ON rs.schema_id = ro.schema_id
INNER JOIN sys.columns rc
    ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
WHERE SCHEMA_NAME(po.schema_id) = {schema} AND po.name = {table} AND po.is_ms_shipped = 0
ORDER BY fk.name, fkc.constraint_column_id;
"#,
        schema = literal(schema),
        table = literal(table)
    )
}

/// Indexes with their key and included columns; internal indexes have no name and are skipped.
pub fn indexes_select(schema: &str, table: &str) -> String {
    format!(
        r#"
SELECT
    i.name AS INDEX_NAME,
    i.type_desc AS INDEX_TYPE,
    CAST(i.is_unique AS INT) AS IS_UNIQUE,
    CAST(i.is_primary_key AS INT) AS IS_PRIMARY_KEY,
    CAST(i.is_unique_constraint AS INT) AS IS_UNIQUE_CONSTRAINT,
    CAST(i.is_disabled AS INT) AS IS_DISABLED,
    ISNULL(i.filter_definition, N'') AS FILTER_DEFINITION,
    c.name AS COLUMN_NAME,
    CAST(ISNULL(ic.is_descending_key, 0) AS INT) AS IS_DESCENDING,
    CAST(ISNULL(ic.is_included_column, 0) AS INT) AS IS_INCLUDED,
    CAST(ISNULL(ic.key_ordinal, 0) AS INT) AS KEY_ORDINAL
FROM sys.indexes i
INNER JOIN sys.objects o ON o.object_id = i.object_id
LEFT JOIN sys.index_columns ic
    ON ic.object_id = i.object_id AND ic.index_id = i.index_id
LEFT JOIN sys.columns c
    ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE SCHEMA_NAME(o.schema_id) = {schema} AND o.name = {table}
    AND o.is_ms_shipped = 0 AND i.name IS NOT NULL
ORDER BY i.name, ic.is_included_column, ic.key_ordinal, ic.index_column_id;
"#,
        schema = literal(schema),
        table = literal(table)
    )
}

/// Triggers attached to the object, with their event list and (permission permitting) definition.
pub fn triggers_select(schema: &str, table: &str) -> String {
    format!(
        r#"
SELECT
    tr.name AS TRIGGER_NAME,
    CAST(tr.is_instead_of_trigger AS INT) AS IS_INSTEAD_OF,
    CAST(tr.is_disabled AS INT) AS IS_DISABLED,
    ISNULL(m.definition, N'') AS DEFINITION,
    ISNULL(STUFF((
        SELECT N', ' + te.type_desc
        FROM sys.trigger_events te
        WHERE te.object_id = tr.object_id
        ORDER BY te.type
        FOR XML PATH(''), TYPE
    ).value('.', 'NVARCHAR(MAX)'), 1, 2, N''), N'') AS EVENTS
FROM sys.triggers tr
INNER JOIN sys.objects o ON o.object_id = tr.parent_id
LEFT JOIN sys.sql_modules m ON m.object_id = tr.object_id
WHERE SCHEMA_NAME(o.schema_id) = {schema} AND o.name = {table} AND tr.is_ms_shipped = 0
ORDER BY tr.name;
"#,
        schema = literal(schema),
        table = literal(table)
    )
}

/// The whole Explorer payload for one object in a single round trip (result sets in the order
/// documented on this module).
pub fn table_objects_batch(schema: &str, table: &str) -> String {
    [
        columns_select(schema, table),
        key_constraints_select(schema, table),
        check_constraints_select(schema, table),
        default_constraints_select(schema, table),
        foreign_keys_select(schema, table),
        indexes_select(schema, table),
        triggers_select(schema, table),
    ]
    .concat()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn batch_covers_every_object_the_explorer_lists() {
        let sql = table_objects_batch("dbo", "Orders");

        for catalog in [
            "INFORMATION_SCHEMA.COLUMNS",
            "sys.key_constraints",
            "sys.check_constraints",
            "sys.default_constraints",
            "sys.foreign_keys",
            "sys.indexes",
            "sys.triggers",
            "sys.computed_columns",
            "sys.identity_columns",
            "sys.sql_modules",
            "sys.trigger_events",
        ] {
            assert!(sql.contains(catalog), "batch must consult {catalog}");
        }
        assert_eq!(sql.matches("\nSELECT").count(), 7, "one result set per object kind");
    }

    #[test]
    fn batch_stays_sql_server_2012_compatible() {
        let sql = table_objects_batch("dbo", "Orders");

        assert!(!sql.contains("STRING_AGG"), "STRING_AGG needs SQL Server 2017");
        assert!(sql.contains("FOR XML PATH(''), TYPE"), "trigger events use FOR XML PATH");
    }

    #[test]
    fn identifiers_are_escaped_and_never_interpolated_raw() {
        let sql = columns_select("we'ird", "or]ders");

        assert!(sql.contains("c.TABLE_SCHEMA = N'we''ird'"), "single quotes are doubled");
        assert!(sql.contains("c.TABLE_NAME = N'or]ders'"), "the table literal is quoted");
        assert!(table_objects_batch("dbo", "it's").contains("o.name = N'it''s'"));
    }

    #[test]
    fn trigger_events_are_ordered_deterministically() {
        assert!(triggers_select("dbo", "Orders").contains("ORDER BY te.type"));
    }

    /// Column names that look plausible but do not exist on the catalog view they were written
    /// against. Each of these shipped once and only failed against a real server — the batch is a
    /// single statement, so one bad name takes the whole Explorer node down.
    #[test]
    fn catalog_lookups_only_use_columns_that_exist() {
        let batch = table_objects_batch("dbo", "Orders");

        assert!(
            !batch.contains("kc.is_disabled") && !batch.contains("kc.is_not_trusted"),
            "sys.key_constraints has neither; a disabled key constraint is a disabled index"
        );
        assert!(
            batch.contains("CAST(i.is_disabled AS INT) AS IS_DISABLED"),
            "PRIMARY KEY / UNIQUE state comes from the backing index"
        );
        assert!(
            !batch.contains("is_clustered"),
            "sys.indexes has no is_clustered — clustered-ness is i.type = 1"
        );
        assert!(
            batch.contains("CASE WHEN i.type = 1 THEN 1 ELSE 0 END AS IS_CLUSTERED"),
            "the backing index type decides clustered vs nonclustered"
        );
        assert!(
            !batch.contains("dc.is_disabled") && !batch.contains("dc.is_not_trusted"),
            "a DEFAULT constraint cannot be disabled or untrusted"
        );
        assert!(
            !batch.contains("COLUMNPROPERTY") && !batch.contains("OBJECT_ID("),
            "identity and computed come from their catalog joins, not from name-built OBJECT_ID"
        );
    }
}
