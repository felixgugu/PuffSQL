import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const iconDir = 'src/components/icons';
const sourceDir = 'docs/PuffSQL-Icons/svg';

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

function trackedSources(): string[] {
  return execSync('git ls-files "src/*"', { encoding: 'utf-8' })
    .split('\n')
    .filter((line) => line.trim().length > 0);
}

function iconComponents(): string[] {
  return readdirSync(resolve(root, iconDir))
    .filter((name) => name.endsWith('.vue'))
    .sort();
}

/**
 * The app ships one generated Vue component per icon, sourced from docs/PuffSQL-Icons. These
 * guardrails keep the checked-in components in step with the sources and stop a second icon family
 * (or a hand edit that would be overwritten) from creeping back in.
 */
describe('the app icon set', () => {
  test('src no longer imports an icon package', () => {
    const offenders = trackedSources().filter((file) => /from '(lucide[^']*|@?iconify[^']*)'/.test(readSource(file)));
    assert.deepEqual(offenders, [], 'icons come from @/components/icons only');

    const pkg = JSON.parse(readSource('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].filter(
      (name) => name.includes('lucide') || name.includes('iconify')
    );
    assert.deepEqual(declared, [], 'no icon package may stay in the manifest');
  });

  test('every icon used in src is exported by the generated index', () => {
    const index = readSource(`${iconDir}/index.ts`);
    const exported = [...index.matchAll(/export \{ default as (\w+) \}/g)].map((match) => match[1]);
    const generated = iconComponents().map((name) => name.replace(/\.vue$/, ''));

    assert.ok(exported.length > 0, 'the index exports icons');
    assert.deepEqual([...exported].sort(), [...generated].sort(), 'index and folder agree');
    assert.deepEqual(exported, [...exported].sort(), 'the index is generated in a stable order');

    const imported = new Set<string>();
    for (const file of trackedSources().filter((name) => /\.(vue|ts)$/.test(name))) {
      if (file.startsWith(`${iconDir}/`)) continue;
      for (const match of readSource(file).matchAll(/import \{([^}]*)\} from '@\/components\/icons'/g)) {
        for (const name of match[1].split(',')) {
          const icon = name.trim();
          if (icon) imported.add(icon);
        }
      }
    }
    assert.ok(imported.size > 100, `the app uses the set (${imported.size} icons imported)`);
    const missing = [...imported].filter((name) => !exported.includes(name));
    assert.deepEqual(missing, [], 'every imported icon exists in the set');
  });

  test('the generated components match the sources one for one', () => {
    const sources = readdirSync(resolve(root, sourceDir))
      .filter((name) => name.toLowerCase().endsWith('.svg'))
      .map((name) => name.replace(/\.svg$/i, ''))
      .sort();
    const generated = iconComponents()
      .map((name) => name.replace(/\.vue$/, ''))
      .sort();

    assert.deepEqual(generated, sources, 'each SVG has exactly one component');
    assert.ok(existsSync(resolve(root, `${iconDir}/index.ts`)), 'the index is committed alongside them');
  });

  test('the checked-in components are in sync with the sources', () => {
    execSync('node scripts/build-icons.mjs --check', { cwd: root, stdio: 'pipe' });
  });

  test('every component stays on the app grid, uncoloured and unsized', () => {
    for (const file of iconComponents()) {
      const source = readSource(`${iconDir}/${file}`);
      // Only the root <svg> may not carry a size; inner geometry legitimately uses width/height.
      const rootTag = source.slice(source.indexOf('<svg'), source.indexOf('>', source.indexOf('<svg')));

      assert.match(source, /do not edit by hand/, `${file} is generated`);
      assert.match(source, /viewBox="0 0 24 24"/, `${file} uses the 24x24 grid`);
      assert.doesNotMatch(rootTag, /\swidth="|\sheight="/, `${file} is sized by the call site`);
      assert.doesNotMatch(source, /#[0-9a-fA-F]{3,6}\b/, `${file} has no hardcoded colour`);
      assert.doesNotMatch(source, /rgb\(|hsl\(/, `${file} has no hardcoded colour`);
      assert.match(source, /currentColor/, `${file} inherits its colour`);
      assert.match(source, /<template>\n  <svg\n/, `${file} is a single inline svg`);
    }
  });
});
