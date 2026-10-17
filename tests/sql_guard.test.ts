import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { detectDangerousSqlStatements, stripCommentsAndLiterals } from '../src/utils/sqlGuard';
import { STATEMENT_GUARD_MARKER, analyzeGuardedStatements, buildToggleEdits, findGuardedStatementAtLine, type StatementLineEdit } from '../src/utils/sqlStatementGuard';

describe('sql_guard', () => {
describe('sqlGuard utility', () => {
  test('safe queries are not flagged as dangerous', () => {
    const safeQueries = [
      'SELECT * FROM Users',
      'SELECT id, name FROM [Orders] WHERE status = 1',
      'EXEC sp_who2',
      'PRINT 1',
    ];

    for (const sql of safeQueries) {
      const res = detectDangerousSqlStatements(sql);
      assert.equal(res.isDangerous, false, `Expected false for: ${sql}`);
      assert.deepEqual(res.detectedKeywords, []);
    }
  });

  test('keywords inside single-quoted strings are not flagged', () => {
    const queriesWithStrings = [
      "SELECT 'UPDATE' AS col",
      "SELECT * FROM Logs WHERE message = 'DROP TABLE Customers'",
      "SELECT 'INSERT INTO foo VALUES (1)' AS sql_text",
      "SELECT 'truncate table audits' FROM tbl",
    ];

    for (const sql of queriesWithStrings) {
      const res = detectDangerousSqlStatements(sql);
      assert.equal(res.isDangerous, false, `Should ignore strings in: ${sql}`);
      assert.deepEqual(res.detectedKeywords, []);
    }
  });

  test('keywords inside line and block comments are not flagged', () => {
    const queriesWithComments = [
      "-- UPDATE Users SET active = 0\nSELECT * FROM Users",
      "/* DROP TABLE Test */ SELECT 1",
      "/* multi\n * line\n * TRUNCATE\n */ SELECT 1",
      "SELECT 1 /* nested /* DELETE FROM Users */ comment */",
    ];

    for (const sql of queriesWithComments) {
      const res = detectDangerousSqlStatements(sql);
      assert.equal(res.isDangerous, false, `Should ignore comments in: ${sql}`);
      assert.deepEqual(res.detectedKeywords, []);
    }
  });

  test('keywords used as bracketed identifiers or column names are not flagged', () => {
    const queriesWithBracketedIdentifiers = [
      'SELECT [UPDATE] FROM Config',
      'SELECT [DROP], [ALTER] FROM Status',
      'SELECT 1 AS [CREATE]',
    ];

    for (const sql of queriesWithBracketedIdentifiers) {
      const res = detectDangerousSqlStatements(sql);
      assert.equal(res.isDangerous, false, `Should ignore bracketed identifiers in: ${sql}`);
    }
  });

  test('detects single dangerous statement properly', () => {
    const cases: Array<{ sql: string; expected: string[] }> = [
      { sql: 'UPDATE Users SET Active = 1 WHERE Id = 5', expected: ['UPDATE'] },
      { sql: 'insert into Orders (id) values (10)', expected: ['INSERT'] },
      { sql: 'DELETE FROM Sessions WHERE expired = 1', expected: ['DELETE'] },
      { sql: 'ALTER TABLE Users ADD Nickname nvarchar(50)', expected: ['ALTER'] },
      { sql: 'create table #Temp (id int)', expected: ['CREATE'] },
      { sql: 'drop table OldLogs', expected: ['DROP'] },
      { sql: 'truncate table StagingTable', expected: ['TRUNCATE'] },
    ];

    for (const c of cases) {
      const res = detectDangerousSqlStatements(c.sql);
      assert.equal(res.isDangerous, true, `Expected dangerous for: ${c.sql}`);
      assert.deepEqual(res.detectedKeywords, c.expected);
    }
  });

  test('detects multiple dangerous keywords in complex batches', () => {
    const batch = `
      SELECT * FROM Users;
      UPDATE Users SET balance = 0;
      DROP TABLE Staging;
    `;
    const res = detectDangerousSqlStatements(batch);
    assert.equal(res.isDangerous, true);
    assert.ok(res.detectedKeywords.includes('UPDATE'));
    assert.ok(res.detectedKeywords.includes('DROP'));
  });

  test('handles empty or whitespace SQL safely', () => {
    assert.equal(detectDangerousSqlStatements('').isDangerous, false);
    assert.equal(detectDangerousSqlStatements('   \n  \t ').isDangerous, false);
  });
});
});

describe('sql_statement_guard', () => {
/**
 * The editor applies these edits through Monaco's pushEditOperations; applying them by hand is the
 * same thing text-wise and keeps the toggle assertions free of the editor runtime.
 */
function applyEdits(text: string, edits: StatementLineEdit[]): string {
  const lines = text.split(/\r?\n/);
  for (const edit of edits) {
    const index = edit.lineNumber - 1;
    const line = lines[index] ?? '';
    lines[index] = line.slice(0, edit.startColumn - 1) + edit.text + line.slice(edit.endColumn - 1);
  }
  return lines.join('\n');
}

function toggle(text: string, startLine: number, endLine: number, disabled: boolean): string {
  return applyEdits(text, buildToggleEdits(text, { startLine, endLine }, disabled));
}

const DANGEROUS_STATEMENTS: Array<[string, string]> = [
  ['UPDATE', 'UPDATE dbo.T SET a = 1 WHERE Id = 1'],
  ['INSERT', 'INSERT INTO dbo.T (a) VALUES (1)'],
  ['DELETE', 'DELETE FROM dbo.T WHERE Id = 1'],
  ['ALTER', 'ALTER TABLE dbo.T ADD c INT'],
  ['CREATE', 'CREATE TABLE dbo.T (Id INT)'],
  ['DROP', 'DROP TABLE dbo.T'],
  ['TRUNCATE', 'TRUNCATE TABLE dbo.T'],
];

describe('statement guard: which statements carry the switch', () => {
  test('every dangerous keyword is offered, once per statement', () => {
    for (const [keyword, statement] of DANGEROUS_STATEMENTS) {
      const script = ['SELECT 1;', `${statement};`, 'SELECT 2;'].join('\n');
      assert.deepEqual(
        analyzeGuardedStatements(script),
        [{ startLine: 2, endLine: 2, keywords: [keyword], disabled: false }],
        `${keyword} must be guarded`
      );
    }
  });

  test('reading a script never gets a switch', () => {
    const script = [
      'SELECT * FROM dbo.T;',
      'EXEC dbo.usp_Run;',
      'PRINT 1;',
      'SELECT * FROM dbo.updates;',
      'SELECT UPDATE_DATE FROM dbo.Log;',
    ].join('\n');
    assert.deepEqual(analyzeGuardedStatements(script), []);
  });

  test('keywords inside strings, comments and identifiers do not count', () => {
    const script = [
      "SELECT 'DROP TABLE dbo.T' AS msg FROM [delete_log];",
      '/* TRUNCATE TABLE x */ SELECT 2;',
      'SELECT DELETE_DATE, updates, created_at FROM dbo.Log;',
    ].join('\n');
    assert.deepEqual(analyzeGuardedStatements(script), []);
  });

  test('a commented statement is read back as disabled, and never swallows live code', () => {
    const script = [
      '-- DELETE FROM dbo.T WHERE 1 = 1', // looks exactly like a statement the guard disabled
      "SELECT 'DROP TABLE dbo.T' AS msg FROM [delete_log];", // live code must stay out of the range
    ].join('\n');

    assert.deepEqual(analyzeGuardedStatements(script), [
      { startLine: 1, endLine: 1, keywords: ['DELETE'], disabled: true },
    ]);
  });

  test('a disabled statement surrounded by live code keeps its exact range', () => {
    const script = [
      'SELECT 1;', // 1
      '-- UPDATE dbo.T', // 2
      '--    SET a = 1;', // 3
      'SELECT 2;', // 4
    ].join('\n');

    assert.deepEqual(analyzeGuardedStatements(script), [
      { startLine: 2, endLine: 3, keywords: ['UPDATE'], disabled: true },
    ]);
  });

  test('GO separates batches, semicolons separate statements, control flow stays whole', () => {
    const script = [
      'SELECT 1;', // 1
      'DELETE FROM dbo.T;', // 2
      'GO', // 3
      '', // 4
      'IF 1 = 1', // 5
      '    DELETE FROM dbo.T;', // 6
      'GO', // 7
      'SELECT 3;', // 8
      '', // 9
      'TRUNCATE TABLE dbo.L;', // 10
    ].join('\n');

    assert.deepEqual(
      analyzeGuardedStatements(script).map((s) => [s.startLine, s.endLine]),
      [
        [2, 2],
        [5, 6],
        [10, 10],
      ]
    );
  });

  test('two statements on one line stay one unit, exactly like single-statement execution', () => {
    const script = 'DELETE FROM dbo.T; SELECT 1;';
    assert.deepEqual(
      analyzeGuardedStatements(script).map((s) => [s.startLine, s.endLine]),
      [[1, 1]]
    );
  });

  test('a statement keeps its switch, and its danger, after it was commented out', () => {
    const script = ['SELECT 1;', 'DELETE FROM dbo.T WHERE Id = 1;', 'SELECT 2;'].join('\n');
    const disabled = toggle(script, 2, 2, true);

    assert.equal(disabled.split('\n')[1], `${STATEMENT_GUARD_MARKER}DELETE FROM dbo.T WHERE Id = 1;`);
    assert.deepEqual(analyzeGuardedStatements(disabled), [
      { startLine: 2, endLine: 2, keywords: ['DELETE'], disabled: true },
    ]);
  });

  test('a hand-commented statement reads as disabled, its live remainder never does', () => {
    const fullyCommented = ['-- DELETE FROM dbo.T', '-- WHERE Id = 1;'].join('\n');
    assert.deepEqual(analyzeGuardedStatements(fullyCommented), [
      { startLine: 1, endLine: 2, keywords: ['DELETE'], disabled: true },
    ]);

    // Only the commented block is offered; the live `AND x = 1;` underneath stays out of every range.
    const partlyCommented = ['-- DELETE FROM dbo.T', '-- WHERE Id = 1', '   AND x = 1;'].join('\n');
    assert.deepEqual(analyzeGuardedStatements(partlyCommented), [
      { startLine: 1, endLine: 2, keywords: ['DELETE'], disabled: true },
    ]);
  });

  test('a comment in front of a statement is nobody else\'s range', () => {
    const script = [
      '-- 每月結帳：先把舊資料刪掉', // 1 note in front of the statement, left alone on purpose
      '-- DELETE FROM dbo.Ledger WHERE Period = 1;', // 2 the disabled statement itself
      'SELECT 1;', // 3
    ].join('\n');

    // The note must not be read as the statement, so restoring can never turn it into code.
    assert.deepEqual(analyzeGuardedStatements(script), [
      { startLine: 2, endLine: 2, keywords: ['DELETE'], disabled: true },
    ]);
  });

  test('lines resolve to the statement that owns them', () => {
    const script = ['SELECT 1;', 'UPDATE dbo.T', '   SET a = 1;', 'SELECT 2;'].join('\n');
    const guarded = analyzeGuardedStatements(script);

    assert.equal(findGuardedStatementAtLine(guarded, 1), null);
    assert.equal(findGuardedStatementAtLine(guarded, 2)?.startLine, 2);
    assert.equal(findGuardedStatementAtLine(guarded, 3)?.endLine, 3);
    assert.equal(findGuardedStatementAtLine(guarded, 4), null);
  });
});

describe('statement guard: disabling and restoring', () => {
  test('disabling comments every code line of the statement and nothing else', () => {
    const script = ['SELECT 1;', 'UPDATE dbo.T', '   SET a = 1;', 'SELECT 2;'].join('\n');
    const disabled = toggle(script, 2, 3, true);

    assert.deepEqual(disabled.split('\n'), [
      'SELECT 1;',
      '-- UPDATE dbo.T',
      '--    SET a = 1;',
      'SELECT 2;',
    ]);
  });

  test('restoring returns the exact script, blank lines and own comments included', () => {
    const original = [
      'SELECT 1;', // 1
      'UPDATE dbo.T', // 2
      '   SET a = 1, -- 行內註解', // 3
      '', // 4
      '-- 我自己的註解：先留著', // 5
      '   WHERE b = 2;', // 6
      'SELECT 3;', // 7
    ].join('\r\n');

    const statement = { startLine: 2, endLine: 6 };
    const disabled = toggle(original, statement.startLine, statement.endLine, true);
    const disabledLines = disabled.split(/\r?\n/);

    assert.deepEqual(disabledLines.slice(1, 6), [
      '-- UPDATE dbo.T',
      '--    SET a = 1, -- 行內註解',
      '',
      '-- -- 我自己的註解：先留著',
      '--    WHERE b = 2;',
    ]);
    // The neighbours stay untouched in both directions.
    assert.equal(disabledLines[0], 'SELECT 1;');
    assert.equal(disabledLines[6], 'SELECT 3;');

    const restored = toggle(disabled, statement.startLine, statement.endLine, false);
    assert.deepEqual(restored.split(/\r?\n/), original.split(/\r?\n/));
  });

  test('a disabled statement leaves the safety guard nothing to run', () => {
    const script = ['SELECT 1;', 'DELETE FROM dbo.T;', 'SELECT 2;'].join('\n');
    assert.equal(detectDangerousSqlStatements(script).isDangerous, true);

    const disabled = toggle(script, 2, 2, true);
    assert.equal(detectDangerousSqlStatements(disabled).isDangerous, false);
    assert.equal(disabled.split('\n')[1], '-- DELETE FROM dbo.T;');
  });
});
});
