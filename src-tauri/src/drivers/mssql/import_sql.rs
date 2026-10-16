use crate::models::import::{ImportRowError, ImportRowPayload};
use crate::models::schema::ColumnItem;
use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime};

/// Rows per TDS batch. Kept small so the generated script stays a few hundred KB.
pub const MAX_BATCH_ROWS: usize = 200;
/// Hard cap per batch script, so very wide rows shrink the batch instead of blowing memory.
pub const MAX_BATCH_SCRIPT_BYTES: usize = 1_000_000;
/// Session scoped error table used by the per-row TRY/CATCH wrappers.
pub const ERROR_TABLE: &str = "#sqlight_import_err";

pub fn quote_identifier(name: &str) -> String {
    format!("[{}]", name.replace(']', "]]"))
}

pub fn qualified_table(schema: &str, table: &str) -> String {
    format!("{}.{}", quote_identifier(schema), quote_identifier(table))
}

/// Columns an INSERT may write, in table order (computed / rowversion are server generated).
pub fn writable_columns(columns: &[ColumnItem]) -> Vec<ColumnItem> {
    columns
        .iter()
        .filter(|c| !c.is_computed && !c.is_row_version)
        .cloned()
        .collect()
}

/// Columns the TSV payload must provide, in table order.
///
/// Identity columns are always part of the payload: the values are sent with the INSERT and
/// the database reports the error when `SET IDENTITY_INSERT` is not enabled.
pub fn import_columns(columns: &[ColumnItem]) -> Vec<ColumnItem> {
    writable_columns(columns)
}

pub fn column_list_sql(columns: &[ColumnItem]) -> String {
    columns
        .iter()
        .map(|c| quote_identifier(&c.name))
        .collect::<Vec<_>>()
        .join(", ")
}

fn nstring_literal(value: &str) -> String {
    format!("N'{}'", value.replace('\'', "''"))
}

fn is_valid_integer(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.is_empty() {
        return false;
    }
    let digits = match bytes[0] {
        b'+' | b'-' => &bytes[1..],
        _ => bytes,
    };
    !digits.is_empty() && digits.iter().all(|b| b.is_ascii_digit())
}

fn is_valid_decimal(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.is_empty() {
        return false;
    }
    let mut idx = usize::from(bytes[0] == b'+' || bytes[0] == b'-');
    let mut digits = 0usize;
    let mut seen_dot = false;
    while idx < bytes.len() {
        let b = bytes[idx];
        if b.is_ascii_digit() {
            digits += 1;
        } else if b == b'.' {
            if seen_dot {
                return false;
            }
            seen_dot = true;
        } else {
            return false;
        }
        idx += 1;
    }
    digits > 0
}

fn is_valid_float(value: &str) -> bool {
    let mut parts = value.split(['e', 'E']);
    let mantissa = parts.next().unwrap_or("");
    let exponent = parts.next();
    if parts.next().is_some() || !is_valid_decimal(mantissa) {
        return false;
    }
    match exponent {
        None => true,
        Some(exp) => {
            let exp = exp.strip_prefix('+').or_else(|| exp.strip_prefix('-')).unwrap_or(exp);
            !exp.is_empty() && exp.bytes().all(|b| b.is_ascii_digit())
        }
    }
}

fn is_valid_hex_bytes(value: &str) -> bool {
    let rest = match value.strip_prefix("0x").or_else(|| value.strip_prefix("0X")) {
        Some(rest) => rest,
        None => return false,
    };
    !rest.is_empty() && rest.len() % 2 == 0 && rest.bytes().all(|b| b.is_ascii_hexdigit())
}

fn is_valid_guid(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    for (idx, b) in bytes.iter().enumerate() {
        match idx {
            8 | 13 | 18 | 23 => {
                if *b != b'-' {
                    return false;
                }
            }
            _ => {
                if !b.is_ascii_hexdigit() {
                    return false;
                }
            }
        }
    }
    value.starts_with('{') == false && !value.starts_with('(')
}

fn is_valid_date(value: &str) -> bool {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}

fn is_valid_time(value: &str) -> bool {
    NaiveTime::parse_from_str(value, "%H:%M:%S%.f").is_ok()
        || NaiveTime::parse_from_str(value, "%H:%M").is_ok()
}

fn is_valid_datetime(value: &str) -> bool {
    NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.f").is_ok()
        || NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S").is_ok()
}

fn is_valid_datetime_offset(value: &str) -> bool {
    DateTime::parse_from_rfc3339(value).is_ok()
}

fn invalid_value_error(column: &ColumnItem, reason: &str) -> String {
    format!("欄位 [{}] 的值不符合型別 {}：{}", column.name, column.data_type, reason)
}

/// Builds the SQL literal for one cell. Every non whitelisted value is quoted and escaped,
/// so nothing from the payload can escape the statement.
pub fn literal_for(value: Option<&str>, column: &ColumnItem) -> Result<String, String> {
    let raw = match value {
        None => return Ok("NULL".to_string()),
        Some(raw) => raw,
    };
    if raw.contains('\n') || raw.contains('\r') {
        return Err(invalid_value_error(column, "不可包含換行字元"));
    }

    let data_type = column.data_type.to_ascii_lowercase();
    match data_type.as_str() {
        "bit" => match raw.to_ascii_lowercase().as_str() {
            "1" | "true" => Ok("CAST(1 AS bit)".to_string()),
            "0" | "false" => Ok("CAST(0 AS bit)".to_string()),
            _ => Err(invalid_value_error(column, "必須是 1/0 或 true/false")),
        },
        "tinyint" | "smallint" | "int" | "bigint" => {
            if is_valid_integer(raw) {
                Ok(raw.to_string())
            } else {
                Err(invalid_value_error(column, "必須是整數"))
            }
        }
        "decimal" | "numeric" | "money" | "smallmoney" => {
            if is_valid_decimal(raw) {
                Ok(raw.to_string())
            } else {
                Err(invalid_value_error(column, "必須是數值"))
            }
        }
        "float" | "real" => {
            if is_valid_float(raw) {
                Ok(raw.to_string())
            } else {
                Err(invalid_value_error(column, "必須是浮點數"))
            }
        }
        "uniqueidentifier" => {
            if is_valid_guid(raw) {
                Ok(format!("CONVERT(uniqueidentifier, {})", nstring_literal(raw)))
            } else {
                Err(invalid_value_error(column, "必須是 GUID 格式"))
            }
        }
        "binary" | "varbinary" | "image" => {
            if is_valid_hex_bytes(raw) {
                Ok(raw.to_string())
            } else {
                Err(invalid_value_error(column, "必須是 0x 開頭的十六進位字串"))
            }
        }
        "date" => {
            if is_valid_date(raw) {
                Ok(format!("CONVERT(date, {}, 23)", nstring_literal(raw)))
            } else {
                Err(invalid_value_error(column, "必須是 YYYY-MM-DD"))
            }
        }
        "datetime" | "smalldatetime" | "datetime2" => {
            if is_valid_datetime(raw) {
                Ok(format!(
                    "CONVERT({}, {}, 126)",
                    quote_identifier(&column.data_type),
                    nstring_literal(raw)
                ))
            } else {
                Err(invalid_value_error(column, "必須是 YYYY-MM-DDThh:mm:ss[.fffffff]"))
            }
        }
        "time" => {
            if is_valid_time(raw) {
                Ok(format!(
                    "CONVERT({}, {})",
                    quote_identifier(&column.data_type),
                    nstring_literal(raw)
                ))
            } else {
                Err(invalid_value_error(column, "必須是 hh:mm[:ss[.fffffff]]"))
            }
        }
        "datetimeoffset" => {
            if is_valid_datetime_offset(raw) {
                Ok(format!(
                    "CONVERT({}, {})",
                    quote_identifier(&column.data_type),
                    nstring_literal(raw)
                ))
            } else {
                Err(invalid_value_error(column, "必須包含時區位移，例如 2026-01-01T10:00:00+08:00"))
            }
        }
        "char" | "varchar" | "nchar" | "nvarchar" | "text" | "ntext" | "xml" | "sysname" => {
            Ok(nstring_literal(raw))
        }
        _ => {
            // Not in the whitelist (geography, geometry, hierarchyid, sql_variant, CLR types, ...).
            // The database is asked to convert the value; failures roll the whole import back.
            if !is_safe_type_name(&column.data_type) {
                return Err(invalid_value_error(column, "型別名稱無法安全引用"));
            }
            Ok(format!(
                "CAST({} AS {})",
                nstring_literal(raw),
                quote_identifier(&column.data_type)
            ))
        }
    }
}

fn is_safe_type_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$' || c == '#')
}

#[derive(Debug, Clone)]
pub struct PreparedRow {
    pub line: u32,
    pub statement: String,
}

/// Converts the payload rows into one INSERT statement per row, wrapped in TRY/CATCH so a
/// failing row is reported with its original line number instead of aborting the batch.
pub fn prepare_rows(
    rows: &[ImportRowPayload],
    columns: &[ColumnItem],
    qualified: &str,
) -> (Vec<PreparedRow>, Vec<ImportRowError>) {
    let column_list = column_list_sql(columns);
    let mut prepared = Vec::with_capacity(rows.len());
    let mut errors = Vec::new();

    for row in rows {
        if row.values.len() != columns.len() {
            errors.push(ImportRowError {
                line: row.line,
                column: None,
                message: format!(
                    "欄位數不符：預期 {} 欄，實際 {} 欄",
                    columns.len(),
                    row.values.len()
                ),
                server_code: None,
            });
            continue;
        }

        let mut literals = Vec::with_capacity(columns.len());
        let mut row_error: Option<ImportRowError> = None;
        for (column, value) in columns.iter().zip(row.values.iter()) {
            match literal_for(value.as_deref(), column) {
                Ok(literal) => literals.push(literal),
                Err(message) => {
                    row_error = Some(ImportRowError {
                        line: row.line,
                        column: Some(column.name.clone()),
                        message,
                        server_code: None,
                    });
                    break;
                }
            }
        }

        if let Some(error) = row_error {
            errors.push(error);
            continue;
        }

        prepared.push(PreparedRow {
            line: row.line,
            statement: format!(
                "BEGIN TRY INSERT INTO {} ({}) VALUES ({}); END TRY BEGIN CATCH INSERT INTO {} (line_no, col_name, message, err_code) VALUES ({}, NULL, ERROR_MESSAGE(), ERROR_NUMBER()); END CATCH;",
                qualified,
                column_list,
                literals.join(", "),
                ERROR_TABLE,
                row.line
            ),
        });
    }

    (prepared, errors)
}

pub fn chunk_prepared_rows(rows: &[PreparedRow]) -> Vec<Vec<&PreparedRow>> {
    let mut batches: Vec<Vec<&PreparedRow>> = Vec::new();
    let mut current: Vec<&PreparedRow> = Vec::new();
    let mut current_bytes = 0usize;

    for row in rows {
        let row_bytes = row.statement.len() + 1;
        if !current.is_empty()
            && (current.len() >= MAX_BATCH_ROWS || current_bytes + row_bytes > MAX_BATCH_SCRIPT_BYTES)
        {
            batches.push(std::mem::take(&mut current));
            current_bytes = 0;
        }
        current.push(row);
        current_bytes += row_bytes;
    }

    if !current.is_empty() {
        batches.push(current);
    }
    batches
}

pub fn build_setup_script(qualified: &str, manual_identity: bool) -> String {
    let mut script = format!(
        "SET XACT_ABORT OFF; IF OBJECT_ID('tempdb..{}') IS NOT NULL DROP TABLE {}; CREATE TABLE {} (line_no INT NOT NULL, col_name NVARCHAR(256) NULL, message NVARCHAR(4000) NOT NULL, err_code INT NULL);",
        ERROR_TABLE, ERROR_TABLE, ERROR_TABLE
    );
    if manual_identity {
        script.push_str(&format!(" SET IDENTITY_INSERT {} ON;", qualified));
    }
    script.push_str(" BEGIN TRANSACTION;");
    script
}

pub fn build_batch_script(statements: &[&PreparedRow]) -> String {
    let mut script = String::new();
    for row in statements {
        script.push_str(&row.statement);
        script.push('\n');
    }
    script.push_str(&format!(
        "SELECT COUNT(*) AS err_count, CAST(XACT_STATE() AS INT) AS xact_state FROM {};",
        ERROR_TABLE
    ));
    script
}

pub fn build_commit_script(qualified: &str, manual_identity: bool) -> String {
    let mut script = String::from("COMMIT;");
    if manual_identity {
        script.push_str(&format!(" SET IDENTITY_INSERT {} OFF;", qualified));
    }
    script.push_str(&format!(
        " IF OBJECT_ID('tempdb..{}') IS NOT NULL DROP TABLE {};",
        ERROR_TABLE, ERROR_TABLE
    ));
    script
}

/// Returns the collected row errors and then always rolls back + releases IDENTITY_INSERT.
pub fn build_rollback_script(qualified: &str, manual_identity: bool) -> String {
    let mut script = format!(
        "SELECT line_no, col_name, message, err_code FROM {} ORDER BY line_no;",
        ERROR_TABLE
    );
    script.push_str(" IF @@TRANCOUNT > 0 ROLLBACK;");
    if manual_identity {
        script.push_str(&format!(" SET IDENTITY_INSERT {} OFF;", qualified));
    }
    script.push_str(&format!(
        " IF OBJECT_ID('tempdb..{}') IS NOT NULL DROP TABLE {};",
        ERROR_TABLE, ERROR_TABLE
    ));
    script
}

#[cfg(test)]
mod tests {
    use super::*;

    fn column(name: &str, data_type: &str) -> ColumnItem {
        ColumnItem {
            name: name.to_string(),
            data_type: data_type.to_string(),
            max_length: None,
            precision: None,
            scale: None,
            is_nullable: true,
            is_primary_key: false,
            is_identity: false,
            is_computed: false,
            is_row_version: false,
            default_definition: None,
            collation: None,
            computed_expression: None,
            is_persisted: false,
            identity_seed: None,
            identity_increment: None,
        }
    }

    #[test]
    fn identifiers_escape_closing_brackets() {
        assert_eq!(quote_identifier("we]rd"), "[we]]rd]");
        assert_eq!(qualified_table("dbo", "Users"), "[dbo].[Users]");
    }

    #[test]
    fn import_columns_skip_only_generated_columns() {
        let mut identity = column("Id", "int");
        identity.is_identity = true;
        let mut computed = column("Total", "decimal");
        computed.is_computed = true;
        let mut rowversion = column("Ver", "timestamp");
        rowversion.is_row_version = true;
        let columns = vec![identity, computed, rowversion, column("Name", "nvarchar")];

        assert_eq!(
            import_columns(&columns)
                .iter()
                .map(|c| c.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Id", "Name"]
        );
    }

    #[test]
    fn literals_escape_quotes_and_reject_unparsable_values() {
        let name = column("Name", "nvarchar");
        assert_eq!(literal_for(Some("O'Brien"), &name).unwrap(), "N'O''Brien'");
        assert_eq!(literal_for(None, &name).unwrap(), "NULL");
        assert!(literal_for(Some("line\nbreak"), &name).is_err());

        let amount = column("Amount", "decimal");
        assert_eq!(literal_for(Some("-12.50"), &amount).unwrap(), "-12.50");
        assert!(literal_for(Some("12,50"), &amount).is_err());
        assert!(literal_for(Some("1.2.3"), &amount).is_err());

        let flag = column("Active", "bit");
        assert_eq!(literal_for(Some("true"), &flag).unwrap(), "CAST(1 AS bit)");
        assert_eq!(literal_for(Some("0"), &flag).unwrap(), "CAST(0 AS bit)");
        assert!(literal_for(Some("maybe"), &flag).is_err());
    }

    #[test]
    fn literals_cover_datetime_offsets_guids_and_binary() {
        let created = column("CreatedAt", "datetime2");
        assert_eq!(
            literal_for(Some("2026-09-21T08:30:00.000"), &created).unwrap(),
            "CONVERT([datetime2], N'2026-09-21T08:30:00.000', 126)"
        );
        assert!(literal_for(Some("2026/09/21"), &created).is_err());

        let day = column("Day", "date");
        assert_eq!(
            literal_for(Some("2026-09-21"), &day).unwrap(),
            "CONVERT(date, N'2026-09-21', 23)"
        );
        assert!(literal_for(Some("2026-02-30"), &day).is_err());

        let offset = column("Seen", "datetimeoffset");
        assert!(literal_for(Some("2026-09-21T08:30:00+08:00"), &offset).is_ok());
        assert!(literal_for(Some("2026-09-21T08:30:00"), &offset).is_err());

        let id = column("Id", "uniqueidentifier");
        assert!(literal_for(Some("6F9619FF-8B86-D011-B42D-00C04FC964FF"), &id).is_ok());
        assert!(literal_for(Some("not-a-guid"), &id).is_err());

        let blob = column("Data", "varbinary");
        assert_eq!(literal_for(Some("0x0A0B"), &blob).unwrap(), "0x0A0B");
        assert!(literal_for(Some("0xA0B"), &blob).is_err());
        assert!(literal_for(Some("A0B"), &blob).is_err());
    }

    #[test]
    fn unsupported_types_are_cast_for_the_database_to_validate() {
        let geo = column("Location", "geography");
        assert_eq!(
            literal_for(Some("POINT(1 2)"), &geo).unwrap(),
            "CAST(N'POINT(1 2)' AS [geography])"
        );

        let weird = column("Weird", "bad name; DROP TABLE x");
        assert!(literal_for(Some("1"), &weird).is_err());
    }

    #[test]
    fn prepared_rows_carry_line_numbers_and_report_preparation_errors() {
        let columns = vec![column("Id", "int"), column("Name", "nvarchar")];
        let rows = vec![
            ImportRowPayload {
                line: 2,
                values: vec![Some("1".into()), Some("Ada".into())],
            },
            ImportRowPayload {
                line: 3,
                values: vec![Some("x".into()), Some("Grace".into())],
            },
            ImportRowPayload {
                line: 4,
                values: vec![Some("5".into())],
            },
        ];

        let (prepared, errors) = prepare_rows(&rows, &columns, "[dbo].[Users]");
        assert_eq!(prepared.len(), 1);
        assert!(prepared[0].statement.contains("VALUES (1, N'Ada')"));
        assert!(prepared[0].statement.contains("VALUES (2, NULL, ERROR_MESSAGE(), ERROR_NUMBER())"));
        assert_eq!(errors.len(), 2);
        assert_eq!(errors[0].line, 3);
        assert_eq!(errors[0].column.as_deref(), Some("Id"));
        assert_eq!(errors[1].line, 4);
    }

    #[test]
    fn batches_respect_row_and_size_limits() {
        let rows: Vec<PreparedRow> = (0..(MAX_BATCH_ROWS * 2 + 5))
            .map(|idx| PreparedRow {
                line: idx as u32 + 1,
                statement: "SELECT 1;".to_string(),
            })
            .collect();
        let batches = chunk_prepared_rows(&rows);
        assert_eq!(batches.len(), 3);
        assert_eq!(batches[0].len(), MAX_BATCH_ROWS);
        assert_eq!(batches[2].len(), 5);
    }

    #[test]
    fn scripts_wrap_everything_in_one_transaction() {
        let setup = build_setup_script("[dbo].[Users]", true);
        assert!(setup.contains("BEGIN TRANSACTION;"));
        assert!(setup.contains("SET IDENTITY_INSERT [dbo].[Users] ON;"));
        let commit = build_commit_script("[dbo].[Users]", true);
        assert!(commit.starts_with("COMMIT;"));
        assert!(commit.contains("SET IDENTITY_INSERT [dbo].[Users] OFF;"));
        let rollback = build_rollback_script("[dbo].[Users]", true);
        assert!(rollback.contains("IF @@TRANCOUNT > 0 ROLLBACK;"));
        assert!(rollback.contains("SET IDENTITY_INSERT [dbo].[Users] OFF;"));
    }
}
