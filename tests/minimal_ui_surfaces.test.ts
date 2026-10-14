import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

/** Prose in a comment is not a class name; only the markup and code count. */
function readCode(relativePath: string): string {
  return readSource(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|\s)\/\/.*$/gm, '');
}

function trackedSources(): string[] {
  return execSync('git ls-files "src/*"', { encoding: 'utf-8' })
    .split('\n')
    .filter((line) => /\.(vue|ts|js|mjs|css)$/.test(line));
}

/**
 * The ER canvas and the execution-plan canvas draw *content*: a note or a table box is an object
 * on a diagram, and its shadow is what separates it from the diagram behind it. Everything else
 * is app chrome and follows SPEC §6.
 */
const CANVAS_CONTENT = [
  'src/components/editor/ErTextNode.vue',
  'src/components/editor/ErTableNode.vue',
  'src/components/editor/ExecutionPlanViewer.vue',
];

describe('the minimal surface rules hold across src', () => {
  test('radius is only ever 3, 4 or 6px (plus deliberate squares)', () => {
    const offenders: string[] = [];
    for (const file of trackedSources()) {
      const source = readSource(file);
      const matches = source.match(/\brounded-(sm|lg|xl|2xl|3xl)\b/g) ?? [];
      if (matches.length > 0) offenders.push(`${file}: ${matches.join(', ')}`);
    }

    assert.deepEqual(offenders, [], 'SPEC §6 allows 3 / 4 / 6px radii only');
  });

  test('shadows are only the two tokens, and only on floating layers', () => {
    const offenders: string[] = [];
    for (const file of trackedSources()) {
      if (CANVAS_CONTENT.includes(file)) continue;
      const source = readSource(file);
      const matches = source.match(/\bshadow-(2xl|xl|lg|md|sm|xs|inner)\b/g) ?? [];
      if (matches.length > 0) offenders.push(`${file}: ${matches.join(', ')}`);
    }

    assert.deepEqual(offenders, [], 'SPEC §6 allows only shadow-raised and shadow-overlay');
  });

  test('no status text falls back to a raw Tailwind hue', () => {
    // `text-emerald-400` on a 10% tint is ~1.9:1 in light mode. Semantic text goes through the
    // role tokens, whose light values are chosen to clear 4.5:1 on those same tints.
    const offenders: string[] = [];
    for (const file of trackedSources()) {
      const source = readSource(file);
      const matches = source.match(
        /\btext-(emerald|rose|amber|sky|purple|indigo|green|red|blue|violet)-[0-9]{2,3}\b/g
      ) ?? [];
      if (matches.length > 0) offenders.push(`${file}: ${matches.join(', ')}`);
    }

    assert.deepEqual(offenders, [], 'status text uses --color-ok / --color-warn / --color-danger');
  });
});

/**
 * Tailwind's default spacing scale. A class like `py-0.2` or `w-4.5` looks plausible and renders
 * nothing at all, which is how the Quick Object Finder's keycaps and the settings swatch silently
 * lost their padding and size.
 */
const SPACING_STEPS = new Set([
  '0', 'px', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11',
  '12', '14', '16', '20', '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72',
  '80', '96',
]);

const SPACING_PREFIXES = [
  'gap', 'gap-x', 'gap-y', 'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr',
  'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr', 'space-x', 'space-y',
];

/** Width/height utilities accept the spacing steps *and* Tailwind's named sizes. */
const SIZE_PREFIXES = ['w', 'h', 'min-w', 'min-h', 'max-w', 'max-h', 'size'];

const ALLOWED_NON_STEP = new Set([
  'auto', 'full', 'screen', 'min', 'max', 'fit', 'none', 'px',
  'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl',
  'dvh', 'svh', 'lvh', 'prose',
]);

describe('every utility class actually exists', () => {
  test('spacing and sizing utilities use real Tailwind steps', () => {
    const pattern = new RegExp(
      `(?<![\\w-])(?:${[...SPACING_PREFIXES, ...SIZE_PREFIXES].join('|')})-([a-z0-9./\\[\\]]+)\\b`,
      'g'
    );
    const offenders: string[] = [];

    for (const file of trackedSources()) {
      const source = readCode(file);
      const seen = new Set<string>();
      for (const match of source.matchAll(pattern)) {
        const value = match[1]!;
        // Arbitrary values, fractions, breakpoint prefixes and CSS variables are all deliberate.
        if (value.includes('[') || value.includes('/') || value.includes('$')) continue;
        if (ALLOWED_NON_STEP.has(value) || SPACING_STEPS.has(value)) continue;
        if (seen.has(match[0])) continue;
        seen.add(match[0]);
        offenders.push(`${file}: ${match[0]}`);
      }
    }

    assert.deepEqual(offenders, [], 'these classes generate no CSS at all');
  });
});

describe('no glass, no gradient, no translucent chrome', () => {
  test('nothing blurs what is behind it', () => {
    const offenders: string[] = [];
    for (const file of trackedSources()) {
      if (file.endsWith('.css')) continue;
      const source = readSource(file);
      if (/\bbackdrop-blur/.test(source)) offenders.push(file);
    }

    assert.deepEqual(offenders, [], 'SPEC §7: no glass effect anywhere in the app');
  });

  test('no gradient utilities are used', () => {
    const offenders: string[] = [];
    for (const file of trackedSources()) {
      const source = readSource(file);
      const matches = source.match(/\bbg-gradient-to-[a-z]+\b|\bbg-linear-[0-9]+\b/g) ?? [];
      if (matches.length > 0) offenders.push(`${file}: ${matches.join(', ')}`);
    }

    assert.deepEqual(offenders, [], 'SPEC §12: no gradients');
  });

  test('surfaces are opaque, not 80–99% translucent', () => {
    // A 90% surface is not glass on its own, but its contrast then depends on whatever sits behind
    // it, which is the property the spec rules out: layers separate by a 1px border, not by alpha.
    const offenders: string[] = [];
    for (const file of trackedSources()) {
      const source = readSource(file);
      const matches = source.match(/\bbg-[a-z0-9-]+\/(?:8[0-9]|9[0-9])\b/g) ?? [];
      if (matches.length > 0) offenders.push(`${file}: ${[...new Set(matches)].join(', ')}`);
    }

    assert.deepEqual(offenders, [], 'surfaces use a token colour, not alpha');
  });
});
