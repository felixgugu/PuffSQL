import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readSource, repoRoot } from './helpers/source';

function collectFiles(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(repoRoot, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...collectFiles(relative, extensions));
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      out.push(relative);
    }
  }
  return out;
}

test('the dependency list replaces AG Grid with Tabulator', () => {
  const pkg = JSON.parse(readSource('package.json')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  assert.ok(all['tabulator-tables'], 'tabulator-tables must be a dependency');
  assert.match(all['tabulator-tables']!, /^\^?6\./);
  assert.equal(all['ag-grid-community'], undefined, 'ag-grid-community must be removed');
  assert.equal(all['ag-grid-vue3'], undefined, 'ag-grid-vue3 must be removed');
});

test('no source file imports or styles AG Grid any more', () => {
  const files = [
    ...collectFiles('src', ['.ts', '.vue', '.css']),
    ...collectFiles('tests', ['.ts']),
    // This file necessarily contains the legacy names it searches for.
  ].filter((file) => !file.endsWith('tests/tabulator_migration.test.ts'));

  for (const file of files) {
    const source = readSource(file);
    assert.doesNotMatch(source, /from 'ag-grid-/, `${file} must not import ag-grid modules`);
    assert.doesNotMatch(source, /ag-grid-vue3/, `${file} must not reference ag-grid-vue3`);
    assert.doesNotMatch(source, /AgGridVue/, `${file} must not reference AgGridVue`);
    assert.doesNotMatch(source, /--ag-font-family/, `${file} must not reference the AG Grid font variable`);
    assert.doesNotMatch(source, /\.ag-(grid|theme|cell|header|tooltip)/, `${file} must not style AG Grid DOM`);
  }
});

test('the grid theme and lifecycle modules are the ones actually wired up', () => {
  const main = readSource('src/main.ts');
  assert.match(main, /import 'tabulator-tables\/dist\/css\/tabulator\.css';/);
  assert.match(main, /import '\.\/styles\/tabulatorTheme\.css';/);

  const vite = readSource('vite.config.ts');
  assert.match(vite, /node_modules\/tabulator-tables/, 'the grid vendor chunk must follow the new library');
  assert.doesNotMatch(vite, /ag-grid/);
});

test('project documentation describes the new grid stack', () => {
  for (const path of ['AGENTS.md', 'README.md']) {
    const source = readSource(path);
    assert.match(source, /Tabulator/, `${path} must mention Tabulator`);
    assert.doesNotMatch(source, /AG Grid/, `${path} must not still describe AG Grid`);
  }
});
