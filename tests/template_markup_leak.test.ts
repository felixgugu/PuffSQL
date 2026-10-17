import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, trackedSources } from './helpers/source';

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
 * `class="…"` in a toolbar. It happens when a tag is rewritten and the tail of the old one is left
 * behind: the leftovers are valid *content*, so no compiler or build step reports them.
 *
 * A `/>` or an attribute belongs to the previous line only when that line already closed something
 * (`…>`), because a wrapped tag puts attributes after `<Component`, never after `>`.
 */
function leakedMarkup(): string[] {
  const offenders: string[] = [];

  for (const file of trackedSources().filter((path) => path.endsWith('.vue'))) {
    const { text, firstLine } = templateBlock(readSource(file));
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
