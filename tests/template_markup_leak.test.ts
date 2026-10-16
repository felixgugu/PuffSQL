import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function vueSources(): string[] {
  return execSync('git ls-files "src/*"', { encoding: 'utf-8' })
    .split('\n')
    .filter((line) => line.trim().endsWith('.vue'));
}

/** The SFC `<template>` block, with its 1-based starting line, so messages point at the file. */
function templateBlock(source: string): { text: string; firstLine: number } {
  const match = /<template>([\s\S]*?)\n<\/template>/.exec(source);
  if (!match) return { text: '', firstLine: 1 };
  return {
    text: match[1].replace(/<!--[\s\S]*?-->/g, ''),
    firstLine: source.slice(0, match.index + '<template>'.length).split('\n').length,
  };
}

const attributeLike = /^(v-[\w.:-]+|@[\w.:-]+|:[\w.-]+|[\w-]+=)/;

/**
 * Markup that leaked out of a tag renders as literal text — `/ >` next to a search box, a stray
 * `class="…"` in a toolbar. It happens when an element is rewritten (a self-closing `<Button />`
 * becoming `<SqButton>…</SqButton>`) and the tail of the old tag is left behind: the leftovers are
 * valid *content*, so neither the template compiler, `vue-tsc` nor the build failure path sees
 * them, and the only symptom is a screenshot like the one that started this guard.
 *
 * The rule needs one bit of context to stay quiet: a `/>` or an attribute belongs to the previous
 * line only when that line already closed something (`…>`), because a legitimately wrapped tag
 * puts attributes after `<Component`, never after `>`.
 */
function leakedMarkup(): string[] {
  const offenders: string[] = [];

  for (const file of vueSources()) {
    const { text, firstLine } = templateBlock(readFileSync(resolve(root, file), 'utf-8'));
    const lines = text.split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return;

      let previous = index - 1;
      while (previous >= 0 && lines[previous].trim().length === 0) previous--;
      if (previous < 0 || !lines[previous].trim().endsWith('>')) return;

      const stray = trimmed === '/>' || (attributeLike.test(trimmed) && !trimmed.startsWith('<'));
      if (stray) offenders.push(`${file}:${firstLine + index}  ${trimmed}`);
    });
  }

  return offenders;
}

describe('SFC templates', () => {
  test('no attribute or self-closing fragment leaked into rendered text', () => {
    assert.deepEqual(leakedMarkup(), [], 'leftover tag fragments render as literal text');
  });
});
