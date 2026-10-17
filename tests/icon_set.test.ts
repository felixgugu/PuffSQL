import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { normaliseIcon, renderComponent, renderIndex } from '../scripts/build-icons.mjs';
import { readSource, repoRoot, trackedSources } from './helpers/source';

describe('icon_set', () => {
const iconDir = 'src/components/icons';
const sourceDir = 'docs/PuffSQL-Icons/svg';

function iconComponents(): string[] {
  return readdirSync(resolve(repoRoot, iconDir))
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
    const sources = readdirSync(resolve(repoRoot, sourceDir))
      .filter((name) => name.toLowerCase().endsWith('.svg'))
      .map((name) => name.replace(/\.svg$/i, ''))
      .sort();
    const generated = iconComponents()
      .map((name) => name.replace(/\.vue$/, ''))
      .sort();

    assert.deepEqual(generated, sources, 'each SVG has exactly one component');
    assert.ok(existsSync(resolve(repoRoot, `${iconDir}/index.ts`)), 'the index is committed alongside them');
  });

  test('the checked-in components are in sync with the sources', () => {
    execSync('node scripts/build-icons.mjs --check', { cwd: repoRoot, stdio: 'pipe' });
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
});

describe('icon_codegen', () => {
const source = (attrs: string, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;

/**
 * The generator is the only place that touches the icon markup, so it is unit tested with small
 * synthetic sources: geometry survives, paint always ends up as `currentColor`, and the icons keep
 * the app's 24 x 24 grid regardless of how the designer drew them.
 */
describe('icon codegen', () => {
  test('a 24x24 source keeps its paints and loses the fixed size', () => {
    const { attrs, inner } = normaliseIcon(
      'Database',
      source('width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"', '<path d="M4 6h16"/>')
    );

    assert.deepEqual(attrs, {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
    });
    assert.equal(inner, '<path d="M4 6h16"/>');
  });

  test('a larger grid is scaled into the 24x24 box instead of re-pathing', () => {
    const { attrs, inner } = normaliseIcon(
      'Wide',
      source('viewBox="0 0 48 48" fill="none" stroke="currentColor"', '<circle cx="24" cy="24" r="20"/>')
    );

    assert.equal(attrs.viewBox, '0 0 24 24');
    assert.match(inner, /^<g transform="translate\(0 0\) scale\(0\.5\)">/);
    assert.match(inner, /<circle cx="24" cy="24" r="20"\/><\/g>$/);
  });

  test('a non-zero origin is translated before scaling', () => {
    const { inner } = normaliseIcon(
      'Offset',
      source('viewBox="8 8 16 16" fill="none" stroke="currentColor"', '<rect x="10" y="10" width="4" height="4"/>')
    );

    assert.match(inner, /translate\(-12 -12\) scale\(1\.5\)/);
  });

  test('every paint becomes currentColor while geometry and keywords survive', () => {
    const { attrs, inner } = normaliseIcon(
      'Painted',
      source(
        'viewBox="0 0 24 24" fill="#ffffff" stroke="rgb(0,0,0)" stroke-width="1.5"',
        '<path d="M4 4h16" fill="#123456" stroke="steelblue" stroke-width="3" opacity="0.5"/>'
      )
    );

    assert.equal(attrs.fill, 'currentColor');
    assert.equal(attrs.stroke, 'currentColor');
    assert.equal(attrs['stroke-width'], '1.5');
    assert.match(inner, /fill="currentColor"/);
    assert.match(inner, /stroke="currentColor"/);
    assert.match(inner, /stroke-width="3"/, 'numbers are not colours');
    assert.match(inner, /opacity="0\.5"/);
    assert.doesNotMatch(inner, /#123456|steelblue/);
  });

  test('inline style declarations are normalised too', () => {
    const { inner } = normaliseIcon(
      'Styled',
      source('viewBox="0 0 24 24"', '<path d="M4 4h16" style="fill:#fff;stroke:#000;stroke-width:2"/>')
    );

    assert.match(inner, /style="fill: currentColor;stroke: currentColor;stroke-width:2"/);
  });

  test('ids and url(#…) references are namespaced per icon', () => {
    const { inner } = normaliseIcon(
      'Clipped',
      source('viewBox="0 0 24 24"', '<clipPath id="cut"><rect x="0" y="0" width="24" height="24"/></clipPath><path d="M0 0h24" clip-path="url(#cut)"/>')
    );

    assert.match(inner, /id="puffsql-clipped-cut"/);
    assert.match(inner, /url\(#puffsql-clipped-cut\)/);
  });

  test('a source without a viewBox falls back to the app grid', () => {
    const { attrs, inner } = normaliseIcon('Bare', source('fill="none" stroke="currentColor"', '<path d="M0 0h24"/>'));

    assert.equal(attrs.viewBox, '0 0 24 24');
    assert.doesNotMatch(inner, /<g transform/, 'no scaling when the grid is already 24');
  });

  test('the component is a hand-off-free template and the index is sorted', () => {
    const component = renderComponent('Database', normaliseIcon('Database', source('viewBox="0 0 24 24" fill="none" stroke="currentColor"', '<path d="M4 6h16"/>')));

    assert.match(component, /do not edit by hand/);
    assert.match(component, /^<template>\n  <svg\n/m);
    assert.match(component, /viewBox="0 0 24 24"/);
    assert.doesNotMatch(component, /<script/, 'icons carry no behaviour');
    assert.equal(
      renderIndex(['Alpha', 'Beta']),
      [
        '// Generated by scripts/build-icons.mjs from docs/PuffSQL-Icons/svg — do not edit by hand.',
        "export { default as Alpha } from './Alpha.vue';",
        "export { default as Beta } from './Beta.vue';",
        '',
      ].join('\n')
    );
  });
});
});
