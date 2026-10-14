import { build } from 'esbuild';
import { readdir, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await mkdir('.test-build', { recursive: true });
const entries = (await readdir('tests')).filter((name) => name.endsWith('.test.ts'));
await build({
  entryPoints: entries.map((name) => `tests/${name}`),
  outdir: '.test-build', outExtension: { '.js': '.mjs' },
  bundle: true, platform: 'node', format: 'esm', packages: 'external',
  // Let tests import src modules that use the '@/' alias; the Monaco runtime is
  // unimportable in Node, so it is swapped for a lightweight test stub.
  alias: {
    '@': path.join(rootDir, 'src'),
    '@/utils/monaco': path.join(rootDir, 'tests/stubs/monaco.ts'),
  },
  sourcemap: 'inline',
});
const result = spawnSync(process.execPath,
  ['--test', ...entries.map((name) => `.test-build/${name.replace(/\.ts$/, '.mjs')}`)],
  { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
