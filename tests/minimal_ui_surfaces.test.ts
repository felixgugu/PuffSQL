import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

function trackedSources(): string[] {
  return execSync('git ls-files "src/*"', { encoding: 'utf-8' })
    .split('\n')
    .filter((line) => line.trim().length > 0);
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
