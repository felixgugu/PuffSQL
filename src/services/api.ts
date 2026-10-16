import { invoke as tauriInvoke } from '@tauri-apps/api/core';

export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export async function invokeCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    try {
      return await tauriInvoke<T>(cmd, args);
    } catch (err: unknown) {
      if (typeof err === 'string') {
        throw new Error(err);
      } else if (err instanceof Error) {
        throw err;
      } else {
        throw new Error(JSON.stringify(err));
      }
    }
  }

  // Graceful browser fallback for UI development/testing
  console.info(`[Dev/Browser] Invoking command '${cmd}' with args:`, args);
  return mockInvoke<T>(cmd, args);
}

function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case 'get_connections':
      return Promise.resolve([
        {
          id: 'conn-demo-1',
          name: 'Production SQL Server (Demo)',
          engine: 'mssql',
          host: 'sql.sqlight.internal',
          port: 1433,
          database: 'AdventureWorks',
          username: 'sa',
          encrypt: true,
          trustServerCertificate: true,
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'conn-demo-2',
          name: 'Localhost SQL Server 2022',
          engine: 'mssql',
          host: 'localhost',
          port: 1433,
          database: 'master',
          username: 'sa',
          encrypt: false,
          trustServerCertificate: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ] as unknown as T);

    case 'save_connection': {
      const req = (args?.req ?? {}) as Record<string, unknown>;
      return Promise.resolve({
        id: (req.id as string) || `conn-${Date.now()}`,
        name: req.name as string,
        alias: (req.alias as string) || undefined,
        engine: 'mssql',
        host: req.host as string,
        port: (req.port as number) || 1433,
        database: (req.database as string) || 'master',
        username: req.username as string,
        encrypt: !!req.encrypt,
        trustServerCertificate: !!req.trustServerCertificate,
        color: (req.color as string) || undefined,
        modificationPrompt: !!req.modificationPrompt,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as T);
    }

    case 'delete_connection':
    case 'test_connection':
    case 'connect':
    case 'disconnect':
    case 'switch_database':
    case 'cancel_query':
      return Promise.resolve(undefined as unknown as T);

    case 'get_table_import_capabilities':
      return Promise.resolve({
        identityColumn: 'UserID',
        writableColumnCount: 6,
        canAlterTable: true,
        engineEdition: 3,
        supportsIdentityInsert: true,
        disabledReason: null,
      } as unknown as T);

    case 'import_table_rows': {
      const rows = (args?.rows as unknown[] | undefined) ?? [];
      return Promise.resolve({
        insertedCount: rows.length,
        rolledBack: false,
        errors: [],
        executionTimeMs: 12,
      } as unknown as T);
    }

    case 'get_connection_spid':
      return Promise.resolve(55 as unknown as T);

    case 'execute_query': {
      const sql = ((args?.sql as string) || '').trim();
      const upper = sql.toUpperCase();
      const isSelect = upper.startsWith('SELECT') || upper.startsWith('USE') && upper.includes('SELECT');

      if (!isSelect) {
        return Promise.resolve({
          resultSets: [],
          messages: [
            {
              level: 'info',
              message: 'Statement executed successfully. (1 row affected)',
              timestamp: new Date().toISOString(),
            },
          ],
          affectedRows: 1,
          executionTimeMs: 16,
        } as unknown as T);
      }

      if (sql.includes('sys.columns') && sql.includes('sys.tables')) {
        return Promise.resolve({
          resultSets: [
            {
              columns: [
                { name: 'Schema', dataType: 'nvarchar', nullable: false, ordinal: 0 },
                { name: 'Table', dataType: 'nvarchar', nullable: false, ordinal: 1 },
                { name: 'Column', dataType: 'nvarchar', nullable: false, ordinal: 2 },
                { name: 'ColId', dataType: 'int', nullable: false, ordinal: 3 },
                { name: 'Type', dataType: 'nvarchar', nullable: false, ordinal: 4 },
                { name: 'ByteLen', dataType: 'smallint', nullable: false, ordinal: 5 },
                { name: 'Precision', dataType: 'tinyint', nullable: false, ordinal: 6 },
                { name: 'Scale', dataType: 'tinyint', nullable: false, ordinal: 7 },
                { name: 'Nullable', dataType: 'bit', nullable: false, ordinal: 8 },
                { name: 'Identity', dataType: 'bit', nullable: false, ordinal: 9 },
                { name: 'DefaultValue', dataType: 'nvarchar', nullable: false, ordinal: 10 },
                { name: 'Collation', dataType: 'nvarchar', nullable: false, ordinal: 11 },
              ],
              rows: [
                ['dbo', 'Users', 'Id', 1, 'int', 4, 10, 0, false, true, '', ''],
                ['dbo', 'Users', 'Username', 2, 'nvarchar', 100, 0, 0, false, false, '', 'Chinese_Taiwan_Stroke_CI_AS'],
                ['dbo', 'Users', 'Email', 3, 'nvarchar', 200, 0, 0, true, false, '', 'Chinese_Taiwan_Stroke_CI_AS'],
                ['dbo', 'Users', 'CreatedAt', 4, 'datetime2', 8, 27, 7, false, false, '(sysdatetime())', ''],
                ['dbo', 'Orders', 'OrderId', 1, 'int', 4, 10, 0, false, true, '', ''],
                ['dbo', 'Orders', 'UserId', 2, 'int', 4, 10, 0, false, false, '', ''],
                ['dbo', 'Orders', 'TotalAmount', 3, 'decimal', 9, 18, 2, false, false, '((0))', ''],
                ['dbo', 'Orders', 'Status', 4, 'varchar', 20, 0, 0, false, false, "('PENDING')", 'Chinese_Taiwan_Stroke_CI_AS'],
              ],
              rowCount: 8,
            },
          ],
          messages: [],
          affectedRows: 8,
          executionTimeMs: 24,
        } as unknown as T);
      }

      // Unique index metadata for the TSV import pre-check.
      if (sql.includes('sys.indexes') && sql.includes('is_unique') && sql.includes('KeyColumns')) {
        return Promise.resolve({
          resultSets: [
            {
              columns: [
                { name: 'Schema', dataType: 'nvarchar', nullable: false, ordinal: 0 },
                { name: 'Table', dataType: 'nvarchar', nullable: false, ordinal: 1 },
                { name: 'IndexName', dataType: 'nvarchar', nullable: false, ordinal: 2 },
                { name: 'IsPrimaryKey', dataType: 'bit', nullable: false, ordinal: 3 },
                { name: 'IsUnique', dataType: 'bit', nullable: false, ordinal: 4 },
                { name: 'HasFilter', dataType: 'bit', nullable: false, ordinal: 5 },
                { name: 'KeyColumns', dataType: 'nvarchar', nullable: false, ordinal: 6 },
              ],
              rows: [
                ['dbo', 'Users', 'PK_Users', true, true, false, 'UserID'],
                ['dbo', 'Users', 'IX_Users_Email', false, true, false, 'Email'],
              ],
              rowCount: 2,
            },
          ],
          messages: [],
          affectedRows: 2,
          executionTimeMs: 9,
        } as unknown as T);
      }

      if (sql.includes('sys.indexes')) {
        return Promise.resolve({
          resultSets: [
            {
              columns: [
                { name: 'Schema', dataType: 'nvarchar', nullable: false, ordinal: 0 },
                { name: 'Table', dataType: 'nvarchar', nullable: false, ordinal: 1 },
                { name: 'IndexName', dataType: 'nvarchar', nullable: false, ordinal: 2 },
                { name: 'IndexType', dataType: 'nvarchar', nullable: false, ordinal: 3 },
                { name: 'IsUnique', dataType: 'bit', nullable: false, ordinal: 4 },
                { name: 'IsPK', dataType: 'bit', nullable: false, ordinal: 5 },
                { name: 'KeyColumns', dataType: 'nvarchar', nullable: false, ordinal: 6 },
                { name: 'IncludedColumns', dataType: 'nvarchar', nullable: false, ordinal: 7 },
              ],
              rows: [
                ['dbo', 'Users', 'PK_Users', 'CLUSTERED', true, true, 'Id ASC', ''],
                ['dbo', 'Users', 'IX_Users_Email', 'NONCLUSTERED', true, false, 'Email ASC', 'Username'],
                ['dbo', 'Orders', 'PK_Orders', 'CLUSTERED', true, true, 'OrderId ASC', ''],
                ['dbo', 'Orders', 'IX_Orders_UserId', 'NONCLUSTERED', false, false, 'UserId ASC', 'Status, TotalAmount'],
              ],
              rowCount: 4,
            },
          ],
          messages: [],
          affectedRows: 4,
          executionTimeMs: 18,
        } as unknown as T);
      }

      if (sql.includes('sys.sql_modules')) {
        return Promise.resolve({
          resultSets: [
            {
              columns: [
                { name: 'Schema', dataType: 'nvarchar', nullable: false, ordinal: 0 },
                { name: 'ObjectName', dataType: 'nvarchar', nullable: false, ordinal: 1 },
                { name: 'ObjectType', dataType: 'nvarchar', nullable: false, ordinal: 2 },
                { name: 'CreateDate', dataType: 'datetime', nullable: false, ordinal: 3 },
                { name: 'ModifyDate', dataType: 'datetime', nullable: false, ordinal: 4 },
                { name: 'CodeHash', dataType: 'nvarchar', nullable: false, ordinal: 5 },
              ],
              rows: [
                ['dbo', 'vw_ActiveUsers', 'VIEW', '2026-01-01 10:00:00', '2026-02-15 14:20:00', 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'],
                ['dbo', 'usp_GetUserOrders', 'SQL_STORED_PROCEDURE', '2026-01-10 11:30:00', '2026-03-01 09:12:00', 'CA978112CA1BBDCAFAC231B39A23DC4DA786EFF8147C4E72B9807785AFEE48BB'],
                ['dbo', 'fn_CalculateTax', 'SQL_SCALAR_FUNCTION', '2026-01-12 16:45:00', '2026-01-12 16:45:00', '4E07408562BEDB8B60CE05C1DECFE3AD16B72230967DE01F640B7E4729B49FCE'],
              ],
              rowCount: 3,
            },
          ],
          messages: [],
          affectedRows: 3,
          executionTimeMs: 22,
        } as unknown as T);
      }

      return Promise.resolve({
        resultSets: [
          {
            columns: [
              { name: 'UserID', dataType: 'int', nullable: false, ordinal: 0 },
              { name: 'Username', dataType: 'nvarchar(50)', nullable: false, ordinal: 1 },
              { name: 'Email', dataType: 'nvarchar(100)', nullable: true, ordinal: 2 },
              { name: 'Department', dataType: 'nvarchar(50)', nullable: true, ordinal: 3 },
              { name: 'Avatar', dataType: 'varbinary(max)', nullable: true, ordinal: 4 },
              { name: 'IsActive', dataType: 'bit', nullable: false, ordinal: 5 },
              { name: 'CreatedAt', dataType: 'datetime2', nullable: false, ordinal: 6 },
            ],
            rows: [
              [1, 'alex.mercer', 'alex@sqlight.dev', 'Engineering', { type: 'binary', length: 1024 }, true, '2026-01-15 08:30:00'],
              [2, 'sarah.connor', 'sarah@sqlight.dev', 'Security', { type: 'binary', length: 2048 }, true, '2026-02-01 11:05:42'],
              [3, 'john.doe', null, 'Marketing', null, false, '2026-03-12 19:40:11'],
              [4, 'elena.rostova', 'elena@sqlight.dev', 'Research', { type: 'binary', length: 512 }, true, '2026-04-18 16:22:09'],
              [5, 'david.kim', 'david@sqlight.dev', 'Product', null, true, '2026-05-09 10:14:33'],
              [6, 'lucas.vance', null, 'Design', null, false, '2026-06-20 14:05:19'],
              [7, 'maya.lin', 'maya@sqlight.dev', 'Engineering', { type: 'binary', length: 4096 }, true, '2026-07-04 09:50:00'],
              [8, 'arthur.dent', 'arthur@sqlight.dev', 'Operations', null, true, '2026-08-11 12:12:12'],
            ],
            rowCount: 8,
          },
        ],
        messages: [
          {
            level: 'info',
            message: 'Query executed successfully. 1 result set, 8 rows returned.',
            timestamp: new Date().toISOString(),
          },
        ],
        affectedRows: 8,
        executionTimeMs: 14,
      } as unknown as T);
    }

    case 'get_databases':
      return Promise.resolve([
        { name: 'master' },
        { name: 'tempdb' },
        { name: 'model' },
        { name: 'msdb' },
        { name: 'AdventureWorks' },
        { name: 'PuffSQLDB' },
      ] as unknown as T);

    case 'get_tables':
      return Promise.resolve([
        { schema: 'dbo', name: 'Users', kind: 'BASE TABLE' },
        { schema: 'dbo', name: 'Orders', kind: 'BASE TABLE' },
        { schema: 'dbo', name: 'OrderItems', kind: 'BASE TABLE' },
        { schema: 'dbo', name: 'Products', kind: 'BASE TABLE' },
        { schema: 'dbo', name: 'Categories', kind: 'BASE TABLE' },
        { schema: 'dbo', name: 'v_ActiveUsers', kind: 'VIEW' },
        { schema: 'dbo', name: 'v_DailySales', kind: 'VIEW' },
      ] as unknown as T);

    case 'get_columns':
      return Promise.resolve([
        { name: 'UserID', dataType: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false, isPrimaryKey: true, isIdentity: true },
        { name: 'Username', dataType: 'nvarchar', maxLength: 50, precision: null, scale: null, isNullable: false, isPrimaryKey: false, isIdentity: false },
        { name: 'Email', dataType: 'nvarchar', maxLength: 100, precision: null, scale: null, isNullable: true, isPrimaryKey: false, isIdentity: false },
        { name: 'Department', dataType: 'nvarchar', maxLength: 50, precision: null, scale: null, isNullable: true, isPrimaryKey: false, isIdentity: false },
        { name: 'IsActive', dataType: 'bit', maxLength: null, precision: 1, scale: 0, isNullable: false, isPrimaryKey: false, isIdentity: false },
        { name: 'CreatedAt', dataType: 'datetime2', maxLength: null, precision: 27, scale: 7, isNullable: false, isPrimaryKey: false, isIdentity: false },
      ] as unknown as T);

    case 'get_table_objects':
      return Promise.resolve({
        columns: [
          { name: 'UserID', dataType: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false, isPrimaryKey: true, isIdentity: true, identitySeed: 1, identityIncrement: 1 },
          { name: 'Username', dataType: 'nvarchar', maxLength: 50, precision: null, scale: null, isNullable: false, isPrimaryKey: false, isIdentity: false, collation: 'Chinese_Taiwan_Stroke_CI_AS' },
          { name: 'Email', dataType: 'nvarchar', maxLength: 100, precision: null, scale: null, isNullable: true, isPrimaryKey: false, isIdentity: false },
          { name: 'Department', dataType: 'nvarchar', maxLength: 50, precision: null, scale: null, isNullable: true, isPrimaryKey: false, isIdentity: false },
          { name: 'IsActive', dataType: 'bit', maxLength: null, precision: 1, scale: 0, isNullable: false, isPrimaryKey: false, isIdentity: false, defaultDefinition: '((1))' },
          { name: 'DisplayName', dataType: 'nvarchar', maxLength: 150, precision: null, scale: null, isNullable: true, isPrimaryKey: false, isIdentity: false, isComputed: true, computedExpression: "([Username]+' <'+[Email]+'>')", isPersisted: false },
          { name: 'CreatedAt', dataType: 'datetime2', maxLength: null, precision: 27, scale: 7, isNullable: false, isPrimaryKey: false, isIdentity: false, defaultDefinition: '(sysutcdatetime())' },
        ],
        constraints: [
          {
            name: 'PK_Users',
            kind: 'PRIMARY_KEY',
            keyColumns: [{ name: 'UserID', descending: false }],
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
          },
          {
            name: 'UQ_Users_Username',
            kind: 'UNIQUE',
            keyColumns: [{ name: 'Username', descending: false }],
            definition: null,
            defaultColumn: null,
            isClustered: false,
            isDisabled: false,
            isNotTrusted: false,
            refSchema: null,
            refTable: null,
            refColumns: [],
            onDelete: null,
            onUpdate: null,
          },
          {
            name: 'CK_Users_Email',
            kind: 'CHECK',
            keyColumns: [],
            definition: "([Email] IS NULL OR [Email] LIKE '%@%')",
            defaultColumn: null,
            isClustered: null,
            isDisabled: false,
            isNotTrusted: false,
            refSchema: null,
            refTable: null,
            refColumns: [],
            onDelete: null,
            onUpdate: null,
          },
          {
            name: 'DF_Users_IsActive',
            kind: 'DEFAULT',
            keyColumns: [],
            definition: '((1))',
            defaultColumn: 'IsActive',
            isClustered: null,
            isDisabled: false,
            isNotTrusted: false,
            refSchema: null,
            refTable: null,
            refColumns: [],
            onDelete: null,
            onUpdate: null,
          },
          {
            name: 'FK_Users_Departments',
            kind: 'FOREIGN_KEY',
            keyColumns: [{ name: 'Department', descending: false }],
            definition: null,
            defaultColumn: null,
            isClustered: null,
            isDisabled: false,
            isNotTrusted: false,
            refSchema: 'dbo',
            refTable: 'Departments',
            refColumns: ['Name'],
            onDelete: 'SET_NULL',
            onUpdate: 'NO_ACTION',
          },
        ],
        indexes: [
          {
            name: 'IX_Users_Department',
            typeDesc: 'NONCLUSTERED',
            isUnique: false,
            isPrimaryKey: false,
            isUniqueConstraint: false,
            isDisabled: false,
            columns: [
              { name: 'Department', descending: false, isIncluded: false },
              { name: 'Email', descending: false, isIncluded: true },
            ],
            filterDefinition: '([IsActive]=(1))',
          },
          {
            name: 'PK_Users',
            typeDesc: 'CLUSTERED',
            isUnique: true,
            isPrimaryKey: true,
            isUniqueConstraint: false,
            isDisabled: false,
            columns: [{ name: 'UserID', descending: false, isIncluded: false }],
            filterDefinition: null,
          },
        ],
        triggers: [
          {
            name: 'trg_Users_Audit',
            isInsteadOf: false,
            isDisabled: false,
            events: ['INSERT', 'UPDATE'],
            definition:
              'CREATE TRIGGER [dbo].[trg_Users_Audit] ON [dbo].[Users] AFTER INSERT, UPDATE AS\nBEGIN\n    SET NOCOUNT ON;\n    -- 範例：寫入稽核資料表\nEND',
          },
          {
            name: 'trg_Users_NoDelete',
            isInsteadOf: true,
            isDisabled: true,
            events: ['DELETE'],
            definition: null,
          },
        ],
      } as unknown as T);

    case 'get_database_schema':
      return Promise.resolve([
        {
          schema: 'dbo',
          name: 'Users',
          kind: 'BASE TABLE',
          columns: [
            { name: 'UserID', dataType: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false, isPrimaryKey: true, isIdentity: true },
            { name: 'Username', dataType: 'nvarchar', maxLength: 50, precision: null, scale: null, isNullable: false, isPrimaryKey: false, isIdentity: false },
            { name: 'Email', dataType: 'nvarchar', maxLength: 100, precision: null, scale: null, isNullable: true, isPrimaryKey: false, isIdentity: false },
            { name: 'Department', dataType: 'nvarchar', maxLength: 50, precision: null, scale: null, isNullable: true, isPrimaryKey: false, isIdentity: false },
            { name: 'IsActive', dataType: 'bit', maxLength: null, precision: 1, scale: 0, isNullable: false, isPrimaryKey: false, isIdentity: false },
            { name: 'CreatedAt', dataType: 'datetime2', maxLength: null, precision: 27, scale: 7, isNullable: false, isPrimaryKey: false, isIdentity: false },
          ],
        },
        {
          schema: 'dbo',
          name: 'Orders',
          kind: 'BASE TABLE',
          columns: [
            { name: 'OrderID', dataType: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false, isPrimaryKey: true, isIdentity: true },
            { name: 'UserID', dataType: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false, isPrimaryKey: false, isIdentity: false },
            { name: 'OrderDate', dataType: 'datetime2', maxLength: null, precision: 27, scale: 7, isNullable: false, isPrimaryKey: false, isIdentity: false },
            { name: 'TotalAmount', dataType: 'decimal', maxLength: null, precision: 18, scale: 2, isNullable: false, isPrimaryKey: false, isIdentity: false },
            { name: 'Status', dataType: 'nvarchar', maxLength: 20, precision: null, scale: null, isNullable: false, isPrimaryKey: false, isIdentity: false },
          ],
        },
        {
          schema: 'dbo',
          name: 'OrderItems',
          kind: 'BASE TABLE',
          columns: [
            { name: 'OrderItemID', dataType: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false, isPrimaryKey: true, isIdentity: true },
            { name: 'OrderID', dataType: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false, isPrimaryKey: false, isIdentity: false },
            { name: 'ProductID', dataType: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false, isPrimaryKey: false, isIdentity: false },
            { name: 'Quantity', dataType: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false, isPrimaryKey: false, isIdentity: false },
            { name: 'UnitPrice', dataType: 'decimal', maxLength: null, precision: 18, scale: 2, isNullable: false, isPrimaryKey: false, isIdentity: false },
          ],
        },
        {
          schema: 'dbo',
          name: 'Products',
          kind: 'BASE TABLE',
          columns: [
            { name: 'ProductID', dataType: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false, isPrimaryKey: true, isIdentity: true },
            { name: 'ProductName', dataType: 'nvarchar', maxLength: 100, precision: null, scale: null, isNullable: false, isPrimaryKey: false, isIdentity: false },
            { name: 'Price', dataType: 'decimal', maxLength: null, precision: 18, scale: 2, isNullable: false, isPrimaryKey: false, isIdentity: false },
            { name: 'Stock', dataType: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false, isPrimaryKey: false, isIdentity: false },
          ],
        },
        {
          schema: 'dbo',
          name: 'v_ActiveUsers',
          kind: 'VIEW',
          columns: [
            { name: 'UserID', dataType: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false, isPrimaryKey: false, isIdentity: false },
            { name: 'Username', dataType: 'nvarchar', maxLength: 50, precision: null, scale: null, isNullable: false, isPrimaryKey: false, isIdentity: false },
            { name: 'Email', dataType: 'nvarchar', maxLength: 100, precision: null, scale: null, isNullable: true, isPrimaryKey: false, isIdentity: false },
          ],
        },
      ] as unknown as T);

    case 'load_custom_templates': {
      try {
        const raw = localStorage.getItem('sqlight_custom_sql_templates');
        const list = raw ? JSON.parse(raw) : [
          {
            id: 'custom-sample-1',
            title: '範例：自訂業務查詢 (Custom Business Query)',
            category: 'custom',
            categoryLabel: '自訂範本',
            tags: ['範例', '自訂', 'Sample'],
            description: '這是與應用程式同層放置的自訂語法檔案 (sql_custom_templates.json)。您可隨時以任一文字編輯器 (VS Code、Notepad) 編輯此檔案，儲存後在 PuffSQL 點擊「重新載入」即可即時生效！',
            code: '-- 自訂 SQL 語法範本\n-- 支援在 sql_custom_templates.json 中自由擴充團隊專用語法\nSELECT \n    TOP 50 *\nFROM dbo.YourTable\nORDER BY Id DESC;',
            isCustom: true,
            createdAt: Date.now(),
          }
        ];
        return Promise.resolve({
          filePath: './sql_custom_templates.json',
          templates: list,
        } as unknown as T);
      } catch {
        return Promise.resolve({
          filePath: './sql_custom_templates.json',
          templates: [],
        } as unknown as T);
      }
    }

    case 'save_custom_templates': {
      try {
        const templates = (args?.templates ?? []) as unknown[];
        localStorage.setItem('sqlight_custom_sql_templates', JSON.stringify(templates));
      } catch (err) {
        console.warn('Mock save_custom_templates failed:', err);
      }
      return Promise.resolve('./sql_custom_templates.json' as unknown as T);
    }

    case 'open_custom_templates_file':
      return Promise.resolve('./sql_custom_templates.json' as unknown as T);

    case 'open_query_log_file':
      console.info('[Dev/Browser] Opening mock query log file: ./puffsql.log');
      return Promise.resolve('./puffsql.log' as unknown as T);

    case 'get_query_log_path':
      return Promise.resolve('./puffsql.log' as unknown as T);

    case 'log_ai_request':
      console.info('[Dev/Browser] log_ai_request:', args);
      return Promise.resolve(undefined as unknown as T);

    case 'log_ai_response':
      console.info('[Dev/Browser] log_ai_response:', args);
      return Promise.resolve(undefined as unknown as T);

    case 'open_ai_log_file':
      console.info('[Dev/Browser] Opening mock AI log file: ./ai.log');
      return Promise.resolve('./ai.log' as unknown as T);

    case 'get_ai_log_path':
      return Promise.resolve('./ai.log' as unknown as T);

    case 'clear_ai_log':
      console.info('[Dev/Browser] clear_ai_log');
      return Promise.resolve('./ai.log' as unknown as T);


    case 'pick_sql_folder': {
      // In browser mock, provide default or prompt
      const defaultPath = 'C:/MyScripts/SQL';
      return Promise.resolve(defaultPath as unknown as T);
    }

    case 'scan_sql_folder': {
      const folderPath = (args?.folderPath as string) || 'C:/MyScripts/SQL';
      const rootName = folderPath.split(/[/\\]/).filter(Boolean).pop() || 'SQL';
      const mockTree = {
        name: rootName,
        path: folderPath,
        is_dir: true,
        children: [
          {
            name: '01_Init_Tables.sql',
            path: `${folderPath}/01_Init_Tables.sql`,
            is_dir: false,
            size: 2048,
            modified_time: new Date().toISOString(),
          },
          {
            name: '02_Seed_Data.sql',
            path: `${folderPath}/02_Seed_Data.sql`,
            is_dir: false,
            size: 1024,
            modified_time: new Date().toISOString(),
          },
          {
            name: 'Migrations',
            path: `${folderPath}/Migrations`,
            is_dir: true,
            children: [
              {
                name: '20260101_add_user_roles.sql',
                path: `${folderPath}/Migrations/20260101_add_user_roles.sql`,
                is_dir: false,
                size: 856,
                modified_time: new Date().toISOString(),
              },
              {
                name: '20260215_optimize_indexes.sql',
                path: `${folderPath}/Migrations/20260215_optimize_indexes.sql`,
                is_dir: false,
                size: 1420,
                modified_time: new Date().toISOString(),
              },
            ],
          },
          {
            name: 'Procedures',
            path: `${folderPath}/Procedures`,
            is_dir: true,
            children: [
              {
                name: 'usp_GetActiveUsers.sql',
                path: `${folderPath}/Procedures/usp_GetActiveUsers.sql`,
                is_dir: false,
                size: 1680,
                modified_time: new Date().toISOString(),
              },
            ],
          },
        ],
      };
      return Promise.resolve(mockTree as unknown as T);
    }

    case 'read_sql_file': {
      const filePath = (args?.filePath as string) || '';
      try {
        const saved = localStorage.getItem(`sqlight_mock_file_${filePath}`);
        if (saved !== null) {
          return Promise.resolve(saved as unknown as T);
        }
      } catch {}
      const fileName = filePath.split(/[/\\]/).filter(Boolean).pop() || 'script.sql';
      const sampleSql = `-- ============================================================
-- SQL File: ${fileName}
-- Path: ${filePath}
-- ============================================================

SELECT 
    t.name AS [TableName],
    s.name AS [SchemaName],
    p.rows AS [RowCount]
FROM sys.tables t
INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
INNER JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE t.is_ms_shipped = 0
ORDER BY p.rows DESC;
`;
      return Promise.resolve(sampleSql as unknown as T);
    }

    case 'write_sql_file': {
      const filePath = (args?.filePath as string) || '';
      const content = (args?.content as string) || '';
      try {
        localStorage.setItem(`sqlight_mock_file_${filePath}`, content);
      } catch {}
      return Promise.resolve(undefined as unknown as T);
    }

    case 'rename_sql_path': {
      const oldPath = (args?.oldPath as string) || '';
      const newPath = (args?.newPath as string) || '';
      try {
        const content = localStorage.getItem(`sqlight_mock_file_${oldPath}`);
        if (content !== null) {
          localStorage.setItem(`sqlight_mock_file_${newPath}`, content);
          localStorage.removeItem(`sqlight_mock_file_${oldPath}`);
        }
      } catch {}
      return Promise.resolve(undefined as unknown as T);
    }

    default:
      return Promise.reject(new Error(`Unknown command '${cmd}'`));
  }
}
