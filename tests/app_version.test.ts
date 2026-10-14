import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

/**
 * A version lives in four manifests — two of them Tauri's — and drifts silently when one is
 * forgotten: the installer would ship a different number from the one the About panel shows.
 */
test('every manifest declares the same version', () => {
  const pkg = JSON.parse(read('package.json')) as { version: string };
  const lock = JSON.parse(read('package-lock.json')) as {
    version: string;
    packages: Record<string, { version?: string }>;
  };
  const tauri = JSON.parse(read('src-tauri/tauri.conf.json')) as { version: string };
  const cargo = /^version = "([^"]+)"/m.exec(read('src-tauri/Cargo.toml'))?.[1];

  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'package.json must hold a semver version');
  assert.equal(lock.version, pkg.version, 'package-lock.json root version');
  assert.equal(lock.packages['']?.version, pkg.version, 'package-lock.json workspace entry');
  assert.equal(tauri.version, pkg.version, 'src-tauri/tauri.conf.json');
  assert.equal(cargo, pkg.version, 'src-tauri/Cargo.toml');
});

test('the UI reads the version from the manifest instead of restating it', () => {
  // The status bar and the About panel used to hardcode "v0.1.1", so a bump needed three edits
  // and a forgotten one shipped a lie in the About box.
  const config = read('vite.config.ts');
  assert.match(config, /__APP_VERSION__: JSON\.stringify\(appVersion\)/, 'Vite injects the version');
  assert.match(read('src/vite-env.d.ts'), /declare const __APP_VERSION__: string;/);

  for (const file of [
    'src/components/layout/AppStatusBar.vue',
    'src/components/modals/SettingsModal.vue',
  ]) {
    const source = read(file);
    assert.match(source, /__APP_VERSION__/, `${file} must use the injected version`);
    assert.doesNotMatch(
      source,
      /v\d+\.\d+\.\d+/,
      `${file} must not hardcode a version string`
    );
  }
});
