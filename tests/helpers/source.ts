/**
 * Shared source-scanning helpers for the contract tests, so a change to how the suite reads the
 * tree happens in one place. `scripts/test.mjs` only treats `tests/*.test.ts` as entry points, so
 * this module is bundled into whichever tests import it and never runs on its own.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

/** Repository root: the suite always runs from there (`npm test`). */
export const repoRoot = process.cwd();

export function readSource(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf-8');
}

export interface ReadCodeOptions {
  /** Also drop `//` line comments. Off by default: a selector or note may live in one. */
  lineComments?: boolean;
}

/** Source with comments removed, so prose in a comment is never mistaken for markup. */
export function readCode(relativePath: string, options: ReadCodeOptions = {}): string {
  const source = readSource(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  return options.lineComments ? source.replace(/(^|\s)\/\/.*$/gm, '') : source;
}

/**
 * Every tracked source file the cross-file guards scan. `git ls-files` still lists a file deleted
 * in the working tree until it is staged, so the result is narrowed to files that exist.
 */
export function trackedSources(): string[] {
  return execSync('git ls-files "src/*"', { encoding: 'utf-8' })
    .split('\n')
    .filter((line) => /\.(vue|ts|js|mjs|css)$/.test(line))
    .filter((line) => existsSync(resolve(repoRoot, line)));
}

export function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}
