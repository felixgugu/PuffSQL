import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { formatCellForExport } from '../src/composables/useColumnAutoWidth';
import { type CellValue, type ColumnDef, type ResultSet } from '../src/types/query';
import { type ColumnItem } from '../src/types/schema';
import { detectSpecialType, filterDataViewFields, formatDataViewFields, formatRowForJson, formatRowForMarkdown, formatRowForTsv } from '../src/utils/dataViewFormatters';
import { exportRowAsJson, exportRowsAsMarkdown } from '../src/utils/exportFormatters';
import { DEFAULT_OBJECT_FILTER_PRESETS, DEFAULT_TABLE_FILTER_PRESETS, isDatabaseHiddenByRules, isTableHiddenByRules, testFilterPatternByRules, testTablePatternByRules, type FilterRule, validateRegexPattern } from '../src/utils/tableFilter';
import { MAX_SOURCE_BYTES, buildTableUniqueKeysSql, formatColumnType, parseTsv, parseUniqueKeys, planImportColumns, validateCell, validateImportRows } from '../src/utils/tsvImport';
import { readSource } from './helpers/source';

describe('data_view', () => {
describe('Data View: Field Formatting & Type Detection', () => {
  test('detects NULL values properly', () => {
    assert.deepEqual(detectSpecialType(null), { specialType: 'null', displayValue: 'NULL' });
    assert.deepEqual(detectSpecialType(undefined), { specialType: 'null', displayValue: 'NULL' });
  });

  test('detects empty strings properly', () => {
    assert.deepEqual(detectSpecialType(''), { specialType: 'empty', displayValue: '' });
  });

  test('detects boolean values properly', () => {
    assert.deepEqual(detectSpecialType(true), { specialType: 'boolean', displayValue: 'TRUE' });
    assert.deepEqual(detectSpecialType(false), { specialType: 'boolean', displayValue: 'FALSE' });
  });

  test('detects binary object properly', () => {
    const bin = { type: 'binary', length: 32 };
    const res = detectSpecialType(bin);
    assert.equal(res.specialType, 'binary');
    assert.equal(res.displayValue, '[Binary 32 B]');
  });

  test('detects JSON strings properly and formats them', () => {
    const jsonStr = '{"name": "Alice", "age": 30}';
    const res = detectSpecialType(jsonStr);
    assert.equal(res.specialType, 'json');
    assert.ok(res.formattedJson?.includes('"name": "Alice"'));
  });

  test('detects JSON array strings properly', () => {
    const jsonArr = '[1, 2, 3]';
    const res = detectSpecialType(jsonArr);
    assert.equal(res.specialType, 'json');
    assert.ok(res.formattedJson?.includes('1'));
  });

  test('formats horizontal row into vertical two-column field list preserving order', () => {
    const columns: ColumnDef[] = [
      { name: 'id', dataType: 'int', nullable: false },
      { name: 'name', dataType: 'nvarchar(50)', nullable: false },
      { name: 'email', dataType: 'nvarchar(100)', nullable: true },
      { name: 'status', dataType: 'varchar(20)', nullable: false },
      { name: 'is_active', dataType: 'bit', nullable: false },
    ];
    const row: CellValue[] = [1, 'Tom', 'tom@example.com', 'Active', true];
    const pkSet = new Set(['id']);

    const fields = formatDataViewFields(columns, row, pkSet);

    assert.equal(fields.length, 5);
    assert.equal(fields[0]?.name, 'id');
    assert.equal(fields[0]?.value, 1);
    assert.equal(fields[0]?.isPrimaryKey, true);

    assert.equal(fields[1]?.name, 'name');
    assert.equal(fields[1]?.displayValue, 'Tom');

    assert.equal(fields[2]?.name, 'email');
    assert.equal(fields[2]?.displayValue, 'tom@example.com');

    assert.equal(fields[4]?.name, 'is_active');
    assert.equal(fields[4]?.specialType, 'boolean');
    assert.equal(fields[4]?.displayValue, 'TRUE');
  });
});

describe('Data View: Real-time Filtering', () => {
  const columns: ColumnDef[] = [
    { name: 'user_id', dataType: 'int', nullable: false },
    { name: 'username', dataType: 'nvarchar(50)', nullable: false },
    { name: 'email', dataType: 'nvarchar(100)', nullable: true },
    { name: 'bio', dataType: 'nvarchar(max)', nullable: true },
    { name: 'role', dataType: 'varchar(20)', nullable: false },
  ];
  const row: CellValue[] = [1001, 'alex_chen', 'alex@example.com', 'Senior Developer & DBA', 'Admin'];
  const fields = formatDataViewFields(columns, row);

  test('matches by column name (case-insensitive)', () => {
    const filtered = filterDataViewFields(fields, 'USER');
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0]?.name, 'user_id');
    assert.equal(filtered[1]?.name, 'username');
  });

  test('matches by column value (case-insensitive)', () => {
    const filtered = filterDataViewFields(fields, 'dba');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.name, 'bio');
  });

  test('matches both column name and column value', () => {
    const filtered = filterDataViewFields(fields, 'admin');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.name, 'role');
  });

  test('clearing query restores all fields', () => {
    const filtered = filterDataViewFields(fields, '');
    assert.equal(filtered.length, fields.length);

    const filteredWhitespace = filterDataViewFields(fields, '   ');
    assert.equal(filteredWhitespace.length, fields.length);
  });

  test('non-matching query returns empty array without errors', () => {
    const filtered = filterDataViewFields(fields, 'non_existent_token_xyz');
    assert.equal(filtered.length, 0);
  });
});

describe('Data View: Copy Operations and Consistency with Existing Features', () => {
  const columns: ColumnDef[] = [
    { name: 'id', dataType: 'int', nullable: false },
    { name: 'name', dataType: 'nvarchar(50)', nullable: false },
    { name: 'email', dataType: 'nvarchar(100)', nullable: true },
    { name: 'status', dataType: 'varchar(20)', nullable: false },
  ];
  const row: CellValue[] = [1, 'Tom', 'tom@example.com', 'Active'];

  test('copy as JSON matches exportRowAsJson output exactly', () => {
    const expected = exportRowAsJson(columns, row);
    const actual = formatRowForJson(columns, row);
    assert.equal(actual, expected);

    const parsed = JSON.parse(actual);
    assert.deepEqual(parsed, {
      id: 1,
      name: 'Tom',
      email: 'tom@example.com',
      status: 'Active',
    });
  });

  test('copy as TSV matches formatCellForExport row mapping', () => {
    const expected = row.map(formatCellForExport).join('\t');
    const actual = formatRowForTsv(row);
    assert.equal(actual, expected);
    assert.equal(actual, '1\tTom\ttom@example.com\tActive');
  });

  test('copy as Markdown table matches exportRowsAsMarkdown output exactly', () => {
    const expected = exportRowsAsMarkdown(columns, [row]);
    const actual = formatRowForMarkdown(columns, row);
    assert.equal(actual, expected);
    assert.ok(actual.includes('| id | name | email | status |'));
    assert.ok(actual.includes('| 1 | Tom | tom@example.com | Active |'));
  });

  test('copying copies complete original row even when filtered', () => {
    // 即使在畫面上僅顯示過濾出的 1 個欄位，針對原始資料列的複製依舊是完整全部欄位
    const fields = formatDataViewFields(columns, row);
    const filtered = filterDataViewFields(fields, 'Active');
    assert.equal(filtered.length, 1);

    // 複製仍傳入原始 columns 與 row
    const jsonOutput = formatRowForJson(columns, row);
    const parsed = JSON.parse(jsonOutput);
    assert.equal(Object.keys(parsed).length, 4);
    assert.equal(parsed.id, 1);
    assert.equal(parsed.email, 'tom@example.com');
  });
});
});

describe('table_filter', () => {
describe('Table & Database Filter Utility', () => {
  test('DEFAULT_OBJECT_FILTER_PRESETS provides valid regex presets with targets', () => {
    assert.ok(DEFAULT_OBJECT_FILTER_PRESETS.length >= 7);
    for (const preset of DEFAULT_OBJECT_FILTER_PRESETS) {
      assert.ok(preset.label);
      assert.ok(preset.pattern);
      assert.ok(preset.description);
      assert.ok(['all', 'database', 'table'].includes(preset.target));
      const val = validateRegexPattern(preset.pattern);
      assert.equal(val.isValid, true, `Preset pattern ${preset.pattern} must be valid regex`);
    }
  });

  test('validateRegexPattern detects valid and invalid regex strings', () => {
    assert.equal(validateRegexPattern('^bak_').isValid, true);
    assert.equal(validateRegexPattern('_backup$').isValid, true);
    assert.equal(validateRegexPattern('.*').isValid, true);
    assert.equal(validateRegexPattern('^__EFMigrationsHistory$').isValid, true);
    assert.equal(validateRegexPattern('^(master|model|msdb|tempdb)$').isValid, true);

    assert.equal(validateRegexPattern('').isValid, false);
    assert.equal(validateRegexPattern('   ').isValid, false);

    assert.equal(validateRegexPattern('[').isValid, false);
    assert.equal(validateRegexPattern('(').isValid, false);
    assert.equal(validateRegexPattern('*foo').isValid, false);
  });

  test('isTableHiddenByRules returns false when no rules exist or are disabled', () => {
    const rules: FilterRule[] = [];
    assert.equal(isTableHiddenByRules(rules, 'bak_Users'), false);
    assert.equal(isTableHiddenByRules(rules, 'Orders', 'dbo'), false);

    const disabledRules: FilterRule[] = [
      { id: '1', pattern: '^bak_', target: 'table', enabled: false },
      { id: '2', pattern: '_old$', target: 'all', enabled: false },
    ];
    assert.equal(isTableHiddenByRules(disabledRules, 'bak_Users'), false);
    assert.equal(isTableHiddenByRules(disabledRules, 'Users_old'), false);
  });

  test('isTableHiddenByRules correctly matches prefix and suffix patterns (case-insensitive)', () => {
    const rules: FilterRule[] = [
      { id: '1', pattern: '^bak_', target: 'table', enabled: true },
      { id: '2', pattern: '(_backup|_old)$', target: 'all', enabled: true },
    ];

    assert.equal(isTableHiddenByRules(rules, 'bak_Users'), true);
    assert.equal(isTableHiddenByRules(rules, 'BAK_ORDERS'), true);
    assert.equal(isTableHiddenByRules(rules, 'Users_backup'), true);
    assert.equal(isTableHiddenByRules(rules, 'ORDERS_OLD'), true);
    assert.equal(isTableHiddenByRules(rules, 'Users_bak'), false);
    assert.equal(isTableHiddenByRules(rules, 'Orders'), false);
  });

  test('isTableHiddenByRules matches schema-qualified names as well as plain table names', () => {
    const rules: FilterRule[] = [
      { id: '1', pattern: '^audit\\..*', target: 'table', enabled: true },
      { id: '2', pattern: '^tmp_', target: 'table', enabled: true },
    ];

    assert.equal(isTableHiddenByRules(rules, 'Logins', 'audit'), true);
    assert.equal(isTableHiddenByRules(rules, 'Logins', 'dbo'), false);
    assert.equal(isTableHiddenByRules(rules, 'tmp_Calculations', 'dbo'), true);
    assert.equal(isTableHiddenByRules(rules, 'tmp_Calculations'), true);
    assert.equal(isTableHiddenByRules(rules, 'Calculations', 'dbo'), false);
  });

  test('isDatabaseHiddenByRules filters databases correctly and isolates scope', () => {
    const rules: FilterRule[] = [
      { id: '1', pattern: '^(master|model|msdb|tempdb)$', target: 'database', enabled: true },
      { id: '2', pattern: '^bak_', target: 'table', enabled: true },
      { id: '3', pattern: '.*_archive$', target: 'all', enabled: true },
    ];

    assert.equal(isDatabaseHiddenByRules(rules, 'master'), true);
    assert.equal(isDatabaseHiddenByRules(rules, 'tempdb'), true);
    assert.equal(isDatabaseHiddenByRules(rules, 'TEMPDB'), true); // case-insensitive
    assert.equal(isDatabaseHiddenByRules(rules, 'crm_archive'), true);
    assert.equal(isDatabaseHiddenByRules(rules, 'AdventureWorks'), false);

    // Target isolation: database rule does NOT hide a table with the same name!
    assert.equal(isTableHiddenByRules(rules, 'master', 'dbo'), false);
    assert.equal(isTableHiddenByRules(rules, 'tempdb', 'dbo'), false);

    // Target isolation: table-only rule does NOT hide a database!
    assert.equal(isDatabaseHiddenByRules(rules, 'bak_SalesDB'), false);
    assert.equal(isTableHiddenByRules(rules, 'bak_SalesDB'), true);

    // Target all: hides both database and table
    assert.equal(isDatabaseHiddenByRules(rules, 'crm_archive'), true);
    assert.equal(isTableHiddenByRules(rules, 'orders_archive'), true);
  });

  test('isTableHiddenByRules and isDatabaseHiddenByRules handle malformed regex gracefully', () => {
    const rules: FilterRule[] = [
      { id: '1', pattern: '[unclosed', target: 'all', enabled: true },
      { id: '2', pattern: '^valid_target$', target: 'all', enabled: true },
    ];

    assert.equal(isTableHiddenByRules(rules, 'anything'), false);
    assert.equal(isTableHiddenByRules(rules, 'valid_target'), true);
    assert.equal(isDatabaseHiddenByRules(rules, 'anything'), false);
    assert.equal(isDatabaseHiddenByRules(rules, 'valid_target'), true);
  });

  test('testFilterPatternByRules returns target details for both database and table', () => {
    const rules: FilterRule[] = [
      { id: '1', pattern: '^sys_', target: 'database', enabled: true },
      { id: '2', pattern: '^tmp_', target: 'table', enabled: true },
    ];

    const resDb = testFilterPatternByRules(rules, 'sys_catalog', 'database');
    assert.equal(resDb.isHidden, true);
    assert.equal(resDb.matchedPattern, '^sys_');
    assert.equal(resDb.matchedTarget, 'database');

    // sys_ is not a table rule
    const resDbAsTable = testFilterPatternByRules(rules, 'sys_catalog', 'table');
    assert.equal(resDbAsTable.isHidden, false);

    const resTbl = testFilterPatternByRules(rules, 'tmp_users', 'table');
    assert.equal(resTbl.isHidden, true);
    assert.equal(resTbl.matchedPattern, '^tmp_');

    // tmp_ is not a database rule
    const resTblAsDb = testFilterPatternByRules(rules, 'tmp_users', 'database');
    assert.equal(resTblAsDb.isHidden, false);
  });

  test('updating a filter rule updates pattern, target, and matching behavior', () => {
    const rules: FilterRule[] = [
      { id: 'rule_1', pattern: '^old_pattern_', target: 'table', enabled: true, description: 'initial' },
    ];

    assert.equal(isTableHiddenByRules(rules, 'old_pattern_users'), true);
    assert.equal(isTableHiddenByRules(rules, 'new_pattern_users'), false);
    assert.equal(isDatabaseHiddenByRules(rules, 'old_pattern_db'), false);

    const rule = rules.find((r) => r.id === 'rule_1')!;
    rule.pattern = '^new_pattern_';
    assert.equal(isTableHiddenByRules(rules, 'old_pattern_users'), false);
    assert.equal(isTableHiddenByRules(rules, 'new_pattern_users'), true);

    rule.target = 'database';
    assert.equal(isTableHiddenByRules(rules, 'new_pattern_users'), false);
    assert.equal(isDatabaseHiddenByRules(rules, 'new_pattern_db'), true);

    rule.target = 'all';
    assert.equal(isTableHiddenByRules(rules, 'new_pattern_users'), true);
    assert.equal(isDatabaseHiddenByRules(rules, 'new_pattern_db'), true);
  });
});
});

describe('tsv_import', () => {
function column(name: string, dataType: string, patch: Partial<ColumnItem> = {}): ColumnItem {
  return {
    name,
    dataType,
    maxLength: null,
    precision: null,
    scale: null,
    isNullable: true,
    isPrimaryKey: false,
    isIdentity: false,
    ...patch,
  };
}

function expectValid(raw: string, col: ColumnItem, expected: string | null) {
  const checked = validateCell(raw, { column: planImportColumns([col])[0]!, rawColumn: col });
  assert.equal(checked.ok, true, `${raw} should be valid for ${col.dataType}`);
  assert.equal(checked.value, expected);
}

function expectInvalid(raw: string, col: ColumnItem, reason: string) {
  const checked = validateCell(raw, { column: planImportColumns([col])[0]!, rawColumn: col });
  assert.equal(checked.ok, false, `${raw} should be rejected for ${col.dataType}`);
  assert.equal(checked.reason, reason);
}

test('parseTsv keeps empty fields, handles line endings and reports middle blank lines', () => {
  const parsed = parseTsv('a\t\tc\r\n1\t2\t3\n\nx\t\r', { skipHeader: false });
  assert.equal(parsed.totalLines, 4);
  assert.equal(parsed.headerLine, null);
  assert.deepEqual(parsed.rows.map((row) => row.cells), [
    ['a', '', 'c'],
    ['1', '2', '3'],
    ['x', ''],
  ]);
  assert.deepEqual(parsed.rows.map((row) => row.line), [1, 2, 4]);
  assert.deepEqual(parsed.blankLines, [3]);
});

test('parseTsv skips the header but keeps original line numbers', () => {
  const parsed = parseTsv('id\tname\n1\tAda\n2\tGrace\n', { skipHeader: true });
  assert.equal(parsed.headerLine, 1);
  assert.deepEqual(parsed.rows.map((row) => row.line), [2, 3]);
  assert.deepEqual(parsed.rows[0]!.cells, ['1', 'Ada']);
  assert.deepEqual(parsed.blankLines, []);
});

test('parseTsv ignores trailing newlines and a line made only of tabs stays a data row', () => {
  const parsed = parseTsv('1\t2\n\t\n\n\n', { skipHeader: false });
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows[1]!.cells, ['', '']);
  assert.deepEqual(parsed.blankLines, []);
});

test('planImportColumns keeps identity and only drops generated columns', () => {
  const columns = [
    column('Id', 'int', { isIdentity: true, isPrimaryKey: true }),
    column('Name', 'nvarchar', { maxLength: 50, isNullable: false }),
    column('Total', 'decimal', { isComputed: true, precision: 18, scale: 2 }),
    column('Ver', 'timestamp', { isRowVersion: true }),
    column('Email', 'nvarchar', { maxLength: 100, isPrimaryKey: true, isNullable: false }),
  ];

  const plan = planImportColumns(columns);
  assert.deepEqual(plan.map((entry) => entry.name), ['Id', 'Name', 'Email']);
  assert.deepEqual(plan.map((entry) => entry.index), [0, 1, 2]);
  assert.equal(plan[0]!.isIdentity, true);
  assert.equal(plan[0]!.deferRangeToDatabase, true, 'identity range checks belong to the database');
  assert.equal(plan[1]!.deferRangeToDatabase, false);
  assert.equal(formatColumnType(columns[1]!), 'nvarchar(50)');
  assert.equal(formatColumnType(columns[2]!), 'decimal(18, 2)');
});

test('identity columns only get format checking while range goes to the database', () => {
  const identity = column('Id', 'int', { isNullable: false, isIdentity: true, isPrimaryKey: true });
  expectValid('2147483648', identity, '2147483648');
  expectInvalid('abc', identity, '型別不符');
  expectInvalid('\\N', identity, '必填值缺漏');

  const plain = column('Age', 'int', { isNullable: false });
  expectInvalid('2147483648', plain, '型別不符');
});

test('identity columns are excluded from in-file duplicate detection', () => {
  const rawColumns = [
    column('Id', 'int', { isNullable: false, isIdentity: true, isPrimaryKey: true }),
    column('Email', 'nvarchar', { maxLength: 50, isNullable: false }),
  ];
  const columns = planImportColumns(rawColumns);
  const rows = parseTsv('1\ta@x.com\n1\tb@x.com', { skipHeader: false }).rows;

  const identityPk = validateImportRows({ rows, columns, rawColumns });
  assert.equal(identityPk.errors.length, 0, 'duplicate identity values are reported by the database');
  assert.equal(identityPk.validRows, 2);

  const naturalPk = planImportColumns([
    column('Code', 'nvarchar', { maxLength: 10, isNullable: false, isPrimaryKey: true }),
    column('Email', 'nvarchar', { maxLength: 50, isNullable: false }),
  ]);
  const duplicate = validateImportRows({
    rows: parseTsv('A\ta@x.com\nA\tb@x.com', { skipHeader: false }).rows,
    columns: naturalPk,
  });
  assert.ok(duplicate.errors.some((error) => error.reason === '主鍵重複'));
});

test('validateCell enforces integer ranges and normalizes decimals', () => {
  const tiny = column('Tiny', 'tinyint', { isNullable: false });
  expectValid('255', tiny, '255');
  expectInvalid('256', tiny, '型別不符');
  expectInvalid('-1', tiny, '型別不符');

  const big = column('Big', 'bigint', { isNullable: false });
  expectValid('9223372036854775807', big, '9223372036854775807');
  expectInvalid('9223372036854775808', big, '型別不符');

  const amount = column('Amount', 'decimal', { precision: 18, scale: 2, isNullable: false });
  expectValid('12.50', amount, '12.50');
  expectValid('12.5000', amount, '12.50');
  expectInvalid('12.505', amount, '精度超限');
  expectInvalid('12345678901234567.12', amount, '精度超限');
  expectInvalid('12,5', amount, '型別不符');
});

test('validateCell enforces required, NULL and empty value rules', () => {
  const required = column('Name', 'nvarchar', { maxLength: 10, isNullable: false });
  expectValid('Ada', required, 'Ada');
  expectInvalid('\\N', required, '必填值缺漏');
  expectValid('', required, '');

  const optionalNumber = column('Age', 'int', { isNullable: true });
  expectValid('\\N', optionalNumber, null);
  expectInvalid('', optionalNumber, '型別不符');
});

test('validateCell treats the literal NULL export text as SQL NULL for non-text columns', () => {
  // Grid Copy TSV writes NULL cells as the literal text `NULL`.
  const optionalDate = column('DueDate', 'date', { isNullable: true });
  expectValid('NULL', optionalDate, null);
  expectValid('null', optionalDate, null);
  expectValid('\\N', optionalDate, null);

  const requiredDate = column('StartDate', 'date', { isNullable: false });
  expectInvalid('NULL', requiredDate, '必填值缺漏');

  const optionalNumber = column('Age', 'int', { isNullable: true });
  expectValid('NULL', optionalNumber, null);

  // Text columns keep the literal word as data so genuine `NULL` strings survive.
  const name = column('Name', 'nvarchar', { maxLength: 10, isNullable: true });
  expectValid('NULL', name, 'NULL');
  expectValid('\\N', name, null);
});

test('validateCell checks text length, GUID, binary, dates and booleans', () => {
  const name = column('Name', 'nvarchar', { maxLength: 3, isNullable: false });
  expectValid('abc', name, 'abc');
  expectInvalid('abcd', name, '長度超限');

  const code = column('Code', 'varchar', { maxLength: 4, isNullable: false });
  expectValid('abcd', code, 'abcd');
  expectInvalid('中文', code, '長度超限');

  const flag = column('Active', 'bit', { isNullable: false });
  expectValid('TRUE', flag, '1');
  expectValid('false', flag, '0');
  expectInvalid('maybe', flag, '型別不符');

  const id = column('Id', 'uniqueidentifier', { isNullable: false });
  expectValid('6f9619ff-8b86-d011-b42d-00c04fc964ff', id, '6F9619FF-8B86-D011-B42D-00C04FC964FF');
  expectInvalid('not-a-guid', id, '型別不符');

  const blob = column('Data', 'varbinary', { isNullable: false });
  expectValid('0x0a0b', blob, '0x0a0b');
  expectInvalid('0x0a0', blob, '型別不符');

  const day = column('Day', 'date', { isNullable: false });
  expectValid('2026-02-28', day, '2026-02-28');
  expectInvalid('2026-02-30', day, '型別不符');

  const created = column('CreatedAt', 'datetime2', { isNullable: false });
  expectValid('2026-09-21 08:30:00', created, '2026-09-21T08:30:00');
  expectInvalid('2026/09/21 08:30', created, '型別不符');

  const offset = column('Seen', 'datetimeoffset', { isNullable: false });
  expectValid('2026-09-21T08:30:00+08:00', offset, '2026-09-21T08:30:00+08:00');
  expectInvalid('2026-09-21T08:30:00', offset, '型別不符');
});

test('validateImportRows reports shape, type and duplicate key problems', () => {
  const rawColumns = [
    column('Id', 'int', { isNullable: false, isPrimaryKey: true }),
    column('Email', 'nvarchar', { maxLength: 50, isNullable: false }),
  ];
  const columns = planImportColumns(rawColumns);
  const parsed = parseTsv(
    ['1\ta@x.com', '2\tb@x.com', '2\tc@x.com', 'x\td@x.com', '5', '6\te@x.com', ''].join('\n'),
    { skipHeader: false }
  );

  const result = validateImportRows({
    rows: parsed.rows,
    blankLines: parsed.blankLines,
    columns,
    rawColumns,
    uniqueKeys: [{ name: 'IX_Email', isPrimaryKey: false, columns: ['Email'] }],
  });

  assert.equal(result.totalRows, 6);
  assert.equal(result.validRows, 3);
  assert.equal(result.invalidRows, 3);
  assert.equal(result.payload.length, 3);
  assert.deepEqual(result.payload[0], { line: 1, values: ['1', 'a@x.com'] });

  const reasons = result.errors.map((error) => error.reason);
  assert.ok(reasons.includes('主鍵重複'), 'duplicate primary key must be reported');
  assert.ok(result.errors.some((error) => error.detail.includes('第 2 列')));
  assert.ok(reasons.includes('欄位數不符'));
  assert.ok(result.errors.some((error) => error.line === 4 && error.reason === '型別不符'));
  assert.ok(result.errors.some((error) => error.line === 5 && error.reason === '欄位數不符'));
  assert.equal(result.preview.length, 6);
});

test('validateImportRows reports blank lines placed between data rows', () => {
  const rawColumns = [column('Id', 'int', { isNullable: false })];
  const columns = planImportColumns(rawColumns);
  const parsed = parseTsv('1\n\n2', { skipHeader: false });

  const result = validateImportRows({
    rows: parsed.rows,
    blankLines: parsed.blankLines,
    columns,
    rawColumns,
  });

  assert.equal(result.totalRows, 3);
  assert.equal(result.validRows, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]!.line, 2);
  assert.equal(result.errors[0]!.column, '(空白列)');
});

test('validateImportRows flags composite unique keys and skips filtered indexes', () => {
  const rawColumns = [
    column('Tenant', 'int', { isNullable: false }),
    column('Code', 'nvarchar', { maxLength: 10, isNullable: false }),
  ];
  const columns = planImportColumns(rawColumns);

  const rows = parseTsv('1\tA\n1\tA\n2\tA', { skipHeader: false }).rows;
  const withUnique = validateImportRows({
    rows,
    columns,
    rawColumns,
    uniqueKeys: [{ name: 'UQ_Tenant_Code', isPrimaryKey: false, columns: ['Tenant', 'Code'] }],
  });
  assert.equal(withUnique.validRows, 2);
  assert.ok(withUnique.errors.some((error) => error.reason === '唯一值重複'));

  const withoutUnique = validateImportRows({ rows, columns, rawColumns, uniqueKeys: [] });
  assert.equal(withoutUnique.validRows, 3);
  assert.equal(withoutUnique.errors.length, 0);
});

test('unique key metadata is parsed from SQL results and filtered indexes are skipped', () => {
  const resultSet: ResultSet = {
    columns: [
      { name: 'IndexName', dataType: 'nvarchar', nullable: false, ordinal: 0 },
      { name: 'IsPrimaryKey', dataType: 'bit', nullable: false, ordinal: 1 },
      { name: 'HasFilter', dataType: 'bit', nullable: false, ordinal: 2 },
      { name: 'KeyColumns', dataType: 'nvarchar', nullable: false, ordinal: 3 },
    ],
    rows: [
      ['PK_Users', true, false, 'Id ASC'],
      ['UQ_Users_Email', false, false, 'Email ASC, TenantId ASC'],
      ['UQ_Users_Filtered', false, true, 'DisplayName ASC'],
    ],
    rowCount: 3,
  };

  const keys = parseUniqueKeys([resultSet]);
  assert.equal(keys.length, 2);
  assert.deepEqual(keys[0], { name: 'PK_Users', isPrimaryKey: true, columns: ['Id'] });
  assert.deepEqual(keys[1], {
    name: 'UQ_Users_Email',
    isPrimaryKey: false,
    columns: ['Email', 'TenantId'],
  });
});

test('unique key SQL escapes identifiers and source size cap stays documented', () => {
  const sql = buildTableUniqueKeysSql('dbo', "we'ird");
  assert.ok(sql.includes("t.name = N'we''ird'"));
  assert.ok(sql.includes('i.is_unique = 1'));
  assert.equal(MAX_SOURCE_BYTES, 20 * 1024 * 1024);
});

test('import entry points are wired for the Explorer table menu only', () => {
  const sidebar = readSource('src/components/layout/AppSidebar.vue');
  const importEntry = sidebar.indexOf("t('sidebar.importTsv')");
  const ddlEntry = sidebar.indexOf("t('sidebar.scriptCreate')");
  const viewBlock = sidebar.indexOf('if (isView || isProc || isFunc) {');
  assert.ok(importEntry > 0, 'table menu must expose the TSV import entry');
  assert.ok(
    ddlEntry > 0 && importEntry > ddlEntry && viewBlock > importEntry,
    'TSV import must live inside the table-only block'
  );
  assert.match(sidebar, /async function handleTsvImport\(\)/, 'sidebar must open the wizard');

  const app = readSource('src/App.vue');
  assert.match(app, /<TsvImportModal \/>/, 'wizard must be mounted globally');

  const api = readSource('src/services/api.ts');
  assert.match(api, /get_table_import_capabilities/);
  assert.match(api, /import_table_rows/);

  const service = readSource('src/services/tsvImportService.ts');
  assert.match(service, /'sqlight:import-progress'/, 'progress event name must match the Rust emitter');
});
});
