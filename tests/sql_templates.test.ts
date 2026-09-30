import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { BUILTIN_SQL_TEMPLATES } from '../src/data/sqlTemplates';
import { useSqlTemplateStore } from '../src/stores/sqlTemplateStore';
import { templateService } from '../src/services/templateService';

// Setup Pinia for store tests
beforeEach(() => {
  setActivePinia(createPinia());
});

test('BUILTIN_SQL_TEMPLATES integrity: all items have required fields and unique IDs', () => {
  assert.ok(BUILTIN_SQL_TEMPLATES.length >= 10, 'Expected at least 10 built-in templates');

  const idSet = new Set<string>();
  const validCategories = new Set(['basic', 'cte', 'advanced', 'maintenance', 'inspection']);

  for (const t of BUILTIN_SQL_TEMPLATES) {
    assert.ok(t.id && t.id.trim().length > 0, `Template missing valid id: ${JSON.stringify(t)}`);
    assert.ok(!idSet.has(t.id), `Duplicate template id detected: ${t.id}`);
    idSet.add(t.id);

    assert.ok(t.title && t.title.trim().length > 0, `Template ${t.id} missing title`);
    assert.ok(validCategories.has(t.category), `Template ${t.id} has invalid category ${t.category}`);
    assert.ok(t.description && t.description.trim().length > 0, `Template ${t.id} missing description`);
    assert.ok(t.code && t.code.trim().length > 0, `Template ${t.id} missing code`);
    assert.ok(Array.isArray(t.tags) && t.tags.length > 0, `Template ${t.id} missing tags`);
  }
});

test('BUILTIN_SQL_TEMPLATES covers required categories: Basic, CTE, Advanced, Maintenance, and Inspection', () => {
  const categories = new Set(BUILTIN_SQL_TEMPLATES.map((t) => t.category));
  assert.ok(categories.has('basic'), 'Must include basic templates');
  assert.ok(categories.has('cte'), 'Must include CTE templates');
  assert.ok(categories.has('advanced'), 'Must include advanced templates');
  assert.ok(categories.has('maintenance'), 'Must include maintenance templates');
  assert.ok(categories.has('inspection'), 'Must include inspection templates');

  const inspectionTemplates = BUILTIN_SQL_TEMPLATES.filter((t) => t.category === 'inspection');
  assert.ok(inspectionTemplates.length >= 10, 'Must include table inspection templates');
  assert.ok(inspectionTemplates.some((t) => t.id === 'inspect-table-all-in-one'));
  assert.ok(inspectionTemplates.some((t) => t.id === 'inspect-columns-schema'));

  const cteTemplates = BUILTIN_SQL_TEMPLATES.filter((t) => t.category === 'cte');
  assert.ok(cteTemplates.some((t) => t.title.includes('遞迴')), 'Must include recursive CTE template');
  assert.ok(cteTemplates.some((t) => t.title.includes('重複')), 'Must include CTE deduplication template');
});

test('sqlTemplateStore: category filtering correctly narrows templates', () => {
  const store = useSqlTemplateStore();

  store.activeCategory = 'all';
  store.searchQuery = '';
  assert.equal(store.filteredTemplates.length, BUILTIN_SQL_TEMPLATES.length);

  store.activeCategory = 'cte';
  assert.ok(store.filteredTemplates.length > 0);
  assert.ok(store.filteredTemplates.every((t) => t.category === 'cte'));

  store.activeCategory = 'advanced';
  assert.ok(store.filteredTemplates.length > 0);
  assert.ok(store.filteredTemplates.every((t) => t.category === 'advanced'));

  store.activeCategory = 'basic';
  assert.ok(store.filteredTemplates.length > 0);
  assert.ok(store.filteredTemplates.every((t) => t.category === 'basic'));

  store.activeCategory = 'inspection';
  assert.ok(store.filteredTemplates.length > 0);
  assert.ok(store.filteredTemplates.every((t) => t.category === 'inspection'));
});

test('sqlTemplateStore: keyword search matches across title, tags, description, and code', () => {
  const store = useSqlTemplateStore();
  store.activeCategory = 'all';

  // 1. Search by title keyword '分頁'
  store.searchQuery = '分頁';
  assert.ok(store.filteredTemplates.length > 0);
  assert.ok(store.filteredTemplates.some((t) => t.id === 'basic-pagination'));

  // 2. Search by keyword 'pivot'
  store.searchQuery = 'pivot';
  assert.ok(store.filteredTemplates.length > 0);
  assert.ok(store.filteredTemplates.some((t) => t.id === 'adv-dynamic-pivot'));

  // 3. Search by keyword '遞迴'
  store.searchQuery = '遞迴';
  assert.ok(store.filteredTemplates.length >= 2);
  assert.ok(store.filteredTemplates.some((t) => t.id === 'cte-recursive-hierarchy'));

  // 4. Search by keyword 'merge'
  store.searchQuery = 'merge';
  assert.ok(store.filteredTemplates.length > 0);
  assert.ok(store.filteredTemplates.some((t) => t.id === 'basic-merge-upsert'));

  // 5. Search by tag 'json'
  store.searchQuery = 'json';
  assert.ok(store.filteredTemplates.length > 0);
  assert.ok(store.filteredTemplates.some((t) => t.id === 'adv-json-parsing-generating'));

  // 6. Search by keyword '變數'
  store.searchQuery = '變數';
  assert.ok(store.filteredTemplates.length >= 4);
  assert.ok(store.filteredTemplates.some((t) => t.id === 'basic-declare-variables'));
  assert.ok(store.filteredTemplates.some((t) => t.id === 'basic-table-variable'));

  // 7. Search by keyword 'temp table'
  store.searchQuery = 'temp table';
  assert.ok(store.filteredTemplates.length > 0);
  assert.ok(store.filteredTemplates.some((t) => t.id === 'basic-temp-table'));

  // 8. Search by keyword 'scope_identity'
  store.searchQuery = 'scope_identity';
  assert.ok(store.filteredTemplates.length > 0);
  assert.ok(store.filteredTemplates.some((t) => t.id === 'basic-system-variables'));
});

test('BUILTIN_SQL_TEMPLATES includes variable declaration and temporary table templates in Basic category', () => {
  const basicTemplates = BUILTIN_SQL_TEMPLATES.filter((t) => t.category === 'basic');
  assert.ok(basicTemplates.some((t) => t.id === 'basic-declare-variables'), 'Missing basic-declare-variables');
  assert.ok(basicTemplates.some((t) => t.id === 'basic-table-variable'), 'Missing basic-table-variable');
  assert.ok(basicTemplates.some((t) => t.id === 'basic-temp-table'), 'Missing basic-temp-table');
  assert.ok(basicTemplates.some((t) => t.id === 'basic-system-variables'), 'Missing basic-system-variables');
  assert.ok(basicTemplates.some((t) => t.id === 'basic-table-type-tvp'), 'Missing basic-table-type-tvp');
});


test('sqlTemplateStore: custom template file CRUD operations and persistence', async () => {
  const store = useSqlTemplateStore();

  let savedTemplates: any[] = [];
  templateService.loadCustomTemplates = async () => ({
    filePath: 'G:\\PuffSQL\\sql_custom_templates.json',
    templates: [
      {
        id: 'external-custom-1',
        title: '外部團隊專用查詢 (Team Shared Query)',
        category: 'custom',
        categoryLabel: '自訂範本',
        tags: ['team', 'orders'],
        description: '這是從同層實體檔案載入的測試範本',
        code: 'SELECT TOP 10 * FROM dbo.TeamOrders;',
        isCustom: true,
      },
    ],
  });

  templateService.saveCustomTemplates = async (templates) => {
    savedTemplates = templates;
    return 'G:\\PuffSQL\\sql_custom_templates.json';
  };

  // 1. Initial load
  await store.loadTemplates(true);
  assert.equal(store.customFilePath, 'G:\\PuffSQL\\sql_custom_templates.json');
  assert.equal(store.customTemplates.length, 1);
  assert.equal(store.allTemplates.length, BUILTIN_SQL_TEMPLATES.length + 1);

  // 2. Add custom template
  const newTpl = await store.addCustomTemplate({
    title: '新業務統計 (Monthly Stats)',
    category: 'custom',
    categoryLabel: '自訂範本',
    tags: ['monthly', 'stats'],
    description: '每月業務報表統計',
    code: 'SELECT COUNT(*) FROM dbo.Sales;',
  });

  assert.ok(newTpl.id.startsWith('custom-'));
  assert.equal(store.customTemplates.length, 2);
  assert.equal(savedTemplates.length, 2);
  assert.equal(savedTemplates[1].title, '新業務統計 (Monthly Stats)');

  // 3. Update custom template
  await store.updateCustomTemplate(newTpl.id, {
    title: '已修改之業務統計 (Updated Monthly Stats)',
  });
  const updated = store.customTemplates.find((t) => t.id === newTpl.id);
  assert.equal(updated?.title, '已修改之業務統計 (Updated Monthly Stats)');
  assert.equal(savedTemplates.find((t) => t.id === newTpl.id)?.title, '已修改之業務統計 (Updated Monthly Stats)');

  // 4. Delete custom template
  await store.deleteCustomTemplate('external-custom-1');
  assert.equal(store.customTemplates.length, 1);
  assert.equal(store.customTemplates[0].id, newTpl.id);
  assert.equal(savedTemplates.length, 1);
});
