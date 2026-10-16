import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateCreateTableDdl } from '../src/utils/ddlGenerator';
import type { ColumnItem, TableConstraintItem, TableIndexItem, TableTriggerItem } from '../src/types/schema';

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
