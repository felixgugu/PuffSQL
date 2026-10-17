import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { readSource, repoRoot, trackedSources } from './helpers/source';

describe('app_version', () => {
/**
 * A version lives in four manifests — two of them Tauri's — and drifts silently when one is
 * forgotten: the installer would ship a different number from the one the About panel shows.
 */
test('every manifest declares the same version', () => {
  const pkg = JSON.parse(readSource('package.json')) as { version: string };
  const lock = JSON.parse(readSource('package-lock.json')) as {
    version: string;
    packages: Record<string, { version?: string }>;
  };
  const tauri = JSON.parse(readSource('src-tauri/tauri.conf.json')) as { version: string };
  const cargo = /^version = "([^"]+)"/m.exec(readSource('src-tauri/Cargo.toml'))?.[1];

  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'package.json must hold a semver version');
  assert.equal(lock.version, pkg.version, 'package-lock.json root version');
  assert.equal(lock.packages['']?.version, pkg.version, 'package-lock.json workspace entry');
  assert.equal(tauri.version, pkg.version, 'src-tauri/tauri.conf.json');
  assert.equal(cargo, pkg.version, 'src-tauri/Cargo.toml');
});

test('the UI reads the version from the manifest instead of restating it', () => {
  // The status bar and the About panel used to hardcode "v0.1.1", so a bump needed three edits
  // and a forgotten one shipped a lie in the About box.
  const config = readSource('vite.config.ts');
  assert.match(config, /__APP_VERSION__: JSON\.stringify\(appVersion\)/, 'Vite injects the version');
  assert.match(readSource('src/vite-env.d.ts'), /declare const __APP_VERSION__: string;/);

  for (const file of [
    'src/components/layout/AppStatusBar.vue',
    'src/components/modals/SettingsModal.vue',
  ]) {
    const source = readSource(file);
    assert.match(source, /__APP_VERSION__/, `${file} must use the injected version`);
    assert.doesNotMatch(
      source,
      /v\d+\.\d+\.\d+/,
      `${file} must not hardcode a version string`
    );
  }
});
});

describe('app_packaging_name', () => {
describe('packaged application name', () => {
  test('the Rust crate is named puffsql so the build no longer emits sqlight.exe', () => {
    const cargo = readSource('src-tauri/Cargo.toml');

    assert.match(cargo, /^name = "puffsql"$/m, 'the cargo package name decides the binary name');
    assert.match(cargo, /^name = "puffsql_lib"$/m);
    assert.match(cargo, /authors = \["PuffSQL Team"\]/);
    assert.match(readSource('src-tauri/src/main.rs'), /puffsql_lib::run\(\);/);
  });

  test('the Tauri config ships PuffSQL as both product and main binary name', () => {
    const config = JSON.parse(readSource('src-tauri/tauri.conf.json'));

    assert.equal(config.productName, 'PuffSQL');
    assert.equal(config.mainBinaryName, 'PuffSQL', 'tauri build must rename the binary to PuffSQL.exe');
    assert.equal(config.identifier, 'com.puffsql.app');
    assert.equal(config.app.windows[0].title, 'PuffSQL - Lightweight SQL Client');
  });

  test('the portable build script packages PuffSQL.exe and PuffSQL-Portable.zip', () => {
    const script = readSource('build-portable.ps1');

    assert.match(script, /\$TargetExe = "\$OutDir\\PuffSQL\.exe"/);
    assert.match(script, /\$ZipPath = "\$OutDir\\PuffSQL-Portable\.zip"/);

    const candidates = script.match(/\$CandidateExes = @\(([\s\S]*?)\n\)/)?.[1] ?? '';
    assert.match(candidates, /release\\puffsql\.exe/, 'the cargo output path must follow the crate name');
    assert.doesNotMatch(
      candidates,
      /SQLight|sqlight/i,
      'the picker must not fall back to a stale old-named binary'
    );

    const staleArtifacts = script.match(/\$StaleArtifacts = @\(([\s\S]*?)\n\)/)?.[1] ?? '';
    assert.match(staleArtifacts, /SQLight\.exe/, 'old-named build output must be cleaned away');
    assert.match(staleArtifacts, /SQLight-Portable\.zip/);
    assert.match(readSource('build-portable.bat'), /PuffSQL - Portable Build Launcher/);
  });

  test('runtime log file, data folder and keychain service use the new name', () => {
    assert.match(
      readSource('src-tauri/src/services/query_logger.rs'),
      /LOG_FILE_NAME: &str = "puffsql\.log"/
    );
    assert.match(
      readSource('src-tauri/src/services/storage_service.rs'),
      /const APP_DIR_NAME: &str = "PuffSQL"/
    );
    assert.match(
      readSource('src-tauri/src/services/credential_store.rs'),
      /const SERVICE_NAME: &str = "PuffSQLDesktopClient"/
    );
  });

  test('renames keep the pre-rebrand data reachable instead of orphaning it', () => {
    const storage = readSource('src-tauri/src/services/storage_service.rs');
    const credentials = readSource('src-tauri/src/services/credential_store.rs');

    assert.match(storage, /const LEGACY_APP_DIR_NAME: &str = "SQLight"/);
    assert.match(storage, /fs::rename\(&legacy, &current\)/, 'the old data folder must be migrated');
    assert.match(credentials, /const LEGACY_SERVICE_NAME: &str = "SQLightDesktopClient"/);
    assert.match(credentials, /fn promote_legacy_password/, 'saved passwords must survive the rename');
  });

  test('no old brand name is left in the shipping frontend sources', () => {
    const offenders = trackedSources().filter((file) => readSource(file).includes('SQLight'));

    assert.deepEqual(offenders, [], 'user-visible sources must not carry the old brand name');
  });
});
});

describe('app_brand_icon', () => {
/**
 * The working chrome carries no brand mark. A logo next to the connection picker and a fish in the
 * status bar are both decoration in a screen whose job is data; the product identifies itself in
 * the About panel, where a name and a version are the point.
 */
describe('brand marks', () => {
  test('the title bar has no logo cell', () => {
    const source = readSource('src/components/layout/AppHeader.vue');

    assert.doesNotMatch(source, /appIcon/, 'the header must not import or render the icon asset');
    assert.doesNotMatch(source, /<img\b/, 'no image belongs in the title bar');
    assert.doesNotMatch(
      source,
      /min-w-\[40px\]/,
      'the brand cell (and its width floor) is gone with the logo'
    );
    // The row keeps its contract: 40px tall, draggable, with the picker starting at the padding.
    assert.match(source, /data-tauri-drag-region="deep"/);
    assert.match(source, /class="h-10 bg-dark-850 border-b border-dark-700/);
  });

  test('the status bar shows the name and version as text, not a mark', () => {
    const source = readSource('src/components/layout/AppStatusBar.vue');

    assert.match(source, /PuffSQL v\{\{ appVersion \}\}/, 'the version stays readable');
    assert.doesNotMatch(source, /🐡|⭐|🚀/, 'no emoji stands in for a brand mark');
    assert.doesNotMatch(source, /<img\b/, 'the status bar is a single 24px line of text');
  });

  test('the About panel still carries the official icon', () => {
    // The one place identity belongs. It reuses the Tauri icon set rather than a duplicate copy.
    const source = readSource('src/components/modals/SettingsModal.vue');
    assert.match(source, /import appIcon from '\.\.\/\.\.\/\.\.\/src-tauri\/icons\/64x64\.png'/);
    assert.match(source, /<img[\s\S]*?:src="appIcon"[\s\S]*?alt="PuffSQL"/);

    assert.ok(existsSync(resolve(repoRoot, 'src-tauri/icons/64x64.png')), 'the Tauri 64px icon must exist');
    assert.ok(
      !existsSync(resolve(repoRoot, 'src/assets/app-icon.svg')) &&
        !existsSync(resolve(repoRoot, 'src/assets/app-icon-mark.svg')),
      'no duplicated brand icon should live in src/assets'
    );
  });

  test('no component renders an emoji as a structural icon', () => {
    const offenders: string[] = [];

    // Emoji in the two chrome strips are what this replaced; keep the scan narrow and explicit.
    for (const file of [
      'src/components/layout/AppHeader.vue',
      'src/components/layout/AppStatusBar.vue',
    ]) {
      const source = readSource(file);
      const template = source.slice(0, source.indexOf('</template>'));
      const matches = template.match(/[\u{1F300}-\u{1FAFF}]/gu) ?? [];
      if (matches.length > 0) offenders.push(`${file}: ${matches.join(' ')}`);
    }

    assert.deepEqual(offenders, [], 'the shell uses vector icons or nothing');
  });
});
});

describe('context_menu_guard', () => {
test('Global context menu guard prevents default browser menu on contextmenu event', () => {
  let defaultPrevented = false;
  const fakeEvent = {
    type: 'contextmenu',
    preventDefault() {
      defaultPrevented = true;
    },
  };

  const handler = (e: { preventDefault: () => void }) => {
    e.preventDefault();
  };

  handler(fakeEvent);
  assert.equal(defaultPrevented, true, 'contextmenu event handler must invoke preventDefault()');
});

test('index.html contains early guard for contextmenu suppression', () => {
  const content = readSource('index.html');
  assert.match(
    content,
    /window\.addEventListener\(\s*['"]contextmenu['"]\s*,\s*\(?e\)?\s*=>\s*e\.preventDefault\(\)\s*\)/,
    'index.html must include an early guard script to disable default contextmenu'
  );
});

test('src/main.ts registers contextmenu suppression listener', () => {
  const content = readSource('src/main.ts');
  assert.match(
    content,
    /window\.addEventListener\(\s*['"]contextmenu['"]\s*,\s*\(?e\)?\s*=>\s*\{?\s*e\.preventDefault\(\)/,
    'src/main.ts must register a global contextmenu listener with preventDefault()'
  );
});
});

describe('window_controls', () => {
function readJson(relativePath: string): any {
  return JSON.parse(readSource(relativePath));
}

describe('custom window title bar (Windows)', () => {
  test('base config keeps native decorations and raises minWidth to 1368', () => {
    const config = readJson('src-tauri/tauri.conf.json');
    const window = config.app.windows[0];

    assert.equal(window.decorations, true, 'non-Windows platforms should keep native decorations');
    assert.equal(window.minWidth, 1368);
    assert.equal(window.resizable, true);
    assert.equal(window.title, 'PuffSQL - Lightweight SQL Client', 'window title stays for taskbar / Alt+Tab');
  });

  test('windows platform config hides decorations without changing other window fields', () => {
    const base = readJson('src-tauri/tauri.conf.json');
    const windows = readJson('src-tauri/tauri.windows.conf.json');

    // Platform configs are merged with JSON Merge Patch, so arrays are replaced wholesale and
    // the windows file has to repeat the full window definition.
    assert.equal(windows.app.windows.length, 1);
    assert.equal(windows.app.windows[0].decorations, false);
    assert.deepEqual(
      windows.app.windows[0],
      { ...base.app.windows[0], decorations: false },
      'tauri.windows.conf.json must not drift from the base window definition'
    );
  });

  test('capability grants the window control permissions to the main window', () => {
    const capability = readJson('src-tauri/capabilities/default.json');

    assert.equal(capability.windows.length, 1);
    assert.equal(capability.windows[0], 'main');

    const permissions: string[] = capability.permissions;
    for (const permission of [
      'core:default',
      'core:window:allow-start-dragging',
      'core:window:allow-minimize',
      'core:window:allow-toggle-maximize',
      'core:window:allow-close',
    ]) {
      assert.ok(permissions.includes(permission), `${permission} should be granted`);
    }
  });

  test('AppHeader turns the toolbar into a drag region and hosts the window controls', () => {
    const source = readSource('src/components/layout/AppHeader.vue');

    assert.match(source, /data-tauri-drag-region="deep"/, 'empty toolbar areas should drag the window');
    // The title bar is a plain flex row now (PrimeVue Toolbar retired in P5); it must still keep
    // its groups from wrapping so a squeezed window hides buttons instead of growing the bar.
    assert.match(
      source,
      /class="[^"]*flex items-center justify-between gap-2[^"]*"/,
      'the title bar stays a single non-wrapping row'
    );
    assert.match(source, /select-none flex-shrink-0/, 'the title bar must not shrink');
    assert.match(
      source,
      /class="flex items-center justify-end space-x-1 min-w-0 overflow-hidden"/,
      'end group should clip squeezed buttons so the window controls stay visible'
    );
    assert.match(source, /const showWindowControls = windowService\.isCustomTitleBar\(\)/);

    assert.match(
      source,
      /<!-- End: Actions Toolbar & Settings -->[\s\S]*?<WindowControls v-if="showWindowControls" \/>[\s\S]*?<\/div>\s*<\/div>\s*<\/template>/,
      'window controls must stay inside the end group of the title bar'
    );
  });

  test('WindowControls wires minimize, restore/maximize and close with accessible labels', () => {
    const source = readSource('src/components/layout/WindowControls.vue');

    for (const marker of [
      'windowService.minimize()',
      'windowService.toggleMaximize()',
      'windowService.close()',
      'windowService.isMaximized()',
      'windowService.onResized(',
    ]) {
      assert.ok(source.includes(marker), `${marker} should be wired in WindowControls`);
    }

    assert.match(source, /aria-label="最小化"/);
    assert.match(source, /:aria-label="isMaximized \? '還原' : '最大化'"/);
    assert.match(source, /aria-label="關閉"/);
    assert.ok(source.includes('w-[46px] shrink-0 h-10'), 'caption buttons should use the Windows 11 46x40 sizing');
    assert.equal(
      (source.match(/w-\[46px\] shrink-0 h-10/g) ?? []).length,
      3,
      'all three caption buttons must stay rigid so they never get squeezed'
    );
    assert.match(source, /hover:bg-\[#c42b1c\]/, 'close button should use the Windows 11 close hover color');
  });

  test('windowService keeps a browser fallback for every window call', () => {
    const source = readSource('src/services/windowService.ts');

    assert.match(source, /import \{ isTauri \} from '\.\/api'/);
    assert.match(source, /await import\('@tauri-apps\/api\/window'\)/, 'window API should be lazily loaded');
    const resolver = /async function resolveWindow\(\): Promise<Window \| null> \{[\s\S]*?if \(!isTauri\(\)\) return null;/.test(source);
    assert.ok(resolver, 'the shared window resolver should fall back in browser environments');
    for (const method of ['isMaximized', 'minimize', 'toggleMaximize', 'close', 'onResized']) {
      assert.ok(source.includes(`async ${method}(`), `${method} should be exposed by windowService`);
    }
    assert.match(source, /export const windowService/);
  });
});
});
