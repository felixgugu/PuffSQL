import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatKeyColumns,
  generateConstraintCreateScript,
  generateConstraintDropScript,
  generateIndexCreateScript,
  generateIndexDropScript,
  generateIndexRebuildScript,
  generateIndexReorganizeScript,
  generateTriggerCreateScript,
  generateTriggerDropScript,
  indexBadgeType,
  qualifiedName,
} from '../src/utils/objectScriptGenerator';
import type { TableConstraintItem, TableIndexItem, TableTriggerItem } from '../src/types/schema';

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
