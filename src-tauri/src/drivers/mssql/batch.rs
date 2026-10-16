/// T-SQL GO batch parsing and execution utilities.
///
/// In Microsoft SQL Server, `GO` is not a Transact-SQL statement; it is a command
/// recognized by client utilities (SSMS, sqlcmd, Azure Data Studio) to signal the end
/// of a batch of statements.
///
/// Features:
/// - Accurately recognizes `GO` on its own line (case-insensitive).
/// - Supports optional repeat count (e.g., `GO 5`, `GO 10`).
/// - Supports trailing inline comments (e.g., `GO -- end of batch`).
/// - Protects `GO` inside string literals (`'...'`), bracketed identifiers (`[...]`),
///   quoted identifiers (`"..."`), line comments (`-- ...`), and block comments (`/* ... */`
///   with support for nested comments).
/// - Tracks 1-indexed `start_line` for each batch to enable accurate error line number mapping.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SqlBatch {
    /// The trimmed executable SQL text of this batch, excluding the `GO` line.
    pub sql: String,
    /// 1-indexed line number in the original script where this batch starts.
    pub start_line: usize,
    /// Number of times to execute this batch (specified by `GO <count>`, default 1).
    pub repeat_count: usize,
}

/// Splits a full SQL script into individual executable batches according to T-SQL GO rules.
pub fn split_sql_batches(full_text: &str) -> Vec<SqlBatch> {
    if full_text.trim().is_empty() {
        return Vec::new();
    }

    let raw_lines: Vec<&str> = full_text.split('\n').collect();
    let mut batches = Vec::new();

    let mut in_single_quote = false;
    let mut in_bracket = false;
    let mut in_double_quote = false;
    let mut comment_depth: usize = 0;

    let mut current_batch_lines: Vec<(usize, &str)> = Vec::new();

    for (line_idx, raw_line) in raw_lines.iter().enumerate() {
        // Strip trailing carriage return if present
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        let line_num = line_idx + 1; // 1-indexed

        // We will scan the line character-by-character to mask comments and literals,
        // and determine whether this line is a standalone `GO` statement.
        let mut in_line_comment = false;
        let mut code_chars = Vec::new();

        let chars: Vec<char> = line.chars().collect();
        let len = chars.len();
        let mut i = 0;

        let initial_in_quote = in_single_quote;
        let initial_in_bracket = in_bracket;
        let initial_in_double_quote = in_double_quote;
        let initial_comment_depth = comment_depth;

        while i < len {
            let ch = chars[i];
            let next_ch = if i + 1 < len { chars[i + 1] } else { '\0' };

            if in_line_comment {
                i += 1;
                continue;
            }

            if comment_depth > 0 {
                if ch == '/' && next_ch == '*' {
                    comment_depth += 1;
                    i += 2;
                    continue;
                }
                if ch == '*' && next_ch == '/' {
                    comment_depth -= 1;
                    i += 2;
                    continue;
                }
                i += 1;
                continue;
            }

            if in_single_quote {
                if ch == '\'' {
                    if next_ch == '\'' {
                        // Escaped single quote
                        i += 2;
                        continue;
                    }
                    in_single_quote = false;
                }
                i += 1;
                continue;
            }

            if in_bracket {
                if ch == ']' {
                    if next_ch == ']' {
                        // Escaped bracket
                        i += 2;
                        continue;
                    }
                    in_bracket = false;
                }
                i += 1;
                continue;
            }

            if in_double_quote {
                if ch == '"' {
                    if next_ch == '"' {
                        // Escaped double quote
                        i += 2;
                        continue;
                    }
                    in_double_quote = false;
                }
                i += 1;
                continue;
            }

            // Outside strings, brackets, and comments
            if ch == '-' && next_ch == '-' {
                in_line_comment = true;
                i += 2;
                continue;
            }

            if ch == '/' && next_ch == '*' {
                comment_depth += 1;
                i += 2;
                continue;
            }

            if ch == '\'' {
                in_single_quote = true;
                i += 1;
                continue;
            }

            if ch == '[' {
                in_bracket = true;
                i += 1;
                continue;
            }

            if ch == '"' {
                in_double_quote = true;
                i += 1;
                continue;
            }

            code_chars.push(ch);
            i += 1;
        }

        // A line can only be a GO separator if at the start of the line and throughout the code,
        // it was not inside a multiline literal or block comment.
        let was_free_at_start = !initial_in_quote
            && !initial_in_bracket
            && !initial_in_double_quote
            && initial_comment_depth == 0;
        let is_free_at_end = !in_single_quote
            && !in_bracket
            && !in_double_quote
            && comment_depth == 0;

        let code_str: String = code_chars.into_iter().collect();
        let trimmed_code = code_str.trim();

        if was_free_at_start && is_free_at_end && is_go_command(trimmed_code) {
            let repeat_count = parse_go_count(trimmed_code).unwrap_or(1);

            // Flush accumulated batch
            if let Some(batch) = flush_batch(&current_batch_lines, repeat_count) {
                batches.push(batch);
            }
            current_batch_lines.clear();
        } else {
            current_batch_lines.push((line_num, line));
        }
    }

    // Flush any remaining lines after the last GO
    if let Some(batch) = flush_batch(&current_batch_lines, 1) {
        batches.push(batch);
    }

    batches
}

/// Checks whether the trimmed code represents a GO command.
/// Valid examples:
/// - `GO`
/// - `go`
/// - `GO 5`
/// - `GO 10`
fn is_go_command(trimmed: &str) -> bool {
    if !starts_with_ascii_ci(trimmed, "go") {
        return false;
    }

    // Safe to index by bytes from here: the first two bytes are known to be ASCII "go", so byte 2
    // is a character boundary.
    let remainder = trimmed[2..].trim_start();
    if remainder.is_empty() {
        return true;
    }

    // Must be followed only by digits (the repeat count)
    remainder.chars().all(|c| c.is_ascii_digit())
}

/// ASCII-case-insensitive prefix test that can never split a UTF-8 character.
///
/// The obvious `&sql[..2]` panics the moment byte 2 lands inside a multi-byte character — a line of
/// Chinese text, an accented word, an emoji — and a panicking splitter takes the whole query task
/// down with it: the editor then spins forever with no error and a cancel button that does nothing.
/// Comparing *bytes* against an ASCII needle is safe instead, because a UTF-8 continuation byte is
/// never an ASCII letter.
fn starts_with_ascii_ci(text: &str, prefix: &str) -> bool {
    text.len() >= prefix.len()
        && text.as_bytes()[..prefix.len()].eq_ignore_ascii_case(prefix.as_bytes())
}

/// Parses the optional repeat count from a GO command string.
/// E.g. "GO 5" -> Some(5), "GO" -> None.
fn parse_go_count(trimmed: &str) -> Option<usize> {
    if !starts_with_ascii_ci(trimmed, "go") {
        return None;
    }
    let remainder = trimmed[2..].trim();
    if remainder.is_empty() {
        None
    } else {
        remainder.parse::<usize>().ok()
    }
}

/// Flushes lines into a `SqlBatch` if non-empty, trimming leading and trailing blank lines
/// and accurately computing `start_line`.
fn flush_batch(lines: &[(usize, &str)], repeat_count: usize) -> Option<SqlBatch> {
    if lines.is_empty() {
        return None;
    }

    // Find the first line that has non-whitespace characters
    let first_idx = lines.iter().position(|(_, l)| !l.trim().is_empty())?;
    // Find the last line that has non-whitespace characters
    let last_idx = lines.iter().rposition(|(_, l)| !l.trim().is_empty())?;

    if first_idx > last_idx {
        return None;
    }

    let start_line = lines[first_idx].0;
    let selected_lines: Vec<&str> = lines[first_idx..=last_idx]
        .iter()
        .map(|(_, l)| *l)
        .collect();

    let sql = selected_lines.join("\n").trim().to_string();
    if sql.is_empty() {
        return None;
    }

    Some(SqlBatch {
        sql,
        start_line,
        repeat_count,
    })
}

/// Attempts to detect if a batch's primary intent is a database switch (`USE [dbname]`).
/// Returns the unquoted database name if detected.
pub fn detect_use_database(sql: &str) -> Option<String> {
    let trimmed = sql.trim();
    if !starts_with_ascii_ci(trimmed, "use") {
        return None;
    }
    if !matches!(trimmed.as_bytes().get(3), Some(byte) if byte.is_ascii_whitespace()) {
        return None;
    }
    // Safe to index by bytes: the first three bytes are known to be ASCII "use".
    let rest = trimmed[3..].trim();
    if rest.starts_with('[') {
        let closing = rest.find(']')?;
        let db = &rest[1..closing];
        if !db.trim().is_empty() {
            return Some(db.trim().to_string());
        }
    } else {
        let end_idx = rest
            .find(|c: char| c == ';' || c.is_ascii_whitespace() || c == '-')
            .unwrap_or(rest.len());
        let db = rest[..end_idx].trim();
        if !db.is_empty()
            && !db.contains(|c: char| c == '.' || c == '(' || c == ')' || c == ',')
        {
            return Some(db.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_single_statement_no_go() {
        let sql = "SELECT * FROM Users WHERE id = 1;";
        let batches = split_sql_batches(sql);
        assert_eq!(batches.len(), 1);
        assert_eq!(batches[0].sql, sql);
        assert_eq!(batches[0].start_line, 1);
        assert_eq!(batches[0].repeat_count, 1);
    }

    #[test]
    fn test_single_statement_trailing_go() {
        let sql = "SELECT 1;\nGO";
        let batches = split_sql_batches(sql);
        assert_eq!(batches.len(), 1);
        assert_eq!(batches[0].sql, "SELECT 1;");
        assert_eq!(batches[0].start_line, 1);
        assert_eq!(batches[0].repeat_count, 1);
    }

    #[test]
    fn test_multiple_batches_with_line_numbers() {
        let sql = "USE [master];\nGO\n\n-- Create table\nCREATE TABLE #temp (id INT);\nGO\n\nINSERT INTO #temp VALUES (1);";
        let batches = split_sql_batches(sql);
        assert_eq!(batches.len(), 3);

        assert_eq!(batches[0].sql, "USE [master];");
        assert_eq!(batches[0].start_line, 1);
        assert_eq!(batches[0].repeat_count, 1);

        assert_eq!(batches[1].sql, "-- Create table\nCREATE TABLE #temp (id INT);");
        assert_eq!(batches[1].start_line, 4);
        assert_eq!(batches[1].repeat_count, 1);

        assert_eq!(batches[2].sql, "INSERT INTO #temp VALUES (1);");
        assert_eq!(batches[2].start_line, 8);
        assert_eq!(batches[2].repeat_count, 1);
    }

    #[test]
    fn test_go_repeat_count() {
        let sql = "INSERT INTO #temp VALUES (42);\nGO 5\nSELECT * FROM #temp;\nGO";
        let batches = split_sql_batches(sql);
        assert_eq!(batches.len(), 2);

        assert_eq!(batches[0].sql, "INSERT INTO #temp VALUES (42);");
        assert_eq!(batches[0].repeat_count, 5);
        assert_eq!(batches[0].start_line, 1);

        assert_eq!(batches[1].sql, "SELECT * FROM #temp;");
        assert_eq!(batches[1].repeat_count, 1);
        assert_eq!(batches[1].start_line, 3);
    }

    #[test]
    fn test_go_with_comments() {
        let sql = "SELECT 1;\nGO -- execute first batch\nSELECT 2;\nGO 3 -- repeat three times\nSELECT 3;";
        let batches = split_sql_batches(sql);
        assert_eq!(batches.len(), 3);

        assert_eq!(batches[0].sql, "SELECT 1;");
        assert_eq!(batches[0].repeat_count, 1);

        assert_eq!(batches[1].sql, "SELECT 2;");
        assert_eq!(batches[1].repeat_count, 3);

        assert_eq!(batches[2].sql, "SELECT 3;");
        assert_eq!(batches[2].repeat_count, 1);
    }

    #[test]
    fn test_go_inside_string_literals_ignored() {
        let sql = "SELECT 'GO'\nAS val;\nGO\nSELECT 'Line 1\nGO\nLine 3';";
        let batches = split_sql_batches(sql);
        assert_eq!(batches.len(), 2);

        assert_eq!(batches[0].sql, "SELECT 'GO'\nAS val;");
        assert_eq!(batches[1].sql, "SELECT 'Line 1\nGO\nLine 3';");
    }

    #[test]
    fn test_go_inside_brackets_ignored() {
        let sql = "SELECT [GO] FROM [dbo].[GO_Table];\nGO\nSELECT 1;";
        let batches = split_sql_batches(sql);
        assert_eq!(batches.len(), 2);

        assert_eq!(batches[0].sql, "SELECT [GO] FROM [dbo].[GO_Table];");
        assert_eq!(batches[1].sql, "SELECT 1;");
    }

    #[test]
    fn test_go_inside_nested_comments_ignored() {
        let sql = "SELECT /* outer /* inner GO */ still in comment */ 1;\nGO\nSELECT 2;";
        let batches = split_sql_batches(sql);
        assert_eq!(batches.len(), 2);

        assert_eq!(batches[0].sql, "SELECT /* outer /* inner GO */ still in comment */ 1;");
        assert_eq!(batches[1].sql, "SELECT 2;");
    }

    #[test]
    fn test_consecutive_empty_go_boundaries() {
        let sql = "SELECT 1;\nGO\n\nGO\nGO\nSELECT 2;";
        let batches = split_sql_batches(sql);
        assert_eq!(batches.len(), 2);
        assert_eq!(batches[0].sql, "SELECT 1;");
        assert_eq!(batches[1].sql, "SELECT 2;");
    }

    #[test]
    fn test_case_insensitivity_and_goto() {
        let sql = "SELECT 1;\ngO\nSELECT 2;\nGo 2\n-- GOTO is not a GO boundary\nGOTO Done;\nDone:\nSELECT 3;\nGO";
        let batches = split_sql_batches(sql);
        assert_eq!(batches.len(), 3);
        assert_eq!(batches[0].sql, "SELECT 1;");
        assert_eq!(batches[0].repeat_count, 1);

        assert_eq!(batches[1].sql, "SELECT 2;");
        assert_eq!(batches[1].repeat_count, 2);

        assert_eq!(batches[2].sql, "-- GOTO is not a GO boundary\nGOTO Done;\nDone:\nSELECT 3;");
        assert_eq!(batches[2].repeat_count, 1);
    }

    #[test]
    fn test_detect_use_database() {
        assert_eq!(detect_use_database("USE master;"), Some("master".to_string()));
        assert_eq!(detect_use_database("USE [AdventureWorks2022];"), Some("AdventureWorks2022".to_string()));
        assert_eq!(detect_use_database("use   mydb  "), Some("mydb".to_string()));
        assert_eq!(detect_use_database("USE [My DB] ; -- comment"), Some("My DB".to_string()));
        assert_eq!(detect_use_database("SELECT * FROM tbl;"), None);
        assert_eq!(detect_use_database("USER_NAME()"), None);
        assert_eq!(detect_use_database(""), None);
    }

    /// The editor is full of Chinese comments and strings. A line of multi-byte text used to panic
    /// the splitter ("byte index 2 is not a char boundary"), which killed the query task: the UI
    /// stayed in "executing" forever with no error and a cancel button that did nothing.
    #[test]
    fn multibyte_lines_never_panic_the_splitter() {
        for line in ["無線滑鼠", "資料表 (12)", "é", "😀 emoji", "ｇｏ", "中", "a中b"] {
            let sql = format!("{line}\n\nSELECT 1;\n");
            let batches = split_sql_batches(&sql);

            assert_eq!(batches.len(), 1, "{line} must stay a single batch");
            assert!(batches[0].sql.contains("SELECT 1;"), "{line} keeps its statement");
            assert!(!is_go_command(line), "{line} is not a GO boundary");
            assert!(!is_go_command(&line.to_uppercase()), "{line} is not a GO boundary");
            assert_eq!(detect_use_database(line), None, "{line} is not a USE batch");
        }
    }

    #[test]
    fn go_and_use_detection_still_work_after_the_safe_prefix_check() {
        assert!(is_go_command("GO"));
        assert!(is_go_command("go 5"));
        assert!(is_go_command("Go\n"));
        assert!(!is_go_command("g"));
        assert!(!is_go_command("goto"));
        assert_eq!(parse_go_count("GO 5"), Some(5));
        assert_eq!(parse_go_count("GO"), None);
        assert_eq!(parse_go_count("無線滑鼠"), None);
        assert_eq!(detect_use_database("use"), None, "a bare `use` has no database");
        assert_eq!(detect_use_database("use;"), None);
    }

    /// Documents what the editor sends when the cursor sits on a stray line above a statement: the
    /// statement range is `;`-based, so both lines travel together and the *server* reports the
    /// syntax error. The front end is not supposed to guess here — but it must survive it.
    #[test]
    fn a_stray_line_travels_with_the_statement_below_it() {
        let sql = "無線滑鼠\n\nSELECT * FROM SalesDemo.Products;";
        let batches = split_sql_batches(sql);

        assert_eq!(batches.len(), 1);
        assert_eq!(batches[0].sql, sql);
        assert_eq!(batches[0].start_line, 1);
    }
}
