/**
 * ddl generators — merged from ddl_generator, alter_table_generator, object_script_generator, schema_export:
 * one file per component and layer instead of 4 files that all read the same sources.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type ColumnDef } from '../src/types/query';
import { TableConstraintItem, TableIndexItem, TableTriggerItem, type ColumnItem } from '../src/types/schema';
import { generateAddColumnSql, generateAllAlterTableTemplateSql, generateAlterColumnSql, generateDropColumnSql } from '../src/utils/alterTableGenerator';
import { generateCreateTableDdl } from '../src/utils/ddlGenerator';
import { formatKeyColumns, generateConstraintCreateScript, generateConstraintDropScript, generateIndexCreateScript, generateIndexDropScript, generateIndexRebuildScript, generateIndexReorganizeScript, generateTriggerCreateScript, generateTriggerDropScript, indexBadgeType, qualifiedName } from '../src/utils/objectScriptGenerator';
import { combineResultSetsToCsv, escapeCsvValue, formatByteSize, getIndexesAndKeysSql, getProgrammabilityHashSql, getTablesAndColumnsSql, resultSetToCsv } from '../src/utils/schemaExport';

describe('ddl_generator', () => {
function column(overrides: Partial<ColumnItem> = {}): ColumnItem {
  return {
    name: 'Name',
    dataType: 'nvarchar',
    maxLength: 50,
    isNullable: false,
    isPrimaryKey: false,
    isIdentity: false,
    ...overrides,
  };
}

function constraint(overrides: Partial<TableConstraintItem> = {}): TableConstraintItem {
  return {
    name: 'PK_Orders',
    kind: 'PRIMARY_KEY',
    keyColumns: [{ name: 'OrderId', descending: false }],
    definition: null,
    defaultColumn: null,
    isClustered: true,
    isDisabled: false,
    isNotTrusted: false,
    refSchema: null,
    refTable: null,
    refColumns: [],
    onDelete: null,
    onUpdate: null,
    ...overrides,
  };
}

function index(overrides: Partial<TableIndexItem> = {}): TableIndexItem {
  return {
    name: 'IX_Orders_Status',
    typeDesc: 'NONCLUSTERED',
    isUnique: false,
    isPrimaryKey: false,
    isUniqueConstraint: false,
    isDisabled: false,
    columns: [{ name: 'Status', descending: false, isIncluded: false }],
    filterDefinition: null,
    ...overrides,
  };
}

function trigger(overrides: Partial<TableTriggerItem> = {}): TableTriggerItem {
  return {
    name: 'trg_Orders_Audit',
    isInsteadOf: false,
    isDisabled: false,
    events: ['INSERT'],
    definition: 'CREATE TRIGGER [dbo].[trg_Orders_Audit] ON [dbo].[Orders] AFTER INSERT AS\nBEGIN\nEND',
    ...overrides,
  };
}

const ordersColumns: ColumnItem[] = [
  column({ name: 'OrderId', dataType: 'int', maxLength: null, precision: 10, scale: 0, isPrimaryKey: true, isIdentity: true, identitySeed: 100, identityIncrement: 5 }),
  column({ name: 'Status', dataType: 'char', maxLength: 1, collation: 'Latin1_General_CI_AS' }),
  column({ name: 'Total', dataType: 'decimal', maxLength: 9, precision: 18, scale: 2, isNullable: true }),
  column({ name: 'Taxed', dataType: 'decimal', maxLength: 9, precision: 18, scale: 2, isNullable: true, isComputed: true, computedExpression: '([Total]*(1.05))', isPersisted: true }),
];

describe('generateCreateTableDdl', () => {
  test('columns alone keep the legacy column-and-primary-key script', () => {
    const sql = generateCreateTableDdl({
      tableName: 'Orders',
      schema: 'dbo',
      database: 'Shop',
      columns: [column({ name: 'OrderId', dataType: 'int', maxLength: null, isPrimaryKey: true, isIdentity: true })],
    });

    assert.ok(sql.includes('USE [Shop];\nGO'), 'the database header is kept');
    assert.ok(sql.includes('CREATE TABLE [dbo].[Orders] ('), 'the table is qualified');
    assert.ok(sql.includes('[OrderId]'), 'the primary key still switches on the column flag');
    assert.ok(!sql.includes('索引 (Indexes)'), 'no empty sections');
    assert.ok(!sql.includes('觸發程序'), 'no empty sections');
  });

  test('a full script is ordered table → indexes → foreign keys → triggers', () => {
    const sql = generateCreateTableDdl({
      tableName: 'Orders',
      schema: 'dbo',
      columns: ordersColumns,
      constraints: [
        constraint(),
        constraint({
          name: 'FK_Orders_Customers',
          kind: 'FOREIGN_KEY',
          keyColumns: [{ name: 'CustomerId', descending: false }],
          refSchema: 'dbo',
          refTable: 'Customers',
          refColumns: ['Id'],
          onDelete: 'CASCADE',
        }),
      ],
      indexes: [index(), index({ name: 'PK_Orders', isPrimaryKey: true, isUnique: true })],
      triggers: [trigger()],
    });

    const order = ['CREATE TABLE', '索引 (Indexes)', 'FOREIGN KEY', '觸發程序 (Triggers)'].map((marker) =>
      sql.indexOf(marker)
    );
    assert.ok(order.every((position) => position >= 0), `every section is present: ${sql}`);
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      order,
      'the sections appear in replay order'
    );
  });

  test('computed, identity and collated columns carry their real definition', () => {
    const sql = generateCreateTableDdl({ tableName: 'Orders', schema: 'dbo', columns: ordersColumns });

    assert.ok(sql.includes('IDENTITY(100,5)'), 'the identity seed and increment are the real ones');
    assert.ok(sql.includes('COLLATE Latin1_General_CI_AS'), 'collation is preserved');
    assert.ok(sql.includes('[Taxed] AS ([Total]*(1.05)) PERSISTED'), 'computed columns keep their expression');
  });

  test('a computed column without a readable expression becomes a comment, not a broken column', () => {
    const sql = generateCreateTableDdl({
      tableName: 'Orders',
      schema: 'dbo',
      columns: [column({ name: 'Taxed', isComputed: true, computedExpression: null })],
    });

    assert.ok(sql.includes('-- 計算欄位 [Taxed] 的運算式無法讀取，未納入指令碼'));
    assert.ok(!sql.includes('[Taxed] [nvarchar]'), 'no invented definition');
  });

  test('key and check constraints are inlined with their real names', () => {
    const sql = generateCreateTableDdl({
      tableName: 'Orders',
      schema: 'dbo',
      columns: ordersColumns,
      constraints: [
        constraint(),
        constraint({
          name: 'UQ_Orders_Code',
          kind: 'UNIQUE',
          keyColumns: [{ name: 'Code', descending: true }],
          isClustered: false,
        }),
        constraint({ name: 'CK_Orders_Total', kind: 'CHECK', keyColumns: [], definition: '([Total]>=(0))' }),
      ],
    });

    assert.ok(sql.includes('CONSTRAINT [PK_Orders] PRIMARY KEY CLUSTERED ([OrderId] ASC)'));
    assert.ok(sql.includes('CONSTRAINT [UQ_Orders_Code] UNIQUE NONCLUSTERED ([Code] DESC)'));
    assert.ok(sql.includes('CONSTRAINT [CK_Orders_Total] CHECK ([Total]>=(0))'));
    assert.ok(!sql.includes('PK_Orders_Orders'), 'the old synthesized name is gone');
  });

  test('a named DEFAULT rides on its column line, never as a table clause', () => {
    const sql = generateCreateTableDdl({
      tableName: 'Orders',
      schema: 'dbo',
      columns: ordersColumns,
      constraints: [
        constraint({ name: 'DF_Orders_Status', kind: 'DEFAULT', keyColumns: [], definition: "('N')", defaultColumn: 'Status' }),
        constraint({ name: 'DF_Orders_Qty', kind: 'DEFAULT', keyColumns: [], definition: '((1))', defaultColumn: 'Qty' }),
      ],
    });

    const tableBody = sql.slice(sql.indexOf('CREATE TABLE'), sql.indexOf(');', sql.indexOf('CREATE TABLE')));
    assert.ok(tableBody.includes("CONSTRAINT [DF_Orders_Status] DEFAULT ('N')"), 'the name survives');
    assert.ok(
      /\[Status\]\s+\[char\]\(1\)\s+COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT \[DF_Orders_Status\] DEFAULT \('N'\)/.test(sql),
      'the default sits on the column it belongs to'
    );
    assert.ok(
      !/\bFOR\s+\[/.test(tableBody),
      'the ALTER TABLE spelling (`DEFAULT … FOR [col]`) is a syntax error inside CREATE TABLE'
    );
  });

  test('the index that backs the primary key is not scripted twice', () => {
    const sql = generateCreateTableDdl({
      tableName: 'Orders',
      schema: 'dbo',
      columns: ordersColumns,
      constraints: [constraint()],
      indexes: [
        index({ name: 'IX_Orders_Status', filterDefinition: '([Status]=N\'A\')', columns: [
          { name: 'Status', descending: false, isIncluded: false },
          { name: 'Total', descending: false, isIncluded: true },
        ] }),
        index({ name: 'PK_Orders', isPrimaryKey: true, isUnique: true }),
      ],
    });

    assert.ok(sql.includes('CREATE NONCLUSTERED INDEX [IX_Orders_Status]'));
    assert.ok(sql.includes('INCLUDE ([Total])'));
    assert.ok(sql.includes("WHERE ([Status]=N'A')"), 'filtered indexes keep the predicate');
    assert.equal(sql.split('CREATE NONCLUSTERED INDEX').length - 1, 1, 'only the secondary index is created');
  });

  test('an untrusted CHECK is added after the table with WITH NOCHECK, not inline', () => {
    const sql = generateCreateTableDdl({
      tableName: 'Orders',
      schema: 'dbo',
      columns: ordersColumns,
      constraints: [
        constraint(),
        constraint({ name: 'CK_Orders_Legacy', kind: 'CHECK', keyColumns: [], definition: '([Total]>(0))', isNotTrusted: true }),
      ],
    });

    const tableBody = sql.slice(sql.indexOf('CREATE TABLE'), sql.indexOf(');', sql.indexOf('CREATE TABLE')));
    assert.ok(!tableBody.includes('CK_Orders_Legacy'), 'an untrusted CHECK cannot be declared inline');
    assert.ok(
      sql.includes('ALTER TABLE [dbo].[Orders] WITH NOCHECK ADD CONSTRAINT [CK_Orders_Legacy] CHECK ([Total]>(0));'),
      'it is added untrusted, so existing rows are not re-validated'
    );
  });

  test('a disabled constraint is switched off again at the end of the script', () => {
    const sql = generateCreateTableDdl({
      tableName: 'Orders',
      schema: 'dbo',
      columns: ordersColumns,
      constraints: [
        constraint({ name: 'PK_Orders', isDisabled: true }),
        constraint({ name: 'CK_Orders_Legacy', kind: 'CHECK', keyColumns: [], definition: '([Total]>(0))', isDisabled: true, isNotTrusted: true }),
      ],
    });

    const untrustedAt = sql.indexOf('WITH NOCHECK ADD CONSTRAINT [CK_Orders_Legacy]');
    const disabledAt = sql.indexOf('NOCHECK CONSTRAINT [PK_Orders]');
    assert.ok(untrustedAt > sql.indexOf('CREATE TABLE'), 'the statements trail the table');
    assert.ok(disabledAt > untrustedAt, 'a constraint is created before it is disabled');
    assert.ok(sql.includes('ALTER TABLE [dbo].[Orders] NOCHECK CONSTRAINT [CK_Orders_Legacy];'));
  });

  test('an untrusted foreign key keeps its state through WITH NOCHECK', () => {
    const sql = generateCreateTableDdl({
      tableName: 'Orders',
      schema: 'dbo',
      columns: ordersColumns,
      constraints: [
        constraint({
          name: 'FK_Orders_Customers',
          kind: 'FOREIGN_KEY',
          keyColumns: [{ name: 'CustomerId', descending: false }],
          refSchema: 'dbo',
          refTable: 'Customers',
          refColumns: ['Id'],
          isNotTrusted: true,
        }),
      ],
    });

    assert.ok(sql.includes('ALTER TABLE [dbo].[Orders] WITH NOCHECK ADD CONSTRAINT [FK_Orders_Customers] FOREIGN KEY'));
  });

  test('identifiers containing brackets and quotes stay escaped', () => {
    const sql = generateCreateTableDdl({
      tableName: 'Order]s',
      schema: 'dbo',
      columns: [column({ name: 'Na]me' })],
    });

    assert.ok(sql.includes('CREATE TABLE [dbo].[Order]]s] ('));
    assert.ok(sql.includes('[Na]]me]'));
  });

  test('an unscriptable index type is explained rather than guessed', () => {
    const sql = generateCreateTableDdl({
      tableName: 'Orders',
      schema: 'dbo',
      columns: ordersColumns,
      indexes: [index({ name: 'CCI_Orders', typeDesc: 'CLUSTERED COLUMNSTORE' })],
    });

    assert.ok(sql.includes('-- 索引 [CCI_Orders] 的型別為 CLUSTERED COLUMNSTORE'));
    assert.ok(!sql.includes('CREATE  INDEX'), 'no malformed statement');
  });

  test('batch separators are never doubled between triggers', () => {
    const sql = generateCreateTableDdl({
      tableName: 'Orders',
      schema: 'dbo',
      columns: ordersColumns,
      triggers: [trigger(), trigger({ name: 'trg_Orders_Second' })],
    });

    assert.ok(!/GO\s*\n\s*GO/.test(sql), 'no empty batch between statements');
  });
});
});

describe('alter_table_generator', () => {
describe('alterTableGenerator', () => {
  const baseOptions = {
    schema: 'dbo',
    tableName: 'Users',
    columnName: 'Email',
    dataType: 'nvarchar',
    fullType: 'nvarchar(100)',
    isNullable: 'YES',
    database: 'CRM_DB',
  };

  test('generateAlterColumnSql: formats standard ALTER COLUMN statement with USE database', () => {
    const sql = generateAlterColumnSql(baseOptions);

    assert.ok(sql.includes('USE [CRM_DB];\nGO'), 'Should include USE database header');
    assert.ok(
      sql.includes('ALTER TABLE [dbo].[Users]\nALTER COLUMN [Email] nvarchar(100) NULL;'),
      'Should generate standard ALTER COLUMN statement'
    );
  });

  test('generateAlterColumnSql: correctly handles NOT NULL and custom schemas', () => {
    const sql = generateAlterColumnSql({
      schema: 'sales',
      tableName: 'Customers',
      columnName: 'Phone',
      dataType: 'varchar',
      fullType: 'varchar(20)',
      isNullable: 'NO',
    });

    assert.ok(!sql.includes('USE ['), 'Should not include USE when database is omitted');
    assert.ok(
      sql.includes('ALTER TABLE [sales].[Customers]\nALTER COLUMN [Phone] varchar(20) NOT NULL;'),
      'Should resolve isNullable="NO" to NOT NULL'
    );
  });

  test('generateAlterColumnSql: safely escapes identifiers with spaces and special characters', () => {
    const sql = generateAlterColumnSql({
      schema: 'my schema',
      tableName: 'Order Details',
      columnName: 'Item [Code]',
      fullType: 'nvarchar(50)',
      isNullable: true,
    });

    assert.ok(
      sql.includes('ALTER TABLE [my schema].[Order Details]\nALTER COLUMN [Item [Code]]] nvarchar(50) NULL;'),
      'Should escape brackets and spaces safely'
    );
  });

  test('generateDropColumnSql: formats standard DROP COLUMN statement with constraint hints', () => {
    const sql = generateDropColumnSql({
      ...baseOptions,
      defaultValue: "('default@test.com')",
    });

    assert.ok(sql.includes('USE [CRM_DB];\nGO'), 'Should include USE database header');
    assert.ok(
      sql.includes('ALTER TABLE [dbo].[Users]\nDROP COLUMN [Email];'),
      'Should generate standard DROP COLUMN statement'
    );
    assert.ok(sql.includes("('default@test.com')"), 'Should include default constraint value hint');
    assert.ok(sql.includes('DROP CONSTRAINT'), 'Should include constraint drop instructions');
  });

  test('generateAddColumnSql: formats standard ADD COLUMN statement', () => {
    const sql = generateAddColumnSql(baseOptions);

    assert.ok(sql.includes('USE [CRM_DB];\nGO'), 'Should include USE database header');
    assert.ok(
      sql.includes('ALTER TABLE [dbo].[Users]\nADD [NewColumnName] nvarchar(100) NULL;'),
      'Should generate standard ADD statement'
    );
  });

  test('generateAllAlterTableTemplateSql: includes all three operations in one template', () => {
    const sql = generateAllAlterTableTemplateSql(baseOptions);

    assert.ok(sql.includes('ADD [NewColumnName]'), 'Template should include ADD');
    assert.ok(sql.includes('ALTER COLUMN [Email] nvarchar(100) NULL;'), 'Template should include ALTER');
    assert.ok(sql.includes('DROP COLUMN [Email];'), 'Template should include DROP');
  });

  test('TableStructureViewer.vue integration for ALTER TABLE context menu', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const viewerCode = fs.readFileSync(
      path.join(process.cwd(), 'src/components/editor/TableStructureViewer.vue'),
      'utf-8'
    );

    // Verify imports and methods exist in TableStructureViewer.vue
    assert.ok(viewerCode.includes('generateAlterColumnSql'), 'Should import generateAlterColumnSql');
    assert.ok(viewerCode.includes('generateDropColumnSql'), 'Should import generateDropColumnSql');
    assert.ok(viewerCode.includes('generateAddColumnSql'), 'Should import generateAddColumnSql');
    assert.ok(viewerCode.includes('generateAllAlterTableTemplateSql'), 'Should import generateAllAlterTableTemplateSql');

    // Verify context menu actions exist
    assert.ok(viewerCode.includes('handleAlterColumnScript'), 'Should define handleAlterColumnScript');
    assert.ok(viewerCode.includes('handleCopyAlterColumnScript'), 'Should define handleCopyAlterColumnScript');

    // Verify template labels exist
    assert.ok(viewerCode.includes('ALTER COLUMN'), 'Template should contain ALTER COLUMN action');
    assert.ok(viewerCode.includes('ADD COLUMN'), 'Template should contain ADD COLUMN action');
    assert.ok(viewerCode.includes('DROP COLUMN'), 'Template should contain DROP COLUMN action');
  });
});
});

describe('object_script_generator', () => {
const target = { schema: 'dbo', table: 'Orders' };

function index(overrides: Partial<TableIndexItem> = {}): TableIndexItem {
  return {
    name: 'IX_Orders_CustomerId',
    typeDesc: 'NONCLUSTERED',
    isUnique: false,
    isPrimaryKey: false,
    isUniqueConstraint: false,
    isDisabled: false,
    columns: [
      { name: 'CustomerId', descending: false, isIncluded: false },
      { name: 'Total', descending: true, isIncluded: false },
      { name: 'Email', descending: false, isIncluded: true },
    ],
    filterDefinition: null,
    ...overrides,
  };
}

function constraint(overrides: Partial<TableConstraintItem> = {}): TableConstraintItem {
  return {
    name: 'PK_Orders',
    kind: 'PRIMARY_KEY',
    keyColumns: [{ name: 'OrderId', descending: false }],
    definition: null,
    defaultColumn: null,
    isClustered: true,
    isDisabled: false,
    isNotTrusted: false,
    refSchema: null,
    refTable: null,
    refColumns: [],
    onDelete: null,
    onUpdate: null,
    ...overrides,
  };
}

function trigger(overrides: Partial<TableTriggerItem> = {}): TableTriggerItem {
  return {
    name: 'trg_Orders_Audit',
    isInsteadOf: false,
    isDisabled: false,
    events: ['INSERT', 'UPDATE'],
    definition: 'CREATE TRIGGER [dbo].[trg_Orders_Audit] ON [dbo].[Orders] AFTER INSERT, UPDATE AS\nBEGIN\nEND',
    ...overrides,
  };
}

describe('object script generator', () => {
  test('names are bracketed so reserved words and brackets survive', () => {
    assert.equal(qualifiedName('dbo', 'Order]s'), '[dbo].[Order]]s]');
    assert.equal(formatKeyColumns([{ name: 'A', descending: false }, { name: 'B', descending: true }]), '[A] ASC, [B] DESC');
  });

  test('an index is scripted with its key order, include list and filter', () => {
    const sql = generateIndexCreateScript(
      index({ isUnique: true, filterDefinition: '([IsActive]=(1))' }),
      target
    );

    assert.match(sql, /CREATE UNIQUE NONCLUSTERED INDEX \[IX_Orders_CustomerId\]/);
    assert.ok(sql.includes('([CustomerId] ASC, [Total] DESC)'), 'key columns keep their order');
    assert.ok(sql.includes('INCLUDE ([Email])'), 'included columns are separated from the key');
    assert.ok(sql.includes('WHERE ([IsActive]=(1))'), 'a filtered index keeps its predicate');
  });

  test('a disabled index is created and then disabled again', () => {
    const sql = generateIndexCreateScript(index({ isDisabled: true }), target);

    assert.ok(sql.includes('ALTER INDEX [IX_Orders_CustomerId] ON [dbo].[Orders] DISABLE;'));
  });

  test('the index behind a PRIMARY KEY or UNIQUE constraint is scripted as that constraint', () => {
    assert.match(
      generateIndexCreateScript(index({ isPrimaryKey: true, isUnique: true, typeDesc: 'CLUSTERED' }), target),
      /ALTER TABLE \[dbo\]\.\[Orders\] ADD CONSTRAINT \[IX_Orders_CustomerId\] PRIMARY KEY CLUSTERED \(\[CustomerId\] ASC, \[Total\] DESC\);/
    );
    assert.match(
      generateIndexCreateScript(index({ isUniqueConstraint: true }), target),
      /ADD CONSTRAINT \[IX_Orders_CustomerId\] UNIQUE NONCLUSTERED \(/
    );
  });

  test('index types this app cannot script produce a comment instead of wrong SQL', () => {
    const sql = generateIndexCreateScript(index({ typeDesc: 'CLUSTERED COLUMNSTORE' }), target);

    assert.ok(sql.startsWith('-- 索引'), 'columnstore is explained, never guessed');
    assert.ok(!sql.includes('CREATE '), 'no partial DDL');
    assert.equal(indexBadgeType(index({ typeDesc: 'CLUSTERED COLUMNSTORE' })), 'COLUMNSTORE');
  });

  test('index drop, rebuild and reorganize name the object they act on', () => {
    assert.ok(generateIndexDropScript(index(), target).includes('DROP INDEX [IX_Orders_CustomerId] ON [dbo].[Orders];'));
    assert.ok(
      generateIndexRebuildScript('IX_Orders_CustomerId', target).includes(
        'REBUILD WITH (ONLINE = ON)'
      )
    );
    assert.ok(
      generateIndexReorganizeScript('IX_Orders_CustomerId', target).includes('REORGANIZE;')
    );
  });

  test('every constraint kind is recreated with ALTER TABLE', () => {
    assert.match(
      generateConstraintCreateScript(constraint(), target),
      /ADD CONSTRAINT \[PK_Orders\] PRIMARY KEY CLUSTERED \(\[OrderId\] ASC\);/
    );
    assert.match(
      generateConstraintCreateScript(constraint({ name: 'UQ', kind: 'UNIQUE', isClustered: false }), target),
      /ADD CONSTRAINT \[UQ\] UNIQUE NONCLUSTERED \(/
    );
    assert.match(
      generateConstraintCreateScript(
        constraint({ name: 'CK', kind: 'CHECK', keyColumns: [], definition: '([Qty]>(0))' }),
        target
      ),
      /ADD CONSTRAINT \[CK\] CHECK \(\[Qty\]>\(0\)\);/
    );
    assert.match(
      generateConstraintCreateScript(
        constraint({ name: 'DF', kind: 'DEFAULT', keyColumns: [], definition: '((1))', defaultColumn: 'IsActive' }),
        target
      ),
      /ADD CONSTRAINT \[DF\] DEFAULT \(\(1\)\) FOR \[IsActive\];/
    );
  });

  test('a foreign key keeps its referenced columns and referential actions', () => {
    const sql = generateConstraintCreateScript(
      constraint({
        name: 'FK_Orders_Customers',
        kind: 'FOREIGN_KEY',
        keyColumns: [{ name: 'CustomerId', descending: false }],
        refSchema: 'dbo',
        refTable: 'Customers',
        refColumns: ['Id'],
        onDelete: 'CASCADE',
        onUpdate: 'SET_NULL',
      }),
      target
    );

    assert.ok(
      sql.includes('FOREIGN KEY ([CustomerId])'),
      'a foreign key column list takes no ASC / DESC'
    );
    assert.ok(sql.includes('REFERENCES [dbo].[Customers] ([Id])'), 'the referenced side is bracketed');
    assert.ok(sql.includes('ON DELETE CASCADE'), 'cascade survives the round trip');
    assert.ok(sql.includes('ON UPDATE SET NULL'), 'SET_NULL is spelled the T-SQL way');
  });

  test('NO ACTION referential actions are left at the server default', () => {
    const sql = generateConstraintCreateScript(
      constraint({
        kind: 'FOREIGN_KEY',
        refSchema: 'dbo',
        refTable: 'Customers',
        refColumns: ['Id'],
        onDelete: 'NO_ACTION',
        onUpdate: 'NO_ACTION',
      }),
      target
    );

    assert.ok(!sql.includes('ON DELETE'), 'NO ACTION is the default and stays implicit');
    assert.ok(!sql.includes('ON UPDATE'));
  });

  test('constraints whose definition cannot be read say so instead of emitting nothing', () => {
    const sql = generateConstraintCreateScript(
      constraint({ name: 'CK_Orders', kind: 'CHECK', keyColumns: [], definition: null }),
      target
    );

    assert.match(sql, /^-- 條件約束 \[CK_Orders\] 的定義無法讀取/);
  });

  test('a CHECK constraint is scripted trusted inline, or untrusted with WITH NOCHECK', () => {
    const checked = constraint({ name: 'CK', kind: 'CHECK', keyColumns: [], definition: '([Qty]>(0))' });

    assert.equal(
      generateConstraintCreateScript(checked, target),
      'ALTER TABLE [dbo].[Orders] ADD CONSTRAINT [CK] CHECK ([Qty]>(0));'
    );
    assert.equal(
      generateConstraintCreateScript({ ...checked, isNotTrusted: true }, target),
      'ALTER TABLE [dbo].[Orders] WITH NOCHECK ADD CONSTRAINT [CK] CHECK ([Qty]>(0));'
    );
  });

  test('constraint drop targets the table', () => {
    assert.equal(
      generateConstraintDropScript('PK_Orders', target),
      'ALTER TABLE [dbo].[Orders] DROP CONSTRAINT [PK_Orders];'
    );
  });

  test('a trigger is dropped-if-exists and recreated from its module definition', () => {
    const sql = generateTriggerCreateScript(trigger(), target);

    assert.ok(sql.includes("IF OBJECT_ID(N'[dbo].[trg_Orders_Audit]', N'TR') IS NOT NULL"));
    assert.ok(sql.includes('DROP TRIGGER [trg_Orders_Audit];'));
    assert.ok(sql.includes('CREATE TRIGGER [dbo].[trg_Orders_Audit] ON [dbo].[Orders]'));
    assert.ok(!sql.includes('DISABLE TRIGGER'), 'an enabled trigger stays enabled');
  });

  test('a trigger that cannot be read, or is disabled, is reported in the script', () => {
    assert.match(
      generateTriggerCreateScript(trigger({ definition: null }), target),
      /-- 觸發程序 \[trg_Orders_Audit\] 的定義無法讀取/
    );
    assert.match(
      generateTriggerCreateScript(trigger({ isDisabled: true }), target),
      /DISABLE TRIGGER \[trg_Orders_Audit\] ON \[dbo\]\.\[Orders\];/
    );
  });

  test('trigger drop is guarded so re-running the script does not fail', () => {
    assert.ok(
      generateTriggerDropScript('trg_Orders_Audit', target).includes(
        "IF OBJECT_ID(N'[dbo].[trg_Orders_Audit]', N'TR') IS NOT NULL"
      )
    );
  });
});
});

describe('schema_export', () => {
test('escapeCsvValue formats null, strings, commas, quotes and newlines correctly', () => {
  assert.equal(escapeCsvValue(null), '');
  assert.equal(escapeCsvValue(undefined), '');
  assert.equal(escapeCsvValue('simple'), 'simple');
  assert.equal(escapeCsvValue('hello, world'), '"hello, world"');
  assert.equal(escapeCsvValue('He said "Hi"'), '"He said ""Hi"""');
  assert.equal(escapeCsvValue("Line 1\nLine 2"), '"Line 1\nLine 2"');
  assert.equal(escapeCsvValue({ type: 'binary', length: 16 }), '[Binary 16 Bytes]');
});

test('resultSetToCsv converts tabular data into CSV with UTF-8 BOM', () => {
  const columns: ColumnDef[] = [
    { name: 'Schema', dataType: 'nvarchar', nullable: false, ordinal: 0 },
    { name: 'Table', dataType: 'nvarchar', nullable: false, ordinal: 1 },
    { name: 'Column', dataType: 'nvarchar', nullable: false, ordinal: 2 },
  ];
  const rows = [
    ['dbo', 'Users', 'Id'],
    ['dbo', 'Users', 'User, Name'],
  ];

  const csv = resultSetToCsv(columns, rows);
  // Must start with UTF-8 BOM
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /Schema,Table,Column/);
  assert.match(csv, /dbo,Users,"User, Name"/);
});

test('combineResultSetsToCsv aggregates multiple result sets with block dividers', () => {
  const sections = [
    {
      title: '資料表規格',
      columns: [{ name: 'Table', dataType: 'nvarchar', nullable: false, ordinal: 0 }],
      rows: [['Users'], ['Orders']],
    },
    {
      title: '索引規格',
      columns: [{ name: 'Index', dataType: 'nvarchar', nullable: false, ordinal: 0 }],
      rows: [['PK_Users']],
    },
  ];

  const combined = combineResultSetsToCsv(sections);
  assert.ok(combined.startsWith('\uFEFF'));
  assert.match(combined, /區塊 1.*資料表規格/);
  assert.match(combined, /區塊 2.*索引規格/);
  assert.match(combined, /Users/);
  assert.match(combined, /PK_Users/);
});

test('getTablesAndColumnsSql generates valid query scoped to database', () => {
  const sql = getTablesAndColumnsSql('Production_DB');
  assert.match(sql, /USE \[Production_DB\];/);
  assert.match(sql, /sys\.tables/);
  assert.match(sql, /sys\.columns/);
  assert.match(sql, /sys\.types/);
  assert.match(sql, /t\.is_ms_shipped = 0/);
});

test('getIndexesAndKeysSql uses backward-compatible FOR XML PATH aggregation', () => {
  const sql = getIndexesAndKeysSql('CRM_DB');
  assert.match(sql, /USE \[CRM_DB\];/);
  assert.match(sql, /sys\.indexes/);
  assert.match(sql, /FOR XML PATH/);
  assert.match(sql, /STUFF\(/);
});

test('getProgrammabilityHashSql hashes object definitions with SHA2_256', () => {
  const sql = getProgrammabilityHashSql('ERP_DB');
  assert.match(sql, /USE \[ERP_DB\];/);
  assert.match(sql, /sys\.sql_modules/);
  assert.match(sql, /HASHBYTES\('SHA2_256'/);
});

test('formatByteSize formats bytes, KB, and MB accurately', () => {
  assert.equal(formatByteSize(500), '500 B');
  assert.equal(formatByteSize(2048), '2.0 KB');
  assert.equal(formatByteSize(1048576 * 2.5), '2.50 MB');
});
});
